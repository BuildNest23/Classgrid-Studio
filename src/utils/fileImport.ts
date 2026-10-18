import { AI_FILE_APP, AI_FILE_VERSION } from './aiExchange';
import type { Assessment } from '../types';

/**
 * "Import from file" for the Students tab.
 *  - Excel / CSV are read on the device (no internet, no AI).
 *  - PDF / photos are sent to the Classgrid AI proxy, which asks Gemini to read the list.
 * Both return the same rows, which are then turned into a students file and checked by planStudentsImport.
 */

export interface ImportedRow {
  name: string;
  fatherName: string;
  admissionNo: string;
  rollNo: string;
  phone: string;
}

const PROXY_URL: string = (import.meta.env.VITE_AI_PROXY_URL as string | undefined) || '';
const MAX_SHEET_BYTES = 5 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024; // proxy limit (Vercel bodies are ~4.5 MB after base64)
const CONSENT_KEY = 'classgridAiConsent';

export type FileKind = 'sheet' | 'ai' | 'json' | 'unsupported';

export function detectKind(file: File): FileKind {
  const n = file.name.toLowerCase();
  if (n.endsWith('.json') || file.type === 'application/json') return 'json';
  if (/\.(xlsx|xls|xlsm|ods|csv|tsv)$/.test(n)) return 'sheet';
  if (n.endsWith('.pdf') || file.type === 'application/pdf') return 'ai';
  if (/\.(jpe?g|png|webp)$/.test(n) || file.type.startsWith('image/')) return 'ai';
  return 'unsupported';
}

export const aiReadingAvailable = () => !!PROXY_URL;
export const hasAiConsent = () => {
  try { return localStorage.getItem(CONSENT_KEY) === '1'; } catch { return false; }
};
export const saveAiConsent = () => {
  try { localStorage.setItem(CONSENT_KEY, '1'); } catch { /* ignore */ }
};

// ---------- Excel / CSV (on device) ----------

const norm = (v: unknown) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

type Field = 'name' | 'fatherName' | 'admissionNo' | 'rollNo' | 'phone';

function fieldOf(header: unknown): Field | null {
  const h = norm(header);
  if (!h) return null;
  if (/^(father|guardian|parent|fname)/.test(h) || /^(so|sonof|wo|dso)$/.test(h)) return 'fatherName';
  if (/(admission|admno|admn|regno|registration|grno|scholar|enrol)/.test(h)) return 'admissionNo';
  if (/(phone|mobile|mob|contact|cell|whatsapp|tel)/.test(h)) return 'phone';
  if (/^(rollno|roll|rollnumber|srno|sno|serial|sr)$/.test(h)) return 'rollNo';
  if (/^(name|studentname|student|fullname|nameofstudent|pupil|pupilname|childname)$/.test(h)) return 'name';
  return null;
}

export async function readSheetRows(file: File): Promise<ImportedRow[]> {
  if (file.size > MAX_SHEET_BYTES) throw new Error('This file is too large (over 5 MB).');
  const XLSX = await import('xlsx');
  let rows: unknown[][];
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    // raw:false gives the text as shown in Excel, so phone numbers keep their leading zero
    rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '', blankrows: false });
  } catch {
    throw new Error('Could not open this file. Is it a real Excel or CSV file?');
  }

  // Find the heading row: the first row (within 15) that has a Name column
  let headerIdx = -1;
  let map: Partial<Record<Field, number>> = {};
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const m: Partial<Record<Field, number>> = {};
    (rows[i] || []).forEach((cell, c) => {
      const f = fieldOf(cell);
      if (f && m[f] === undefined) m[f] = c;
    });
    if (m.name !== undefined) {
      headerIdx = i;
      map = m;
      break;
    }
  }
  if (headerIdx < 0) {
    throw new Error('Could not find a "Name" column. Put headings like Name, Father Name, Admission No, Phone in the first row.');
  }

  const get = (r: unknown[], f: Field) => (map[f] === undefined ? '' : String(r[map[f]!] ?? '').trim());
  const out: ImportedRow[] = [];
  for (const r of rows.slice(headerIdx + 1)) {
    const name = get(r, 'name');
    if (!name) continue;
    out.push({
      name,
      fatherName: get(r, 'fatherName'),
      admissionNo: get(r, 'admissionNo'),
      rollNo: get(r, 'rollNo'),
      phone: get(r, 'phone'),
    });
  }
  if (!out.length) throw new Error('No students found under the Name column.');
  return out;
}

// ---------- PDF / photo (via proxy + Gemini) ----------

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(new Error('Could not read the file.'));
    r.readAsDataURL(blob);
  });
}

/** Phone photos can be huge. Shrink to max 1800px JPEG so the upload is fast and under the limit. */
async function shrinkImage(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.85));
    return blob || file;
  } catch {
    return file;
  }
}

/** One place that talks to the proxy: timeout, offline check and friendly errors. */
async function postProxy(payload: Record<string, unknown>): Promise<any> {
  if (!PROXY_URL) throw new Error('AI is not set up yet. Use an Excel or CSV file.');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('You are offline. Connect to the internet to use AI.');
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90_000);
  let res: Response;
  try {
    res = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
  } catch {
    throw new Error('Could not reach the AI service. Check your internet and try again.');
  } finally {
    clearTimeout(timer);
  }
  let body: any = null;
  try { body = await res.json(); } catch { /* ignore */ }
  if (!res.ok) throw new Error(body?.error || 'The AI could not finish. Please try again.');
  return body;
}

async function callProxy(file: File, mode: 'students' | 'remarks' | 'marks' | 'results', extra: Record<string, unknown> = {}): Promise<any[]> {
  const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(file.name);
  const blob: Blob = isImage ? await shrinkImage(file) : file;
  if (blob.size > MAX_UPLOAD_BYTES) {
    throw new Error('This file is too large (over 3 MB). Try fewer pages or a smaller photo.');
  }
  const mimeType = isImage ? (blob.type || 'image/jpeg') : 'application/pdf';
  const data = await toBase64(blob);
  const body = await postProxy({ mimeType, data, mode, ...extra });
  const rows: any[] = Array.isArray(body?.students) ? body.students : [];
  if (!rows.length) throw new Error('Nothing was found in this file.');
  return rows;
}

export async function readRowsWithAi(file: File, instructions = ''): Promise<ImportedRow[]> {
  return (await callProxy(file, 'students', { instructions })) as ImportedRow[];
}

/** Students typed or pasted into the box (no file). The AI picks the students out of the text. */
export async function readStudentsFromText(text: string): Promise<ImportedRow[]> {
  const body = await postProxy({ mode: 'students-text', text });
  const rows: ImportedRow[] = Array.isArray(body?.students) ? body.students : [];
  if (!rows.length) throw new Error('No students found in your text. Attach a file, or type names like "Ali Khan s/o Ahmed".');
  return rows;
}

// ---------- Hand the rows to the existing import checker ----------

/** Wraps rows as a students file so planStudentsImport (duplicates, cleaning, preview) is reused. */
export function rowsToStudentsFile(rows: ImportedRow[]): File {
  const payload = {
    app: AI_FILE_APP,
    version: AI_FILE_VERSION,
    tab: 'students',
    students: rows.map(r => ({
      name: r.name,
      fatherName: r.fatherName,
      admissionNo: r.admissionNo,
      phone: r.phone,
    })),
  };
  return new File([JSON.stringify(payload)], 'import.json', { type: 'application/json' });
}


// ---------- Remarks (Results tab) ----------

export interface RemarkRow {
  rollNo: string;
  name: string;
  remarks: string;
}

const isRemarkHeader = (h: unknown) => /^(remarks?|comments?|teacherremarks?|teachercomments?|feedback|note|notes|observation)$/.test(norm(h));
const isNameHeader = (h: unknown) => fieldOf(h) === 'name';
const isRollHeader = (h: unknown) => fieldOf(h) === 'rollNo' || /^(rollno|roll|rollnumber)$/.test(norm(h));

export async function readRemarkRowsFromSheet(file: File): Promise<RemarkRow[]> {
  if (file.size > MAX_SHEET_BYTES) throw new Error('This file is too large (over 5 MB).');
  const XLSX = await import('xlsx');
  let rows: unknown[][];
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '', blankrows: false });
  } catch {
    throw new Error('Could not open this file. Is it a real Excel or CSV file?');
  }

  let headerIdx = -1;
  let cRemark = -1, cName = -1, cRoll = -1;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const r = rows[i] || [];
    const rem = r.findIndex(isRemarkHeader);
    const nm = r.findIndex(isNameHeader);
    const rl = r.findIndex(isRollHeader);
    if (rem >= 0 && (nm >= 0 || rl >= 0)) {
      headerIdx = i; cRemark = rem; cName = nm; cRoll = rl;
      break;
    }
  }
  if (headerIdx < 0) {
    throw new Error('Could not find the columns. Put headings like Roll No, Name and Remarks in the first row.');
  }

  const out: RemarkRow[] = [];
  for (const r of rows.slice(headerIdx + 1)) {
    const remarks = String(r[cRemark] ?? '').trim();
    const name = cName >= 0 ? String(r[cName] ?? '').trim() : '';
    const rollNo = cRoll >= 0 ? String(r[cRoll] ?? '').trim() : '';
    if (!remarks || (!name && !rollNo)) continue;
    out.push({ rollNo, name, remarks });
  }
  if (!out.length) throw new Error('No remarks found under the Remarks column.');
  return out;
}

export async function readRemarkRowsWithAi(file: File): Promise<RemarkRow[]> {
  return (await callProxy(file, 'remarks')) as RemarkRow[];
}

const nameKey = (v: string) => v.toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, ' ').trim();
const rollKey = (v: string) => {
  const t = String(v).trim();
  const n = parseInt(t, 10);
  return !isNaN(n) && /^\d+$/.test(t) ? String(n) : t.toLowerCase();
};

/**
 * Matches file rows to students (by name first, then roll number) and wraps them as a results file
 * so planResultsImport (length limits, blank checks, preview) is reused. Unmatched rows are sent
 * without an id, so they are counted as "unknown students skipped".
 */
export function remarkRowsToResultsFile(
  rows: RemarkRow[],
  students: { id: string; name: string; rollNo: string }[],
  assessment: { id: string; name: string }
): File {
  const byName = new Map<string, string[]>();
  const byRoll = new Map<string, string>();
  students.forEach(s => {
    const k = nameKey(s.name || '');
    if (k) byName.set(k, [...(byName.get(k) || []), s.id]);
    const rk = rollKey(s.rollNo || '');
    if (rk) byRoll.set(rk, s.id);
  });

  const entries = rows.map(r => {
    let id: string | undefined;
    const names = r.name ? byName.get(nameKey(r.name)) : undefined;
    if (names && names.length === 1) id = names[0];
    else if (r.rollNo) id = byRoll.get(rollKey(r.rollNo));
    return id ? { id, remarks: r.remarks } : { remarks: r.remarks };
  });

  const payload = {
    app: AI_FILE_APP,
    version: AI_FILE_VERSION,
    tab: 'results',
    assessment: { id: assessment.id, name: assessment.name },
    students: entries,
  };
  return new File([JSON.stringify(payload)], 'import.json', { type: 'application/json' });
}


// ---------- Write remarks with AI (Results tab) ----------

export interface RemarkInput {
  n: number; // index used to match the answer back (no names are sent)
  marks: Record<string, number | 'A' | null>;
  percentage: number | null;
  rank: number | null;
  result: 'PASS' | 'FAIL' | null;
}

export async function generateRemarksWithAi(
  students: RemarkInput[],
  assessmentName: string,
  instructions: string
): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const CHUNK = 60;
  for (let i = 0; i < students.length; i += CHUNK) {
    const body = await postProxy({
      mode: 'generate-remarks',
      students: students.slice(i, i + CHUNK),
      assessment: assessmentName,
      instructions,
    });
    (Array.isArray(body?.remarks) ? body.remarks : []).forEach((r: any) => {
      if (typeof r?.n === 'number' && typeof r?.remark === 'string' && r.remark.trim()) out.set(r.n, r.remark.trim());
    });
  }
  if (!out.size) throw new Error('The AI did not return any remarks. Try again.');
  return out;
}

/** Wraps generated remarks as a results file so planResultsImport (checks + preview) is reused. */
export function generatedRemarksToResultsFile(
  items: { n: number; id: string }[],
  remarks: Map<number, string>,
  assessment: { id: string; name: string }
): File {
  const payload = {
    app: AI_FILE_APP,
    version: AI_FILE_VERSION,
    tab: 'results',
    assessment: { id: assessment.id, name: assessment.name },
    students: items.filter(i => remarks.has(i.n)).map(i => ({ id: i.id, remarks: remarks.get(i.n) })),
  };
  return new File([JSON.stringify(payload)], 'import.json', { type: 'application/json' });
}


// ---------- Marks (Results tab) ----------

export interface MarkRow {
  rollNo: string;
  name: string;
  marks: Record<string, string>; // assessment subject id -> value as written ("45", "A", ...)
}

type SubjectLike = { id: string; name: string; max: number };

/** Matches a column heading / subject label from a file to a subject of the assessment. */
function matchSubject(label: string, subjects: SubjectLike[]): string | null {
  const h = norm(label);
  if (!h) return null;
  const exact = subjects.find(s => norm(s.name) === h);
  if (exact) return exact.id;
  if (h.length >= 3) {
    const part = subjects.filter(s => {
      const n = norm(s.name);
      return n.length >= 3 && (n.includes(h) || h.includes(n));
    });
    if (part.length === 1) return part[0].id;
  }
  return null;
}

export async function readMarkRowsFromSheet(
  file: File,
  subjects: SubjectLike[]
): Promise<{ rows: MarkRow[]; ignoredColumns: string[] }> {
  if (file.size > MAX_SHEET_BYTES) throw new Error('This file is too large (over 5 MB).');
  const XLSX = await import('xlsx');
  let rows: unknown[][];
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '', blankrows: false });
  } catch {
    throw new Error('Could not open this file. Is it a real Excel or CSV file?');
  }

  let headerIdx = -1;
  let cName = -1, cRoll = -1;
  let subjectCols = new Map<number, string>();
  let ignored: string[] = [];
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const r = rows[i] || [];
    const nm = r.findIndex(isNameHeader);
    const rl = r.findIndex(isRollHeader);
    const cols = new Map<number, string>();
    const skipped: string[] = [];
    r.forEach((cell, c) => {
      if (c === nm || c === rl) return;
      const label = String(cell ?? '').trim();
      if (!label) return;
      const id = matchSubject(label, subjects);
      if (id && ![...cols.values()].includes(id)) cols.set(c, id);
      else skipped.push(label);
    });
    if ((nm >= 0 || rl >= 0) && cols.size > 0) {
      headerIdx = i; cName = nm; cRoll = rl; subjectCols = cols; ignored = skipped;
      break;
    }
  }
  if (headerIdx < 0) {
    throw new Error('Could not find the columns. Put headings like Roll No, Name and your subject names (' +
      subjects.slice(0, 3).map(s => s.name).join(', ') + '…) in the first row.');
  }

  const out: MarkRow[] = [];
  for (const r of rows.slice(headerIdx + 1)) {
    const name = cName >= 0 ? String(r[cName] ?? '').trim() : '';
    const rollNo = cRoll >= 0 ? String(r[cRoll] ?? '').trim() : '';
    if (!name && !rollNo) continue;
    const marks: Record<string, string> = {};
    subjectCols.forEach((subId, c) => {
      const v = String(r[c] ?? '').trim();
      if (v) marks[subId] = v;
    });
    if (Object.keys(marks).length) out.push({ rollNo, name, marks });
  }
  if (!out.length) throw new Error('No marks found under the subject columns.');
  return { rows: out, ignoredColumns: ignored };
}

export async function readMarkRowsWithAi(file: File, subjects: SubjectLike[]): Promise<MarkRow[]> {
  const raw = await callProxy(file, 'marks', { subjects: subjects.map(s => s.name) });
  const out: MarkRow[] = [];
  for (const r of raw) {
    const marks: Record<string, string> = {};
    (Array.isArray(r?.marks) ? r.marks : []).forEach((m: any) => {
      const id = matchSubject(String(m?.subject ?? ''), subjects);
      const v = String(m?.value ?? '').trim();
      if (id && v) marks[id] = v;
    });
    const name = String(r?.name ?? '').trim();
    const rollNo = String(r?.rollNo ?? '').trim();
    if ((name || rollNo) && Object.keys(marks).length) out.push({ rollNo, name, marks });
  }
  if (!out.length) throw new Error('No marks were found in this file.');
  return out;
}

export interface MarksPlan {
  updates: Record<string, Record<string, number | 'A'>>; // studentId -> subjectId -> mark
  students: number;
  cells: number; // marks that will be saved (new or changed)
  overwritten: number; // of those, how many replace a different existing mark
  unchanged: number;
  overMax: number;
  invalid: number;
  unknownStudents: number;
  examples: string[];
}

export function planMarksImport(
  rows: MarkRow[],
  students: { id: string; name: string; rollNo: string }[],
  asmt: Assessment,
  existing: Record<string, Record<string, number | 'A'>>
): MarksPlan {
  const byName = new Map<string, string[]>();
  const byRoll = new Map<string, string>();
  const nameOf = new Map<string, string>();
  students.forEach(s => {
    nameOf.set(s.id, s.name);
    const k = nameKey(s.name || '');
    if (k) byName.set(k, [...(byName.get(k) || []), s.id]);
    const rk = rollKey(s.rollNo || '');
    if (rk) byRoll.set(rk, s.id);
  });
  const subById = new Map(asmt.subjects.map(s => [s.id, s]));

  const plan: MarksPlan = { updates: {}, students: 0, cells: 0, overwritten: 0, unchanged: 0, overMax: 0, invalid: 0, unknownStudents: 0, examples: [] };
  const final: Record<string, Record<string, number | 'A'>> = {};

  for (const r of rows) {
    let id: string | undefined;
    const names = r.name ? byName.get(nameKey(r.name)) : undefined;
    if (names && names.length === 1) id = names[0];
    else if (r.rollNo) id = byRoll.get(rollKey(r.rollNo));
    if (!id) { plan.unknownStudents++; continue; }

    for (const [subId, text] of Object.entries(r.marks)) {
      const sub = subById.get(subId);
      if (!sub) continue;
      const t = text.trim();
      let value: number | 'A';
      if (/^(a|ab|abs|absent)$/i.test(t)) value = 'A';
      else if (/^(\d+\.?\d*|\.\d+)$/.test(t)) {
        value = Number(t);
        if (!isFinite(value)) { plan.invalid++; continue; }
        if (value > (Number(sub.max) || 0)) { plan.overMax++; continue; }
      } else { plan.invalid++; continue; }
      (final[id] ||= {})[subId] = value; // a student listed twice: the last row wins
    }
  }

  for (const [sid, row] of Object.entries(final)) {
    const cur = existing[sid] || {};
    const patch: Record<string, number | 'A'> = {};
    for (const [subId, v] of Object.entries(row)) {
      if (cur[subId] === v) { plan.unchanged++; continue; }
      patch[subId] = v;
      plan.cells++;
      if (cur[subId] !== undefined) plan.overwritten++;
      if (plan.examples.length < 4) plan.examples.push(`${nameOf.get(sid) || ''}: ${subById.get(subId)!.name} ${v}`);
    }
    if (Object.keys(patch).length) {
      plan.updates[sid] = patch;
      plan.students++;
    }
  }
  return plan;
}


// ---------- One reader for the Results tab: marks and/or remarks from the same file ----------

export interface ResultsFound {
  marks: MarkRow[];
  remarks: RemarkRow[];
  ignoredColumns: string[];
}

export async function readResultsSheet(file: File, subjects: SubjectLike[]): Promise<ResultsFound> {
  if (file.size > MAX_SHEET_BYTES) throw new Error('This file is too large (over 5 MB).');
  const XLSX = await import('xlsx');
  let rows: unknown[][];
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '', blankrows: false });
  } catch {
    throw new Error('Could not open this file. Is it a real Excel or CSV file?');
  }

  let headerIdx = -1;
  let cName = -1, cRoll = -1, cRemark = -1;
  let subjectCols = new Map<number, string>();
  let ignored: string[] = [];
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const r = rows[i] || [];
    const nm = r.findIndex(isNameHeader);
    const rl = r.findIndex(isRollHeader);
    const rem = r.findIndex(isRemarkHeader);
    const cols = new Map<number, string>();
    const skipped: string[] = [];
    r.forEach((cell, c) => {
      if (c === nm || c === rl || c === rem) return;
      const label = String(cell ?? '').trim();
      if (!label) return;
      const id = matchSubject(label, subjects);
      if (id && ![...cols.values()].includes(id)) cols.set(c, id);
      else skipped.push(label);
    });
    if ((nm >= 0 || rl >= 0) && (cols.size > 0 || rem >= 0)) {
      headerIdx = i; cName = nm; cRoll = rl; cRemark = rem; subjectCols = cols; ignored = skipped;
      break;
    }
  }
  if (headerIdx < 0) {
    throw new Error('Could not find the columns. Put headings like Roll No, Name, your subject names (' +
      subjects.slice(0, 3).map(s => s.name).join(', ') + '…) and/or Remarks in the first row.');
  }

  const marks: MarkRow[] = [];
  const remarks: RemarkRow[] = [];
  for (const r of rows.slice(headerIdx + 1)) {
    const name = cName >= 0 ? String(r[cName] ?? '').trim() : '';
    const rollNo = cRoll >= 0 ? String(r[cRoll] ?? '').trim() : '';
    if (!name && !rollNo) continue;
    const m: Record<string, string> = {};
    subjectCols.forEach((subId, c) => {
      const v = String(r[c] ?? '').trim();
      if (v) m[subId] = v;
    });
    if (Object.keys(m).length) marks.push({ rollNo, name, marks: m });
    const rem = cRemark >= 0 ? String(r[cRemark] ?? '').trim() : '';
    if (rem) remarks.push({ rollNo, name, remarks: rem });
  }
  return { marks, remarks, ignoredColumns: ignored };
}

export async function readResultsWithAi(file: File, subjects: SubjectLike[], instructions: string): Promise<ResultsFound> {
  const raw = await callProxy(file, 'results', { subjects: subjects.map(s => s.name), instructions });
  const marks: MarkRow[] = [];
  const remarks: RemarkRow[] = [];
  for (const r of raw) {
    const name = String(r?.name ?? '').trim();
    const rollNo = String(r?.rollNo ?? '').trim();
    if (!name && !rollNo) continue;
    const m: Record<string, string> = {};
    (Array.isArray(r?.marks) ? r.marks : []).forEach((x: any) => {
      const id = matchSubject(String(x?.subject ?? ''), subjects);
      const v = String(x?.value ?? '').trim();
      if (id && v) m[id] = v;
    });
    if (Object.keys(m).length) marks.push({ rollNo, name, marks: m });
    const rem = String(r?.remarks ?? '').trim();
    if (rem) remarks.push({ rollNo, name, remarks: rem });
  }
  return { marks, remarks, ignoredColumns: [] };
}

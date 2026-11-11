import { AppData, Assessment } from '../types';

/**
 * "Edit with AI" file exchange.
 * The app exports a small JSON file for one tab, the person edits it with any AI tool,
 * and the app imports it back. Only the fields listed for that tab are ever applied.
 */

export const AI_FILE_APP = 'ClassgridAI';
export const AI_FILE_VERSION = 1;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_REMARK_LEN = 300;

interface RankedLike {
  s: { id: string; rollNo: string; name: string };
  r: { total: number; maxTotal: number; pct: number; passed: boolean };
  rank: number;
}

// ---------- Results tab ----------

export function buildResultsAiFile(data: AppData, asmt: Assessment, ranked: RankedLike[]) {
  const marksOf = data.assessmentResults[asmt.id] || {};
  const remarksOf = data.assessmentRemarks[asmt.id] || {};
  const totalMax = asmt.subjects.reduce((sum, s) => sum + (Number(s.max) || 0), 0);

  return {
    app: AI_FILE_APP,
    version: AI_FILE_VERSION,
    tab: 'results',
    instructions: 'Put each student\'s remark in the "remarks" field. Do not change anything else.',
    school: data.schoolName,
    assessment: {
      id: asmt.id,
      name: asmt.name,
      passPercent: asmt.passPercent,
      totalMax,
    },
    subjects: asmt.subjects.map(s => ({ name: s.name, max: Number(s.max) || 0 })),
    students: ranked.map(item => {
      const row = marksOf[item.s.id] || {};
      const marks: Record<string, number | 'A' | null> = {};
      asmt.subjects.forEach(sub => {
        const v = row[sub.id];
        marks[sub.name] = v === undefined ? null : v;
      });
      const hasMarks = item.r.maxTotal > 0;
      return {
        id: item.s.id,
        rollNo: item.s.rollNo,
        name: item.s.name,
        marks,
        total: item.r.total,
        percentage: hasMarks ? Math.round(item.r.pct * 10) / 10 : null,
        rank: hasMarks ? item.rank : null,
        result: hasMarks ? (item.r.passed ? 'PASS' : 'FAIL') : null,
        remarks: remarksOf[item.s.id] || '',
      };
    }),
  };
}

export interface ResultsImportPlan {
  updates: Record<string, string>; // studentId -> new remark
  changed: number;
  unchanged: number;
  skippedUnknown: number;
  skippedBlank: number;
  truncated: number;
}

/** Reads an AI file and checks it is ours and for the right tab. Throws an Error with a plain message when it can't be used. */
async function readAiFile(file: File, tab: string, tabLabel: string): Promise<any> {
  if (file.size > MAX_FILE_BYTES) throw new Error('File is too large (over 2 MB).');
  let parsed: any;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error('This is not a valid JSON file.');
  }
  if (!parsed || parsed.app !== AI_FILE_APP) {
    throw new Error('This file was not exported with "Export for AI".');
  }
  if (parsed.tab !== tab) {
    throw new Error(`This file is for a different tab, not ${tabLabel}.`);
  }
  return parsed;
}

/** Reads and checks an AI file for the Results tab. */
export async function planResultsImport(file: File, data: AppData, asmt: Assessment): Promise<ResultsImportPlan> {
  const parsed = await readAiFile(file, 'results', 'Results');
  if (!parsed.assessment || parsed.assessment.id !== asmt.id) {
    const other = parsed.assessment?.name ? ` ("${String(parsed.assessment.name)}")` : '';
    throw new Error(`This file is for a different assessment${other}. Open that assessment and import there.`);
  }
  if (!Array.isArray(parsed.students)) {
    throw new Error('The file has no students list.');
  }

  const known = new Set(data.students.map(s => s.id));
  const current = data.assessmentRemarks[asmt.id] || {};
  const plan: ResultsImportPlan = { updates: {}, changed: 0, unchanged: 0, skippedUnknown: 0, skippedBlank: 0, truncated: 0 };

  for (const entry of parsed.students) {
    const id = entry && typeof entry.id === 'string' ? entry.id : '';
    if (!id || !known.has(id)) {
      plan.skippedUnknown++;
      continue;
    }
    if (typeof entry.remarks !== 'string') {
      plan.skippedBlank++;
      continue;
    }
    let text = entry.remarks.trim();
    if (!text) {
      // Never wipe an existing remark with an empty one by accident
      if (current[id]) plan.skippedBlank++;
      else plan.unchanged++;
      continue;
    }
    if (text.length > MAX_REMARK_LEN) {
      text = text.slice(0, MAX_REMARK_LEN);
      plan.truncated++;
    }
    if (text === (current[id] || '')) {
      plan.unchanged++;
    } else {
      plan.updates[id] = text;
      plan.changed++;
    }
  }
  return plan;
}

// ---------- Students Master tab ----------
// Existing students: name, father name and occupation can change. New students can be added (name, father name, adm. no, occupation).
// Roll numbers are always given by the app. Phone, address and notes are never sent or changed.

const MAX_NAME_LEN = 80;

export function buildStudentsAiFile(data: AppData) {
  return {
    app: AI_FILE_APP,
    version: AI_FILE_VERSION,
    tab: 'students',
    instructions:
      'To fix a name, edit "name" or "fatherName". ' +
      'To set or fix an occupation (the parent/guardian\'s job, optional), edit "occupation". ' +
      'To add a student, add an entry at the end with "name", "fatherName", "admissionNo" and optionally "occupation" (no "id"). ' +
      'Do not change anything else.',
    school: data.schoolName,
    students: data.students.map(s => ({
      id: s.id,
      rollNo: s.rollNo,
      admissionNo: s.admissionNo,
      name: s.name,
      fatherName: s.fatherName,
      occupation: s.occupation || '',
    })),
  };
}

export interface NewStudentInput {
  name: string;
  fatherName: string;
  admissionNo: string;
  phone?: string;
  occupation?: string;
}

export interface StudentsImportPlan {
  updates: Record<string, { name?: string; fatherName?: string; occupation?: string }>;
  additions: NewStudentInput[];
  changedStudents: number;
  changedNames: number;
  changedFathers: number;
  changedOccupations: number;
  unchanged: number;
  skippedUnknown: number;
  skippedInvalid: number;
  skippedDuplicate: number;
  sameNameNotes: number; // new students whose name matches an existing student (different father or adm. no)
  examples: string[]; // "Old → New" lines for the preview
  addedPreview: string[]; // lines for the new students
}

// Trim, collapse spaces, drop control characters. Returns '' when nothing usable is left.
function cleanName(v: unknown): string {
  if (typeof v !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LEN);
}

// Admission numbers: letters, digits and dashes only, up to 20 characters
function cleanAdm(v: unknown): string {
  if (typeof v === 'number') v = String(v);
  if (typeof v !== 'string') return '';
  return v.replace(/[^A-Za-z0-9-]/g, '').slice(0, 20);
}

// Phone numbers: digits, +, spaces and dashes only, up to 20 characters
function cleanPhone(v: unknown): string {
  if (typeof v === 'number') v = String(v);
  if (typeof v !== 'string') return '';
  return v.replace(/[^0-9+\-\s]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20);
}

const lc = (v: string) => v.toLowerCase().replace(/\s+/g, ' ').trim();

export async function planStudentsImport(file: File, data: AppData): Promise<StudentsImportPlan> {
  const parsed = await readAiFile(file, 'students', 'Students Master');
  if (!Array.isArray(parsed.students)) throw new Error('The file has no students list.');

  const byId = new Map(data.students.map(s => [s.id, s]));
  const byAdm = new Map<string, (typeof data.students)[number]>();
  data.students.forEach(s => {
    // Key by the same cleaned form the file values are compared with (the app allows "ADM/1001",
    // the AI file is cleaned to "ADM1001"; a raw key would miss the match and add a duplicate student)
    const k = cleanAdm(s.admissionNo);
    if (k) byAdm.set(k, s);
  });
  const plan: StudentsImportPlan = {
    updates: {}, additions: [], changedStudents: 0, changedNames: 0, changedFathers: 0, changedOccupations: 0,
    unchanged: 0, skippedUnknown: 0, skippedInvalid: 0, skippedDuplicate: 0, sameNameNotes: 0,
    examples: [], addedPreview: [],
  };
  const seenNewAdm = new Set<string>();
  const seenNewKey = new Set<string>();

  const applyUpdate = (cur: (typeof data.students)[number], entry: any) => {
    if (plan.updates[cur.id]) {
      plan.skippedDuplicate++; // same student listed twice
      return;
    }
    const patch: { name?: string; fatherName?: string; occupation?: string } = {};
    let invalid = false;
    if (entry.name !== undefined) {
      const n = cleanName(entry.name);
      if (!n) invalid = true; // never blank out a name
      else if (n !== cur.name) patch.name = n;
    }
    if (entry.fatherName !== undefined) {
      const f = cleanName(entry.fatherName);
      if (!f && cur.fatherName) invalid = true;
      else if (f !== (cur.fatherName || '')) patch.fatherName = f;
    }
    if (entry.occupation !== undefined) {
      const o = cleanName(entry.occupation);
      if (!o && cur.occupation) invalid = true; // never blank out an existing occupation
      else if (o !== (cur.occupation || '')) patch.occupation = o;
    }
    if (invalid) plan.skippedInvalid++;
    if (patch.name === undefined && patch.fatherName === undefined && patch.occupation === undefined) {
      if (!invalid) plan.unchanged++;
      return;
    }
    plan.updates[cur.id] = patch;
    plan.changedStudents++;
    if (patch.name !== undefined) {
      plan.changedNames++;
      if (plan.examples.length < 5) plan.examples.push(`${cur.name} → ${patch.name}`);
    }
    if (patch.fatherName !== undefined) {
      plan.changedFathers++;
      if (plan.examples.length < 5) plan.examples.push(`s/o ${cur.fatherName || '—'} → ${patch.fatherName}`);
    }
    if (patch.occupation !== undefined) {
      plan.changedOccupations++;
      if (plan.examples.length < 5) plan.examples.push(`Occupation: ${cur.occupation || '—'} → ${patch.occupation}`);
    }
  };

  for (const entry of parsed.students) {
    if (!entry || typeof entry !== 'object') {
      plan.skippedInvalid++;
      continue;
    }
    const id = typeof entry.id === 'string' ? entry.id : '';
    const adm = cleanAdm(entry.admissionNo);

    // 1. Existing student (found by id)
    if (id) {
      const cur = byId.get(id);
      if (!cur) {
        plan.skippedUnknown++;
        continue;
      }
      applyUpdate(cur, entry);
      continue;
    }

    // 2. No id: an existing student with the same admission number is updated, anything else is a new student
    if (adm && byAdm.has(adm)) {
      applyUpdate(byAdm.get(adm)!, entry);
      continue;
    }

    const name = cleanName(entry.name);
    if (!name) {
      plan.skippedInvalid++;
      continue;
    }
    const father = cleanName(entry.fatherName);
    const key = `${lc(name)}|${lc(father)}`;
    const sameInApp = data.students.filter(s => lc(s.name) === lc(name));
    const exactInApp = sameInApp.some(s => lc(s.fatherName || '') === lc(father) && (!adm || !s.admissionNo || cleanAdm(s.admissionNo) === adm));
    if ((adm && seenNewAdm.has(adm)) || seenNewKey.has(key) || exactInApp) {
      plan.skippedDuplicate++;
      continue;
    }
    if (adm) seenNewAdm.add(adm);
    seenNewKey.add(key);
    if (sameInApp.length) plan.sameNameNotes++;
    plan.additions.push({ name, fatherName: father, admissionNo: adm, phone: cleanPhone(entry.phone), occupation: cleanName(entry.occupation) });
    if (plan.addedPreview.length < 6) plan.addedPreview.push(`${name}${adm ? ` (Adm. ${adm})` : ''}`);
  }
  return plan;
}

// "Send & Receive": build a one-file HTML form for a teacher, and read back what they send.
import template from './teacherForm.html?raw';
import { AppData, Student } from '../types';
import { getSortedStudents } from '../utils/helpers';
import { formatRoll, nextRollNumber } from '../utils/rollNumbers';
import { newId } from '../utils/helpers';

export type FieldKey = 'rollNo' | 'name' | 'fatherName' | 'admissionNo' | 'phone' | 'address' | 'occupation' | 'notes';
/** show = teacher can see it; edit = teacher can type/correct it; off = not put in the file at all */
export type FieldMode = 'show' | 'edit' | 'off';
export type FieldChoices = Record<FieldKey, FieldMode>;

export const FIELD_DEFS: { key: FieldKey; label: string; canBeOff: boolean }[] = [
  { key: 'rollNo', label: 'Roll #', canBeOff: false },
  { key: 'name', label: 'Name', canBeOff: false },
  { key: 'fatherName', label: 'Father Name', canBeOff: true },
  { key: 'admissionNo', label: 'Adm. No', canBeOff: true },
  { key: 'phone', label: 'Phone', canBeOff: true },
  { key: 'address', label: 'Address', canBeOff: true },
  { key: 'occupation', label: 'Occupation', canBeOff: true },
  { key: 'notes', label: 'Notes', canBeOff: true },
];

export const DEFAULT_CHOICES: FieldChoices = {
  rollNo: 'show', name: 'show', fatherName: 'show', admissionNo: 'off',
  phone: 'off', address: 'off', occupation: 'off', notes: 'off',
};

export interface SendOptions {
  choices: FieldChoices;
  note: string;
  /** only students that have an empty box in a field the teacher is asked to fill */
  onlyMissing: boolean;
  /** the teacher can add new students (used for an empty class, or to let them add the ones who are missing) */
  allowAdd?: boolean;
}

export function newRequestId(): string {
  return 'R' + Math.random().toString(36).slice(2, 8).toUpperCase();
}

const val = (s: Student, k: FieldKey) => String((s as any)[k] ?? '');

/** The students that would go in the file (used for the count shown before sending). */
export function studentsForFile(data: AppData, opts: SendOptions): Student[] {
  const list = getSortedStudents(data.students);
  if (!opts.onlyMissing) return list;
  const editKeys = FIELD_DEFS.filter(f => opts.choices[f.key] === 'edit').map(f => f.key);
  if (!editKeys.length) return list;
  return list.filter(s => editKeys.some(k => !val(s, k).trim()));
}

export interface PrintBundle { header: string; css: string; caps: boolean; mult: number }

export function buildStudentFile(data: AppData, opts: SendOptions, requestId = newRequestId(), print?: PrintBundle) {
  const keys = FIELD_DEFS.filter(f => opts.choices[f.key] !== 'off').map(f => f.key);
  const fields: Record<string, string> = {};
  keys.forEach(k => { fields[k] = opts.choices[k]; });

  const students = studentsForFile(data, opts).map(s => {
    const o: Record<string, string> = { id: s.id };
    keys.forEach(k => { o[k] = val(s, k); });
    return o;
  });

  const cfg = {
    app: 'classgrid-collect',
    v: 1,
    kind: 'students',
    requestId,
    createdAt: Date.now(),
    schoolName: data.schoolName || '',
    className: data.className || '',
    inchargeName: data.inchargeName || '',
    academicYear: data.academicYear || '',
    logo: data.schoolLogo || '',
    title: 'Student list',
    allowAdd: !!opts.allowAdd,
    addKeys: opts.allowAdd ? Array.from(new Set(['name', ...keys.filter(k => k !== 'rollNo')])) : undefined,
    note: opts.note.trim(),
    fields,
    print: print || null,
    students,
  };
  const json = JSON.stringify(cfg).replace(/</g, '\\u003c');
  const re = /<script id="cg-config" type="application\/json">[\s\S]*?<\/script>/;
  if (!re.test(template)) throw new Error('Teacher form template is missing its data tag.');
  const html = template.replace(re, () => '<script id="cg-config" type="application/json">' + json + '</' + 'script>');
  return { html, requestId, count: students.length, fields };
}

/* ---------- what came back ---------- */
export interface ReturnFile {
  app: 'classgrid-collect-return';
  v: number;
  kind: string;
  requestId: string;
  revision: number;
  savedAt: number;
  from: string;
  className: string;
  fields: Record<string, string>;
  count: number;
  changes: Record<string, Record<string, { from: string; to: string }>>;
  /** students the teacher added (students files only) */
  added?: Record<string, string>[];
  /** marks files only */
  assessmentId?: string;
  assessmentName?: string;
  mode?: string;
  subjects?: { id: string; name: string; max: number }[];
  /** marks files: total marks the teacher typed for subjects that had none */
  maxes?: Record<string, { from: string; to: string }>;
}

/** Reads a returned .json/.txt (text around the data is ignored) or the teacher's saved HTML copy. */
export function parseReturn(text: string): ReturnFile {
  const t = String(text || '');
  if (t.includes('id="cg-config"') && t.includes('id="cg-work"')) {
    const grab = (id: string) => {
      const m = t.match(new RegExp('<script id="' + id + '" type="application/json">([\\s\\S]*?)</script>'));
      return m ? JSON.parse(m[1]) : {};
    };
    const cfg = grab('cg-config');
    const work = grab('cg-work');
    if (cfg.app !== 'classgrid-collect') throw new Error('This is not a Classgrid form.');
    const byId: Record<string, any> = {};
    (cfg.students || []).forEach((s: any) => { byId[s.id] = s; });
    const changes: ReturnFile['changes'] = {};
    let count = 0;
    Object.keys(work.edits || {}).forEach(id => {
      if (!byId[id]) return;
      Object.keys(work.edits[id]).forEach(k => {
        if (cfg.fields?.[k] !== 'edit') return;
        (changes[id] = changes[id] || {})[k] = { from: String(byId[id][k] ?? ''), to: String(work.edits[id][k] ?? '') };
        count++;
      });
    });
    const added: Record<string, string>[] = [];
    if (cfg.allowAdd) {
      const keys: string[] = cfg.addKeys || [];
      (work.added || []).forEach((tid: string) => {
        const e = (work.edits || {})[tid] || {};
        const o: Record<string, string> = { tid };
        keys.forEach(k => { o[k] = String(e[k] ?? '').trim(); });
        added.push(o);
      });
      count += added.length;
    }
    return {
      added,
      app: 'classgrid-collect-return', v: 1, kind: cfg.kind || 'students', requestId: cfg.requestId,
      revision: work.revision || 0, savedAt: work.savedAt || 0, from: work.from || '',
      className: cfg.className || '', fields: cfg.fields || {}, count, changes,
      assessmentId: cfg.assessmentId, assessmentName: cfg.assessmentName, mode: cfg.mode, subjects: cfg.subjects,
      maxes: Object.keys(work.maxes || {}).reduce((o: Record<string, { from: string; to: string }>, k) => { o[k] = { from: '0', to: String(work.maxes[k] ?? '') }; return o; }, {}),
    };
  }
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('No data found in this file.');
  let d: any;
  try { d = JSON.parse(t.slice(a, b + 1)); } catch { throw new Error('This file is damaged or cut off.'); }
  if (d.app !== 'classgrid-collect-return' || !d.requestId || !d.changes) throw new Error('This is not a file from a Classgrid form.');
  return d as ReturnFile;
}

export interface PlannedChange {
  key: string;
  studentId: string;
  studentName: string;
  roll: string;
  field: FieldKey;
  from: string;
  to: string;
  current: string;
  /** the value in your app is not the one that was sent (you changed it after sending) */
  conflict: boolean;
  /** why this change cannot be applied */
  invalid?: string;
}

export interface PlannedAddition {
  key: string;
  tid: string;
  name: string;
  fatherName: string;
  admissionNo: string;
  phone: string;
  address: string;
  occupation: string;
  notes: string;
  /** an existing student (or an earlier row) has the same name and father name */
  duplicateOf?: string;
  invalid?: string;
}

export interface ReturnPlan {
  changes: PlannedChange[];
  /** new students the teacher added */
  additions: PlannedAddition[];
  /** changes for students that are not in the class any more */
  missing: number;
  /** changes already the same in the app */
  alreadySame: number;
}

export function planReturn(data: AppData, ret: ReturnFile): ReturnPlan {
  if (ret.kind === 'marks' || ret.kind === 'daily') return { changes: [], additions: [], missing: 0, alreadySame: 0 };
  const byId = new Map(data.students.map(s => [s.id, s]));
  const plan: ReturnPlan = { changes: [], additions: [], missing: 0, alreadySame: 0 };
  const labels = new Set(FIELD_DEFS.map(f => f.key as string));

  Object.keys(ret.changes || {}).forEach(id => {
    const s = byId.get(id);
    const rows = ret.changes[id] || {};
    if (!s) { plan.missing += Object.keys(rows).length; return; }
    Object.keys(rows).forEach(k => {
      if (!labels.has(k) || ret.fields?.[k] !== 'edit') return; // only boxes the teacher was asked to fill
      const field = k as FieldKey;
      const to = field === 'rollNo' ? formatRoll(rows[k].to) : String(rows[k].to ?? '').trim();
      const from = String(rows[k].from ?? '');
      const current = val(s, field);
      if (current === to) { plan.alreadySame++; return; }
      const c: PlannedChange = {
        key: id + ':' + k, studentId: id, studentName: s.name || '(no name)', roll: s.rollNo || '',
        field, from, to, current, conflict: current !== from,
      };
      if (field === 'name' && !to) c.invalid = 'Name cannot be empty';
      plan.changes.push(c);
    });
  });
  // students the teacher added
  const clean = (v: unknown, max: number) =>
    // eslint-disable-next-line no-control-regex
    String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  const lc = (v: string) => v.toLowerCase().replace(/\s+/g, ' ').trim();
  const seen = new Set(data.students.map(s => lc(s.name || '') + '|' + lc(s.fatherName || '')));
  (Array.isArray(ret.added) ? ret.added : []).forEach((a: any, i: number) => {
    if (!a || typeof a !== 'object') return;
    const add: PlannedAddition = {
      key: 'new:' + (clean(a.tid, 40) || i),
      tid: clean(a.tid, 40),
      name: clean(a.name, 80),
      fatherName: clean(a.fatherName, 80),
      admissionNo: clean(a.admissionNo, 20).replace(/[^A-Za-z0-9-]/g, ''),
      phone: clean(a.phone, 20).replace(/[^0-9+\-\s]/g, ''),
      address: clean(a.address, 120),
      occupation: clean(a.occupation, 80),
      notes: clean(a.notes, 200),
    };
    if (!add.name) { add.invalid = 'Name is empty'; plan.additions.push(add); return; }
    const k = lc(add.name) + '|' + lc(add.fatherName);
    if (seen.has(k)) add.duplicateOf = add.name;
    seen.add(k);
    plan.additions.push(add);
  });
  // roll changes first (they affect every list), then the rest in roll order
  const order = new Map(getSortedStudents(data.students).map((s, i) => [s.id, i]));
  plan.changes.sort((a, b) => {
    const ra = a.field === 'rollNo' ? 0 : 1, rb = b.field === 'rollNo' ? 0 : 1;
    if (ra !== rb) return ra - rb;
    return (order.get(a.studentId) ?? 0) - (order.get(b.studentId) ?? 0);
  });
  return plan;
}

/** Adds the ticked new students at the end of the list; roll numbers follow on from the last one. */
export function applyAdditions(students: Student[], chosen: PlannedAddition[]): Student[] {
  if (!chosen.length) return students;
  const start = parseInt(nextRollNumber(students), 10) || students.length + 1;
  const added: Student[] = chosen.map((a, i) => ({
    id: newId(),
    admissionNo: a.admissionNo,
    rollNo: String(start + i).padStart(2, '0'),
    name: a.name,
    fatherName: a.fatherName,
    phone: a.phone,
    address: a.address,
    occupation: a.occupation,
    notes: a.notes,
    createdAt: Date.now(),
  }));
  return [...students, ...added];
}

const rollKey = (r: string) => { const t = String(r || '').trim(); return /^\d+$/.test(t) ? String(parseInt(t, 10)) : t.toLowerCase(); };

/**
 * Applies the chosen changes. Roll numbers are applied together as one batch, so swapping two
 * students' numbers works. Returns a problem message if a changed roll number would be used twice.
 */
export function applyChanges(students: Student[], chosen: PlannedChange[]): { students: Student[]; problem: string | null } {
  const touched = new Set(chosen.filter(c => c.field === 'rollNo').map(c => c.studentId));
  const next = students.map(s => {
    const mine = chosen.filter(c => c.studentId === s.id);
    if (!mine.length) return s;
    const copy: any = { ...s };
    mine.forEach(c => { copy[c.field] = c.to; });
    return copy as Student;
  });

  if (touched.size) {
    const groups = new Map<string, Student[]>();
    next.forEach(s => {
      const r = String(s.rollNo || '').trim();
      if (!r) return;
      const k = rollKey(r);
      groups.set(k, [...(groups.get(k) || []), s]);
    });
    for (const [, g] of groups) {
      if (g.length > 1 && g.some(s => touched.has(s.id))) {
        return { students, problem: `Roll ${g[0].rollNo} would belong to ${g.map(s => s.name || '(no name)').join(' and ')}. Untick one of them, or fix it in the form.` };
      }
    }
  }
  return { students: next, problem: null };
}

/* ---------- log of what was sent / received (kept on this device) ---------- */
export interface SentRecord {
  requestId: string;
  createdAt: number;
  className: string;
  count: number;
  fields: Record<string, string>;
  /** short description for marks files, e.g. "Midterm: Math, English" */
  what?: string;
  returns: { revision: number; from: string; receivedAt: number; applied: number }[];
}
const LOG_KEY = 'classgridCollectLog';
export function loadLog(): SentRecord[] {
  try { return JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); } catch { return []; }
}
function saveLog(l: SentRecord[]) { try { localStorage.setItem(LOG_KEY, JSON.stringify(l.slice(0, 100))); } catch { /* ignore */ } }
export function logSent(r: Omit<SentRecord, 'returns'>) {
  const l = loadLog().filter(x => x.requestId !== r.requestId);
  saveLog([{ ...r, returns: [] }, ...l]);
}
export function logReturn(requestId: string, ret: { revision: number; from: string }, applied: number, meta?: { className: string }) {
  const l = loadLog();
  let rec = l.find(x => x.requestId === requestId);
  if (!rec) {
    rec = { requestId, createdAt: Date.now(), className: meta?.className || '', count: 0, fields: {}, returns: [] };
    l.unshift(rec);
  }
  rec.returns.push({ revision: ret.revision, from: ret.from, receivedAt: Date.now(), applied });
  saveLog(l);
}

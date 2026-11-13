// "Send & Receive" for marks: a one-file HTML form for a teacher to enter marks, and reading them back.
import template from './marksForm.html?raw';
import { AppData, Assessment } from '../types';
import { getSortedStudents } from '../utils/helpers';
import { newRequestId, PrintBundle, ReturnFile } from './collect';

export interface MarksOptions {
  assessmentId: string;
  subjectIds: string[];
  showFather: boolean;
  /** teacher can also write a short remark for each student */
  remarks?: boolean;
  note: string;
  /** only students who have no mark yet in at least one chosen subject */
  onlyMissing: boolean;
}

const remarkStr = (data: AppData, asmtId: string, sid: string): string => String((data.assessmentRemarks?.[asmtId] || {})[sid] ?? '');

const markStr = (data: AppData, asmtId: string, sid: string, subId: string): string => {
  const v = ((data.assessmentResults[asmtId] || {})[sid] || {})[subId];
  return v === undefined || v === null ? '' : String(v);
};

export function studentsForMarks(data: AppData, opts: MarksOptions) {
  const list = getSortedStudents(data.students);
  if (!opts.onlyMissing) return list;
  return list.filter(s => (opts.remarks && !remarkStr(data, opts.assessmentId, s.id).trim()) || opts.subjectIds.some(sub => !markStr(data, opts.assessmentId, s.id, sub).trim()));
}

export function buildMarksFile(data: AppData, opts: MarksOptions, requestId = newRequestId(), print?: PrintBundle) {
  const asmt = data.assessments.find(a => a.id === opts.assessmentId);
  if (!asmt) throw new Error('Choose an assessment first.');
  const subjects = asmt.subjects.filter(s => opts.subjectIds.includes(s.id)).map(s => ({ id: s.id, name: s.name, max: s.max }));
  if (!subjects.length) throw new Error('Tick at least one subject.');

  const students = studentsForMarks(data, opts).map(s => {
    const o: Record<string, string> = { id: s.id, rollNo: s.rollNo || '', name: s.name || '' };
    if (opts.showFather) o.fatherName = s.fatherName || '';
    subjects.forEach(sub => { o[sub.id] = markStr(data, asmt.id, s.id, sub.id); });
    if (opts.remarks) o._remark = remarkStr(data, asmt.id, s.id);
    return o;
  });
  const fields: Record<string, string> = {};
  subjects.forEach(s => { fields[s.id] = 'edit'; });
  if (opts.remarks) fields._remark = 'edit';

  const cfg = {
    app: 'classgrid-collect', v: 1, kind: 'marks', requestId, createdAt: Date.now(),
    schoolName: data.schoolName || '', className: data.className || '', inchargeName: data.inchargeName || '',
    academicYear: data.academicYear || '', logo: data.schoolLogo || '',
    assessmentId: asmt.id, assessmentName: asmt.name, subjects, showFather: opts.showFather, remarks: !!opts.remarks,
    note: opts.note.trim(), fields, print: print || null, students,
  };
  const json = JSON.stringify(cfg).replace(/</g, '\\u003c');
  const re = /<script id="cg-config" type="application\/json">[\s\S]*?<\/script>/;
  if (!re.test(template)) throw new Error('Marks form template is missing its data tag.');
  const html = template.replace(re, () => '<script id="cg-config" type="application/json">' + json + '</' + 'script>');
  return { html, requestId, count: students.length, fields, assessment: asmt as Assessment, subjectNames: subjects.map(s => s.name) };
}

/* ---------- what came back ---------- */
export interface PlannedMark {
  key: string;
  studentId: string;
  studentName: string;
  roll: string;
  subId: string;
  subName: string;
  max: number;
  to: string; // '' = clear, 'A' = absent, or a number as text
  current: string;
  from: string;
  /** the mark in your app is not the one that was there when the file was sent */
  conflict: boolean;
  invalid?: string;
}
export interface MarksPlan {
  assessment: Assessment | null;
  changes: PlannedMark[];
  missing: number;
  alreadySame: number;
  /** whole file cannot be used */
  problem?: string;
  /** set for attendance / daily-test returns */
  daily?: 'attendance' | 'test';
}

export const isMarksReturn = (r: ReturnFile) => r.kind === 'marks';

export function planMarksReturn(data: AppData, ret: ReturnFile): MarksPlan {
  const plan: MarksPlan = { assessment: null, changes: [], missing: 0, alreadySame: 0 };
  const asmt = data.assessments.find(a => a.id === ret.assessmentId);
  if (!asmt) { plan.problem = `The assessment "${ret.assessmentName || ''}" is not in this class any more.`; return plan; }
  plan.assessment = asmt;
  const students = new Map(data.students.map(s => [s.id, s]));
  const subs = new Map(asmt.subjects.map(s => [s.id, s]));
  const sent = new Map((ret.subjects || []).map(s => [s.id, s]));
  const teacherMax: Record<string, number> = {};

  // Total marks the teacher typed for subjects that had none
  Object.keys(ret.maxes || {}).forEach(subId => {
    const sub = subs.get(subId);
    if (!sub) { plan.missing++; return; }
    const to = String(ret.maxes![subId].to ?? '').trim();
    const n = Number(to);
    if (!/^\d+$/.test(to) || n <= 0) return;
    teacherMax[subId] = n;
    if (Number(sub.max) === n) { plan.alreadySame++; return; }
    plan.changes.push({
      key: '_max:' + subId, studentId: '', studentName: 'Total marks', roll: '', subId: '_max:' + subId, subName: sub.name,
      max: 0, to: String(n), current: Number(sub.max) > 0 ? String(sub.max) : '', from: '', conflict: Number(sub.max) > 0,
      invalid: asmt.locked ? 'This assessment is locked. Unlock it in Results first.' : undefined,
    });
  });

  Object.keys(ret.changes || {}).forEach(id => {
    const s = students.get(id);
    const rows = ret.changes[id] || {};
    if (!s) { plan.missing += Object.keys(rows).length; return; }
    Object.keys(rows).forEach(subId => {
      if (subId === '_remark') {
        const to = String(rows[subId].to ?? '').trim();
        const from = String(rows[subId].from ?? '');
        const current = remarkStr(data, asmt.id, id);
        if (current === to) { plan.alreadySame++; return; }
        plan.changes.push({
          key: id + ':_remark', studentId: id, studentName: s.name || '(no name)', roll: s.rollNo || '',
          subId, subName: 'Remarks', max: 0, to, current, from, conflict: current !== from,
          invalid: asmt.locked ? 'This assessment is locked. Unlock it in Results first.' : undefined,
        });
        return;
      }
      const sub = subs.get(subId);
      if (!sub) { plan.missing++; return; }
      const subMax = Number(sub.max) > 0 ? Number(sub.max) : (teacherMax[subId] || 0);
      let to = String(rows[subId].to ?? '').trim().replace(',', '.');
      if (/^(a|abs|absent)$/i.test(to)) to = 'A';
      const from = String(rows[subId].from ?? '');
      const current = markStr(data, asmt.id, id, subId);
      if (current === to) { plan.alreadySame++; return; }
      const c: PlannedMark = {
        key: id + ':' + subId, studentId: id, studentName: s.name || '(no name)', roll: s.rollNo || '',
        subId, subName: sub.name, max: sub.max, to, current, from, conflict: current !== from,
      };
      if (asmt.locked) c.invalid = 'This assessment is locked. Unlock it in Results first.';
      else if (to !== '' && to !== 'A') {
        const n = Number(to);
        if (!/^\d+(\.\d+)?$/.test(to) || !isFinite(n)) c.invalid = 'Not a valid mark';
        else if (subMax > 0 && n > subMax) c.invalid = `More than the maximum (${subMax})`;
        else c.to = String(n);
      }
      if (sent.size && !sent.has(subId)) c.invalid = c.invalid || 'Subject was not in the file';
      plan.changes.push(c);
    });
  });
  const order = new Map(getSortedStudents(data.students).map((s, i) => [s.id, i]));
  plan.changes.sort((a, b) => (a.studentId === '' ? -1 : 0) - (b.studentId === '' ? -1 : 0) || (order.get(a.studentId) ?? 0) - (order.get(b.studentId) ?? 0) || a.subName.localeCompare(b.subName));
  return plan;
}

export function applyMarks(data: AppData, asmtId: string, chosen: PlannedMark[]): AppData {
  const cur: Record<string, Record<string, number | 'A'>> = { ...(data.assessmentResults[asmtId] || {}) };
  const rem: Record<string, string> = { ...(data.assessmentRemarks?.[asmtId] || {}) };
  let remTouched = false;
  let subjects = null as Assessment['subjects'] | null;
  chosen.forEach(c => {
    if (c.subId.startsWith('_max:')) {
      const id = c.subId.slice(5);
      const cur = data.assessments.find(a => a.id === asmtId);
      subjects = (subjects || (cur ? cur.subjects : [])).map(s => (s.id === id ? { ...s, max: Number(c.to) } : s));
    }
  });
  chosen.forEach(c => {
    if (c.subId.startsWith('_max:')) return;
    if (c.subId === '_remark') {
      remTouched = true;
      if (c.to === '') delete rem[c.studentId]; else rem[c.studentId] = c.to;
      return;
    }
    const row = { ...(cur[c.studentId] || {}) };
    if (c.to === '') delete row[c.subId];
    else row[c.subId] = c.to === 'A' ? 'A' : Number(c.to);
    cur[c.studentId] = row;
  });
  return {
    ...data,
    ...(subjects ? { assessments: data.assessments.map(a => (a.id === asmtId ? { ...a, subjects: subjects! } : a)) } : {}),
    assessmentResults: { ...data.assessmentResults, [asmtId]: cur },
    ...(remTouched ? { assessmentRemarks: { ...(data.assessmentRemarks || {}), [asmtId]: rem } } : {}),
  };
}

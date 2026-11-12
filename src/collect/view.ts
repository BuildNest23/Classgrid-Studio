// "Send & Receive": a read-only copy of the class (students, results, attendance) a teacher can view and print.
import template from './viewForm.html?raw';
import { AppData } from '../types';
import { getSortedStudents } from '../utils/helpers';
import { newRequestId, PrintBundle } from './collect';

export type ViewStudentCol = 'phone' | 'address' | 'occupation' | 'notes';
export const VIEW_STUDENT_COLS: { key: ViewStudentCol; label: string }[] = [
  { key: 'phone', label: 'Phone' },
  { key: 'address', label: 'Address' },
  { key: 'occupation', label: 'Occupation' },
  { key: 'notes', label: 'Notes' },
];

export interface ViewOptions {
  studentCols: ViewStudentCol[];
  assessmentIds: string[];
  attendance: boolean;
  note: string;
}

type Ranked = { s: { id: string }; r: { total: number; maxTotal: number; pct: number; passed: boolean; manual: boolean }; rank: number };

export function buildViewFile(
  data: AppData,
  opts: ViewOptions,
  rank: (asmtId: string) => Ranked[],
  print?: PrintBundle,
  requestId = newRequestId(),
) {
  const students = getSortedStudents(data.students).map(s => {
    const o: Record<string, string> = { id: s.id, rollNo: s.rollNo || '', admissionNo: s.admissionNo || '', name: s.name || '', fatherName: s.fatherName || '' };
    opts.studentCols.forEach(k => { o[k] = String((s as any)[k] || ''); });
    return o;
  });

  const results = data.assessments.filter(a => opts.assessmentIds.includes(a.id)).map(a => {
    const marks = data.assessmentResults[a.id] || {};
    const rows: Record<string, any> = {};
    rank(a.id).forEach(item => {
      const m: Record<string, string> = {};
      a.subjects.forEach(sub => {
        const v = (marks[item.s.id] || {})[sub.id];
        m[sub.id] = v === undefined || v === null ? '' : String(v);
      });
      const has = item.r.maxTotal > 0;
      rows[item.s.id] = {
        marks: m, has, total: item.r.total, pct: Math.round(item.r.pct * 10) / 10,
        result: item.r.passed ? 'PASS' : 'FAIL', manual: !!item.r.manual, rank: has ? item.rank : 0,
      };
    });
    return {
      id: a.id, name: a.name, passPercent: Number(a.passPercent) || 40,
      totalMax: a.subjects.reduce((n, s) => n + (Number(s.max) || 0), 0),
      subjects: a.subjects.map(s => ({ id: s.id, name: s.name, max: Number(s.max) || 0 })), rows,
    };
  });

  let attendance: { months: string[]; rows: Record<string, Record<string, number[]>> } | null = null;
  if (opts.attendance) {
    const months = new Set<string>();
    const rows: Record<string, Record<string, number[]>> = {};
    Object.keys(data.attendance || {}).sort().forEach(day => {
      const d = data.attendance[day];
      if (!d || d.holiday) return;
      const mk = day.slice(0, 7);
      Object.keys(d.status || {}).forEach(sid => {
        const st = d.status[sid];
        if (st !== 'P' && st !== 'A' && st !== 'L') return;
        months.add(mk);
        const r = (rows[sid] = rows[sid] || {});
        const c = (r[mk] = r[mk] || [0, 0, 0]);
        c[st === 'P' ? 0 : st === 'A' ? 1 : 2]++;
      });
    });
    attendance = { months: Array.from(months).sort(), rows };
  }

  const cfg = {
    app: 'classgrid-collect', v: 1, kind: 'view', requestId, createdAt: Date.now(),
    schoolName: data.schoolName || '', className: data.className || '', inchargeName: data.inchargeName || '',
    academicYear: data.academicYear || '', logo: data.schoolLogo || '', note: opts.note.trim(),
    studentCols: VIEW_STUDENT_COLS.filter(c => opts.studentCols.includes(c.key)).map(c => ({ k: c.key, l: c.label })),
    students, results, attendance, print: print || null,
  };
  const json = JSON.stringify(cfg).replace(/</g, '\\u003c');
  const re = /<script id="cg-config" type="application\/json">[\s\S]*?<\/script>/;
  if (!re.test(template)) throw new Error('Class copy template is missing its data tag.');
  const html = template.replace(re, () => '<script id="cg-config" type="application/json">' + json + '</' + 'script>');
  return { html, requestId, count: students.length, assessments: results.length };
}

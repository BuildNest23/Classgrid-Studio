// Teacher update file: the teacher's attendance, marks and payments, sent back to management.
// kind "classgrid-teacher-update", v1. Merging is safe to repeat: same data twice changes nothing.
import { AppData, Assessment, Fund } from '../types';
import { normalizeData } from '../utils/migrate';

export const UPDATE_KIND = 'classgrid-teacher-update';
export const UPDATE_VERSION = 1;

export interface TeacherUpdate {
  app: 'Classgrid';
  kind: typeof UPDATE_KIND;
  v: number;
  classId: string;
  className: string;
  /** class-file version the teacher was working on */
  baseVersion: number;
  from: string;
  createdAt: number;
  data: Pick<AppData, 'assessments' | 'funds' | 'attendance' | 'assessmentResults' | 'assessmentManualPass' | 'assessmentRemarks' | 'fundPayments' | 'dailyTests'>;
}

export function buildTeacherUpdate(d: AppData): TeacherUpdate | null {
  if (!d.classId) return null;
  return {
    app: 'Classgrid', kind: UPDATE_KIND, v: UPDATE_VERSION, classId: d.classId,
    className: d.className, baseVersion: d.teacherLink?.version ?? 0,
    from: d.inchargeName || '', createdAt: Date.now(),
    data: {
      assessments: d.assessments, funds: d.funds,
      attendance: d.attendance, assessmentResults: d.assessmentResults,
      assessmentManualPass: d.assessmentManualPass, assessmentRemarks: d.assessmentRemarks,
      fundPayments: d.fundPayments, dailyTests: d.dailyTests,
    },
  };
}

export function updateFileName(u: TeacherUpdate): string {
  const n = (u.className || 'class').replace(/[^\w\-]+/g, '_').replace(/^_+|_+$/g, '') || 'class';
  const dt = new Date(u.createdAt);
  const p = (x: number) => String(x).padStart(2, '0');
  return `Update_${n}_${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}.json`;
}

export function parseTeacherUpdate(text: string): { upd: TeacherUpdate | null; error: string } {
  let j: any;
  try { j = JSON.parse(text); } catch { return { upd: null, error: 'This is not a Classgrid update file.' }; }
  if (!j || j.kind !== UPDATE_KIND) return { upd: null, error: 'This is not a Classgrid update file.' };
  if (typeof j.v !== 'number' || j.v > UPDATE_VERSION) return { upd: null, error: 'This update is from a newer version of the app. Please update the app.' };
  if (typeof j.classId !== 'string' || !j.classId || !j.data || typeof j.data !== 'object') return { upd: null, error: 'This update file is damaged.' };
  const o = (v: any) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  return {
    upd: {
      app: 'Classgrid', kind: UPDATE_KIND, v: j.v, classId: j.classId,
      className: typeof j.className === 'string' ? j.className : '', baseVersion: Number(j.baseVersion) || 0,
      from: typeof j.from === 'string' ? j.from : '', createdAt: Number(j.createdAt) || 0,
      data: {
        assessments: Array.isArray(j.data.assessments) ? j.data.assessments.filter((a: any) => a && typeof a.id === 'string' && Array.isArray(a.subjects)) : [],
        funds: Array.isArray(j.data.funds) ? j.data.funds.filter((f: any) => f && typeof f.id === 'string') : [],
        attendance: o(j.data.attendance), assessmentResults: o(j.data.assessmentResults),
        assessmentManualPass: o(j.data.assessmentManualPass), assessmentRemarks: o(j.data.assessmentRemarks),
        fundPayments: o(j.data.fundPayments), dailyTests: o(j.data.dailyTests),
      },
    },
    error: '',
  };
}

// ------------------------------------------------------------------ plan / apply

export interface UpdateItem {
  id: string;
  group: 'Attendance' | 'Marks' | 'Funds' | 'Daily test';
  title: string;
  detail: string;
  /** "new" = nothing there yet (ticked); "conflict" = management already has something different (unticked) */
  state: 'new' | 'conflict';
  apply: (d: AppData) => AppData;
}

export interface UpdatePlan {
  items: UpdateItem[];
  /** things already identical on management's side */
  same: number;
  skipped: number;
}

const J = (v: unknown) => JSON.stringify(v);

type Path = string[];
function flatten(o: any, depth: number, path: Path = [], out: Array<{ path: Path; value: any }> = []) {
  if (!o || typeof o !== 'object') return out;
  for (const k of Object.keys(o)) {
    if (depth === 1) out.push({ path: [...path, k], value: o[k] });
    else flatten(o[k], depth - 1, [...path, k], out);
  }
  return out;
}
function getAt(o: any, path: Path): any {
  let c = o;
  for (const k of path) { if (!c || typeof c !== 'object') return undefined; c = c[k]; }
  return c;
}
function setAt<T>(o: T, path: Path, value: any): T {
  const root: any = { ...(o as any) };
  let c = root;
  for (let i = 0; i < path.length - 1; i++) { c[path[i]] = { ...(c[path[i]] || {}) }; c = c[path[i]]; }
  c[path[path.length - 1]] = value;
  return root;
}

export function planTeacherUpdate(mine: AppData, upd: TeacherUpdate): UpdatePlan {
  const items: UpdateItem[] = [];
  let same = 0, skipped = 0;
  const stu = new Map(mine.students.map(s => [s.id, s]));
  // exams / funds the teacher made on their phone (unknown to management yet)
  const newAsm: Assessment[] = upd.data.assessments.filter(a => !mine.assessments.some(x => x.id === a.id));
  const newFunds: Fund[] = upd.data.funds.filter(f => !mine.funds.some(x => x.id === f.id));
  const ensureAsm = (d: AppData, id: string): AppData => {
    const a = newAsm.find(x => x.id === id);
    return a && !d.assessments.some(x => x.id === id) ? { ...d, assessments: [...d.assessments, a] } : d;
  };
  const ensureFund = (d: AppData, id: string): AppData => {
    const f = newFunds.find(x => x.id === id);
    return f && !d.funds.some(x => x.id === id) ? { ...d, funds: [...d.funds, f] } : d;
  };
  newAsm.forEach(a => items.push({
    id: 'newasm:' + a.id, group: 'Marks', title: 'New exam: ' + a.name,
    detail: `${a.subjects.length} subject${a.subjects.length === 1 ? '' : 's'}: ${a.subjects.map(x => x.name).join(', ')}`.slice(0, 120),
    state: 'new', apply: d => ensureAsm(d, a.id),
  }));
  newFunds.forEach(f => items.push({
    id: 'newfund:' + f.id, group: 'Funds', title: 'New fund: ' + f.name,
    detail: `Amount ${f.amount}`, state: 'new', apply: d => ensureFund(d, f.id),
  }));
  const nm = (id: string) => stu.get(id)?.name || id;

  // ---- Attendance: one item per day
  const sortedStatus = (raw: Record<string, any> | undefined) => {
    const out: Record<string, any> = {};
    Object.keys(raw || {}).sort().forEach(id => {
      if (stu.has(id) && raw![id] !== undefined && raw![id] !== '') out[id] = raw![id];
    });
    return out;
  };
  Object.keys(upd.data.attendance).sort().forEach(day => {
    const t = upd.data.attendance[day];
    if (!t || typeof t !== 'object') return;
    const status = sortedStatus(t.status);
    const theirs = { holiday: !!t.holiday, locked: !!t.locked, status };
    const cur = mine.attendance[day];
    if (cur && J({ holiday: !!cur.holiday, locked: !!cur.locked, status: sortedStatus(cur.status) }) === J(theirs)) { same++; return; }
    let a = 0, l = 0;
    Object.values(status).forEach(v => { if (v === 'A') a++; else if (v === 'L') l++; });
    items.push({
      id: 'att:' + day, group: 'Attendance', title: day,
      detail: theirs.holiday ? 'Holiday' : `${a} absent, ${l} leave`,
      state: cur ? 'conflict' : 'new',
      apply: d => ({ ...d, attendance: { ...d.attendance, [day]: theirs } }),
    });
  });

  // ---- generic grouped merge for marks / payments / daily tests
  const grouped = (
    group: UpdateItem['group'], key: 'assessmentResults' | 'fundPayments' | 'dailyTests' | 'assessmentManualPass' | 'assessmentRemarks',
    depth: number, label: (first: string) => string | null,
  ) => {
    const flat = flatten((upd.data as any)[key], depth);
    const byFirst = new Map<string, { adds: typeof flat; diffs: typeof flat }>();
    flat.forEach(e => {
      if (!stu.has(e.path[1])) { skipped++; return; }
      const lbl = label(e.path[0]);
      if (lbl === null) { skipped++; return; }
      const cur = getAt((mine as any)[key], e.path);
      if (cur !== undefined && J(cur) === J(e.value)) { same++; return; }
      const g = byFirst.get(e.path[0]) || { adds: [], diffs: [] };
      (cur === undefined ? g.adds : g.diffs).push(e);
      byFirst.set(e.path[0], g);
    });
    byFirst.forEach((g, first) => {
      const lbl = label(first)!;
      const mk = (list: typeof flat, state: 'new' | 'conflict') => {
        if (!list.length) return;
        const who = Array.from(new Set(list.map(e => nm(e.path[1])))).slice(0, 3).join(', ');
        const more = new Set(list.map(e => e.path[1])).size > 3 ? '…' : '';
        items.push({
          id: `${key}:${first}:${state}`, group, title: lbl,
          detail: state === 'new' ? `${list.length} new: ${who}${more}` : `${list.length} different from yours: ${who}${more}`,
          state,
          apply: d => list.reduce((acc, e) => setAt(acc, [key, ...e.path], e.value) as AppData, key === 'fundPayments' ? ensureFund(d, first) : key === 'dailyTests' ? d : ensureAsm(d, first)),
        });
      };
      mk(g.adds, 'new'); mk(g.diffs, 'conflict');
    });
  };
  const asmName = (id: string) => { const a = mine.assessments.find(x => x.id === id) || newAsm.find(x => x.id === id); return a ? a.name : null; };
  const fundName = (id: string) => { const f = mine.funds.find(x => x.id === id) || newFunds.find(x => x.id === id); return f ? f.name : null; };
  grouped('Marks', 'assessmentResults', 3, asmName);
  grouped('Marks', 'assessmentManualPass', 2, id => { const n = asmName(id); return n === null ? null : n + ' (pass override)'; });
  grouped('Marks', 'assessmentRemarks', 2, id => { const n = asmName(id); return n === null ? null : n + ' (remarks)'; });
  grouped('Funds', 'fundPayments', 2, fundName);
  grouped('Daily test', 'dailyTests', 2, d => d);
  return { items, same, skipped };
}

export function applyTeacherUpdate(mine: AppData, plan: UpdatePlan, chosenIds: Set<string>): AppData {
  const merged = plan.items.filter(i => chosenIds.has(i.id)).reduce((d, i) => i.apply(d), mine);
  return normalizeData(merged);
}

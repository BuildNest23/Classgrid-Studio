// School Excel: all classes in one workbook (one sheet per class) for the principal,
// and a safe way to bring his corrections back. Pure logic (no Excel library here), so it can be tested.
import { AppData, Student } from '../types';
import { getSortedStudents, newId } from '../utils/helpers';
import { nextRollNumber } from '../utils/rollNumbers';
import { cleanPhone } from '../utils/aiExchange';

export interface SchoolClass { key: string; name: string; data: AppData; }
export interface SheetData { name: string; rows: string[][]; }

export const SUMMARY_SHEET = 'Summary';
export const HEADERS = ['Roll No', 'Name', 'Father Name', 'Admission No', 'Phone', 'Address', 'Father Occupation', 'ID (do not change)'];
const KEY_HEADER = 'Key (do not change)';

const s = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
const norm = (v: unknown) => s(v).toLowerCase().replace(/[^a-z0-9]/g, '');

export function safeSheetName(name: string, used: Set<string>): string {
  let base = s(name).replace(/[\[\]:*?\/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 28) || 'Class';
  if (norm(base) === norm(SUMMARY_SHEET)) base = 'Class ' + base;
  let n = base, i = 2;
  while (used.has(n.toLowerCase())) n = `${base.slice(0, 26)} ${i++}`;
  used.add(n.toLowerCase());
  return n;
}

// ------------------------------------------------------------------ export

export interface BuiltSchool {
  summary: SheetData;
  classes: { sheet: SheetData; classKey: string; students: number }[];
}

export function buildSchoolSheets(classes: SchoolClass[], schoolName: string, dateLabel: string): BuiltSchool {
  const used = new Set<string>([SUMMARY_SHEET.toLowerCase()]);
  const out: BuiltSchool['classes'] = [];
  const summaryRows: string[][] = [
    [`${schoolName} - All students`],
    [`Made on ${dateLabel}`],
    ['How to use: each class has its own sheet. Correct any detail, add new students at the bottom, or delete a row to remove a student.'],
    ['Do not change the last column (ID) and do not rename the sheets. Send the file back to the class incharge when done.'],
    [''],
    ['Sheet', 'Class', 'Class incharge', 'Students', KEY_HEADER],
  ];
  classes.forEach(c => {
    const name = safeSheetName(c.name, used);
    const list = getSortedStudents(c.data.students);
    const rows: string[][] = [HEADERS.slice()];
    list.forEach(st => rows.push([
      s(st.rollNo), s(st.name), s(st.fatherName), s(st.admissionNo), s(st.phone), s(st.address), s(st.occupation), st.id,
    ]));
    out.push({ sheet: { name, rows }, classKey: c.key, students: list.length });
    summaryRows.push([name, c.name, c.data.inchargeName || '', String(list.length), c.key]);
  });
  const total = out.reduce((a, b) => a + b.students, 0);
  summaryRows.push(['', 'Total', '', String(total), '']);
  return { summary: { name: SUMMARY_SHEET, rows: summaryRows }, classes: out };
}

// ------------------------------------------------------------------ import

export type ItemKind = 'change' | 'add' | 'remove';

export interface SchoolItem {
  id: string;
  kind: ItemKind;
  title: string;
  detail: string;
  defaultOn: boolean;
}
export interface ClassPlan {
  classKey: string;
  className: string;
  sheetName: string;
  items: SchoolItem[];
  apply: (d: AppData, chosen: Set<string>) => AppData;
}
export interface SchoolPlan {
  classes: ClassPlan[];
  notes: string[];
  same: number;
}

type Field = 'rollNo' | 'name' | 'fatherName' | 'admissionNo' | 'phone' | 'address' | 'occupation' | 'id';
const LABEL: Record<Field, string> = { rollNo: 'Roll', name: 'Name', fatherName: 'Father', admissionNo: 'Adm. no', phone: 'Phone', address: 'Address', occupation: 'Occupation', id: 'ID' };

function fieldOf(h: unknown): Field | null {
  const n = norm(h);
  if (!n) return null;
  if (n.startsWith('id') && !n.startsWith('idcard')) return 'id';
  if (/^(father|guardian|parent)(name)?$/.test(n) || n === 'fathersname') return 'fatherName';
  if (/occupation|profession/.test(n)) return 'occupation';
  if (/admission|admno|regno|registration/.test(n)) return 'admissionNo';
  if (/phone|mobile|contact|cell|whatsapp/.test(n)) return 'phone';
  if (/address/.test(n)) return 'address';
  if (/^(rollno|roll|rollnumber|sr|srno|sno)$/.test(n)) return 'rollNo';
  if (/^(name|studentname|student|fullname|nameofstudent)$/.test(n)) return 'name';
  return null;
}

interface Row { rollNo: string; name: string; fatherName: string; admissionNo: string; phone: string; address: string; occupation: string; id: string; }

function parseClassSheet(rows: string[][]): { rows: Row[]; ok: boolean } {
  const hi = rows.findIndex(r => r.some(c => fieldOf(c) === 'name'));
  if (hi < 0) return { rows: [], ok: false };
  const map: Partial<Record<Field, number>> = {};
  rows[hi].forEach((c, i) => { const f = fieldOf(c); if (f && map[f] === undefined) map[f] = i; });
  const get = (r: string[], f: Field) => (map[f] === undefined ? '' : s(r[map[f]!]));
  const out: Row[] = [];
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every(c => !s(c))) continue;
    out.push({ rollNo: get(r, 'rollNo'), name: get(r, 'name'), fatherName: get(r, 'fatherName'), admissionNo: get(r, 'admissionNo'), phone: get(r, 'phone'), address: get(r, 'address'), occupation: get(r, 'occupation'), id: get(r, 'id') });
  }
  return { rows: out, ok: true };
}

function summaryMap(sheets: SheetData[]): Map<string, string> {
  const m = new Map<string, string>();
  const sm = sheets.find(x => norm(x.name) === norm(SUMMARY_SHEET));
  if (!sm) return m;
  const hi = sm.rows.findIndex(r => r.some(c => norm(c) === 'sheet') && r.some(c => norm(c).startsWith('key')));
  if (hi < 0) return m;
  const si = sm.rows[hi].findIndex(c => norm(c) === 'sheet');
  const ki = sm.rows[hi].findIndex(c => norm(c).startsWith('key'));
  for (let i = hi + 1; i < sm.rows.length; i++) {
    const nm = s(sm.rows[i][si]), key = s(sm.rows[i][ki]);
    if (nm && key) m.set(norm(nm), key);
  }
  return m;
}

const clean = (st: Student): Row => ({ rollNo: s(st.rollNo), name: s(st.name), fatherName: s(st.fatherName), admissionNo: s(st.admissionNo), phone: s(st.phone), address: s(st.address), occupation: s(st.occupation), id: st.id });
const FIELDS: Field[] = ['rollNo', 'name', 'fatherName', 'admissionNo', 'phone', 'address', 'occupation'];
const same = (f: Field, a: string, b: string) => (f === 'phone' ? s(cleanPhone(a)) === s(cleanPhone(b)) : a === b);

function removeEverywhere(d: AppData, id: string): AppData {
  const dropStu = <T,>(o: Record<string, Record<string, T>>) =>
    Object.fromEntries(Object.entries(o || {}).map(([k, m]) => { const { [id]: _x, ...rest } = m || {}; return [k, rest]; }));
  return {
    ...d,
    students: d.students.filter(x => x.id !== id),
    attendance: Object.fromEntries(Object.entries(d.attendance || {}).map(([k, a]) => { const { [id]: _x, ...rest } = a.status || {}; return [k, { ...a, status: rest }]; })),
    assessmentResults: dropStu(d.assessmentResults) as AppData['assessmentResults'],
    assessmentManualPass: dropStu(d.assessmentManualPass) as AppData['assessmentManualPass'],
    assessmentRemarks: dropStu(d.assessmentRemarks) as AppData['assessmentRemarks'],
    fundPayments: dropStu(d.fundPayments) as AppData['fundPayments'],
    dailyTests: dropStu(d.dailyTests) as AppData['dailyTests'],
  };
}

export function planSchoolImport(classes: SchoolClass[], sheets: SheetData[]): SchoolPlan {
  const notes: string[] = [];
  let sameCount = 0;
  const idOwner = new Map<string, string>(); // student id -> class key
  classes.forEach(c => c.data.students.forEach(st => idOwner.set(st.id, c.key)));
  const sMap = summaryMap(sheets);
  const byKey = new Map(classes.map(c => [c.key, c]));
  const seenClass = new Set<string>();
  const plans: ClassPlan[] = [];

  sheets.filter(sh => norm(sh.name) !== norm(SUMMARY_SHEET)).forEach(sh => {
    const parsed = parseClassSheet(sh.rows);
    if (!parsed.ok) { notes.push(`Sheet "${sh.name}": no Name column found, skipped.`); return; }

    // which class is this sheet?
    let cls: SchoolClass | undefined = byKey.get(sMap.get(norm(sh.name)) || '');
    if (!cls) {
      const votes = new Map<string, number>();
      parsed.rows.forEach(r => { const k = idOwner.get(r.id); if (k) votes.set(k, (votes.get(k) || 0) + 1); });
      const top = Array.from(votes.entries()).sort((a, b) => b[1] - a[1])[0];
      if (top) cls = byKey.get(top[0]);
    }
    if (!cls) cls = classes.find(c => norm(c.name) === norm(sh.name));
    if (!cls) { notes.push(`Sheet "${sh.name}" does not match any class on this phone, skipped.`); return; }
    if (seenClass.has(cls.key)) { notes.push(`Two sheets point to "${cls.name}". Only the first was used.`); return; }
    seenClass.add(cls.key);

    const cur = new Map(cls.data.students.map(st => [st.id, st]));
    const items: SchoolItem[] = [];
    const changes = new Map<string, Row>();
    const adds: { id: string; row: Row }[] = [];
    const present = new Set<string>();
    let skipped = 0;

    parsed.rows.forEach((r, idx) => {
      if (!r.name) { skipped++; return; }
      if (r.id && cur.has(r.id)) {
        if (present.has(r.id)) { notes.push(`"${cls!.name}": "${r.name}" appears twice (same ID). The second was ignored.`); return; }
        present.add(r.id);
        const old = clean(cur.get(r.id)!);
        const diffs = FIELDS.filter(f => !same(f, old[f], r[f]));
        if (!diffs.length) { sameCount++; return; }
        changes.set(r.id, r);
        items.push({
          id: `c:${r.id}`, kind: 'change', title: old.name || r.name,
          detail: diffs.map(f => `${LABEL[f]}: ${old[f] || '(empty)'} → ${r[f] || '(empty)'}`).join('; '),
          defaultOn: true,
        });
      } else {
        const from = r.id ? idOwner.get(r.id) : undefined;
        const moved = from && from !== cls!.key ? ` (was in ${byKey.get(from)?.name || 'another class'})` : '';
        adds.push({ id: `a:${idx}`, row: r });
        items.push({ id: `a:${idx}`, kind: 'add', title: r.name, detail: `New student${moved}${r.rollNo ? ', roll ' + r.rollNo : ''}`, defaultOn: true });
      }
    });
    if (skipped) notes.push(`"${cls.name}": ${skipped} row(s) without a name were ignored.`);

    const removed = cls.data.students.filter(st => !present.has(st.id));
    removed.forEach(st => items.push({
      id: `r:${st.id}`, kind: 'remove', title: st.name || '(no name)',
      detail: 'Row deleted in Excel. Ticking this removes the student and all their records.', defaultOn: false,
    }));

    const clsKey = cls.key;
    plans.push({
      classKey: clsKey, className: cls.name, sheetName: sh.name, items,
      apply: (d, chosen) => {
        let out = d;
        // changes
        out = { ...out, students: out.students.map(st => {
          const r = changes.get(st.id);
          if (!r || !chosen.has(`c:${st.id}`)) return st;
          return { ...st, rollNo: r.rollNo, name: r.name, fatherName: r.fatherName, admissionNo: r.admissionNo, phone: s(cleanPhone(r.phone)) || r.phone, address: r.address, occupation: r.occupation };
        }) };
        // additions
        const added: Student[] = [];
        adds.filter(a => chosen.has(a.id)).forEach(a => {
          const roll = a.row.rollNo || nextRollNumber([...out.students, ...added]);
          added.push({ id: newId(), rollNo: roll, name: a.row.name, fatherName: a.row.fatherName, admissionNo: a.row.admissionNo, phone: s(cleanPhone(a.row.phone)) || a.row.phone, address: a.row.address, occupation: a.row.occupation, notes: '', createdAt: Date.now() } as Student);
        });
        if (added.length) out = { ...out, students: [...out.students, ...added] };
        // removals last
        removed.filter(st => chosen.has(`r:${st.id}`)).forEach(st => { out = removeEverywhere(out, st.id); });
        return out;
      },
    });
  });

  classes.filter(c => !seenClass.has(c.key) && c.data.students.length).forEach(c =>
    notes.push(`No sheet was found for "${c.name}". Nothing was changed there.`));
  return { classes: plans, notes, same: sameCount };
}

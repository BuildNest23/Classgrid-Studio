import { Student } from '../types';

/** What to do when the wanted roll number already belongs to someone else. */
export type RollMode = 'plain' | 'swap' | 'blank' | 'insert';

const isNum = (r: string) => /^\d+$/.test(r);

/** Tidies a typed roll number: trims; plain numbers get at least two digits (7 → 07). */
export function formatRoll(raw: string): string {
  const t = String(raw ?? '').trim();
  return isNum(t) ? String(parseInt(t, 10)).padStart(2, '0') : t;
}

const key = (r: string) => {
  const t = String(r ?? '').trim();
  return isNum(t) ? String(parseInt(t, 10)) : t.toLowerCase();
};

export const isBlankRoll = (r?: string) => !String(r ?? '').trim();

/** Next free roll number: highest number in the class + 1. */
export function nextRollNumber(students: Student[]): string {
  let max = 0;
  for (const s of students) {
    const t = String(s.rollNo ?? '').trim();
    if (isNum(t)) max = Math.max(max, parseInt(t, 10));
  }
  return String(max + 1).padStart(2, '0');
}

/** The student who already has this roll number (ignoring `excludeId`), if any. */
export function findRollOwner(students: Student[], excludeId: string | null, roll: string): Student | undefined {
  if (isBlankRoll(roll)) return undefined;
  const k = key(roll);
  return students.find(s => s.id !== excludeId && !isBlankRoll(s.rollNo) && key(s.rollNo) === k);
}

/** Roll order: numbers ascending, other text after them, blanks last. */
export function compareRoll(a: string, b: string): number {
  const ab = isBlankRoll(a), bb = isBlankRoll(b);
  if (ab || bb) return ab === bb ? 0 : ab ? 1 : -1;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

/**
 * Gives one student a new roll number. Nobody else is renumbered, except as the chosen mode says:
 *  plain  – only this student changes (the number must be free)
 *  swap   – the other student takes this student's old roll number
 *  blank  – the other student's roll number is cleared
 *  insert – the other students from that number on move up by one (until the first gap)
 */
export function changeRoll(students: Student[], id: string, newRollRaw: string, mode: RollMode): Student[] {
  const newRoll = formatRoll(newRollRaw);
  const me = students.find(s => s.id === id);
  if (!me) return students;
  const oldRoll = me.rollNo || '';
  const owner = findRollOwner(students, id, newRoll);

  let next = students.map(s => (s.id === id ? { ...s, rollNo: newRoll } : s));
  if (!owner) return next;

  if (mode === 'swap') {
    next = next.map(s => (s.id === owner.id ? { ...s, rollNo: oldRoll } : s));
  } else if (mode === 'blank') {
    next = next.map(s => (s.id === owner.id ? { ...s, rollNo: '' } : s));
  } else if (mode === 'insert') {
    const target = parseInt(newRoll, 10);
    if (!isNaN(target)) {
      const chain = next
        .filter(s => s.id !== id && isNum(String(s.rollNo ?? '').trim()) && parseInt(s.rollNo, 10) >= target)
        .sort((a, b) => parseInt(a.rollNo, 10) - parseInt(b.rollNo, 10));
      const shift = new Set<string>();
      let cur = target;
      for (const s of chain) {
        const r = parseInt(s.rollNo, 10);
        if (r === cur) { shift.add(s.id); cur++; }
        else if (r > cur) break;
      }
      next = next.map(s => (shift.has(s.id) ? { ...s, rollNo: String(parseInt(s.rollNo, 10) + 1).padStart(2, '0') } : s));
    }
  }
  return next;
}

/** Full reset: 01, 02, 03… in the current roll order (blanks go last). Only used when asked. */
export function renumberAll(students: Student[]): Student[] {
  const order = students.slice().sort((a, b) => compareRoll(a.rollNo, b.rollNo));
  const newRoll = new Map(order.map((s, i) => [s.id, String(i + 1).padStart(2, '0')] as const));
  return students.map(s => ({ ...s, rollNo: newRoll.get(s.id)! }));
}

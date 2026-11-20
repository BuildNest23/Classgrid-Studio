// Summaries for the management "Classes" board. Pure functions, no storage access.
import { AppData } from '../types';

export interface BoardRow {
  key: string;
  shelfId: string | null;
  isOpen: boolean;
  name: string;
  teacher: string;
  students: number;
  /** today's attendance: taken | holiday | missing (not received) | empty (no students) */
  att: 'taken' | 'holiday' | 'missing' | 'empty';
  present: number;
  absent: number;
  leave: number;
  lastAttendance: string;
  exams: number;
  incompleteExams: number;
  sentVersion: number;
}

export function summarizeClass(d: AppData, today: string): Omit<BoardRow, 'key' | 'shelfId' | 'isOpen' | 'name'> {
  const students = d.students.length;
  const day = d.attendance[today];
  let att: BoardRow['att'] = 'missing';
  let present = 0, absent = 0, leave = 0;
  if (!students) att = 'empty';
  else if (day) {
    if (day.holiday) att = 'holiday';
    else {
      att = 'taken';
      d.students.forEach(s => {
        const st = day.status?.[s.id] || 'P';
        if (st === 'A') absent++; else if (st === 'L') leave++;
      });
      present = Math.max(0, students - absent - leave);
    }
  }
  const dates = Object.keys(d.attendance).filter(k => !d.attendance[k]?.holiday).sort();
  const incomplete = d.assessments.filter(a => {
    if (!students) return false;
    const res = d.assessmentResults[a.id] || {};
    return d.students.some(s => !res[s.id] || Object.keys(res[s.id]).length === 0);
  }).length;
  return {
    teacher: d.inchargeName || '',
    students, att, present, absent, leave,
    lastAttendance: dates.length ? dates[dates.length - 1] : '',
    exams: d.assessments.length, incompleteExams: incomplete,
    sentVersion: d.packageVersion || 0,
  };
}

export interface BoardTotals {
  classes: number;
  students: number;
  taken: number;
  expected: number;
  present: number;
  counted: number;
  missingNames: string[];
}

export function totalsOf(rows: BoardRow[]): BoardTotals {
  const t: BoardTotals = { classes: rows.length, students: 0, taken: 0, expected: 0, present: 0, counted: 0, missingNames: [] };
  rows.forEach(r => {
    t.students += r.students;
    if (r.att === 'empty' || r.att === 'holiday') return;
    t.expected++;
    if (r.att === 'taken') { t.taken++; t.present += r.present; t.counted += r.present + r.absent; }
    else t.missingNames.push(r.name);
  });
  return t;
}

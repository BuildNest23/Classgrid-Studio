// "Send & Receive": attendance or daily-test sheet for a teacher, and reading it back.
import template from './dayForm.html?raw';
import { AppData } from '../types';
import { getSortedStudents, parseKey } from '../utils/helpers';
import { newRequestId, PrintBundle, ReturnFile } from './collect';
import type { MarksPlan, PlannedMark } from './marks';

export type DailyMode = 'attendance' | 'test';
export interface DailyOptions { mode: DailyMode; dates: string[]; showFather: boolean; note: string }

export const DAILY_TEST_MAX = 10;

const labelOf = (key: string) => {
  try { return parseKey(key).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }); } catch { return key; }
};

const currentOf = (data: AppData, mode: DailyMode, date: string, sid: string): string => {
  if (mode === 'attendance') return String(data.attendance?.[date]?.status?.[sid] ?? '');
  const v = data.dailyTests?.[date]?.[sid];
  return v === undefined || v === null ? '' : String(v);
};

export function buildDailyFile(data: AppData, opts: DailyOptions, requestId = newRequestId(), print?: PrintBundle) {
  const dates = Array.from(new Set(opts.dates.filter(Boolean))).sort();
  if (!dates.length) throw new Error('Pick at least one date.');
  const dateInfo = dates.map(k => ({
    key: k, label: labelOf(k),
    holiday: opts.mode === 'attendance' && !!data.attendance?.[k]?.holiday,
    locked: opts.mode === 'attendance' && !!data.attendance?.[k]?.locked,
  }));
  const students = getSortedStudents(data.students).map(s => {
    const o: Record<string, string> = { id: s.id, rollNo: s.rollNo || '', name: s.name || '' };
    if (opts.showFather) o.fatherName = s.fatherName || '';
    dates.forEach(k => { o[k] = currentOf(data, opts.mode, k, s.id); });
    return o;
  });
  const fields: Record<string, string> = {};
  dates.forEach(k => { fields[k] = 'edit'; });
  const cfg = {
    app: 'classgrid-collect', v: 1, kind: 'daily', mode: opts.mode, requestId, createdAt: Date.now(),
    schoolName: data.schoolName || '', className: data.className || '', inchargeName: data.inchargeName || '',
    academicYear: data.academicYear || '', logo: data.schoolLogo || '', note: opts.note.trim(),
    dates: dateInfo, showFather: opts.showFather, testMax: DAILY_TEST_MAX, fields, print: print || null, students,
  };
  const json = JSON.stringify(cfg).replace(/</g, '\\u003c');
  const re = /<script id="cg-config" type="application\/json">[\s\S]*?<\/script>/;
  if (!re.test(template)) throw new Error('Template is missing its data tag.');
  const html = template.replace(re, () => '<script id="cg-config" type="application/json">' + json + '</' + 'script>');
  return { html, requestId, count: students.length, fields, dates, mode: opts.mode };
}

export function planDailyReturn(data: AppData, ret: ReturnFile): MarksPlan {
  const mode: DailyMode = ret.mode === 'test' ? 'test' : 'attendance';
  const plan: MarksPlan = { assessment: null, changes: [], missing: 0, alreadySame: 0, daily: mode };
  const students = new Map(data.students.map(s => [s.id, s]));
  Object.keys(ret.changes || {}).forEach(id => {
    const s = students.get(id);
    const rows = ret.changes[id] || {};
    if (!s) { plan.missing += Object.keys(rows).length; return; }
    Object.keys(rows).forEach(date => {
      let to = String(rows[date].to ?? '').trim().toUpperCase();
      const from = String(rows[date].from ?? '');
      const current = currentOf(data, mode, date, id);
      if (current === to) { plan.alreadySame++; return; }
      const c: PlannedMark = {
        key: id + ':' + date, studentId: id, studentName: s.name || '(no name)', roll: s.rollNo || '',
        subId: date, subName: labelOf(date), max: 0, to, current, from, conflict: current !== from,
      };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) c.invalid = 'Not a valid date';
      else if (mode === 'attendance') {
        const day = data.attendance?.[date];
        if (day?.locked) c.invalid = 'This day is locked in Attendance.';
        else if (day?.holiday) c.invalid = 'This day is marked as a holiday.';
        else if (to !== '' && to !== 'P' && to !== 'A' && to !== 'L') c.invalid = 'Not a valid status';
      } else if (to !== '' && to !== 'A') {
        const n = Number(to.replace(',', '.'));
        if (!/^\d+([.,]\d+)?$/.test(to) || !isFinite(n)) c.invalid = 'Not a valid mark';
        else if (n > DAILY_TEST_MAX) c.invalid = `More than the maximum (${DAILY_TEST_MAX})`;
        else c.to = String(n);
      }
      plan.changes.push(c);
    });
  });
  const order = new Map(getSortedStudents(data.students).map((s, i) => [s.id, i]));
  plan.changes.sort((a, b) => a.subId.localeCompare(b.subId) || (order.get(a.studentId) ?? 0) - (order.get(b.studentId) ?? 0));
  return plan;
}

export function applyDaily(data: AppData, mode: DailyMode, chosen: PlannedMark[]): AppData {
  if (mode === 'attendance') {
    const att = { ...data.attendance };
    chosen.forEach(c => {
      const day = att[c.subId] || { holiday: false, locked: false, status: {} };
      const status = { ...day.status };
      if (c.to === '') delete status[c.studentId]; else status[c.studentId] = c.to as 'P' | 'A' | 'L';
      att[c.subId] = { ...day, status };
    });
    return { ...data, attendance: att };
  }
  const tests = { ...data.dailyTests };
  chosen.forEach(c => {
    const day = { ...(tests[c.subId] || {}) };
    if (c.to === '') delete day[c.studentId]; else day[c.studentId] = c.to === 'A' ? 'A' : Number(c.to);
    tests[c.subId] = day;
  });
  return { ...data, dailyTests: tests };
}

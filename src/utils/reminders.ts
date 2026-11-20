// Reminders: BUILT BUT SWITCHED OFF (REMINDERS_AVAILABLE=false in appMode.ts).
// Pure planning logic only. To enable later: install @capacitor/local-notifications,
// schedule the texts returned by dueReminders(), and turn the flag on.
import { BoardRow } from './schoolBoard';

export interface ReminderConfig {
  enabled: boolean;
  /** "HH:MM" local time the reminder fires on school days */
  time: string;
  /** days of week to remind, 0 = Sunday */
  days: number[];
}

export const DEFAULT_REMINDERS: ReminderConfig = { enabled: false, time: '09:30', days: [1, 2, 3, 4, 5, 6] };

export function parseTime(t: string): { h: number; m: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t || '');
  const h = m ? Math.min(23, +m[1]) : 9, mi = m ? Math.min(59, +m[2]) : 30;
  return { h, m: mi };
}

/** Teacher side: should we nag now? */
export function teacherDue(cfg: ReminderConfig, now: Date, attendanceTaken: boolean, hasStudents: boolean): boolean {
  if (!cfg.enabled || attendanceTaken || !hasStudents) return false;
  if (!cfg.days.includes(now.getDay())) return false;
  const { h, m } = parseTime(cfg.time);
  return now.getHours() * 60 + now.getMinutes() >= h * 60 + m;
}

/** Management side: classes still missing today's attendance. */
export function managementDue(cfg: ReminderConfig, now: Date, rows: BoardRow[]): string[] {
  if (!cfg.enabled || !cfg.days.includes(now.getDay())) return [];
  const { h, m } = parseTime(cfg.time);
  if (now.getHours() * 60 + now.getMinutes() < h * 60 + m) return [];
  return rows.filter(r => r.att === 'missing').map(r => r.name);
}

export function reminderText(missing: string[]): string {
  if (!missing.length) return '';
  return missing.length === 1 ? `Attendance not received yet: ${missing[0]}` : `Attendance not received yet: ${missing.join(', ')}`;
}

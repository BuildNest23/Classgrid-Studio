// App mode: "teacher" (attendance + marks of one class) or "management" (many classes).
// Stored on this device only. Management can be protected by a PIN.

export type AppMode = 'teacher' | 'management';

const MODE_KEY = 'classgridMode';
const PIN_KEY = 'classgridMgmtPin';

/** Reminders are built but switched off. Set true later to enable (shown as greyed tile in management Settings). */
export const REMINDERS_AVAILABLE = false;

export function getMode(): AppMode | null {
  try {
    const v = localStorage.getItem(MODE_KEY);
    return v === 'teacher' || v === 'management' ? v : null;
  } catch { return null; }
}

export function setMode(m: AppMode) {
  try { localStorage.setItem(MODE_KEY, m); } catch { /* ignore */ }
}

/** Existing users (already have saved classes) keep today's behaviour = management. */
export function defaultModeForExisting(): AppMode { return 'management'; }

// ---- PIN (4–8 digits). Simple salted hash: keeps casual eyes out, not a vault. ----
function hash(pin: string, salt: string): string {
  let h1 = 0x811c9dc5, h2 = 0x1b873593;
  const s = salt + ':' + pin + ':' + salt;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 + c, 2246822519) >>> 0;
    h2 ^= h2 >>> 13;
  }
  return h1.toString(36) + h2.toString(36);
}

export function isValidPin(pin: string): boolean { return /^\d{4,8}$/.test(pin); }

export function hasPin(): boolean {
  try { return !!localStorage.getItem(PIN_KEY); } catch { return false; }
}

export function setPin(pin: string): boolean {
  if (!isValidPin(pin)) return false;
  const salt = Math.random().toString(36).slice(2, 10);
  try { localStorage.setItem(PIN_KEY, salt + '$' + hash(pin, salt)); return true; } catch { return false; }
}

export function verifyPin(pin: string): boolean {
  try {
    const v = localStorage.getItem(PIN_KEY);
    if (!v) return true;
    const i = v.indexOf('$');
    return hash(pin, v.slice(0, i)) === v.slice(i + 1);
  } catch { return false; }
}

export function clearPin() { try { localStorage.removeItem(PIN_KEY); } catch { /* ignore */ } }

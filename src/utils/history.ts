// Restore points: a copy of a class is kept automatically before a file changes it.
// Stored like the class shelf (SQLite on Android, localStorage on web). Newest 8 are kept.
import { AppData } from '../types';
import { getStorage } from '../storage';
import { normalizeData } from './migrate';

const INDEX_KEY = 'classgridHistoryIndex';
const KEY = (id: string) => `classgridHistory:${id}`;
const MAX = 8;

export interface Snapshot {
  id: string;
  at: number;
  reason: string;
  classId: string;
  className: string;
  students: number;
}

async function readIndex(): Promise<Snapshot[]> {
  try {
    const raw = await (await getStorage()).getItem(INDEX_KEY);
    const p = raw ? JSON.parse(raw) : [];
    return Array.isArray(p) ? p.filter(e => e && typeof e.id === 'string') : [];
  } catch { return []; }
}

/** Never throws: a failed snapshot must not block the real work, but the caller can see it failed. */
export async function addSnapshot(d: AppData, reason: string): Promise<boolean> {
  try {
    const storage = await getStorage();
    const id = 'h_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    const { schoolLogo: _l, ...rest } = d;
    await storage.setItem(KEY(id), JSON.stringify(rest));
    const entry: Snapshot = { id, at: Date.now(), reason, classId: d.classId || '', className: d.className || '', students: d.students.length };
    const all = [entry, ...(await readIndex())];
    const keep = all.slice(0, MAX);
    await storage.setItem(INDEX_KEY, JSON.stringify(keep));
    for (const old of all.slice(MAX)) { try { await storage.removeItem(KEY(old.id)); } catch { /* ignore */ } }
    return true;
  } catch { return false; }
}

/** Snapshots of the given class (by classId; a class with no id sees the ones without an id). */
export async function listSnapshots(classId: string | undefined): Promise<Snapshot[]> {
  return (await readIndex()).filter(s => s.classId === (classId || ''));
}

export async function loadSnapshot(id: string): Promise<AppData | null> {
  try {
    const raw = await (await getStorage()).getItem(KEY(id));
    return raw ? normalizeData(JSON.parse(raw)) : null;
  } catch { return null; }
}

import { AppData } from '../types';
import { getStorage } from '../storage';
import { makeBaseData, normalizeData } from './migrate';

/**
 * "Classes shelf": saved copies of whole classes, kept in the same storage the app uses
 * (SQLite on Android, localStorage on web). It is separate from the one class that is open.
 *
 *   classgridShelfIndex      -> JSON list of small summaries (name, date, counts)
 *   classgridShelf:<id>      -> JSON of one class (AppData without the school logo)
 *
 * One key per class means a problem with one class can never take the others with it.
 * The school logo is not stored per class (it is large and shared); it is kept from the
 * class that is currently open.
 */

const INDEX_KEY = 'classgridShelfIndex';
const CLASS_KEY = (id: string) => `classgridShelf:${id}`;
const ACTIVE_ID_KEY = 'classgridActiveShelfId';

export interface ShelfEntry {
  id: string;
  name: string;
  savedAt: number;
  incharge: string;
  academicYear: string;
  students: number;
}

function newId(): string {
  return 'cls_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

/** True when the open class has nothing worth saving (fresh / just reset). */
export function isBlankClass(d: AppData): boolean {
  return (
    d.students.length === 0 &&
    d.assessments.length === 0 &&
    d.funds.length === 0 &&
    Object.keys(d.attendance).length === 0 &&
    Object.keys(d.dailyTests).length === 0
  );
}

export function defaultClassName(d: AppData): string {
  const cls = (d.className || '').trim();
  const sec = (d.section || '').trim();
  if (cls && sec) return `${cls} - ${sec}`;
  return cls || sec || 'Untitled class';
}

// ---- which card the open class belongs to (device-local, not part of the records) ----
export function getActiveShelfId(): string | null {
  try { return window.localStorage.getItem(ACTIVE_ID_KEY); } catch { return null; }
}
export function setActiveShelfId(id: string | null): void {
  try {
    if (id) window.localStorage.setItem(ACTIVE_ID_KEY, id);
    else window.localStorage.removeItem(ACTIVE_ID_KEY);
  } catch { /* ignore */ }
}

async function readIndex(): Promise<ShelfEntry[]> {
  const storage = await getStorage();
  const raw = await storage.getItem(INDEX_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(e => e && typeof e.id === 'string');
  } catch {
    return [];
  }
}

async function writeVerified(key: string, value: string): Promise<void> {
  const storage = await getStorage();
  await storage.setItem(key, value);
  // WebStorage swallows write errors (e.g. storage full), so read it back to be sure.
  const back = await storage.getItem(key);
  if (back !== value) throw new Error('Device storage could not save this class (it may be full).');
}

export async function listShelf(): Promise<ShelfEntry[]> {
  const list = await readIndex();
  return list.sort((a, b) => b.savedAt - a.savedAt);
}

function summarize(id: string, name: string, d: AppData, savedAt: number): ShelfEntry {
  return {
    id,
    name,
    savedAt,
    incharge: d.inchargeName || '',
    academicYear: d.academicYear || '',
    students: d.students.length
  };
}

/**
 * Saves a class onto the shelf. With `id` it updates that card (keeping its name unless a
 * new one is given); without it a new card is created. Returns the card.
 */
export async function saveToShelf(
  d: AppData,
  opts: { id?: string | null; name?: string } = {}
): Promise<ShelfEntry> {
  const index = await readIndex();
  const existing = opts.id ? index.find(e => e.id === opts.id) : undefined;
  // A given id that is not on the shelf yet is reused (keeps re-imported classes from duplicating).
  const id = existing ? existing.id : opts.id || newId();
  const name = (opts.name || existing?.name || defaultClassName(d)).trim() || 'Untitled class';
  const now = Date.now();

  const { schoolLogo: _logo, ...withoutLogo } = d;
  await writeVerified(CLASS_KEY(id), JSON.stringify(withoutLogo));

  const entry = summarize(id, name, d, now);
  const nextIndex = [...index.filter(e => e.id !== id), entry];
  await writeVerified(INDEX_KEY, JSON.stringify(nextIndex));
  return entry;
}

/** Loads one saved class (normalized). Returns null if it is missing or unreadable. */
export async function loadFromShelf(id: string): Promise<AppData | null> {
  const storage = await getStorage();
  const raw = await storage.getItem(CLASS_KEY(id));
  if (!raw) return null;
  try {
    return normalizeData(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function renameShelfEntry(id: string, name: string): Promise<void> {
  const index = await readIndex();
  const next = index.map(e => (e.id === id ? { ...e, name: name.trim() || e.name } : e));
  await writeVerified(INDEX_KEY, JSON.stringify(next));
}

export async function deleteFromShelf(id: string): Promise<void> {
  const storage = await getStorage();
  const index = await readIndex();
  await writeVerified(INDEX_KEY, JSON.stringify(index.filter(e => e.id !== id)));
  await storage.removeItem(CLASS_KEY(id));
}

/** Everything needed to bring one card back after Delete. */
export async function readShelfRaw(id: string): Promise<{ entry: ShelfEntry; data: AppData } | null> {
  const index = await readIndex();
  const entry = index.find(e => e.id === id);
  const data = await loadFromShelf(id);
  if (!entry || !data) return null;
  return { entry, data };
}

export async function restoreShelfRaw(entry: ShelfEntry, data: AppData): Promise<void> {
  await saveToShelf(data, { id: entry.id, name: entry.name });
}

/**
 * Adds classes from a file the user picked: a single class backup (what Export Backup makes)
 * or a "back up all classes" file. Returns how many cards were added.
 */
export async function importIntoShelf(parsed: unknown): Promise<number> {
  const p = parsed as any;
  const added: Array<{ name?: string; data: unknown }> = [];

  if (p && p.app === 'ClassGridShelf' && Array.isArray(p.classes)) {
    for (const c of p.classes) if (c && c.data) added.push({ name: c.name, data: c.data });
  } else if (p && p.data && typeof p.data === 'object') {
    added.push({ data: p.data }); // regular Export Backup file (the open class)
    if (Array.isArray(p.classes)) {
      for (const c of p.classes) if (c && c.data) added.push({ name: c.name, data: c.data });
    }
  } else if (p && typeof p === 'object' && Array.isArray(p.students)) {
    added.push({ data: p }); // bare data
  }
  if (added.length === 0) throw new Error('This file is not a ClassGrid backup.');

  for (const c of added) {
    const data = normalizeData(c.data);
    await saveToShelf(data, { name: c.name });
  }
  return added.length;
}

/** Builds the "back up all classes" payload. */
export async function buildShelfBackup(): Promise<{ app: 'ClassGridShelf'; version: 1; exportedAt: string; classes: Array<{ name: string; data: AppData }> }> {
  const index = await listShelf();
  const classes: Array<{ name: string; data: AppData }> = [];
  for (const e of index) {
    const data = await loadFromShelf(e.id);
    if (data) classes.push({ name: e.name, data });
  }
  return { app: 'ClassGridShelf', version: 1, exportedAt: new Date().toISOString(), classes };
}

/**
 * The data for a brand-new class. When `keepSchool` is true the school-level details stay
 * (name, EMIS code, year, logo, print preferences); everything class-specific starts empty.
 */
export function makeNewClassData(current: AppData, keepSchool: boolean): AppData {
  const fresh = makeBaseData();
  if (!keepSchool) return fresh;
  return {
    ...fresh,
    schoolName: current.schoolName,
    emisCode: current.emisCode,
    academicYear: current.academicYear,
    schoolLogo: current.schoolLogo,
    printSize: current.printSize,
    printNote: current.printNote,
    forceOrientation: current.forceOrientation
  };
}

/** All saved classes with their ids, for the main backup file. */
export async function exportAllClasses(current?: AppData): Promise<Array<{ id: string; name: string; data: AppData }>> {
  const index = await listShelf();
  const activeId = getActiveShelfId();
  const out: Array<{ id: string; name: string; data: AppData }> = [];
  for (const e of index) {
    // The open class is the live copy: its saved card may be older (edits made after the last "Save"),
    // so the backup uses the live data for that card instead of the stale snapshot.
    if (current && e.id === activeId) {
      const { schoolLogo: _logo, ...withoutLogo } = current;
      out.push({ id: e.id, name: e.name, data: withoutLogo as AppData });
      continue;
    }
    const data = await loadFromShelf(e.id);
    if (data) out.push({ id: e.id, name: e.name, data });
  }
  return out;
}

/** Puts classes from a main backup file back on the shelf (same id = updated, not duplicated). */
export async function restoreClasses(list: unknown): Promise<number> {
  if (!Array.isArray(list)) return 0;
  let n = 0;
  for (const c of list) {
    if (!c || typeof c !== 'object' || !(c as any).data) continue;
    const data = normalizeData((c as any).data);
    const id = typeof (c as any).id === 'string' ? (c as any).id : undefined;
    await saveToShelf(data, { id, name: typeof (c as any).name === 'string' ? (c as any).name : undefined });
    n++;
  }
  return n;
}

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
const ORDERED_KEY = 'classgridShelfOrdered'; // set once the index list is the user's own order

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
    const list: ShelfEntry[] = parsed.filter(e => e && typeof e.id === 'string');
    // One-time: until now the list was shown newest-first. Keep that as the starting order.
    if (await storage.getItem(ORDERED_KEY) !== '1') {
      list.sort((a, b) => b.savedAt - a.savedAt);
      try {
        await storage.setItem(INDEX_KEY, JSON.stringify(list));
        await storage.setItem(ORDERED_KEY, '1');
      } catch { /* order is still right in memory */ }
    }
    return list;
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
  // The saved order IS the display order (the user can move classes up and down).
  return readIndex();
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
  // An existing class keeps its place; a new class goes to the top.
  const nextIndex = existing ? index.map(e => (e.id === id ? entry : e)) : [entry, ...index];
  await writeVerified(INDEX_KEY, JSON.stringify(nextIndex));
  try { (await getStorage()).setItem(ORDERED_KEY, '1'); } catch { /* ignore */ }
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

/** Moves one class a step up (-1) or down (+1) in the Classes tab. */
export async function moveShelfEntry(id: string, step: -1 | 1): Promise<void> {
  const index = await readIndex();
  const i = index.findIndex(e => e.id === id);
  const j = i + step;
  if (i < 0 || j < 0 || j >= index.length) return;
  const next = index.slice();
  [next[i], next[j]] = [next[j], next[i]];
  await writeVerified(INDEX_KEY, JSON.stringify(next));
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
export async function readShelfRaw(id: string): Promise<{ entry: ShelfEntry; data: AppData; position: number } | null> {
  const index = await readIndex();
  const entry = index.find(e => e.id === id);
  const data = await loadFromShelf(id);
  if (!entry || !data) return null;
  return { entry, data, position: index.findIndex(e => e.id === id) };
}

export async function restoreShelfRaw(entry: ShelfEntry, data: AppData, position?: number): Promise<void> {
  await saveToShelf(data, { id: entry.id, name: entry.name });
  if (position === undefined || position < 0) return;
  // put it back where it was
  const index = await readIndex();
  const rest = index.filter(e => e.id !== entry.id);
  const me = index.find(e => e.id === entry.id);
  if (!me) return;
  rest.splice(Math.min(position, rest.length), 0, me);
  await writeVerified(INDEX_KEY, JSON.stringify(rest));
}

function normText(v: unknown): string {
  return typeof v === 'string' ? v.trim().toLowerCase() : '';
}

/**
 * Returns true when two normalized AppData objects represent the same class
 * (used to avoid duplicating the active class when restoring or importing older backups
 * whose shelf id was missing or unlinked).
 */
export function isSameClassData(a: AppData, b: AppData): boolean {
  if (a.classId && b.classId) {
    return a.classId === b.classId;
  }

  const sameClass =
    normText(a.className) === normText(b.className) &&
    normText(a.section) === normText(b.section) &&
    normText(a.academicYear) === normText(b.academicYear);

  if (!sameClass) return false;

  const aStudentIds = new Set(a.students.map(s => s.id).filter(Boolean));
  const bStudentIds = new Set(b.students.map(s => s.id).filter(Boolean));

  if (aStudentIds.size > 0 && bStudentIds.size > 0) {
    let overlap = 0;
    for (const id of aStudentIds) {
      if (bStudentIds.has(id)) overlap++;
    }
    const minCount = Math.min(aStudentIds.size, bStudentIds.size);
    return overlap >= Math.max(1, Math.ceil(minCount * 0.6));
  }

  if (aStudentIds.size === 0 && bStudentIds.size === 0) {
    // Both have no students: require a non-empty class name and matching incharge
    if (!normText(a.className) && !normText(a.section)) return false;
    if (normText(a.inchargeName) !== normText(b.inchargeName)) return false;

    const aAsmtIds = new Set(a.assessments.map(x => x.id).filter(Boolean));
    const bAsmtIds = new Set(b.assessments.map(x => x.id).filter(Boolean));
    if (aAsmtIds.size > 0 && bAsmtIds.size > 0) {
      for (const id of aAsmtIds) if (bAsmtIds.has(id)) return true;
      return false;
    }
    return true;
  }

  return false;
}

/** Finds an existing shelf entry matching `target` by class identity & student overlap. */
export async function findMatchingShelfId(target: AppData): Promise<string | null> {
  if (isBlankClass(target)) return null;
  const index = await readIndex();
  for (const e of index) {
    const saved = await loadFromShelf(e.id);
    if (saved && isSameClassData(target, saved)) {
      return e.id;
    }
  }
  return null;
}

/**
 * Ensures the restored open class is linked to its matching shelf card (by explicit id or
 * by class content match) so it never appears twice in Classes / Overview / Switcher.
 */
export async function resolveRestoredActiveId(
  openData: AppData,
  explicitClassId?: string | null
): Promise<string | null> {
  const index = await readIndex();
  const cleanId = typeof explicitClassId === 'string' && explicitClassId.trim() ? explicitClassId.trim() : null;

  if (cleanId && index.some(e => e.id === cleanId)) {
    // Sync the shelf card with the restored open class so both copies stay identical
    await saveToShelf(openData, { id: cleanId });
    return cleanId;
  }

  if (!isBlankClass(openData)) {
    const matchedId = await findMatchingShelfId(openData);
    if (matchedId) {
      await saveToShelf(openData, { id: matchedId });
      return matchedId;
    }
  }

  return null;
}

interface ImportCandidate {
  id?: string;
  name?: string;
  data: AppData;
}

function deduplicateCandidates(list: ImportCandidate[]): ImportCandidate[] {
  const unique: ImportCandidate[] = [];
  for (const cand of list) {
    const byId = cand.id ? unique.findIndex(u => u.id === cand.id) : -1;
    if (byId >= 0) {
      unique[byId] = {
        id: unique[byId].id || cand.id,
        name: cand.name || unique[byId].name,
        data: cand.data,
      };
      continue;
    }
    const byData = unique.findIndex(u => isSameClassData(u.data, cand.data));
    if (byData >= 0) {
      unique[byData] = {
        id: unique[byData].id || cand.id,
        name: unique[byData].name || cand.name,
        data: cand.data,
      };
      continue;
    }
    unique.push(cand);
  }
  return unique;
}

/**
 * Adds classes from a file the user picked: a single class backup (what Export Backup makes)
 * or a "back up all classes" file. Deduplicates the open class against `classes` and against
 * existing shelf cards so importing a backup never creates duplicate classes.
 */
export async function importIntoShelf(
  parsed: unknown,
  currentOpen?: AppData
): Promise<{ added: number; updated: number }> {
  const p = parsed as any;
  const rawFound: ImportCandidate[] = [];
  const idOf = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

  if (p && p.app === 'ClassGridShelf' && Array.isArray(p.classes)) {
    for (const c of p.classes) {
      if (c && c.data) {
        rawFound.push({ id: idOf(c.id), name: typeof c.name === 'string' ? c.name : undefined, data: normalizeData(c.data) });
      }
    }
  } else if (p && p.data && typeof p.data === 'object') {
    // Load `classes` first so their custom shelf names and ids are preserved, then merge `p.data`
    if (Array.isArray(p.classes)) {
      for (const c of p.classes) {
        if (c && c.data) {
          rawFound.push({ id: idOf(c.id), name: typeof c.name === 'string' ? c.name : undefined, data: normalizeData(c.data) });
        }
      }
    }
    const openNorm = normalizeData(p.data);
    const openId = idOf(p.classId);
    if (!isBlankClass(openNorm) || rawFound.length === 0) {
      rawFound.push({ id: openId, data: openNorm });
    }
  } else if (p && typeof p === 'object' && Array.isArray(p.students)) {
    rawFound.push({ data: normalizeData(p) }); // bare data
  }

  const found = deduplicateCandidates(rawFound);
  if (found.length === 0) throw new Error('This file is not a ClassGrid backup.');

  // Load current shelf entries once so we can match both by id and by class content
  const currentIndex = await readIndex();
  const existingEntries: Array<{ id: string; data: AppData | null }> = [];
  for (const e of currentIndex) {
    existingEntries.push({ id: e.id, data: await loadFromShelf(e.id) });
  }
  const existingIds = new Set(existingEntries.map(e => e.id));

  let added = 0;
  let updated = 0;

  // Iterate in reverse so newly added classes preserve their order from the backup file
  for (let i = found.length - 1; i >= 0; i--) {
    const c = found[i];
    let targetId = c.id;

    if (!targetId || !existingIds.has(targetId)) {
      const contentMatch = existingEntries.find(e => e.data && isSameClassData(c.data, e.data));
      if (contentMatch) {
        targetId = contentMatch.id;
      }
    }

    if (targetId && existingIds.has(targetId)) {
      updated++;
    } else {
      added++;
    }

    const entry = await saveToShelf(c.data, { id: targetId, name: c.name });
    existingIds.add(entry.id);
    const existingSlot = existingEntries.find(e => e.id === entry.id);
    if (existingSlot) existingSlot.data = c.data;
    else existingEntries.push({ id: entry.id, data: c.data });
  }

  // If the currently open class was unshelved (activeShelfId === null) and now matches a shelf card,
  // link it so it does not appear twice in Overview / Class Switcher.
  if (currentOpen && !isBlankClass(currentOpen)) {
    const activeId = getActiveShelfId();
    const activeStillExists = Boolean(activeId && existingIds.has(activeId));
    if (!activeStillExists) {
      const matched = existingEntries.find(e => e.data && isSameClassData(currentOpen, e.data));
      if (matched) setActiveShelfId(matched.id);
    }
  }

  return { added, updated };
}

/** Builds the "back up all classes" payload. */
export async function buildShelfBackup(): Promise<{ app: 'ClassGridShelf'; version: 1; exportedAt: string; classes: Array<{ id: string; name: string; data: AppData }> }> {
  const index = await listShelf();
  const classes: Array<{ id: string; name: string; data: AppData }> = [];
  for (const e of index) {
    const data = await loadFromShelf(e.id);
    if (data) classes.push({ id: e.id, name: e.name, data });
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
    sessionDisplay: current.sessionDisplay,
    schoolLogo: current.schoolLogo,
    printSize: current.printSize,
    printNote: current.printNote,
    forceOrientation: current.forceOrientation
  };
}

/** All saved classes with their ids, for the main backup file. */
export async function exportAllClasses(current?: AppData): Promise<Array<{ id: string; name: string; data: AppData }>> {
  const index = await listShelf();
  let activeId = getActiveShelfId();
  if ((!activeId || !index.some(e => e.id === activeId)) && current && !isBlankClass(current)) {
    activeId = await findMatchingShelfId(current);
  }
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

/** Puts classes from a main backup file back on the shelf (same id or same class = updated, not duplicated). */
export async function restoreClasses(list: unknown): Promise<number> {
  if (!Array.isArray(list)) return 0;
  const raw: ImportCandidate[] = [];
  for (const c of list) {
    if (!c || typeof c !== 'object' || !(c as any).data) continue;
    const id = typeof (c as any).id === 'string' && (c as any).id.trim() ? (c as any).id.trim() : undefined;
    const name = typeof (c as any).name === 'string' ? (c as any).name : undefined;
    raw.push({ id, name, data: normalizeData((c as any).data) });
  }
  const unique = deduplicateCandidates(raw);

  // Match against existing shelf so older/unlinked cards are updated in place instead of duplicated
  const currentIndex = await readIndex();
  const existingEntries: Array<{ id: string; data: AppData | null }> = [];
  for (const e of currentIndex) {
    existingEntries.push({ id: e.id, data: await loadFromShelf(e.id) });
  }
  const existingIds = new Set(existingEntries.map(e => e.id));

  let n = 0;
  for (let i = unique.length - 1; i >= 0; i--) {
    const c = unique[i];
    let targetId = c.id;
    if (!targetId || !existingIds.has(targetId)) {
      const contentMatch = existingEntries.find(e => e.data && isSameClassData(c.data, e.data));
      if (contentMatch) targetId = contentMatch.id;
    }
    const entry = await saveToShelf(c.data, { id: targetId, name: c.name });
    existingIds.add(entry.id);
    const slot = existingEntries.find(e => e.id === entry.id);
    if (slot) slot.data = c.data;
    else existingEntries.push({ id: entry.id, data: c.data });
    n++;
  }
  return n;
}


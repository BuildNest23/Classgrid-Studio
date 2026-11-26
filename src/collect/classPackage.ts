// Class package: one file that carries a whole class from management to a class teacher.
// kind "classgrid-class", v1. Management sends it (first time = "full", later = "update").
import { AppData } from '../types';
import { normalizeData } from '../utils/migrate';

export const CLASS_KIND = 'classgrid-class';
export const CLASS_VERSION = 1;

export interface ClassPackage {
  app: 'Classgrid';
  kind: typeof CLASS_KIND;
  v: number;
  classId: string;
  /** increases every time management sends this class */
  version: number;
  mode: 'full' | 'update';
  createdAt: number;
  from: string;
  data: Partial<AppData>;
}

function newClassId(): string {
  return 'cid_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

/** Make sure the class has an id. Returns the id (and the data to save if it was new). */
export function ensureClassId(data: AppData): { classId: string; data: AppData; created: boolean } {
  if (data.classId) return { classId: data.classId, data, created: false };
  const classId = newClassId();
  return { classId, data: { ...data, classId }, created: true };
}

export function buildClassPackage(
  data: AppData,
  opts: { mode: 'full' | 'update'; version: number; from?: string }
): ClassPackage {
  const { classId } = ensureClassId(data);
  const d: Partial<AppData> = {
    schoolName: data.schoolName, emisCode: data.emisCode, section: data.section,
    academicYear: data.academicYear, sessionDisplay: data.sessionDisplay,
    className: data.className, inchargeName: data.inchargeName, schoolLogo: data.schoolLogo,
    printSize: data.printSize, printNote: data.printNote, forceOrientation: data.forceOrientation,
    students: data.students, assessments: data.assessments, funds: data.funds,
  };
  if (opts.mode === 'full') {
    d.attendance = data.attendance;
    d.assessmentResults = data.assessmentResults;
    d.assessmentManualPass = data.assessmentManualPass;
    d.assessmentRemarks = data.assessmentRemarks;
    d.fundPayments = data.fundPayments;
    d.dailyTests = data.dailyTests;
  }
  return {
    app: 'Classgrid', kind: CLASS_KIND, v: CLASS_VERSION, classId,
    version: opts.version, mode: opts.mode, createdAt: Date.now(),
    from: opts.from || data.inchargeName || '', data: d,
  };
}

export function serializeClassPackage(p: ClassPackage): string { return JSON.stringify(p); }

export function suggestedFileName(p: ClassPackage): string {
  const n = (p.data.className || 'class').replace(/[^\w\-]+/g, '_').replace(/^_+|_+$/g, '') || 'class';
  return `Classgrid_${n}.json`;
}

export function parseClassPackage(text: string): { pkg: ClassPackage | null; error: string } {
  let j: any;
  try { j = JSON.parse(text); } catch { return { pkg: null, error: 'This is not a Classgrid class file.' }; }
  if (!j || typeof j !== 'object' || j.kind !== CLASS_KIND) {
    return { pkg: null, error: 'This is not a Classgrid class file.' };
  }
  if (typeof j.v !== 'number' || j.v > CLASS_VERSION) {
    return { pkg: null, error: 'This class file is from a newer version of the app. Please update the app.' };
  }
  if (typeof j.classId !== 'string' || !j.classId || !j.data || typeof j.data !== 'object') {
    return { pkg: null, error: 'This class file is damaged.' };
  }
  const version = Number(j.version);
  return {
    pkg: {
      app: 'Classgrid', kind: CLASS_KIND, v: j.v, classId: j.classId,
      version: Number.isFinite(version) && version > 0 ? version : 1,
      mode: j.mode === 'update' ? 'update' : 'full',
      createdAt: Number(j.createdAt) || 0, from: typeof j.from === 'string' ? j.from : '',
      data: j.data,
    },
    error: '',
  };
}

export type PackageAction = 'new' | 'update' | 'same' | 'older' | 'wrongClass' | 'needsFull';

export interface PackagePlan {
  action: PackageAction;
  message: string;
  studentsAdded: number;
  studentsRemoved: number;
  studentsChanged: number;
}

/** `current` = what is on this device for the target class (null = no class yet / opening as new). */
export function planClassPackage(current: AppData | null, pkg: ClassPackage): PackagePlan {
  const empty = { studentsAdded: 0, studentsRemoved: 0, studentsChanged: 0 };
  const has = !!current && !!current.classId;
  if (!has) {
    if (pkg.mode === 'update') {
      return { action: 'needsFull', message: 'This is an update file, but this phone does not have the class yet. Ask management for the full class file.', ...empty };
    }
    return { action: 'new', message: 'New class: ' + (pkg.data.className || 'Class'), studentsAdded: (pkg.data.students || []).length, studentsRemoved: 0, studentsChanged: 0 };
  }
  if (current!.classId !== pkg.classId) {
    return { action: 'wrongClass', message: 'This file is for a different class than the one open.', ...empty };
  }
  const have = current!.teacherLink?.version ?? 0;
  if (pkg.version === have) return { action: 'same', message: 'You already have this class file.', ...empty };
  if (pkg.version < have) return { action: 'older', message: 'This file is older than the one you have.', ...empty };
  const cur = new Map(current!.students.map(s => [s.id, s]));
  const nw = new Map((pkg.data.students || []).map(s => [s.id, s]));
  let added = 0, removed = 0, changed = 0;
  nw.forEach((s, id) => {
    const c = cur.get(id);
    if (!c) added++;
    else if (c.name !== s.name || c.rollNo !== s.rollNo || c.fatherName !== s.fatherName || c.phone !== s.phone || c.address !== s.address || (c.occupation || '') !== (s.occupation || '') || c.admissionNo !== s.admissionNo) changed++;
  });
  cur.forEach((_, id) => { if (!nw.has(id)) removed++; });
  return { action: 'update', message: 'Update class from this file', studentsAdded: added, studentsRemoved: removed, studentsChanged: changed };
}

/**
 * Returns the new AppData to save. Never throws. For an update, the teacher's own
 * attendance / marks / payments are kept; structure (students, exams, funds, headings) comes from management.
 */
export function applyClassPackage(current: AppData | null, pkg: ClassPackage): AppData {
  const plan = planClassPackage(current, pkg);
  const link = { version: pkg.version, from: pkg.from, receivedAt: Date.now() };
  if (plan.action === 'new' || !current) {
    return normalizeData({ ...pkg.data, classId: pkg.classId, teacherLink: link });
  }
  if (plan.action !== 'update') return current;
  const d = pkg.data;
  // keep the teacher's records; drop entries of students/exams that no longer exist
  const stuIds = new Set((d.students || []).map(s => s.id));
  const dropStu = <T,>(o: Record<string, Record<string, T>>, keep: Set<string>) =>
    Object.fromEntries(Object.entries(o || {}).map(([k, m]) => [k, Object.fromEntries(Object.entries(m || {}).filter(([sid]) => stuIds.has(sid)))]).filter(([k]) => keep.has(k as string)));
  const attendance = Object.fromEntries(Object.entries(current.attendance).map(([day, a]) => [
    day, { ...a, status: Object.fromEntries(Object.entries(a.status || {}).filter(([sid]) => stuIds.has(sid))) },
  ]));
  // exams and funds the teacher made on this phone stay; management's versions win for the same id
  const mergeById = <T extends { id: string }>(fromMgmt: T[] | undefined, local: T[]): T[] => {
    const m = fromMgmt || [];
    const ids = new Set(m.map(x => x.id));
    return [...m, ...local.filter(x => !ids.has(x.id))];
  };
  const mergedAsm = mergeById(d.assessments, current.assessments);
  const mergedFunds = mergeById(d.funds, current.funds);
  const asmIds2 = new Set(mergedAsm.map(a => a.id));
  const fundIds2 = new Set(mergedFunds.map(f => f.id));
  return normalizeData({
    ...current,
    ...d,
    assessments: mergedAsm,
    funds: mergedFunds,
    attendance,
    assessmentResults: dropStu(current.assessmentResults, asmIds2),
    assessmentManualPass: dropStu(current.assessmentManualPass, asmIds2),
    assessmentRemarks: dropStu(current.assessmentRemarks, asmIds2),
    fundPayments: dropStu(current.fundPayments, fundIds2),
    dailyTests: Object.fromEntries(Object.entries(current.dailyTests).map(([k, m]) => [k, Object.fromEntries(Object.entries(m).filter(([sid]) => stuIds.has(sid)))])),
    classId: pkg.classId,
    teacherLink: { ...current.teacherLink, ...link },
    // keep local-only things
    tools: current.tools,
  });
}

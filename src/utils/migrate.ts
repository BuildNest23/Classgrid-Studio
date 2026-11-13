import { AppData, Assessment, Fund, Student, DayAttendance, AttendanceStatus, ClassTools } from '../types';

function uid(prefix: string): string {
  return prefix + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

const isObj = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

export function makeBaseData(): AppData {
  return {
    schoolName: "Your School Name",
    emisCode: "",
    section: "",
    academicYear: "",
    className: "",
    inchargeName: "",
    schoolLogo: "",
    printSize: "m",
    printNote: "",
    forceOrientation: "",
    students: [],
    attendance: {},
    assessments: [],
    assessmentResults: {},
    assessmentManualPass: {},
    assessmentRemarks: {},
    funds: [],
    fundPayments: {},
    dailyTests: {},
    tools: {
      students: true,
      attendance: true,
      results: true,
      dailyTest: false,
      funds: false
    }
  };
}

/**
 * Normalizes ANY raw data (old localStorage, imported backup, older app versions)
 * into a clean, safe AppData object. Never throws on bad input.
 * Used both on app load and on backup import.
 */
export function normalizeData(raw: unknown): AppData {
  const src: Record<string, any> = isObj(raw) ? raw : {};
  const base = makeBaseData();

  const printSizes = ['xs', 's', 'm', 'l', 'xl'];
  const orientations = ['', 'portrait', 'landscape'];

  // ---- Students (drop legacy className, guarantee id + string fields) ----
  const seenStudentIds = new Set<string>();
  const students: Student[] = (Array.isArray(src.students) ? src.students : [])
    .filter((s: unknown) => isObj(s))
    .map((s: Record<string, any>) => {
      let id = s.id ? String(s.id) : uid("s");
      if (seenStudentIds.has(id)) id = uid("s");
      seenStudentIds.add(id);
      return {
        id,
        admissionNo: String(s.admissionNo ?? ""),
        rollNo: String(s.rollNo ?? ""),
        name: String(s.name ?? ""),
        fatherName: String(s.fatherName ?? ""),
        phone: String(s.phone ?? ""),
        address: String(s.address ?? ""),
        occupation: String(s.occupation ?? ""),
        notes: String(s.notes ?? ""),
        createdAt: Number(s.createdAt) || 0 // 0 = unknown join date: counts for all past attendance
      };
    });

  // ---- Attendance (legacy "H" status -> "L"; guarantee day shape) ----
  const attendance: Record<string, DayAttendance> = {};
  if (isObj(src.attendance)) {
    Object.keys(src.attendance).forEach(k => {
      const d = src.attendance[k];
      if (!isObj(d)) return;
      const status: Record<string, AttendanceStatus> = {};
      if (isObj(d.status)) {
        Object.keys(d.status).forEach(sid => {
          let v = d.status[sid];
          if (v === "H") v = "L";
          if (v === "P" || v === "A" || v === "L") status[sid] = v;
        });
      }
      attendance[k] = { holiday: !!d.holiday, locked: !!d.locked, status };
    });
  }

  // ---- Assessments (fill missing ids/names/max/pass%) ----
  const assessments: Assessment[] = (Array.isArray(src.assessments) ? src.assessments : [])
    .filter((a: unknown) => isObj(a))
    .map((a: Record<string, any>) => ({
      id: a.id ? String(a.id) : uid("asmt"),
      name: String(a.name || "Assessment"),
      passPercent: Number(a.passPercent) || 40,
      subjects: (Array.isArray(a.subjects) ? a.subjects : [])
        .filter((x: unknown) => isObj(x))
        .map((x: Record<string, any>) => ({
          id: x.id ? String(x.id) : uid("asub"),
          name: String(x.name || "Subject"),
          // 0 means "max marks not set yet" and must stay 0; only a missing or broken value gets the old default
          max: x.max !== undefined && x.max !== null && x.max !== '' && Number.isFinite(Number(x.max)) && Number(x.max) >= 0 ? Number(x.max) : 100
        })),
      createdAt: Number(a.createdAt) || Date.now(),
      // Keep the "Lock Grid" state (it was previously dropped on every load / undo / redo / import)
      ...(a.locked ? { locked: true } : {})
    }));

  // ---- Funds ----
  const funds: Fund[] = (Array.isArray(src.funds) ? src.funds : [])
    .filter((f: unknown) => isObj(f))
    .map((f: Record<string, any>) => ({
      id: f.id ? String(f.id) : uid("fund"),
      name: String(f.name || "Fund"),
      amount: Number(f.amount) || 0,
      dueDate: String(f.dueDate || ""),
      createdAt: Number(f.createdAt) || Date.now()
    }));

  // ---- Daily Tests (key1: YYYY-MM-DD -> key2: studentId -> mark 0-10 or 'A') ----
  const dailyTests: Record<string, Record<string, number | 'A'>> = {};
  if (isObj(src.dailyTests)) {
    Object.keys(src.dailyTests).forEach(dateKey => {
      const dayData = src.dailyTests[dateKey];
      if (!isObj(dayData)) return;
      const cleanDay: Record<string, number | 'A'> = {};
      Object.keys(dayData).forEach(sid => {
        const val = dayData[sid];
        if (val === 'A' || val === 'a') {
          cleanDay[sid] = 'A';
        } else if (typeof val === 'number' && !isNaN(val)) {
          if (val >= 0 && val <= 10) {
            cleanDay[sid] = Math.round(val * 10) / 10;
          }
        } else if (typeof val === 'string' && val.trim() !== '') {
          const num = parseFloat(val.trim());
          if (!isNaN(num) && num >= 0 && num <= 10) {
            cleanDay[sid] = Math.round(num * 10) / 10;
          }
        }
      });
      dailyTests[dateKey] = cleanDay;
    });
  }

  // Text fields must be strings: a non-string value in an imported backup would be rendered
  // directly as a React child and crash the app ("Objects are not valid as a React child").
  const str = (v: unknown, fallback: string): string =>
    typeof v === "string" ? v : (v === null || v === undefined || typeof v === "object") ? fallback : String(v);

  // ---- Tools (per-class; old data with no tools = ALL tools on) ----
  let tools: ClassTools;
  if (isObj(src.tools)) {
    tools = {
      students: true,
      attendance: src.tools.attendance !== false,
      results: src.tools.results !== false,
      dailyTest: !!src.tools.dailyTest,
      funds: !!src.tools.funds
    };
  } else {
    // Old data with no tools = ALL tools on
    tools = {
      students: true,
      attendance: true,
      results: true,
      dailyTest: true,
      funds: true
    };
  }

  return {
    schoolName: str(src.schoolName, base.schoolName),
    emisCode: typeof src.emisCode === "string" ? src.emisCode : "",
    section: typeof src.section === "string" ? src.section : "",
    academicYear: str(src.academicYear, base.academicYear),
    className: str(src.className, base.className),
    inchargeName: str(src.inchargeName, base.inchargeName),
    schoolLogo: str(src.schoolLogo, base.schoolLogo),
    printSize: printSizes.includes(src.printSize) ? src.printSize : "m",
    printNote: str(src.printNote, ""),
    forceOrientation: orientations.includes(src.forceOrientation) ? src.forceOrientation : "",
    students,
    attendance,
    assessments,
    assessmentResults: isObj(src.assessmentResults) ? src.assessmentResults : {},
    assessmentManualPass: isObj(src.assessmentManualPass) ? src.assessmentManualPass : {},
    assessmentRemarks: isObj(src.assessmentRemarks) ? src.assessmentRemarks : {},
    funds,
    fundPayments: isObj(src.fundPayments) ? src.fundPayments : {},
    dailyTests,
    tools
  };
}

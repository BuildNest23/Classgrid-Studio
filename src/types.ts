export interface Student {
  id: string;
  admissionNo: string;
  rollNo: string;
  name: string;
  fatherName: string;
  phone: string;
  address: string;
  occupation?: string;
  notes: string;
  createdAt: number;
}

export type AttendanceStatus = 'P' | 'A' | 'L';

export interface DayAttendance {
  holiday: boolean;
  locked: boolean;
  status: Record<string, AttendanceStatus>;
}

interface AssessmentSubject {
  id: string;
  name: string;
  max: number;
}

export interface Assessment {
  id: string;
  name: string;
  passPercent: number;
  subjects: AssessmentSubject[];
  createdAt: number;
  locked?: boolean;
}

export interface Fund {
  id: string;
  name: string;
  amount: number;
  dueDate: string;
  createdAt: number;
}

export interface FundPayment {
  amount?: number;
  date?: string;
  note?: string;
  exempt?: boolean;
}

export type PrintSizeKey = 'xs' | 's' | 'm' | 'l' | 'xl';

export interface ClassTools {
  students: true;
  attendance: boolean;
  results: boolean;
  dailyTest: boolean;
  funds: boolean;
}

export interface AppData {
  schoolName: string;
  emisCode: string; // optional
  section: string; // optional
  academicYear: string;
  className: string;
  inchargeName: string;
  schoolLogo: string;
  printSize: PrintSizeKey;
  printNote: string;
  forceOrientation: '' | 'portrait' | 'landscape';
  students: Student[];
  attendance: Record<string, DayAttendance>;
  assessments: Assessment[];
  assessmentResults: Record<string, Record<string, Record<string, number | 'A'>>>; // asmtId -> studentId -> subId -> mark
  assessmentManualPass: Record<string, Record<string, boolean>>; // asmtId -> studentId -> boolean
  assessmentRemarks: Record<string, Record<string, string>>; // asmtId -> studentId -> remark
  funds: Fund[];
  fundPayments: Record<string, Record<string, FundPayment>>; // fundId -> studentId -> payment
  dailyTests: Record<string, Record<string, number | 'A'>>; // dateKey (YYYY-MM-DD) -> studentId -> mark (0-10) or 'A'
  tools?: ClassTools;
}

export type ActiveTab = 'dashboard' | 'students' | 'attendance' | 'dailytest' | 'results' | 'funds' | 'view' | 'settings' | 'classes';

export interface ToastItem {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export interface ConfirmDialogOptions {
  title?: string;
  icon?: string;
  yesText?: string;
  noText?: string;
  danger?: boolean;
}

export interface PromptDialogOptions {
  title?: string;
  icon?: string;
  yesText?: string;
  noText?: string;
}

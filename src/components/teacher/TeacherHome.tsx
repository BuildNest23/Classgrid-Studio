import React from 'react';
import { useClassroom } from '../../context/ClassroomContext';
import { todayKey, prettyDate } from '../../utils/helpers';
import {
  ClipboardCheck,
  BarChart3,
  FileDown,
  Users,
  Wallet,
  Send,
  ArrowRight,
  Sun,
  CheckCircle2,
  Clock,
} from 'lucide-react';

export const TeacherHome: React.FC = () => {
  const { data, setActiveTab, countDay, isTodayAttendanceTaken } = useClassroom();
  const hasClass = !!data.classId;
  const todayK = todayKey();
  const c = countDay(todayK);
  const taken = isTodayAttendanceTaken();

  if (!hasClass) {
    return (
      <div className="max-w-md mx-auto mt-4 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-7 text-center">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-red-50 dark:bg-red-950/60 text-red-800 dark:text-red-400 flex items-center justify-center">
          <FileDown className="w-6 h-6" />
        </div>
        <h1 className="mt-4 text-xl font-bold text-stone-900 dark:text-stone-100">
          Open your class file
        </h1>
        <p className="text-sm text-stone-500 dark:text-stone-400 mt-1.5 leading-relaxed">
          Management will send you a class file. Open it here and your student roster will appear right away.
        </p>
        <button
          type="button"
          onClick={() => setActiveTab('collect')}
          className="mt-5 w-full min-h-[48px] rounded-xl bg-red-800 hover:bg-red-900 dark:bg-red-700 dark:hover:bg-red-600 text-white text-sm font-semibold cursor-pointer active:scale-[0.98] transition-colors"
        >
          Choose class file
        </button>
      </div>
    );
  }

  const tools = [
    { icon: ClipboardCheck, label: 'Attendance', sub: 'Roll call & absentee slip', tab: 'attendance' as const },
    { icon: BarChart3, label: 'Marks & Results', sub: 'Exams & report cards', tab: 'results' as const },
    { icon: Users, label: 'Students', sub: `${data.students.length} enrolled`, tab: 'students' as const },
    { icon: Wallet, label: 'Funds', sub: 'Fees & collections', tab: 'funds' as const },
  ];

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      {/* Clean Crimson Class Identity Card */}
      <div className="rounded-2xl bg-red-800 dark:bg-red-900 text-white p-5 sm:p-6">
        <div className="text-xs text-red-100/85 font-medium">
          {data.schoolName || 'ClassGrid Studio'}
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">
          {data.className || 'My Class'}
        </h1>
        <div className="text-xs text-red-100/90 mt-2 flex items-center gap-2 flex-wrap tabular-nums">
          <span>
            {data.students.length} {data.students.length === 1 ? 'student' : 'students'}
          </span>
          {data.inchargeName && (
            <>
              <span aria-hidden="true">·</span>
              <span>{data.inchargeName}</span>
            </>
          )}
          {data.teacherLink && (
            <>
              <span aria-hidden="true">·</span>
              <span>
                {data.teacherLink.receivedAt
                  ? `Updated ${new Date(data.teacherLink.receivedAt).toLocaleDateString()}`
                  : 'Linked class'}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Focal Today's Attendance Panel */}
      <button
        type="button"
        onClick={() => setActiveTab('attendance')}
        className="w-full text-left p-5 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 hover:border-stone-300 dark:hover:border-stone-700 cursor-pointer active:scale-[0.99] transition-colors"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-medium text-stone-500 dark:text-stone-400">
              {prettyDate(todayK)}
            </div>
            <div className="text-base font-bold text-stone-900 dark:text-stone-100 mt-1 flex items-center gap-2">
              {c.holiday ? (
                <>
                  <Sun className="w-4 h-4 text-sky-700 dark:text-sky-400 shrink-0" />
                  <span>Class holiday today</span>
                </>
              ) : taken ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
                  <span className="tabular-nums">
                    {c.present} present · {c.absent} absent
                    {c.leave ? ` · ${c.leave} leave` : ''}
                  </span>
                </>
              ) : (
                <>
                  <Clock className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" />
                  <span>Attendance not taken yet</span>
                </>
              )}
            </div>
          </div>

          <span className="text-xs font-semibold text-red-800 dark:text-red-400 inline-flex items-center gap-1 shrink-0 mt-1">
            <span>{taken || c.holiday ? 'Open' : 'Take now'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </span>
        </div>
      </button>

      {/* Core Workspace Grid */}
      <div className="grid grid-cols-2 gap-3">
        {tools.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.tab}
              type="button"
              onClick={() => setActiveTab(t.tab)}
              className="text-left p-4 sm:p-5 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 hover:border-stone-300 dark:hover:border-stone-700 active:scale-[0.98] transition-colors cursor-pointer"
            >
              <Icon className="w-5 h-5 text-red-800 dark:text-red-400" />
              <div className="mt-3 font-bold text-sm text-stone-900 dark:text-stone-100">
                {t.label}
              </div>
              <div className="text-xs text-stone-500 dark:text-stone-400 mt-0.5 tabular-nums">
                {t.sub}
              </div>
            </button>
          );
        })}
      </div>

      {/* One-Tap Send Update Row */}
      <button
        type="button"
        onClick={() => setActiveTab('collect')}
        className="w-full min-h-[56px] px-4 py-3.5 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 hover:border-stone-300 dark:hover:border-stone-700 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer active:scale-[0.99]"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-red-50 dark:bg-red-950/60 text-red-800 dark:text-red-400 flex items-center justify-center shrink-0">
            <Send className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">
              Send update to management
            </div>
            <div className="text-xs text-stone-500 dark:text-stone-400 truncate">
              {data.teacherLink?.lastSentAt
                ? `Last sent ${new Date(data.teacherLink.lastSentAt).toLocaleString()}`
                : 'Share attendance, marks & fund records'}
            </div>
          </div>
        </div>
        <ArrowRight className="w-4 h-4 text-stone-400 shrink-0" />
      </button>
    </div>
  );
};

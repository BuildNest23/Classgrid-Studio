import React, { useState, useEffect } from 'react';
import { useClassroom } from '../../context/ClassroomContext';
import { getStorage } from '../../storage';
import {
  todayKey,
  dateKey,
  prettyDate,
  timeAgo,
  fmtMoney,
  getSortedStudents,
} from '../../utils/helpers';
import {
  X,
  ClipboardCheck,
  BarChart3,
  Wallet,
  Sun,
  CheckCircle2,
  XCircle,
  Lock,
  AlertTriangle,
  GraduationCap,
  ArrowRight,
  ArrowLeft,
  SlidersHorizontal,
  Printer,
} from 'lucide-react';
import { MyToolsCard } from '../MyToolsCard';

export const DashboardView: React.FC = () => {
  const {
    data,
    setActiveTab,
    setActiveAssessmentId,
    setActiveFundId,
    countDay,
    classAttendanceThisMonth,
    classAttendanceForMonth,
    classFundsSummary,
    classAverageForAssessment,
    assessmentEntryCount,
    computeFundStats,
  } = useClassroom();

  const [lastSavedTime, setLastSavedTime] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const storage = await getStorage();
        const ts = await storage.getLastSaved();
        if (!cancelled && ts) setLastSavedTime(timeAgo(ts));
      } catch {
        /* ignore */
      }
    }, 700);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [data]);

  const totalStudents = data.students.length;
  const todayK = todayKey();
  const day = data.attendance[todayK];
  const c = countDay(todayK);
  const sortedStudents = getSortedStudents(data.students);

  const attThisMonth = classAttendanceThisMonth();
  const todayDenom = c.taken && !c.holiday ? c.present + c.absent : 0;
  const todayPct = todayDenom > 0 ? Math.round((c.present / todayDenom) * 100) : 0;

  const latestAsmt = data.assessments
    .slice()
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
  const asmtStats = latestAsmt ? classAverageForAssessment(latestAsmt.id) : null;
  const fundsSummary = classFundsSummary();

  const parts = todayK.slice(0, 7).split('-').map(Number);
  const lastMonthDate = new Date(parts[0], parts[1] - 2, 1);
  const lastMonthKey = `${lastMonthDate.getFullYear()}-${String(
    lastMonthDate.getMonth() + 1
  ).padStart(2, '0')}`;
  const lastMonthAtt = classAttendanceForMonth(lastMonthKey);

  let trendText = 'Steady vs last month';
  let trendTone = 'text-stone-400 dark:text-stone-500';
  if (lastMonthAtt.denom > 0 && attThisMonth.denom > 0) {
    const diff = attThisMonth.pct - lastMonthAtt.pct;
    if (diff >= 2) {
      trendText = `+${diff}% vs last month`;
      trendTone = 'text-emerald-700 dark:text-emerald-400 font-semibold';
    } else if (diff <= -2) {
      trendText = `${diff}% vs last month`;
      trendTone = 'text-red-700 dark:text-red-400 font-semibold';
    }
  } else if (todayDenom > 0) {
    trendText = `Today ${todayPct}%`;
    trendTone = 'text-stone-500 dark:text-stone-400';
  }

  const tools = data.tools || {
    students: true,
    attendance: true,
    results: true,
    dailyTest: true,
    funds: true,
  };

  const [hintDismissed, setHintDismissed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('classgrid_dismiss_next_step') === '1';
    } catch {
      return false;
    }
  });

  const dismissNextStep = () => {
    try {
      sessionStorage.setItem('classgrid_dismiss_next_step', '1');
    } catch {
      /* ignore */
    }
    setHintDismissed(true);
  };

  const getNextStep = () => {
    if (hintDismissed) return null;

    if (totalStudents === 0) {
      return {
        icon: GraduationCap,
        title: 'Add your students',
        desc: 'Enroll students with names and roll numbers to begin.',
        buttonText: 'Add students',
        action: () => setActiveTab('students'),
      };
    }

    if (tools.attendance && (!day || (!day.holiday && !c.taken))) {
      return {
        icon: ClipboardCheck,
        title: "Take today's attendance",
        desc: `Mark present, absent, or leave for ${prettyDate(todayK)}.`,
        buttonText: 'Take attendance',
        action: () => setActiveTab('attendance'),
      };
    }

    if (tools.results && data.assessments.length === 0) {
      return {
        icon: BarChart3,
        title: 'Create an assessment',
        desc: 'Add an examination or test with subjects to record marks.',
        buttonText: 'Create assessment',
        action: () => setActiveTab('results'),
      };
    }

    if (tools.results && data.assessments.length > 0) {
      const anyMissing = data.assessments.some(a => {
        if (!a.subjects || a.subjects.length === 0) return true;
        return assessmentEntryCount(a.id) < totalStudents;
      });
      if (anyMissing) {
        return {
          icon: BarChart3,
          title: 'Finish entering marks',
          desc: 'Some student marks or subjects are still incomplete in Results.',
          buttonText: 'Enter marks',
          action: () => setActiveTab('results'),
        };
      }
    }

    if (tools.funds && data.funds.length === 0) {
      return {
        icon: Wallet,
        title: 'Add a fund',
        desc: 'Create a fee or fund collection to track student payments.',
        buttonText: 'Add fund',
        action: () => setActiveTab('funds'),
      };
    }

    return null;
  };

  const nextStep = getNextStep();

  // Dynamic KPI cells based on enabled class tools
  const pulseItems: {
    key: string;
    label: string;
    value: string;
    sub: string;
    subClass?: string;
    onClick: () => void;
  }[] = [
    {
      key: 'students',
      label: 'Students',
      value: String(totalStudents),
      sub: totalStudents === 1 ? 'Enrolled student' : 'Enrolled students',
      onClick: () => setActiveTab('students'),
    },
    ...(tools.attendance
      ? [
          {
            key: 'attendance',
            label: 'Month attendance',
            value: attThisMonth.denom ? `${attThisMonth.pct}%` : '—',
            sub: attThisMonth.denom ? trendText : 'No roll calls yet',
            subClass: attThisMonth.denom ? trendTone : undefined,
            onClick: () => setActiveTab('attendance'),
          },
        ]
      : []),
    ...(tools.results
      ? [
          {
            key: 'results',
            label: 'Latest test avg',
            value: asmtStats && asmtStats.entered ? `${asmtStats.avg}%` : '—',
            sub:
              asmtStats && asmtStats.entered
                ? `${asmtStats.passRate}% pass · ${latestAsmt?.name || 'Latest'}`
                : latestAsmt
                ? `${latestAsmt.name} (no marks)`
                : 'No exams yet',
            onClick: () => setActiveTab('results'),
          },
        ]
      : []),
    ...(tools.funds
      ? [
          {
            key: 'funds',
            label: 'Funds collected',
            value: fundsSummary.fundCount ? `${fundsSummary.pct}%` : '—',
            sub: fundsSummary.fundCount
              ? `${fmtMoney(fundsSummary.collected)} / ${fmtMoney(fundsSummary.target)}`
              : 'No funds yet',
            onClick: () => setActiveTab('funds'),
          },
        ]
      : []),
  ];

  // 30-day attendance rhythm strip
  const renderHeatmap = () => {
    if (!totalStudents) return null;
    const now = new Date();
    const days: Date[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      days.push(d);
    }

    return (
      <div className="pt-4 mt-4 border-t border-stone-100 dark:border-stone-800/80">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-xs font-semibold text-stone-600 dark:text-stone-300">
            Last 30 days
          </span>
          <div className="flex items-center gap-3 text-[11px] text-stone-400 dark:text-stone-500">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-[2px] bg-emerald-700" /> Taken
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-[2px] bg-red-700" /> Missed
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-[2px] bg-sky-700" /> Holiday
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {days.map(d => {
            const k = dateKey(d);
            const curDay = data.attendance[k];
            const wd = d.getDay();
            const isWeekend = wd === 0 || wd === 6;

            let bgClass = 'bg-stone-200 dark:bg-stone-800';
            if (k > todayK) {
              bgClass = 'bg-stone-100 dark:bg-stone-900 border border-dashed border-stone-300 dark:border-stone-700';
            } else if (curDay && curDay.holiday) {
              bgClass = 'bg-sky-700';
            } else if (curDay) {
              bgClass = 'bg-emerald-700';
            } else if (k === todayK) {
              bgClass = 'bg-amber-600';
            } else {
              bgClass = 'bg-red-700/85';
            }

            return (
              <div
                key={k}
                title={`${prettyDate(k)}`}
                className={`w-3.5 h-3.5 rounded-[3px] shrink-0 ${bgClass} ${
                  isWeekend ? 'opacity-45' : ''
                }`}
              />
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Clean Class Masthead */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400 flex-wrap">
            <button
              type="button"
              onClick={() => setActiveTab('board')}
              className="inline-flex items-center gap-1 font-semibold text-red-800 dark:text-red-400 hover:underline cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>All classes</span>
            </button>
            <span aria-hidden="true">·</span>
            <span className="truncate">{data.schoolName || 'My School'}</span>
            {data.academicYear && (
              <>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">{data.academicYear}</span>
              </>
            )}
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-stone-900 dark:text-stone-100 mt-1 truncate">
            {data.className || 'Unnamed Class'}
          </h1>

          <div className="text-xs text-stone-500 dark:text-stone-400 mt-1 flex items-center gap-2 flex-wrap">
            {data.inchargeName ? (
              <span>Incharge: {data.inchargeName}</span>
            ) : (
              <span className="text-red-700 dark:text-red-400 font-medium">
                Add class &amp; teacher details in Settings
              </span>
            )}
            <span aria-hidden="true">·</span>
            <span>{prettyDate(todayK)}</span>
            {lastSavedTime && (
              <>
                <span aria-hidden="true">·</span>
                <span>Saved {lastSavedTime}</span>
              </>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          className="self-start sm:self-end min-h-[42px] px-3.5 py-2 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800 text-xs font-semibold text-stone-700 dark:text-stone-200 inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
        >
          <SlidersHorizontal className="w-3.5 h-3.5 text-stone-500" />
          <span>Class details</span>
        </button>
      </div>

      {/* Contextual Next-Step Banner (Dismissible for Session) */}
      {nextStep && (
        <div className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-950/60 text-red-800 dark:text-red-400 flex items-center justify-center shrink-0">
              <nextStep.icon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-red-800 dark:text-red-400">
                Suggested next step
              </div>
              <div className="text-sm font-bold text-stone-900 dark:text-stone-100">
                {nextStep.title}
              </div>
              <p className="text-xs text-stone-500 dark:text-stone-400">{nextStep.desc}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={nextStep.action}
              className="flex-1 sm:flex-none min-h-[44px] px-4 py-2 rounded-xl text-xs font-semibold bg-red-800 hover:bg-red-900 dark:bg-red-700 dark:hover:bg-red-600 text-white transition-colors cursor-pointer flex items-center justify-center gap-1.5 active:scale-[0.98]"
            >
              <span>{nextStep.buttonText}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={dismissNextStep}
              title="Dismiss for this session"
              aria-label="Dismiss hint"
              className="w-11 h-11 flex items-center justify-center text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Unified Class Pulse KPI Strip (Single Flat Divided Surface) */}
      <div className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 overflow-hidden">
        <div
          className={`grid divide-y sm:divide-y-0 divide-x divide-stone-200 dark:divide-stone-800 ${
            pulseItems.length === 1
              ? 'grid-cols-1'
              : pulseItems.length === 2
              ? 'grid-cols-2'
              : pulseItems.length === 3
              ? 'grid-cols-1 sm:grid-cols-3'
              : 'grid-cols-2 lg:grid-cols-4'
          }`}
        >
          {pulseItems.map(item => (
            <button
              key={item.key}
              type="button"
              onClick={item.onClick}
              className="text-left p-4 sm:p-5 hover:bg-stone-50/80 dark:hover:bg-stone-800/40 transition-colors cursor-pointer group"
            >
              <div className="text-xs font-medium text-stone-500 dark:text-stone-400">
                {item.label}
              </div>
              <div className="text-2xl font-bold text-stone-900 dark:text-stone-100 mt-1 font-mono-num group-hover:text-red-800 dark:group-hover:text-red-400 transition-colors">
                {item.value}
              </div>
              <div
                className={`text-xs truncate mt-0.5 tabular-nums ${
                  item.subClass || 'text-stone-400 dark:text-stone-500'
                }`}
              >
                {item.sub}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main Two-Column Asymmetric Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Primary Column: Today's Attendance & Recent Assessments */}
        <div className="lg:col-span-7 space-y-5">
          {tools.attendance && totalStudents > 0 && (
            <section className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">
                    Today&apos;s attendance
                  </h2>
                  <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                    {prettyDate(todayK)}
                    {c.locked && (
                      <span className="inline-flex items-center gap-1 ml-2 text-stone-600 dark:text-stone-300 font-medium">
                        <Lock className="w-3 h-3" /> Locked
                      </span>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('attendance')}
                  className="min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold bg-red-800 hover:bg-red-900 dark:bg-red-700 dark:hover:bg-red-600 text-white transition-colors cursor-pointer shrink-0 active:scale-[0.98]"
                >
                  {!day ? 'Take attendance' : 'Open register'}
                </button>
              </div>

              <div className="mt-4">
                {!day ? (
                  <div className="p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/25 border border-amber-200/80 dark:border-amber-900/60 text-amber-900 dark:text-amber-200 text-xs font-medium">
                    Attendance has not been recorded for today yet.
                  </div>
                ) : day.holiday ? (
                  <div className="p-3.5 rounded-xl bg-sky-50/70 dark:bg-sky-950/25 border border-sky-200/80 dark:border-sky-900/60 text-sky-900 dark:text-sky-200 text-xs font-medium flex items-center gap-2">
                    <Sun className="w-4 h-4 shrink-0" />
                    <span>Marked as a class holiday (excluded from averages).</span>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-2 text-center rounded-xl bg-stone-50 dark:bg-stone-950/50 border border-stone-200/70 dark:border-stone-800 p-3">
                      <div>
                        <div className="text-lg font-bold text-emerald-700 dark:text-emerald-400 font-mono-num">
                          {c.present}
                        </div>
                        <div className="text-[11px] font-medium text-stone-500 dark:text-stone-400">
                          Present
                        </div>
                      </div>
                      <div className="border-x border-stone-200 dark:border-stone-800">
                        <div
                          className={`text-lg font-bold font-mono-num ${
                            c.absent > 0
                              ? 'text-red-700 dark:text-red-400'
                              : 'text-stone-900 dark:text-stone-100'
                          }`}
                        >
                          {c.absent}
                        </div>
                        <div className="text-[11px] font-medium text-stone-500 dark:text-stone-400">
                          Absent
                        </div>
                      </div>
                      <div>
                        <div className="text-lg font-bold text-amber-700 dark:text-amber-400 font-mono-num">
                          {c.leave}
                        </div>
                        <div className="text-[11px] font-medium text-stone-500 dark:text-stone-400">
                          Leave
                        </div>
                      </div>
                    </div>

                    {c.absent > 0 && (
                      <div className="p-3 rounded-xl bg-red-50/70 dark:bg-red-950/30 border border-red-200/70 dark:border-red-900/60 text-xs text-red-900 dark:text-red-200 flex items-start gap-2">
                        <XCircle className="w-4 h-4 shrink-0 text-red-700 dark:text-red-400 mt-0.5" />
                        <div>
                          <span className="font-semibold">Absent:</span>{' '}
                          {sortedStudents
                            .filter(s => day.status[s.id] === 'A')
                            .map(s => `${s.rollNo ? `#${s.rollNo} ` : ''}${s.name}`)
                            .join(', ')}
                        </div>
                      </div>
                    )}

                    {c.leave > 0 && (
                      <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/25 border border-amber-200/70 dark:border-amber-900/60 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
                        <Sun className="w-4 h-4 shrink-0 text-amber-700 dark:text-amber-400 mt-0.5" />
                        <div>
                          <span className="font-semibold">Leave:</span>{' '}
                          {sortedStudents
                            .filter(s => day.status[s.id] === 'L')
                            .map(s => `${s.rollNo ? `#${s.rollNo} ` : ''}${s.name}`)
                            .join(', ')}
                        </div>
                      </div>
                    )}

                    {c.absent === 0 && c.leave === 0 && (
                      <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-900/60 text-xs text-emerald-900 dark:text-emerald-200 font-medium flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
                        <span>Full attendance today — every student is present.</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {renderHeatmap()}
            </section>
          )}

          {/* Recent Assessments */}
          {tools.results && data.assessments.length > 0 && (
            <section className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-5">
              <div className="flex items-center justify-between gap-2 mb-3">
                <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">
                  Recent assessments
                </h2>
                <button
                  type="button"
                  onClick={() => setActiveTab('results')}
                  className="text-xs font-semibold text-red-800 dark:text-red-400 hover:underline cursor-pointer"
                >
                  All ({data.assessments.length}) →
                </button>
              </div>

              <div className="divide-y divide-stone-100 dark:divide-stone-800/80">
                {data.assessments
                  .slice(-4)
                  .reverse()
                  .map(a => {
                    const entered = assessmentEntryCount(a.id);
                    const progressPct = totalStudents
                      ? Math.round((entered / totalStudents) * 100)
                      : 0;
                    const complete = entered >= totalStudents && totalStudents > 0;

                    return (
                      <div
                        key={a.id}
                        className="py-3 first:pt-1 last:pb-0 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-stone-900 dark:text-stone-100 truncate">
                            {a.name}
                          </div>
                          <div className="text-xs text-stone-500 dark:text-stone-400 tabular-nums mt-0.5">
                            {entered}/{totalStudents} entered · {a.subjects.length}{' '}
                            {a.subjects.length === 1 ? 'subject' : 'subjects'}
                          </div>
                          <div className="w-full max-w-[180px] h-1.5 bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden mt-2">
                            <div
                              className="h-full bg-emerald-700 dark:bg-emerald-500 transition-all"
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setActiveAssessmentId(a.id);
                            setActiveTab('results');
                          }}
                          className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold shrink-0 transition-colors cursor-pointer ${
                            complete
                              ? 'bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-200 hover:bg-stone-200 dark:hover:bg-stone-700'
                              : 'bg-red-800 hover:bg-red-900 dark:bg-red-700 dark:hover:bg-red-600 text-white'
                          }`}
                        >
                          {complete ? 'Open' : 'Continue'}
                        </button>
                      </div>
                    );
                  })}
              </div>
            </section>
          )}
        </div>

        {/* Secondary Column: Active Funds & Students Preview */}
        <div className="lg:col-span-5 space-y-5">
          {tools.funds && data.funds.length > 0 && (
            <section className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-5">
              <div className="flex items-center justify-between gap-2 mb-3">
                <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">
                  Active funds
                </h2>
                <button
                  type="button"
                  onClick={() => setActiveTab('funds')}
                  className="text-xs font-semibold text-red-800 dark:text-red-400 hover:underline cursor-pointer"
                >
                  All ({data.funds.length}) →
                </button>
              </div>

              <div className="divide-y divide-stone-100 dark:divide-stone-800/80">
                {data.funds
                  .slice(-3)
                  .reverse()
                  .map(f => {
                    const st = computeFundStats(f.id);
                    const overdue = f.dueDate && f.dueDate < todayK && st.pct < 100;

                    return (
                      <div
                        key={f.id}
                        className="py-3 first:pt-1 last:pb-0 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-stone-900 dark:text-stone-100 truncate">
                              {f.name}
                            </span>
                            {overdue && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 dark:text-red-400 shrink-0">
                                <AlertTriangle className="w-3 h-3" />
                                Overdue
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-stone-500 dark:text-stone-400 tabular-nums mt-0.5">
                            Collected{' '}
                            <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                              {fmtMoney(st.collected)}
                            </span>
                            {!st.variable && st.pending > 0 && (
                              <>
                                {' '}· Due{' '}
                                <span className="font-semibold text-red-700 dark:text-red-400">
                                  {fmtMoney(st.pending)}
                                </span>
                              </>
                            )}
                          </div>
                          <div className="w-full max-w-[160px] h-1.5 bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden mt-2">
                            <div
                              className="h-full bg-emerald-700 dark:bg-emerald-500 transition-all"
                              style={{ width: `${Math.min(100, st.pct)}%` }}
                            />
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setActiveFundId(f.id);
                            setActiveTab('funds');
                          }}
                          className="min-h-[40px] px-3 py-2 rounded-xl text-xs font-semibold bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 shrink-0 transition-colors cursor-pointer"
                        >
                          Open
                        </button>
                      </div>
                    );
                  })}
              </div>
            </section>
          )}

          {/* Compact Roster Preview */}
          <section className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-5">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-baseline gap-2">
                <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">
                  Students
                </h2>
                <span className="text-xs text-stone-400 dark:text-stone-500 tabular-nums">
                  {totalStudents}
                </span>
              </div>
              {totalStudents > 0 && (
                <div className="flex items-center gap-3 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setActiveTab('view')}
                    className="text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 inline-flex items-center gap-1 cursor-pointer"
                    title="Open printable roster"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('students')}
                    className="text-red-800 dark:text-red-400 hover:underline cursor-pointer"
                  >
                    Manage →
                  </button>
                </div>
              )}
            </div>

            {totalStudents === 0 ? (
              <div className="py-6 text-center">
                <GraduationCap className="w-8 h-8 mx-auto text-stone-400 dark:text-stone-600" />
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-2">
                  No students enrolled in this class yet.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('students')}
                  className="mt-3 min-h-[42px] px-4 py-2 rounded-xl bg-red-800 hover:bg-red-900 text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  Add students
                </button>
              </div>
            ) : (
              <div className="divide-y divide-stone-100 dark:divide-stone-800/80">
                {sortedStudents.slice(0, 6).map(s => (
                  <div
                    key={s.id}
                    className="py-2.5 first:pt-1 last:pb-0 flex items-center gap-3 text-xs"
                  >
                    <span className="w-9 text-center font-mono-num font-semibold text-stone-500 dark:text-stone-400 shrink-0">
                      {s.rollNo || '—'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-stone-900 dark:text-stone-100 truncate">
                        {s.name || '—'}
                      </div>
                      {s.fatherName && (
                        <div className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
                          {s.fatherName}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {totalStudents > 6 && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('students')}
                    className="w-full pt-3 text-center text-xs font-semibold text-red-800 dark:text-red-400 hover:underline cursor-pointer"
                  >
                    View all {totalStudents} students →
                  </button>
                )}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* My Tools Card Anchored at the Bottom of Home */}
      <MyToolsCard />
    </div>
  );
};

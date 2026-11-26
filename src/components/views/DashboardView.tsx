import React, { useState, useEffect } from 'react';
import { useClassroom } from '../../context/ClassroomContext';
import { getStorage } from '../../storage';
import {
  todayKey,
  prettyDate,
  timeAgo,
  getSortedStudents,
  fmtMoney,
  dateKey
} from '../../utils/helpers';
import {
  Sparkles,
  BarChart3,
  ClipboardList,
  Sun,
  Lock,
  XCircle,
  CheckCircle2,
  Wallet,
  AlertTriangle,
  GraduationCap,
  X,
  ArrowRight
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
    computeFundStats
  } = useClassroom();

  const [hideGS, setHideGS] = useState(() => {
    try { return localStorage.getItem("classroomHideGS") === "1"; } catch { return false; }
  });
  const [lastSavedTime, setLastSavedTime] = useState<string>("");

  // Read the last-saved time from the real storage engine (SQLite on Android, local storage on web).
  // Small delay so it runs after the debounced save has been written.
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const storage = await getStorage();
        const ts = await storage.getLastSaved();
        if (!cancelled && ts) setLastSavedTime(timeAgo(ts));
      } catch { /* ignore */ }
    }, 700);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [data]);

  const dismissGS = () => {
    try { localStorage.setItem("classroomHideGS", "1"); } catch { /* ignore */ }
    setHideGS(true);
  };

  const totalStudents = data.students.length;
  const todayK = todayKey();
  const day = data.attendance[todayK];
  const c = countDay(todayK);
  const sortedStudents = getSortedStudents(data.students);

  // Snapshot calculations
  const attThisMonth = classAttendanceThisMonth();
  // countDay() reports "everyone present" for a day without a roll call, so only count a taken, non-holiday day
  const todayDenom = c.taken && !c.holiday ? c.present + c.absent : 0;
  const todayPct = todayDenom > 0 ? Math.round((c.present / todayDenom) * 100) : 0;

  const latestAsmt = data.assessments.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
  const asmtStats = latestAsmt ? classAverageForAssessment(latestAsmt.id) : null;
  const fundsSummary = classFundsSummary();

  // Compare month attendance to previous month
  const parts = todayK.slice(0, 7).split("-").map(Number);
  const lastMonthDate = new Date(parts[0], parts[1] - 2, 1);
  const lastMonthKey = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, "0")}`;
  const lastMonthAtt = classAttendanceForMonth(lastMonthKey);

  let trendIndicator = <span className="text-[#78716C] dark:text-[#A8A29E] text-xs">— steady vs last month</span>;
  if (lastMonthAtt.denom > 0 && attThisMonth.denom > 0) {
    const diff = attThisMonth.pct - lastMonthAtt.pct;
    if (diff >= 2) {
      trendIndicator = <span className="text-[#065F46] dark:text-[#A7F3D0] text-xs font-bold">▲ +{diff}% vs last month</span>;
    } else if (diff <= -2) {
      trendIndicator = <span className="text-[#B23A32] dark:text-[#FCA5A5] text-xs font-bold">▼ {diff}% vs last month</span>;
    }
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
    } catch { /* ignore */ }
    setHintDismissed(true);
  };

  const getNextStep = () => {
    if (hintDismissed) return null;

    // 1. no students -> Add students
    if (totalStudents === 0) {
      return {
        icon: GraduationCap,
        title: "Add your students",
        desc: "Enroll students with their names and roll numbers to begin.",
        buttonText: "Add Students",
        action: () => setActiveTab("students")
      };
    }

    // 2. attendance on and not taken today -> Take attendance
    if (tools.attendance && (!day || (!day.holiday && !c.taken))) {
      return {
        icon: ClipboardList,
        title: "Take today's attendance",
        desc: `Mark present, absent, or leave for today (${prettyDate(todayK)}).`,
        buttonText: "Take Attendance",
        action: () => setActiveTab("attendance")
      };
    }

    // 3. results on and no assessment -> Create assessment
    if (tools.results && data.assessments.length === 0) {
      return {
        icon: BarChart3,
        title: "Create an assessment",
        desc: "Add an examination or test with subjects to record marks.",
        buttonText: "Create Assessment",
        action: () => setActiveTab("results")
      };
    }

    // 4. results on and marks missing -> Enter marks
    if (tools.results && data.assessments.length > 0) {
      const anyMissing = data.assessments.some(a => {
        if (!a.subjects || a.subjects.length === 0) return true;
        const entered = assessmentEntryCount(a.id);
        return entered < totalStudents;
      });
      if (anyMissing) {
        return {
          icon: BarChart3,
          title: "Enter marks",
          desc: "Some student marks or subjects are incomplete in Results.",
          buttonText: "Enter Marks",
          action: () => setActiveTab("results")
        };
      }
    }

    // 5. funds on and no fund -> Add a fund
    if (tools.funds && data.funds.length === 0) {
      return {
        icon: Wallet,
        title: "Add a fund",
        desc: "Create a fee or fund collection to track student payments.",
        buttonText: "Add a Fund",
        action: () => setActiveTab("funds")
      };
    }

    return null;
  };
  const nextStep = getNextStep();

  // 30-day heatmap matching ClassGrid sample colors
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
      <div className="mt-3">
        <div className="flex gap-1 flex-wrap">
          {days.map(d => {
            const k = dateKey(d);
            const curDay = data.attendance[k];
            const wd = d.getDay();
            const isWeekend = wd === 0 || wd === 6;

            let bgClass = "bg-[#F5F5F4] dark:bg-[#292524]";
            if (k > todayK) {
              bgClass = "bg-[#FAFAF9] dark:bg-[#0C0A09] border border-dashed border-[#D6D3D1] dark:border-[#44403C]";
            } else if (curDay && curDay.holiday) {
              bgClass = "bg-[#2E5A8A]";
            } else if (curDay) {
              bgClass = "bg-[#065F46]"; // Emerald green for taken days
            } else if (k === todayK) {
              bgClass = "bg-[#B4791F]"; // Amber for today pending
            } else {
              bgClass = "bg-[#B23A32]"; // Red for missing
            }

            return (
              <div
                key={k}
                title={`${k} (${prettyDate(k)})`}
                className={`w-3.5 h-3.5 rounded-xs shrink-0 ${bgClass} ${isWeekend ? 'opacity-55' : ''}`}
              />
            );
          })}
        </div>
        <div className="flex gap-3 flex-wrap text-[11px] text-[#78716C] dark:text-[#A8A29E] mt-2">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#065F46]" /> Taken
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#B23A32]" /> Not taken
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#B4791F]" /> Today (pending)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#2E5A8A]" /> Holiday
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* Quick Start Guide Banner */}
      {!hideGS && (
        <div className="bg-white dark:bg-[#1C1917] border border-[#E7E5E4] dark:border-[#44403C] rounded-2xl p-4 relative shadow-xs">
          <button
            type="button"
            onClick={dismissGS}
            title="Dismiss"
            className="absolute top-3 right-3 text-[#78716C] dark:text-[#A8A29E] hover:text-black dark:hover:text-white font-bold text-sm p-1 cursor-pointer flex items-center justify-center rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
          <h3 className="text-base font-bold text-[#B91C1C] dark:text-[#FCA5A5] mb-2 font-serif-academic flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span>Welcome — Quick Start</span>
          </h3>
          <ol className="list-decimal pl-5 space-y-1 text-xs md:text-sm text-[#1C1917] dark:text-[#F5F5F4] leading-relaxed">
            <li>Go to <b>Settings</b> — set your <b>Class Name</b> and <b>School Name</b>.</li>
            <li>Open <b>Students</b> and enroll your students.</li>
            <li>Take daily <b>Attendance</b>.</li>
            <li>Create <b>Assessments</b> (First Term, Monthly Test, Final Exam) and record marks.</li>
            <li>Track <b>Funds</b> for collections and fees.</li>
            <li>Use <b>Settings → Backup</b> to export a `.json` backup file.</li>
          </ol>
        </div>
      )}

      {/* School Header Card */}
      <div className="bg-white dark:bg-[#1C1917] border border-[#E7E5E4] dark:border-[#44403C] rounded-2xl p-4 shadow-xs">
        <h2 className="text-xl font-bold font-serif-academic text-[#1C1917] dark:text-[#F5F5F4] mb-1">
          {data.schoolName}
        </h2>
        <div className="text-sm text-[#78716C] dark:text-[#A8A29E]">
          {data.academicYear ? `${data.academicYear} • ` : ""}
          {data.className ? (
            <span>Class: <b>{data.className}</b>{data.inchargeName ? ` • Incharge: ${data.inchargeName}` : ""}</span>
          ) : (
            <span className="text-[#B91C1C] dark:text-[#F87171] font-semibold">No class configured yet. Go to Settings to enter it.</span>
          )}
        </div>
        <div className="text-xs text-[#A8A29E] mt-2">
          {lastSavedTime ? `Last edited: ${lastSavedTime}` : "No changes saved yet."}
        </div>
      </div>

      {/* Next-Step Hint Banner (Dismissible for session) */}
      {nextStep && (
        <div className="relative bg-white dark:bg-[#1C1917] border border-[#E7E5E4] dark:border-[#44403C] rounded-2xl p-4 shadow-xs flex items-center justify-between gap-3 flex-wrap border-l-4 border-l-[#991B1B]">
          <div className="flex items-center gap-3 min-w-0 pr-6 sm:pr-0">
            <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-950/70 text-[#991B1B] dark:text-[#F87171] flex items-center justify-center shrink-0">
              <nextStep.icon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#991B1B] dark:text-[#F87171] block">
                Next Step
              </span>
              <h4 className="text-sm font-bold text-[#1C1917] dark:text-[#F5F5F4] truncate">
                {nextStep.title}
              </h4>
              <p className="text-xs text-[#78716C] dark:text-[#A8A29E]">
                {nextStep.desc}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={nextStep.action}
              className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold bg-[#991B1B] hover:bg-[#7F1D1D] text-white transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              <span>{nextStep.buttonText}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={dismissNextStep}
              title="Dismiss hint for this session"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 rounded-xl cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Top 2 Stat Boxes */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="bg-white dark:bg-[#1C1917] border border-[#E7E5E4] dark:border-[#44403C] rounded-2xl p-4 text-center shadow-xs">
          <b className="block text-2xl md:text-3xl text-[#B91C1C] dark:text-[#FCA5A5]">{totalStudents}</b>
          <span className="text-xs md:text-sm font-semibold text-[#78716C] dark:text-[#A8A29E]">Total Students</span>
        </div>
        <div className="bg-white dark:bg-[#1C1917] border border-[#E7E5E4] dark:border-[#44403C] rounded-2xl p-4 text-center shadow-xs">
          <b className="block text-xl md:text-2xl text-[#1C1917] dark:text-[#F5F5F4]">
            {new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
          </b>
          <span className="text-xs md:text-sm font-semibold text-[#78716C] dark:text-[#A8A29E]">Today</span>
        </div>
      </div>

      {/* Class Snapshot */}
      {totalStudents > 0 && (tools.attendance || tools.results || tools.funds) && (
        <div className="bg-white dark:bg-[#1C1917] border border-[#E7E5E4] dark:border-[#44403C] border-l-4 border-l-[#B91C1C] dark:border-l-[#F87171] rounded-2xl p-4 shadow-xs">
          <h3 className="text-base font-bold text-[#1C1917] dark:text-[#F5F5F4] mb-1 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-red-800 dark:text-red-400" />
            <span>Class Snapshot</span>
          </h3>
          <p className="text-xs text-[#78716C] dark:text-[#A8A29E] mb-3">How your class is doing right now.</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {tools.attendance && (
              <div className="p-3.5 rounded-xl bg-[#FAFAF9] dark:bg-[#0C0A09] border border-[#E7E5E4] dark:border-[#44403C]">
                <b className="block text-xl text-[#1C1917] dark:text-[#F5F5F4]">
                  {attThisMonth.denom ? `${attThisMonth.pct}%` : "—"}
                </b>
                <span className="text-xs font-semibold block text-[#78716C] dark:text-[#A8A29E]">Month Attendance</span>
                <div className="mt-1">{trendIndicator}</div>
                <div className="text-[11px] font-bold text-[#2E5A8A] dark:text-[#8AB4DC] mt-1">
                  Today: {todayDenom ? `${todayPct}%` : "—"}
                </div>
              </div>
            )}

            {tools.results && (
              <>
                <div className="p-3.5 rounded-xl bg-[#FAFAF9] dark:bg-[#0C0A09] border border-[#E7E5E4] dark:border-[#44403C]">
                  <b className="block text-xl text-[#1C1917] dark:text-[#F5F5F4]">
                    {asmtStats && asmtStats.entered ? `${asmtStats.avg}%` : "—"}
                  </b>
                  <span className="text-xs font-semibold block text-[#78716C] dark:text-[#A8A29E]">Latest Test Avg</span>
                  <span className="text-[11px] text-[#A8A29E] block truncate mt-1">
                    {latestAsmt ? latestAsmt.name : "No tests yet"}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-[#FAFAF9] dark:bg-[#0C0A09] border border-[#E7E5E4] dark:border-[#44403C]">
                  <b className="block text-xl text-[#1C1917] dark:text-[#F5F5F4]">
                    {asmtStats && asmtStats.entered ? `${asmtStats.passRate}%` : "—"}
                  </b>
                  <span className="text-xs font-semibold block text-[#78716C] dark:text-[#A8A29E]">Pass Rate</span>
                  <span className="text-[11px] text-[#A8A29E] block mt-1">
                    {asmtStats && asmtStats.entered ? `${asmtStats.passed} of ${asmtStats.entered} passed` : "—"}
                  </span>
                </div>
              </>
            )}

            {tools.funds && (
              <div className="p-3.5 rounded-xl bg-[#FAFAF9] dark:bg-[#0C0A09] border border-[#E7E5E4] dark:border-[#44403C]">
                <b className="block text-xl text-[#1C1917] dark:text-[#F5F5F4]">
                  {fundsSummary.fundCount ? `${fundsSummary.pct}%` : "—"}
                </b>
                <span className="text-xs font-semibold block text-[#78716C] dark:text-[#A8A29E]">Funds Collected</span>
                <span className="text-[11px] text-[#A8A29E] block truncate mt-1">
                  {fundsSummary.fundCount ? `${fmtMoney(fundsSummary.collected)} / ${fmtMoney(fundsSummary.target)}` : "No funds yet"}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Today's Attendance Card */}
      {tools.attendance && totalStudents > 0 && (
        <div className={`bg-white dark:bg-[#1C1917] border border-[#E7E5E4] dark:border-[#44403C] rounded-2xl p-4 shadow-xs border-l-4 ${
          !day ? 'border-l-[#B4791F]' : day.holiday ? 'border-l-[#2E5A8A]' : (c.absent ? 'border-l-[#B23A32]' : 'border-l-[#065F46]')
        }`}>
          <h3 className="text-base font-bold text-[#1C1917] dark:text-[#F5F5F4] mb-1 flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-red-800 dark:text-red-400" />
            <span>Today's Attendance</span>
          </h3>
          <p className="text-xs text-[#78716C] dark:text-[#A8A29E] mb-2">{prettyDate(todayK)}</p>

          {!day ? (
            <div className="p-3 bg-[#FBF0D9] dark:bg-[#3A2E14] border border-[#B4791F] rounded-xl text-[#7A5515] dark:text-[#F8E0A0] text-xs font-medium mb-3">
              Attendance not taken yet for today.
            </div>
          ) : day.holiday ? (
            <div className="p-3 bg-[#E8F0F7] dark:bg-[#1A2B3A] border border-[#2E5A8A] rounded-xl text-[#1E4D6B] dark:text-[#8AB4DC] text-xs font-medium mb-3 flex items-center gap-1.5">
              <Sun className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
              <span>Today is marked as a Class Holiday (not counted).</span>
            </div>
          ) : (
            <div className="space-y-2 mb-3">
              <div className="text-xs font-medium text-[#78716C] dark:text-[#A8A29E] flex items-center gap-1 flex-wrap">
                <b className="text-[#065F46] dark:text-[#6EE7B7]">{c.present}</b> present,{" "}
                <b className={c.absent > 0 ? "text-[#7F1D1D] dark:text-[#F0C8C0]" : "text-[#065F46] dark:text-[#6EE7B7]"}>{c.absent}</b> absent,{" "}
                <b className="text-[#7A5515] dark:text-[#F8E0A0]">{c.leave}</b> on leave, of {c.total} students
                {c.locked && (
                  <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-[#F5F5F4] dark:bg-[#292524] font-bold">
                    <Lock className="w-3 h-3" /> Locked
                  </span>
                )}
              </div>

              {c.absent > 0 && (
                <div className="p-2.5 bg-[#F8E4E1] dark:bg-[#3A211E] border border-[#B23A32] dark:border-[#E06A5F] rounded-xl text-xs text-[#7F1D1D] dark:text-[#F0C8C0] flex items-start gap-1.5">
                  <XCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
                  <div>
                    <b>Absent:</b>{" "}
                    {sortedStudents
                      .filter(s => day.status[s.id] === 'A')
                      .map(s => `Roll ${s.rollNo || "—"} — ${s.name}`)
                      .join(" • ")}
                  </div>
                </div>
              )}

              {c.leave > 0 && (
                <div className="p-2.5 bg-[#FBF0D9] dark:bg-[#3A2E14] border border-[#B4791F] rounded-xl text-xs text-[#7A5515] dark:text-[#F8E0A0] flex items-start gap-1.5">
                  <Sun className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                  <div>
                    <b>Leave (excused):</b>{" "}
                    {sortedStudents
                      .filter(s => day.status[s.id] === 'L')
                      .map(s => `Roll ${s.rollNo || "—"} — ${s.name}`)
                      .join(" • ")}
                  </div>
                </div>
              )}

              {c.absent === 0 && c.leave === 0 && (
                <div className="p-2.5 bg-[#D1FAE5] dark:bg-[#064E3B] border border-[#065F46] dark:border-[#34D399] rounded-xl text-xs text-[#065F46] dark:text-[#A7F3D0] font-medium flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>Everyone is present today.</span>
                </div>
              )}
            </div>
          )}

          {renderHeatmap()}

          <div className="mt-3.5">
            <button
              type="button"
              onClick={() => setActiveTab("attendance")}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-[#B91C1C] text-white hover:bg-[#991B1B] transition-colors cursor-pointer"
            >
              {!day ? "Take Attendance →" : "Open Attendance →"}
            </button>
          </div>
        </div>
      )}

      {/* Recent Assessments Card */}
      {tools.results && data.assessments.length > 0 && (
        <div className="bg-white dark:bg-[#1C1917] border border-[#E7E5E4] dark:border-[#44403C] rounded-2xl p-4 shadow-xs border-l-4 border-l-[#2E5A8A]">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-base font-bold text-[#1C1917] dark:text-[#F5F5F4] flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-sky-700 dark:text-sky-400" />
              <span>Results</span>
            </h3>
            <button
              type="button"
              onClick={() => setActiveTab("results")}
              className="text-xs font-bold text-[#B91C1C] dark:text-[#FCA5A5] hover:underline cursor-pointer"
            >
              See all ({data.assessments.length}) →
            </button>
          </div>

          <div className="divide-y divide-[#E7E5E4] dark:divide-[#44403C]">
            {data.assessments.slice(-3).reverse().map(a => {
              const entered = assessmentEntryCount(a.id);
              const progressPct = totalStudents ? Math.round((entered / totalStudents) * 100) : 0;
              const complete = entered >= totalStudents && totalStudents > 0;

              return (
                <div key={a.id} className="py-2.5 flex justify-between items-center gap-2">
                  <div className="min-w-0">
                    <b className="block text-sm text-[#1C1917] dark:text-[#F5F5F4] truncate">{a.name}</b>
                    <span className="text-xs text-[#78716C] dark:text-[#A8A29E]">
                      {entered}/{totalStudents} entered • {a.subjects.length} subj
                    </span>
                    <div className="w-24 md:w-36 h-1.5 bg-[#F5F5F4] dark:bg-[#292524] rounded-full overflow-hidden mt-1">
                      <div className="h-full bg-[#065F46] transition-all" style={{ width: `${progressPct}%` }} />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveAssessmentId(a.id);
                      setActiveTab("results");
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 cursor-pointer ${
                      complete
                        ? 'bg-[#F5F5F4] dark:bg-[#292524] text-[#1C1917] dark:text-[#F5F5F4]'
                        : 'bg-[#B91C1C] text-white hover:bg-[#991B1B]'
                    }`}
                  >
                    {complete ? "Open" : "Continue"} →
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent Funds Card */}
      {tools.funds && data.funds.length > 0 && (
        <div className="bg-white dark:bg-[#1C1917] border border-[#E7E5E4] dark:border-[#44403C] rounded-2xl p-4 shadow-xs border-l-4 border-l-[#B4791F]">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-base font-bold text-[#1C1917] dark:text-[#F5F5F4] flex items-center gap-2">
              <Wallet className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span>Funds</span>
            </h3>
            <button
              type="button"
              onClick={() => setActiveTab("funds")}
              className="text-xs font-bold text-[#B91C1C] dark:text-[#FCA5A5] hover:underline cursor-pointer"
            >
              See all ({data.funds.length}) →
            </button>
          </div>

          <div className="divide-y divide-[#E7E5E4] dark:divide-[#44403C]">
            {data.funds.slice(-3).reverse().map(f => {
              const st = computeFundStats(f.id);
              const overdue = f.dueDate && f.dueDate < todayKey() && st.pct < 100;

              return (
                <div key={f.id} className="py-2.5 flex justify-between items-center gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <b className="text-sm text-[#1C1917] dark:text-[#F5F5F4] truncate">{f.name}</b>
                      {overdue && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#F8E4E1] text-[#7F1D1D]">
                          <AlertTriangle className="w-3 h-3" /> Overdue
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-[#78716C] dark:text-[#A8A29E]">
                      {st.variable ? "Variable" : `${fmtMoney(f.amount)}/student`} • Collected:{" "}
                      <b className="text-[#065F46] dark:text-[#6EE7B7]">{fmtMoney(st.collected)}</b>
                      {!st.variable && st.pending > 0 && (
                        <span> • Pending: <b className="text-[#7F1D1D] dark:text-[#F0C8C0]">{fmtMoney(st.pending)}</b></span>
                      )}
                    </span>
                    <div className="w-24 md:w-36 h-1.5 bg-[#F5F5F4] dark:bg-[#292524] rounded-full overflow-hidden mt-1">
                      <div className="h-full bg-[#065F46] transition-all" style={{ width: `${Math.min(100, st.pct)}%` }} />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveFundId(f.id);
                      setActiveTab("funds");
                    }}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold bg-[#F5F5F4] dark:bg-[#292524] text-[#1C1917] dark:text-[#F5F5F4] hover:bg-[#E7E5E4] dark:hover:bg-[#44403C] shrink-0 cursor-pointer"
                  >
                    Open →
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Students Preview Table */}
      <div className="bg-white dark:bg-[#1C1917] border border-[#E7E5E4] dark:border-[#44403C] rounded-2xl p-4 shadow-xs">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-base font-bold text-[#1C1917] dark:text-[#F5F5F4]">
            Students Preview
          </h3>
          {totalStudents > 5 && (
            <button
              type="button"
              onClick={() => setActiveTab("view")}
              className="text-xs font-bold text-[#B91C1C] dark:text-[#FCA5A5] hover:underline cursor-pointer"
            >
              View All ({totalStudents}) →
            </button>
          )}
        </div>

        {totalStudents === 0 ? (
          <div className="text-center py-8 text-[#78716C] dark:text-[#A8A29E] bg-[#FAFAF9] dark:bg-[#0C0A09] border border-dashed border-[#D6D3D1] dark:border-[#44403C] rounded-2xl flex flex-col items-center justify-center">
            <GraduationCap className="w-10 h-10 mb-2 text-stone-400 dark:text-stone-600" />
            <span>No students enrolled yet. Go to Students tab to add them.</span>
          </div>
        ) : (
          <div className="overflow-x-auto border border-[#E7E5E4] dark:border-[#44403C] rounded-xl">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-[#FAFAF9] dark:bg-[#292524] text-[#1C1917] dark:text-[#F5F5F4]">
                  <th className="p-2 border border-[#E7E5E4] dark:border-[#44403C] w-12 text-center">#</th>
                  <th className="p-2 border border-[#E7E5E4] dark:border-[#44403C] w-16 text-center">Roll</th>
                  <th className="p-2 border border-[#E7E5E4] dark:border-[#44403C]">Name</th>
                  <th className="p-2 border border-[#E7E5E4] dark:border-[#44403C]">Father Name</th>
                </tr>
              </thead>
              <tbody>
                {sortedStudents.slice(0, 5).map((s, idx) => (
                  <tr key={s.id} className="even:bg-[#FAFAF9] dark:even:bg-[#0C0A09]">
                    <td className="p-2 border border-[#E7E5E4] dark:border-[#44403C] text-center font-bold">{idx + 1}</td>
                    <td className="p-2 border border-[#E7E5E4] dark:border-[#44403C] text-center font-mono font-bold">{s.rollNo || "—"}</td>
                    <td className="p-2 border border-[#E7E5E4] dark:border-[#44403C] font-semibold">{s.name || "—"}</td>
                    <td className="p-2 border border-[#E7E5E4] dark:border-[#44403C] text-[#78716C] dark:text-[#A8A29E]">{s.fatherName || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* My Tools Card at the very bottom of Home */}
      <MyToolsCard className="mt-1" />
    </div>
  );
};

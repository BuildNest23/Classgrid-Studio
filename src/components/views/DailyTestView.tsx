import React, { useState, useMemo } from 'react';
import { useClassroom } from '../../context/ClassroomContext';
import { ActionGrid, ActionButton } from '../ActionGrid';
import { HowItWorks } from '../HowItWorks';
import {
  todayKey,
  dateKey,
  parseKey,
  prettyDate,
  getSortedStudents,
  gridNavKeyDown,
  gridTabIndex,
} from '../../utils/helpers';
import { previewPrint } from '../../utils/printPreviewBus';
import { generateDailyTestRegisterHTML, DailyTestHeaderOptions } from '../../utils/dailyTestPrint';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Printer,
  Trash2,
  Users,
  CheckCircle2,
  FileSpreadsheet,
  Sparkles
} from 'lucide-react';

const PRINT_OPTS_KEY = 'classgrid_dt_print_opts';

interface DtPrintOpts extends DailyTestHeaderOptions {
  blankWithNames: boolean;
}

const DEFAULT_PRINT_OPTS: DtPrintOpts = {
  blankWithNames: false,
  showSchool: false,
  showEmis: false,
  showClass: false,
  showSection: false,
  showMonth: false
};

function loadPrintOpts(): DtPrintOpts {
  try {
    const raw = localStorage.getItem(PRINT_OPTS_KEY);
    if (raw) return { ...DEFAULT_PRINT_OPTS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return DEFAULT_PRINT_OPTS;
}

export const DailyTestView: React.FC = () => {
  const {
    data,
    saveData,
    quickSaveData,
    flushSave,
    toast,
    uiConfirm,
    setActiveTab
  } = useClassroom();

  const [selectedDate, setSelectedDate] = useState<string>(todayKey());
  const selectedMonth = selectedDate.slice(0, 7); // "YYYY-MM"

  // Print options (apply to both the filled and the blank register); remembered on this device
  const [printOpts, setPrintOpts] = useState<DtPrintOpts>(loadPrintOpts);
  const setOpt = (k: keyof DtPrintOpts, v: boolean) => {
    setPrintOpts(prev => {
      const next = { ...prev, [k]: v };
      try { localStorage.setItem(PRINT_OPTS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };
  const headerOpts: DailyTestHeaderOptions = {
    showSchool: printOpts.showSchool,
    showEmis: printOpts.showEmis,
    showClass: printOpts.showClass,
    showSection: printOpts.showSection,
    showMonth: printOpts.showMonth
  };

  const sortedStudents = useMemo(() => getSortedStudents(data.students), [data.students]);

  // Date Navigation helpers
  const shiftDate = (delta: number) => {
    const d = parseKey(selectedDate);
    d.setDate(d.getDate() + delta);
    setSelectedDate(dateKey(d));
  };

  const handleMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (!val) return;
    const [y, m] = val.split('-');
    // Set to 1st of that month
    setSelectedDate(`${y}-${m}-01`);
  };

  // Month metadata
  const [yearStr, monthStr] = selectedMonth.split('-');
  const yearNum = parseInt(yearStr, 10);
  const monthNum = parseInt(monthStr, 10);
  const daysInMonth = useMemo(() => {
    return new Date(yearNum, monthNum, 0).getDate();
  }, [yearNum, monthNum]);

  const monthName = useMemo(() => {
    return new Date(yearNum, monthNum - 1, 1).toLocaleString('en-US', { month: 'long' });
  }, [yearNum, monthNum]);

  // Days in month that have at least one test recorded
  const monthDaysWithMarks = useMemo(() => {
    const markedDays = new Set<number>();
    for (let d = 1; d <= daysInMonth; d++) {
      const k = `${yearStr}-${String(monthNum).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const rec = data.dailyTests[k];
      if (rec && Object.keys(rec).length > 0) {
        markedDays.add(d);
      }
    }
    return markedDays;
  }, [data.dailyTests, daysInMonth, yearStr, monthNum]);

  // Current day test entries
  const currentDayEntries = data.dailyTests[selectedDate] || {};

  // Current day statistics
  const dayStats = useMemo(() => {
    let presentCount = 0;
    let absentCount = 0;
    let totalMarks = 0;
    let below5Count = 0;

    sortedStudents.forEach(s => {
      const v = currentDayEntries[s.id];
      if (v === 'A') {
        absentCount++;
      } else if (typeof v === 'number') {
        presentCount++;
        totalMarks += v;
        if (v < 5) below5Count++;
      }
    });

    const totalMarked = presentCount + absentCount;
    const avg = presentCount > 0 ? (totalMarks / presentCount).toFixed(1) : '—';
    const pendingCount = Math.max(0, sortedStudents.length - totalMarked);

    return {
      presentCount,
      absentCount,
      totalMarked,
      avg,
      below5Count,
      pendingCount
    };
  }, [sortedStudents, currentDayEntries]);

  // Handle Mark Change
  const handleMarkChange = (studentId: string, rawVal: string) => {
    const trimmed = rawVal.trim();
    if (trimmed === '') {
      // Clear mark
      quickSaveData(prev => {
        const dayMap = { ...(prev.dailyTests[selectedDate] || {}) };
        delete dayMap[studentId];
        return {
          ...prev,
          dailyTests: {
            ...prev.dailyTests,
            [selectedDate]: dayMap
          }
        };
      });
      return;
    }

    const num = parseFloat(trimmed);
    if (isNaN(num)) {
      toast('Please enter a valid number (0–10) or tap A.', 'error');
      return;
    }

    if (num < 0) {
      toast('Marks cannot be negative.', 'error');
      return;
    }

    if (num > 10) {
      toast('Maximum daily quick test mark is 10.', 'error');
      return;
    }

    // Step in 0.5 or whole number
    const rounded = Math.round(num * 10) / 10;

    quickSaveData(prev => {
      const dayMap = { ...(prev.dailyTests[selectedDate] || {}) };
      dayMap[studentId] = rounded;
      return {
        ...prev,
        dailyTests: {
          ...prev.dailyTests,
          [selectedDate]: dayMap
        }
      };
    });
  };

  // Handle Toggle Absent ('A')
  const handleToggleAbsent = (studentId: string) => {
    const cur = currentDayEntries[studentId];
    saveData(prev => {
      const dayMap = { ...(prev.dailyTests[selectedDate] || {}) };
      if (cur === 'A') {
        delete dayMap[studentId];
      } else {
        dayMap[studentId] = 'A';
      }
      return {
        ...prev,
        dailyTests: {
          ...prev.dailyTests,
          [selectedDate]: dayMap
        }
      };
    });
  };

  // Quick Action 1: Pre-fill 'A' from Attendance for this date
  const handleSyncAbsentsFromAttendance = () => {
    const attendanceDay = data.attendance[selectedDate];
    // A roll call with everyone present is stored as an empty status map ("Mark All Present"),
    // so only a missing day means "not recorded". Holidays are checked before counting absentees.
    if (!attendanceDay) {
      toast(`No attendance roll call recorded for ${prettyDate(selectedDate)}.`, 'info');
      return;
    }

    if (attendanceDay.holiday) {
      toast('Selected date is marked as a School Holiday.', 'info');
      return;
    }

    const absentIds = sortedStudents.filter(s => (attendanceDay.status || {})[s.id] === 'A').map(s => s.id);
    const markedCount = absentIds.length;
    if (markedCount > 0) {
      saveData(prev => {
        const dayMap = { ...(prev.dailyTests[selectedDate] || {}) };
        absentIds.forEach(sid => { dayMap[sid] = 'A'; });
        return {
          ...prev,
          dailyTests: {
            ...prev.dailyTests,
            [selectedDate]: dayMap
          }
        };
      });
    }

    if (markedCount > 0) {
      toast(`Marked ${markedCount} absent student${markedCount === 1 ? '' : 's'} from today's attendance.`, 'success');
    } else {
      toast('No absent students found in Attendance for this date (all were present).', 'info');
    }
  };

  // Quick Action 2: Clear this day's entries
  const handleClearDay = async () => {
    const count = Object.keys(currentDayEntries).length;
    if (count === 0) {
      toast('No marks recorded for this date.', 'info');
      return;
    }

    const ok = await uiConfirm(`Clear all test entries for ${prettyDate(selectedDate)}?\n\nThis will remove marks for ${count} students on this day.`, {
      title: 'Clear Day Marks',
      danger: true,
      yesText: 'Clear Marks',
      icon: 'warning'
    });
    if (!ok) return;

    saveData(prev => {
      const nextDaily = { ...prev.dailyTests };
      delete nextDaily[selectedDate];
      return {
        ...prev,
        dailyTests: nextDaily
      };
    });
    toast(`Cleared marks for ${prettyDate(selectedDate)}.`, 'success');
  };

  // Quick Action 3: Print Register for selected month
  const handlePrintRegister = async () => {
    if (sortedStudents.length === 0) {
      toast('No students in class. Add students before printing register.', 'error');
      return;
    }
    const html = generateDailyTestRegisterHTML(data, {
      monthKey: selectedMonth,
      isBlank: false,
      header: headerOpts
    });
    const ok = await previewPrint({ html: html, orientation: 'landscape' }, data);
    if (!ok) toast("Could not open the print dialog. Try again.", "error");
  };

  // Quick Action 4: Print Blank Register
  const handlePrintBlankRegister = async () => {
    const html = generateDailyTestRegisterHTML(data, {
      monthKey: selectedMonth,
      isBlank: true,
      blankWithNames: printOpts.blankWithNames && sortedStudents.length > 0,
      header: headerOpts
    });
    const ok = await previewPrint({ html: html, orientation: 'landscape' }, data);
    if (!ok) toast("Could not open the print dialog. Try again.", "error");
  };

  if (sortedStudents.length === 0) {
    return (
      <div className="space-y-6">
        <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-3xl p-8 sm:p-12 text-center shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300 mx-auto flex items-center justify-center mb-4">
            <Users className="w-8 h-8" />
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-stone-900 dark:text-stone-100 mb-2">
            No Students Found
          </h2>
          <p className="text-sm text-stone-500 dark:text-stone-400 max-w-md mx-auto mb-6">
            To start recording Daily Quick Tests and printing the Punjab SED Register, add students to your class first.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => setActiveTab('students')}
              className="px-5 py-2.5 rounded-xl bg-red-800 hover:bg-red-700 text-white font-bold text-sm transition cursor-pointer"
            >
              Add Students Now
            </button>
            <button
              type="button"
              onClick={handlePrintBlankRegister}
              className="px-5 py-2.5 rounded-xl bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 font-bold text-sm transition cursor-pointer"
            >
              Print Blank Form
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="daily-wrap space-y-5">
      <HowItWorks
        id="dailytest"
        title="How this register works"
        steps={[
          <><b>Pick the date</b> using the arrows or calendar below.</>,
          <><b>Type each student's mark</b> in the table (out of 10), or tap <b>A</b> if absent. Marks save automatically and you can change them any time.</>,
          <><b>Press Print Register</b>: every mark you entered for the month is filled into the form for you. Nothing is typed on the printout by hand.</>,
          <>Want a paper form to write on? Use <b>Print Blank Register</b>.</>
        ]}
        note="Any filled form you see is only a sample. Your own entries replace it."
      />

      {/* Top Header Card: Date, Month & Quick Nav */}
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Day Stepper */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => shiftDate(-1)}
              className="p-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 transition cursor-pointer"
              title="Previous Day"
              aria-label="Previous Day"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <div className="flex-1 sm:flex-initial">
              <input
                type="date"
                value={selectedDate}
                onChange={e => e.target.value && setSelectedDate(e.target.value)}
                className="w-full sm:w-auto px-3.5 py-2 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100 text-sm font-bold shadow-2xs focus:outline-none focus:ring-2 focus:ring-red-600 cursor-pointer"
              />
            </div>

            <button
              type="button"
              onClick={() => shiftDate(1)}
              className="p-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 transition cursor-pointer"
              title="Next Day"
              aria-label="Next Day"
            >
              <ChevronRight className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={() => setSelectedDate(todayKey())}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                selectedDate === todayKey()
                  ? 'bg-red-800 text-white'
                  : 'bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300'
              }`}
            >
              Today
            </button>
          </div>

          {/* Month Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-stone-500 dark:text-stone-400">Month:</span>
            <input
              type="month"
              value={selectedMonth}
              onChange={handleMonthChange}
              className="px-3 py-1.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-stone-800 dark:text-stone-200 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-red-600 cursor-pointer"
            />
          </div>
        </div>

        {/* Month Day Activity Strip */}
        <div className="mt-4 pt-4 border-t border-stone-100 dark:border-stone-800">
          <div className="flex items-center justify-between text-xs font-bold text-stone-500 dark:text-stone-400 mb-2">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>{monthName} {yearNum} Activity</span>
            </span>
            <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
              {monthDaysWithMarks.size} of {daysInMonth} days tested
            </span>
          </div>

          <div className="flex items-center gap-1 overflow-x-auto pb-1.5 scrollbar-thin">
            {Array.from({ length: daysInMonth }, (_, idx) => {
              const dayNum = idx + 1;
              const dateStr = `${yearStr}-${String(monthNum).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
              const isCur = dateStr === selectedDate;
              const hasMarks = monthDaysWithMarks.has(dayNum);

              return (
                <button
                  key={dayNum}
                  type="button"
                  onClick={() => setSelectedDate(dateStr)}
                  className={`flex flex-col items-center justify-center min-w-[32px] h-10 rounded-xl text-xs transition cursor-pointer select-none shrink-0 ${
                    isCur
                      ? 'bg-red-800 text-white font-black shadow-xs ring-2 ring-red-400/50'
                      : hasMarks
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 font-bold hover:bg-emerald-100'
                      : 'bg-stone-100 dark:bg-stone-800/60 text-stone-500 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-800 font-semibold'
                  }`}
                  title={`${dayNum} ${monthName}: ${hasMarks ? 'Marks recorded' : 'No test'}`}
                >
                  <span>{dayNum}</span>
                  {hasMarks && (
                    <span
                      className={`w-1.5 h-1.5 rounded-full mt-0.5 ${
                        isCur ? 'bg-amber-300' : 'bg-emerald-600 dark:bg-emerald-400'
                      }`}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Selected Day Stats & Info Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
        <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-3 text-center shadow-2xs">
          <div className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">Students</div>
          <div className="text-lg font-black text-stone-800 dark:text-stone-100 mt-0.5">
            {sortedStudents.length}
          </div>
        </div>

        <div className="bg-white dark:bg-stone-900 border border-emerald-200 dark:border-emerald-900/50 rounded-2xl p-3 text-center shadow-2xs">
          <div className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Present</div>
          <div className="text-lg font-black text-emerald-700 dark:text-emerald-300 mt-0.5">
            {dayStats.presentCount}
          </div>
        </div>

        <div className="bg-white dark:bg-stone-900 border border-rose-200 dark:border-rose-900/50 rounded-2xl p-3 text-center shadow-2xs">
          <div className="text-[11px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">Absent</div>
          <div className="text-lg font-black text-rose-700 dark:text-rose-300 mt-0.5">
            {dayStats.absentCount}
          </div>
        </div>

        <div className="bg-white dark:bg-stone-900 border border-amber-200 dark:border-amber-900/50 rounded-2xl p-3 text-center shadow-2xs">
          <div className="text-[11px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">Class Avg</div>
          <div className="text-lg font-black text-amber-800 dark:text-amber-300 mt-0.5">
            {dayStats.avg} <span className="text-[11px] text-stone-400 font-bold">/10</span>
          </div>
        </div>

        <div className="col-span-2 sm:col-span-1 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-3 text-center shadow-2xs">
          <div className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">Below 5</div>
          <div className="text-lg font-black text-stone-700 dark:text-stone-300 mt-0.5">
            {dayStats.below5Count}
          </div>
        </div>
      </div>

      {/* Quick Action Grid */}
      <ActionGrid cols={4}>
        <ActionButton
          variant="secondary"
          icon={CheckCircle2}
          onClick={handleSyncAbsentsFromAttendance}
          title="Pre-fill 'A' for students marked absent in attendance for this day"
        >
          Sync Absents from Roll Call
        </ActionButton>

        <ActionButton
          variant="danger"
          icon={Trash2}
          onClick={handleClearDay}
          title="Clear all test entries for this day"
        >
          Clear This Day
        </ActionButton>

        <ActionButton
          variant="primary"
          icon={Printer}
          onClick={handlePrintRegister}
          title="Print official Punjab SED 2-page Register for selected month"
        >
          Print Register ({monthName})
        </ActionButton>

        <ActionButton
          variant="secondary"
          icon={FileSpreadsheet}
          onClick={handlePrintBlankRegister}
          title="Print blank 2-page Punjab SED Daily Test Register"
        >
          Print Blank Register
        </ActionButton>
      </ActionGrid>

      {/* Print Options: apply to both Print Register and Print Blank Register */}
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl px-3 py-2.5 shadow-xs">
        <div className="text-[11px] font-black uppercase tracking-wider text-stone-500 dark:text-stone-400">
          Print options <span className="normal-case font-semibold tracking-normal">· ticked = written on form, else blank</span>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-3.5 gap-y-1.5">
          {([
            ['showSchool', 'School', ''],
            ['showEmis', 'EMIS', data.emisCode ? '' : 'Add EMIS code in Settings'],
            ['showClass', 'Class', ''],
            ['showSection', 'Section', data.section ? '' : 'Add Section in Settings'],
            ['showMonth', 'Month', '']
          ] as [keyof DtPrintOpts, string, string][]).map(([k, label, hint]) => (
            <label key={k} title={hint} className="flex items-center gap-1.5 text-xs font-bold text-stone-700 dark:text-stone-200 cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                checked={printOpts[k]}
                onChange={e => setOpt(k, e.target.checked)}
                className="w-3.5 h-3.5 accent-red-800 cursor-pointer"
              />
              {label}
              {hint && <span className="text-red-700 dark:text-red-400">*</span>}
            </label>
          ))}
          <label className="flex items-center gap-1.5 text-xs font-bold text-stone-700 dark:text-stone-200 cursor-pointer whitespace-nowrap">
            <input
              type="checkbox"
              checked={printOpts.blankWithNames}
              onChange={e => setOpt('blankWithNames', e.target.checked)}
              className="w-3.5 h-3.5 accent-red-800 cursor-pointer"
            />
            Names in blank register
          </label>
        </div>
        {(!data.emisCode || !data.section) && (
          <div className="mt-1 text-[10px] font-semibold text-stone-400">
            * Not set yet; add in Settings
          </div>
        )}
      </div>

      {/* Student Marks Entry Table */}
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl shadow-xs overflow-hidden">
        <div className="px-4 py-3 border-b border-stone-200 dark:border-stone-800 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-1.5 text-sm font-black text-stone-900 dark:text-stone-100">
              <Sparkles className="w-4 h-4 shrink-0 text-red-700 dark:text-red-400" />
              Daily Quick Test Marks
            </h3>
            <p className="mt-0.5 text-xs font-semibold text-stone-500 dark:text-stone-400">
              {prettyDate(selectedDate)}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-stone-100 dark:bg-stone-800 px-2.5 py-1 text-[11px] font-bold text-stone-600 dark:text-stone-300 whitespace-nowrap">
            Out of 10
          </span>
        </div>

        <div>
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="bg-stone-50 dark:bg-stone-950/60 border-b border-stone-200 dark:border-stone-800 text-stone-500 dark:text-stone-400 text-[11px] uppercase tracking-wider font-bold">
                <th className="py-2.5 pl-3 pr-1 w-9 text-center">Sr.</th>
                <th className="py-2.5 px-2">Student</th>
                <th className="py-2.5 px-2 w-20 text-center">Mark</th>
                <th className="py-2.5 pl-1 pr-3 w-16 text-center">Absent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800/70">
              {sortedStudents.map((student, idx) => {
                const markVal = currentDayEntries[student.id];
                const isAbsent = markVal === 'A';
                const numVal = typeof markVal === 'number' ? String(markVal) : '';

                return (
                  <tr
                    key={student.id}
                    className={`transition-colors hover:bg-stone-50/80 dark:hover:bg-stone-800/40 ${
                      isAbsent
                        ? 'bg-rose-50/40 dark:bg-rose-950/20'
                        : markVal !== undefined
                        ? 'bg-emerald-50/30 dark:bg-emerald-950/15'
                        : ''
                    }`}
                  >
                    {/* Sr. No. */}
                    <td className="py-2 pl-3 pr-1 text-center font-bold text-stone-400 text-xs">
                      {idx + 1}
                    </td>

                    {/* Student Name */}
                    <td className="py-2 px-2 font-bold text-stone-900 dark:text-stone-100">
                      <div className="leading-tight">{student.name}</div>
                      <div className="text-[11px] font-normal text-stone-400 leading-tight">
                        Roll {student.rollNo || '—'}
                        {student.fatherName ? ` · s/d of ${student.fatherName}` : ''}
                      </div>
                    </td>

                    {/* Mark Input Box */}
                    <td className="py-2 px-2 text-center">
                      <div className="inline-flex items-center justify-center">
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          max="10"
                          disabled={isAbsent}
                          placeholder={isAbsent ? 'Absent' : '0–10'}
                          value={isAbsent ? '' : numVal}
                          onChange={e => handleMarkChange(student.id, e.target.value)}
                          onBlur={flushSave}
                          inputMode="decimal"
                          enterKeyHint="next"
                          data-dcoord={`${idx}_0`}
                          tabIndex={gridTabIndex(idx, 0, sortedStudents.length)}
                          onKeyDown={e => gridNavKeyDown(e, 'data-dcoord', idx, 0, sortedStudents.length)}
                          className={`w-16 text-center py-1.5 px-2 rounded-xl text-sm font-black border transition focus:outline-none ${
                            isAbsent
                              ? 'bg-stone-100 dark:bg-stone-800 text-stone-400 border-transparent cursor-not-allowed'
                              : numVal !== ''
                              ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 focus:ring-2 focus:ring-emerald-500'
                              : 'border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-red-500'
                          }`}
                        />
                      </div>
                    </td>

                    {/* Absent Toggle Button */}
                    <td className="py-2 pl-1 pr-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleAbsent(student.id)}
                        className={`w-14 py-1.5 rounded-xl text-xs font-black transition cursor-pointer select-none ${
                          isAbsent
                            ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-2xs ring-2 ring-rose-400/50'
                            : 'bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-600 dark:text-stone-300'
                        }`}
                        title={isAbsent ? 'Click to unmark absent' : 'Mark as Absent (A)'}
                      >
                        {isAbsent ? 'Absent' : 'A'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

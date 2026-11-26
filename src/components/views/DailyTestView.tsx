import React, { useState, useMemo } from 'react';
import { useClassroom } from '../../context/ClassroomContext';
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
  ChevronLeft,
  ChevronRight,
  Printer,
  Trash2,
  GraduationCap,
  CheckCircle2,
  FileSpreadsheet,
  SlidersHorizontal,
  Search,
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
  showMonth: false,
};

function loadPrintOpts(): DtPrintOpts {
  try {
    const raw = localStorage.getItem(PRINT_OPTS_KEY);
    if (raw) return { ...DEFAULT_PRINT_OPTS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
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
    setActiveTab,
  } = useClassroom();

  const [selectedDate, setSelectedDate] = useState<string>(todayKey());
  const [showPrintOptions, setShowPrintOptions] = useState(false);
  const [search, setSearch] = useState('');
  const selectedMonth = selectedDate.slice(0, 7);

  // Print options (apply to both the filled and the blank register); remembered on this device
  const [printOpts, setPrintOpts] = useState<DtPrintOpts>(loadPrintOpts);
  const setOpt = (k: keyof DtPrintOpts, v: boolean) => {
    setPrintOpts(prev => {
      const next = { ...prev, [k]: v };
      try {
        localStorage.setItem(PRINT_OPTS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };
  const headerOpts: DailyTestHeaderOptions = {
    showSchool: printOpts.showSchool,
    showEmis: printOpts.showEmis,
    showClass: printOpts.showClass,
    showSection: printOpts.showSection,
    showMonth: printOpts.showMonth,
  };

  const sortedStudents = useMemo(() => getSortedStudents(data.students), [data.students]);

  const shiftDate = (delta: number) => {
    const d = parseKey(selectedDate);
    d.setDate(d.getDate() + delta);
    setSelectedDate(dateKey(d));
  };

  const handleMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (!val) return;
    const [y, m] = val.split('-');
    setSelectedDate(`${y}-${m}-01`);
  };

  const [yearStr, monthStr] = selectedMonth.split('-');
  const yearNum = parseInt(yearStr, 10);
  const monthNum = parseInt(monthStr, 10);
  const daysInMonth = useMemo(() => new Date(yearNum, monthNum, 0).getDate(), [yearNum, monthNum]);

  const monthName = useMemo(
    () => new Date(yearNum, monthNum - 1, 1).toLocaleString('en-US', { month: 'long' }),
    [yearNum, monthNum]
  );

  // Days in month that have at least one current student mark recorded
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

  const currentDayEntries = data.dailyTests[selectedDate] || {};

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
      pendingCount,
    };
  }, [sortedStudents, currentDayEntries]);

  const handleMarkChange = (studentId: string, rawVal: string) => {
    const trimmed = rawVal.trim();
    if (trimmed === '') {
      quickSaveData(prev => {
        const dayMap = { ...(prev.dailyTests[selectedDate] || {}) };
        delete dayMap[studentId];
        const nextDaily = { ...prev.dailyTests };
        if (Object.keys(dayMap).length === 0) {
          delete nextDaily[selectedDate];
        } else {
          nextDaily[selectedDate] = dayMap;
        }
        return { ...prev, dailyTests: nextDaily };
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

    const rounded = Math.round(num * 10) / 10;

    quickSaveData(prev => {
      const dayMap = { ...(prev.dailyTests[selectedDate] || {}) };
      dayMap[studentId] = rounded;
      return {
        ...prev,
        dailyTests: {
          ...prev.dailyTests,
          [selectedDate]: dayMap,
        },
      };
    });
  };

  const handleToggleAbsent = (studentId: string) => {
    const cur = currentDayEntries[studentId];
    saveData(prev => {
      const dayMap = { ...(prev.dailyTests[selectedDate] || {}) };
      if (cur === 'A') {
        delete dayMap[studentId];
      } else {
        dayMap[studentId] = 'A';
      }
      const nextDaily = { ...prev.dailyTests };
      if (Object.keys(dayMap).length === 0) {
        delete nextDaily[selectedDate];
      } else {
        nextDaily[selectedDate] = dayMap;
      }
      return { ...prev, dailyTests: nextDaily };
    });
  };

  const handleSyncAbsentsFromAttendance = () => {
    const attendanceDay = data.attendance[selectedDate];
    if (!attendanceDay) {
      toast(`No attendance roll call recorded for ${prettyDate(selectedDate)}.`, 'info');
      return;
    }
    if (attendanceDay.holiday) {
      toast('Selected date is marked as a School Holiday.', 'info');
      return;
    }

    const absentIds = sortedStudents
      .filter(s => (attendanceDay.status || {})[s.id] === 'A')
      .map(s => s.id);
    const markedCount = absentIds.length;
    if (markedCount > 0) {
      saveData(prev => {
        const dayMap = { ...(prev.dailyTests[selectedDate] || {}) };
        absentIds.forEach(sid => {
          dayMap[sid] = 'A';
        });
        return {
          ...prev,
          dailyTests: {
            ...prev.dailyTests,
            [selectedDate]: dayMap,
          },
        };
      });
      toast(
        `Marked ${markedCount} absent student${markedCount === 1 ? '' : 's'} from roll call.`,
        'success'
      );
    } else {
      toast('No absent students found in Attendance for this date.', 'info');
    }
  };

  const handleClearDay = async () => {
    const count = Object.keys(currentDayEntries).length;
    if (count === 0) {
      toast('No marks recorded for this date.', 'info');
      return;
    }

    const ok = await uiConfirm(
      `Clear all test entries for ${prettyDate(selectedDate)}?\n\nThis will remove marks for ${count} students on this day.`,
      {
        title: 'Clear Day Marks',
        danger: true,
        yesText: 'Clear Marks',
        icon: 'warning',
      }
    );
    if (!ok) return;

    saveData(prev => {
      const nextDaily = { ...prev.dailyTests };
      delete nextDaily[selectedDate];
      return { ...prev, dailyTests: nextDaily };
    });
    toast(`Cleared marks for ${prettyDate(selectedDate)}.`, 'success');
  };

  const handlePrintRegister = async () => {
    if (sortedStudents.length === 0) {
      toast('No students in class. Add students before printing register.', 'error');
      return;
    }
    const html = generateDailyTestRegisterHTML(data, {
      monthKey: selectedMonth,
      isBlank: false,
      header: headerOpts,
    });
    const ok = await previewPrint({ html, orientation: 'landscape' }, data);
    if (!ok) toast('Could not open the print dialog. Try again.', 'error');
  };

  const handlePrintBlankRegister = async () => {
    const html = generateDailyTestRegisterHTML(data, {
      monthKey: selectedMonth,
      isBlank: true,
      blankWithNames: printOpts.blankWithNames && sortedStudents.length > 0,
      header: headerOpts,
    });
    const ok = await previewPrint({ html, orientation: 'landscape' }, data);
    if (!ok) toast('Could not open the print dialog. Try again.', 'error');
  };

  const q = search.trim().toLowerCase();
  const visibleStudents = q
    ? sortedStudents.filter(
        s =>
          (s.name || '').toLowerCase().includes(q) ||
          (s.fatherName || '').toLowerCase().includes(q) ||
          (s.rollNo || '').toLowerCase().includes(q)
      )
    : sortedStudents;

  const hasDayEntries = Object.keys(currentDayEntries).length > 0;

  if (sortedStudents.length === 0) {
    return (
      <div className="space-y-5">
        <div>
          <div className="text-xs font-medium text-stone-500 dark:text-stone-400">
            {data.className || 'Active Class'} · {prettyDate(selectedDate)}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-stone-900 dark:text-stone-100 mt-1">
            Daily Test Register
          </h1>
        </div>

        <section className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 py-12 px-6 text-center">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 flex items-center justify-center">
            <GraduationCap className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-stone-900 dark:text-stone-100 mt-3">
            No students enrolled yet
          </h2>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-1 max-w-sm mx-auto">
            Add students to record 10-mark daily tests and print your filled monthly register, or
            print a blank paper form now.
          </p>
          <div className="flex flex-wrap justify-center gap-2.5 mt-4">
            <button
              type="button"
              onClick={() => setActiveTab('students')}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-red-800 hover:bg-red-900 dark:bg-red-700 dark:hover:bg-red-600 text-white font-semibold text-xs transition-colors cursor-pointer"
            >
              Add students
            </button>
            <button
              type="button"
              onClick={handlePrintBlankRegister}
              className="min-h-[44px] px-5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/70 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-800 dark:text-stone-100 font-semibold text-xs transition-colors cursor-pointer"
            >
              Print blank form
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="daily-wrap space-y-5">
      {/* Institutional Masthead + Register Print Controls */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium text-stone-500 dark:text-stone-400">
            {data.className || 'Active Class'} · {prettyDate(selectedDate)}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-stone-900 dark:text-stone-100 mt-1">
            Daily Test Register
          </h1>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <button
            type="button"
            onClick={handlePrintRegister}
            title="Print filled 2-page monthly register"
            className="flex-1 sm:flex-none min-h-[44px] px-4 py-2 rounded-xl bg-red-800 hover:bg-red-900 dark:bg-red-700 dark:hover:bg-red-600 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer active:scale-[0.98] whitespace-nowrap"
          >
            <Printer className="w-4 h-4" />
            <span>Print register ({monthName})</span>
          </button>

          <button
            type="button"
            onClick={handlePrintBlankRegister}
            title="Print blank 2-page register"
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-800 dark:text-stone-100 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
          >
            <FileSpreadsheet className="w-4 h-4 text-stone-500 dark:text-stone-400" />
            <span>Blank form</span>
          </button>

          <button
            type="button"
            onClick={() => setShowPrintOptions(!showPrintOptions)}
            aria-expanded={showPrintOptions}
            title="Print header options"
            className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
              showPrintOptions
                ? 'border-red-700/70 bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300'
                : 'border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-200'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span className="hidden sm:inline">Print options</span>
          </button>
        </div>
      </div>

      {/* Collapsible Print Header Options */}
      {showPrintOptions && (
        <section className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-4 space-y-2.5">
          <div className="text-xs font-semibold text-stone-800 dark:text-stone-200">
            Print header fields{' '}
            <span className="font-normal text-stone-500 dark:text-stone-400">
              · ticked fields print filled in; unticked stay blank for handwriting
            </span>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {(
              [
                ['showSchool', 'School', ''],
                ['showEmis', 'EMIS', data.emisCode ? '' : 'Add EMIS code in Settings'],
                ['showClass', 'Class', ''],
                ['showSection', 'Section', data.section ? '' : 'Add Section in Settings'],
                ['showMonth', 'Month', ''],
              ] as [keyof DtPrintOpts, string, string][]
            ).map(([k, label, hint]) => (
              <label
                key={k}
                title={hint}
                className="min-h-[36px] inline-flex items-center gap-2 text-xs font-semibold text-stone-800 dark:text-stone-200 cursor-pointer whitespace-nowrap select-none"
              >
                <input
                  type="checkbox"
                  checked={printOpts[k]}
                  onChange={e => setOpt(k, e.target.checked)}
                  className="w-4 h-4 rounded accent-red-800 cursor-pointer"
                />
                <span>{label}</span>
                {hint && <span className="text-red-700 dark:text-red-400">*</span>}
              </label>
            ))}
            <label className="min-h-[36px] inline-flex items-center gap-2 text-xs font-semibold text-stone-800 dark:text-stone-200 cursor-pointer whitespace-nowrap select-none">
              <input
                type="checkbox"
                checked={printOpts.blankWithNames}
                onChange={e => setOpt('blankWithNames', e.target.checked)}
                className="w-4 h-4 rounded accent-red-800 cursor-pointer"
              />
              <span>Names in blank form</span>
            </label>
          </div>
          {(!data.emisCode || !data.section) && (
            <div className="text-[11px] text-stone-400 dark:text-stone-500">
              * Not configured yet — add EMIS code or Section in Settings.
            </div>
          )}
        </section>
      )}

      {/* Date Navigation & Monthly Activity Strip */}
      <section className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Day Stepper */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => shiftDate(-1)}
              className="w-11 h-11 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/70 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-200 flex items-center justify-center cursor-pointer transition-colors shrink-0"
              title="Previous day"
              aria-label="Previous day"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <input
              type="date"
              value={selectedDate}
              onChange={e => e.target.value && setSelectedDate(e.target.value)}
              className="flex-1 sm:flex-initial min-h-[44px] px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-950/60 text-stone-900 dark:text-stone-100 text-xs sm:text-sm font-semibold focus:outline-none focus:border-red-700"
            />
            <button
              type="button"
              onClick={() => shiftDate(1)}
              className="w-11 h-11 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/70 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-200 flex items-center justify-center cursor-pointer transition-colors shrink-0"
              title="Next day"
              aria-label="Next day"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setSelectedDate(todayKey())}
              className={`min-h-[44px] px-3.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer shrink-0 ${
                selectedDate === todayKey()
                  ? 'bg-red-800 dark:bg-red-700 text-white'
                  : 'bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200'
              }`}
            >
              Today
            </button>
          </div>

          {/* Month Picker */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-stone-500 dark:text-stone-400">Month</label>
            <input
              type="month"
              value={selectedMonth}
              onChange={handleMonthChange}
              className="min-h-[40px] px-3 py-1.5 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-950/60 text-stone-900 dark:text-stone-100 text-xs font-semibold focus:outline-none focus:border-red-700"
            />
          </div>
        </div>

        {/* Monthly Day Strip */}
        <div className="pt-3.5 border-t border-stone-100 dark:border-stone-800">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="font-semibold text-stone-700 dark:text-stone-300">
              {monthName} {yearNum}
            </span>
            <span className="text-stone-500 dark:text-stone-400 font-mono-num">
              {monthDaysWithMarks.size} of {daysInMonth} days tested
            </span>
          </div>

          <div className="flex items-center gap-1 overflow-x-auto pb-1">
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
                  className={`relative flex flex-col items-center justify-center min-w-[36px] min-h-[44px] rounded-xl text-xs font-mono-num transition-colors cursor-pointer select-none shrink-0 ${
                    isCur
                      ? 'bg-red-800 dark:bg-red-700 text-white font-bold'
                      : hasMarks
                      ? 'bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300 font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-950'
                      : 'bg-stone-100/80 dark:bg-stone-800/60 text-stone-500 dark:text-stone-400 hover:bg-stone-200/80 dark:hover:bg-stone-800 font-medium'
                  }`}
                  title={`${dayNum} ${monthName}: ${hasMarks ? 'Marks recorded' : 'No test'}`}
                >
                  <span>{dayNum}</span>
                  {hasMarks && (
                    <span
                      aria-hidden="true"
                      className={`w-3.5 h-0.5 rounded-full mt-1 ${
                        isCur ? 'bg-white/80' : 'bg-emerald-600 dark:bg-emerald-400'
                      }`}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Unified Day Pulse Strip */}
      <section className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 overflow-hidden">
        <div className="grid grid-cols-2 sm:grid-cols-5 divide-y sm:divide-y-0 divide-x divide-stone-200 dark:divide-stone-800 text-center">
          <div className="p-3.5">
            <div className="text-xl font-bold font-mono-num text-stone-900 dark:text-stone-100">
              {sortedStudents.length}
            </div>
            <div className="text-[11px] font-medium text-stone-500 dark:text-stone-400 mt-0.5">
              Students
            </div>
          </div>
          <div className="p-3.5">
            <div className="text-xl font-bold font-mono-num text-emerald-700 dark:text-emerald-400">
              {dayStats.presentCount}
            </div>
            <div className="text-[11px] font-medium text-stone-500 dark:text-stone-400 mt-0.5">
              Tested
            </div>
          </div>
          <div className="p-3.5">
            <div className="text-xl font-bold font-mono-num text-red-700 dark:text-red-400">
              {dayStats.absentCount}
            </div>
            <div className="text-[11px] font-medium text-stone-500 dark:text-stone-400 mt-0.5">
              Absent
            </div>
          </div>
          <div className="p-3.5">
            <div className="text-xl font-bold font-mono-num text-stone-900 dark:text-stone-100">
              {dayStats.avg}
              <span className="text-xs font-medium text-stone-400 dark:text-stone-500">/10</span>
            </div>
            <div className="text-[11px] font-medium text-stone-500 dark:text-stone-400 mt-0.5">
              Class avg
            </div>
          </div>
          <div className="col-span-2 sm:col-span-1 p-3.5">
            <div
              className={`text-xl font-bold font-mono-num ${
                dayStats.below5Count > 0
                  ? 'text-amber-700 dark:text-amber-400'
                  : 'text-stone-700 dark:text-stone-300'
              }`}
            >
              {dayStats.below5Count}
            </div>
            <div className="text-[11px] font-medium text-stone-500 dark:text-stone-400 mt-0.5">
              Below 5
            </div>
          </div>
        </div>
      </section>

      {/* Marks Entry Table */}
      <section className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 border-b border-stone-100 dark:border-stone-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100">
              Marks entry · Out of 10
            </h2>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              {prettyDate(selectedDate)}
              {dayStats.pendingCount > 0 && (
                <span className="font-mono-num"> · {dayStats.pendingCount} remaining</span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {sortedStudents.length >= 12 && (
              <div className="relative flex-1 sm:w-44">
                <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Filter…"
                  className="w-full min-h-[40px] pl-8 pr-3 py-1.5 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-950/60 text-xs text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:border-red-700"
                />
              </div>
            )}

            <button
              type="button"
              onClick={handleSyncAbsentsFromAttendance}
              title="Pre-fill 'A' for students marked absent in Attendance for this day"
              className="min-h-[40px] px-3 py-1.5 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/70 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-800 dark:text-stone-100 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-red-800 dark:text-red-400" />
              <span>Sync absents</span>
            </button>

            <button
              type="button"
              onClick={handleClearDay}
              disabled={!hasDayEntries}
              title="Clear all test entries for this day"
              className="min-h-[40px] px-3 py-1.5 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 hover:bg-red-50 dark:hover:bg-red-950/40 text-stone-500 hover:text-red-700 dark:text-stone-400 dark:hover:text-red-400 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-35 whitespace-nowrap"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear day</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="bg-stone-50 dark:bg-stone-800/70 border-b border-stone-200 dark:border-stone-800 text-stone-500 dark:text-stone-400 text-xs font-semibold">
                <th className="py-2.5 pl-4 pr-1 w-10 text-center">#</th>
                <th className="py-2.5 px-2">Student</th>
                <th className="py-2.5 px-2 w-24 text-center">Mark</th>
                <th className="py-2.5 pl-1 pr-4 w-20 text-center">Absent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {visibleStudents.map((student, idx) => {
                const markVal = currentDayEntries[student.id];
                const isAbsent = markVal === 'A';
                const numVal = typeof markVal === 'number' ? String(markVal) : '';

                return (
                  <tr
                    key={student.id}
                    className={`transition-colors ${
                      isAbsent
                        ? 'bg-red-50/40 dark:bg-red-950/20'
                        : markVal !== undefined
                        ? 'bg-emerald-50/30 dark:bg-emerald-950/15'
                        : 'hover:bg-stone-50/60 dark:hover:bg-stone-800/30'
                    }`}
                  >
                    <td className="py-2.5 pl-4 pr-1 text-center font-mono-num text-xs font-semibold text-stone-400 dark:text-stone-500">
                      {idx + 1}
                    </td>

                    <td className="py-2.5 px-2">
                      <div className="font-semibold text-stone-900 dark:text-stone-100 leading-snug">
                        {student.name || '(no name)'}
                      </div>
                      <div className="text-xs text-stone-500 dark:text-stone-400 leading-snug">
                        <span className="font-mono-num">Roll {student.rollNo || '—'}</span>
                        {student.fatherName ? ` · s/o ${student.fatherName}` : ''}
                      </div>
                    </td>

                    <td className="py-2 px-2 text-center">
                      <div className="inline-flex items-center justify-center">
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          max="10"
                          disabled={isAbsent}
                          placeholder={isAbsent ? '—' : '0–10'}
                          value={isAbsent ? '' : numVal}
                          onChange={e => handleMarkChange(student.id, e.target.value)}
                          onBlur={flushSave}
                          inputMode="decimal"
                          enterKeyHint="next"
                          data-dcoord={`${idx}_0`}
                          tabIndex={gridTabIndex(idx, 0, visibleStudents.length)}
                          onKeyDown={e =>
                            gridNavKeyDown(e, 'data-dcoord', idx, 0, visibleStudents.length)
                          }
                          className={`w-16 sm:w-20 min-h-[42px] text-center py-1.5 px-2 rounded-xl text-sm font-bold font-mono-num border transition-colors focus:outline-none ${
                            isAbsent
                              ? 'bg-stone-100 dark:bg-stone-800 text-stone-400 border-transparent cursor-not-allowed'
                              : numVal !== ''
                              ? 'border-emerald-500/80 bg-emerald-50/60 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 focus:border-emerald-600'
                              : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100 focus:border-red-700 dark:focus:border-red-500'
                          }`}
                        />
                      </div>
                    </td>

                    <td className="py-2 pl-1 pr-4 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleAbsent(student.id)}
                        className={`w-14 min-h-[44px] rounded-xl text-xs font-bold transition-colors cursor-pointer select-none active:scale-95 ${
                          isAbsent
                            ? 'bg-red-800 hover:bg-red-900 dark:bg-red-700 text-white'
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
      </section>
    </div>
  );
};

import React, { useState } from 'react';
import { useClassroom } from '../../context/ClassroomContext';
import { AttendanceStatus, Student } from '../../types';
import {
  todayKey,
  parseKey,
  dateKey,
  prettyDate,
  prettyMonth,
  getMonthDays,
  getSortedStudents,
  esc,
} from '../../utils/helpers';
import { previewPrint } from '../../utils/printPreviewBus';
import { downloadAbsenteeSlipPNG } from '../../utils/canvasExport';
import { Capacitor } from '@capacitor/core';
import {
  Check,
  RotateCcw,
  Lock,
  Unlock,
  Sun,
  Calendar,
  Printer,
  Share2,
  GraduationCap,
  XCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Search,
} from 'lucide-react';

export const AttendanceView: React.FC = () => {
  const {
    data,
    saveData,
    toast,
    uiConfirm,
    countDay,
    studentMonthStats,
    showInfoModal,
    closeInfoModal,
    buildPrintHeaderHTML,
    setActiveTab,
  } = useClassroom();

  const [mode, setMode] = useState<'daily' | 'register'>('daily');
  const [attDate, setAttDate] = useState<string>(todayKey());
  const [registerMonth, setRegisterMonth] = useState<string>(todayKey().slice(0, 7));
  const [savingSlipImage, setSavingSlipImage] = useState<boolean>(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'A' | 'L'>('all');

  const key = attDate;
  const day = data.attendance[key];
  const c = countDay(key);
  const locked = !!(day && day.locked);
  const isHoliday = !!(day && day.holiday);
  const isToday = key === todayKey();
  const sortedStudents = getSortedStudents(data.students);

  const shiftDate = (delta: number) => {
    const d = parseKey(attDate);
    d.setDate(d.getDate() + delta);
    const nk = dateKey(d);
    if (nk > todayKey()) {
      toast('Future dates are not allowed.', 'info');
      return;
    }
    setAttDate(nk);
  };

  const shiftMonth = (delta: number) => {
    const [y, m] = registerMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (next > todayKey().slice(0, 7)) return;
    setRegisterMonth(next);
  };

  const handleSetStatus = (sid: string, status: AttendanceStatus) => {
    if (locked) {
      toast('This day is locked. Unlock it first.', 'error');
      return;
    }
    if (isHoliday) {
      toast('Day is marked as Class Holiday.', 'error');
      return;
    }

    saveData(prev => {
      const curDay = prev.attendance[key] || { holiday: false, locked: false, status: {} };
      const nextStatus = { ...curDay.status };
      if (status === 'P') {
        delete nextStatus[sid];
      } else {
        nextStatus[sid] = status;
      }

      return {
        ...prev,
        attendance: {
          ...prev.attendance,
          [key]: {
            ...curDay,
            status: nextStatus,
          },
        },
      };
    });
  };

  const handleMarkAllPresent = () => {
    if (locked) {
      toast('This day is locked.', 'error');
      return;
    }
    saveData(prev => ({
      ...prev,
      attendance: {
        ...prev.attendance,
        [key]: {
          holiday: false,
          locked: false,
          status: {},
        },
      },
    }));
    toast('All students marked present.', 'success');
  };

  const handleResetDay = async () => {
    if (!data.attendance[key]) {
      toast('Nothing to reset for this day.', 'info');
      return;
    }
    const ok = await uiConfirm('Reset attendance for this day?\n\nThis will clear all marks.', {
      title: 'Reset Day',
      yesText: 'Reset',
      danger: true,
      icon: 'warning',
    });
    if (!ok) return;

    saveData(prev => {
      const nextAtt = { ...prev.attendance };
      delete nextAtt[key];
      return { ...prev, attendance: nextAtt };
    });
    toast('Day reset.', 'success');
  };

  const handleToggleHoliday = () => {
    if (locked) {
      toast('This day is locked.', 'error');
      return;
    }
    saveData(prev => {
      const curDay = prev.attendance[key] || { holiday: false, locked: false, status: {} };
      if (curDay.holiday && Object.keys(curDay.status).length === 0 && !curDay.locked) {
        const nextAtt = { ...prev.attendance };
        delete nextAtt[key];
        return { ...prev, attendance: nextAtt };
      }
      return {
        ...prev,
        attendance: {
          ...prev.attendance,
          [key]: {
            ...curDay,
            holiday: !curDay.holiday,
          },
        },
      };
    });
    toast(!isHoliday ? 'Day marked as Class Holiday.' : 'Holiday removed.', 'info');
  };

  const handleToggleLock = () => {
    if (!data.attendance[key]) {
      toast('Take attendance first, then lock this day.', 'info');
      return;
    }
    saveData(prev => {
      const curDay = prev.attendance[key] || { holiday: false, locked: false, status: {} };
      return {
        ...prev,
        attendance: {
          ...prev.attendance,
          [key]: {
            ...curDay,
            locked: !curDay.locked,
          },
        },
      };
    });
    toast(!locked ? 'Day locked.' : 'Day unlocked.', 'info');
  };

  // Bulk Holiday Range Modal
  const openBulkHolidayModal = () => {
    let startD = attDate;
    let endD = attDate;

    const content = (
      <div className="space-y-4 max-w-lg mx-auto">
        <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
          Every date in this range will be marked as a{' '}
          <span className="font-semibold text-stone-900 dark:text-stone-100">Class Holiday</span> —
          excluded from student attendance percentages. Useful for Eid break, summer, or closures.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-stone-600 dark:text-stone-400 mb-1">
              Start date
            </label>
            <input
              type="date"
              defaultValue={startD}
              onChange={e => {
                startD = e.target.value;
              }}
              className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100 text-sm focus:outline-none focus:border-red-700"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-stone-600 dark:text-stone-400 mb-1">
              End date
            </label>
            <input
              type="date"
              defaultValue={endD}
              onChange={e => {
                endD = e.target.value;
              }}
              className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100 text-sm focus:outline-none focus:border-red-700"
            />
          </div>
        </div>

        <div className="flex gap-2.5 pt-2">
          <button
            type="button"
            onClick={closeInfoModal}
            className="flex-1 min-h-[44px] py-2.5 px-4 text-xs font-semibold rounded-xl bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-200 hover:bg-stone-200 dark:hover:bg-stone-700 cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (!startD || !endD) {
                toast('Please select both dates.', 'error');
                return;
              }
              if (startD > endD) {
                toast('Start date must be before or equal to end date.', 'error');
                return;
              }
              if ((parseKey(endD).getTime() - parseKey(startD).getTime()) / 86400000 > 366) {
                toast('Please choose a range of one year or less.', 'error');
                return;
              }
              const start = parseKey(startD);
              const end = parseKey(endD);
              let count = 0;
              let skipped = 0;

              saveData(prev => {
                count = 0;
                skipped = 0;
                const d = new Date(start);
                const nextAtt = { ...prev.attendance };
                while (d <= end) {
                  const k = dateKey(d);
                  const cur = nextAtt[k] || { holiday: false, locked: false, status: {} };
                  if (cur.locked) {
                    skipped++;
                  } else {
                    nextAtt[k] = { ...cur, holiday: true };
                    count++;
                  }
                  d.setDate(d.getDate() + 1);
                }
                return { ...prev, attendance: nextAtt };
              });

              closeInfoModal();
              toast(
                `${count} day(s) marked as Holiday.${skipped > 0 ? ` (${skipped} locked skipped)` : ''}`,
                'success'
              );
            }}
            className="flex-1 min-h-[44px] py-2.5 px-4 text-xs font-semibold rounded-xl bg-red-800 hover:bg-red-900 dark:bg-red-700 dark:hover:bg-red-600 text-white flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
          >
            <Check className="w-4 h-4" />
            <span>Mark as Holiday</span>
          </button>
        </div>
      </div>
    );

    showInfoModal('Bulk Holiday Range', content);
  };

  // Student Yearly Summary Modal
  const openStudentSummaryModal = (s: Student) => {
    let p = 0;
    let a = 0;
    let l = 0;
    const months: Record<string, { p: number; a: number; l: number; h: number }> = {};

    const joinKey = s.createdAt ? dateKey(new Date(s.createdAt)) : null;
    const todayStr = todayKey();
    Object.keys(data.attendance).forEach(k => {
      const cur = data.attendance[k];
      if (!cur) return;
      if (k > todayStr) return;
      if (!cur.holiday && cur.status[s.id] === undefined && joinKey && k < joinKey) return;
      const mk = k.slice(0, 7);
      if (!months[mk]) months[mk] = { p: 0, a: 0, l: 0, h: 0 };
      if (cur.holiday) {
        months[mk].h++;
        return;
      }
      const st = cur.status[s.id] || 'P';
      if (st === 'P') {
        p++;
        months[mk].p++;
      } else if (st === 'A') {
        a++;
        months[mk].a++;
      } else if (st === 'L') {
        l++;
        months[mk].l++;
      }
    });

    const denom = p + a;
    const overallPct = denom ? Math.round((p / denom) * 100) : 0;
    const sortedMonthKeys = Object.keys(months).sort().reverse();

    const content = (
      <div className="space-y-4 max-w-xl mx-auto">
        <div className="border-b border-stone-200 dark:border-stone-800 pb-3">
          <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">
            {s.name || '(no name)'}
            {s.rollNo ? (
              <span className="font-mono-num text-sm font-semibold text-stone-500 dark:text-stone-400">
                {' '}
                · Roll {s.rollNo}
              </span>
            ) : null}
          </h2>
          {s.fatherName && (
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">s/o {s.fatherName}</p>
          )}
        </div>

        <div className="rounded-2xl border border-stone-200 dark:border-stone-800 overflow-hidden bg-stone-50/50 dark:bg-stone-950/40">
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 divide-x divide-stone-200 dark:divide-stone-800 text-center">
            <div className="p-3.5">
              <div className="text-2xl font-bold font-mono-num text-emerald-700 dark:text-emerald-400">
                {p}
              </div>
              <div className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">Present</div>
            </div>
            <div className="p-3.5">
              <div className="text-2xl font-bold font-mono-num text-red-700 dark:text-red-400">
                {a}
              </div>
              <div className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">Absent</div>
            </div>
            <div className="p-3.5">
              <div className="text-2xl font-bold font-mono-num text-amber-700 dark:text-amber-400">
                {l}
              </div>
              <div className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">Leave</div>
            </div>
            <div className="p-3.5">
              <div className="text-2xl font-bold font-mono-num text-stone-900 dark:text-stone-100">
                {denom ? `${overallPct}%` : '—'}
              </div>
              <div className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">Overall %</div>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100 mb-2">
            Monthly breakdown
          </h3>
          {sortedMonthKeys.length === 0 ? (
            <p className="text-xs text-stone-500 dark:text-stone-400">No attendance records yet.</p>
          ) : (
            <div className="overflow-x-auto border border-stone-200 dark:border-stone-800 rounded-xl">
              <table className="w-full text-xs text-center border-collapse">
                <thead>
                  <tr className="bg-stone-50 dark:bg-stone-800/80 text-stone-600 dark:text-stone-300 border-b border-stone-200 dark:border-stone-800">
                    <th className="p-2.5 text-left font-semibold">Month</th>
                    <th className="p-2.5 font-semibold">P</th>
                    <th className="p-2.5 font-semibold">A</th>
                    <th className="p-2.5 font-semibold">L</th>
                    <th className="p-2.5 font-semibold">Holiday</th>
                    <th className="p-2.5 font-semibold">%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                  {sortedMonthKeys.map(mk => {
                    const m = months[mk];
                    const mDenom = m.p + m.a;
                    const mPct = mDenom ? Math.round((m.p / mDenom) * 100) : 0;
                    return (
                      <tr key={mk} className="even:bg-stone-50/50 dark:even:bg-stone-950/30">
                        <td className="p-2.5 text-left font-semibold text-stone-900 dark:text-stone-100">
                          {prettyMonth(mk)}
                        </td>
                        <td className="p-2.5 font-mono-num font-semibold text-emerald-700 dark:text-emerald-400">
                          {m.p}
                        </td>
                        <td className="p-2.5 font-mono-num font-semibold text-red-700 dark:text-red-400">
                          {m.a}
                        </td>
                        <td className="p-2.5 font-mono-num font-semibold text-amber-700 dark:text-amber-400">
                          {m.l}
                        </td>
                        <td className="p-2.5 font-mono-num text-stone-500 dark:text-stone-400">
                          {m.h}
                        </td>
                        <td className="p-2.5 font-mono-num font-bold text-stone-900 dark:text-stone-100">
                          {mDenom ? `${mPct}%` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="text-[11px] text-stone-400 dark:text-stone-500">
          Attendance % = Present / (Present + Absent). Leave and Class Holidays are excluded.
        </p>
      </div>
    );

    showInfoModal('Student Attendance Summary', content);
  };

  // Print Absentee Slip (100% preserved print output)
  const handlePrintAbsenteeSlip = async () => {
    const absentList = day ? sortedStudents.filter(s => day.status[s.id] === 'A') : [];
    const leaveList = day ? sortedStudents.filter(s => day.status[s.id] === 'L') : [];

    let bodyHTML = '';
    if (day && day.holiday) {
      bodyHTML = `<div class="no-absents">This day was marked as a Class Holiday.</div>`;
    } else if (!absentList.length && !leaveList.length) {
      bodyHTML = `<div class="no-absents">All students were present.</div>`;
    } else {
      const rows: Array<{ idx: number; s: Student; status: string }> = [];
      absentList.forEach((s, i) => rows.push({ idx: i + 1, s, status: 'Absent' }));
      leaveList.forEach((s, i) =>
        rows.push({ idx: absentList.length + i + 1, s, status: 'Leave (Excused)' })
      );

      bodyHTML = `<table>
        <thead><tr>
          <th style="width:5%">#</th>
          <th style="width:8%">Roll</th>
          <th style="width:20%">Name</th>
          <th style="width:20%">Father Name</th>
          <th style="width:23%">Phone</th>
          <th style="width:24%">Status</th>
        </tr></thead>
        <tbody>${rows
          .map(
            r => `
          <tr>
            <td class="center">${r.idx}</td>
            <td class="center">${esc(r.s.rollNo || '—')}</td>
            <td><span class="cg-fit">${esc(r.s.name || '—')}</span></td>
            <td><span class="cg-fit">${esc(r.s.fatherName || '—')}</span></td>
            <td class="center">${esc(r.s.phone || '—')}</td>
            <td class="center" style="font-weight:700">${r.status}</td>
          </tr>`
          )
          .join('')}
        </tbody>
      </table>`;
    }

    const total = sortedStudents.length;
    const present = total - absentList.length - leaveList.length;
    const statsHTML =
      day && !day.holiday
        ? `<div style="margin-top:6mm;font-size:13.5pt;font-weight:800;text-align:center;letter-spacing:.3px">
           Total: ${total} &nbsp;•&nbsp; Present: ${present} &nbsp;•&nbsp; Absent: ${absentList.length} &nbsp;•&nbsp; Leave: ${leaveList.length}
         </div>`
        : '';

    const fullPrintHTML = `<div class="print-sheet absentee-slip-sheet">
      ${buildPrintHeaderHTML('Absentee Slip')}
      <div class="print-sub2" style="font-weight:700">${esc(prettyDate(key))}</div>
      <div style="margin-top:3mm"></div>
      ${bodyHTML}
      ${statsHTML}
    </div>`;

    const ok = await previewPrint({ html: fullPrintHTML, orientation: 'portrait' }, data);
    if (!ok) toast('Could not open the print dialog. Try again.', 'error');
  };

  // Download Absentee Slip PNG
  const handleDownloadSlipPNG = async () => {
    setSavingSlipImage(true);
    try {
      const ok = await downloadAbsenteeSlipPNG(key, data);
      if (ok) {
        toast(
          Capacitor.isNativePlatform()
            ? 'Absentee slip ready in Android share sheet.'
            : 'Absentee slip image ready to share.',
          'success'
        );
      } else {
        toast('Could not generate image.', 'error');
      }
    } finally {
      setSavingSlipImage(false);
    }
  };

  // Print Monthly Register (100% preserved print output)
  const handlePrintRegister = async () => {
    const parts = registerMonth.split('-').map(Number);
    const days = getMonthDays(parts[0], parts[1] - 1);
    if (!sortedStudents.length) {
      toast('No students enrolled.', 'error');
      return;
    }
    const today = todayKey();

    const headCells = days.map(k => `<th>${parseInt(k.slice(-2), 10)}</th>`).join('');
    const rows = sortedStudents
      .map(s => {
        const stats = studentMonthStats(s, registerMonth);
        const joinKey = s.createdAt ? dateKey(new Date(s.createdAt)) : null;
        const cells = days
          .map(k => {
            if (k > today) return `<td class="empty"></td>`;
            const curDay = data.attendance[k];
            if (!curDay) return `<td class="empty"></td>`;
            if (curDay.holiday) return `<td class="h">H</td>`;
            const explicitSt = curDay.status[s.id];
            if (explicitSt === undefined && joinKey && k < joinKey) return `<td class="empty"></td>`;
            const st = explicitSt || 'P';
            const cls = st === 'A' ? 'a' : st === 'L' ? 'l' : '';
            return `<td class="${cls}">${st}</td>`;
          })
          .join('');

        return `<tr>
        <td>${esc(s.rollNo || '—')}</td>
        <td class="left" style="text-align:left;padding-left:1mm"><span class="cg-fit">${esc(s.name || '—')}</span></td>
        ${cells}
        <td class="total-col font-bold">${stats.p}</td>
        <td class="total-col">${stats.a}</td>
        <td class="total-col">${stats.l}</td>
        <td class="total-col font-bold">${stats.pct}%</td>
      </tr>`;
      })
      .join('');

    const fullPrintHTML = `<div class="print-sheet">
      ${buildPrintHeaderHTML('Monthly Attendance Register')}
      <div class="print-sub2" style="font-weight:700">Month: ${esc(prettyMonth(registerMonth))}</div>
      <div class="print-sub2 cg-nocap" style="font-size:9pt;margin-top:1mm">
        P = Present • A = Absent • L = Leave (excused) • H = Class Holiday • % = P / (P+A)
      </div>
      <div style="margin-top:3mm"></div>
      <table class="reg-table">
        <colgroup>
          <col style="width:11mm">
          <col style="width:38mm">
          ${days.map(() => '<col style="width:4.6mm">').join('')}
          <col style="width:7mm"><col style="width:7mm"><col style="width:7mm"><col style="width:11mm">
        </colgroup>
        <thead><tr>
          <th>Roll</th><th>Name</th>${headCells}
          <th class="total-col">P</th><th class="total-col">A</th><th class="total-col">L</th><th class="total-col">%</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

    const ok = await previewPrint({ html: fullPrintHTML, orientation: 'landscape' }, data);
    if (!ok) toast('Could not open the print dialog. Try again.', 'error');
  };

  // Empty State
  if (!data.students.length) {
    return (
      <div className="space-y-5">
        <div>
          <div className="text-xs font-medium text-stone-500 dark:text-stone-400">
            {data.className || 'Active Class'} · {prettyDate(key)}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-stone-900 dark:text-stone-100 mt-1">
            Attendance
          </h1>
        </div>

        <section className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 py-12 px-6 text-center">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 flex items-center justify-center">
            <GraduationCap className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-stone-900 dark:text-stone-100 mt-3">
            No students enrolled yet
          </h2>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-1 max-w-xs mx-auto">
            Add your class students first to start taking daily attendance and printing monthly registers.
          </p>
          <button
            type="button"
            onClick={() => setActiveTab('students')}
            className="mt-4 min-h-[44px] px-5 py-2.5 rounded-xl bg-red-800 hover:bg-red-900 dark:bg-red-700 dark:hover:bg-red-600 text-white text-xs font-semibold cursor-pointer transition-colors"
          >
            Go to Students
          </button>
        </section>
      </div>
    );
  }

  // Filtered daily list
  const q = search.trim().toLowerCase();
  const visibleStudents = sortedStudents.filter(s => {
    const st = day && day.status ? day.status[s.id] || 'P' : 'P';
    if (statusFilter === 'A' && st !== 'A') return false;
    if (statusFilter === 'L' && st !== 'L') return false;
    if (!q) return true;
    return (
      (s.name || '').toLowerCase().includes(q) ||
      (s.fatherName || '').toLowerCase().includes(q) ||
      (s.rollNo || '').toLowerCase().includes(q)
    );
  });

  const absentStudents = day ? sortedStudents.filter(s => day.status[s.id] === 'A') : [];
  const leaveStudents = day ? sortedStudents.filter(s => day.status[s.id] === 'L') : [];

  // Monthly Register View
  const renderMonthlyRegister = () => {
    const parts = registerMonth.split('-').map(Number);
    const days = getMonthDays(parts[0], parts[1] - 1);
    const today = todayKey();
    const isCurrentMonth = registerMonth >= today.slice(0, 7);

    return (
      <section className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 overflow-hidden">
        <div className="p-4 sm:px-5 border-b border-stone-100 dark:border-stone-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              aria-label="Previous month"
              className="w-11 h-11 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/70 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-200 flex items-center justify-center cursor-pointer transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <input
              type="month"
              value={registerMonth}
              max={today.slice(0, 7)}
              onChange={e => {
                if (e.target.value) setRegisterMonth(e.target.value);
              }}
              className="min-h-[44px] px-3 py-2 text-xs sm:text-sm font-semibold rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-950/60 text-stone-900 dark:text-stone-100 focus:outline-none focus:border-red-700"
            />
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              disabled={isCurrentMonth}
              aria-label="Next month"
              className="w-11 h-11 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/70 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-200 disabled:opacity-35 flex items-center justify-center cursor-pointer transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="text-xs text-stone-500 dark:text-stone-400">
            P Present · A Absent · L Leave · H Holiday · % = P / (P + A)
          </div>
        </div>

        <div className="overflow-x-auto max-h-[65vh]">
          <table className="w-full text-[11px] text-center border-collapse">
            <thead className="sticky top-0 z-10 bg-stone-50 dark:bg-stone-800 text-stone-600 dark:text-stone-300">
              <tr className="border-b border-stone-200 dark:border-stone-700">
                <th className="sticky left-0 z-20 bg-stone-50 dark:bg-stone-800 p-2 border-r border-stone-200 dark:border-stone-700 font-semibold w-12">
                  Roll
                </th>
                <th className="sticky left-12 z-20 bg-stone-50 dark:bg-stone-800 p-2 border-r border-stone-200 dark:border-stone-700 text-left font-semibold min-w-[128px]">
                  Name
                </th>
                {days.map(k => {
                  const num = parseInt(k.slice(-2), 10);
                  const wd = parseKey(k).getDay();
                  const isWknd = wd === 0 || wd === 6;
                  return (
                    <th
                      key={k}
                      className={`p-1.5 border-r border-stone-200/70 dark:border-stone-800 font-mono-num font-semibold min-w-[26px] ${
                        isWknd ? 'bg-stone-100 dark:bg-stone-900/70 text-stone-400' : ''
                      }`}
                    >
                      {num}
                    </th>
                  );
                })}
                <th className="p-2 border-l border-stone-200 dark:border-stone-700 font-semibold text-emerald-700 dark:text-emerald-400">
                  P
                </th>
                <th className="p-2 font-semibold text-red-700 dark:text-red-400">A</th>
                <th className="p-2 font-semibold text-amber-700 dark:text-amber-400">L</th>
                <th className="p-2 font-semibold text-stone-900 dark:text-stone-100">%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {sortedStudents.map(s => {
                const stats = studentMonthStats(s, registerMonth);
                const joinKey = s.createdAt ? dateKey(new Date(s.createdAt)) : null;

                return (
                  <tr
                    key={s.id}
                    className="group bg-white dark:bg-stone-900 even:bg-stone-50/50 dark:even:bg-stone-950/30"
                  >
                    <td className="sticky left-0 z-10 bg-inherit p-2 border-r border-stone-200 dark:border-stone-800 font-mono-num font-bold text-stone-500 dark:text-stone-400">
                      {s.rollNo || '—'}
                    </td>
                    <td className="sticky left-12 z-10 bg-inherit p-2 border-r border-stone-200 dark:border-stone-800 text-left font-semibold text-stone-900 dark:text-stone-100 max-w-[160px] truncate">
                      <button
                        type="button"
                        onClick={() => openStudentSummaryModal(s)}
                        className="hover:text-red-800 dark:hover:text-red-400 hover:underline cursor-pointer text-left truncate w-full"
                      >
                        {s.name || '—'}
                      </button>
                    </td>
                    {days.map(k => {
                      if (k > today)
                        return (
                          <td
                            key={k}
                            className="p-1.5 border-r border-stone-100 dark:border-stone-800/70 text-stone-300 dark:text-stone-700"
                          >
                            ·
                          </td>
                        );
                      const curDay = data.attendance[k];
                      if (!curDay)
                        return (
                          <td
                            key={k}
                            className="p-1.5 border-r border-stone-100 dark:border-stone-800/70 text-stone-300 dark:text-stone-700"
                          >
                            ·
                          </td>
                        );
                      if (curDay.holiday)
                        return (
                          <td
                            key={k}
                            className="p-1.5 border-r border-stone-100 dark:border-stone-800/70 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 font-semibold"
                          >
                            H
                          </td>
                        );
                      const explicitSt = curDay.status[s.id];
                      if (explicitSt === undefined && joinKey && k < joinKey) {
                        return (
                          <td
                            key={k}
                            className="p-1.5 border-r border-stone-100 dark:border-stone-800/70 text-stone-300 dark:text-stone-700"
                          >
                            ·
                          </td>
                        );
                      }
                      const st = explicitSt || 'P';
                      if (st === 'A') {
                        return (
                          <td
                            key={k}
                            className="p-1.5 border-r border-stone-100 dark:border-stone-800/70 bg-red-50 dark:bg-red-950/50 text-red-800 dark:text-red-300 font-bold"
                          >
                            A
                          </td>
                        );
                      }
                      if (st === 'L') {
                        return (
                          <td
                            key={k}
                            className="p-1.5 border-r border-stone-100 dark:border-stone-800/70 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 font-bold"
                          >
                            L
                          </td>
                        );
                      }
                      return (
                        <td
                          key={k}
                          className="p-1.5 border-r border-stone-100 dark:border-stone-800/70 text-emerald-700 dark:text-emerald-400 font-medium"
                        >
                          P
                        </td>
                      );
                    })}
                    <td className="p-2 border-l border-stone-200 dark:border-stone-800 font-mono-num font-bold text-emerald-700 dark:text-emerald-400">
                      {stats.p}
                    </td>
                    <td className="p-2 font-mono-num font-bold text-red-700 dark:text-red-400">
                      {stats.a}
                    </td>
                    <td className="p-2 font-mono-num font-bold text-amber-700 dark:text-amber-400">
                      {stats.l}
                    </td>
                    <td className="p-2 font-mono-num font-bold text-stone-900 dark:text-stone-100">
                      {stats.pct}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    );
  };

  return (
    <div className="space-y-5">
      {/* Institutional Masthead + Mode Switch + Primary Print Action */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium text-stone-500 dark:text-stone-400 flex items-center gap-1.5 flex-wrap">
            <span>{data.className || 'Active Class'}</span>
            <span aria-hidden="true">·</span>
            <span>{mode === 'daily' ? prettyDate(key) : prettyMonth(registerMonth)}</span>
            {mode === 'daily' && locked && (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1 font-semibold text-stone-700 dark:text-stone-300">
                  <Lock className="w-3 h-3" /> Locked
                </span>
              </>
            )}
            {mode === 'daily' && isHoliday && (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1 font-semibold text-sky-700 dark:text-sky-400">
                  <Sun className="w-3 h-3" /> Holiday
                </span>
              </>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-stone-900 dark:text-stone-100 mt-1">
            Attendance
          </h1>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <div className="inline-flex items-center p-1 rounded-xl bg-stone-200/70 dark:bg-stone-800/80">
            <button
              type="button"
              onClick={() => setMode('daily')}
              className={`min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                mode === 'daily'
                  ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-xs'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
              }`}
            >
              Daily roll call
            </button>
            <button
              type="button"
              onClick={() => setMode('register')}
              className={`min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                mode === 'register'
                  ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-xs'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
              }`}
            >
              Monthly register
            </button>
          </div>

          {mode === 'daily' ? (
            <>
              <button
                type="button"
                onClick={handlePrintAbsenteeSlip}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-red-800 hover:bg-red-900 dark:bg-red-700 dark:hover:bg-red-600 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer active:scale-[0.98] whitespace-nowrap"
              >
                <Printer className="w-4 h-4" />
                <span>Absentee slip</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadSlipPNG}
                disabled={savingSlipImage}
                className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-800 dark:text-stone-100 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                <Share2 className="w-4 h-4 text-stone-500 dark:text-stone-400" />
                <span>{savingSlipImage ? 'Preparing…' : 'Share image'}</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handlePrintRegister}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-red-800 hover:bg-red-900 dark:bg-red-700 dark:hover:bg-red-600 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer active:scale-[0.98] whitespace-nowrap"
            >
              <Printer className="w-4 h-4" />
              <span>Print register</span>
            </button>
          )}
        </div>
      </div>

      {mode === 'register' ? (
        renderMonthlyRegister()
      ) : (
        <>
          {/* Date Stepper & Day Controls */}
          <section className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-4 sm:p-5 space-y-3.5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              {/* Date Stepper */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => shiftDate(-1)}
                  title="Previous day"
                  aria-label="Previous day"
                  className="w-11 h-11 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/70 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-200 flex items-center justify-center cursor-pointer transition-colors shrink-0"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <input
                  type="date"
                  value={attDate}
                  max={todayKey()}
                  onChange={e => {
                    const val = e.target.value;
                    if (!val) return;
                    if (val > todayKey()) {
                      toast('Future dates are not allowed.', 'info');
                      return;
                    }
                    setAttDate(val);
                  }}
                  className="flex-1 lg:flex-initial min-h-[44px] px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-950/60 text-stone-900 dark:text-stone-100 text-xs sm:text-sm font-semibold focus:outline-none focus:border-red-700"
                />
                <button
                  type="button"
                  onClick={() => shiftDate(1)}
                  disabled={isToday}
                  title="Next day"
                  aria-label="Next day"
                  className="w-11 h-11 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/70 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-200 disabled:opacity-35 flex items-center justify-center cursor-pointer transition-colors shrink-0"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setAttDate(todayKey())}
                  className={`min-h-[44px] px-3.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer shrink-0 ${
                    isToday
                      ? 'bg-red-800 dark:bg-red-700 text-white'
                      : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-200 hover:bg-stone-200 dark:hover:bg-stone-700'
                  }`}
                >
                  Today
                </button>
              </div>

              {/* Day Utility Actions */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={handleMarkAllPresent}
                  disabled={locked || isHoliday}
                  className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap ${
                    !day && !isHoliday
                      ? 'bg-emerald-700 hover:bg-emerald-800 text-white'
                      : 'border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/70 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-800 dark:text-stone-100'
                  }`}
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Mark all present</span>
                </button>

                <button
                  type="button"
                  onClick={handleToggleHoliday}
                  disabled={locked}
                  className={`min-h-[42px] px-3 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap ${
                    isHoliday
                      ? 'bg-sky-700 text-white'
                      : 'border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-200'
                  }`}
                >
                  <Sun className="w-3.5 h-3.5" />
                  <span>{isHoliday ? 'Holiday: On' : 'Holiday'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleToggleLock}
                  className={`min-h-[42px] px-3 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                    locked
                      ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900'
                      : 'border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-200'
                  }`}
                >
                  {locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                  <span>{locked ? 'Locked' : 'Lock day'}</span>
                </button>

                <button
                  type="button"
                  onClick={openBulkHolidayModal}
                  className="min-h-[42px] px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-200 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Calendar className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400" />
                  <span>Bulk holidays</span>
                </button>

                <button
                  type="button"
                  onClick={handleResetDay}
                  disabled={!day || locked}
                  title="Reset day"
                  className="min-h-[42px] px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 hover:bg-red-50 dark:hover:bg-red-950/40 text-stone-500 hover:text-red-700 dark:text-stone-400 dark:hover:text-red-400 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-35 whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset</span>
                </button>
              </div>
            </div>
          </section>

          {/* Unified Day Pulse Strip + Contextual Status Summary */}
          <section className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 overflow-hidden">
            <div className="grid grid-cols-4 divide-x divide-stone-200 dark:divide-stone-800 text-center">
              <div className="p-3.5 sm:p-4">
                <div className="text-xl sm:text-2xl font-bold font-mono-num text-stone-900 dark:text-stone-100">
                  {c.total}
                </div>
                <div className="text-[11px] font-medium text-stone-500 dark:text-stone-400 mt-0.5">
                  Total
                </div>
              </div>
              <div className="p-3.5 sm:p-4">
                <div className="text-xl sm:text-2xl font-bold font-mono-num text-emerald-700 dark:text-emerald-400">
                  {isHoliday ? '—' : c.present}
                </div>
                <div className="text-[11px] font-medium text-stone-500 dark:text-stone-400 mt-0.5">
                  Present
                </div>
              </div>
              <div className="p-3.5 sm:p-4">
                <div className="text-xl sm:text-2xl font-bold font-mono-num text-red-700 dark:text-red-400">
                  {isHoliday ? '—' : c.absent}
                </div>
                <div className="text-[11px] font-medium text-stone-500 dark:text-stone-400 mt-0.5">
                  Absent
                </div>
              </div>
              <div className="p-3.5 sm:p-4">
                <div className="text-xl sm:text-2xl font-bold font-mono-num text-amber-700 dark:text-amber-400">
                  {isHoliday ? 'H' : c.leave}
                </div>
                <div className="text-[11px] font-medium text-stone-500 dark:text-stone-400 mt-0.5">
                  {isHoliday ? 'Holiday' : 'Leave'}
                </div>
              </div>
            </div>

            {/* Quiet Contextual Status Footer Row */}
            <div className="px-4 sm:px-5 py-3 border-t border-stone-100 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-950/40 text-xs leading-relaxed">
              {isHoliday ? (
                <div className="flex items-start gap-2 text-sky-800 dark:text-sky-300 font-medium">
                  <Sun className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Class Holiday — whole day off. Excluded from all student attendance percentages.
                  </span>
                </div>
              ) : !day ? (
                <div className="flex items-start gap-2 text-amber-800 dark:text-amber-300">
                  <Clock className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Not recorded yet. Everyone starts as Present — tap <b>A</b> or <b>L</b> for
                    exceptions, or press <b>Mark all present</b>.
                  </span>
                </div>
              ) : c.absent === 0 && c.leave === 0 ? (
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-semibold">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>All {c.total} students present today.</span>
                </div>
              ) : (
                <div className="space-y-1">
                  {absentStudents.length > 0 && (
                    <div className="flex items-start gap-2 text-red-800 dark:text-red-300">
                      <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>
                        <span className="font-semibold">Absent ({absentStudents.length}):</span>{' '}
                        {absentStudents
                          .map(s => `${s.rollNo ? `#${s.rollNo} ` : ''}${s.name}`)
                          .join(', ')}
                      </span>
                    </div>
                  )}
                  {leaveStudents.length > 0 && (
                    <div className="flex items-start gap-2 text-amber-800 dark:text-amber-300">
                      <Sun className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>
                        <span className="font-semibold">Leave ({leaveStudents.length}):</span>{' '}
                        {leaveStudents
                          .map(s => `${s.rollNo ? `#${s.rollNo} ` : ''}${s.name}`)
                          .join(', ')}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Student Roll Call List */}
          <section className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 overflow-hidden">
            <div className="px-4 sm:px-5 py-3.5 border-b border-stone-100 dark:border-stone-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div>
                <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100">
                  Roll call · <span className="font-mono-num">{sortedStudents.length}</span>
                </h2>
                <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">
                  Tap any student&apos;s name for their yearly summary.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {(c.absent > 0 || c.leave > 0) && !isHoliday && (
                  <div className="inline-flex items-center p-0.5 rounded-xl bg-stone-100 dark:bg-stone-800 text-[11px] font-semibold">
                    {(['all', 'A', 'L'] as const).map(f => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setStatusFilter(f)}
                        className={`min-h-[34px] px-2.5 rounded-lg transition-colors cursor-pointer ${
                          statusFilter === f
                            ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-xs'
                            : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
                        }`}
                      >
                        {f === 'all' ? 'All' : f === 'A' ? `Absent (${c.absent})` : `Leave (${c.leave})`}
                      </button>
                    ))}
                  </div>
                )}

                {sortedStudents.length >= 10 && (
                  <div className="relative flex-1 sm:w-52">
                    <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="search"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Filter student…"
                      className="w-full min-h-[38px] pl-8 pr-3 py-1.5 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-950/60 text-xs text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:border-red-700"
                    />
                  </div>
                )}
              </div>
            </div>

            {visibleStudents.length === 0 ? (
              <div className="p-8 text-center text-xs text-stone-500 dark:text-stone-400">
                No students match this filter.
              </div>
            ) : (
              <div className="divide-y divide-stone-100 dark:divide-stone-800">
                {visibleStudents.map(s => {
                  const currentStatus = day && day.status ? day.status[s.id] || 'P' : 'P';
                  const disabled = locked || isHoliday;

                  return (
                    <div
                      key={s.id}
                      className={`px-3.5 sm:px-5 py-2.5 flex items-center justify-between gap-3 transition-colors ${
                        !isHoliday && currentStatus === 'A'
                          ? 'bg-red-50/45 dark:bg-red-950/20'
                          : !isHoliday && currentStatus === 'L'
                          ? 'bg-amber-50/45 dark:bg-amber-950/15'
                          : ''
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-10 text-center font-mono-num text-xs font-bold text-stone-500 dark:text-stone-400 shrink-0">
                          {s.rollNo || '—'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => openStudentSummaryModal(s)}
                            className="font-semibold text-sm text-stone-900 dark:text-stone-100 hover:text-red-800 dark:hover:text-red-400 hover:underline cursor-pointer text-left truncate block max-w-full"
                          >
                            {s.name || '(no name)'}
                          </button>
                          {s.fatherName && (
                            <div className="text-xs text-stone-500 dark:text-stone-400 truncate">
                              s/o {s.fatherName}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* P / A / L 44x44 Touch Toggles */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => handleSetStatus(s.id, 'P')}
                          title="Present"
                          aria-label={`Mark ${s.name} Present`}
                          className={`w-11 h-11 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95 disabled:opacity-35 ${
                            currentStatus === 'P'
                              ? 'bg-emerald-700 text-white dark:bg-emerald-600'
                              : 'bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700'
                          }`}
                        >
                          P
                        </button>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => handleSetStatus(s.id, 'A')}
                          title="Absent"
                          aria-label={`Mark ${s.name} Absent`}
                          className={`w-11 h-11 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95 disabled:opacity-35 ${
                            currentStatus === 'A'
                              ? 'bg-red-800 text-white dark:bg-red-700'
                              : 'bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700'
                          }`}
                        >
                          A
                        </button>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => handleSetStatus(s.id, 'L')}
                          title="Leave (Excused, excluded from %)"
                          aria-label={`Mark ${s.name} Leave`}
                          className={`w-11 h-11 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95 disabled:opacity-35 ${
                            currentStatus === 'L'
                              ? 'bg-amber-600 text-white dark:bg-amber-600'
                              : 'bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700'
                          }`}
                        >
                          L
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};

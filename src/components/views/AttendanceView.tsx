import React, { useState } from 'react';
import { useClassroom } from '../../context/ClassroomContext';
import { AttendanceStatus, Student } from '../../types';
import { ActionGrid, ActionButton } from '../ActionGrid';
import { HowItWorks } from '../HowItWorks';
import {
  todayKey,
  parseKey,
  dateKey,
  prettyDate,
  prettyMonth,
  getMonthDays,
  getSortedStudents,
  esc
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
  Download,
  BarChart2,
  GraduationCap,
  FileText,
  XCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight
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
    buildPrintHeaderHTML
  } = useClassroom();

  const [attDate, setAttDate] = useState<string>(todayKey());
  const [registerMonth, setRegisterMonth] = useState<string>(todayKey().slice(0, 7));
  const [registerOpen, setRegisterOpen] = useState<boolean>(false);
  const [savingSlipImage, setSavingSlipImage] = useState<boolean>(false);

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
      toast("Future dates are not allowed.", "info");
      return;
    }
    setAttDate(nk);
  };

  const handleSetStatus = (sid: string, status: AttendanceStatus) => {
    if (locked) {
      toast("This day is locked. Unlock it first.", "error");
      return;
    }
    if (isHoliday) {
      toast("Day is marked as Class Holiday.", "error");
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
            status: nextStatus
          }
        }
      };
    });
  };

  const handleMarkAllPresent = () => {
    if (locked) {
      toast("This day is locked.", "error");
      return;
    }
    saveData(prev => ({
      ...prev,
      attendance: {
        ...prev.attendance,
        [key]: {
          holiday: false,
          locked: false,
          status: {}
        }
      }
    }));
    toast("All students marked present.", "success");
  };

  const handleResetDay = async () => {
    if (!data.attendance[key]) {
      toast("Nothing to reset for this day.", "info");
      return;
    }
    const ok = await uiConfirm("Reset attendance for this day?\n\nThis will clear all marks.", {
      title: "Reset Day",
      yesText: "Reset",
      danger: true,
      icon: "warning"
    });
    if (!ok) return;

    saveData(prev => {
      const nextAtt = { ...prev.attendance };
      delete nextAtt[key];
      return { ...prev, attendance: nextAtt };
    });
    toast("Day reset.", "success");
  };

  const handleToggleHoliday = () => {
    if (locked) {
      toast("This day is locked.", "error");
      return;
    }
    saveData(prev => {
      const curDay = prev.attendance[key] || { holiday: false, locked: false, status: {} };
      // Removing a holiday from a day with no marks clears the day completely; otherwise it would
      // be left behind as a fake "everyone present" day (inflating attendance % and hiding the reminder).
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
            holiday: !curDay.holiday
          }
        }
      };
    });
    toast(!isHoliday ? "Day marked as Class Holiday." : "Holiday removed.", "info");
  };

  const handleToggleLock = () => {
    if (!data.attendance[key]) {
      toast("Take attendance first, then lock this day.", "info");
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
            locked: !curDay.locked
          }
        }
      };
    });
    toast(!locked ? "Day locked" : "Day unlocked", "info");
  };

  // Bulk Holiday Range Modal
  const openBulkHolidayModal = () => {
    let startD = attDate;
    let endD = attDate;

    const content = (
      <div className="space-y-4 max-w-lg mx-auto">
        <p className="text-sm text-[#78716C] dark:text-[#A8A29E] leading-relaxed">
          Every date in this range will be marked as a <b>Class Holiday</b> — not counted against any student's attendance percentage. Useful for Eid break, summer, or unexpected closures.
        </p>
        <div className="space-y-2">
          <div>
            <label className="block text-xs font-bold text-[#78716C] dark:text-[#A8A29E] mb-1">Start Date</label>
            <input
              type="date"
              defaultValue={startD}
              onChange={e => { startD = e.target.value; }}
              className="w-full p-2.5 rounded-xl border border-[#D6D3D1] dark:border-[#44403C] bg-white dark:bg-[#0C0A09] text-inherit text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#78716C] dark:text-[#A8A29E] mb-1">End Date</label>
            <input
              type="date"
              defaultValue={endD}
              onChange={e => { endD = e.target.value; }}
              className="w-full p-2.5 rounded-xl border border-[#D6D3D1] dark:border-[#44403C] bg-white dark:bg-[#0C0A09] text-inherit text-sm"
            />
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={closeInfoModal}
            className="flex-1 py-2.5 px-4 text-xs font-bold rounded-xl bg-[#F5F5F4] dark:bg-[#292524] text-[#1C1917] dark:text-[#F5F5F4]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (!startD || !endD) {
                toast("Please select both dates.", "error");
                return;
              }
              if (startD > endD) {
                toast("Start date must be before or equal to end date.", "error");
                return;
              }
              if ((parseKey(endD).getTime() - parseKey(startD).getTime()) / 86400000 > 366) {
                toast("Please choose a range of one year or less.", "error");
                return;
              }
              const start = parseKey(startD);
              const end = parseKey(endD);
              let count = 0;
              let skipped = 0;
              const d = new Date(start);

              saveData(prev => {
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
              toast(`${count} day(s) marked as Holiday. ${skipped > 0 ? `(${skipped} locked skipped)` : ''}`, "success");
            }}
            className="flex-1 py-2.5 px-4 text-xs font-bold rounded-xl bg-[#B91C1C] text-white hover:bg-[#991B1B] flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
            Mark as Holiday
          </button>
        </div>
      </div>
    );

    showInfoModal("Bulk Holiday Range", content);
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
      if (k > todayStr) return; // future days (e.g. planned holidays) are not counted
      // same rule as the monthly register: days before the student joined do not count
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
        <div className="border-b border-[#E7E5E4] dark:border-[#44403C] pb-3">
          <h2 className="text-lg font-bold text-[#1C1917] dark:text-[#F5F5F4]">
            {s.name || "(no name)"} {s.rollNo ? `— Roll ${s.rollNo}` : ""}
          </h2>
          {s.fatherName && <p className="text-xs text-[#78716C] dark:text-[#A8A29E]">s/o {s.fatherName}</p>}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1C1917] text-center border border-[#E7E5E4] dark:border-[#44403C]">
            <b className="block text-2xl text-[#065F46] dark:text-[#6EE7B7]">{p}</b>
            <span className="text-xs text-[#78716C] dark:text-[#A8A29E]">Total Present</span>
          </div>
          <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1C1917] text-center border border-[#E7E5E4] dark:border-[#44403C]">
            <b className="block text-2xl text-[#B23A32] dark:text-[#F0C8C0]">{a}</b>
            <span className="text-xs text-[#78716C] dark:text-[#A8A29E]">Total Absent</span>
          </div>
          <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1C1917] text-center border border-[#E7E5E4] dark:border-[#44403C]">
            <b className="block text-2xl text-[#B4791F] dark:text-[#F8E0A0]">{l}</b>
            <span className="text-xs text-[#78716C] dark:text-[#A8A29E]">Total Leave</span>
          </div>
          <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1C1917] text-center border border-[#E7E5E4] dark:border-[#44403C]">
            <b className="block text-2xl text-[#2E5A8A] dark:text-[#8AB4DC]">{overallPct}%</b>
            <span className="text-xs text-[#78716C] dark:text-[#A8A29E]">Overall %</span>
          </div>
        </div>

        <h3 className="text-sm font-bold mt-4 text-[#1C1917] dark:text-[#F5F5F4]">Monthly Breakdown</h3>
        {sortedMonthKeys.length === 0 ? (
          <p className="text-xs text-[#78716C] dark:text-[#A8A29E]">No records yet.</p>
        ) : (
          <div className="overflow-x-auto border border-[#E7E5E4] dark:border-[#44403C] rounded-xl">
            <table className="w-full text-xs text-center border-collapse">
              <thead>
                <tr className="bg-[#FAFAF9] dark:bg-[#292524] text-[#1C1917] dark:text-[#F5F5F4]">
                  <th className="p-2.5 border border-[#E7E5E4] dark:border-[#44403C] text-left">Month</th>
                  <th className="p-2.5 border border-[#E7E5E4] dark:border-[#44403C]">P</th>
                  <th className="p-2.5 border border-[#E7E5E4] dark:border-[#44403C]">A</th>
                  <th className="p-2.5 border border-[#E7E5E4] dark:border-[#44403C]">L</th>
                  <th className="p-2.5 border border-[#E7E5E4] dark:border-[#44403C]">Holiday</th>
                  <th className="p-2.5 border border-[#E7E5E4] dark:border-[#44403C] font-bold">%</th>
                </tr>
              </thead>
              <tbody>
                {sortedMonthKeys.map(mk => {
                  const m = months[mk];
                  const mDenom = m.p + m.a;
                  const mPct = mDenom ? Math.round((m.p / mDenom) * 100) : 0;
                  return (
                    <tr key={mk} className="even:bg-[#FAFAF9] dark:even:bg-[#0C0A09]">
                      <td className="p-2 border border-[#E7E5E4] dark:border-[#44403C] text-left font-semibold">{prettyMonth(mk)}</td>
                      <td className="p-2 border border-[#E7E5E4] dark:border-[#44403C] text-[#065F46] dark:text-[#6EE7B7] font-bold">{m.p}</td>
                      <td className="p-2 border border-[#E7E5E4] dark:border-[#44403C] text-[#B23A32] dark:text-[#F0C8C0] font-bold">{m.a}</td>
                      <td className="p-2 border border-[#E7E5E4] dark:border-[#44403C] text-[#B4791F] dark:text-[#F8E0A0] font-bold">{m.l}</td>
                      <td className="p-2 border border-[#E7E5E4] dark:border-[#44403C]">{m.h}</td>
                      <td className="p-2 border border-[#E7E5E4] dark:border-[#44403C] font-bold">{mDenom ? `${mPct}%` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="text-[11px] text-[#A8A29E]">
          Note: % = <code>Present / (Present + Absent)</code>. Leave and Class Holidays are excluded.
        </div>
      </div>
    );

    showInfoModal("Student Attendance Summary", content);
  };

  // Print Absentee Slip
  const handlePrintAbsenteeSlip = async () => {
    const absentList = day ? sortedStudents.filter(s => day.status[s.id] === 'A') : [];
    const leaveList = day ? sortedStudents.filter(s => day.status[s.id] === 'L') : [];

    let bodyHTML = "";
    if (day && day.holiday) {
      bodyHTML = `<div class="no-absents">This day was marked as a Class Holiday.</div>`;
    } else if (!absentList.length && !leaveList.length) {
      bodyHTML = `<div class="no-absents">All students were present.</div>`;
    } else {
      const rows: Array<{ idx: number; s: Student; status: string }> = [];
      absentList.forEach((s, i) => rows.push({ idx: i + 1, s, status: "Absent" }));
      leaveList.forEach((s, i) => rows.push({ idx: absentList.length + i + 1, s, status: "Leave (Excused)" }));

      bodyHTML = `<table>
        <thead><tr>
          <th style="width:5%">#</th>
          <th style="width:8%">Roll</th>
          <th style="width:20%">Name</th>
          <th style="width:20%">Father Name</th>
          <th style="width:23%">Phone</th>
          <th style="width:24%">Status</th>
        </tr></thead>
        <tbody>${rows.map(r => `
          <tr>
            <td class="center">${r.idx}</td>
            <td class="center">${esc(r.s.rollNo || "—")}</td>
            <td><span class="cg-fit">${esc(r.s.name || "—")}</span></td>
            <td><span class="cg-fit">${esc(r.s.fatherName || "—")}</span></td>
            <td class="center">${esc(r.s.phone || "—")}</td>
            <td class="center" style="font-weight:700">${r.status}</td>
          </tr>`).join("")}
        </tbody>
      </table>`;
    }

    const total = sortedStudents.length;
    const present = total - absentList.length - leaveList.length;
    const statsHTML = day && !day.holiday
      ? `<div style="margin-top:6mm;font-size:13.5pt;font-weight:800;text-align:center;letter-spacing:.3px">
           Total: ${total} &nbsp;•&nbsp; Present: ${present} &nbsp;•&nbsp; Absent: ${absentList.length} &nbsp;•&nbsp; Leave: ${leaveList.length}
         </div>`
      : "";

    const fullPrintHTML = `<div class="print-sheet absentee-slip-sheet">
      ${buildPrintHeaderHTML("Absentee Slip")}
      <div class="print-sub2" style="font-weight:700">${esc(prettyDate(key))}</div>
      <div style="margin-top:3mm"></div>
      ${bodyHTML}
      ${statsHTML}
    </div>`;

    const ok = await previewPrint({ html: fullPrintHTML, orientation: "portrait" }, data);
    if (!ok) toast("Could not open the print dialog. Try again.", "error");
  };

  // Download Absentee Slip PNG
  const handleDownloadSlipPNG = async () => {
    setSavingSlipImage(true);
    try {
      const ok = await downloadAbsenteeSlipPNG(key, data);
      if (ok) {
        toast(Capacitor.isNativePlatform() ? "Absentee slip ready in Android share sheet." : "Absentee slip saved as image.", "success");
      } else {
        toast("Could not generate image.", "error");
      }
    } finally {
      setSavingSlipImage(false);
    }
  };

  // Print Register
  const handlePrintRegister = async () => {
    const parts = registerMonth.split("-").map(Number);
    const days = getMonthDays(parts[0], parts[1] - 1);
    if (!sortedStudents.length) {
      toast("No students enrolled.", "error");
      return;
    }
    const today = todayKey();

    const headCells = days.map(k => `<th>${parseInt(k.slice(-2), 10)}</th>`).join("");
    const rows = sortedStudents.map(s => {
      const stats = studentMonthStats(s, registerMonth);
      const joinKey = s.createdAt ? dateKey(new Date(s.createdAt)) : null;
      const cells = days.map(k => {
        if (k > today) return `<td class="empty"></td>`;
        const curDay = data.attendance[k];
        if (!curDay) return `<td class="empty"></td>`;
        if (curDay.holiday) return `<td class="h">H</td>`;
        const explicitSt = curDay.status[s.id];
        if (explicitSt === undefined && joinKey && k < joinKey) return `<td class="empty"></td>`;
        const st = explicitSt || 'P';
        const cls = st === 'A' ? 'a' : st === 'L' ? 'l' : '';
        return `<td class="${cls}">${st}</td>`;
      }).join("");

      return `<tr>
        <td>${esc(s.rollNo || "—")}</td>
        <td class="left" style="text-align:left;padding-left:1mm"><span class="cg-fit">${esc(s.name || "—")}</span></td>
        ${cells}
        <td class="total-col font-bold">${stats.p}</td>
        <td class="total-col">${stats.a}</td>
        <td class="total-col">${stats.l}</td>
        <td class="total-col font-bold">${stats.pct}%</td>
      </tr>`;
    }).join("");

    const fullPrintHTML = `<div class="print-sheet">
      ${buildPrintHeaderHTML("Monthly Attendance Register")}
      <div class="print-sub2" style="font-weight:700">Month: ${esc(prettyMonth(registerMonth))}</div>
      <div class="print-sub2 cg-nocap" style="font-size:9pt;margin-top:1mm">
        P = Present • A = Absent • L = Leave (excused) • H = Class Holiday • % = P / (P+A)
      </div>
      <div style="margin-top:3mm"></div>
      <table class="reg-table">
        <colgroup>
          <col style="width:11mm">
          <col style="width:38mm">
          ${days.map(() => '<col style="width:4.6mm">').join("")}
          <col style="width:7mm"><col style="width:7mm"><col style="width:7mm"><col style="width:11mm">
        </colgroup>
        <thead><tr>
          <th>Roll</th><th>Name</th>${headCells}
          <th class="total-col">P</th><th class="total-col">A</th><th class="total-col">L</th><th class="total-col">%</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

    const ok = await previewPrint({ html: fullPrintHTML, orientation: "landscape" }, data);
    if (!ok) toast("Could not open the print dialog. Try again.", "error");
  };

  if (!data.students.length) {
    return (
      <div className="space-y-3">
        <div className="bg-white dark:bg-[#1C1917] border border-[#E7E5E4] dark:border-[#44403C] rounded-2xl p-4 shadow-xs">
          <div className="text-center py-8 text-[#78716C] dark:text-[#A8A29E] bg-[#FAFAF9] dark:bg-[#0C0A09] border border-dashed border-[#D6D3D1] dark:border-[#44403C] rounded-2xl flex flex-col items-center justify-center">
            <GraduationCap className="w-10 h-10 mb-2 text-stone-400 dark:text-stone-600" />
            <span>No students enrolled yet. Go to the <b>Students</b> tab to add your students first.</span>
          </div>
        </div>
      </div>
    );
  }

  // Monthly Register in-app preview
  const renderInAppRegister = () => {
    const parts = registerMonth.split("-").map(Number);
    const days = getMonthDays(parts[0], parts[1] - 1);
    const today = todayKey();

    return (
      <div className="mt-3 space-y-2">
        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-[#78716C] dark:text-[#A8A29E]">Month:</label>
          <input
            type="month"
            value={registerMonth}
            max={todayKey().slice(0, 7)}
            onChange={e => { if (e.target.value) setRegisterMonth(e.target.value); }}
            className="p-1.5 px-2.5 text-xs rounded-xl border border-[#D6D3D1] dark:border-[#44403C] bg-white dark:bg-[#0C0A09] text-inherit"
          />
        </div>

        <div className="overflow-x-auto border border-[#E7E5E4] dark:border-[#44403C] rounded-xl max-h-[60vh]">
          <table className="w-full text-[11px] text-center border-collapse">
            <thead className="sticky top-0 z-2 bg-[#FAFAF9] dark:bg-[#292524]">
              <tr>
                <th className="p-1.5 border border-[#E7E5E4] dark:border-[#44403C]">Roll</th>
                <th className="p-1.5 border border-[#E7E5E4] dark:border-[#44403C] text-left min-w-[120px]">Name</th>
                {days.map(k => {
                  const num = parseInt(k.slice(-2), 10);
                  const wd = parseKey(k).getDay();
                  const isWknd = wd === 0 || wd === 6;
                  return (
                    <th key={k} className={`p-1 border border-[#E7E5E4] dark:border-[#44403C] ${isWknd ? 'bg-[#F5F5F4] dark:bg-[#0C0A09]' : ''}`}>
                      {num}
                    </th>
                  );
                })}
                <th className="p-1.5 border border-[#E7E5E4] dark:border-[#44403C] bg-[#F5F5F4] dark:bg-[#292524] font-bold">P</th>
                <th className="p-1.5 border border-[#E7E5E4] dark:border-[#44403C] bg-[#F5F5F4] dark:bg-[#292524] font-bold">A</th>
                <th className="p-1.5 border border-[#E7E5E4] dark:border-[#44403C] bg-[#F5F5F4] dark:bg-[#292524] font-bold">L</th>
                <th className="p-1.5 border border-[#E7E5E4] dark:border-[#44403C] bg-[#F5F5F4] dark:bg-[#292524] font-bold">%</th>
              </tr>
            </thead>
            <tbody>
              {sortedStudents.map(s => {
                const stats = studentMonthStats(s, registerMonth);
                const joinKey = s.createdAt ? dateKey(new Date(s.createdAt)) : null;

                return (
                  <tr key={s.id} className="even:bg-[#FAFAF9] dark:even:bg-[#0C0A09]">
                    <td className="p-1 border border-[#E7E5E4] dark:border-[#44403C] font-mono font-bold">{s.rollNo || "—"}</td>
                    <td className="p-1 border border-[#E7E5E4] dark:border-[#44403C] text-left font-semibold truncate pl-2">{s.name || "—"}</td>
                    {days.map(k => {
                      if (k > today) return <td key={k} className="p-1 border border-[#E7E5E4] dark:border-[#44403C] text-[#D6D3D1]">·</td>;
                      const curDay = data.attendance[k];
                      if (!curDay) return <td key={k} className="p-1 border border-[#E7E5E4] dark:border-[#44403C] text-[#D6D3D1]">·</td>;
                      if (curDay.holiday) return <td key={k} className="p-1 border border-[#E7E5E4] dark:border-[#44403C] bg-[#E8F0F7] dark:bg-[#1A2B3A] text-[#1E4D6B] dark:text-[#8AB4DC] font-bold">H</td>;
                      const explicitSt = curDay.status[s.id];
                      if (explicitSt === undefined && joinKey && k < joinKey) {
                        return <td key={k} className="p-1 border border-[#E7E5E4] dark:border-[#44403C] text-[#D6D3D1]">·</td>;
                      }
                      const st = explicitSt || 'P';
                      let cls = "text-[#065F46]";
                      let bg = "";
                      if (st === 'A') {
                        cls = "text-[#7F1D1D] font-bold";
                        bg = "bg-[#F8E4E1] dark:bg-[#4A1A18]";
                      } else if (st === 'L') {
                        cls = "text-[#7A5515] font-bold";
                        bg = "bg-[#FBF0D9] dark:bg-[#3A2E14]";
                      }
                      return (
                        <td key={k} className={`p-1 border border-[#E7E5E4] dark:border-[#44403C] ${cls} ${bg}`}>
                          {st}
                        </td>
                      );
                    })}
                    <td className="p-1 border border-[#E7E5E4] dark:border-[#44403C] bg-[#FAFAF9] dark:bg-[#1C1917] font-bold text-[#065F46]">{stats.p}</td>
                    <td className="p-1 border border-[#E7E5E4] dark:border-[#44403C] bg-[#FAFAF9] dark:bg-[#1C1917] font-bold text-[#7F1D1D]">{stats.a}</td>
                    <td className="p-1 border border-[#E7E5E4] dark:border-[#44403C] bg-[#FAFAF9] dark:bg-[#1C1917] font-bold text-[#7A5515]">{stats.l}</td>
                    <td className="p-1 border border-[#E7E5E4] dark:border-[#44403C] bg-[#FAFAF9] dark:bg-[#1C1917] font-bold">{stats.pct}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <HowItWorks
        id="attendance"
        title="How attendance works"
        steps={[
          <><b>Pick the date</b> with the arrows or calendar. Future dates are not allowed.</>,
          <>Everyone starts as <b>Present (P)</b>. Only tap <b>A</b> for absent or <b>L</b> for leave (excused). Tap <b>P</b> to undo. It saves automatically.</>,
          <>No school that day? Tap <b>Mark Holiday</b>, or <b>Bulk Holidays</b> for Eid or summer break. Holidays and leaves do not count against attendance %.</>,
          <>When you are done, tap <b>Lock Day</b> so marks can't be changed by mistake.</>,
          <>Use <b>Print Absentee Slip</b> for the day, or <b>Monthly Register</b> / <b>Print Register</b> for the whole month.</>
        ]}
        note="Attendance % = Present ÷ (Present + Absent)."
      />

      {/* Date Bar & Controls */}
      <div className="bg-white dark:bg-[#1C1917] border border-[#E7E5E4] dark:border-[#44403C] rounded-2xl p-4 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 flex-1 min-w-[240px]">
            <button
              type="button"
              onClick={() => shiftDate(-1)}
              title="Previous day"
              className="p-2 px-2.5 rounded-xl bg-[#F5F5F4] dark:bg-[#292524] text-[#1C1917] dark:text-[#F5F5F4] font-bold hover:bg-[#E7E5E4] cursor-pointer flex items-center justify-center"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <input
              type="date"
              value={attDate}
              max={todayKey()}
              onChange={e => { if (e.target.value) setAttDate(e.target.value); }}
              className="flex-1 p-2 rounded-xl border border-[#D6D3D1] dark:border-[#44403C] bg-white dark:bg-[#0C0A09] text-inherit text-xs md:text-sm font-semibold"
            />
            <button
              type="button"
              onClick={() => shiftDate(1)}
              disabled={isToday}
              title="Next day"
              className="p-2 px-2.5 rounded-xl bg-[#F5F5F4] dark:bg-[#292524] text-[#1C1917] dark:text-[#F5F5F4] font-bold hover:bg-[#E7E5E4] disabled:opacity-40 cursor-pointer flex items-center justify-center"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setAttDate(todayKey())}
              className={`p-2 px-3.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                isToday
                  ? 'bg-[#B91C1C] text-white'
                  : 'bg-[#F5F5F4] dark:bg-[#292524] text-[#1C1917] dark:text-[#F5F5F4] hover:bg-[#E7E5E4]'
              }`}
            >
              Today
            </button>
          </div>
        </div>

        <div className="pt-2 border-t border-[#E7E5E4] dark:border-[#44403C] space-y-2.5">
          <div className="font-bold text-xs md:text-sm text-[#1C1917] dark:text-[#F5F5F4] flex items-center justify-between gap-2 flex-wrap">
            <span>{prettyDate(key)}</span>
            <div className="flex items-center gap-1.5">
              {locked && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-[#F5F5F4] dark:bg-[#292524] font-bold">
                  <Lock className="w-3 h-3" /> Locked
                </span>
              )}
              {isHoliday && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-[#E8F0F7] dark:bg-[#1A2B3A] text-[#1E4D6B] dark:text-[#8AB4DC] font-bold">
                  <Sun className="w-3 h-3" /> Holiday
                </span>
              )}
            </div>
          </div>

          <ActionGrid cols={2}>
            <ActionButton
              variant="secondary"
              icon={Sun}
              onClick={handleToggleHoliday}
              disabled={locked}
            >
              {isHoliday ? "Holiday: ON" : "Mark Holiday"}
            </ActionButton>
            <ActionButton
              variant="secondary"
              icon={locked ? Lock : Unlock}
              onClick={handleToggleLock}
            >
              {locked ? "Locked" : "Lock Day"}
            </ActionButton>
            <ActionButton
              variant="secondary"
              icon={Calendar}
              onClick={openBulkHolidayModal}
              fullWidth
            >
              Bulk Holidays
            </ActionButton>
          </ActionGrid>
        </div>
      </div>

      {/* Summary Stat Boxes */}
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-white dark:bg-[#1C1917] border border-[#E7E5E4] dark:border-[#44403C] rounded-2xl p-3 text-center shadow-xs">
          <b className="block text-xl md:text-2xl text-[#1C1917] dark:text-[#F5F5F4]">{c.total}</b>
          <span className="text-[11px] font-semibold text-[#78716C] dark:text-[#A8A29E]">Total</span>
        </div>
        <div className="bg-white dark:bg-[#1C1917] border border-[#E7E5E4] dark:border-[#44403C] rounded-2xl p-3 text-center shadow-xs">
          <b className="block text-xl md:text-2xl text-[#065F46] dark:text-[#6EE7B7]">{isHoliday ? "—" : c.present}</b>
          <span className="text-[11px] font-semibold text-[#78716C] dark:text-[#A8A29E]">Present</span>
        </div>
        <div className="bg-white dark:bg-[#1C1917] border border-[#E7E5E4] dark:border-[#44403C] rounded-2xl p-3 text-center shadow-xs">
          <b className="block text-xl md:text-2xl text-[#B23A32] dark:text-[#F0C8C0]">{isHoliday ? "—" : c.absent}</b>
          <span className="text-[11px] font-semibold text-[#78716C] dark:text-[#A8A29E]">Absent</span>
        </div>
        <div className="bg-white dark:bg-[#1C1917] border border-[#E7E5E4] dark:border-[#44403C] rounded-2xl p-3 text-center shadow-xs">
          <b className="block text-xl md:text-2xl text-[#B4791F] dark:text-[#F8E0A0]">
            {isHoliday ? (
              <span className="inline-flex items-center justify-center">
                <Sun className="w-6 h-6 text-amber-500" />
              </span>
            ) : (
              c.leave
            )}
          </b>
          <span className="text-[11px] font-semibold text-[#78716C] dark:text-[#A8A29E]">{isHoliday ? "Holiday" : "Leave"}</span>
        </div>
      </div>

      {/* Daily Notice / Status Boxes */}
      <div className="bg-white dark:bg-[#1C1917] border border-[#E7E5E4] dark:border-[#44403C] rounded-2xl p-4 shadow-xs space-y-2.5">
        {isHoliday ? (
          <div className="p-3 bg-[#E8F0F7] dark:bg-[#1A2B3A] border border-[#2E5A8A] rounded-xl text-[#1E4D6B] dark:text-[#8AB4DC] text-xs font-semibold flex items-start gap-2">
            <Sun className="w-4 h-4 shrink-0 mt-0.5 text-sky-600 dark:text-sky-400" />
            <div>
              <b>Class Holiday:</b> Whole day off. This date is excluded from all student percentages.
            </div>
          </div>
        ) : !day ? (
          <div className="p-3 bg-[#FBF0D9] dark:bg-[#3A2E14] border border-[#B4791F] rounded-xl text-[#7A5515] dark:text-[#F8E0A0] text-xs font-medium flex items-start gap-2">
            <FileText className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <div>
              Attendance not recorded yet for this day. Tap <b>A</b> for absent, <b>L</b> for leave, or press <b>Mark All Present</b>.
            </div>
          </div>
        ) : (
          <>
            {c.absent > 0 && (
              <div className="p-3 bg-[#F8E4E1] dark:bg-[#3A211E] border border-[#B23A32] dark:border-[#E06A5F] rounded-xl text-xs text-[#7F1D1D] dark:text-[#F0C8C0] flex items-start gap-2">
                <XCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
                <div>
                  <b>Absent ({c.absent}):</b>{" "}
                  {sortedStudents
                    .filter(s => day.status[s.id] === 'A')
                    .map(s => `Roll ${s.rollNo || "—"} — ${s.name}`)
                    .join(" • ")}
                </div>
              </div>
            )}
            {c.leave > 0 && (
              <div className="p-3 bg-[#FBF0D9] dark:bg-[#3A2E14] border border-[#B4791F] rounded-xl text-xs text-[#7A5515] dark:text-[#F8E0A0] flex items-start gap-2">
                <Sun className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                <div>
                  <b>Leave — Excused ({c.leave}):</b>{" "}
                  {sortedStudents
                    .filter(s => day.status[s.id] === 'L')
                    .map(s => `Roll ${s.rollNo || "—"} — ${s.name}`)
                    .join(" • ")}
                </div>
              </div>
            )}
            {c.absent === 0 && c.leave === 0 && (
              <div className="p-3 bg-[#D1FAE5] dark:bg-[#064E3B] border border-[#065F46] dark:border-[#34D399] rounded-xl text-xs text-[#065F46] dark:text-[#A7F3D0] font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Everyone is present.</span>
              </div>
            )}
          </>
        )}

        <div className="pt-1">
          <ActionGrid cols={2}>
            <ActionButton
              variant="success"
              icon={Check}
              onClick={handleMarkAllPresent}
              disabled={locked || isHoliday}
            >
              Mark All Present
            </ActionButton>
            <ActionButton
              variant="danger"
              icon={RotateCcw}
              onClick={handleResetDay}
              disabled={!day || locked}
            >
              Reset Day
            </ActionButton>
          </ActionGrid>
        </div>
      </div>

      {/* Student List with P / A / L Buttons */}
      <div className="bg-white dark:bg-[#1C1917] border border-[#E7E5E4] dark:border-[#44403C] rounded-2xl p-4 shadow-xs">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-sm font-bold text-[#1C1917] dark:text-[#F5F5F4]">
            Students ({sortedStudents.length})
          </h3>
          <span className="text-[11px] text-[#78716C] dark:text-[#A8A29E]">
            Tap name for yearly summary
          </span>
        </div>

        <div className="divide-y divide-[#E7E5E4] dark:divide-[#44403C]">
          {sortedStudents.map(s => {
            const currentStatus = day && day.status ? day.status[s.id] || 'P' : 'P';
            const disabled = locked || isHoliday;

            return (
              <div key={s.id} className="py-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold font-mono bg-[#F5F5F4] dark:bg-[#292524] text-[#1C1917] dark:text-[#F5F5F4]">
                      Roll {s.rollNo || "—"}
                    </span>
                    <button
                      type="button"
                      onClick={() => openStudentSummaryModal(s)}
                      className="font-bold text-sm text-[#1C1917] dark:text-[#F5F5F4] hover:underline cursor-pointer text-left truncate"
                    >
                      {s.name || "(no name)"}
                    </button>
                  </div>
                  {s.fatherName && (
                    <div className="text-xs text-[#A8A29E] truncate mt-0.5">
                      s/o {s.fatherName}
                    </div>
                  )}
                </div>

                {/* P / A / L Action Toggle Group */}
                <div className="flex gap-1 shrink-0">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => handleSetStatus(s.id, 'P')}
                    title="Present"
                    className={`w-10 h-9 rounded-xl text-sm font-extrabold transition-all cursor-pointer ${
                      currentStatus === 'P'
                        ? 'bg-[#D1FAE5] text-[#065F46] border-2 border-[#065F46] dark:bg-[#064E3B] dark:text-[#A7F3D0] dark:border-[#34D399]'
                        : 'bg-[#F5F5F4] dark:bg-[#292524] text-[#A8A29E] hover:bg-[#E7E5E4]'
                    } disabled:opacity-40`}
                  >
                    P
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => handleSetStatus(s.id, 'A')}
                    title="Absent"
                    className={`w-10 h-9 rounded-xl text-sm font-extrabold transition-all cursor-pointer ${
                      currentStatus === 'A'
                        ? 'bg-[#F8E4E1] text-[#7F1D1D] border-2 border-[#B23A32] dark:bg-[#4A1A18] dark:text-[#F0C8C0] dark:border-[#E06A5F]'
                        : 'bg-[#F5F5F4] dark:bg-[#292524] text-[#A8A29E] hover:bg-[#E7E5E4]'
                    } disabled:opacity-40`}
                  >
                    A
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => handleSetStatus(s.id, 'L')}
                    title="Leave (Excused, excluded from %)"
                    className={`w-10 h-9 rounded-xl text-sm font-extrabold transition-all cursor-pointer ${
                      currentStatus === 'L'
                        ? 'bg-[#FBF0D9] text-[#7A5515] border-2 border-[#B4791F] dark:bg-[#3A2E14] dark:text-[#F8E0A0] dark:border-[#D9A03F]'
                        : 'bg-[#F5F5F4] dark:bg-[#292524] text-[#A8A29E] hover:bg-[#E7E5E4]'
                    } disabled:opacity-40`}
                  >
                    L
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Reports & Register Section */}
      <div className="bg-white dark:bg-[#1C1917] border border-[#E7E5E4] dark:border-[#44403C] rounded-2xl p-4 shadow-xs space-y-3">
        <h3 className="text-sm font-bold text-[#1C1917] dark:text-[#F5F5F4]">
          Attendance Reports
        </h3>
        <ActionGrid cols={4}>
          <ActionButton
            variant="primary"
            icon={Printer}
            onClick={handlePrintAbsenteeSlip}
          >
            Print Absentee Slip
          </ActionButton>
          <ActionButton
            variant="secondary"
            icon={Download}
            onClick={handleDownloadSlipPNG}
            disabled={savingSlipImage}
          >
            {savingSlipImage ? "Generating..." : "Save as Image"}
          </ActionButton>
          <ActionButton
            variant="secondary"
            icon={BarChart2}
            onClick={() => setRegisterOpen(!registerOpen)}
          >
            {registerOpen ? "Hide Register" : "Monthly Register"}
          </ActionButton>
          <ActionButton
            variant="secondary"
            icon={Printer}
            onClick={handlePrintRegister}
          >
            Print Register
          </ActionButton>
        </ActionGrid>

        {registerOpen && renderInAppRegister()}
      </div>
    </div>
  );
};

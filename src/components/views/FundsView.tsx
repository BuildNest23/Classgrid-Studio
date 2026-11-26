import React, { useState, useMemo, useEffect } from 'react';
import { SyncInput } from '../SyncInput';
import { FundCardModal } from '../FundCardModal';
import { useClassroom } from '../../context/ClassroomContext';
import { Fund, Student } from '../../types';
import {
  newFundId,
  fmtMoney,
  todayKey,
  todayISO,
  prettyShortDate,
  getSortedStudents,
  esc,
  getNameColWidth,
  getPrintNameColPct,
  gridNavKeyDown,
  gridTabIndex,
} from '../../utils/helpers';
import { previewPrint } from '../../utils/printPreviewBus';
import {
  ArrowLeft,
  Wallet,
  Plus,
  CheckCircle2,
  Trash2,
  AlertTriangle,
  Printer,
  ChevronRight,
  X,
  Search,
  FileText,
} from 'lucide-react';
import { PlainTextInput } from '../PlainTextInput';

type FundStatusFilter = 'all' | 'pending' | 'partial' | 'paid' | 'exempt';

export const FundsView: React.FC = () => {
  const {
    data,
    saveData,
    quickSaveData,
    flushSave,
    toast,
    uiConfirm,
    activeFundId,
    setActiveFundId,
    computeFundStats,
    getFundStudentStatus,
    buildPrintHeaderHTML
  } = useClassroom();

  const [newFormOpen, setNewFormOpen] = useState(false);
  const [newFundName, setNewFundName] = useState("");
  const [newFundAmount, setNewFundAmount] = useState("");
  const [newFundDue, setNewFundDue] = useState("");

  const [statusFilter, setStatusFilter] = useState<FundStatusFilter>('all');
  const [studentQuery, setStudentQuery] = useState("");
  const [cardStudentId, setCardStudentId] = useState<string | null>(null);

  const activeFund = data.funds.find(f => f.id === activeFundId);
  const sortedStudents = getSortedStudents(data.students);

  // Snug Name column: exact width of the longest student name in the active class
  const nameColWidth = useMemo(
    () => getNameColWidth(sortedStudents.map(s => s.name || "")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.students]
  );

  // Reset filters when switching funds
  useEffect(() => {
    setStatusFilter('all');
    setStudentQuery("");
  }, [activeFundId]);

  // 1. FUND LIST VIEW
  if (!activeFund) {
    const handleCreateFund = (e: React.FormEvent) => {
      e.preventDefault();
      const trimmedName = newFundName.trim();
      if (!trimmedName) {
        toast("Please enter a fund name.", "error");
        return;
      }

      const amtNum = newFundAmount === "" ? 0 : Number(newFundAmount) || 0;
      const newFund: Fund = {
        id: newFundId(),
        name: trimmedName,
        amount: Math.max(0, amtNum),
        dueDate: newFundDue.trim(),
        createdAt: Date.now()
      };

      saveData(prev => ({
        ...prev,
        funds: [...prev.funds, newFund]
      }));

      setNewFormOpen(false);
      setNewFundName("");
      setNewFundAmount("");
      setNewFundDue("");
      setActiveFundId(newFund.id);
      toast("Fund created.", "success");
    };

    const sortedFunds = data.funds
      .slice()
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    return (
      <div className="cg-view-enter space-y-5">
        {/* Masthead */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-stone-500 dark:text-stone-400">
              {data.className || 'Class'} · <span className="font-mono-num">{data.funds.length}</span> {data.funds.length === 1 ? 'fund' : 'funds'}
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-50 mt-0.5">
              Funds
            </h1>
          </div>
          {sortedFunds.length > 0 && (
            <button
              type="button"
              onClick={() => setNewFormOpen(o => !o)}
              className={`min-h-[44px] px-4 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer shrink-0 ${
                newFormOpen
                  ? 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-200 hover:bg-stone-200 dark:hover:bg-stone-700'
                  : 'bg-red-800 hover:bg-red-900 dark:bg-red-700 dark:hover:bg-red-600 text-white'
              }`}
            >
              {newFormOpen ? (
                <>
                  <X className="w-4 h-4" />
                  <span>Cancel</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>New fund</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Inline Creation Surface */}
        {newFormOpen && (
          <form
            onSubmit={handleCreateFund}
            className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-4 sm:p-5 space-y-4"
          >
            <div>
              <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100">Create fund</h2>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                Leave amount blank if each student contributes a different amount.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1">
                  Fund name
                </label>
                <PlainTextInput
                  value={newFundName}
                  placeholder="e.g. Monthly Fee — Sep 2026"
                  onChange={e => setNewFundName(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 text-sm rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:border-red-700 dark:focus:border-red-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1">
                  Amount per student (optional)
                </label>
                <input
                  type="number"
                  min="0"
                  value={newFundAmount}
                  placeholder="e.g. 500 or leave blank"
                  onChange={e => setNewFundAmount(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 text-sm font-mono-num rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:border-red-700 dark:focus:border-red-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1">
                  Due date (optional)
                </label>
                <input
                  type="date"
                  value={newFundDue}
                  onChange={e => setNewFundDue(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 text-sm font-mono-num rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100 focus:outline-none focus:border-red-700 dark:focus:border-red-500"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setNewFormOpen(false)}
                className="min-h-[44px] px-4 rounded-xl text-sm font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="min-h-[44px] px-5 rounded-xl text-sm font-semibold bg-red-800 hover:bg-red-900 dark:bg-red-700 dark:hover:bg-red-600 text-white inline-flex items-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Create fund</span>
              </button>
            </div>
          </form>
        )}

        {/* Fund Cards Grid */}
        {sortedFunds.length === 0 ? (
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl px-6 py-12 text-center flex flex-col items-center">
            <div className="w-12 h-12 rounded-2xl bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-stone-400 dark:text-stone-500 mb-3">
              <Wallet className="w-6 h-6" />
            </div>
            <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">No funds yet</h2>
            <p className="text-sm text-stone-500 dark:text-stone-400 mt-1 max-w-sm">
              Track tuition fees, book charges, or trip collections and issue parent-ready fee receipts.
            </p>
            {!newFormOpen && (
              <button
                type="button"
                onClick={() => setNewFormOpen(true)}
                className="mt-5 min-h-[44px] px-4 rounded-xl text-sm font-semibold bg-red-800 hover:bg-red-900 dark:bg-red-700 dark:hover:bg-red-600 text-white inline-flex items-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>New fund</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sortedFunds.map(f => {
              const st = computeFundStats(f.id);
              const overdue = !!(f.dueDate && f.dueDate < todayKey() && st.pct < 100);

              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setActiveFundId(f.id)}
                  className="group text-left p-4 rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 hover:border-stone-300 dark:hover:border-stone-700 transition-colors cursor-pointer flex flex-col justify-between gap-3"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[15px] font-bold text-stone-900 dark:text-stone-100 truncate">
                        {f.name}
                      </span>
                      <ChevronRight className="w-4 h-4 text-stone-400 group-hover:text-stone-700 dark:group-hover:text-stone-200 shrink-0 mt-0.5 transition-transform group-hover:translate-x-0.5" />
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap text-xs text-stone-500 dark:text-stone-400 mt-1 font-mono-num">
                      <span>{st.variable ? "Variable amount" : `${fmtMoney(f.amount)}/student`}</span>
                      {f.dueDate && (
                        <>
                          <span>·</span>
                          <span className={overdue ? 'text-red-700 dark:text-red-400 font-semibold inline-flex items-center gap-1' : ''}>
                            {overdue && <AlertTriangle className="w-3 h-3" />}
                            Due {prettyShortDate(f.dueDate)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="w-full h-1.5 bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          st.pct >= 100
                            ? 'bg-emerald-700 dark:bg-emerald-500'
                            : overdue
                            ? 'bg-red-700 dark:bg-red-500'
                            : 'bg-amber-600 dark:bg-amber-500'
                        }`}
                        style={{ width: `${Math.min(100, st.pct)}%` }}
                      />
                    </div>

                    <div className="flex items-baseline justify-between gap-2 text-xs font-mono-num">
                      <span className="text-stone-500 dark:text-stone-400">
                        Collected <strong className="font-semibold text-emerald-700 dark:text-emerald-400">{fmtMoney(st.collected)}</strong>
                      </span>
                      {!st.variable && (
                        <span className="text-stone-500 dark:text-stone-400">
                          Due <strong className={`font-semibold ${st.pending > 0 ? 'text-red-700 dark:text-red-400' : 'text-stone-700 dark:text-stone-300'}`}>{fmtMoney(st.pending)}</strong>
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] text-stone-500 dark:text-stone-400 font-mono-num">
                      <strong className="font-semibold text-stone-700 dark:text-stone-300">{st.paid}</strong> paid ·{' '}
                      <strong className="font-semibold text-stone-700 dark:text-stone-300">{st.partial}</strong> partial ·{' '}
                      <strong className="font-semibold text-stone-700 dark:text-stone-300">{st.pend}</strong> pending
                      {st.exempt > 0 && (
                        <>
                          {' '}· <strong className="font-semibold text-stone-700 dark:text-stone-300">{st.exempt}</strong> exempt
                        </>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // 2. ACTIVE FUND COLLECTION SHEET VIEW
  const stats = computeFundStats(activeFund.id);
  const overdue = !!(activeFund.dueDate && activeFund.dueDate < todayKey() && stats.pct < 100);

  // Filtered students for table
  const trimmedQuery = studentQuery.trim().toLowerCase();
  const visibleStudents = sortedStudents.filter(s => {
    const payment = (data.fundPayments[activeFund.id] || {})[s.id] || {};
    const st = getFundStudentStatus(activeFund.id, s.id);
    const isExempt = !!payment.exempt;
    if (statusFilter === 'exempt' && !isExempt) return false;
    if (statusFilter === 'paid' && (isExempt || st.code !== 'PAID')) return false;
    if (statusFilter === 'partial' && (isExempt || st.code !== 'PARTIAL')) return false;
    if (statusFilter === 'pending' && (isExempt || st.code !== 'PENDING')) return false;
    if (trimmedQuery) {
      const nameMatch = (s.name || '').toLowerCase().includes(trimmedQuery);
      const rollMatch = (s.rollNo || '').toLowerCase().includes(trimmedQuery);
      if (!nameMatch && !rollMatch) return false;
    }
    return true;
  });

  // Delete Fund
  const handleDeleteFund = async () => {
    const ok = await uiConfirm(`Delete fund "${activeFund.name}"?\n\nAll its payment records will be permanently deleted.`, {
      title: "Delete Fund",
      yesText: "Delete",
      danger: true,
      icon: "warning"
    });
    if (!ok) return;

    saveData(prev => {
      const nextFunds = prev.funds.filter(f => f.id !== activeFund.id);
      const nextPayments = { ...prev.fundPayments };
      delete nextPayments[activeFund.id];
      return { ...prev, funds: nextFunds, fundPayments: nextPayments };
    });

    setActiveFundId(null);
    toast("Fund deleted.", "success");
  };

  // Mark All Paid
  const handleMarkAllPaid = async () => {
    const ok = await uiConfirm(
      `Mark all students as PAID for "${activeFund.name}" (each ${fmtMoney(activeFund.amount)})?\n\nStudents marked Exempt will stay as Exempt.`,
      {
        title: "Mark All Paid",
        yesText: "Mark All Paid",
        icon: "success"
      }
    );
    if (!ok) return;

    const todayStr = todayISO();
    saveData(prev => {
      const fundMap = { ...(prev.fundPayments[activeFund.id] || {}) };

      sortedStudents.forEach(s => {
        const cur = fundMap[s.id] || {};
        if (cur.exempt) return;
        fundMap[s.id] = {
          ...cur,
          amount: activeFund.amount,
          date: cur.date || todayStr
        };
      });

      return { ...prev, fundPayments: { ...prev.fundPayments, [activeFund.id]: fundMap } };
    });
    toast("All students marked as paid.", "success");
  };

  // Change amount
  const handleAmountChange = (sid: string, val: string) => {
    const num = val === "" ? 0 : Number(val);
    if (isNaN(num) || num < 0) return;
    const existing = (data.fundPayments[activeFund.id] || {})[sid];
    if (!existing && num === 0) return;

    saveData(prev => {
      const fundMap = { ...(prev.fundPayments[activeFund.id] || {}) };
      const cur = fundMap[sid] || {};

      fundMap[sid] = {
        ...cur,
        amount: num,
        date: num > 0 && !cur.date ? todayISO() : cur.date
      };

      return { ...prev, fundPayments: { ...prev.fundPayments, [activeFund.id]: fundMap } };
    });
  };

  // Toggle Exempt
  const handleToggleExempt = (sid: string) => {
    saveData(prev => {
      const fundMap = { ...(prev.fundPayments[activeFund.id] || {}) };
      const cur = fundMap[sid] || {};
      const nextExempt = !cur.exempt;

      fundMap[sid] = {
        ...cur,
        exempt: nextExempt,
        amount: nextExempt ? 0 : cur.amount
      };

      return { ...prev, fundPayments: { ...prev.fundPayments, [activeFund.id]: fundMap } };
    });
  };

  // Date change
  const handleDateChange = (sid: string, dateVal: string) => {
    quickSaveData(prev => {
      const fundMap = { ...(prev.fundPayments[activeFund.id] || {}) };
      const cur = fundMap[sid] || {};
      fundMap[sid] = { ...cur, date: dateVal };
      return { ...prev, fundPayments: { ...prev.fundPayments, [activeFund.id]: fundMap } };
    });
  };

  // Note change
  const handleNoteChange = (sid: string, noteVal: string) => {
    quickSaveData(prev => {
      const fundMap = { ...(prev.fundPayments[activeFund.id] || {}) };
      const cur = fundMap[sid] || {};
      fundMap[sid] = { ...cur, note: noteVal };
      return { ...prev, fundPayments: { ...prev.fundPayments, [activeFund.id]: fundMap } };
    });
  };

  // Print Collection Sheet
  const handlePrintCollection = async () => {
    const rows = sortedStudents.map((s, i) => {
      const p = (data.fundPayments[activeFund.id] || {})[s.id] || {};
      const st = getFundStudentStatus(activeFund.id, s.id);
      const exempt = !!p.exempt;
      const amtVal = p.amount !== undefined && p.amount !== 0 ? String(p.amount) : "";
      const statTxt = exempt ? "EXEMPT" : st.code;
      const statCls = "stat-" + statTxt.toLowerCase();
      const amtCls = exempt ? "" : (st.code === 'PAID' ? "amt-green" : "amt-red");

      return `<tr>
        <td class="center">${i + 1}</td>
        <td class="center font-mono">${esc(s.rollNo || "—")}</td>
        <td class="name"><span class="cg-fit">${esc(s.name || "—")}</span></td>
        <td class="center ${amtCls}">${esc(amtVal)}</td>
        <td class="center ${statCls}">${statTxt}</td>
        <td class="center">${esc(p.date || "—")}</td>
        <td class="cg-nocap">${esc(p.note || "")}</td>
      </tr>`;
    }).join("");

    const totalLine = stats.variable
      ? `Collected: ${fmtMoney(stats.collected)} • Paid: ${stats.paid} • Pending: ${stats.pend} • Exempt: ${stats.exempt}`
      : `Collected: ${fmtMoney(stats.collected)} • Outstanding: ${fmtMoney(stats.pending)} • Paid: ${stats.paid} • Partial: ${stats.partial} • Pending: ${stats.pend} • Exempt: ${stats.exempt}`;
    const amtDesc = stats.variable ? "Variable amount" : `${fmtMoney(activeFund.amount)} per student`;

    const namePct = getPrintNameColPct(sortedStudents.map(st => st.name || ""), 9, data.printSize, data.forceOrientation);
    const fullPrintHTML = `<div class="print-sheet">
      ${buildPrintHeaderHTML(activeFund.name + " — Collection Sheet", (activeFund.dueDate ? "Due: " + prettyShortDate(activeFund.dueDate) + " • " : "") + amtDesc)}
      <table class="fund-print">
        <thead><tr>
          <th style="width:6%">#</th>
          <th style="width:9%">Roll</th>
          <th style="width:${namePct}%">Name</th>
          <th style="width:12%">Amount</th>
          <th style="width:13%">Status</th>
          <th style="width:15%">Date</th>
          <th>Note</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="cg-nocap" style="margin-top:3mm;font-size:9.5pt;font-weight:700">${totalLine}</div>
    </div>`;

    const ok = await previewPrint({ html: fullPrintHTML, orientation: "portrait" }, data);
    if (!ok) toast("Could not open the print dialog. Try again.", "error");
  };

  // Print Pending Debtors List
  const handlePrintPending = async () => {
    const pendingRows: Array<{ s: Student; st: ReturnType<typeof getFundStudentStatus> }> = [];
    let totalPending = 0;

    sortedStudents.forEach(s => {
      const p = (data.fundPayments[activeFund.id] || {})[s.id] || {};
      if (p.exempt) return;
      const st = getFundStudentStatus(activeFund.id, s.id);
      if (st.code === 'PAID') return;
      pendingRows.push({ s, st });
      if (!stats.variable) {
        totalPending += Math.max(0, st.target - st.amount);
      }
    });

    const pendingNamePct = getPrintNameColPct(pendingRows.map(r => r.s.name || ""), 9, data.printSize, data.forceOrientation);
    let bodyHTML = "";
    if (!pendingRows.length) {
      bodyHTML = `<div class="no-absents">Everyone has paid or is exempt.</div>`;
    } else {
      bodyHTML = `<table class="fund-print">
        <thead><tr>
          <th style="width:6%">#</th>
          <th style="width:9%">Roll</th>
          <th style="width:${pendingNamePct}%">Name</th>
          <th style="width:16%">Paid</th>
          <th style="width:16%">Owed</th>
          <th>Note</th>
        </tr></thead>
        <tbody>${pendingRows.map((row, i) => {
          const p = (data.fundPayments[activeFund.id] || {})[row.s.id] || {};
          const owed = stats.variable ? "—" : Math.max(0, row.st.target - row.st.amount);
          return `<tr>
            <td class="center">${i + 1}</td>
            <td class="center font-mono">${esc(row.s.rollNo || "—")}</td>
            <td class="name"><span class="cg-fit">${esc(row.s.name || "—")}</span></td>
            <td class="center">${esc(row.st.amount ? String(row.st.amount) : "—")}</td>
            <td class="center font-bold" style="color:#991B1B">${esc(owed)}</td>
            <td class="cg-nocap">${esc(p.note || "")}</td>
          </tr>`;
        }).join("")}</tbody>
      </table>`;
    }

    const subtitle = stats.variable ? "Students who haven't paid yet" : `Total Owed: ${fmtMoney(totalPending)}`;
    const fullPrintHTML = `<div class="print-sheet">
      ${buildPrintHeaderHTML(activeFund.name + " — Pending List", subtitle)}
      ${bodyHTML}
    </div>`;

    const ok = await previewPrint({ html: fullPrintHTML, orientation: "portrait" }, data);
    if (!ok) toast("Could not open the print dialog. Try again.", "error");
  };

  const filterTabs: Array<{ key: FundStatusFilter; label: string; count: number }> = [
    { key: 'all', label: 'All', count: sortedStudents.length },
    { key: 'pending', label: 'Pending', count: stats.pend },
    ...(!stats.variable ? [{ key: 'partial' as const, label: 'Partial', count: stats.partial }] : []),
    { key: 'paid', label: 'Paid', count: stats.paid },
    ...(stats.exempt > 0 ? [{ key: 'exempt' as const, label: 'Exempt', count: stats.exempt }] : []),
  ];

  return (
    <div className="cg-view-enter space-y-5">
      {/* Active Fund Masthead */}
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setActiveFundId(null)}
          className="min-h-[40px] -ml-1.5 px-1.5 rounded-lg inline-flex items-center gap-1.5 text-xs font-semibold text-red-800 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>All funds</span>
        </button>

        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-50 truncate">
                {activeFund.name}
              </h1>
              {overdue && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 dark:text-red-400">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Overdue
                </span>
              )}
            </div>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5 font-mono-num">
              {stats.variable ? "Variable amount" : `${fmtMoney(activeFund.amount)} per student`} · {stats.totalStudentsCounted} counted
              {stats.exempt > 0 && ` (${stats.exempt} exempt)`}
              {activeFund.dueDate && ` · Due ${prettyShortDate(activeFund.dueDate)}`}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handlePrintCollection}
              className="min-h-[42px] px-3.5 rounded-xl text-xs font-semibold bg-red-800 hover:bg-red-900 dark:bg-red-700 dark:hover:bg-red-600 text-white inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Collection sheet</span>
            </button>
            <button
              type="button"
              onClick={handlePrintPending}
              className="min-h-[42px] px-3.5 rounded-xl text-xs font-semibold border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-800 dark:text-stone-100 hover:bg-stone-50 dark:hover:bg-stone-800 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <FileText className="w-4 h-4 text-stone-400" />
              <span>Pending list</span>
            </button>
            {!stats.variable && (
              <button
                type="button"
                onClick={handleMarkAllPaid}
                className="min-h-[42px] px-3.5 rounded-xl text-xs font-semibold border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100/70 dark:hover:bg-emerald-950/50 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Mark all paid</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleDeleteFund}
              aria-label="Delete fund"
              title="Delete fund"
              className="min-h-[42px] w-[42px] rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-500 hover:text-red-700 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-900/60 hover:bg-red-50/50 dark:hover:bg-red-950/30 inline-flex items-center justify-center transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Unified Fund Pulse Bar */}
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl overflow-hidden">
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 divide-x divide-stone-200 dark:divide-stone-800">
          <div className="px-4 py-3.5">
            <div className="text-xs font-medium text-stone-500 dark:text-stone-400">Collected</div>
            <div className="mt-1 text-lg font-bold font-mono-num text-emerald-700 dark:text-emerald-400">
              {fmtMoney(stats.collected)}
            </div>
          </div>

          <div className="px-4 py-3.5">
            <div className="text-xs font-medium text-stone-500 dark:text-stone-400">
              {stats.variable ? 'Collection type' : 'Outstanding'}
            </div>
            <div className={`mt-1 text-lg font-bold font-mono-num ${
              stats.variable
                ? 'text-stone-700 dark:text-stone-300'
                : stats.pending > 0
                ? 'text-red-700 dark:text-red-400'
                : 'text-stone-900 dark:text-stone-100'
            }`}>
              {stats.variable ? 'Variable' : fmtMoney(stats.pending)}
            </div>
          </div>

          <div className="px-4 py-3.5">
            <div className="text-xs font-medium text-stone-500 dark:text-stone-400">Students</div>
            <div className="mt-1 text-xs font-mono-num text-stone-600 dark:text-stone-300 leading-relaxed">
              <strong className="font-semibold text-stone-900 dark:text-stone-100">{stats.paid}</strong> paid ·{' '}
              {!stats.variable && (
                <>
                  <strong className="font-semibold text-stone-900 dark:text-stone-100">{stats.partial}</strong> partial ·{' '}
                </>
              )}
              <strong className="font-semibold text-stone-900 dark:text-stone-100">{stats.pend}</strong> pending
            </div>
          </div>

          <div className="px-4 py-3.5">
            <div className="text-xs font-medium text-stone-500 dark:text-stone-400">Progress</div>
            <div className="mt-1 flex items-baseline gap-1.5 font-mono-num">
              <span className={`text-lg font-bold ${
                stats.pct >= 100
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-stone-900 dark:text-stone-100'
              }`}>
                {stats.pct}%
              </span>
              {stats.exempt > 0 && (
                <span className="text-xs text-stone-500 dark:text-stone-400">{stats.exempt} exempt</span>
              )}
            </div>
          </div>
        </div>
        <div className="h-1 bg-stone-100 dark:bg-stone-800">
          <div
            className={`h-full transition-all ${
              stats.pct >= 100
                ? 'bg-emerald-700 dark:bg-emerald-500'
                : overdue
                ? 'bg-red-700 dark:bg-red-500'
                : 'bg-amber-600 dark:bg-amber-500'
            }`}
            style={{ width: `${Math.min(100, stats.pct)}%` }}
          />
        </div>
      </div>

      {/* Collection Matrix Surface */}
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl overflow-hidden">
        {/* Matrix Toolbar */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-stone-200 dark:border-stone-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            {filterTabs.map(tab => {
              const active = statusFilter === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setStatusFilter(tab.key)}
                  className={`min-h-[36px] px-3 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                    active
                      ? 'bg-red-800 dark:bg-red-700 text-white'
                      : 'bg-stone-100/80 dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:bg-stone-200/70 dark:hover:bg-stone-700'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span className={`font-mono-num ${active ? 'text-white/80' : 'text-stone-400 dark:text-stone-500'}`}>
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {sortedStudents.length >= 8 && (
            <div className="relative w-full sm:w-56 shrink-0">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={studentQuery}
                onChange={e => setStudentQuery(e.target.value)}
                placeholder="Search student or roll…"
                className="w-full min-h-[38px] pl-9 pr-8 py-1.5 text-xs rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:border-red-700 dark:focus:border-red-500"
              />
              {studentQuery && (
                <button
                  type="button"
                  onClick={() => setStudentQuery("")}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Table */}
        {visibleStudents.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-stone-500 dark:text-stone-400">
            No students match the current filter.
          </div>
        ) : (
          <div className="fund-wrap overflow-x-auto max-h-[72vh]">
            <table
              className="w-full text-xs text-center border-separate border-spacing-0"
              style={{ '--name-col-w': `${nameColWidth}px` } as React.CSSProperties}
            >
              <thead className="sticky top-0 z-10 bg-stone-50 dark:bg-stone-900 text-stone-700 dark:text-stone-200">
                <tr>
                  <th className="sc1 px-2 py-2.5 border-b border-r border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900 font-semibold">
                    Roll
                  </th>
                  <th className="sc2 px-2.5 py-2.5 border-b border-r border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900 text-left font-semibold">
                    Name
                  </th>
                  <th className="px-2 py-2.5 border-b border-r border-stone-200 dark:border-stone-800 min-w-[116px] font-semibold">
                    Amount
                  </th>
                  <th className="px-2.5 py-2.5 border-b border-r border-stone-200 dark:border-stone-800 min-w-[92px] font-semibold">
                    Status
                  </th>
                  <th className="px-2 py-2.5 border-b border-r border-stone-200 dark:border-stone-800 min-w-[136px] font-semibold">
                    Date
                  </th>
                  <th className="px-2.5 py-2.5 border-b border-stone-200 dark:border-stone-800 min-w-[160px] text-left font-semibold">
                    Note
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleStudents.map((s, sIdx) => {
                  const payment = (data.fundPayments[activeFund.id] || {})[s.id] || {};
                  const st = getFundStudentStatus(activeFund.id, s.id);
                  const isPaid = st.code === 'PAID';
                  const isPartial = st.code === 'PARTIAL';
                  const isExempt = !!payment.exempt;
                  const amtVal = payment.amount !== undefined && payment.amount !== 0 ? payment.amount : "";
                  const isEven = sIdx % 2 === 1;

                  const solidStickyBg = isExempt
                    ? 'bg-[#FAFAF9] dark:bg-[#23201E]'
                    : isPaid
                    ? 'bg-[#ECFDF5] dark:bg-[#0D2B22]'
                    : isEven
                    ? 'bg-[#FAFAF9] dark:bg-[#141210]'
                    : 'bg-white dark:bg-[#1C1917]';

                  return (
                    <tr
                      key={s.id}
                      className={isEven ? 'bg-stone-50/60 dark:bg-stone-950/40' : 'bg-white dark:bg-stone-900'}
                    >
                      <td className={`sc1 px-2 py-2 border-b border-r border-stone-200 dark:border-stone-800 font-mono-num font-semibold ${solidStickyBg} ${
                        isPaid && !isExempt ? 'text-emerald-800 dark:text-emerald-300' : 'text-stone-600 dark:text-stone-300'
                      }`}>
                        {s.rollNo || "—"}
                      </td>
                      <td className={`sc2 px-2.5 py-2 border-b border-r border-stone-200 dark:border-stone-800 text-left font-semibold truncate ${solidStickyBg} ${
                        isPaid && !isExempt ? 'text-emerald-900 dark:text-emerald-200' : 'text-stone-900 dark:text-stone-100'
                      }`}>
                        <button
                          type="button"
                          onClick={() => setCardStudentId(s.id)}
                          title="Open fee receipt"
                          className="max-w-full truncate text-left font-semibold cursor-pointer hover:underline decoration-dotted underline-offset-2"
                        >
                          {s.name || "(no name)"}
                        </button>
                      </td>

                      {/* Amount Cell with E (Exempt) toggle */}
                      <td className={`px-1.5 py-1 border-b border-r border-stone-200 dark:border-stone-800 ${
                        isExempt
                          ? 'bg-stone-100/70 dark:bg-stone-800/40'
                          : isPaid
                          ? 'bg-emerald-50/70 dark:bg-emerald-950/30'
                          : isPartial
                          ? 'bg-amber-50/60 dark:bg-amber-950/20'
                          : 'bg-red-50/50 dark:bg-red-950/20'
                      }`}>
                        <div className="flex items-center justify-center gap-1.5">
                          <SyncInput
                            type="number"
                            min="0"
                            disabled={isExempt}
                            value={amtVal}
                            onCommit={v => handleAmountChange(s.id, v)}
                            data-fcoord={`${sIdx}_0`}
                            enterKeyHint="next"
                            tabIndex={gridTabIndex(sIdx, 0, visibleStudents.length)}
                            onKeyDown={e => gridNavKeyDown(e, 'data-fcoord', sIdx, 0, visibleStudents.length)}
                            placeholder="0"
                            className="w-16 py-1 text-center font-bold font-mono-num text-xs rounded-md border border-transparent focus:border-red-700 dark:focus:border-red-500 focus:bg-white dark:focus:bg-stone-950 bg-transparent text-inherit disabled:opacity-35"
                          />
                          <button
                            type="button"
                            tabIndex={-1}
                            onClick={() => handleToggleExempt(s.id)}
                            title={isExempt ? "Remove exempt status" : "Mark Exempt"}
                            aria-label="Toggle Exempt"
                            className={`w-8 h-8 rounded-lg text-xs font-bold flex items-center justify-center transition-colors cursor-pointer shrink-0 border ${
                              isExempt
                                ? 'bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900 border-stone-800 dark:border-stone-200'
                                : 'bg-white/80 dark:bg-stone-900 text-stone-400 border-stone-200 dark:border-stone-700 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800'
                            }`}
                          >
                            E
                          </button>
                        </div>
                      </td>

                      {/* Status */}
                      <td className={`px-2.5 py-2 border-b border-r border-stone-200 dark:border-stone-800 font-semibold text-xs ${
                        isExempt
                          ? 'text-stone-500 dark:text-stone-400 bg-stone-100/50 dark:bg-stone-800/30'
                          : isPaid
                          ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50/70 dark:bg-emerald-950/30'
                          : isPartial
                          ? 'text-amber-700 dark:text-amber-300 bg-amber-50/70 dark:bg-amber-950/25'
                          : 'text-red-700 dark:text-red-400 bg-red-50/50 dark:bg-red-950/20'
                      }`}>
                        {isExempt ? "Exempt" : st.code === 'PAID' ? 'Paid' : st.code === 'PARTIAL' ? 'Partial' : 'Pending'}
                        {st.overpaid && <span className="ml-1 text-[10px] text-emerald-700 dark:text-emerald-400" title="Overpaid">▲</span>}
                      </td>

                      {/* Date Cell */}
                      <td className="px-1.5 py-1 border-b border-r border-stone-200 dark:border-stone-800">
                        <SyncInput
                          type="date"
                          value={payment.date || ""}
                          onLive={v => handleDateChange(s.id, v)}
                          onCommit={() => flushSave()}
                          className="w-full px-1.5 py-1 text-xs font-mono-num text-center bg-transparent border border-transparent focus:border-red-700 dark:focus:border-red-500 focus:outline-none focus:bg-white dark:focus:bg-stone-950 rounded-md"
                        />
                      </td>

                      {/* Note Cell */}
                      <td className="px-1.5 py-1 border-b border-stone-200 dark:border-stone-800">
                        <SyncInput
                          type="text"
                          value={payment.note || ""}
                          placeholder="Optional note"
                          onLive={v => handleNoteChange(s.id, v)}
                          onCommit={() => flushSave()}
                          className="w-full px-1.5 py-1 text-xs bg-transparent border border-transparent focus:border-red-700 dark:focus:border-red-500 focus:outline-none focus:bg-white dark:focus:bg-stone-950 rounded-md"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Quiet Footer Hint */}
        <div className="px-4 sm:px-5 py-2.5 border-t border-stone-100 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-950/40 text-xs text-stone-500 dark:text-stone-400">
          Tap any student's name to preview, print, or share their fee receipt. Tap <strong className="font-semibold text-stone-700 dark:text-stone-300">E</strong> to mark a student exempt.
        </div>
      </div>

      {cardStudentId && (
        <FundCardModal
          data={data}
          students={sortedStudents.map(st => ({ id: st.id, name: st.name, rollNo: st.rollNo }))}
          studentId={cardStudentId}
          onChange={setCardStudentId}
          onClose={() => setCardStudentId(null)}
        />
      )}
    </div>
  );
};

import { SyncInput } from '../SyncInput';
import { ActionGrid, ActionButton } from '../ActionGrid';
import { HowItWorks } from '../HowItWorks';
import { FundCardModal } from '../FundCardModal';
import React, { useState, useMemo } from 'react';
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
  Wallet,
  Plus,
  CheckCircle2,
  Trash2,
  AlertTriangle,
  Printer
} from 'lucide-react';

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

  const [cardStudentId, setCardStudentId] = useState<string | null>(null);
  const activeFund = data.funds.find(f => f.id === activeFundId);
  const sortedStudents = getSortedStudents(data.students);

  // Snug Name column: exact width of the longest student name in the active class
  const nameColWidth = useMemo(
    () => getNameColWidth(sortedStudents.map(s => s.name || "")),
    // sortedStudents is a fresh array every render; depend on the data it is derived from
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.students]
  );

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

    return (
      <div className="space-y-3">
        <HowItWorks
          id="funds-list"
          title="How funds work"
          steps={[
            <>A <b>fund</b> is any collection, e.g. Monthly Fee, Trip or Books. Tap <b>+ New Fund</b> to create one.</>,
            <>Give it a name and an amount per student. Leave the amount blank if each student pays a different amount. A due date is optional.</>,
            <>Open the fund, then enter what each student paid. <b>Status is worked out for you.</b> Tap a student's name for a shareable fee statement.</>,
            <>Print a <b>Collection Sheet</b> or a <b>Pending List</b>.</>
          ]}
        />

        <div className="bg-white dark:bg-[#1C1917] border border-[#E7E5E4] dark:border-[#44403C] rounded-2xl p-4 shadow-xs">
          <div className="flex justify-between items-center gap-2 flex-wrap">
            <h2 className="text-base font-bold text-[#1C1917] dark:text-[#F5F5F4]">
              Funds ({data.funds.length})
            </h2>
            <button
              type="button"
              onClick={() => setNewFormOpen(!newFormOpen)}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-[#B91C1C] text-white hover:bg-[#991B1B] cursor-pointer"
            >
              {newFormOpen ? "Cancel" : "+ New Fund"}
            </button>
          </div>

          {newFormOpen && (
            <form onSubmit={handleCreateFund} className="mt-3.5 p-4 bg-[#FAFAF9] dark:bg-[#0C0A09] border border-[#E7E5E4] dark:border-[#44403C] rounded-2xl space-y-3">
              <h3 className="text-sm font-bold text-[#1C1917] dark:text-[#F5F5F4]">New Fund</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[10.5px] font-bold text-[#78716C] dark:text-[#A8A29E] uppercase tracking-wide mb-1">
                    Fund Name *
                  </label>
                  <input
                    type="text"
                    value={newFundName}
                    placeholder="e.g. Monthly Fee — Sep 2026"
                    onChange={e => setNewFundName(e.target.value)}
                    className="w-full p-2 text-xs rounded-xl border border-[#D6D3D1] dark:border-[#44403C] bg-white dark:bg-[#1C1917] text-inherit"
                  />
                </div>
                <div>
                  <label className="block text-[10.5px] font-bold text-[#78716C] dark:text-[#A8A29E] uppercase tracking-wide mb-1">
                    Amount per student (leave blank for variable)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={newFundAmount}
                    placeholder="500 or leave blank"
                    onChange={e => setNewFundAmount(e.target.value)}
                    className="w-full p-2 text-xs rounded-xl border border-[#D6D3D1] dark:border-[#44403C] bg-white dark:bg-[#1C1917] text-inherit"
                  />
                </div>
                <div>
                  <label className="block text-[10.5px] font-bold text-[#78716C] dark:text-[#A8A29E] uppercase tracking-wide mb-1">
                    Due date (optional)
                  </label>
                  <input
                    type="date"
                    value={newFundDue}
                    onChange={e => setNewFundDue(e.target.value)}
                    className="w-full p-2 text-xs rounded-xl border border-[#D6D3D1] dark:border-[#44403C] bg-white dark:bg-[#1C1917] text-inherit"
                  />
                </div>
              </div>
              <ActionGrid cols={2}>
                <ActionButton
                  type="submit"
                  variant="primary"
                  icon={Plus}
                >
                  Create Fund
                </ActionButton>
                <ActionButton
                  type="button"
                  variant="secondary"
                  onClick={() => setNewFormOpen(false)}
                >
                  Cancel
                </ActionButton>
              </ActionGrid>
            </form>
          )}
        </div>

        {/* Fund Cards List */}
        <div className="bg-white dark:bg-[#1C1917] border border-[#E7E5E4] dark:border-[#44403C] rounded-2xl p-4 shadow-xs">
          {data.funds.length === 0 ? (
            <div className="text-center py-8 text-[#78716C] dark:text-[#A8A29E] bg-[#FAFAF9] dark:bg-[#0C0A09] border border-dashed border-[#D6D3D1] dark:border-[#44403C] rounded-2xl flex flex-col items-center justify-center">
              <Wallet className="w-10 h-10 mb-2 text-stone-400 dark:text-stone-600" />
              <span>No funds created yet. Tap <b>+ New Fund</b> to create your first collection drive.</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {data.funds.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).map(f => {
                const st = computeFundStats(f.id);
                const overdue = f.dueDate && f.dueDate < todayKey() && st.pct < 100;

                return (
                  <div
                    key={f.id}
                    onClick={() => setActiveFundId(f.id)}
                    className="p-4 rounded-2xl border border-[#E7E5E4] dark:border-[#44403C] hover:border-[#D6D3D1] hover:-translate-y-0.5 transition-all cursor-pointer bg-white dark:bg-[#1C1917] shadow-xs"
                  >
                    <div className="flex justify-between items-start gap-2 mb-1">
                      <b className="text-sm font-bold text-[#1C1917] dark:text-[#F5F5F4] truncate">
                        {f.name}
                      </b>
                      <span className="text-[11px] font-bold text-[#78716C] dark:text-[#A8A29E] shrink-0">
                        {st.variable ? "Variable amount" : `${fmtMoney(f.amount)}/student`}
                      </span>
                    </div>

                    {overdue && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#F8E4E1] text-[#7F1D1D] mb-1">
                        <AlertTriangle className="w-3 h-3" /> Overdue
                      </span>
                    )}

                    <div className="w-full h-2 bg-[#F5F5F4] dark:bg-[#292524] rounded-full overflow-hidden my-2">
                      <div
                        className={`h-full transition-all ${st.pct >= 100 ? 'bg-[#065F46]' : 'bg-[#B4791F]'}`}
                        style={{ width: `${Math.min(100, st.pct)}%` }}
                      />
                    </div>

                    <div className="text-xs text-[#78716C] dark:text-[#A8A29E] space-y-0.5 mt-2">
                      <div className="flex justify-between">
                        <span>Collected: <b className="text-[#065F46] dark:text-[#6EE7B7]">{fmtMoney(st.collected)}</b></span>
                        {!st.variable && (
                          <span>Pending: <b className="text-[#7F1D1D] dark:text-[#F0C8C0]">{fmtMoney(st.pending)}</b></span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#78716C] dark:text-[#A8A29E]">
                        <b>{st.paid}</b> paid · <b>{st.partial}</b> partial · <b>{st.pend}</b> pending {st.exempt > 0 && <> · <b>{st.exempt}</b> exempt</>}
                      </div>
                      {f.dueDate && (
                        <div className="text-[11px] font-medium text-[#A8A29E]">
                          Due: {prettyShortDate(f.dueDate)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // 2. ACTIVE FUND COLLECTION SHEET VIEW
  const stats = computeFundStats(activeFund.id);
  const overdue = activeFund.dueDate && activeFund.dueDate < todayKey() && stats.pct < 100;

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
      const nextPayments = { ...prev.fundPayments };
      if (!nextPayments[activeFund.id]) nextPayments[activeFund.id] = {};

      sortedStudents.forEach(s => {
        const cur = nextPayments[activeFund.id][s.id] || {};
        if (cur.exempt) return;
        nextPayments[activeFund.id][s.id] = {
          ...cur,
          amount: activeFund.amount,
          date: cur.date || todayStr
        };
      });

      return { ...prev, fundPayments: nextPayments };
    });
    toast("All students marked as paid.", "success");
  };

  // Change amount
  const handleAmountChange = (sid: string, val: string) => {
    const num = val === "" ? 0 : Number(val);
    if (isNaN(num) || num < 0) return;
    const existing = (data.fundPayments[activeFund.id] || {})[sid];
    if (!existing && num === 0) return; // nothing to record

    saveData(prev => {
      const nextPayments = { ...prev.fundPayments };
      if (!nextPayments[activeFund.id]) nextPayments[activeFund.id] = {};
      const cur = nextPayments[activeFund.id][sid] || {};

      nextPayments[activeFund.id][sid] = {
        ...cur,
        amount: num,
        date: num > 0 && !cur.date ? todayISO() : cur.date
      };

      return { ...prev, fundPayments: nextPayments };
    });
  };

  // Toggle Exempt
  const handleToggleExempt = (sid: string) => {
    saveData(prev => {
      const nextPayments = { ...prev.fundPayments };
      if (!nextPayments[activeFund.id]) nextPayments[activeFund.id] = {};
      const cur = nextPayments[activeFund.id][sid] || {};
      const nextExempt = !cur.exempt;

      nextPayments[activeFund.id][sid] = {
        ...cur,
        exempt: nextExempt,
        amount: nextExempt ? 0 : cur.amount
      };

      return { ...prev, fundPayments: nextPayments };
    });
  };

  // Date change
  const handleDateChange = (sid: string, dateVal: string) => {
    quickSaveData(prev => {
      const nextPayments = { ...prev.fundPayments };
      if (!nextPayments[activeFund.id]) nextPayments[activeFund.id] = {};
      const cur = nextPayments[activeFund.id][sid] || {};
      nextPayments[activeFund.id][sid] = { ...cur, date: dateVal };
      return { ...prev, fundPayments: nextPayments };
    });
  };

  // Note change
  const handleNoteChange = (sid: string, noteVal: string) => {
    quickSaveData(prev => {
      const nextPayments = { ...prev.fundPayments };
      if (!nextPayments[activeFund.id]) nextPayments[activeFund.id] = {};
      const cur = nextPayments[activeFund.id][sid] || {};
      nextPayments[activeFund.id][sid] = { ...cur, note: noteVal };
      return { ...prev, fundPayments: nextPayments };
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
      ${buildPrintHeaderHTML(activeFund.name + " — Collection Sheet", (activeFund.dueDate ? "Due: " + esc(prettyShortDate(activeFund.dueDate)) + " • " : "") + amtDesc)}
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

  return (
    <div className="space-y-3">
      <HowItWorks
        id="funds-detail"
        title="How to record payments"
        steps={[
          <>Type the amount each student paid in the <b>Amount</b> column. The date fills in with today automatically and you can change it.</>,
          <>Status shows <b>Paid</b>, <b>Partial</b> or <b>Pending</b> by itself, based on the amount.</>,
          <>Tap <b>E</b> next to the amount to mark a student <b>Exempt</b>. They are left out of the totals.</>,
          <>Use <b>Mark All Paid</b> when everyone has paid the full amount, if it is shown.</>,
          <>Tap a <b>student's name</b> to open their <b>Fee Statement</b> (all funds, paid and balance). Use the arrows to move between students, then <b>Print</b>, <b>Save as image</b> or <b>Share</b> it with the parent.</>,
          <>Print the <b>Collection Sheet</b>, or the <b>Pending List</b> to see who still owes.</>
        ]}
        note="Everything saves automatically as you type."
      />

      {/* Active Fund Header Card */}
      <div className="bg-white dark:bg-[#1C1917] border border-[#E7E5E4] dark:border-[#44403C] rounded-2xl p-4 shadow-xs space-y-2">
        <div className="flex justify-between items-center gap-2 pb-1 border-b border-[#E7E5E4] dark:border-[#44403C]">
          <button
            type="button"
            onClick={() => setActiveFundId(null)}
            className="text-xs font-bold text-red-800 dark:text-red-400 hover:underline cursor-pointer flex items-center gap-1"
          >
            ← All Funds
          </button>
        </div>

        <ActionGrid cols={2}>
          {!stats.variable && (
            <ActionButton
              variant="success"
              icon={CheckCircle2}
              onClick={handleMarkAllPaid}
            >
              Mark All Paid
            </ActionButton>
          )}
          <ActionButton
            variant="danger"
            icon={Trash2}
            onClick={handleDeleteFund}
            fullWidth={stats.variable}
          >
            Delete Fund
          </ActionButton>
        </ActionGrid>

        <div className="flex items-center gap-2 flex-wrap mt-1">
          <h2 className="text-xl font-bold text-[#1C1917] dark:text-[#F5F5F4]">
            {activeFund.name}
          </h2>
          {overdue && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-[#F8E4E1] text-[#7F1D1D]">
              <AlertTriangle className="w-3.5 h-3.5" /> Overdue
            </span>
          )}
        </div>

        <div className="text-xs text-[#78716C] dark:text-[#A8A29E] space-y-1">
          <div>
            {stats.variable ? "variable amount" : `${fmtMoney(activeFund.amount)} per student`} •{" "}
            {stats.totalStudentsCounted} students counted {stats.exempt > 0 && `(${stats.exempt} exempt)`}
            {activeFund.dueDate && ` • Due: ${prettyShortDate(activeFund.dueDate)}`}
          </div>

          <div className="w-full h-2 bg-[#F5F5F4] dark:bg-[#292524] rounded-full overflow-hidden mt-1">
            <div
              className={`h-full transition-all ${stats.pct >= 100 ? 'bg-[#065F46]' : 'bg-[#B4791F]'}`}
              style={{ width: `${Math.min(100, stats.pct)}%` }}
            />
          </div>

          <div className="flex gap-3 flex-wrap text-xs pt-1">
            <span>Collected: <b className="text-[#065F46] dark:text-[#6EE7B7]">{fmtMoney(stats.collected)}</b></span>
            {!stats.variable && (
              <span>Pending: <b className="text-[#7F1D1D] dark:text-[#F0C8C0]">{fmtMoney(stats.pending)}</b></span>
            )}
            <span>Paid: <b>{stats.paid}</b></span>
            <span>Partial: <b>{stats.partial}</b></span>
            <span>Pending: <b>{stats.pend}</b></span>
            <span>Exempt: <b>{stats.exempt}</b></span>
            <span>Progress: <b>{stats.pct}%</b></span>
          </div>
        </div>
      </div>

      {/* Collection Matrix Table */}
      <div className="bg-white dark:bg-[#1C1917] border border-[#E7E5E4] dark:border-[#44403C] rounded-2xl p-4 shadow-xs">
        <div className="fund-wrap overflow-x-auto border border-[#E7E5E4] dark:border-[#44403C] rounded-xl max-h-[75vh]">
          <table
            className="w-full text-xs text-center border-collapse"
            style={{ '--name-col-w': `${nameColWidth}px` } as React.CSSProperties}
          >
            <thead className="sticky top-0 z-10 bg-[#FAFAF9] dark:bg-[#292524] text-[#1C1917] dark:text-[#F5F5F4]">
              <tr>
                <th className="sc1 p-2 border border-[#E7E5E4] dark:border-[#44403C] bg-[#FAFAF9] dark:bg-[#292524]">
                  Roll
                </th>
                <th className="sc2 p-2 border border-[#E7E5E4] dark:border-[#44403C] bg-[#FAFAF9] dark:bg-[#292524] text-left">
                  Name
                </th>
                <th className="p-2 border border-[#E7E5E4] dark:border-[#44403C] min-w-[100px]">
                  Amount
                </th>
                <th className="p-2 border border-[#E7E5E4] dark:border-[#44403C] min-w-[90px]">
                  Status
                </th>
                <th className="p-2 border border-[#E7E5E4] dark:border-[#44403C] min-w-[130px]">
                  Date
                </th>
                <th className="p-2 border border-[#E7E5E4] dark:border-[#44403C] min-w-[160px] text-left">
                  Note
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedStudents.map((s, sIdx) => {
                const payment = (data.fundPayments[activeFund.id] || {})[s.id] || {};
                const st = getFundStudentStatus(activeFund.id, s.id);
                const isPaid = st.code === 'PAID';
                const isExempt = !!payment.exempt;
                const amtVal = payment.amount !== undefined && payment.amount !== 0 ? payment.amount : "";

                return (
                  <tr
                    key={s.id}
                    className={`even:bg-[#FAFAF9] dark:even:bg-[#0C0A09]`}
                  >
                    <td className={`sc1 p-2 border border-[#E7E5E4] dark:border-[#44403C] font-mono font-bold ${
                      isExempt
                        ? 'bg-[#FAFAF9]! dark:bg-[#292524]!'
                        : isPaid
                        ? 'bg-[#D1FAE5]! dark:bg-[#064E3B]! text-[#065F46] dark:text-[#A7F3D0]'
                        : 'bg-white! dark:bg-[#1C1917]!'
                    }`}>
                      {s.rollNo || "—"}
                    </td>
                    <td className={`sc2 p-2 border border-[#E7E5E4] dark:border-[#44403C] text-left font-semibold truncate ${
                      isExempt
                        ? 'bg-[#FAFAF9]! dark:bg-[#292524]!'
                        : isPaid
                        ? 'bg-[#D1FAE5]! dark:bg-[#064E3B]! text-[#065F46] dark:text-[#A7F3D0]'
                        : 'bg-white! dark:bg-[#1C1917]!'
                    }`}>
                      <button
                        type="button"
                        onClick={() => setCardStudentId(s.id)}
                        title="Open fee statement"
                        className="max-w-full truncate text-left font-semibold cursor-pointer hover:underline decoration-dotted underline-offset-2"
                      >
                        {s.name || "(no name)"}
                      </button>
                    </td>

                    {/* Amount Cell with E (Exempt) toggle */}
                    <td className={`p-1 border border-[#E7E5E4] dark:border-[#44403C] ${
                      isExempt
                        ? 'bg-[#FAFAF9] dark:bg-[#292524]'
                        : isPaid
                        ? 'bg-[#D1FAE5] dark:bg-[#064E3B]'
                        : 'bg-[#F8E4E1] dark:bg-[#4A1A18]'
                    }`}>
                      <div className="flex items-center justify-center gap-1">
                        <SyncInput
                          type="number"
                          min="0"
                          disabled={isExempt}
                          value={amtVal}
                          onCommit={v => handleAmountChange(s.id, v)}
                          data-fcoord={`${sIdx}_0`}
                          enterKeyHint="next"
                          tabIndex={gridTabIndex(sIdx, 0, sortedStudents.length)}
                          onKeyDown={e => gridNavKeyDown(e, 'data-fcoord', sIdx, 0, sortedStudents.length)}
                          placeholder="0"
                          className="w-14 p-1 text-center font-bold font-mono text-xs rounded border border-transparent focus:border-[#2E5A8A] focus:bg-white dark:focus:bg-[#0C0A09] bg-transparent text-inherit disabled:opacity-30"
                        />
                        <button
                          type="button"
                          tabIndex={-1}
                          onClick={() => handleToggleExempt(s.id)}
                          title="Toggle Exempt"
                          className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center transition-colors cursor-pointer ${
                            isExempt
                              ? 'bg-[#F5F5F4] text-[#78716C] border border-[#D6D3D1] dark:bg-[#44403C] dark:text-[#F5F5F4]'
                              : 'bg-[#FAFAF9] dark:bg-[#292524] text-[#A8A29E] border border-[#E7E5E4] dark:border-[#44403C] hover:bg-[#F5F5F4]'
                          }`}
                        >
                          E
                        </button>
                      </div>
                    </td>

                    {/* Status Badge */}
                    <td className={`p-2 border border-[#E7E5E4] dark:border-[#44403C] font-bold text-xs ${
                      isExempt
                        ? 'text-[#78716C] bg-[#FAFAF9] dark:text-[#A8A29E] dark:bg-[#292524]'
                        : isPaid
                        ? 'text-[#065F46] bg-[#D1FAE5] dark:text-[#A7F3D0] dark:bg-[#064E3B]'
                        : st.code === 'PARTIAL'
                        ? 'text-[#7A5515] bg-[#FBF0D9] dark:text-[#F8E0A0] dark:bg-[#3A2E14]'
                        : 'text-[#7F1D1D] bg-[#F8E4E1] dark:text-[#F0C8C0] dark:bg-[#4A1A18]'
                    }`}>
                      {isExempt ? "EXEMPT" : st.code}
                      {st.overpaid && <span className="ml-1 text-[10px] text-[#065F46]">▲</span>}
                    </td>

                    {/* Date Cell */}
                    <td className="p-1 border border-[#E7E5E4] dark:border-[#44403C]">
                      <SyncInput
                        type="date"
                        value={payment.date || ""}
                        onLive={v => handleDateChange(s.id, v)}
                        onCommit={() => flushSave()}
                        className="w-full p-1 text-xs text-center bg-transparent border-0 focus:outline-none focus:bg-white dark:focus:bg-[#0C0A09] rounded"
                      />
                    </td>

                    {/* Note Cell */}
                    <td className="p-1 border border-[#E7E5E4] dark:border-[#44403C]">
                      <SyncInput
                        type="text"
                        value={payment.note || ""}
                        placeholder="Optional note"
                        onLive={v => handleNoteChange(s.id, v)}
                        onCommit={() => flushSave()}
                        className="w-full p-1 text-xs bg-transparent border-0 focus:outline-none focus:bg-white dark:focus:bg-[#0C0A09] rounded"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Print Section */}
      <div className="bg-white dark:bg-[#1C1917] border border-[#E7E5E4] dark:border-[#44403C] rounded-2xl p-4 shadow-xs space-y-3">
        <h3 className="text-sm font-bold text-[#1C1917] dark:text-[#F5F5F4]">
          Print
        </h3>
        <ActionGrid cols={2}>
          <ActionButton
            variant="primary"
            icon={Printer}
            onClick={handlePrintCollection}
          >
            Collection Sheet
          </ActionButton>
          <ActionButton
            variant="secondary"
            icon={Printer}
            onClick={handlePrintPending}
          >
            Pending List
          </ActionButton>
        </ActionGrid>
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

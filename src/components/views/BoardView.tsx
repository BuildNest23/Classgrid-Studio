import React, { useCallback, useEffect, useState } from 'react';
import { useClassroom } from '../../context/ClassroomContext';
import { listShelf, loadFromShelf, getActiveShelfId, setActiveShelfId, defaultClassName, ShelfEntry } from '../../utils/classShelf';
import { shelveOpenClass } from './ClassesView';
import { BoardRow, summarizeClass, totalsOf } from '../../utils/schoolBoard';
import { todayKey, prettyDate } from '../../utils/helpers';
import { Inbox, Plus, Users, CheckCircle2, Clock, Sun } from 'lucide-react';

export const BoardView: React.FC = () => {
  const { data, replaceAllData, setActiveTab, toast } = useClassroom();
  const [entries, setEntries] = useState<ShelfEntry[] | null>(null);
  const [shelfData, setShelfData] = useState<Record<string, ReturnType<typeof summarizeClass>>>({});
  const [busy, setBusy] = useState(false);
  const today = todayKey();
  const activeId = getActiveShelfId();

  const load = useCallback(async () => {
    try {
      const list = await listShelf();
      const sums: Record<string, ReturnType<typeof summarizeClass>> = {};
      for (const e of list) {
        const d = await loadFromShelf(e.id);
        if (d) sums[e.id] = summarizeClass(d, today);
      }
      setShelfData(sums); setEntries(list);
    } catch { setEntries([]); }
  }, [today]);
  useEffect(() => { load(); }, [load]);

  const open = summarizeClass(data, today);
  const rows: BoardRow[] = [];
  (entries || []).forEach(e => {
    const isOpen = e.id === activeId;
    const s = isOpen ? open : shelfData[e.id];
    if (!s) return;
    rows.push({ key: e.id, shelfId: e.id, isOpen, name: isOpen ? (e.name || defaultClassName(data)) : e.name, ...s });
  });
  const openOnShelf = rows.some(r => r.isOpen);
  const hasOpenContent = data.students.length || data.assessments.length || data.funds.length || data.className;
  if (!openOnShelf && hasOpenContent) rows.unshift({ key: 'open', shelfId: null, isOpen: true, name: defaultClassName(data), ...open });
  const totals = totalsOf(rows);

  const openClass = async (r: BoardRow) => {
    if (r.isOpen) { setActiveTab('dashboard'); return; }
    if (busy || !r.shelfId) return;
    setBusy(true);
    try {
      const target = await loadFromShelf(r.shelfId);
      if (!target) { toast('This class could not be read.', 'error'); return; }
      await shelveOpenClass(data);
      replaceAllData({ ...target, schoolLogo: data.schoolLogo });
      setActiveShelfId(r.shelfId);
      setActiveTab('dashboard');
    } catch (e: any) { toast(`Could not switch class. ${e?.message || ''}`.trim(), 'error'); }
    finally { setBusy(false); }
  };

  const Tile = ({ big, small }: { big: string; small: string }) => (
    <div className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-3">
      <div className="text-xl font-black">{big}</div><div className="text-[11px] text-stone-500">{small}</div>
    </div>
  );

  return (
    <div className="space-y-3.5">
      <div>
        <h2 className="text-lg font-black">{data.schoolName}</h2>
        <div className="text-xs text-stone-500">{prettyDate(today)}</div>
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        <Tile big={String(totals.classes)} small="Classes" />
        <Tile big={String(totals.students)} small="Students" />
        <Tile big={totals.expected ? `${totals.taken}/${totals.expected}` : '–'} small="Attendance received today" />
      </div>
      {totals.counted > 0 && (
        <div className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-3 text-sm font-bold">
          School present today: {Math.round((totals.present / totals.counted) * 100)}% <span className="font-normal text-stone-500">({totals.present} of {totals.counted} students)</span>
        </div>
      )}
      {totals.missingNames.length > 0 && (
        <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-3 text-sm">
          <b>Not received today:</b> {totals.missingNames.join(', ')}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2.5">
        <button type="button" onClick={() => setActiveTab('inbox')} className="min-h-[48px] rounded-2xl bg-red-800 text-white font-bold text-sm flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"><Inbox className="w-4 h-4" />Receive update</button>
        <button type="button" onClick={() => setActiveTab('classes')} className="min-h-[48px] rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 font-bold text-sm flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"><Plus className="w-4 h-4" />Add / manage classes</button>
      </div>

      {entries === null && <div className="text-sm text-stone-500 text-center py-6">Loading classes…</div>}
      {entries !== null && !rows.length && <div className="p-6 text-center text-sm text-stone-500 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800">No classes yet. Tap "Add / manage classes" to start one.</div>}
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map(r => (
          <button key={r.key} type="button" onClick={() => openClass(r)} disabled={busy}
            className={`text-left rounded-2xl bg-white dark:bg-stone-900 border p-4 cursor-pointer active:scale-[0.99] ${r.isOpen ? 'border-red-700' : 'border-stone-200 dark:border-stone-800'}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-black truncate">{r.name}</div>
                <div className="text-xs text-stone-500 truncate">{r.teacher || 'No teacher name'}</div>
              </div>
              {r.isOpen && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-red-100 text-red-800 shrink-0">OPEN</span>}
            </div>
            <div className="mt-2.5 flex items-center gap-1.5 text-xs text-stone-600 dark:text-stone-300"><Users className="w-3.5 h-3.5" />{r.students} students
              {r.exams > 0 && <span className="text-stone-400">• {r.exams} exam{r.exams === 1 ? '' : 's'}{r.incompleteExams ? `, ${r.incompleteExams} incomplete` : ''}</span>}
            </div>
            <div className="mt-1.5 text-xs font-bold">
              {r.att === 'taken' && <span className="text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" />Today: {r.present} present, {r.absent} absent{r.leave ? `, ${r.leave} leave` : ''}</span>}
              {r.att === 'holiday' && <span className="text-blue-700 dark:text-blue-400 flex items-center gap-1.5"><Sun className="w-3.5 h-3.5" />Holiday today</span>}
              {r.att === 'missing' && <span className="text-amber-700 dark:text-amber-400 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />Not received today{r.lastAttendance ? ` • last ${r.lastAttendance}` : ''}</span>}
              {r.att === 'empty' && <span className="text-stone-400">No students yet</span>}
            </div>
            <div className="mt-1 text-[11px] text-stone-400">{r.sentVersion ? `Class file v${r.sentVersion} sent` : 'Class file not sent yet'}</div>
          </button>
        ))}
      </div>
    </div>
  );
};

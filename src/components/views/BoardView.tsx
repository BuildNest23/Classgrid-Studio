import React, { useCallback, useEffect, useState } from 'react';
import { useClassroom } from '../../context/ClassroomContext';
import {
  listShelf,
  loadFromShelf,
  getActiveShelfId,
  setActiveShelfId,
  defaultClassName,
  ShelfEntry,
} from '../../utils/classShelf';
import { shelveOpenClass, NewClassDialog, ClassesView } from './ClassesView';
import { BoardRow, summarizeClass, totalsOf } from '../../utils/schoolBoard';
import { todayKey, prettyDate } from '../../utils/helpers';
import {
  Inbox,
  Plus,
  CheckCircle2,
  Clock,
  Sun,
  ChevronRight,
  Search,
  GraduationCap,
} from 'lucide-react';

interface BoardViewProps {
  initialSection?: 'overview' | 'manage';
}

export const BoardView: React.FC<BoardViewProps> = ({ initialSection = 'overview' }) => {
  const { data, activeTab, replaceAllData, setActiveTab, toast } = useClassroom();
  const [section, setSection] = useState<'overview' | 'manage'>(initialSection);
  const [entries, setEntries] = useState<ShelfEntry[] | null>(null);
  const [shelfData, setShelfData] = useState<Record<string, ReturnType<typeof summarizeClass>>>({});
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [showNewClass, setShowNewClass] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const today = todayKey();
  const activeId = getActiveShelfId();

  useEffect(() => {
    setSection(initialSection);
  }, [initialSection]);

  const loadBoard = useCallback(async () => {
    try {
      const list = await listShelf();
      const sums: Record<string, ReturnType<typeof summarizeClass>> = {};
      for (const e of list) {
        const d = await loadFromShelf(e.id);
        if (d) sums[e.id] = summarizeClass(d, today);
      }
      setShelfData(sums);
      setEntries(list);
    } catch {
      setEntries([]);
    }
  }, [today]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await listShelf();
        const sums: Record<string, ReturnType<typeof summarizeClass>> = {};
        for (const e of list) {
          if (!alive) return;
          const d = await loadFromShelf(e.id);
          if (d) sums[e.id] = summarizeClass(d, today);
        }
        if (alive) {
          setShelfData(sums);
          setEntries(list);
        }
      } catch {
        if (alive) setEntries([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [today, refreshTick]);

  const open = summarizeClass(data, today);
  const rows: BoardRow[] = [];
  (entries || []).forEach(e => {
    const isOpen = e.id === activeId;
    const s = isOpen ? open : shelfData[e.id];
    if (!s) return;
    rows.push({
      key: e.id,
      shelfId: e.id,
      isOpen,
      name: isOpen ? e.name || defaultClassName(data) : e.name,
      ...s,
    });
  });

  const openOnShelf = rows.some(r => r.isOpen);
  const hasOpenContent =
    data.students.length || data.assessments.length || data.funds.length || data.className;
  if (!openOnShelf && hasOpenContent) {
    rows.unshift({
      key: 'open',
      shelfId: null,
      isOpen: true,
      name: defaultClassName(data),
      ...open,
    });
  }

  const totals = totalsOf(rows);
  const presentPct = totals.counted > 0 ? Math.round((totals.present / totals.counted) * 100) : null;

  const q = query.trim().toLowerCase();
  const visibleRows = q
    ? rows.filter(
        r =>
          r.name.toLowerCase().includes(q) ||
          (r.teacher && r.teacher.toLowerCase().includes(q))
      )
    : rows;

  const openClass = async (r: BoardRow) => {
    if (r.isOpen) {
      setActiveTab('dashboard');
      return;
    }
    if (busy || !r.shelfId) return;
    setBusy(true);
    try {
      const target = await loadFromShelf(r.shelfId);
      if (!target) {
        toast('This class could not be read.', 'error');
        return;
      }
      await shelveOpenClass(data);
      replaceAllData({ ...target, schoolLogo: data.schoolLogo || target.schoolLogo });
      setActiveShelfId(r.shelfId);
      setActiveTab('dashboard');
    } catch (e: any) {
      toast(`Could not switch class. ${e?.message || ''}`.trim(), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Institutional Masthead + Unified Overview / Manage Shelf Switch */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs font-medium text-stone-500 dark:text-stone-400">
            {section === 'manage' ? 'Saved Classes' : 'School Overview'} · {prettyDate(today)}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-stone-900 dark:text-stone-100 mt-1 truncate">
            {data.schoolName || 'My School'}
          </h1>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <div className="inline-flex items-center p-1 rounded-xl bg-stone-200/70 dark:bg-stone-800/80">
            <button
              type="button"
              onClick={() => {
                setSection('overview');
                if (activeTab === 'classes') setActiveTab('board');
                loadBoard();
              }}
              className={`min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                section === 'overview'
                  ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-xs'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
              }`}
            >
              Overview
            </button>
            <button
              type="button"
              onClick={() => {
                setSection('manage');
                if (activeTab === 'board') setActiveTab('classes');
              }}
              className={`min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                section === 'manage'
                  ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-xs'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
              }`}
            >
              Manage shelf
            </button>
          </div>

          {section === 'overview' && (
            <>
              <button
                type="button"
                onClick={() => setActiveTab('inbox')}
                className="flex-1 sm:flex-none min-h-[44px] px-4 py-2 rounded-xl bg-red-800 hover:bg-red-900 dark:bg-red-700 dark:hover:bg-red-600 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer active:scale-[0.98] whitespace-nowrap"
              >
                <Inbox className="w-4 h-4 shrink-0" />
                <span>Receive update</span>
              </button>
              <button
                type="button"
                onClick={() => setShowNewClass(true)}
                className="flex-1 sm:flex-none min-h-[44px] px-4 py-2 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-800 dark:text-stone-100 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer active:scale-[0.98] whitespace-nowrap"
              >
                <Plus className="w-4 h-4 shrink-0 text-red-800 dark:text-red-400" />
                <span>New class</span>
              </button>
            </>
          )}
        </div>
      </div>

      {section === 'manage' ? (
        <ClassesView onShelfChanged={() => setRefreshTick(t => t + 1)} />
      ) : (
        <>
          {/* Unified School Pulse Strip */}
          <div className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 overflow-hidden">
            <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 divide-x divide-stone-200 dark:divide-stone-800">
              <div className="p-4 sm:p-5">
                <div className="text-xs font-medium text-stone-500 dark:text-stone-400">Classes</div>
                <div className="text-2xl font-bold text-stone-900 dark:text-stone-100 mt-1 font-mono-num">
                  {totals.classes}
                </div>
                <div className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">
                  On this device
                </div>
              </div>

              <div className="p-4 sm:p-5">
                <div className="text-xs font-medium text-stone-500 dark:text-stone-400">
                  Students
                </div>
                <div className="text-2xl font-bold text-stone-900 dark:text-stone-100 mt-1 font-mono-num">
                  {totals.students}
                </div>
                <div className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">
                  Total enrolled
                </div>
              </div>

              <div className="p-4 sm:p-5">
                <div className="text-xs font-medium text-stone-500 dark:text-stone-400">
                  Attendance reported
                </div>
                <div className="text-2xl font-bold text-stone-900 dark:text-stone-100 mt-1 font-mono-num">
                  {totals.expected ? `${totals.taken}/${totals.expected}` : '—'}
                </div>
                <div className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">
                  {totals.expected
                    ? totals.taken === totals.expected
                      ? 'All classes reported'
                      : `${totals.expected - totals.taken} pending today`
                    : 'No active roll calls'}
                </div>
              </div>

              <div className="p-4 sm:p-5">
                <div className="text-xs font-medium text-stone-500 dark:text-stone-400">
                  Present today
                </div>
                <div className="text-2xl font-bold text-red-800 dark:text-red-400 mt-1 font-mono-num">
                  {presentPct !== null ? `${presentPct}%` : '—'}
                </div>
                <div className="text-xs text-stone-400 dark:text-stone-500 mt-0.5 tabular-nums">
                  {totals.counted > 0
                    ? `${totals.present} of ${totals.counted} students`
                    : 'Waiting for roll call'}
                </div>
              </div>
            </div>
          </div>

          {/* Pending Classes Attention Row */}
          {totals.missingNames.length > 0 && (
            <div className="rounded-2xl bg-amber-50/70 dark:bg-amber-950/25 border border-amber-200/80 dark:border-amber-900/60 px-4 py-3 flex items-start gap-2.5 text-xs sm:text-sm text-stone-800 dark:text-stone-200">
              <Clock className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="min-w-0 leading-relaxed">
                <span className="font-semibold text-amber-900 dark:text-amber-300">
                  Attendance not received today:
                </span>{' '}
                <span>{totals.missingNames.join(', ')}</span>
              </div>
            </div>
          )}

          {/* Class Directory Section */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-baseline gap-2">
                <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">
                  All classes
                </h2>
                <span className="text-xs text-stone-500 dark:text-stone-400 tabular-nums">
                  {rows.length} {rows.length === 1 ? 'class' : 'classes'}
                </span>
              </div>

              {rows.length >= 5 && (
                <div className="relative w-full sm:w-64">
                  <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="search"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Filter by class or teacher…"
                    className="w-full min-h-[40px] pl-9 pr-3 py-1.5 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-xs text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:border-red-700 dark:focus:border-red-500"
                  />
                </div>
              )}
            </div>

            {entries === null && (
              <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-3">
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    className="h-36 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-5 animate-pulse"
                  >
                    <div className="h-4 w-28 bg-stone-200 dark:bg-stone-800 rounded" />
                    <div className="h-3 w-36 bg-stone-100 dark:bg-stone-800/70 rounded mt-2" />
                    <div className="h-3 w-44 bg-stone-100 dark:bg-stone-800/70 rounded mt-6" />
                  </div>
                ))}
              </div>
            )}

            {entries !== null && !rows.length && (
              <div className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-8 text-center">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 flex items-center justify-center">
                  <GraduationCap className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-stone-900 dark:text-stone-100 mt-3">
                  No classes set up yet
                </h3>
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-1 max-w-xs mx-auto">
                  Create your first class to enroll students, take daily attendance, and manage exams.
                </p>
                <button
                  type="button"
                  onClick={() => setShowNewClass(true)}
                  className="mt-4 min-h-[44px] px-5 py-2.5 rounded-xl bg-red-800 hover:bg-red-900 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Start first class</span>
                </button>
              </div>
            )}

            {entries !== null && visibleRows.length > 0 && (
              <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-3">
                {visibleRows.map(r => (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => openClass(r)}
                    disabled={busy}
                    className={`group text-left rounded-2xl bg-white dark:bg-stone-900 border p-4 sm:p-5 transition-colors cursor-pointer active:scale-[0.99] disabled:opacity-60 flex flex-col justify-between ${
                      r.isOpen
                        ? 'border-red-700/80 dark:border-red-500/70'
                        : 'border-stone-200 dark:border-stone-800 hover:border-stone-300 dark:hover:border-stone-700'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-base font-bold text-stone-900 dark:text-stone-100 truncate">
                            {r.name}
                          </div>
                          <div className="text-xs text-stone-500 dark:text-stone-400 truncate mt-0.5">
                            {r.teacher || 'No class teacher set'}
                            {r.isOpen && (
                              <span className="text-red-800 dark:text-red-400 font-semibold">
                                {' '}· Active
                              </span>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-stone-400 group-hover:text-red-800 dark:group-hover:text-red-400 shrink-0 mt-1 transition-colors" />
                      </div>

                      <div className="mt-3 text-xs text-stone-600 dark:text-stone-300 tabular-nums">
                        <span>
                          {r.students} {r.students === 1 ? 'student' : 'students'}
                        </span>
                        {r.exams > 0 && (
                          <span className="text-stone-400 dark:text-stone-500">
                            {' '}· {r.exams} {r.exams === 1 ? 'exam' : 'exams'}
                            {r.incompleteExams ? ` (${r.incompleteExams} pending)` : ''}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-stone-100 dark:border-stone-800/80">
                      <div className="text-xs font-semibold tabular-nums">
                        {r.att === 'taken' && (
                          <span className="text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            <span>
                              {r.present} present · {r.absent} absent
                              {r.leave ? ` · ${r.leave} leave` : ''}
                            </span>
                          </span>
                        )}
                        {r.att === 'holiday' && (
                          <span className="text-sky-700 dark:text-sky-400 flex items-center gap-1.5">
                            <Sun className="w-3.5 h-3.5 shrink-0" />
                            <span>Holiday today</span>
                          </span>
                        )}
                        {r.att === 'missing' && (
                          <span className="text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 shrink-0" />
                            <span>
                              Pending today
                              {r.lastAttendance ? ` · last ${r.lastAttendance}` : ''}
                            </span>
                          </span>
                        )}
                        {r.att === 'empty' && (
                          <span className="text-stone-400 dark:text-stone-500 font-medium">
                            No students enrolled yet
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {entries !== null && rows.length > 0 && visibleRows.length === 0 && (
              <div className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-6 text-center text-xs text-stone-500 dark:text-stone-400">
                No classes match &ldquo;{query}&rdquo;.
              </div>
            )}
          </div>
        </>
      )}

      {showNewClass && (
        <NewClassDialog
          onClose={() => {
            setShowNewClass(false);
            setRefreshTick(t => t + 1);
          }}
          onDone={() => setActiveTab('dashboard')}
        />
      )}
    </div>
  );
};

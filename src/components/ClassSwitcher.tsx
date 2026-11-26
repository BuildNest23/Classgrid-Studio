import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useClassroom } from '../context/ClassroomContext';
import {
  listShelf,
  loadFromShelf,
  getActiveShelfId,
  setActiveShelfId,
  defaultClassName,
  ShelfEntry,
} from '../utils/classShelf';
import { shelveOpenClass, NewClassDialog } from './views/ClassesView';
import {
  ChevronsUpDown,
  Check,
  LayoutGrid,
  Plus,
  X,
  FolderOpen,
} from 'lucide-react';

interface ClassSwitcherProps {
  variant: 'sidebar' | 'mobile';
}

export const ClassSwitcher: React.FC<ClassSwitcherProps> = ({ variant }) => {
  const { data, activeTab, setActiveTab, replaceAllData, toast } = useClassroom();
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<ShelfEntry[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [showNewClass, setShowNewClass] = useState(false);

  const activeId = getActiveShelfId();
  const openName = defaultClassName(data);
  const hasOpenData =
    data.students.length > 0 ||
    data.assessments.length > 0 ||
    data.funds.length > 0 ||
    Boolean(data.className?.trim());

  useEffect(() => {
    if (!open) return;
    let alive = true;
    listShelf()
      .then(list => {
        if (alive) setEntries(list);
      })
      .catch(() => {
        if (alive) setEntries([]);
      });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      alive = false;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const switchTo = async (entry: ShelfEntry) => {
    if (entry.id === activeId) {
      setOpen(false);
      if (activeTab === 'board') setActiveTab('dashboard');
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      const target = await loadFromShelf(entry.id);
      if (!target) {
        toast('This class could not be opened.', 'error');
        return;
      }
      await shelveOpenClass(data);
      replaceAllData({ ...target, schoolLogo: data.schoolLogo || target.schoolLogo });
      setActiveShelfId(entry.id);
      setOpen(false);
      if (activeTab === 'board' || activeTab === 'classes') {
        setActiveTab('dashboard');
      }
      toast(`Switched to ${entry.name}`, 'success');
    } catch (e: any) {
      toast(`Could not switch class. ${e?.message || ''}`.trim(), 'error');
    } finally {
      setBusy(false);
    }
  };

  const openOnShelf = (entries || []).some(e => e.id === activeId);

  return (
    <>
      {variant === 'sidebar' ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full min-h-[48px] px-3 py-2.5 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50/80 dark:bg-stone-800/50 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors flex items-center justify-between gap-2 text-left cursor-pointer group"
          title="Switch class"
        >
          <div className="min-w-0">
            <div className="text-[11px] font-medium text-stone-500 dark:text-stone-400 leading-none">
              Active class
            </div>
            <div className="text-sm font-bold text-stone-900 dark:text-stone-100 truncate mt-1">
              {hasOpenData ? openName : 'No class open'}
            </div>
          </div>
          <ChevronsUpDown className="w-4 h-4 text-stone-400 group-hover:text-stone-700 dark:group-hover:text-stone-200 shrink-0 transition-colors" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="min-h-[40px] max-w-[195px] sm:max-w-[260px] px-2.5 py-1.5 rounded-xl bg-stone-100 dark:bg-stone-800/80 hover:bg-stone-200/70 dark:hover:bg-stone-800 active:scale-[0.98] transition flex items-center gap-1.5 text-left cursor-pointer"
          aria-label="Switch class"
        >
          <span className="text-xs font-bold text-stone-900 dark:text-stone-100 truncate">
            {activeTab === 'board' || activeTab === 'classes'
              ? 'All Classes'
              : hasOpenData
              ? openName
              : 'Select class'}
          </span>
          <ChevronsUpDown className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400 shrink-0" />
        </button>
      )}

      {/* Modal / Bottom Sheet (portaled to body to escape sticky header transform/backdrop-filter) */}
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-[2px] p-0 sm:p-4"
            onMouseDown={() => setOpen(false)}
          >
            <div
              className="cg-sheet-up w-full max-w-md max-h-[85dvh] flex flex-col bg-white dark:bg-stone-900 rounded-t-3xl sm:rounded-2xl border-t sm:border border-stone-200 dark:border-stone-800 shadow-2xl overflow-hidden pb-safe sm:pb-0"
              onMouseDown={e => e.stopPropagation()}
            >
              {/* Mobile grab bar */}
              <div className="pt-3 pb-1 flex justify-center sm:hidden shrink-0">
                <div className="w-10 h-1 bg-stone-300 dark:bg-stone-700 rounded-full" />
              </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-stone-200 dark:border-stone-800 shrink-0">
              <div>
                <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">
                  Switch class
                </h3>
                <p className="text-xs text-stone-500 dark:text-stone-400 truncate max-w-[260px]">
                  {data.schoolName || 'ClassGrid Studio'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-10 h-10 flex items-center justify-center rounded-xl text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Class list */}
            <div className="p-2 flex-1 min-h-0 overflow-y-auto divide-y divide-stone-100 dark:divide-stone-800/70">
              {/* School Overview shortcut */}
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setActiveTab('board');
                }}
                className={`w-full min-h-[48px] px-3.5 py-2.5 rounded-xl flex items-center justify-between gap-3 text-left transition-colors cursor-pointer ${
                  activeTab === 'board'
                    ? 'bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300'
                    : 'text-stone-800 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-800/60'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <LayoutGrid className="w-4 h-4 shrink-0 text-red-800 dark:text-red-400" />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">School Overview</div>
                    <div className="text-xs text-stone-500 dark:text-stone-400">
                      All classes &amp; daily summary
                    </div>
                  </div>
                </div>
                {activeTab === 'board' && <Check className="w-4 h-4 shrink-0 text-red-800 dark:text-red-400" />}
              </button>

              {/* Current unshelved open class (if not in shelf list) */}
              {!openOnShelf && hasOpenData && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setActiveTab('dashboard');
                  }}
                  className="w-full min-h-[52px] px-3.5 py-2.5 rounded-xl flex items-center justify-between gap-3 text-left bg-red-50/70 dark:bg-red-950/30 text-stone-900 dark:text-stone-100 cursor-pointer"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-bold truncate">{openName}</div>
                    <div className="text-xs text-stone-500 dark:text-stone-400 tabular-nums">
                      {data.students.length} students · Current session
                    </div>
                  </div>
                  <Check className="w-4 h-4 shrink-0 text-red-800 dark:text-red-400" />
                </button>
              )}

              {/* Saved shelf classes */}
              {entries === null ? (
                <div className="px-4 py-6 text-center text-xs text-stone-500 dark:text-stone-400">
                  Loading saved classes…
                </div>
              ) : entries.length === 0 && !hasOpenData ? (
                <div className="px-4 py-6 text-center text-xs text-stone-500 dark:text-stone-400">
                  No saved classes yet. Start your first class below.
                </div>
              ) : (
                entries.map(entry => {
                  const isCurrent = entry.id === activeId;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      disabled={busy}
                      onClick={() => switchTo(entry)}
                      className={`w-full min-h-[52px] px-3.5 py-2.5 rounded-xl flex items-center justify-between gap-3 text-left transition-colors cursor-pointer disabled:opacity-50 ${
                        isCurrent
                          ? 'bg-red-50/80 dark:bg-red-950/35 text-red-900 dark:text-red-200'
                          : 'text-stone-900 dark:text-stone-100 hover:bg-stone-50 dark:hover:bg-stone-800/60'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{entry.name}</div>
                        <div className="text-xs text-stone-500 dark:text-stone-400 tabular-nums">
                          {entry.students} student{entry.students === 1 ? '' : 's'}
                          {isCurrent ? ' · Active' : ''}
                        </div>
                      </div>
                      {isCurrent && (
                        <Check className="w-4 h-4 shrink-0 text-red-800 dark:text-red-400" />
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer actions */}
            <div className="p-3 border-t border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-950/40 flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setShowNewClass(true);
                }}
                className="flex-1 min-h-[44px] px-3.5 py-2 rounded-xl bg-red-800 hover:bg-red-900 dark:bg-red-700 dark:hover:bg-red-600 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer active:scale-[0.98]"
              >
                <Plus className="w-4 h-4" />
                <span>Start new class</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setActiveTab('classes');
                }}
                className="min-h-[44px] px-3.5 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <FolderOpen className="w-4 h-4" />
                <span>Manage</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showNewClass &&
        createPortal(
          <NewClassDialog
            onClose={() => setShowNewClass(false)}
            onDone={() => setActiveTab('dashboard')}
          />,
          document.body
        )}
    </>
  );
};

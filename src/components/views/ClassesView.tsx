import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useClassroom } from '../../context/ClassroomContext';
import { exportFileBlob } from '../../utils/nativeFileExport';
import {
  ShelfEntry,
  buildShelfBackup,
  defaultClassName,
  deleteFromShelf,
  getActiveShelfId,
  importIntoShelf,
  isBlankClass,
  listShelf,
  loadFromShelf,
  moveShelfEntry,
  makeNewClassData,
  readShelfRaw,
  renameShelfEntry,
  restoreShelfRaw,
  saveToShelf,
  setActiveShelfId,
} from '../../utils/classShelf';
import { AppData } from '../../types';
import {
  ChevronDown,
  ChevronUp,
  Download,
  FolderOpen,
  Pencil,
  Plus,
  Save,
  Trash2,
  Undo2,
  Upload,
  X,
} from 'lucide-react';

/**
 * Saves the open class onto the shelf (updating its card, or creating one) unless it is blank.
 * Shared by "Open", "Start new class" and "Save this class".
 */
export async function shelveOpenClass(current: AppData): Promise<ShelfEntry | null> {
  if (isBlankClass(current)) return null;
  const entry = await saveToShelf(current, { id: getActiveShelfId() });
  setActiveShelfId(entry.id);
  return entry;
}

// ------------------------------------------------------------------------------------------
// "Start new class" dialog (shared across Overview, Class Switcher, My Tools, Settings)
// ------------------------------------------------------------------------------------------
export const NewClassDialog: React.FC<{ onClose: () => void; onDone?: () => void }> = ({
  onClose,
  onDone,
}) => {
  const { data, replaceAllData, toast } = useClassroom();
  const [keepSchool, setKeepSchool] = useState(true);
  const [keepTools, setKeepTools] = useState(true);
  const [busy, setBusy] = useState(false);
  const blank = isBlankClass(data);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const handleStart = async () => {
    setBusy(true);
    try {
      const saved = await shelveOpenClass(data);
      const fresh = makeNewClassData(data, keepSchool);
      if (keepTools && data.tools) {
        fresh.tools = { ...data.tools };
      } else {
        fresh.tools = {
          students: true,
          attendance: true,
          results: true,
          dailyTest: false,
          funds: false,
        };
      }
      replaceAllData(fresh);
      setActiveShelfId(null);
      toast(
        saved ? `New class started. "${saved.name}" is saved in Classes.` : 'New class started.',
        'success'
      );
      onDone?.();
      onClose();
    } catch (e: any) {
      toast(
        `Could not save the current class, so nothing was cleared. ${e?.message || ''}`.trim(),
        'error'
      );
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-[2px] p-0 sm:p-4"
      onMouseDown={e => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="cg-sheet-up w-full sm:max-w-md bg-white dark:bg-stone-900 rounded-t-3xl sm:rounded-2xl border-t sm:border border-stone-200 dark:border-stone-800 shadow-2xl p-5 pb-safe sm:pb-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">
              Start a new class
            </h3>
            <p className="mt-1 text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
              {blank ? (
                'The current class is empty, so you will get a clean start right away.'
              ) : (
                <>
                  <span className="font-semibold text-stone-800 dark:text-stone-200">
                    {defaultClassName(data)}
                  </span>{' '}
                  ({data.students.length} students) will be saved first so you can reopen it anytime.
                </>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="w-9 h-9 -mr-1 -mt-1 flex items-center justify-center rounded-xl text-stone-400 hover:text-stone-800 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <label className="flex items-start gap-3 p-3.5 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-950/40 cursor-pointer min-h-[44px]">
          <input
            type="checkbox"
            checked={keepSchool}
            onChange={e => setKeepSchool(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-red-800"
          />
          <span className="text-xs leading-relaxed text-stone-600 dark:text-stone-400">
            <span className="block text-sm font-semibold text-stone-900 dark:text-stone-100">
              Keep school details
            </span>
            EMIS code, academic year, and print settings stay. School name and logo always stay.
          </span>
        </label>

        <div className="p-3.5 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-950/40 space-y-2.5">
          <span className="text-xs font-semibold text-stone-900 dark:text-stone-100 block">
            Use the same tools as this class?
          </span>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setKeepTools(true)}
              className={`min-h-[44px] py-2 px-3 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                keepTools
                  ? 'bg-red-800 dark:bg-red-700 text-white border-transparent'
                  : 'bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-700'
              }`}
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => setKeepTools(false)}
              className={`min-h-[44px] py-2 px-3 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                !keepTools
                  ? 'bg-red-800 dark:bg-red-700 text-white border-transparent'
                  : 'bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-700'
              }`}
            >
              No
            </button>
          </div>
        </div>

        <div className="flex gap-2.5 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex-1 min-h-[46px] rounded-xl text-xs font-semibold bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-200 hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleStart}
            disabled={busy}
            className="flex-1 min-h-[46px] rounded-xl text-xs font-semibold bg-red-800 hover:bg-red-900 dark:bg-red-700 dark:hover:bg-red-600 text-white transition-colors cursor-pointer disabled:opacity-50"
          >
            {busy ? 'Saving…' : blank ? 'Start new class' : 'Save & start new'}
          </button>
        </div>

        <p className="text-[11px] text-center text-stone-400 dark:text-stone-500">
          Changed your mind? Tap Undo in the top bar right after.
        </p>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------------------------------
// Saved Classes Shelf Management Panel (embedded cleanly inside the unified Classes Hub)
// ------------------------------------------------------------------------------------------
function fmtDate(ts: number): string {
  try {
    return new Date(ts).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

function safeFile(name: string): string {
  return name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40) || 'class';
}

interface ClassesViewProps {
  onShelfChanged?: () => void;
}

export const ClassesView: React.FC<ClassesViewProps> = ({ onShelfChanged }) => {
  const { data, replaceAllData, setActiveTab, toast, uiConfirm, uiPrompt } = useClassroom();
  const [list, setList] = useState<ShelfEntry[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(getActiveShelfId());
  const [busy, setBusy] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [deleted, setDeleted] = useState<{
    entry: ShelfEntry;
    data: AppData;
    position: number;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      setList(await listShelf());
    } catch {
      setList([]);
    }
    setActiveId(getActiveShelfId());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      onShelfChanged?.();
    } catch (e: any) {
      toast(e?.message || 'Something went wrong.', 'error');
    } finally {
      setBusy(false);
      await refresh();
    }
  };

  const currentLabel = defaultClassName(data);
  const openIsBlank = isBlankClass(data);
  const activeEntry = list?.find(e => e.id === activeId) || null;

  const handleSaveCurrent = () =>
    run(async () => {
      if (openIsBlank) {
        toast('The open class is empty, nothing to save yet.', 'info');
        return;
      }
      const entry = await saveToShelf(data, { id: activeEntry ? activeEntry.id : null });
      setActiveShelfId(entry.id);
      toast(activeEntry ? `"${entry.name}" updated.` : `Saved as "${entry.name}".`, 'success');
    });

  const handleOpen = (entry: ShelfEntry) =>
    run(async () => {
      if (entry.id === activeId) {
        setActiveTab('dashboard');
        return;
      }
      const target = await loadFromShelf(entry.id);
      if (!target) {
        toast('This saved class could not be read. Export or delete it.', 'error');
        return;
      }
      const ok = await uiConfirm(
        openIsBlank
          ? `Open "${entry.name}"?`
          : `Open "${entry.name}"?\n\nYour current class "${currentLabel}" is saved first, so nothing is lost.`,
        { title: 'Open class', yesText: 'Open', danger: false, icon: 'warning' }
      );
      if (!ok) return;
      await shelveOpenClass(data);
      replaceAllData({ ...target, schoolLogo: data.schoolLogo || target.schoolLogo });
      setActiveShelfId(entry.id);
      toast(`Opened "${entry.name}".`, 'success');
      setActiveTab('dashboard');
    });

  const handleRename = (entry: ShelfEntry) =>
    run(async () => {
      const val = await uiPrompt('Class name:', entry.name, {
        title: 'Rename class',
        yesText: 'Save',
      });
      if (val === null || !val.trim()) return;
      await renameShelfEntry(entry.id, val);
    });

  const handleExport = (entry: ShelfEntry) =>
    run(async () => {
      const d = await loadFromShelf(entry.id);
      if (!d) {
        toast('This saved class could not be read.', 'error');
        return;
      }
      const payload = {
        app: 'ClassroomManager',
        version: 6,
        exportedAt: new Date().toISOString(),
        classId: entry.id,
        data: d,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const ok = await exportFileBlob(blob, `classgrid-${safeFile(entry.name)}.json`, {
        title: `ClassGrid: ${entry.name}`,
        dialogTitle: 'Save or Share Class File',
        preferShareOnWeb: false,
      });
      if (!ok) toast('Could not export the class file.', 'error');
    });

  const handleDelete = (entry: ShelfEntry) =>
    run(async () => {
      const ok = await uiConfirm(
        `Delete "${entry.name}" from saved classes?\n\nYou can undo right after.`,
        {
          title: 'Delete saved class',
          yesText: 'Delete',
          danger: true,
          icon: 'warning',
        }
      );
      if (!ok) return;
      const raw = await readShelfRaw(entry.id);
      await deleteFromShelf(entry.id);
      if (entry.id === activeId) setActiveShelfId(null);
      if (raw) setDeleted(raw);
    });

  const handleMove = (entry: ShelfEntry, step: -1 | 1) =>
    run(async () => {
      await moveShelfEntry(entry.id, step);
    });

  const handleUndoDelete = () =>
    run(async () => {
      if (!deleted) return;
      await restoreShelfRaw(deleted.entry, deleted.data, deleted.position);
      setDeleted(null);
      toast(`"${deleted.entry.name}" restored.`, 'success');
    });

  const handleBackupAll = () =>
    run(async () => {
      if (activeEntry === null && !openIsBlank) {
        await shelveOpenClass(data);
      } else if (activeEntry) {
        await saveToShelf(data, { id: activeEntry.id });
      }
      const payload = await buildShelfBackup();
      if (payload.classes.length === 0) {
        toast('No saved classes to back up yet.', 'info');
        return;
      }
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const stamp = new Date().toISOString().slice(0, 10);
      const ok = await exportFileBlob(blob, `classgrid-all-classes-${stamp}.json`, {
        title: `ClassGrid all classes (${stamp})`,
        dialogTitle: 'Save or Share All Classes',
        preferShareOnWeb: false,
      });
      if (!ok) toast('Could not export the file.', 'error');
      else
        toast(
          `Backed up ${payload.classes.length} class${payload.classes.length === 1 ? '' : 'es'}.`,
          'success'
        );
    });

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    run(async () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(await file.text());
      } catch {
        throw new Error('This file could not be read as a backup.');
      }
      const { added, updated } = await importIntoShelf(parsed);
      const parts: string[] = [];
      if (updated) parts.push(`Updated ${updated} existing class${updated === 1 ? '' : 'es'}`);
      if (added) parts.push(`Added ${added} new class${added === 1 ? '' : 'es'}`);
      toast(`${parts.join(' · ')}.`, 'success');
    });
  };

  return (
    <div className="space-y-5">
      {/* Currently Open Class Action Row */}
      <section className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs font-medium text-stone-500 dark:text-stone-400">
            Currently open
          </div>
          <div className="text-base font-bold text-stone-900 dark:text-stone-100 truncate mt-0.5">
            {openIsBlank ? 'Empty class' : currentLabel}
          </div>
          <div className="text-xs text-stone-500 dark:text-stone-400 mt-0.5 tabular-nums">
            {data.students.length} {data.students.length === 1 ? 'student' : 'students'}
            {data.inchargeName ? ` · ${data.inchargeName}` : ''}
            {!openIsBlank && (activeEntry ? ' · Saved on shelf' : ' · Not saved on shelf yet')}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <button
            type="button"
            onClick={handleSaveCurrent}
            disabled={busy || openIsBlank}
            className="flex-1 sm:flex-none min-h-[44px] px-4 py-2 rounded-xl bg-red-800 hover:bg-red-900 dark:bg-red-700 dark:hover:bg-red-600 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40"
          >
            <Save className="w-4 h-4" />
            <span>Save this class</span>
          </button>
          <button
            type="button"
            onClick={() => setShowNew(true)}
            disabled={busy}
            className="flex-1 sm:flex-none min-h-[44px] px-4 py-2 rounded-xl bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-100 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40"
          >
            <Plus className="w-4 h-4 text-red-800 dark:text-red-400" />
            <span>Start new class</span>
          </button>
        </div>
      </section>

      {/* Undo Delete Banner */}
      {deleted && (
        <div className="px-4 py-3 rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 flex items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-200">
          <span className="min-w-0 truncate">
            Deleted <span className="font-semibold">&ldquo;{deleted.entry.name}&rdquo;</span>
          </span>
          <button
            type="button"
            onClick={handleUndoDelete}
            className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white dark:bg-stone-900 border border-amber-300 dark:border-amber-800 cursor-pointer shrink-0"
          >
            <Undo2 className="w-3.5 h-3.5" />
            Undo
          </button>
        </div>
      )}

      {/* Saved Shelf List */}
      <section className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-stone-100 dark:border-stone-800 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">
              Saved classes {list ? `(${list.length})` : ''}
            </h2>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              Reorder, rename, export individual class files, or remove old classes.
            </p>
          </div>
        </div>

        {list === null ? (
          <div className="p-8 text-center text-xs text-stone-500 dark:text-stone-400">
            Loading saved classes…
          </div>
        ) : list.length === 0 ? (
          <div className="p-8 text-center text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
            No saved classes yet. Tap <b>Save this class</b> or <b>Start new class</b> above.
          </div>
        ) : (
          <div className="divide-y divide-stone-100 dark:divide-stone-800">
            {list.map((entry, idx) => {
              const isOpen = entry.id === activeId;
              return (
                <div
                  key={entry.id}
                  className={`p-4 sm:px-5 flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                    isOpen ? 'bg-red-50/40 dark:bg-red-950/15' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 min-w-0 flex-1">
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-stone-900 dark:text-stone-100 truncate">
                        {entry.name}
                        {isOpen && (
                          <span className="ml-2 text-xs font-semibold text-red-800 dark:text-red-400">
                            · Active
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-stone-500 dark:text-stone-400 mt-0.5 tabular-nums flex items-center gap-1.5 flex-wrap">
                        <span>
                          {entry.students} {entry.students === 1 ? 'student' : 'students'}
                        </span>
                        {entry.incharge && <span>· {entry.incharge}</span>}
                        {entry.academicYear && <span>· {entry.academicYear}</span>}
                        <span>· Saved {fmtDate(entry.savedAt)}</span>
                      </div>
                    </div>

                    {/* Up / Down Reorder Arrows */}
                    <div className="flex items-center gap-1 shrink-0 md:hidden">
                      <button
                        type="button"
                        aria-label="Move up"
                        onClick={() => handleMove(entry, -1)}
                        disabled={busy || idx === 0}
                        className="w-11 h-11 flex items-center justify-center rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-300 disabled:opacity-30 cursor-pointer"
                      >
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="Move down"
                        onClick={() => handleMove(entry, 1)}
                        disabled={busy || idx === list.length - 1}
                        className="w-11 h-11 flex items-center justify-center rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-300 disabled:opacity-30 cursor-pointer"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Action Controls */}
                  <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                    <div className="hidden md:flex items-center gap-1 mr-1">
                      <button
                        type="button"
                        aria-label="Move up"
                        onClick={() => handleMove(entry, -1)}
                        disabled={busy || idx === 0}
                        className="w-10 h-10 flex items-center justify-center rounded-xl border border-stone-200 dark:border-stone-800 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 disabled:opacity-30 cursor-pointer"
                      >
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="Move down"
                        onClick={() => handleMove(entry, 1)}
                        disabled={busy || idx === list.length - 1}
                        className="w-10 h-10 flex items-center justify-center rounded-xl border border-stone-200 dark:border-stone-800 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 disabled:opacity-30 cursor-pointer"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleOpen(entry)}
                      disabled={busy}
                      className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40 ${
                        isOpen
                          ? 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-200 hover:bg-stone-200 dark:hover:bg-stone-700'
                          : 'bg-red-800 hover:bg-red-900 dark:bg-red-700 dark:hover:bg-red-600 text-white'
                      }`}
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      <span>{isOpen ? 'Go to class' : 'Open'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRename(entry)}
                      disabled={busy}
                      title="Rename class"
                      className="min-h-[42px] px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-200 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>Rename</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleExport(entry)}
                      disabled={busy}
                      title="Export single class JSON"
                      className="min-h-[42px] px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-200 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Export</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDelete(entry)}
                      disabled={busy}
                      title="Delete saved class"
                      aria-label="Delete saved class"
                      className="w-11 h-[42px] flex items-center justify-center rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-700 dark:text-red-400 cursor-pointer disabled:opacity-40 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Multi-Class Backup & Import */}
      <section className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
            Backup &amp; restore classes
          </h3>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5 leading-relaxed">
            Saved classes live offline on this device. Export a full backup file periodically to keep every class safe.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <button
            type="button"
            onClick={handleBackupAll}
            disabled={busy}
            className="flex-1 sm:flex-none min-h-[44px] px-4 py-2 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/70 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-800 dark:text-stone-100 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap"
          >
            <Download className="w-4 h-4 text-stone-500 dark:text-stone-400" />
            <span>Backup everything</span>
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="flex-1 sm:flex-none min-h-[44px] px-4 py-2 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/70 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-800 dark:text-stone-100 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap"
          >
            <Upload className="w-4 h-4 text-stone-500 dark:text-stone-400" />
            <span>Open a class file</span>
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          onChange={handleImportFile}
          className="hidden"
        />
      </section>

      {showNew && (
        <NewClassDialog
          onClose={() => {
            setShowNew(false);
            refresh();
            onShelfChanged?.();
          }}
        />
      )}
    </div>
  );
};

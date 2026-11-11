import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useClassroom } from '../../context/ClassroomContext';
import { ActionGrid, ActionButton } from '../ActionGrid';
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
  makeNewClassData,
  readShelfRaw,
  renameShelfEntry,
  restoreShelfRaw,
  saveToShelf,
  setActiveShelfId
} from '../../utils/classShelf';
import { AppData } from '../../types';
import {
  Archive,
  BookOpen,
  Download,
  FolderOpen,
  Pencil,
  Plus,
  Save,
  Trash2,
  Undo2,
  Upload,
  Users
} from 'lucide-react';

/**
 * Saves the open class onto the shelf (updating its card, or creating one) unless it is blank.
 * Shared by "Open", "Start new class" and "Save current class".
 */
export async function shelveOpenClass(current: AppData): Promise<ShelfEntry | null> {
  if (isBlankClass(current)) return null;
  const entry = await saveToShelf(current, { id: getActiveShelfId() });
  setActiveShelfId(entry.id);
  return entry;
}

// ------------------------------------------------------------------------------------------
// "Start new class" dialog (safer replacement for Reset Everything). Used here and in Settings.
// ------------------------------------------------------------------------------------------
export const NewClassDialog: React.FC<{ onClose: () => void; onDone?: () => void }> = ({ onClose, onDone }) => {
  const { data, replaceAllData, toast } = useClassroom();
  const [keepSchool, setKeepSchool] = useState(true);
  const [keepTools, setKeepTools] = useState(true);
  const [busy, setBusy] = useState(false);
  const blank = isBlankClass(data);

  const handleStart = async () => {
    setBusy(true);
    try {
      const saved = await shelveOpenClass(data); // safety copy first; stop if it fails
      const fresh = makeNewClassData(data, keepSchool);
      if (keepTools && data.tools) {
        fresh.tools = { ...data.tools };
      } else {
        fresh.tools = {
          students: true,
          attendance: true,
          results: true,
          dailyTest: false,
          funds: false
        };
      }
      replaceAllData(fresh); // goes through normal save, so the header Undo can bring it back
      setActiveShelfId(null);
      toast(
        saved
          ? `New class started. "${saved.name}" is saved in Classes.`
          : 'New class started.',
        'success'
      );
      onDone?.();
      onClose();
    } catch (e: any) {
      toast(`Could not save the current class, so nothing was cleared. ${e?.message || ''}`.trim(), 'error');
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4"
      onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}
    >
      <div className="w-full sm:max-w-md bg-white dark:bg-stone-900 rounded-t-3xl sm:rounded-2xl border border-stone-200 dark:border-stone-800 shadow-2xl p-5 space-y-3.5">
        <div>
          <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">Start a new class</h3>
          <p className="mt-1 text-xs text-stone-600 dark:text-stone-400 leading-relaxed">
            {blank
              ? 'The open class is empty, so there is nothing to save. You will get a clean start.'
              : <>The open class <b>"{defaultClassName(data)}"</b> ({data.students.length} students) is saved first in the <b>Classes</b> tab. You can open it again any time.</>}
          </p>
        </div>

        <label className="flex items-start gap-3 p-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/50 cursor-pointer min-h-[44px]">
          <input
            type="checkbox"
            checked={keepSchool}
            onChange={e => setKeepSchool(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-red-800"
          />
          <span className="text-xs leading-snug text-stone-700 dark:text-stone-300">
            <b className="block text-sm text-stone-900 dark:text-stone-100">Keep school details</b>
            School name, EMIS code, year, logo and print settings stay. Students, attendance, results and funds start empty.
          </span>
        </label>

        {/* Use the same tools as this class? (Yes / No) */}
        <div className="p-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/50 space-y-2">
          <span className="text-xs font-bold text-stone-900 dark:text-stone-100 block">
            Use the same tools as this class?
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setKeepTools(true)}
              className={`flex-1 min-h-[44px] py-1.5 px-3 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                keepTools
                  ? 'bg-[#991B1B] text-white border-transparent'
                  : 'bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-300 border-stone-300 dark:border-stone-700'
              }`}
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => setKeepTools(false)}
              className={`flex-1 min-h-[44px] py-1.5 px-3 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                !keepTools
                  ? 'bg-[#991B1B] text-white border-transparent'
                  : 'bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-300 border-stone-300 dark:border-stone-700'
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
            className="flex-1 min-h-12 rounded-xl text-sm font-bold bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-200 border border-stone-200 dark:border-stone-700 cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleStart}
            disabled={busy}
            className="flex-1 min-h-12 rounded-xl text-sm font-bold bg-[#991B1B] hover:bg-[#7F1D1D] text-white cursor-pointer disabled:opacity-50"
          >
            {busy ? 'Saving…' : blank ? 'Start new class' : 'Save & start new'}
          </button>
        </div>
        <p className="text-[11px] text-center text-stone-500 dark:text-stone-400">
          Changed your mind? Tap Undo in the top bar right after.
        </p>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------------------------------
// Classes tab
// ------------------------------------------------------------------------------------------
function fmtDate(ts: number): string {
  try {
    return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

function safeFile(name: string): string {
  return name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40) || 'class';
}

export const ClassesView: React.FC = () => {
  const { data, replaceAllData, setActiveTab, toast, uiConfirm, uiPrompt } = useClassroom();
  const [list, setList] = useState<ShelfEntry[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(getActiveShelfId());
  const [busy, setBusy] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [deleted, setDeleted] = useState<{ entry: ShelfEntry; data: AppData } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      setList(await listShelf());
    } catch {
      setList([]);
    }
    setActiveId(getActiveShelfId());
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
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

  const handleSaveCurrent = () => run(async () => {
    if (openIsBlank) {
      toast('The open class is empty, nothing to save yet.', 'info');
      return;
    }
    const entry = await saveToShelf(data, { id: activeEntry ? activeEntry.id : null });
    setActiveShelfId(entry.id);
    toast(activeEntry ? `"${entry.name}" updated.` : `Saved as "${entry.name}".`, 'success');
  });

  const handleOpen = (entry: ShelfEntry) => run(async () => {
    if (entry.id === activeId) {
      toast('This class is already open.', 'info');
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
    await shelveOpenClass(data); // safety copy; throws (and stops) if it cannot be saved
    replaceAllData({ ...target, schoolLogo: data.schoolLogo });
    setActiveShelfId(entry.id);
    toast(`Opened "${entry.name}".`, 'success');
    setActiveTab('dashboard');
  });

  const handleRename = (entry: ShelfEntry) => run(async () => {
    const val = await uiPrompt('Class name:', entry.name, { title: 'Rename class', yesText: 'Save' });
    if (val === null || !val.trim()) return;
    await renameShelfEntry(entry.id, val);
  });

  const handleExport = (entry: ShelfEntry) => run(async () => {
    const d = await loadFromShelf(entry.id);
    if (!d) {
      toast('This saved class could not be read.', 'error');
      return;
    }
    const payload = { app: 'ClassroomManager', version: 6, exportedAt: new Date().toISOString(), classId: entry.id, data: d };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const ok = await exportFileBlob(blob, `classgrid-${safeFile(entry.name)}.json`, {
      title: `ClassGrid: ${entry.name}`,
      dialogTitle: 'Save or Share Class File',
      preferShareOnWeb: false
    });
    if (!ok) toast('Could not export the class file.', 'error');
  });

  const handleDelete = (entry: ShelfEntry) => run(async () => {
    const ok = await uiConfirm(`Delete "${entry.name}" from Classes?\n\nYou can undo right after.`, {
      title: 'Delete saved class',
      yesText: 'Delete',
      danger: true,
      icon: 'warning'
    });
    if (!ok) return;
    const raw = await readShelfRaw(entry.id);
    await deleteFromShelf(entry.id);
    if (entry.id === activeId) setActiveShelfId(null); // the open class stays open, it just has no card now
    if (raw) setDeleted(raw);
  });

  const handleUndoDelete = () => run(async () => {
    if (!deleted) return;
    await restoreShelfRaw(deleted.entry, deleted.data);
    setDeleted(null);
    toast(`"${deleted.entry.name}" restored.`, 'success');
  });

  const handleBackupAll = () => run(async () => {
    if (activeEntry === null && !openIsBlank) {
      // include the open class too so the file really holds everything
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
      preferShareOnWeb: false
    });
    if (!ok) toast('Could not export the file.', 'error');
    else toast(`Backed up ${payload.classes.length} class${payload.classes.length === 1 ? '' : 'es'}.`, 'success');
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
    <div className="space-y-4">
      {/* Open class */}
      <div className="bg-white dark:bg-[#1C1917] border border-[#E7E5E4] dark:border-[#44403C] rounded-2xl p-4 shadow-xs space-y-3">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300 shrink-0">
            <BookOpen className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold uppercase tracking-wide text-[#78716C] dark:text-[#A8A29E]">Open now</div>
            <div className="text-base font-bold text-[#1C1917] dark:text-[#F5F5F4] truncate">
              {openIsBlank ? 'Empty class' : currentLabel}
            </div>
            <div className="text-xs text-[#78716C] dark:text-[#A8A29E]">
              {data.students.length} students{data.inchargeName ? ` • ${data.inchargeName}` : ''}
              {!openIsBlank && (activeEntry ? ' • has a saved card' : ' • not saved in Classes yet')}
            </div>
          </div>
        </div>

        <ActionGrid cols={2}>
          <ActionButton variant="primary" icon={Save} onClick={handleSaveCurrent} disabled={busy || openIsBlank}>
            Save this class
          </ActionButton>
          <ActionButton variant="secondary" icon={Plus} onClick={() => setShowNew(true)} disabled={busy}>
            Start new class
          </ActionButton>
        </ActionGrid>
        <p className="text-[11px] leading-snug text-[#78716C] dark:text-[#A8A29E]">
          Opening another class or starting a new one saves the open class first.
        </p>
      </div>

      {deleted && (
        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 flex items-center justify-between gap-2 text-xs text-amber-900 dark:text-amber-200">
          <span className="min-w-0 truncate">Deleted "{deleted.entry.name}"</span>
          <button
            type="button"
            onClick={handleUndoDelete}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-[#1C1917] border border-amber-300 dark:border-amber-700 cursor-pointer shrink-0"
          >
            <Undo2 className="w-3.5 h-3.5" /> Undo
          </button>
        </div>
      )}

      {/* Saved classes */}
      <div className="bg-white dark:bg-[#1C1917] border border-[#E7E5E4] dark:border-[#44403C] rounded-2xl p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-[#1C1917] dark:text-[#F5F5F4] flex items-center gap-2">
            <Archive className="w-4 h-4" />
            Saved classes {list ? `(${list.length})` : ''}
          </h3>
        </div>

        {list === null ? (
          <div className="py-6 text-center text-xs text-[#78716C] dark:text-[#A8A29E]">Loading…</div>
        ) : list.length === 0 ? (
          <div className="py-6 text-center text-xs text-[#78716C] dark:text-[#A8A29E] leading-relaxed">
            No saved classes yet.<br />
            Tap <b>Save this class</b>, or <b>Start new class</b> (it saves the open one for you).
          </div>
        ) : (
          <div className="space-y-2.5">
            {list.map(entry => {
              const isOpen = entry.id === activeId;
              return (
                <div
                  key={entry.id}
                  className={`rounded-xl border p-3 space-y-2.5 ${
                    isOpen
                      ? 'border-red-300 dark:border-red-900 bg-red-50/60 dark:bg-red-950/20'
                      : 'border-[#E7E5E4] dark:border-[#44403C] bg-[#FAFAF9] dark:bg-[#292524]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-[#1C1917] dark:text-[#F5F5F4] truncate">{entry.name}</div>
                      <div className="text-[11px] text-[#78716C] dark:text-[#A8A29E] flex items-center gap-1.5 flex-wrap">
                        <Users className="w-3 h-3" /> {entry.students}
                        {entry.incharge ? <span>• {entry.incharge}</span> : null}
                        {entry.academicYear ? <span>• {entry.academicYear}</span> : null}
                        <span>• saved {fmtDate(entry.savedAt)}</span>
                      </div>
                    </div>
                    {isOpen && (
                      <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-900">
                        Open
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    <CardBtn icon={FolderOpen} label="Open" onClick={() => handleOpen(entry)} disabled={busy || isOpen} primary />
                    <CardBtn icon={Pencil} label="Rename" onClick={() => handleRename(entry)} disabled={busy} />
                    <CardBtn icon={Download} label="Export" onClick={() => handleExport(entry)} disabled={busy} />
                    <CardBtn icon={Trash2} label="Delete" onClick={() => handleDelete(entry)} disabled={busy} danger />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Backup / import */}
      <div className="bg-white dark:bg-[#1C1917] border border-[#E7E5E4] dark:border-[#44403C] rounded-2xl p-4 shadow-xs space-y-3">
        <h3 className="text-sm font-bold text-[#1C1917] dark:text-[#F5F5F4]">Keep your classes safe</h3>
        <p className="text-xs leading-relaxed text-[#78716C] dark:text-[#A8A29E]">
          Saved classes live on this device only. Clearing the browser's site data or uninstalling the app erases them, so export a backup now and then.
        </p>
        <ActionGrid cols={2}>
          <ActionButton variant="secondary" icon={Download} onClick={handleBackupAll} disabled={busy}>
            Backup everything
          </ActionButton>
          <ActionButton variant="secondary" icon={Upload} onClick={() => fileRef.current?.click()} disabled={busy}>
            Open a class file
          </ActionButton>
        </ActionGrid>
        <input ref={fileRef} type="file" accept=".json,application/json" onChange={handleImportFile} className="hidden" />
      </div>

      {showNew && <NewClassDialog onClose={() => { setShowNew(false); refresh(); }} />}
    </div>
  );
};

const CardBtn: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  danger?: boolean;
}> = ({ icon: Icon, label, onClick, disabled, primary, danger }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={`min-h-11 rounded-lg flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold border transition-colors ${
      disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
    } ${
      primary
        ? 'bg-[#991B1B] text-white border-transparent hover:bg-[#7F1D1D]'
        : danger
        ? 'bg-[#F8E4E1] dark:bg-[#4A1A18] text-[#7F1D1D] dark:text-[#F0C8C0] border-rose-200 dark:border-rose-900/80'
        : 'bg-white dark:bg-[#1C1917] text-stone-800 dark:text-stone-200 border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800'
    }`}
  >
    <Icon className="w-4 h-4" />
    {label}
  </button>
);

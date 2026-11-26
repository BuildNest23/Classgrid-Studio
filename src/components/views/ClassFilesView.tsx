import React, { useEffect, useRef, useState } from 'react';
import { useClassroom } from '../../context/ClassroomContext';
import { buildClassPackage, ensureClassId, serializeClassPackage, suggestedFileName } from '../../collect/classPackage';
import { parseTeacherUpdate, planTeacherUpdate, applyTeacherUpdate, UpdatePlan, TeacherUpdate } from '../../collect/teacherUpdate';
import { exportFileBlob } from '../../utils/nativeFileExport';
import { listShelf, loadFromShelf, saveToShelf, getActiveShelfId } from '../../utils/classShelf';
import { AppData } from '../../types';
import { addSnapshot } from '../../utils/history';
import { HistoryCard } from '../HistoryCard';
import { SchoolExcelCard } from '../SchoolExcelCard';
import { CollectView } from './CollectView';
import { Send, Inbox, Check, FileSpreadsheet, ClipboardList } from 'lucide-react';

interface ClassFilesViewProps {
  initialSection?: 'files' | 'forms';
}

export const ClassFilesView: React.FC<ClassFilesViewProps> = ({ initialSection = 'files' }) => {
  const { data, saveData, toast, setActiveTab } = useClassroom();
  const [section, setSection] = useState<'files' | 'forms'>(initialSection);

  useEffect(() => {
    setSection(initialSection);
  }, [initialSection]);

  const switchSection = (next: 'files' | 'forms') => {
    setSection(next);
    setActiveTab(next === 'forms' ? 'collect' : 'inbox');
  };

  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [hk, setHk] = useState(0);
  const [loaded, setLoaded] = useState<{
    upd: TeacherUpdate;
    plan: UpdatePlan;
    picked: Set<string>;
    fileName: string;
    shelf?: { id: string; name: string; data: AppData };
  } | null>(null);

  const send = async () => {
    if (!data.className.trim()) {
      toast('Give the class a name first in Settings.', 'error');
      return;
    }
    setBusy(true);
    try {
      const { classId, data: withId, created } = ensureClassId(data);
      const pkg = buildClassPackage(withId, { mode: 'full', version: Math.floor(Date.now() / 1000) });
      const blob = new Blob([serializeClassPackage(pkg)], { type: 'application/json' });
      const ok = await exportFileBlob(blob, suggestedFileName(pkg), {
        title: `Class file - ${data.className}`,
        dialogTitle: 'Send class file to teacher',
        preferShareOnWeb: true
      });
      if (ok) {
        if (created) saveData(prev => ({ ...prev, classId }));
        toast('Class file ready.', 'success');
      }
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setMsg('');
    setLoaded(null);
    let text = '';
    try {
      text = await f.text();
    } catch {
      setMsg('Could not read this file.');
      return;
    }
    const { upd, error } = parseTeacherUpdate(text);
    if (!upd) {
      setMsg(error);
      return;
    }
    let target: AppData = data;
    let shelf: { id: string; name: string; data: AppData } | undefined;
    if (data.classId !== upd.classId) {
      try {
        for (const e of await listShelf()) {
          if (e.id === getActiveShelfId()) continue;
          const d = await loadFromShelf(e.id);
          if (d && d.classId === upd.classId) {
            shelf = { id: e.id, name: e.name, data: d };
            target = d;
            break;
          }
        }
      } catch {
        /* ignore */
      }
      if (!shelf) {
        setMsg(
          `This update is not for any class on this device${upd.className ? ` (it is from "${upd.className}")` : ''}. The original class file must have been sent from this device.`
        );
        return;
      }
    }
    const plan = planTeacherUpdate(target, upd);
    setLoaded({
      upd,
      plan,
      shelf,
      picked: new Set(plan.items.filter(i => i.state === 'new').map(i => i.id)),
      fileName: f.name
    });
  };

  const toggle = (id: string) =>
    setLoaded(l => {
      if (!l) return l;
      const p = new Set(l.picked);
      p.has(id) ? p.delete(id) : p.add(id);
      return { ...l, picked: p };
    });

  const apply = async () => {
    if (!loaded || busy) return;
    setBusy(true);
    try {
      const n = loaded.picked.size;
      const reason = `Before teacher update (${loaded.upd.createdAt ? new Date(loaded.upd.createdAt).toLocaleDateString() : 'file'})`;
      if (loaded.shelf) {
        if (!(await addSnapshot(loaded.shelf.data, reason))) {
          toast('Could not make a restore point, so nothing was changed.', 'error');
          return;
        }
        try {
          await saveToShelf(applyTeacherUpdate(loaded.shelf.data, loaded.plan, loaded.picked), {
            id: loaded.shelf.id,
            name: loaded.shelf.name
          });
        } catch (e: any) {
          toast(`Could not save. ${e?.message || ''}`.trim(), 'error');
          return;
        }
      } else {
        if (!(await addSnapshot(data, reason))) {
          toast('Could not make a restore point, so nothing was changed.', 'error');
          return;
        }
        saveData(prev => applyTeacherUpdate(prev, loaded.plan, loaded.picked));
      }
      toast(`${n} item${n === 1 ? '' : 's'} added${loaded.shelf ? ` to "${loaded.shelf.name}"` : ''}.`, 'success');
      setLoaded(null);
      setHk(k => k + 1);
    } finally {
      setBusy(false);
    }
  };

  const groups = loaded ? Array.from(new Set(loaded.plan.items.map(i => i.group))) : [];

  return (
    <div className="cg-view-enter space-y-5">
      {/* Unified Exchange Hub Masthead */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-stone-500 dark:text-stone-400">
            {data.className || 'Class'} · Offline sync &amp; forms
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-50 mt-0.5">
            Exchange
          </h1>
        </div>

        <div
          className="inline-flex p-1 rounded-xl bg-stone-200/70 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 self-start sm:self-auto"
          role="tablist"
          aria-label="Exchange sections"
        >
          <button
            type="button"
            role="tab"
            aria-selected={section === 'files'}
            onClick={() => switchSection('files')}
            className={`min-h-[38px] px-3.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
              section === 'files'
                ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-50 shadow-xs'
                : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
            }`}
          >
            <FileSpreadsheet className={`w-3.5 h-3.5 ${section === 'files' ? 'text-red-800 dark:text-red-400' : ''}`} />
            <span>Class files &amp; Excel</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={section === 'forms'}
            onClick={() => switchSection('forms')}
            className={`min-h-[38px] px-3.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
              section === 'forms'
                ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-50 shadow-xs'
                : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
            }`}
          >
            <ClipboardList className={`w-3.5 h-3.5 ${section === 'forms' ? 'text-red-800 dark:text-red-400' : ''}`} />
            <span>Quick forms</span>
          </button>
        </div>
      </div>

      {section === 'forms' ? (
        <CollectView embedded />
      ) : (
        <div className="space-y-4">
          {/* Teacher Sync Pair: Send & Receive */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <section className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-5 flex flex-col justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-stone-100 dark:bg-stone-800 text-red-800 dark:text-red-400 flex items-center justify-center shrink-0">
                  <Send className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">Send class to teacher</h2>
                  <p className="text-xs text-stone-500 dark:text-stone-400 mt-1 leading-relaxed">
                    Shares your class (roster, exams, funds, and records) with the teacher app. On a teacher&apos;s existing phone, their attendance and marks are kept.
                  </p>
                </div>
              </div>

              <div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={send}
                  className="w-full min-h-[44px] px-4 rounded-xl bg-red-800 hover:bg-red-900 dark:bg-red-700 dark:hover:bg-red-600 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  <span>Send class file</span>
                </button>
              </div>
            </section>

            <section className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-5 flex flex-col justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-stone-100 dark:bg-stone-800 text-red-800 dark:text-red-400 flex items-center justify-center shrink-0">
                  <Inbox className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">Receive teacher update</h2>
                  <p className="text-xs text-stone-500 dark:text-stone-400 mt-1 leading-relaxed">
                    Open a teacher update file for any class on this device. Review every new or changed record before applying.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <input
                  ref={ref}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={e => {
                    onFile(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => ref.current?.click()}
                  className="w-full min-h-[44px] px-4 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-700 text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Inbox className="w-4 h-4 text-stone-500 dark:text-stone-400" />
                  <span>Choose update file</span>
                </button>
                {msg && <div className="text-xs font-semibold text-red-700 dark:text-red-400">{msg}</div>}
              </div>
            </section>
          </div>

          {/* Teacher Update Diff Review */}
          {loaded && (
            <section className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-5 space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
                    {loaded.shelf ? loaded.shelf.name : loaded.upd.className || 'Class'}
                    {loaded.upd.from ? ` — ${loaded.upd.from}` : ''}
                  </h3>
                  <p className="text-xs text-stone-500 dark:text-stone-400 font-mono-num mt-0.5">
                    {loaded.upd.createdAt ? `${new Date(loaded.upd.createdAt).toLocaleDateString()} · ` : ''}
                    {loaded.plan.same} item(s) already match
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setLoaded(null)}
                  className="text-xs font-semibold text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 cursor-pointer shrink-0"
                >
                  Dismiss
                </button>
              </div>

              {!loaded.plan.items.length ? (
                <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                  <Check className="w-4 h-4" />
                  <span>Nothing new — you already have everything in this update file.</span>
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    {groups.map(g => (
                      <div key={g}>
                        <div className="text-xs font-bold text-stone-700 dark:text-stone-300 mb-1.5">{g}</div>
                        <div className="divide-y divide-stone-100 dark:divide-stone-800 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden">
                          {loaded.plan.items
                            .filter(i => i.group === g)
                            .map(i => (
                              <label
                                key={i.id}
                                className="flex items-start gap-3 px-3.5 py-2.5 cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
                              >
                                <input
                                  type="checkbox"
                                  className="mt-0.5 w-4 h-4 accent-red-800 dark:accent-red-500 shrink-0"
                                  checked={loaded.picked.has(i.id)}
                                  onChange={() => toggle(i.id)}
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-baseline gap-2 flex-wrap">
                                    <span className="text-xs font-semibold text-stone-900 dark:text-stone-100">
                                      {i.title}
                                    </span>
                                    {i.state === 'conflict' && (
                                      <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                                        · Different
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">{i.detail}</div>
                                </div>
                              </label>
                            ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  {loaded.plan.items.some(i => i.state === 'conflict') && (
                    <p className="text-xs text-stone-500 dark:text-stone-400">
                      Items marked Different are unticked by default. Tick them only if the teacher's version should replace yours.
                    </p>
                  )}

                  <div className="flex justify-end">
                    <button
                      type="button"
                      disabled={busy || !loaded.picked.size}
                      onClick={apply}
                      className="min-h-[44px] px-5 rounded-xl bg-red-800 hover:bg-red-900 dark:bg-red-700 dark:hover:bg-red-600 text-white text-xs font-semibold cursor-pointer disabled:opacity-50 transition-colors"
                    >
                      {busy
                        ? 'Saving…'
                        : `Add ${loaded.picked.size} item${loaded.picked.size === 1 ? '' : 's'}`}
                    </button>
                  </div>
                </>
              )}
            </section>
          )}

          {/* School-wide Excel Workbook */}
          <SchoolExcelCard onApplied={() => setHk(k => k + 1)} />

          {/* Automatic Restore Points */}
          <HistoryCard refreshKey={hk} />
        </div>
      )}
    </div>
  );
};

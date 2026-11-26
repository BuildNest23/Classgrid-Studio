import React, { useRef, useState } from 'react';
import { useClassroom } from '../context/ClassroomContext';
import { listShelf, loadFromShelf, saveToShelf, getActiveShelfId, defaultClassName } from '../utils/classShelf';
import { addSnapshot } from '../utils/history';
import { fileTitle, prettyDate, todayKey } from '../utils/helpers';
import { exportFileBlob } from '../utils/nativeFileExport';
import { buildSchoolSheets, planSchoolImport, SchoolClass, SchoolPlan } from '../collect/schoolSheet';
import { buildSchoolWorkbookBlob, readWorkbookSheets } from '../collect/schoolExcel';
import { FileSpreadsheet, Download, Upload, Check } from 'lucide-react';

export const SchoolExcelCard: React.FC<{ onApplied?: () => void }> = ({ onApplied }) => {
  const { data, saveData, toast, uiConfirm } = useClassroom();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [loaded, setLoaded] = useState<{ plan: SchoolPlan; picked: Set<string>; classes: SchoolClass[] } | null>(null);

  /** Every class on this phone; the open class uses what is on screen now. */
  const gather = async (): Promise<SchoolClass[]> => {
    const activeId = getActiveShelfId();
    const out: SchoolClass[] = [];
    for (const e of await listShelf()) {
      const d = e.id === activeId ? data : await loadFromShelf(e.id);
      if (d) out.push({ key: e.id, name: e.name || defaultClassName(d), data: d });
    }
    if (!out.some(c => c.key === activeId) && (data.students.length || data.className)) {
      out.unshift({ key: activeId || 'open', name: defaultClassName(data), data });
    }
    return out;
  };

  const doExport = async () => {
    setBusy(true); setMsg('');
    try {
      const classes = await gather();
      if (!classes.length) { setMsg('There are no classes to export.'); return; }
      const built = buildSchoolSheets(classes, data.schoolName, prettyDate(todayKey()));
      const blob = await buildSchoolWorkbookBlob(built, data.schoolName);
      const name = `${fileTitle(data.schoolName, 'All Students', todayKey())}.xlsx`;
      const ok = await exportFileBlob(blob, name, { title: `${data.schoolName} - All Students`, dialogTitle: 'Send to principal', preferShareOnWeb: true });
      if (ok) toast(`Excel ready: ${classes.length} class${classes.length === 1 ? '' : 'es'}.`, 'success');
    } catch (e: any) {
      setMsg(`Could not make the Excel file. ${e?.message || ''}`.trim());
    } finally { setBusy(false); }
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true); setMsg(''); setLoaded(null);
    try {
      const sheets = await readWorkbookSheets(f);
      const classes = await gather();
      const plan = planSchoolImport(classes, sheets);
      setLoaded({ plan, classes, picked: new Set(plan.classes.flatMap(c => c.items.filter(i => i.defaultOn).map(i => i.id + '@' + c.classKey))) });
    } catch {
      setMsg('This file could not be read. Please choose the Excel file the principal sent back.');
    } finally { setBusy(false); }
  };

  const toggle = (k: string) => setLoaded(l => {
    if (!l) return l;
    const p = new Set(l.picked); p.has(k) ? p.delete(k) : p.add(k);
    return { ...l, picked: p };
  });

  const apply = async () => {
    if (!loaded) return;
    const removeCount = loaded.plan.classes.reduce((n, c) => n + c.items.filter(i => i.kind === 'remove' && loaded.picked.has(i.id + '@' + c.classKey)).length, 0);
    if (removeCount) {
      const ok = await uiConfirm(`${removeCount} student${removeCount === 1 ? '' : 's'} will be removed with all their attendance, marks and fund records.\n\nA restore point is saved first.`, { title: 'Remove students?', yesText: 'Apply', danger: true, icon: 'warning' });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const activeId = getActiveShelfId();
      let n = 0;
      for (const cp of loaded.plan.classes) {
        const chosen = new Set(cp.items.filter(i => loaded.picked.has(i.id + '@' + cp.classKey)).map(i => i.id));
        if (!chosen.size) continue;
        const cls = loaded.classes.find(c => c.key === cp.classKey);
        if (!cls) continue;
        if (!(await addSnapshot(cls.data, 'Before principal Excel'))) { toast(`Could not make a restore point for ${cp.className}, so it was skipped.`, 'error'); continue; }
        const isOpen = cp.classKey === activeId || cp.classKey === 'open';
        if (isOpen) saveData(prev => cp.apply(prev, chosen));
        else await saveToShelf(cp.apply(cls.data, chosen), { id: cp.classKey, name: cls.name });
        n += chosen.size;
      }
      toast(`${n} change${n === 1 ? '' : 's'} applied.`, 'success');
      setLoaded(null);
      if (n > 0) onApplied?.();
    } catch (e: any) {
      toast(`Could not apply. ${e?.message || ''}`.trim(), 'error');
    } finally { setBusy(false); }
  };

  const pickedCount = loaded ? loaded.picked.size : 0;

  return (
    <section className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-stone-100 dark:bg-stone-800 text-red-800 dark:text-red-400 flex items-center justify-center shrink-0">
          <FileSpreadsheet className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">School Excel workbook</h2>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5 leading-relaxed">
            Export every saved class into one Excel workbook (one sheet per class), or open an edited workbook to review and apply student updates.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <button
          type="button"
          disabled={busy}
          onClick={doExport}
          className="min-h-[44px] px-4 rounded-xl bg-red-800 hover:bg-red-900 dark:bg-red-700 dark:hover:bg-red-600 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
        >
          <Download className="w-4 h-4 shrink-0" />
          <span>{busy && !loaded ? 'Preparing workbook…' : 'Export all classes (.xlsx)'}</span>
        </button>

        <input
          ref={ref}
          type="file"
          accept=".xlsx,.xls,.xlsm,.ods,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={e => { onFile(e.target.files?.[0]); e.target.value = ''; }}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => ref.current?.click()}
          className="min-h-[44px] px-4 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-700 text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
        >
          <Upload className="w-4 h-4 text-stone-500 dark:text-stone-400 shrink-0" />
          <span>Import edited workbook</span>
        </button>
      </div>

      {msg && (
        <div className="text-xs font-semibold text-red-700 dark:text-red-400">{msg}</div>
      )}

      {loaded && (
        <div className="pt-4 border-t border-stone-200 dark:border-stone-800 space-y-3">
          {loaded.plan.notes.map((n, i) => (
            <div key={i} className="text-xs font-medium text-amber-700 dark:text-amber-400">{n}</div>
          ))}

          {!loaded.plan.classes.some(c => c.items.length) ? (
            <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
              <Check className="w-4 h-4" />
              <span>Everything in this workbook already matches the app ({loaded.plan.same} students).</span>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {loaded.plan.classes.filter(c => c.items.length).map(cp => (
                  <div key={cp.classKey}>
                    <div className="text-xs font-bold text-stone-700 dark:text-stone-300 mb-1.5">{cp.className}</div>
                    <div className="divide-y divide-stone-100 dark:divide-stone-800 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden">
                      {cp.items.map(i => {
                        const k = i.id + '@' + cp.classKey;
                        const statusColor =
                          i.kind === 'remove'
                            ? 'text-red-700 dark:text-red-400'
                            : i.kind === 'add'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-amber-700 dark:text-amber-400';
                        const statusLabel = i.kind === 'remove' ? 'Removed' : i.kind === 'add' ? 'New' : 'Changed';

                        return (
                          <label key={k} className="flex items-start gap-3 px-3.5 py-2.5 cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors">
                            <input
                              type="checkbox"
                              className="mt-0.5 w-4 h-4 accent-red-800 dark:accent-red-500 shrink-0"
                              checked={loaded.picked.has(k)}
                              onChange={() => toggle(k)}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline gap-2 flex-wrap">
                                <span className="text-xs font-semibold text-stone-900 dark:text-stone-100">{i.title}</span>
                                <span className={`text-[11px] font-semibold ${statusColor}`}>· {statusLabel}</span>
                              </div>
                              <div className="text-xs text-stone-500 dark:text-stone-400 break-words mt-0.5">{i.detail}</div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-xs text-stone-500 dark:text-stone-400">
                Removed students are unticked by default. Tick them only if you intend to delete their records.
              </p>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setLoaded(null)}
                  className="min-h-[42px] px-4 rounded-xl text-xs font-semibold text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
                >
                  Dismiss
                </button>
                <button
                  type="button"
                  disabled={busy || !pickedCount}
                  onClick={apply}
                  className="min-h-[42px] px-4 rounded-xl bg-red-800 hover:bg-red-900 dark:bg-red-700 dark:hover:bg-red-600 text-white text-xs font-semibold cursor-pointer disabled:opacity-50 transition-colors"
                >
                  Apply <span className="font-mono-num">{pickedCount}</span> {pickedCount === 1 ? 'change' : 'changes'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
};

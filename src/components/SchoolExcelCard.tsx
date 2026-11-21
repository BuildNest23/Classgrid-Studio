import React, { useRef, useState } from 'react';
import { useClassroom } from '../context/ClassroomContext';
import { listShelf, loadFromShelf, saveToShelf, getActiveShelfId, defaultClassName } from '../utils/classShelf';
import { addSnapshot } from '../utils/history';
import { fileTitle, prettyDate, todayKey } from '../utils/helpers';
import { exportFileBlob } from '../utils/nativeFileExport';
import { buildSchoolSheets, planSchoolImport, SchoolClass, SchoolPlan } from '../collect/schoolSheet';
import { buildSchoolWorkbookBlob, readWorkbookSheets } from '../collect/schoolExcel';
import { FileSpreadsheet } from 'lucide-react';

const card = 'rounded-3xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-5';
const btn = 'w-full min-h-[48px] rounded-2xl bg-red-800 text-white font-bold cursor-pointer active:scale-[0.98] disabled:opacity-50';

export const SchoolExcelCard: React.FC = () => {
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
      const blob = await buildSchoolWorkbookBlob(built);
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
    } catch (e: any) {
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
    } catch (e: any) {
      toast(`Could not apply. ${e?.message || ''}`.trim(), 'error');
    } finally { setBusy(false); }
  };

  const pickedCount = loaded ? loaded.picked.size : 0;

  return (
    <div className={card}>
      <div className="w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-950/60 text-red-800 flex items-center justify-center"><FileSpreadsheet className="w-6 h-6" /></div>
      <h2 className="mt-3 text-lg font-black">School Excel for the principal</h2>
      <p className="text-sm text-stone-500 mt-1">All classes in one Excel file, one sheet per class, with every student detail. The principal can correct details, add students or delete rows, then send it back.</p>
      <button type="button" disabled={busy} onClick={doExport} className={`${btn} mt-4`}>{busy && !loaded ? 'Please wait…' : 'Export all classes to Excel'}</button>
      <input ref={ref} type="file" accept=".xlsx,.xls,.xlsm,.ods,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={e => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
      <button type="button" disabled={busy} onClick={() => ref.current?.click()} className="mt-2 w-full min-h-[48px] rounded-2xl bg-stone-100 dark:bg-stone-800 font-bold cursor-pointer active:scale-[0.98] disabled:opacity-50">Open principal's Excel (review changes)</button>
      {msg && <div className="mt-3 text-sm font-semibold text-red-700 dark:text-red-400">{msg}</div>}

      {loaded && (
        <div className="mt-4">
          {loaded.plan.notes.map((n, i) => <div key={i} className="text-xs text-amber-700 dark:text-amber-400 mb-1">{n}</div>)}
          {!loaded.plan.classes.some(c => c.items.length) && <div className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">No changes. Everything in this file matches the app ({loaded.plan.same} students).</div>}
          {loaded.plan.classes.filter(c => c.items.length).map(cp => (
            <div key={cp.classKey} className="mt-3">
              <div className="text-xs font-black uppercase tracking-wide text-stone-500 mb-1">{cp.className}</div>
              <div className="divide-y divide-stone-100 dark:divide-stone-800 rounded-xl border border-stone-200 dark:border-stone-800">
                {cp.items.map(i => {
                  const k = i.id + '@' + cp.classKey;
                  return (
                    <label key={k} className="flex items-start gap-3 px-3 py-2.5 cursor-pointer">
                      <input type="checkbox" className="mt-1 w-4 h-4" checked={loaded.picked.has(k)} onChange={() => toggle(k)} />
                      <div className="min-w-0">
                        <div className="text-sm font-bold">
                          {i.title}{' '}
                          <span className={`ml-1 text-[10px] font-black px-1.5 py-0.5 rounded ${i.kind === 'remove' ? 'bg-red-100 text-red-800' : i.kind === 'add' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{i.kind === 'remove' ? 'DELETED' : i.kind === 'add' ? 'NEW' : 'CHANGED'}</span>
                        </div>
                        <div className="text-xs text-stone-500 break-words">{i.detail}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
          {loaded.plan.classes.some(c => c.items.length) && (
            <>
              <p className="text-[11px] text-stone-500 mt-2">Deleted students are not ticked. Tick one only if the principal really wants that student removed.</p>
              <button type="button" disabled={busy || !pickedCount} onClick={apply} className={`${btn} mt-3`}>Apply {pickedCount} change{pickedCount === 1 ? '' : 's'}</button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

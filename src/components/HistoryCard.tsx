import React, { useCallback, useEffect, useState } from 'react';
import { useClassroom } from '../context/ClassroomContext';
import { addSnapshot, listSnapshots, loadSnapshot, Snapshot } from '../utils/history';
import { History, RotateCcw } from 'lucide-react';

/** Restore points for the open class (made automatically before a file changes it). */
export const HistoryCard: React.FC<{ refreshKey?: number }> = ({ refreshKey }) => {
  const { data, replaceAllData, uiConfirm, toast } = useClassroom();
  const [list, setList] = useState<Snapshot[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      return await listSnapshots(data.classId);
    } catch {
      return [] as Snapshot[];
    }
  }, [data.classId]);

  useEffect(() => {
    let cancelled = false;
    load().then(items => { if (!cancelled) setList(items); });
    return () => { cancelled = true; };
  }, [load, refreshKey]);

  const restore = async (s: Snapshot) => {
    if (busy) return;
    const ok = await uiConfirm(
      `Go back to how "${s.className || 'this class'}" was on ${new Date(s.at).toLocaleString()}?\n\nBefore: ${s.reason}\n\nWhat you have now is saved as a restore point first.`,
      { title: 'Restore', yesText: 'Restore', icon: 'warning' }
    );
    if (!ok) return;
    setBusy(true);
    try {
      const snap = await loadSnapshot(s.id);
      if (!snap) { toast('This restore point could not be read.', 'error'); return; }
      if (!(await addSnapshot(data, 'Before restore'))) { toast('Could not save your current data first, so nothing was changed.', 'error'); return; }
      replaceAllData({ ...snap, schoolLogo: data.schoolLogo || snap.schoolLogo });
      toast('Restored.', 'success');
      setList(await load());
    } finally { setBusy(false); }
  };

  if (!list || !list.length) return null;
  return (
    <section className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-5">
      <div className="flex items-center gap-2">
        <History className="w-4 h-4 text-stone-500 dark:text-stone-400" />
        <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100">Restore points</h2>
      </div>
      <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
        Saved automatically before a class file or Excel import modifies this class.
      </p>
      <div className="mt-3.5 divide-y divide-stone-100 dark:divide-stone-800">
        {list.map(s => (
          <div key={s.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-stone-900 dark:text-stone-100 truncate">{s.reason}</div>
              <div className="text-xs text-stone-500 dark:text-stone-400 font-mono-num mt-0.5">
                {new Date(s.at).toLocaleString()} · {s.students} students
              </div>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => restore(s)}
              className="min-h-[40px] px-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs font-semibold text-stone-800 dark:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-700 inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5 text-stone-400" />
              <span>Restore</span>
            </button>
          </div>
        ))}
      </div>
    </section>
  );
};

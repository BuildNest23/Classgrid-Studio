import React, { useCallback, useEffect, useState } from 'react';
import { useClassroom } from '../context/ClassroomContext';
import { addSnapshot, listSnapshots, loadSnapshot, Snapshot } from '../utils/history';
import { History } from 'lucide-react';

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
    <div className="rounded-3xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-5">
      <div className="flex items-center gap-2 font-black"><History className="w-5 h-5" />Restore points</div>
      <p className="text-xs text-stone-500 mt-1">Made automatically before a file changes this class. Tap Restore to go back.</p>
      <div className="mt-3 divide-y divide-stone-100 dark:divide-stone-800">
        {list.map(s => (
          <div key={s.id} className="flex items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold truncate">{s.reason}</div>
              <div className="text-xs text-stone-500">{new Date(s.at).toLocaleString()} • {s.students} students</div>
            </div>
            <button type="button" disabled={busy} onClick={() => restore(s)} className="min-h-[44px] px-3.5 py-2 rounded-xl bg-stone-100 dark:bg-stone-800 text-xs font-bold cursor-pointer disabled:opacity-50">Restore</button>
          </div>
        ))}
      </div>
    </div>
  );
};

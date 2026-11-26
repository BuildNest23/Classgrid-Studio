import React, { useRef, useState } from 'react';
import { useClassroom } from '../../context/ClassroomContext';
import { buildClassPackage, ensureClassId, serializeClassPackage, suggestedFileName } from '../../collect/classPackage';
import { parseTeacherUpdate, planTeacherUpdate, applyTeacherUpdate, UpdatePlan, TeacherUpdate } from '../../collect/teacherUpdate';
import { exportFileBlob } from '../../utils/nativeFileExport';
import { listShelf, loadFromShelf, saveToShelf, getActiveShelfId } from '../../utils/classShelf';
import { AppData } from '../../types';
import { addSnapshot } from '../../utils/history';
import { HistoryCard } from '../HistoryCard';
import { SchoolExcelCard } from '../SchoolExcelCard';
import { Send, Inbox } from 'lucide-react';

const card = 'rounded-3xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-5';
const btn = 'w-full min-h-[48px] rounded-2xl bg-red-800 text-white font-bold cursor-pointer active:scale-[0.98] disabled:opacity-50';

export const ClassFilesView: React.FC = () => {
  const { data, saveData, toast } = useClassroom();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [hk, setHk] = useState(0);
  const [loaded, setLoaded] = useState<{ upd: TeacherUpdate; plan: UpdatePlan; picked: Set<string>; fileName: string; shelf?: { id: string; name: string; data: AppData } } | null>(null);

  const sentVersion = (loaded?.shelf ? loaded.shelf.data.packageVersion : data.packageVersion) || 0;
  const ownVersion = data.packageVersion || 0;

  const send = async (forceFull: boolean) => {
    if (!data.className.trim()) { toast('Give the class a name first (Class Detail and Backup).', 'error'); return; }
    setBusy(true);
    try {
      const { classId, data: withId } = ensureClassId(data);
      const version = ownVersion + 1;
      const mode = forceFull || ownVersion === 0 ? 'full' : 'update';
      const pkg = buildClassPackage(withId, { mode, version });
      const blob = new Blob([serializeClassPackage(pkg)], { type: 'application/json' });
      const ok = await exportFileBlob(blob, suggestedFileName(pkg), { title: `Class file - ${data.className}`, dialogTitle: 'Send class file to teacher', preferShareOnWeb: true });
      if (ok) {
        saveData(prev => ({ ...prev, classId, packageVersion: version }));
        toast(`Class file v${version} ready.`, 'success');
      }
    } finally { setBusy(false); }
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setMsg(''); setLoaded(null);
    let text = '';
    try { text = await f.text(); } catch { setMsg('Could not read this file.'); return; }
    const { upd, error } = parseTeacherUpdate(text);
    if (!upd) { setMsg(error); return; }
    let target: AppData = data;
    let shelf: { id: string; name: string; data: AppData } | undefined;
    if (data.classId !== upd.classId) {
      // the update may belong to another class on this phone: handle it there, no switching needed
      try {
        for (const e of await listShelf()) {
          if (e.id === getActiveShelfId()) continue;
          const d = await loadFromShelf(e.id);
          if (d && d.classId === upd.classId) { shelf = { id: e.id, name: e.name, data: d }; target = d; break; }
        }
      } catch { /* ignore */ }
      if (!shelf) {
        setMsg(`This update is not for any class on this phone${upd.className ? ` (it is from "${upd.className}")` : ''}. The class file must have been sent from this phone.`);
        return;
      }
    }
    const plan = planTeacherUpdate(target, upd);
    setLoaded({ upd, plan, shelf, picked: new Set(plan.items.filter(i => i.state === 'new').map(i => i.id)), fileName: f.name });
  };

  const toggle = (id: string) => setLoaded(l => {
    if (!l) return l;
    const p = new Set(l.picked); p.has(id) ? p.delete(id) : p.add(id);
    return { ...l, picked: p };
  });

  const apply = async () => {
    if (!loaded || busy) return;
    setBusy(true);
    try {
      const n = loaded.picked.size;
      const reason = `Before teacher update (${loaded.upd.createdAt ? new Date(loaded.upd.createdAt).toLocaleDateString() : 'file'})`;
      if (loaded.shelf) {
        if (!(await addSnapshot(loaded.shelf.data, reason))) { toast('Could not make a restore point, so nothing was changed.', 'error'); return; }
        try {
          await saveToShelf(applyTeacherUpdate(loaded.shelf.data, loaded.plan, loaded.picked), { id: loaded.shelf.id, name: loaded.shelf.name });
        } catch (e: any) { toast(`Could not save. ${e?.message || ''}`.trim(), 'error'); return; }
      } else {
        if (!(await addSnapshot(data, reason))) { toast('Could not make a restore point, so nothing was changed.', 'error'); return; }
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
    <div className="space-y-3.5">
      <div className={card}>
        <div className="w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-950/60 text-red-800 flex items-center justify-center"><Send className="w-6 h-6" /></div>
        <h2 className="mt-3 text-lg font-black">Send class to teacher</h2>
        <p className="text-sm text-stone-500 mt-1">
          {ownVersion === 0
            ? 'First time: the teacher gets the whole class (students, exams, funds, old records).'
            : `Last sent: version ${ownVersion}. Sending again gives the teacher your latest students, exams and funds. Their own attendance and marks stay.`}
        </p>
        <button type="button" disabled={busy} onClick={() => send(false)} className={`${btn} mt-4`}>
          {ownVersion === 0 ? 'Send class file' : `Send updated class file (v${ownVersion + 1})`}
        </button>
        {ownVersion > 0 && (
          <button type="button" disabled={busy} onClick={() => send(true)} className="mt-2 w-full text-xs font-bold text-stone-500 underline cursor-pointer py-2">
            Send a full copy (for a new phone)
          </button>
        )}
      </div>

      <div className={card}>
        <div className="w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-950/60 text-red-800 flex items-center justify-center"><Inbox className="w-6 h-6" /></div>
        <h2 className="mt-3 text-lg font-black">Receive teacher update</h2>
        <p className="text-sm text-stone-500 mt-1">Open the update file the teacher sent. You choose what to add. Opening the same file twice does nothing new.</p>
        <input ref={ref} type="file" accept=".json,application/json" className="hidden" onChange={e => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
        <button type="button" onClick={() => ref.current?.click()} className={`${btn} mt-4`}>Choose update file</button>
        {msg && <div className="mt-3 text-sm font-semibold text-red-700 dark:text-red-400">{msg}</div>}
      </div>

      {loaded && (
        <div className={card}>
          <div className="font-black">{loaded.shelf ? loaded.shelf.name : (loaded.upd.className || 'Class')}{loaded.upd.from ? ` — ${loaded.upd.from}` : ''}</div>
          <div className="text-xs text-stone-500 mt-0.5">
            Teacher was on class file v{loaded.upd.baseVersion}{sentVersion && loaded.upd.baseVersion < sentVersion ? ` (you have sent v${sentVersion} since)` : ''} • {loaded.plan.same} item(s) already match
          </div>
          {!loaded.plan.items.length && <div className="mt-3 text-sm font-semibold text-emerald-700 dark:text-emerald-400">Nothing new. You already have everything in this file.</div>}
          {groups.map(g => (
            <div key={g} className="mt-3">
              <div className="text-xs font-black uppercase tracking-wide text-stone-500 mb-1">{g}</div>
              <div className="divide-y divide-stone-100 dark:divide-stone-800 rounded-xl border border-stone-200 dark:border-stone-800">
                {loaded.plan.items.filter(i => i.group === g).map(i => (
                  <label key={i.id} className="flex items-start gap-3 px-3 py-2.5 cursor-pointer">
                    <input type="checkbox" className="mt-1 w-4 h-4" checked={loaded.picked.has(i.id)} onChange={() => toggle(i.id)} />
                    <div className="min-w-0">
                      <div className="text-sm font-bold">{i.title} {i.state === 'conflict' && <span className="ml-1 text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">DIFFERENT</span>}</div>
                      <div className="text-xs text-stone-500">{i.detail}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          ))}
          {loaded.plan.items.some(i => i.state === 'conflict') && <p className="text-[11px] text-stone-500 mt-2">"Different" items are not ticked. Tick them only if the teacher's version should replace yours.</p>}
          {!!loaded.plan.items.length && (
            <button type="button" disabled={busy || !loaded.picked.size} onClick={apply} className={`${btn} mt-4`}>
              {busy ? 'Saving…' : `Add ${loaded.picked.size} item${loaded.picked.size === 1 ? '' : 's'}`}
            </button>
          )}
        </div>
      )}
      <SchoolExcelCard onApplied={() => setHk(k => k + 1)} />
      <HistoryCard refreshKey={hk} />
    </div>
  );
};

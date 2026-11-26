import React, { useRef, useState } from 'react';
import { useClassroom } from '../../context/ClassroomContext';
import { parseClassPackage, planClassPackage, applyClassPackage } from '../../collect/classPackage';
import { buildTeacherUpdate, updateFileName } from '../../collect/teacherUpdate';
import { exportFileBlob } from '../../utils/nativeFileExport';
import { addSnapshot } from '../../utils/history';
import { HistoryCard } from '../HistoryCard';
import { FileDown, Send } from 'lucide-react';

export const TeacherClassFile: React.FC = () => {
  const { data, saveData, replaceAllData, toast, uiConfirm, setActiveTab } = useClassroom();
  const ref = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);
  const hasClass = !!data.classId;

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setMsg('');
    let text = '';
    try { text = await f.text(); } catch { setMsg('Could not read this file.'); return; }
    const { pkg, error } = parseClassPackage(text);
    if (!pkg) { setMsg(error); return; }
    const plan = planClassPackage(hasClass ? data : null, pkg);
    if (plan.action === 'same' || plan.action === 'older' || plan.action === 'wrongClass' || plan.action === 'needsFull') {
      setMsg(plan.message); return;
    }
    let question = '';
    if (plan.action === 'new') {
      const local = data.students.length > 0;
      question = `Open class "${pkg.data.className || 'Class'}" with ${plan.studentsAdded} students?` +
        (local ? '\n\nThis phone already has other data. It will be replaced.' : '');
    } else {
      question = `Update to version ${pkg.version}?\n\n` +
        `New students: ${plan.studentsAdded}\nChanged: ${plan.studentsChanged}\nRemoved: ${plan.studentsRemoved}\n\nYour attendance and marks stay.`;
    }
    const ok = await uiConfirm(question, { title: plan.action === 'new' ? 'Open class file' : 'Update class', yesText: plan.action === 'new' ? 'Open' : 'Update', icon: 'info' });
    if (!ok) return;
    if (hasClass && !(await addSnapshot(data, `Before class file v${pkg.version}`))) { toast('Could not make a restore point, so nothing was changed.', 'error'); return; }
    replaceAllData(applyClassPackage(hasClass ? data : null, pkg));
    toast(plan.action === 'new' ? 'Class opened.' : 'Class updated.', 'success');
    setActiveTab('dashboard');
  };

  const sendUpdate = async () => {
    if (sending) return;
    const u = buildTeacherUpdate(data);
    if (!u) return;
    setSending(true);
    try {
      const blob = new Blob([JSON.stringify(u)], { type: 'application/json' });
      const ok = await exportFileBlob(blob, updateFileName(u), { title: `Update - ${u.className || 'Class'}`, dialogTitle: 'Send update to management', preferShareOnWeb: true });
      if (ok) {
        saveData(prev => prev.teacherLink ? { ...prev, teacherLink: { ...prev.teacherLink, lastSentAt: Date.now() } } : prev);
        toast('Update file ready.', 'success');
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-3.5">
    {hasClass && (
      <div className="rounded-3xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-5">
        <div className="w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-950/60 text-red-800 flex items-center justify-center"><Send className="w-6 h-6" /></div>
        <h2 className="mt-3 text-lg font-black">Send update to management</h2>
        <p className="text-sm text-stone-500 mt-1">Shares your attendance, marks and fund records as one file (WhatsApp, email…). Safe to send again anytime.</p>
        {data.teacherLink?.lastSentAt ? <p className="text-xs text-stone-400 mt-1">Last sent: {new Date(data.teacherLink.lastSentAt).toLocaleString()}</p> : null}
        <button type="button" disabled={sending} onClick={sendUpdate} className="mt-4 w-full min-h-[48px] rounded-2xl bg-red-800 text-white font-bold cursor-pointer active:scale-[0.98] disabled:opacity-60">{sending ? 'Preparing...' : 'Send update'}</button>
      </div>
    )}
    <div className="rounded-3xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-5">
      <div className="w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-950/60 text-red-800 flex items-center justify-center"><FileDown className="w-6 h-6" /></div>
      <h2 className="mt-3 text-lg font-black">{hasClass ? 'Update class file' : 'Open class file'}</h2>
      <p className="text-sm text-stone-500 mt-1">
        {hasClass
          ? `You have version ${data.teacherLink?.version ?? 1}. When management sends a newer class file, open it here. Your attendance and marks stay.`
          : 'Choose the class file management sent you.'}
      </p>
      <input ref={ref} type="file" accept=".json,application/json" className="hidden" onChange={e => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
      <button type="button" onClick={() => ref.current?.click()}
        className="mt-4 w-full min-h-[48px] rounded-2xl bg-red-800 text-white font-bold cursor-pointer active:scale-[0.98]">Choose file</button>
      {msg && <div className="mt-3 text-sm font-semibold text-red-700 dark:text-red-400">{msg}</div>}
    </div>
    {hasClass && <HistoryCard />}
    </div>
  );
};

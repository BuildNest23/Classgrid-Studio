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
      question = `Update class from this file?\n\n` +
        `New students: ${plan.studentsAdded}\nChanged: ${plan.studentsChanged}\nRemoved: ${plan.studentsRemoved}\n\nYour attendance and marks stay.`;
    }
    const ok = await uiConfirm(question, { title: plan.action === 'new' ? 'Open class file' : 'Update class', yesText: plan.action === 'new' ? 'Open' : 'Update', icon: 'info' });
    if (!ok) return;
    if (hasClass && !(await addSnapshot(data, 'Before class file update'))) { toast('Could not make a restore point, so nothing was changed.', 'error'); return; }
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
    <div className="cg-view-enter space-y-5">
      {/* Masthead */}
      <div>
        <p className="text-xs font-medium text-stone-500 dark:text-stone-400">
          {hasClass ? `${data.className || 'Class'} · Linked` : 'Teacher sync'}
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-50 mt-0.5">
          Class file
        </h1>
      </div>

      <div className={`grid grid-cols-1 ${hasClass ? 'lg:grid-cols-2' : ''} gap-4`}>
        {hasClass && (
          <section className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-5 flex flex-col justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-stone-100 dark:bg-stone-800 text-red-800 dark:text-red-400 flex items-center justify-center shrink-0">
                <Send className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">Send update to management</h2>
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-1 leading-relaxed">
                  Share your attendance, marks, and fund records as one file via WhatsApp or email. Safe to send again anytime.
                </p>
                {data.teacherLink?.lastSentAt ? (
                  <p className="text-xs text-stone-500 dark:text-stone-400 mt-2 font-mono-num">
                    Last sent: {new Date(data.teacherLink.lastSentAt).toLocaleString()}
                  </p>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              disabled={sending}
              onClick={sendUpdate}
              className="w-full min-h-[44px] px-4 rounded-xl bg-red-800 hover:bg-red-900 dark:bg-red-700 dark:hover:bg-red-600 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
            >
              <Send className="w-4 h-4" />
              <span>{sending ? 'Preparing…' : 'Send update file'}</span>
            </button>
          </section>
        )}

        <section className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-5 flex flex-col justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-stone-100 dark:bg-stone-800 text-red-800 dark:text-red-400 flex items-center justify-center shrink-0">
              <FileDown className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">
                {hasClass ? 'Update class file' : 'Open class file'}
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-1 leading-relaxed">
                {hasClass
                  ? 'Open a newer class file from management here to update your roster, exams, and funds without losing your attendance or marks.'
                  : 'Choose the class file sent by school management to load your roster, exams, and funds.'}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <input
              ref={ref}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={e => { onFile(e.target.files?.[0]); e.target.value = ''; }}
            />
            <button
              type="button"
              onClick={() => ref.current?.click()}
              className={`w-full min-h-[44px] px-4 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                hasClass
                  ? 'border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-700'
                  : 'bg-red-800 hover:bg-red-900 dark:bg-red-700 dark:hover:bg-red-600 text-white'
              }`}
            >
              <FileDown className="w-4 h-4" />
              <span>Choose class file</span>
            </button>
            {msg && <div className="text-xs font-semibold text-red-700 dark:text-red-400">{msg}</div>}
          </div>
        </section>
      </div>

      {hasClass && <HistoryCard />}
    </div>
  );
};

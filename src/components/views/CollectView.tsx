import React, { useRef, useState } from 'react';
import { useClassroom } from '../../context/ClassroomContext';
import { getPrintStyleBundle } from '../../utils/printEngine';
import { PRINT_SIZES, todayKey } from '../../utils/helpers';
import { exportFileBlob } from '../../utils/nativeFileExport';
import {
  FIELD_DEFS, DEFAULT_CHOICES, FieldChoices, FieldMode, FieldKey,
  buildStudentFile, studentsForFile, parseReturn, planReturn, applyChanges, applyAdditions, PlannedAddition,
  loadLog, logSent, logReturn, clearLog, removeLogEntry, ReturnFile, ReturnPlan, PlannedChange, SentRecord,
} from '../../collect/collect';
import { buildMarksFile, studentsForMarks, planMarksReturn, applyMarks, MarksPlan, PlannedMark } from '../../collect/marks';
import { buildViewFile, VIEW_STUDENT_COLS, ViewStudentCol } from '../../collect/view';
import { buildDailyFile, planDailyReturn, applyDaily, DailyMode, DAILY_TEST_MAX } from '../../collect/daily';
import { Send, Inbox, ListChecks, Plus, Trash2, Upload, Check } from 'lucide-react';

type Tab = 'send' | 'receive' | 'requests';

const showDaily = (mode: 'attendance' | 'test' | undefined, v: string) =>
  mode === 'attendance' ? ({ P: 'Present', A: 'Absent', L: 'Leave' } as Record<string, string>)[v] || v : mode === 'test' && v === 'A' ? 'Absent' : v;

interface Loaded {
  id: string;
  fileName: string;
  ret: ReturnFile;
  plan: ReturnPlan;
  marks?: MarksPlan;
  picked: Set<string>;
  applied: boolean;
}

const MODE_LABEL: Record<FieldMode, string> = { off: 'Hide', show: 'View only', edit: 'Editable' };

export const CollectView: React.FC<{ limit?: 'marks'; embedded?: boolean }> = ({ limit, embedded = false }) => {
  const { data, saveData, toast, uiConfirm, buildPrintHeaderHTML, computeAssessmentRanking } = useClassroom();
  const [tab, setTab] = useState<Tab>('send');

  // ---- Send ----
  const [choices, setChoices] = useState<FieldChoices>(() => ({ ...DEFAULT_CHOICES }));
  const [note, setNote] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [allowAddPick, setAllowAddPick] = useState(false);
  const [busy, setBusy] = useState(false);
  const [what, setWhat] = useState<'students' | 'marks' | 'view' | 'daily'>(limit === 'marks' ? 'marks' : 'students');
  const [asmtId, setAsmtId] = useState('');
  const [subIds, setSubIds] = useState<string[]>([]);
  const [showFather, setShowFather] = useState(false);
  const [remarks, setRemarks] = useState(false);
  const [vCols, setVCols] = useState<ViewStudentCol[]>(['phone']);
  const [vAsm, setVAsm] = useState<string[]>([]);
  const [vAtt, setVAtt] = useState(false);
  const [dMode, setDMode] = useState<DailyMode>('attendance');
  const [dDates, setDDates] = useState<string[]>([todayKey()]);
  const [dFather, setDFather] = useState(false);

  const asmt = data.assessments.find(a => a.id === asmtId) || null;
  const pickAsmt = (id: string) => {
    setAsmtId(id);
    const a = data.assessments.find(x => x.id === id);
    setSubIds(a ? a.subjects.map(x => x.id) : []);
  };
  const marksOpts = { assessmentId: asmtId, subjectIds: subIds, showFather, remarks, note, onlyMissing };
  const marksCount = asmt ? studentsForMarks(data, marksOpts).length : 0;
  const allowAdd = allowAddPick || data.students.length === 0;
  const opts = { choices, note, onlyMissing, allowAdd };
  const count = studentsForFile(data, opts).length;
  const editNames = FIELD_DEFS.filter(f => choices[f.key] === 'edit').map(f => f.label);

  const setMode = (k: FieldKey, m: FieldMode) => setChoices(c => ({ ...c, [k]: m }));

  const sendDaily = async () => {
    if (!data.students.length) { toast('Add students first.', 'error'); return; }
    const dates = dDates.filter(Boolean);
    if (!dates.length) { toast('Pick at least one date.', 'error'); return; }
    setBusy(true);
    try {
      const { css, caps } = getPrintStyleBundle();
      const mult = (PRINT_SIZES[data.printSize] || PRINT_SIZES.m).mult;
      const built = buildDailyFile(data, { mode: dMode, dates, showFather: dFather, note }, undefined,
        { header: buildPrintHeaderHTML('Student List'), css, caps, mult });
      const label = dMode === 'attendance' ? 'attendance' : 'daily_test';
      const ok = await exportFileBlob(new Blob([built.html], { type: 'text/html' }), `${data.className || 'Class'}_${label}_${built.requestId}.html`, {
        title: `${data.className || 'Class'} ${label.replace('_', ' ')}`,
        dialogTitle: 'Send the form',
        preferShareOnWeb: true,
      });
      if (ok) {
        logSent({ requestId: built.requestId, createdAt: Date.now(), className: data.className || '', count: built.count, fields: built.fields, what: `${dMode === 'attendance' ? 'Attendance' : 'Daily test'}: ${built.dates.join(', ')}` });
        toast('File ready. Send it to the teacher.', 'success');
      }
    } catch (e: any) {
      toast(e?.message || 'Could not create the file.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const sendView = async () => {
    if (!data.students.length) { toast('Add students first.', 'error'); return; }
    setBusy(true);
    try {
      const { css, caps } = getPrintStyleBundle();
      const mult = (PRINT_SIZES[data.printSize] || PRINT_SIZES.m).mult;
      const built = buildViewFile(
        data, { studentCols: vCols, assessmentIds: vAsm, attendance: vAtt, note },
        computeAssessmentRanking, { header: buildPrintHeaderHTML('Student List'), css, caps, mult },
      );
      const name = `${data.className || 'Class'}_class_copy_${built.requestId}.html`;
      const ok = await exportFileBlob(new Blob([built.html], { type: 'text/html' }), name, {
        title: `${data.className || 'Class'} class copy`,
        dialogTitle: 'Send the class copy',
        preferShareOnWeb: true,
      });
      if (ok) toast('File ready. Send it to the teacher.', 'success');
    } catch (e: any) {
      toast(e?.message || 'Could not create the file.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const sendMarks = async () => {
    if (!data.students.length) { toast('Add students first.', 'error'); return; }
    if (!asmt) { toast('Choose an assessment.', 'error'); return; }
    if (!subIds.length) { toast('Tick at least one subject.', 'error'); return; }
    if (!marksCount) { toast('Every student already has marks. Untick "Only students without marks".', 'error'); return; }
    setBusy(true);
    try {
      const { css, caps } = getPrintStyleBundle();
      const mult = (PRINT_SIZES[data.printSize] || PRINT_SIZES.m).mult;
      const built = buildMarksFile(data, marksOpts, undefined, { header: buildPrintHeaderHTML(`${asmt.name} - Marks`), css, caps, mult });
      const name = `${data.className || 'Class'}_${asmt.name}_marks_${built.requestId}.html`;
      const ok = await exportFileBlob(new Blob([built.html], { type: 'text/html' }), name, {
        title: `${data.className || 'Class'} ${asmt.name} marks`,
        dialogTitle: 'Send the marks form',
        preferShareOnWeb: true,
      });
      if (ok) {
        logSent({ requestId: built.requestId, createdAt: Date.now(), className: data.className || '', count: built.count, fields: built.fields, what: `${asmt.name}: ${built.subjectNames.join(', ')}${remarks ? ' + remarks' : ''}` });
        toast('File ready. Send it to the teacher.', 'success');
      }
    } catch (e: any) {
      toast(e?.message || 'Could not create the file.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const sendFile = async () => {
    if (!allowAdd && !data.students.length) { toast('Add students first.', 'error'); return; }
    if (!allowAdd && !count) { toast('No student matches. Untick "Only students with an empty box".', 'error'); return; }
    setBusy(true);
    try {
      const { css, caps } = getPrintStyleBundle();
      const mult = (PRINT_SIZES[data.printSize] || PRINT_SIZES.m).mult;
      const built = buildStudentFile(data, opts, undefined, { header: buildPrintHeaderHTML('Student List'), css, caps, mult });
      const name = `${data.className || 'Class'}_students_${built.requestId}.html`;
      const ok = await exportFileBlob(new Blob([built.html], { type: 'text/html' }), name, {
        title: `${data.className || 'Class'} student list`,
        dialogTitle: 'Send the student list form',
        preferShareOnWeb: true,
      });
      if (ok) {
        logSent({ requestId: built.requestId, createdAt: Date.now(), className: data.className || '', count: built.count, fields: built.fields });
        toast('File ready. Send it to the teacher.', 'success');
      }
    } catch (e: any) {
      toast(e?.message || 'Could not create the file.', 'error');
    } finally {
      setBusy(false);
    }
  };

  // ---- Receive ----
  const [loaded, setLoaded] = useState<Loaded[]>([]);
  const [pasted, setPasted] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const addText = (text: string, fileName: string) => {
    const ret = parseReturn(text);
    if (limit === 'marks' && ret.kind !== 'marks') {
      throw new Error('Only marks forms can be imported here.');
    }
    const plan = planReturn(data, ret);
    const marks = ret.kind === 'marks' ? planMarksReturn(data, ret) : ret.kind === 'daily' ? planDailyReturn(data, ret) : undefined;
    const picked = new Set<string>([
      ...(marks ? marks.changes : plan.changes).filter(c => !c.conflict && !c.invalid).map(c => c.key),
      ...(marks ? [] : plan.additions.filter(a => !a.invalid && !a.duplicateOf).map(a => a.key)),
    ]);
    setLoaded(prev => {
      const others = prev.filter(l => l.ret.requestId !== ret.requestId);
      const old = prev.find(l => l.ret.requestId === ret.requestId);
      if (old && old.ret.revision > ret.revision) return prev;
      return [...others, { id: ret.requestId + ':' + ret.revision, fileName, ret, plan, marks, picked, applied: false }];
    });
  };

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    e.target.value = '';
    let ok = 0;
    for (const f of files) {
      try { addText(await f.text(), f.name); ok++; }
      catch (err: any) { toast(`${f.name}: ${err?.message || 'could not be read'}`, 'error'); }
    }
    if (ok) toast(`${ok} file${ok === 1 ? '' : 's'} read.`, 'success');
  };

  const readPasted = () => {
    try { addText(pasted, 'pasted text'); setPasted(''); toast('Read.', 'success'); }
    catch (err: any) { toast(err?.message || 'Could not read that text.', 'error'); }
  };

  const toggle = (li: number, key: string) =>
    setLoaded(ls => ls.map((l, i) => {
      if (i !== li) return l;
      const p = new Set(l.picked);
      p.has(key) ? p.delete(key) : p.add(key);
      return { ...l, picked: p };
    }));
  const setAll = (li: number, on: boolean) =>
    setLoaded(ls => ls.map((l, i) => i !== li ? l : { ...l, picked: new Set(on ? [...(l.marks ? l.marks.changes : l.plan.changes).filter(c => !c.invalid).map(c => c.key), ...(l.marks ? [] : l.plan.additions.filter(a => !a.invalid).map(a => a.key))] : []) }));

  const apply = (li: number) => {
    const l = loaded[li];
    if (l.marks && l.marks.daily) {
      const chosenD = l.marks.changes.filter(c => l.picked.has(c.key) && !c.invalid);
      if (!chosenD.length) { toast('Nothing ticked.', 'info'); return; }
      const dm = l.marks.daily;
      saveData(prev => applyDaily(prev, dm, chosenD));
      logReturn(l.ret.requestId, l.ret, chosenD.length, { className: l.ret.className });
      setLoaded(ls => ls.map((x, i) => i === li ? { ...x, applied: true } : x));
      setLog(loadLog());
      toast(`${chosenD.length} entr${chosenD.length === 1 ? 'y' : 'ies'} applied. You can Undo.`, 'success');
      return;
    }
    if (l.marks && l.marks.assessment) {
      const chosenM = l.marks.changes.filter(c => l.picked.has(c.key) && !c.invalid);
      if (!chosenM.length) { toast('Nothing ticked.', 'info'); return; }
      const aid = l.marks.assessment.id;
      saveData(prev => applyMarks(prev, aid, chosenM));
      logReturn(l.ret.requestId, l.ret, chosenM.length, { className: l.ret.className });
      setLoaded(ls => ls.map((x, i) => i === li ? { ...x, applied: true } : x));
      setLog(loadLog());
      toast(`${chosenM.length} mark${chosenM.length === 1 ? '' : 's'} applied. You can Undo.`, 'success');
      return;
    }
    const chosen = l.plan.changes.filter(c => l.picked.has(c.key) && !c.invalid);
    const chosenAdd = l.plan.additions.filter(a => l.picked.has(a.key) && !a.invalid);
    if (!chosen.length && !chosenAdd.length) { toast('Nothing ticked.', 'info'); return; }
    const res = applyChanges(data.students, chosen);
    if (res.problem) { toast(res.problem, 'error'); return; }
    saveData(prev => ({ ...prev, students: applyAdditions(applyChanges(prev.students, chosen).students, chosenAdd) }));
    const total = chosen.length + chosenAdd.length;
    logReturn(l.ret.requestId, l.ret, total, { className: l.ret.className });
    setLoaded(ls => ls.map((x, i) => i === li ? { ...x, applied: true } : x));
    setLog(loadLog());
    toast(`${chosenAdd.length ? `${chosenAdd.length} student${chosenAdd.length === 1 ? '' : 's'} added` + (chosen.length ? `, ${chosen.length} change${chosen.length === 1 ? '' : 's'} applied` : '') : `${chosen.length} change${chosen.length === 1 ? '' : 's'} applied`}. You can Undo.`, 'success');
  };

  // ---- Requests ----
  const [log, setLog] = useState<SentRecord[]>(() => loadLog());

  const card = 'bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-5';
  const inputCls =
    'w-full min-h-[42px] px-3 py-2 text-xs rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:border-red-700 dark:focus:border-red-500';
  const labelCls = 'block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1';
  const primaryBtn =
    'w-full min-h-[44px] px-4 rounded-xl text-xs font-semibold bg-red-800 hover:bg-red-900 dark:bg-red-700 dark:hover:bg-red-600 text-white inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50';

  const fmt = (n: number) => (n ? new Date(n).toLocaleDateString() : '—');

  return (
    <div className={`${embedded ? '' : 'cg-view-enter'} space-y-4`}>
      {!embedded && (
        <div>
          <p className="text-xs font-medium text-stone-500 dark:text-stone-400">
            {data.className || 'Class'} · Shareable HTML forms
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-50 mt-0.5">
            {limit === 'marks' ? 'Marks forms' : 'Quick forms'}
          </h1>
        </div>
      )}

      {/* Sub-navigation: Send / Receive / Sent log */}
      <div className="inline-flex w-full sm:w-auto p-1 rounded-xl bg-stone-200/70 dark:bg-stone-900 border border-stone-200 dark:border-stone-800">
        {([
          { key: 'send', label: 'Send form', icon: Send },
          { key: 'receive', label: 'Receive return', icon: Inbox },
          { key: 'requests', label: 'Sent log', icon: ListChecks },
        ] as const).map(({ key, label, icon: Icon }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                setTab(key);
                if (key === 'requests') setLog(loadLog());
              }}
              className={`flex-1 sm:flex-initial min-h-[38px] px-3.5 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                active
                  ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-50 shadow-xs'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${active ? 'text-red-800 dark:text-red-400' : ''}`} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      {/* Form Type Switcher (only in Send tab when not limited to marks) */}
      {tab === 'send' && !limit && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {([
            { key: 'students', label: 'Student details', desc: 'Collect or update roster info' },
            { key: 'marks', label: 'Exam marks', desc: 'Subject marks & remarks' },
            { key: 'daily', label: 'Daily register', desc: 'Attendance or 10-mark test' },
            { key: 'view', label: 'Read-only copy', desc: 'View & print snapshot' },
          ] as const).map(item => {
            const active = what === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => { setWhat(item.key); setOnlyMissing(false); }}
                className={`text-left p-3 rounded-xl border transition-colors cursor-pointer ${
                  active
                    ? 'border-red-800/40 bg-red-50/60 dark:bg-red-950/25 dark:border-red-900/60'
                    : 'border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 hover:border-stone-300 dark:hover:border-stone-700'
                }`}
              >
                <div className={`text-xs font-bold ${active ? 'text-red-900 dark:text-red-300' : 'text-stone-900 dark:text-stone-100'}`}>
                  {item.label}
                </div>
                <div className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5 leading-snug">
                  {item.desc}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* SEND: MARKS */}
      {tab === 'send' && what === 'marks' && (
        <div className={`${card} space-y-4`}>
          <div>
            <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100">Marks entry form</h2>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              Generates an offline HTML form showing Roll # and Name so a subject teacher can type marks on their phone and send back a return file.
            </p>
          </div>
          {data.assessments.length === 0 ? (
            <div className="text-xs text-stone-500 dark:text-stone-400 py-4 text-center">
              Create an assessment in Results first.
            </div>
          ) : (
            <>
              <div>
                <label className={labelCls}>Assessment</label>
                <select value={asmtId} onChange={e => pickAsmt(e.target.value)} className={inputCls}>
                  <option value="">Choose an assessment…</option>
                  {data.assessments.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              {asmt && (
                <div className="rounded-xl border border-stone-200 dark:border-stone-800 divide-y divide-stone-100 dark:divide-stone-800">
                  {asmt.subjects.map(sb => (
                    <label key={sb.id} className="px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-800/50">
                      <span className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          className="w-4 h-4 accent-red-800 dark:accent-red-500"
                          checked={subIds.includes(sb.id)}
                          onChange={() => setSubIds(c => c.includes(sb.id) ? c.filter(x => x !== sb.id) : [...c, sb.id])}
                        />
                        <span className="font-semibold text-stone-900 dark:text-stone-100">{sb.name}</span>
                      </span>
                      <span className="text-stone-500 dark:text-stone-400 font-mono-num">
                        {sb.max ? `/${sb.max}` : 'No max'}
                      </span>
                    </label>
                  ))}
                  {asmt.subjects.length === 0 && (
                    <div className="p-3 text-xs text-stone-500 dark:text-stone-400">This assessment has no subjects yet.</div>
                  )}
                </div>
              )}
              {asmt?.locked && (
                <div className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                  This assessment is locked. Unlock it in Results before applying returned marks.
                </div>
              )}
              <div className="space-y-2">
                <label className="flex items-center gap-2.5 text-xs font-medium text-stone-800 dark:text-stone-200 cursor-pointer">
                  <input type="checkbox" checked={remarks} onChange={e => setRemarks(e.target.checked)} className="w-4 h-4 accent-red-800 dark:accent-red-500" />
                  <span>Include remarks column</span>
                </label>
                <label className="flex items-center gap-2.5 text-xs font-medium text-stone-800 dark:text-stone-200 cursor-pointer">
                  <input type="checkbox" checked={showFather} onChange={e => setShowFather(e.target.checked)} className="w-4 h-4 accent-red-800 dark:accent-red-500" />
                  <span>Show Father Name alongside student name</span>
                </label>
                <label className="flex items-center gap-2.5 text-xs font-medium text-stone-800 dark:text-stone-200 cursor-pointer">
                  <input type="checkbox" checked={onlyMissing} onChange={e => setOnlyMissing(e.target.checked)} className="w-4 h-4 accent-red-800 dark:accent-red-500" />
                  <span>Only include students missing marks</span>
                </label>
              </div>
              <div>
                <label className={labelCls}>Note for the teacher (optional)</label>
                <textarea rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Please return by Friday." className={`${inputCls} min-h-[64px]`} />
              </div>
              <div className="text-xs text-stone-600 dark:text-stone-400 rounded-xl bg-stone-50 dark:bg-stone-950/60 border border-stone-200/70 dark:border-stone-800 p-3 font-mono-num">
                <strong className="text-stone-900 dark:text-stone-100">{marksCount}</strong> student{marksCount === 1 ? '' : 's'} · <strong className="text-stone-900 dark:text-stone-100">{subIds.length}</strong> subject{subIds.length === 1 ? '' : 's'} included. Existing marks are pre-filled.
              </div>
              <button type="button" disabled={busy} onClick={sendMarks} className={primaryBtn}>
                <Send className="w-4 h-4" />
                <span>Share or save form</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* SEND: DAILY */}
      {tab === 'send' && what === 'daily' && (
        <div className={`${card} space-y-4`}>
          <div>
            <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100">Attendance or daily test form</h2>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              Teacher sees Roll # and Name only. Attendance uses P / A / L buttons; daily tests are scored out of {DAILY_TEST_MAX}.
            </p>
          </div>
          <div className="inline-flex p-1 rounded-xl bg-stone-100 dark:bg-stone-800 border border-stone-200/70 dark:border-stone-700/70">
            {(['attendance', 'test'] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setDMode(m)}
                className={`min-h-[36px] px-4 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  dMode === m
                    ? 'bg-red-800 dark:bg-red-700 text-white'
                    : 'text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100'
                }`}
              >
                {m === 'attendance' ? 'Attendance' : 'Daily test'}
              </button>
            ))}
          </div>
          <div className="space-y-2">
            <label className={labelCls}>Dates (up to 7)</label>
            {dDates.map((dt, i) => (
              <div key={i} className="flex gap-2">
                <input
                  type="date"
                  value={dt}
                  onChange={e => setDDates(ds => ds.map((x, j) => j === i ? e.target.value : x))}
                  className={`${inputCls} flex-1 font-mono-num`}
                />
                {dDates.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setDDates(ds => ds.filter((_, j) => j !== i))}
                    aria-label="Remove date"
                    className="min-h-[42px] w-[42px] rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-500 hover:text-red-700 dark:hover:text-red-400 inline-flex items-center justify-center cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
            {dDates.length < 7 && (
              <button
                type="button"
                onClick={() => setDDates(ds => [...ds, todayKey()])}
                className="min-h-[38px] px-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs font-semibold text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add date</span>
              </button>
            )}
          </div>
          <label className="flex items-center gap-2.5 text-xs font-medium text-stone-800 dark:text-stone-200 cursor-pointer">
            <input type="checkbox" checked={dFather} onChange={e => setDFather(e.target.checked)} className="w-4 h-4 accent-red-800 dark:accent-red-500" />
            <span>Show Father Name alongside student name</span>
          </label>
          <div>
            <label className={labelCls}>Note for the teacher (optional)</label>
            <textarea rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Please return by 10 am." className={`${inputCls} min-h-[64px]`} />
          </div>
          <button type="button" disabled={busy} onClick={sendDaily} className={primaryBtn}>
            <Send className="w-4 h-4" />
            <span>Share or save form</span>
          </button>
        </div>
      )}

      {/* SEND: READ-ONLY VIEW */}
      {tab === 'send' && what === 'view' && (
        <div className={`${card} space-y-4`}>
          <div>
            <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100">Read-only class copy</h2>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              Creates a view-and-print HTML snapshot from today. The recipient cannot modify records. Funds and daily tests are never included.
            </p>
          </div>
          <div className="rounded-xl border border-stone-200 dark:border-stone-800 p-3.5 space-y-2.5">
            <div className="text-xs font-semibold text-stone-700 dark:text-stone-300">
              Extra student columns (Roll #, Adm. No, Name &amp; Father Name always shown)
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {VIEW_STUDENT_COLS.map(c => (
                <label key={c.key} className="flex items-center gap-2 text-xs font-medium text-stone-800 dark:text-stone-200 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-red-800 dark:accent-red-500"
                    checked={vCols.includes(c.key)}
                    onChange={() => setVCols(v => v.includes(c.key) ? v.filter(x => x !== c.key) : [...v, c.key])}
                  />
                  <span>{c.label}</span>
                </label>
              ))}
            </div>
          </div>
          {data.assessments.length > 0 && (
            <div className="rounded-xl border border-stone-200 dark:border-stone-800 p-3.5 space-y-2">
              <div className="text-xs font-semibold text-stone-700 dark:text-stone-300">Results to include</div>
              <div className="space-y-1.5">
                {data.assessments.map(a => (
                  <label key={a.id} className="flex items-center gap-2 text-xs font-medium text-stone-800 dark:text-stone-200 cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-4 h-4 accent-red-800 dark:accent-red-500"
                      checked={vAsm.includes(a.id)}
                      onChange={() => setVAsm(v => v.includes(a.id) ? v.filter(x => x !== a.id) : [...v, a.id])}
                    />
                    <span>{a.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          <label className="flex items-center gap-2.5 text-xs font-medium text-stone-800 dark:text-stone-200 cursor-pointer">
            <input type="checkbox" checked={vAtt} onChange={e => setVAtt(e.target.checked)} className="w-4 h-4 accent-red-800 dark:accent-red-500" />
            <span>Include monthly attendance summary (Present / Absent / Leave)</span>
          </label>
          <div>
            <label className={labelCls}>Note (optional)</label>
            <textarea rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Copy for your records." className={`${inputCls} min-h-[64px]`} />
          </div>
          <button type="button" disabled={busy} onClick={sendView} className={primaryBtn}>
            <Send className="w-4 h-4" />
            <span>Share or save copy</span>
          </button>
        </div>
      )}

      {/* SEND: STUDENTS */}
      {tab === 'send' && what === 'students' && (
        <div className={`${card} space-y-4`}>
          <div>
            <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100">Student details form</h2>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              Choose which fields are hidden, view-only, or editable in the teacher's form.
            </p>
          </div>

          <div className="rounded-xl border border-stone-200 dark:border-stone-800 divide-y divide-stone-100 dark:divide-stone-800">
            {FIELD_DEFS.map(f => {
              const modes: FieldMode[] = f.canBeOff ? ['off', 'show', 'edit'] : ['show', 'edit'];
              return (
                <div key={f.key} className="px-3.5 py-2.5 flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-stone-800 dark:text-stone-200 w-28">{f.label}</span>
                  <div className="inline-flex p-0.5 rounded-lg bg-stone-100 dark:bg-stone-800 border border-stone-200/70 dark:border-stone-700">
                    {modes.map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMode(f.key, m)}
                        className={`min-h-[32px] px-2.5 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                          choices[f.key] === m
                            ? 'bg-red-800 dark:bg-red-700 text-white'
                            : 'text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100'
                        }`}
                      >
                        {MODE_LABEL[m]}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div>
            <label className={labelCls}>Note for the teacher (optional)</label>
            <textarea
              rows={2}
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. Please fill in missing phone numbers and addresses."
              className={`${inputCls} min-h-[64px]`}
            />
          </div>

          {data.students.length === 0 ? (
            <div className="text-xs rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-900/50 text-amber-900 dark:text-amber-300 p-3 leading-relaxed">
              This class has no students yet. The teacher can add students directly inside the form using any column marked View only or Editable.
            </div>
          ) : (
            <div className="space-y-2">
              <label className="flex items-center gap-2.5 text-xs font-medium text-stone-800 dark:text-stone-200 cursor-pointer">
                <input type="checkbox" checked={allowAddPick} onChange={e => setAllowAddPick(e.target.checked)} className="w-4 h-4 accent-red-800 dark:accent-red-500" />
                <span>Allow teacher to add new students</span>
              </label>
              {editNames.length > 0 && (
                <label className="flex items-center gap-2.5 text-xs font-medium text-stone-800 dark:text-stone-200 cursor-pointer">
                  <input type="checkbox" checked={onlyMissing} onChange={e => setOnlyMissing(e.target.checked)} className="w-4 h-4 accent-red-800 dark:accent-red-500" />
                  <span>Only include students with an empty editable field</span>
                </label>
              )}
            </div>
          )}

          <div className="text-xs text-stone-600 dark:text-stone-400 rounded-xl bg-stone-50 dark:bg-stone-950/60 border border-stone-200/70 dark:border-stone-800 p-3">
            <strong className="text-stone-900 dark:text-stone-100 font-mono-num">{count}</strong> student{count === 1 ? '' : 's'} included
            {allowAdd ? ' (teacher can also add new students)' : ''}.{' '}
            {editNames.length ? (
              <>Editable: <strong className="text-stone-900 dark:text-stone-100">{editNames.join(', ')}</strong>.</>
            ) : (
              <>View and print only.</>
            )}
          </div>

          <button type="button" disabled={busy} onClick={sendFile} className={primaryBtn}>
            <Send className="w-4 h-4" />
            <span>Share or save form</span>
          </button>
        </div>
      )}

      {/* RECEIVE */}
      {tab === 'receive' && (
        <div className="space-y-4">
          <div className={`${card} space-y-3.5`}>
            <div>
              <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100">Open returned form</h2>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                Select one or more returned .txt, .json, or saved .html files to review changes before applying.
              </p>
            </div>
            <input ref={fileRef} type="file" accept=".txt,.json,.html,text/plain,application/json,text/html" multiple onChange={handleFiles} className="hidden" />
            <button type="button" onClick={() => fileRef.current?.click()} className={primaryBtn}>
              <Upload className="w-4 h-4" />
              <span>Choose returned file(s)</span>
            </button>
            <details className="pt-1">
              <summary className="text-xs font-semibold text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200 cursor-pointer select-none">
                Or paste text from WhatsApp / Copy
              </summary>
              <div className="mt-2 space-y-2">
                <textarea
                  rows={3}
                  value={pasted}
                  onChange={e => setPasted(e.target.value)}
                  placeholder="Paste text sent by teacher…"
                  className={`${inputCls} min-h-[76px]`}
                />
                <button
                  type="button"
                  onClick={readPasted}
                  className="min-h-[40px] px-4 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs font-semibold text-stone-800 dark:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-700 cursor-pointer"
                >
                  Read pasted text
                </button>
              </div>
            </details>
          </div>

          {loaded.map((l, li) => {
            if (l.marks) {
              const m = l.marks;
              const pk = m.changes.filter(c => l.picked.has(c.key) && !c.invalid).length;
              return (
                <div key={l.id} className={`${card} space-y-3`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2 flex-wrap">
                        <span>{m.daily ? (m.daily === 'attendance' ? 'Attendance' : 'Daily test') : 'Marks'} from {l.ret.from || 'teacher'}</span>
                        {l.applied && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                            <Check className="w-3.5 h-3.5" /> Applied
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-stone-500 dark:text-stone-400 font-mono-num mt-0.5">
                        {m.daily ? '' : (l.ret.assessmentName || 'Assessment') + ' · '}
                        {l.ret.className || 'Class'} · {l.ret.requestId} · v{l.ret.revision} · {l.fileName}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setLoaded(ls => ls.filter((_, i) => i !== li))}
                      className="text-xs font-semibold text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 cursor-pointer shrink-0"
                    >
                      Dismiss
                    </button>
                  </div>

                  {m.problem && <div className="text-xs font-semibold text-red-700 dark:text-red-400">{m.problem}</div>}
                  {!m.problem && (m.missing > 0 || m.alreadySame > 0) && (
                    <div className="text-xs text-stone-500 dark:text-stone-400">
                      {m.missing > 0 && <>{m.missing} skipped (student or subject removed). </>}
                      {m.alreadySame > 0 && <>{m.alreadySame} already match.</>}
                    </div>
                  )}
                  {!m.problem && m.changes.length === 0 && (
                    <div className="text-xs text-stone-500 dark:text-stone-400 py-2">Nothing to update from this file.</div>
                  )}

                  {m.changes.length > 0 && (
                    <div className="divide-y divide-stone-100 dark:divide-stone-800 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden">
                      {m.changes.map((c: PlannedMark) => (
                        <label
                          key={c.key}
                          className={`flex items-start gap-3 px-3.5 py-2.5 text-xs cursor-pointer ${c.invalid ? 'opacity-50' : ''} ${
                            c.conflict ? 'bg-amber-50/70 dark:bg-amber-950/25' : ''
                          }`}
                        >
                          <input
                            type="checkbox"
                            disabled={!!c.invalid || l.applied}
                            checked={l.picked.has(c.key)}
                            onChange={() => toggle(li, c.key)}
                            className="w-4 h-4 mt-0.5 accent-red-800 dark:accent-red-500 shrink-0"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="font-semibold text-stone-900 dark:text-stone-100">
                              {c.studentId === '' ? `Total marks · ${c.subName}` : c.studentName}
                            </span>
                            {c.studentId !== '' && (
                              <span className="text-stone-500 dark:text-stone-400 font-mono-num">
                                {' '}· Roll {c.roll || '—'} · {c.subName}{c.max ? ` (/${c.max})` : ''}
                              </span>
                            )}
                            <span className="block mt-0.5 font-mono-num">
                              <span className="text-stone-400 line-through">{showDaily(m.daily, c.current) || '—'}</span>
                              {' → '}
                              <strong className="text-red-800 dark:text-red-400">
                                {c.studentId === ''
                                  ? `${c.to} marks`
                                  : c.to === ''
                                  ? 'Clear'
                                  : c.subId === '_remark'
                                  ? c.to
                                  : m.daily === 'attendance'
                                  ? showDaily('attendance', c.to)
                                  : c.to === 'A'
                                  ? 'Absent'
                                  : c.to}
                              </strong>
                            </span>
                            {c.conflict && (
                              <span className="block text-[11px] text-amber-800 dark:text-amber-300 mt-0.5">
                                Changed locally since sending (was "{c.from || '—'}"). Tick only to overwrite.
                              </span>
                            )}
                            {c.invalid && <span className="block text-[11px] text-red-700 dark:text-red-400 mt-0.5">{c.invalid}</span>}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}

                  {!l.applied && m.changes.length > 0 && (
                    <div className="flex items-center gap-2 pt-1 flex-wrap">
                      <button type="button" onClick={() => setAll(li, true)} className="min-h-[40px] px-3 text-xs font-semibold rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-700 dark:text-stone-200 cursor-pointer">
                        Select all
                      </button>
                      <button type="button" onClick={() => setAll(li, false)} className="min-h-[40px] px-3 text-xs font-semibold rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-700 dark:text-stone-200 cursor-pointer">
                        Clear
                      </button>
                      <button
                        type="button"
                        disabled={!pk}
                        onClick={() => apply(li)}
                        className="flex-1 min-h-[42px] px-4 text-xs font-semibold rounded-xl bg-red-800 hover:bg-red-900 dark:bg-red-700 dark:hover:bg-red-600 text-white disabled:opacity-50 cursor-pointer"
                      >
                        Apply <span className="font-mono-num">{pk}</span> {m.daily ? (pk === 1 ? 'entry' : 'entries') : (pk === 1 ? 'mark' : 'marks')}
                      </button>
                    </div>
                  )}
                </div>
              );
            }

            const picked =
              l.plan.changes.filter(c => l.picked.has(c.key) && !c.invalid).length +
              l.plan.additions.filter(a => l.picked.has(a.key) && !a.invalid).length;
            const rolls = l.plan.changes.filter(c => c.field === 'rollNo');
            const others = l.plan.changes.filter(c => c.field !== 'rollNo');

            const renderRow = (c: PlannedChange) => {
              const label = FIELD_DEFS.find(f => f.key === c.field)?.label || c.field;
              return (
                <label
                  key={c.key}
                  className={`flex items-start gap-3 px-3.5 py-2.5 text-xs cursor-pointer ${c.invalid ? 'opacity-50' : ''} ${
                    c.conflict ? 'bg-amber-50/70 dark:bg-amber-950/25' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    disabled={!!c.invalid || l.applied}
                    checked={l.picked.has(c.key)}
                    onChange={() => toggle(li, c.key)}
                    className="w-4 h-4 mt-0.5 accent-red-800 dark:accent-red-500 shrink-0"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold text-stone-900 dark:text-stone-100">{c.studentName}</span>
                    <span className="text-stone-500 dark:text-stone-400 font-mono-num"> · Roll {c.roll || '—'} · {label}</span>
                    <span className="block break-words mt-0.5">
                      <span className="text-stone-400 line-through">{c.current || '—'}</span>
                      {' → '}
                      <strong className="text-red-800 dark:text-red-400">{c.to || '—'}</strong>
                    </span>
                    {c.conflict && (
                      <span className="block text-[11px] text-amber-800 dark:text-amber-300 mt-0.5">
                        Changed locally since sending (was "{c.from || '—'}"). Tick only to overwrite.
                      </span>
                    )}
                    {c.invalid && <span className="block text-[11px] text-red-700 dark:text-red-400 mt-0.5">{c.invalid}</span>}
                  </span>
                </label>
              );
            };

            return (
              <div key={l.id} className={`${card} space-y-3`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2 flex-wrap">
                      <span>From {l.ret.from || 'teacher'}</span>
                      {l.applied && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                          <Check className="w-3.5 h-3.5" /> Applied
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-stone-500 dark:text-stone-400 font-mono-num mt-0.5">
                      {l.ret.className || 'Class'} · {l.ret.requestId} · v{l.ret.revision} · {l.fileName}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLoaded(ls => ls.filter((_, i) => i !== li))}
                    className="text-xs font-semibold text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 cursor-pointer shrink-0"
                  >
                    Dismiss
                  </button>
                </div>

                {(l.plan.missing > 0 || l.plan.alreadySame > 0) && (
                  <div className="text-xs text-stone-500 dark:text-stone-400">
                    {l.plan.missing > 0 && <>{l.plan.missing} skipped (student no longer in class). </>}
                    {l.plan.alreadySame > 0 && <>{l.plan.alreadySame} already match.</>}
                  </div>
                )}

                {l.plan.changes.length === 0 && l.plan.additions.length === 0 ? (
                  <div className="text-xs text-stone-500 dark:text-stone-400 py-2">Nothing to update from this file.</div>
                ) : (
                  <div className="space-y-3">
                    {rolls.length > 0 && (
                      <div>
                        <div className="text-xs font-bold text-red-800 dark:text-red-400 mb-1">
                          Roll number changes ({rolls.length})
                        </div>
                        <p className="text-[11px] text-stone-500 dark:text-stone-400 mb-1.5">
                          Applied together so students can safely swap roll numbers.
                        </p>
                        <div className="divide-y divide-stone-100 dark:divide-stone-800 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden">
                          {rolls.map(renderRow)}
                        </div>
                      </div>
                    )}
                    {l.plan.additions.length > 0 && (
                      <div>
                        <div className="text-xs font-bold text-red-800 dark:text-red-400 mb-1">
                          New students ({l.plan.additions.length})
                        </div>
                        <p className="text-[11px] text-stone-500 dark:text-stone-400 mb-1.5">
                          Added at the end of the roster with sequential roll numbers.
                        </p>
                        <div className="divide-y divide-stone-100 dark:divide-stone-800 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden">
                          {l.plan.additions.map((a: PlannedAddition) => (
                            <label
                              key={a.key}
                              className={`flex items-start gap-3 px-3.5 py-2.5 text-xs cursor-pointer ${a.invalid ? 'opacity-50' : ''} ${
                                a.duplicateOf ? 'bg-amber-50/70 dark:bg-amber-950/25' : ''
                              }`}
                            >
                              <input
                                type="checkbox"
                                disabled={!!a.invalid || l.applied}
                                checked={l.picked.has(a.key)}
                                onChange={() => toggle(li, a.key)}
                                className="w-4 h-4 mt-0.5 accent-red-800 dark:accent-red-500 shrink-0"
                              />
                              <span className="min-w-0 flex-1">
                                <span className="font-semibold text-stone-900 dark:text-stone-100">{a.name || '(no name)'}</span>
                                <span className="text-stone-500 dark:text-stone-400">
                                  {[a.fatherName && ` · s/o ${a.fatherName}`, a.admissionNo && ` · Adm. ${a.admissionNo}`, a.phone && ` · ${a.phone}`, a.address && ` · ${a.address}`, a.occupation && ` · ${a.occupation}`].filter(Boolean).join('')}
                                </span>
                                {a.duplicateOf && (
                                  <span className="block text-[11px] text-amber-800 dark:text-amber-300 mt-0.5">
                                    A student with the same name and father name already exists. Tick only if distinct.
                                  </span>
                                )}
                                {a.invalid && <span className="block text-[11px] text-red-700 dark:text-red-400 mt-0.5">{a.invalid}</span>}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                    {others.length > 0 && (
                      <div>
                        <div className="text-xs font-bold text-stone-700 dark:text-stone-300 mb-1.5">
                          Field updates ({others.length})
                        </div>
                        <div className="divide-y divide-stone-100 dark:divide-stone-800 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden">
                          {others.map(renderRow)}
                        </div>
                      </div>
                    )}
                    {!l.applied && (
                      <div className="flex items-center gap-2 pt-1 flex-wrap">
                        <button type="button" onClick={() => setAll(li, true)} className="min-h-[40px] px-3 text-xs font-semibold rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-700 dark:text-stone-200 cursor-pointer">
                          Select all
                        </button>
                        <button type="button" onClick={() => setAll(li, false)} className="min-h-[40px] px-3 text-xs font-semibold rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-700 dark:text-stone-200 cursor-pointer">
                          Clear
                        </button>
                        <button
                          type="button"
                          disabled={!picked}
                          onClick={() => apply(li)}
                          className="flex-1 min-h-[42px] px-4 text-xs font-semibold rounded-xl bg-red-800 hover:bg-red-900 dark:bg-red-700 dark:hover:bg-red-600 text-white disabled:opacity-50 cursor-pointer"
                        >
                          Apply <span className="font-mono-num">{picked}</span> {picked === 1 ? 'item' : 'items'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* REQUESTS LOG */}
      {tab === 'requests' && (
        <div className={`${card} space-y-3`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100">Sent forms log</h2>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                Kept locally on this device to track which forms have been returned.
              </p>
            </div>
            {log.length > 0 && (
              <button
                type="button"
                onClick={async () => {
                  const ok = await uiConfirm(
                    'Clear all entries from the sent forms log on this device?\n\nThis only clears the log list and will not affect any student, marks, or attendance records.',
                    { title: 'Clear sent log', yesText: 'Clear log', danger: true, icon: 'warning' }
                  );
                  if (!ok) return;
                  clearLog();
                  setLog([]);
                  toast('Sent log cleared.', 'success');
                }}
                className="min-h-[38px] px-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs font-semibold text-stone-600 dark:text-stone-300 hover:text-red-700 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-900/60 hover:bg-red-50/50 dark:hover:bg-red-950/30 inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear log</span>
              </button>
            )}
          </div>
          {log.length === 0 ? (
            <div className="text-xs text-stone-500 dark:text-stone-400 py-6 text-center">No forms sent yet.</div>
          ) : (
            <div className="divide-y divide-stone-100 dark:divide-stone-800 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden">
              {log.map(r => {
                const fillIn = r.what
                  ? [r.what]
                  : Object.keys(r.fields || {})
                      .filter(k => r.fields[k] === 'edit')
                      .map(k => FIELD_DEFS.find(f => f.key === k)?.label || k);
                return (
                  <div key={r.requestId} className="px-3.5 py-3 text-xs flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="font-semibold text-stone-900 dark:text-stone-100 font-mono-num">
                        {r.className || 'Class'} · {r.count ?? '?'} students · {r.requestId}
                      </div>
                      <div className="text-stone-500 dark:text-stone-400">
                        Sent {fmt(r.createdAt)}{fillIn.length ? ` · ${fillIn.join(', ')}` : ' · View & print only'}
                      </div>
                      <div className={r.returns.length ? 'text-emerald-700 dark:text-emerald-400 font-semibold' : 'text-stone-400 dark:text-stone-500'}>
                        {r.returns.length
                          ? r.returns.map(x => `Returned by ${x.from || 'teacher'} (${x.applied} applied, ${fmt(x.receivedAt)})`).join(' · ')
                          : 'Awaiting return'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        removeLogEntry(r.requestId);
                        setLog(loadLog());
                      }}
                      title="Remove from log"
                      aria-label="Remove from log"
                      className="w-9 h-9 rounded-lg text-stone-400 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 inline-flex items-center justify-center transition-colors cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

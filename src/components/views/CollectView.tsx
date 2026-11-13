import React, { useRef, useState } from 'react';
import { useClassroom } from '../../context/ClassroomContext';
import { getPrintStyleBundle } from '../../utils/printEngine';
import { PRINT_SIZES, todayKey } from '../../utils/helpers';
import { HowItWorks } from '../HowItWorks';
import { exportFileBlob } from '../../utils/nativeFileExport';
import {
  FIELD_DEFS, DEFAULT_CHOICES, FieldChoices, FieldMode, FieldKey,
  buildStudentFile, studentsForFile, parseReturn, planReturn, applyChanges,
  loadLog, logSent, logReturn, ReturnFile, ReturnPlan, PlannedChange, SentRecord,
} from '../../collect/collect';
import { buildMarksFile, studentsForMarks, planMarksReturn, applyMarks, MarksPlan, PlannedMark } from '../../collect/marks';
import { buildViewFile, VIEW_STUDENT_COLS, ViewStudentCol } from '../../collect/view';
import { buildDailyFile, planDailyReturn, applyDaily, DailyMode, DAILY_TEST_MAX } from '../../collect/daily';
import { Send, Inbox, ListChecks } from 'lucide-react';

type Tab = 'send' | 'receive' | 'requests';

const showDaily = (mode: 'attendance' | 'test' | undefined, v: string) =>
  mode === 'attendance' ? ({ P: 'Present', A: 'Absent', L: 'Leave' } as Record<string, string>)[v] || v : mode === 'test' && v === 'A' ? 'Absent' : v;

interface Loaded { id: string; fileName: string; ret: ReturnFile; plan: ReturnPlan; marks?: MarksPlan; picked: Set<string>; applied: boolean }

const MODE_LABEL: Record<FieldMode, string> = { off: 'Leave out', show: 'Show only', edit: 'Teacher fills in' };

export const CollectView: React.FC = () => {
  const { data, saveData, toast, buildPrintHeaderHTML, computeAssessmentRanking } = useClassroom();
  const [tab, setTab] = useState<Tab>('send');

  // ---- Send ----
  const [choices, setChoices] = useState<FieldChoices>(() => ({ ...DEFAULT_CHOICES }));
  const [note, setNote] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [what, setWhat] = useState<'students' | 'marks' | 'view' | 'daily'>('students');
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
  const opts = { choices, note, onlyMissing };
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
    if (!data.students.length) { toast('Add students first.', 'error'); return; }
    if (!count) { toast('No student matches. Untick "Only students with an empty box".', 'error'); return; }
    setBusy(true);
    try {
      const { css, caps } = getPrintStyleBundle();
      const mult = (PRINT_SIZES[data.printSize] || PRINT_SIZES.m).mult;
      const built = buildStudentFile(data, opts, undefined, { header: buildPrintHeaderHTML('Student List'), css, caps, mult });
      const name = `${data.className || 'Class'}_students_${built.requestId}.html`;
      const ok = await exportFileBlob(new Blob([built.html], { type: 'text/html' }), name, {
        title: `${data.className || 'Class'} student list`,
        dialogTitle: 'Send the student list form',
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
    const plan = planReturn(data, ret);
    const marks = ret.kind === 'marks' ? planMarksReturn(data, ret) : ret.kind === 'daily' ? planDailyReturn(data, ret) : undefined;
    const picked = new Set((marks ? marks.changes : plan.changes).filter(c => !c.conflict && !c.invalid).map(c => c.key));
    setLoaded(prev => {
      // same request sent again: keep only the newest version
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
    setLoaded(ls => ls.map((l, i) => i !== li ? l : { ...l, picked: new Set(on ? (l.marks ? l.marks.changes : l.plan.changes).filter(c => !c.invalid).map(c => c.key) : []) }));

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
    if (!chosen.length) { toast('Nothing ticked.', 'info'); return; }
    const res = applyChanges(data.students, chosen);
    if (res.problem) { toast(res.problem, 'error'); return; }
    saveData(prev => ({ ...prev, students: applyChanges(prev.students, chosen).students }));
    logReturn(l.ret.requestId, l.ret, chosen.length, { className: l.ret.className });
    setLoaded(ls => ls.map((x, i) => i === li ? { ...x, applied: true } : x));
    setLog(loadLog());
    toast(`${chosen.length} change${chosen.length === 1 ? '' : 's'} applied. You can Undo.`, 'success');
  };

  // ---- Requests ----
  const [log, setLog] = useState<SentRecord[]>(() => loadLog());

  const card = 'bg-white dark:bg-[#1C1917] border border-[#E7E5E4] dark:border-[#44403C] rounded-2xl p-4 shadow-xs';
  const tabBtn = (t: Tab, label: string, Icon: any) => (
    <button
      type="button"
      onClick={() => { setTab(t); if (t === 'requests') setLog(loadLog()); }}
      className={`flex-1 py-2 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer ${
        tab === t ? 'bg-[#B91C1C] text-white' : 'bg-[#F5F5F4] dark:bg-[#292524] text-[#1C1917] dark:text-[#F5F5F4]'
      }`}
    >
      <Icon className="w-3.5 h-3.5" />{label}
    </button>
  );

  const fmt = (n: number) => (n ? new Date(n).toLocaleDateString() : '—');

  return (
    <div className="space-y-3">
      <HowItWorks
        id="collect"
        title="About Send & Receive"
        steps={[
          <><b>Send:</b> choose what the teacher sees and which boxes they fill in. You get one file to share (WhatsApp, etc.).</>,
          <>The teacher opens it on their phone, types, and taps <b>Send</b>. They can also print the list from the same file, any time.</>,
          <><b>Receive:</b> open the file they send back, tick the changes you want, and apply them.</>,
        ]}
      />

      <div className="flex gap-2">
        {tabBtn('send', 'Send', Send)}
        {tabBtn('receive', 'Receive', Inbox)}
        {tabBtn('requests', 'Requests', ListChecks)}
      </div>

      {tab === 'send' && (
        <div className="flex rounded-xl overflow-hidden border border-[#D6D3D1] dark:border-[#44403C]">
          {(['students', 'marks', 'daily', 'view'] as const).map(w => (
            <button key={w} type="button" onClick={() => { setWhat(w); setOnlyMissing(false); }}
              className={`flex-1 py-2 text-xs font-bold cursor-pointer ${what === w ? 'bg-[#1C1917] text-white dark:bg-[#F5F5F4] dark:text-[#1C1917]' : 'bg-white dark:bg-[#0C0A09] text-[#1C1917] dark:text-[#F5F5F4]'}`}>
              {w === 'students' ? 'Students' : w === 'marks' ? 'Marks' : w === 'daily' ? 'Daily' : 'Copy'}
            </button>
          ))}
        </div>
      )}

      {tab === 'send' && what === 'marks' && (
        <div className={`${card} space-y-3`}>
          <div>
            <h2 className="text-base font-bold text-[#1C1917] dark:text-[#F5F5F4]">Marks for a teacher</h2>
            <div className="text-xs text-[#78716C] dark:text-[#A8A29E]">The teacher sees Roll # and name only, and types the marks.</div>
          </div>
          {data.assessments.length === 0 ? (
            <div className="text-xs text-[#78716C] dark:text-[#A8A29E] py-3 text-center">Create an assessment in Results first.</div>
          ) : (
            <>
              <div>
                <label className="block text-[10.5px] font-bold text-[#78716C] dark:text-[#A8A29E] uppercase tracking-wide mb-1">Assessment</label>
                <select value={asmtId} onChange={e => pickAsmt(e.target.value)}
                  className="w-full p-2 text-xs rounded-xl border border-[#D6D3D1] dark:border-[#44403C] bg-white dark:bg-[#0C0A09] text-inherit">
                  <option value="">Choose…</option>
                  {data.assessments.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              {asmt && (
                <div className="rounded-xl border border-[#E7E5E4] dark:border-[#44403C] divide-y divide-[#E7E5E4] dark:divide-[#44403C]">
                  {asmt.subjects.map(sb => (
                    <label key={sb.id} className="p-2.5 flex items-center gap-2 text-xs cursor-pointer">
                      <input type="checkbox" className="w-4 h-4 accent-[#B91C1C]" checked={subIds.includes(sb.id)}
                        onChange={() => setSubIds(c => c.includes(sb.id) ? c.filter(x => x !== sb.id) : [...c, sb.id])} />
                      <span className="font-bold text-[#1C1917] dark:text-[#F5F5F4]">{sb.name}</span>
                      <span className="text-[#78716C] dark:text-[#A8A29E]">{sb.max ? `out of ${sb.max}` : 'no max set'}</span>
                    </label>
                  ))}
                  {asmt.subjects.length === 0 && <div className="p-2.5 text-xs text-[#78716C]">This assessment has no subjects yet.</div>}
                </div>
              )}
              {asmt?.locked && <div className="text-[11px] text-[#92400E] dark:text-[#FCD34D]">This assessment is locked. You will need to unlock it before applying returned marks.</div>}
              <label className="flex items-center gap-2 text-xs font-semibold text-[#1C1917] dark:text-[#F5F5F4] cursor-pointer">
                <input type="checkbox" checked={remarks} onChange={e => setRemarks(e.target.checked)} className="w-4 h-4 accent-[#B91C1C]" />
                Teacher also writes a remark for each student
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold text-[#1C1917] dark:text-[#F5F5F4] cursor-pointer">
                <input type="checkbox" checked={showFather} onChange={e => setShowFather(e.target.checked)} className="w-4 h-4 accent-[#B91C1C]" />
                Also show Father Name
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold text-[#1C1917] dark:text-[#F5F5F4] cursor-pointer">
                <input type="checkbox" checked={onlyMissing} onChange={e => setOnlyMissing(e.target.checked)} className="w-4 h-4 accent-[#B91C1C]" />
                Only students without marks
              </label>
              <div>
                <label className="block text-[10.5px] font-bold text-[#78716C] dark:text-[#A8A29E] uppercase tracking-wide mb-1">Message for the teacher (optional)</label>
                <textarea rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Please send by Friday."
                  className="w-full p-2 text-xs rounded-xl border border-[#D6D3D1] dark:border-[#44403C] bg-white dark:bg-[#0C0A09] text-inherit" />
              </div>
              <div className="text-xs text-[#78716C] dark:text-[#A8A29E] rounded-xl bg-[#FAFAF9] dark:bg-[#0C0A09] p-2.5">
                <b>{marksCount}</b> student{marksCount === 1 ? '' : 's'} · <b>{subIds.length}</b> subject{subIds.length === 1 ? '' : 's'} in the file. Marks already in the app are shown to the teacher.
              </div>
              <button type="button" disabled={busy} onClick={sendMarks}
                className="w-full py-2.5 text-xs font-bold rounded-xl bg-[#B91C1C] text-white hover:bg-[#991B1B] disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5">
                <Send className="w-4 h-4" /> Share / Save the file
              </button>
            </>
          )}
        </div>
      )}

      {tab === 'send' && what === 'daily' && (
        <div className={`${card} space-y-3`}>
          <div>
            <h2 className="text-base font-bold text-[#1C1917] dark:text-[#F5F5F4]">Attendance or daily test for a teacher</h2>
            <div className="text-xs text-[#78716C] dark:text-[#A8A29E]">The teacher sees Roll # and name only. Attendance uses P / A / L buttons; a daily test is marked out of {DAILY_TEST_MAX}.</div>
          </div>
          <div className="flex rounded-xl overflow-hidden border border-[#D6D3D1] dark:border-[#44403C]">
            {(['attendance', 'test'] as const).map(m => (
              <button key={m} type="button" onClick={() => setDMode(m)}
                className={`flex-1 py-2 text-xs font-bold cursor-pointer ${dMode === m ? 'bg-[#B91C1C] text-white' : 'bg-white dark:bg-[#0C0A09] text-[#1C1917] dark:text-[#F5F5F4]'}`}>
                {m === 'attendance' ? 'Attendance' : 'Daily test'}
              </button>
            ))}
          </div>
          <div className="space-y-2">
            <div className="text-[10.5px] font-bold text-[#78716C] dark:text-[#A8A29E] uppercase tracking-wide">Dates (up to 7)</div>
            {dDates.map((dt, i) => (
              <div key={i} className="flex gap-2">
                <input type="date" value={dt} onChange={e => setDDates(ds => ds.map((x, j) => j === i ? e.target.value : x))}
                  className="flex-1 p-2 text-xs rounded-xl border border-[#D6D3D1] dark:border-[#44403C] bg-white dark:bg-[#0C0A09] text-inherit" />
                {dDates.length > 1 && (
                  <button type="button" onClick={() => setDDates(ds => ds.filter((_, j) => j !== i))}
                    className="px-3 text-xs font-bold rounded-xl bg-[#F5F5F4] dark:bg-[#292524] text-[#1C1917] dark:text-[#F5F5F4] cursor-pointer">Remove</button>
                )}
              </div>
            ))}
            {dDates.length < 7 && (
              <button type="button" onClick={() => setDDates(ds => [...ds, todayKey()])}
                className="py-2 px-3 text-xs font-bold rounded-xl bg-[#F5F5F4] dark:bg-[#292524] text-[#1C1917] dark:text-[#F5F5F4] cursor-pointer">+ Add another date</button>
            )}
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold text-[#1C1917] dark:text-[#F5F5F4] cursor-pointer">
            <input type="checkbox" checked={dFather} onChange={e => setDFather(e.target.checked)} className="w-4 h-4 accent-[#B91C1C]" />
            Also show Father Name
          </label>
          <div>
            <label className="block text-[10.5px] font-bold text-[#78716C] dark:text-[#A8A29E] uppercase tracking-wide mb-1">Message for the teacher (optional)</label>
            <textarea rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Please send by 10 am."
              className="w-full p-2 text-xs rounded-xl border border-[#D6D3D1] dark:border-[#44403C] bg-white dark:bg-[#0C0A09] text-inherit" />
          </div>
          <button type="button" disabled={busy} onClick={sendDaily}
            className="w-full py-2.5 text-xs font-bold rounded-xl bg-[#B91C1C] text-white hover:bg-[#991B1B] disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5">
            <Send className="w-4 h-4" /> Share / Save the file
          </button>
        </div>
      )}

      {tab === 'send' && what === 'view' && (
        <div className={`${card} space-y-3`}>
          <div>
            <h2 className="text-base font-bold text-[#1C1917] dark:text-[#F5F5F4]">Read-only copy of the class</h2>
            <div className="text-xs text-[#78716C] dark:text-[#A8A29E]">The teacher can look at it and print it, but cannot change anything. It is a snapshot from today.</div>
          </div>
          <div className="rounded-xl border border-[#E7E5E4] dark:border-[#44403C] p-2.5 space-y-2">
            <div className="text-[10.5px] font-bold text-[#78716C] dark:text-[#A8A29E] uppercase tracking-wide">Students (Roll #, Adm. No, Name, Father Name always shown)</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {VIEW_STUDENT_COLS.map(c => (
                <label key={c.key} className="flex items-center gap-1.5 text-xs font-semibold text-[#1C1917] dark:text-[#F5F5F4] cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 accent-[#B91C1C]" checked={vCols.includes(c.key)}
                    onChange={() => setVCols(v => v.includes(c.key) ? v.filter(x => x !== c.key) : [...v, c.key])} />
                  {c.label}
                </label>
              ))}
            </div>
          </div>
          {data.assessments.length > 0 && (
            <div className="rounded-xl border border-[#E7E5E4] dark:border-[#44403C] p-2.5 space-y-2">
              <div className="text-[10.5px] font-bold text-[#78716C] dark:text-[#A8A29E] uppercase tracking-wide">Results to include</div>
              {data.assessments.map(a => (
                <label key={a.id} className="flex items-center gap-2 text-xs font-semibold text-[#1C1917] dark:text-[#F5F5F4] cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 accent-[#B91C1C]" checked={vAsm.includes(a.id)}
                    onChange={() => setVAsm(v => v.includes(a.id) ? v.filter(x => x !== a.id) : [...v, a.id])} />
                  {a.name}
                </label>
              ))}
            </div>
          )}
          <label className="flex items-center gap-2 text-xs font-semibold text-[#1C1917] dark:text-[#F5F5F4] cursor-pointer">
            <input type="checkbox" checked={vAtt} onChange={e => setVAtt(e.target.checked)} className="w-4 h-4 accent-[#B91C1C]" />
            Include attendance summary (Present / Absent / Leave per month)
          </label>
          <div className="text-[11px] text-[#78716C] dark:text-[#A8A29E]">Funds and daily tests are never included.</div>
          <div>
            <label className="block text-[10.5px] font-bold text-[#78716C] dark:text-[#A8A29E] uppercase tracking-wide mb-1">Message (optional)</label>
            <textarea rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Copy for your records."
              className="w-full p-2 text-xs rounded-xl border border-[#D6D3D1] dark:border-[#44403C] bg-white dark:bg-[#0C0A09] text-inherit" />
          </div>
          <button type="button" disabled={busy} onClick={sendView}
            className="w-full py-2.5 text-xs font-bold rounded-xl bg-[#B91C1C] text-white hover:bg-[#991B1B] disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5">
            <Send className="w-4 h-4" /> Share / Save the file
          </button>
        </div>
      )}

      {tab === 'send' && what === 'students' && (
        <div className={`${card} space-y-3`}>
          <div>
            <h2 className="text-base font-bold text-[#1C1917] dark:text-[#F5F5F4]">Student list for a teacher</h2>
            <div className="text-xs text-[#78716C] dark:text-[#A8A29E]">Choose what each box does in the teacher's file.</div>
          </div>

          <div className="rounded-xl border border-[#E7E5E4] dark:border-[#44403C] divide-y divide-[#E7E5E4] dark:divide-[#44403C]">
            {FIELD_DEFS.map(f => {
              const modes: FieldMode[] = f.canBeOff ? ['off', 'show', 'edit'] : ['show', 'edit'];
              return (
                <div key={f.key} className="p-2.5 flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs font-bold text-[#1C1917] dark:text-[#F5F5F4] w-24">{f.label}</span>
                  <div className="flex rounded-lg overflow-hidden border border-[#D6D3D1] dark:border-[#44403C]">
                    {modes.map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMode(f.key, m)}
                        className={`px-2.5 py-1.5 text-[11px] font-bold cursor-pointer ${
                          choices[f.key] === m ? 'bg-[#B91C1C] text-white' : 'bg-white dark:bg-[#0C0A09] text-[#1C1917] dark:text-[#F5F5F4]'
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
            <label className="block text-[10.5px] font-bold text-[#78716C] dark:text-[#A8A29E] uppercase tracking-wide mb-1">Message for the teacher (optional)</label>
            <textarea
              rows={2}
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. Please add phone numbers and addresses."
              className="w-full p-2 text-xs rounded-xl border border-[#D6D3D1] dark:border-[#44403C] bg-white dark:bg-[#0C0A09] text-inherit"
            />
          </div>

          {editNames.length > 0 && (
            <label className="flex items-center gap-2 text-xs font-semibold text-[#1C1917] dark:text-[#F5F5F4] cursor-pointer">
              <input type="checkbox" checked={onlyMissing} onChange={e => setOnlyMissing(e.target.checked)} className="w-4 h-4 accent-[#B91C1C]" />
              Only students with an empty box to fill
            </label>
          )}

          <div className="text-xs text-[#78716C] dark:text-[#A8A29E] rounded-xl bg-[#FAFAF9] dark:bg-[#0C0A09] p-2.5">
            <b>{count}</b> student{count === 1 ? '' : 's'} in the file.{' '}
            {editNames.length
              ? <>Teacher fills in: <b>{editNames.join(', ')}</b>.</>
              : <>No boxes to fill in: the teacher can only view and print.</>}
            {choices.rollNo === 'edit' && <> They can also correct roll numbers.</>}
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={sendFile}
            className="w-full py-2.5 text-xs font-bold rounded-xl bg-[#B91C1C] text-white hover:bg-[#991B1B] disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Send className="w-4 h-4" /> Share / Save the file
          </button>
        </div>
      )}

      {tab === 'receive' && (
        <div className="space-y-3">
          <div className={`${card} space-y-3`}>
            <div>
              <h2 className="text-base font-bold text-[#1C1917] dark:text-[#F5F5F4]">Open what the teacher sent back</h2>
              <div className="text-xs text-[#78716C] dark:text-[#A8A29E]">The .json or .txt file, or their saved copy of the form (.html).</div>
            </div>
            <input ref={fileRef} type="file" accept=".json,.txt,.html,application/json,text/plain,text/html" multiple onChange={handleFiles} className="hidden" />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full py-2.5 text-xs font-bold rounded-xl bg-[#B91C1C] text-white hover:bg-[#991B1B] cursor-pointer"
            >
              Choose file(s)
            </button>
            <details>
              <summary className="text-xs font-bold text-[#78716C] dark:text-[#A8A29E] cursor-pointer">Or paste the text they copied</summary>
              <textarea
                rows={3}
                value={pasted}
                onChange={e => setPasted(e.target.value)}
                className="mt-2 w-full p-2 text-xs rounded-xl border border-[#D6D3D1] dark:border-[#44403C] bg-white dark:bg-[#0C0A09] text-inherit"
              />
              <button type="button" onClick={readPasted} className="mt-1 py-2 px-3 text-xs font-bold rounded-xl bg-[#F5F5F4] dark:bg-[#292524] text-[#1C1917] dark:text-[#F5F5F4] cursor-pointer">Read text</button>
            </details>
          </div>

          {loaded.map((l, li) => {
            if (l.marks) {
              const m = l.marks;
              const pk = m.changes.filter(c => l.picked.has(c.key) && !c.invalid).length;
              return (
                <div key={l.id} className={`${card} space-y-2`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-bold text-[#1C1917] dark:text-[#F5F5F4]">
                        {m.daily ? (m.daily === 'attendance' ? 'Attendance' : 'Daily test') : 'Marks'} from {l.ret.from || 'a teacher'} {l.applied && <span className="text-[#15803D] dark:text-[#4ADE80]">· applied</span>}
                      </div>
                      <div className="text-[11px] text-[#78716C] dark:text-[#A8A29E]">
                        {m.daily ? '' : (l.ret.assessmentName || 'Assessment') + ' · '}{l.ret.className || 'Class'} · request {l.ret.requestId} · version {l.ret.revision} · {l.fileName}
                      </div>
                    </div>
                    <button type="button" onClick={() => setLoaded(ls => ls.filter((_, i) => i !== li))} className="text-[11px] font-bold text-[#78716C] hover:underline cursor-pointer">Remove</button>
                  </div>
                  {m.problem && <div className="text-xs text-red-700 dark:text-red-400 py-2">{m.problem}</div>}
                  {!m.problem && (m.missing > 0 || m.alreadySame > 0) && (
                    <div className="text-[11px] text-[#78716C] dark:text-[#A8A29E]">
                      {m.missing > 0 && <>{m.missing} skipped: student or subject no longer exists. </>}
                      {m.alreadySame > 0 && <>{m.alreadySame} already the same.</>}
                    </div>
                  )}
                  {!m.problem && m.changes.length === 0 && <div className="text-xs text-[#78716C] dark:text-[#A8A29E] py-3 text-center">Nothing to change from this file.</div>}
                  {m.changes.map((c: PlannedMark) => (
                    <label key={c.key} className={`flex items-start gap-2 p-2 rounded-lg text-xs cursor-pointer ${c.invalid ? 'opacity-50' : ''} ${c.conflict ? 'bg-[#FEF9C3] dark:bg-[#3B3510]' : ''}`}>
                      <input type="checkbox" disabled={!!c.invalid || l.applied} checked={l.picked.has(c.key)} onChange={() => toggle(li, c.key)} className="w-4 h-4 mt-0.5 accent-[#B91C1C] shrink-0" />
                      <span className="min-w-0">
                        <span className="font-bold text-[#1C1917] dark:text-[#F5F5F4]">{c.studentId === '' ? `Total marks · ${c.subName}` : c.studentName}</span>
                        {c.studentId !== '' && <span className="text-[#78716C] dark:text-[#A8A29E]"> · Roll {c.roll || '—'} · {c.subName}{c.max ? ` (/${c.max})` : ''}</span>}
                        <span className="block">
                          <span className="text-[#78716C] dark:text-[#A8A29E] line-through">{showDaily(m.daily, c.current) || '—'}</span>{' → '}
                          <b className="text-[#B91C1C] dark:text-[#FCA5A5]">{c.studentId === '' ? `${c.to} marks` : c.to === '' ? 'clear' : c.subId === '_remark' ? c.to : m.daily === 'attendance' ? showDaily('attendance', c.to) : c.to === 'A' ? 'Absent' : c.to}</b>
                        </span>
                        {c.conflict && <span className="block text-[11px] text-[#92400E] dark:text-[#FCD34D]">You changed this after sending (it was "{c.from || '—'}"). Ticked only if you want theirs.</span>}
                        {c.invalid && <span className="block text-[11px] text-red-700 dark:text-red-400">{c.invalid}</span>}
                      </span>
                    </label>
                  ))}
                  {!l.applied && m.changes.length > 0 && (
                    <div className="flex gap-2 pt-1">
                      <button type="button" onClick={() => setAll(li, true)} className="py-2 px-3 text-xs font-bold rounded-xl bg-[#F5F5F4] dark:bg-[#292524] text-[#1C1917] dark:text-[#F5F5F4] cursor-pointer">Tick all</button>
                      <button type="button" onClick={() => setAll(li, false)} className="py-2 px-3 text-xs font-bold rounded-xl bg-[#F5F5F4] dark:bg-[#292524] text-[#1C1917] dark:text-[#F5F5F4] cursor-pointer">Untick all</button>
                      <button type="button" disabled={!pk} onClick={() => apply(li)} className="flex-1 py-2 px-3 text-xs font-bold rounded-xl bg-[#B91C1C] text-white hover:bg-[#991B1B] disabled:opacity-50 cursor-pointer">
                        Apply {pk} mark{pk === 1 ? '' : 's'}
                      </button>
                    </div>
                  )}
                </div>
              );
            }
            const picked = l.plan.changes.filter(c => l.picked.has(c.key) && !c.invalid).length;
            const rolls = l.plan.changes.filter(c => c.field === 'rollNo');
            const others = l.plan.changes.filter(c => c.field !== 'rollNo');
            const renderRow = (c: PlannedChange) => {
              const label = FIELD_DEFS.find(f => f.key === c.field)?.label || c.field;
              return (
                <label key={c.key} className={`flex items-start gap-2 p-2 rounded-lg text-xs cursor-pointer ${c.invalid ? 'opacity-50' : ''} ${c.conflict ? 'bg-[#FEF9C3] dark:bg-[#3B3510]' : ''}`}>
                  <input
                    type="checkbox"
                    disabled={!!c.invalid || l.applied}
                    checked={l.picked.has(c.key)}
                    onChange={() => toggle(li, c.key)}
                    className="w-4 h-4 mt-0.5 accent-[#B91C1C] shrink-0"
                  />
                  <span className="min-w-0">
                    <span className="font-bold text-[#1C1917] dark:text-[#F5F5F4]">{c.studentName}</span>
                    <span className="text-[#78716C] dark:text-[#A8A29E]"> · Roll {c.roll || '—'} · {label}</span>
                    <span className="block break-words">
                      <span className="text-[#78716C] dark:text-[#A8A29E] line-through">{c.current || '—'}</span>
                      {' → '}
                      <b className="text-[#B91C1C] dark:text-[#FCA5A5]">{c.to || '—'}</b>
                    </span>
                    {c.conflict && <span className="block text-[11px] text-[#92400E] dark:text-[#FCD34D]">You changed this after sending (it was "{c.from || '—'}"). Ticked only if you want theirs.</span>}
                    {c.invalid && <span className="block text-[11px] text-red-700 dark:text-red-400">{c.invalid}</span>}
                  </span>
                </label>
              );
            };
            return (
              <div key={l.id} className={`${card} space-y-2`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-bold text-[#1C1917] dark:text-[#F5F5F4]">
                      From {l.ret.from || 'a teacher'} {l.applied && <span className="text-[#15803D] dark:text-[#4ADE80]">· applied</span>}
                    </div>
                    <div className="text-[11px] text-[#78716C] dark:text-[#A8A29E]">
                      {l.ret.className || 'Class'} · request {l.ret.requestId} · version {l.ret.revision} · {l.fileName}
                    </div>
                  </div>
                  <button type="button" onClick={() => setLoaded(ls => ls.filter((_, i) => i !== li))} className="text-[11px] font-bold text-[#78716C] hover:underline cursor-pointer">Remove</button>
                </div>

                {(l.plan.missing > 0 || l.plan.alreadySame > 0) && (
                  <div className="text-[11px] text-[#78716C] dark:text-[#A8A29E]">
                    {l.plan.missing > 0 && <>{l.plan.missing} change(s) skipped: student no longer in this class. </>}
                    {l.plan.alreadySame > 0 && <>{l.plan.alreadySame} already the same.</>}
                  </div>
                )}

                {l.plan.changes.length === 0 ? (
                  <div className="text-xs text-[#78716C] dark:text-[#A8A29E] py-3 text-center">Nothing to change from this file.</div>
                ) : (
                  <>
                    {rolls.length > 0 && (
                      <div>
                        <div className="text-[10.5px] font-bold text-[#B91C1C] dark:text-[#FCA5A5] uppercase tracking-wide">Roll number changes ({rolls.length})</div>
                        <div className="text-[11px] text-[#78716C] dark:text-[#A8A29E] mb-1">Applied together, so two students can swap numbers.</div>
                        {rolls.map(renderRow)}
                      </div>
                    )}
                    {others.length > 0 && (
                      <div>
                        <div className="text-[10.5px] font-bold text-[#78716C] dark:text-[#A8A29E] uppercase tracking-wide">Other changes ({others.length})</div>
                        {others.map(renderRow)}
                      </div>
                    )}
                    {!l.applied && (
                      <div className="flex gap-2 pt-1">
                        <button type="button" onClick={() => setAll(li, true)} className="py-2 px-3 text-xs font-bold rounded-xl bg-[#F5F5F4] dark:bg-[#292524] text-[#1C1917] dark:text-[#F5F5F4] cursor-pointer">Tick all</button>
                        <button type="button" onClick={() => setAll(li, false)} className="py-2 px-3 text-xs font-bold rounded-xl bg-[#F5F5F4] dark:bg-[#292524] text-[#1C1917] dark:text-[#F5F5F4] cursor-pointer">Untick all</button>
                        <button
                          type="button"
                          disabled={!picked}
                          onClick={() => apply(li)}
                          className="flex-1 py-2 px-3 text-xs font-bold rounded-xl bg-[#B91C1C] text-white hover:bg-[#991B1B] disabled:opacity-50 cursor-pointer"
                        >
                          Apply {picked} change{picked === 1 ? '' : 's'}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === 'requests' && (
        <div className={`${card} space-y-2`}>
          <h2 className="text-base font-bold text-[#1C1917] dark:text-[#F5F5F4]">Files you sent</h2>
          {log.length === 0 ? (
            <div className="text-xs text-[#78716C] dark:text-[#A8A29E] py-4 text-center">Nothing sent yet.</div>
          ) : log.map(r => {
            const fillIn = r.what ? [r.what] : Object.keys(r.fields || {}).filter(k => r.fields[k] === 'edit').map(k => FIELD_DEFS.find(f => f.key === k)?.label || k);
            return (
              <div key={r.requestId} className="p-2.5 rounded-xl border border-[#E7E5E4] dark:border-[#44403C] text-xs">
                <div className="font-bold text-[#1C1917] dark:text-[#F5F5F4]">
                  {r.className || 'Class'} · {r.count || '?'} students · {r.requestId}
                </div>
                <div className="text-[#78716C] dark:text-[#A8A29E]">
                  Sent {fmt(r.createdAt)}{fillIn.length ? ` · fill in: ${fillIn.join(', ')}` : ' · view and print only'}
                </div>
                <div className={r.returns.length ? 'text-[#15803D] dark:text-[#4ADE80] font-semibold' : 'text-[#78716C] dark:text-[#A8A29E]'}>
                  {r.returns.length
                    ? r.returns.map(x => `Back from ${x.from || 'teacher'} (version ${x.revision}, ${x.applied} applied, ${fmt(x.receivedAt)})`).join(' · ')
                    : 'Nothing back yet'}
                </div>
              </div>
            );
          })}
          <div className="text-[11px] text-[#78716C] dark:text-[#A8A29E]">This list is kept on this device only.</div>
        </div>
      )}
    </div>
  );
};

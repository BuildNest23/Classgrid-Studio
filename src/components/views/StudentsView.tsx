import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useClassroom } from '../../context/ClassroomContext';
import { Student } from '../../types';
import { newId, getSortedStudents, fileTitle } from '../../utils/helpers';
import { RollConflictModal } from '../RollConflictModal';
import {
  RollMode,
  changeRoll,
  findRollOwner,
  formatRoll,
  nextRollNumber,
  renumberAll,
  isBlankRoll,
} from '../../utils/rollNumbers';
import { AiAssistCard } from '../AiAssistCard';
import { StudentDirectoryView } from './StudentDirectoryView';
import { exportFileBlob } from '../../utils/nativeFileExport';
import { buildStudentsAiFile, planStudentsImport } from '../../utils/aiExchange';
import {
  detectKind,
  readSheetRows,
  readStudentsFromText,
  readRowsWithAi,
  rowsToStudentsFile,
  aiReadingAvailable,
  hasAiConsent,
  saveAiConsent,
  type ImportedRow,
} from '../../utils/fileImport';
import {
  UserPlus,
  Edit2,
  Trash2,
  Save,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
  GraduationCap,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Search,
  Upload,
  Hash,
  X,
} from 'lucide-react';
import { PlainTextInput } from '../PlainTextInput';
import { readWorkbookSheets } from '../../collect/schoolExcel';
import { planSchoolImport, HEADERS as CLASS_SHEET_HEADERS } from '../../collect/schoolSheet';
import { getActiveShelfId, defaultClassName } from '../../utils/classShelf';
import { addSnapshot } from '../../utils/history';

const STUDENTS_AI_PLACEHOLDER =
  'Attach your file (Excel, CSV, PDF, photo, or exported JSON) and tap Go, or paste student names here.\n\nOptional instructions:\n• Only take Class 5 students\n• Names are in the second column\n• Ali Khan s/o Ahmed 0300-1234567';

interface StudentsViewProps {
  initialMode?: 'roster' | 'sheet';
}

export const StudentsView: React.FC<StudentsViewProps> = ({ initialMode = 'roster' }) => {
  const { data, activeTab, saveData, toast, uiConfirm, setActiveTab } = useClassroom();

  const [viewMode, setViewMode] = useState<'roster' | 'sheet'>(initialMode);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showMobileForm, setShowMobileForm] = useState(() => data.students.length === 0);
  const [showOptional, setShowOptional] = useState(false);
  const [showImport, setShowImport] = useState(false);

  // Form states
  const [rollNo, setRollNo] = useState('');
  const [admNo, setAdmNo] = useState('');
  const [name, setName] = useState('');
  const [fatherName, setFatherName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [occupation, setOccupation] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    setViewMode(initialMode);
  }, [initialMode]);

  const nextAutoRoll = nextRollNumber(data.students);

  const [rollConflict, setRollConflict] = useState<null | {
    roll: string;
    ownerName: string;
    studentName: string;
    oldRoll: string;
    canSwap: boolean;
    apply: (mode: RollMode) => void;
  }>(null);

  const handleEdit = (s: Student, scrollToTop = true, preserveOptional = false) => {
    setEditingId(s.id);
    setRollNo(s.rollNo || '');
    setAdmNo(s.admissionNo || '');
    setName(s.name || '');
    setFatherName(s.fatherName || '');
    setPhone(s.phone || '');
    setAddress(s.address || '');
    setOccupation(s.occupation || '');
    setNotes(s.notes || '');
    const hasOpt = Boolean(s.phone || s.address || s.occupation || s.notes);
    setShowOptional(prev => (preserveOptional ? prev || hasOpt : hasOpt));
    setShowMobileForm(true);
    if (scrollToTop && window.innerWidth < 1024) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setRollNo('');
    setAdmNo('');
    setName('');
    setFatherName('');
    setPhone('');
    setAddress('');
    setOccupation('');
    setNotes('');
    setShowOptional(false);
  };

  const commitEdit = (mode: RollMode = 'plain') => {
    const trimmedName = name.trim();
    saveData(prev => {
      const original = prev.students.find(x => x.id === editingId);
      if (!original) return prev;
      const newRoll = formatRoll(rollNo) || original.rollNo || '';

      let list = prev.students.map(x =>
        x.id === editingId
          ? {
              ...x,
              admissionNo: admNo.trim(),
              name: trimmedName,
              fatherName: fatherName.trim(),
              phone: phone.trim(),
              address: address.trim(),
              occupation: occupation.trim(),
              notes: notes.trim(),
            }
          : x
      );
      if (newRoll !== (original.rollNo || '')) list = changeRoll(list, original.id, newRoll, mode);
      return { ...prev, students: list };
    });
  };

  const attemptEdit = (after: (hadConflict?: boolean) => void) => {
    const original = data.students.find(x => x.id === editingId);
    const wanted = formatRoll(rollNo);
    const owner =
      original && wanted && wanted !== (original.rollNo || '')
        ? findRollOwner(data.students, original.id, wanted)
        : undefined;
    if (!owner) {
      commitEdit('plain');
      after(false);
      return;
    }
    setRollConflict({
      roll: wanted,
      ownerName: owner.name,
      studentName: name.trim(),
      oldRoll: original?.rollNo || '',
      canSwap: true,
      apply: mode => {
        commitEdit(mode);
        after(true);
      },
    });
  };

  const finishAdd = () => {
    toast('Student added.', 'success');
    setRollNo('');
    setAdmNo('');
    setName('');
    setFatherName('');
    setPhone('');
    setAddress('');
    setOccupation('');
    setNotes('');
    setShowOptional(false);
  };

  const handleSaveStudent = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast("Please enter the student's name.", 'error');
      return;
    }

    if (editingId) {
      attemptEdit(() => {
        toast('Student updated.', 'success');
        handleCancelEdit();
      });
    } else {
      const wantedRoll = formatRoll(rollNo);
      const newStudent: Student = {
        id: newId(),
        admissionNo: admNo.trim(),
        rollNo: wantedRoll || nextAutoRoll,
        name: trimmedName,
        fatherName: fatherName.trim(),
        phone: phone.trim(),
        address: address.trim(),
        occupation: occupation.trim(),
        notes: notes.trim(),
        createdAt: Date.now(),
      };

      const addIt = (mode: RollMode) => {
        saveData(prev => {
          const base = [...prev.students, { ...newStudent, rollNo: '' }];
          return { ...prev, students: changeRoll(base, newStudent.id, newStudent.rollNo, mode) };
        });
        finishAdd();
      };

      const owner = findRollOwner(data.students, null, newStudent.rollNo);
      if (owner) {
        setRollConflict({
          roll: newStudent.rollNo,
          ownerName: owner.name,
          studentName: trimmedName,
          oldRoll: '',
          canSwap: false,
          apply: addIt,
        });
        return;
      }
      addIt('plain');
    }
  };

  const handleMove = (id: string, dir: -1 | 1) => {
    const sorted = getSortedStudents(data.students);
    const idx = sorted.findIndex(x => x.id === id);
    const other = sorted[idx + dir];
    if (idx < 0 || !other) return;

    saveData(prev => ({
      ...prev,
      students: prev.students.map(x =>
        x.id === id
          ? { ...x, rollNo: other.rollNo }
          : x.id === other.id
          ? { ...x, rollNo: sorted[idx].rollNo }
          : x
      ),
    }));
    toast('Roll numbers swapped.', 'info');
  };

  const handleRenumber = async () => {
    const ok = await uiConfirm(
      'Give everyone new roll numbers 01, 02, 03… in the current order?\n\nStudents with a blank roll number go last. You can Undo afterwards.',
      { title: 'Renumber class', yesText: 'Renumber', icon: 'warning' }
    );
    if (!ok) return;
    saveData(prev => ({ ...prev, students: renumberAll(prev.students) }));
    toast('Roll numbers renumbered.', 'success');
  };

  const handleDelete = async (s: Student) => {
    const label = s.name ? `"${s.name}"` : 'this student';
    const ok = await uiConfirm(
      `Remove ${label}?\n\nAll records will be permanently deleted — attendance, assessment marks, remarks, and fund payments.`,
      {
        title: 'Remove Student',
        yesText: 'Remove',
        danger: true,
        icon: 'warning',
      }
    );
    if (!ok) return;

    saveData(prev => {
      const nextStudents = prev.students.filter(x => x.id !== s.id);

      const nextAtt = { ...prev.attendance };
      Object.keys(nextAtt).forEach(k => {
        if (nextAtt[k].status && nextAtt[k].status[s.id] !== undefined) {
          const nextStatus = { ...nextAtt[k].status };
          delete nextStatus[s.id];
          nextAtt[k] = { ...nextAtt[k], status: nextStatus };
        }
      });

      const nextResults = { ...prev.assessmentResults };
      Object.keys(nextResults).forEach(asmtId => {
        if (nextResults[asmtId] && nextResults[asmtId][s.id] !== undefined) {
          const row = { ...nextResults[asmtId] };
          delete row[s.id];
          nextResults[asmtId] = row;
        }
      });

      const nextManualPass = { ...prev.assessmentManualPass };
      Object.keys(nextManualPass).forEach(asmtId => {
        if (nextManualPass[asmtId] && nextManualPass[asmtId][s.id] !== undefined) {
          const row = { ...nextManualPass[asmtId] };
          delete row[s.id];
          nextManualPass[asmtId] = row;
        }
      });

      const nextRemarks = { ...prev.assessmentRemarks };
      Object.keys(nextRemarks).forEach(asmtId => {
        if (nextRemarks[asmtId] && nextRemarks[asmtId][s.id] !== undefined) {
          const row = { ...nextRemarks[asmtId] };
          delete row[s.id];
          nextRemarks[asmtId] = row;
        }
      });

      const nextFundPayments = { ...prev.fundPayments };
      Object.keys(nextFundPayments).forEach(fId => {
        if (nextFundPayments[fId] && nextFundPayments[fId][s.id] !== undefined) {
          const row = { ...nextFundPayments[fId] };
          delete row[s.id];
          nextFundPayments[fId] = row;
        }
      });

      const nextDaily = { ...prev.dailyTests };
      Object.keys(nextDaily).forEach(dk => {
        if (nextDaily[dk] && nextDaily[dk][s.id] !== undefined) {
          const row = { ...nextDaily[dk] };
          delete row[s.id];
          nextDaily[dk] = row;
        }
      });

      return {
        ...prev,
        students: nextStudents,
        dailyTests: nextDaily,
        attendance: nextAtt,
        assessmentResults: nextResults,
        assessmentManualPass: nextManualPass,
        assessmentRemarks: nextRemarks,
        fundPayments: nextFundPayments,
      };
    });

    if (editingId === s.id) handleCancelEdit();
    toast('Student removed.', 'success');
  };

  // ---- Import & AI Assistant ----
  const handleExportForAi = async () => {
    const blob = new Blob([JSON.stringify(buildStudentsAiFile(data), null, 2)], {
      type: 'application/json',
    });
    const ok = await exportFileBlob(blob, `${fileTitle(data.className, 'Students for AI')}.json`, {
      title: 'Students for AI',
    });
    if (!ok) toast('Could not export the file.', 'error');
  };

  const tryClassExcel = async (file: File): Promise<boolean | null> => {
    let sheets;
    try {
      sheets = await readWorkbookSheets(file);
    } catch {
      return null;
    }
    const idHead = CLASS_SHEET_HEADERS[CLASS_SHEET_HEADERS.length - 1].toLowerCase();
    const ours = sheets.some(sh =>
      sh.rows.some(r => r.some(c => String(c).trim().toLowerCase() === idHead))
    );
    if (!ours) return null;

    const key = getActiveShelfId() || 'open';
    const plan = planSchoolImport([{ key, name: defaultClassName(data), data }], sheets);
    const cp = plan.classes[0];
    const known = new Set(data.students.map(st => st.id));
    const matched = cp ? cp.items.filter(i => i.kind !== 'add').length + plan.same : 0;
    if (!cp || (matched === 0 && known.size > 0)) {
      toast(
        'This Excel is not for the open class. Open the right class first, or use Class files for a whole-school file.',
        'error'
      );
      return false;
    }
    if (!cp.items.length) {
      toast(`Nothing to update. Everything matches (${plan.same} students).`, 'info');
      return false;
    }

    const changes = cp.items.filter(i => i.kind === 'change');
    const adds = cp.items.filter(i => i.kind === 'add');
    const removes = cp.items.filter(i => i.kind === 'remove');
    const list = (a: typeof changes) =>
      a
        .slice(0, 6)
        .map(i => `• ${i.title}${i.detail ? ' - ' + i.detail : ''}`)
        .join('\n') + (a.length > 6 ? `\n…and ${a.length - 6} more` : '');
    const parts: string[] = [];
    if (changes.length)
      parts.push(`${changes.length} student${changes.length === 1 ? '' : 's'} corrected:\n${list(changes)}`);
    if (adds.length)
      parts.push(`${adds.length} new student${adds.length === 1 ? '' : 's'} added:\n${list(adds)}`);
    if (!changes.length && !adds.length) parts.push('No corrections or new students.');
    if (removes.length)
      parts.push(
        `${removes.length} student${removes.length === 1 ? ' is' : 's are'} missing from the file (asked next).`
      );
    const ok = await uiConfirm(
      parts.join('\n\n') + '\n\nA restore point is saved first. You can Undo afterwards.',
      { title: 'Import from Excel', yesText: changes.length || adds.length ? 'Import' : 'Next', icon: 'warning' }
    );
    if (!ok) return false;

    const chosen = new Set<string>([...changes, ...adds].map(i => i.id));
    if (removes.length) {
      const rm = await uiConfirm(
        `Remove ${removes.length} student${removes.length === 1 ? '' : 's'} who ${
          removes.length === 1 ? 'is' : 'are'
        } not in the Excel?\n\n${list(
          removes
        )}\n\nTheir attendance, marks and fund records are removed too. Choose "Keep" to leave them.`,
        { title: 'Remove students?', yesText: 'Remove', noText: 'Keep', danger: true, icon: 'warning' }
      );
      if (rm) removes.forEach(i => chosen.add(i.id));
    }
    if (!chosen.size) return false;
    if (!(await addSnapshot(data, 'Before Excel import'))) {
      toast('Could not make a restore point, so nothing was changed.', 'error');
      return false;
    }
    saveData(prev => cp.apply(prev, chosen));
    toast(`${chosen.size} change${chosen.size === 1 ? '' : 's'} applied.`, 'success');
    return true;
  };

  const reviewAndApply = async (file: File, title: string): Promise<boolean> => {
    try {
      const plan = await planStudentsImport(file, data);
      const adds = plan.additions.length;
      if (plan.changedStudents === 0 && adds === 0) {
        toast('Nothing to update or add.', 'info');
        return false;
      }
      const parts: string[] = [];
      if (plan.changedStudents) {
        const what: string[] = [];
        if (plan.changedNames) what.push(`${plan.changedNames} names`);
        if (plan.changedFathers) what.push(`${plan.changedFathers} father names`);
        if (plan.changedOccupations) what.push(`${plan.changedOccupations} occupations`);
        if (plan.changedPhones) what.push(`${plan.changedPhones} phone numbers`);
        if (plan.changedAddresses) what.push(`${plan.changedAddresses} addresses`);
        parts.push(
          `${plan.changedStudents} students will be updated (${what.join(', ')}).\n${plan.examples.join('\n')}`
        );
      }
      if (adds) {
        const more =
          adds > plan.addedPreview.length ? `\n…and ${adds - plan.addedPreview.length} more` : '';
        parts.push(
          `${adds} new students will be added at the end of the list:\n${plan.addedPreview.join(
            '\n'
          )}${more}`
        );
      }
      const notesList: string[] = [];
      if (plan.unchanged) notesList.push(`${plan.unchanged} already the same`);
      if (plan.skippedDuplicate) notesList.push(`${plan.skippedDuplicate} duplicates skipped`);
      if (plan.sameNameNotes)
        notesList.push(`${plan.sameNameNotes} new students share a name with an existing student`);
      if (plan.skippedInvalid) notesList.push(`${plan.skippedInvalid} blank or invalid entries ignored`);
      if (plan.skippedUnknown) notesList.push(`${plan.skippedUnknown} unknown students skipped`);
      const ok = await uiConfirm(
        parts.join('\n\n') +
          (notesList.length ? `\n\n${notesList.join('\n')}` : '') +
          `\n\nRoll numbers of existing students and all admission numbers are not changed. You can Undo afterwards.`,
        { title, yesText: 'Import', icon: 'warning' }
      );
      if (!ok) return false;
      saveData(prev => {
        const updated = prev.students.map(s =>
          plan.updates[s.id] ? { ...s, ...plan.updates[s.id] } : s
        );
        const baseRoll = parseInt(nextRollNumber(updated), 10) || updated.length + 1;
        const added: Student[] = plan.additions.map((n, i) => ({
          id: newId(),
          admissionNo: n.admissionNo,
          rollNo: String(baseRoll + i).padStart(2, '0'),
          name: n.name,
          fatherName: n.fatherName,
          phone: n.phone || '',
          address: n.address || '',
          occupation: n.occupation || '',
          notes: '',
          createdAt: Date.now(),
        }));
        return { ...prev, students: [...updated, ...added] };
      });
      toast(`${plan.changedStudents} updated, ${adds} added.`, 'success');
      return true;
    } catch (err) {
      toast((err as Error).message || 'Could not read the file.', 'error');
      return false;
    }
  };

  const handleAiGo = async (file: File | null, text: string): Promise<boolean> => {
    const needConsent = async (what: string) => {
      if (hasAiConsent()) return true;
      const ok = await uiConfirm(
        `${what} will be sent to Google's AI service over the internet.\n\nIt may contain student names and phone numbers. Continue?`,
        { title: 'Send to AI?', yesText: 'Continue', icon: 'warning' }
      );
      if (ok) saveAiConsent();
      return ok;
    };
    try {
      if (!file) {
        if (!text) {
          toast('Attach a file, or type or paste some student names.', 'info');
          return false;
        }
        if (!aiReadingAvailable()) {
          toast('AI is not set up yet. Use an Excel or CSV file.', 'error');
          return false;
        }
        if (!(await needConsent('Your text'))) return false;
        toast('Reading your text…', 'info');
        const rows = await readStudentsFromText(text);
        return await reviewAndApply(rowsToStudentsFile(rows), 'Add students');
      }

      const kind = detectKind(file);
      if (kind === 'unsupported') {
        toast('Please choose an Excel, CSV, PDF, photo or JSON file.', 'error');
        return false;
      }
      if (kind === 'json') {
        return await reviewAndApply(file, 'Import from file');
      }
      let rows: ImportedRow[];
      if (kind === 'sheet') {
        if (/\.(xlsx|xlsm)$/i.test(file.name)) {
          const done = await tryClassExcel(file);
          if (done !== null) return done;
        }
        rows = await readSheetRows(file);
      } else {
        if (!aiReadingAvailable()) {
          toast('PDF and photo reading is not set up yet. Use an Excel or CSV file.', 'error');
          return false;
        }
        if (!(await needConsent('This file'))) return false;
        toast('Reading file… this can take a few seconds.', 'info');
        rows = await readRowsWithAi(file, text);
      }
      return await reviewAndApply(rowsToStudentsFile(rows), 'Import from file');
    } catch (err) {
      toast((err as Error).message || 'Could not read the file.', 'error');
      return false;
    }
  };

  const filteredStudents = getSortedStudents(data.students).filter(s => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      (s.name || '').toLowerCase().includes(q) ||
      (s.fatherName || '').toLowerCase().includes(q) ||
      (s.admissionNo || '').toLowerCase().includes(q) ||
      (s.rollNo || '').toLowerCase().includes(q) ||
      (s.phone || '').toLowerCase().includes(q)
    );
  });

  // ---- Prev / Next rapid editing (scroll lock + continuous keyboard focus) ----
  const [pendingEditId, setPendingEditId] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const firstInputRef = useRef<HTMLTextAreaElement>(null);
  const typingActiveRef = useRef(false);
  const navPressingRef = useRef(false);
  const navPressTimerRef = useRef<number | null>(null);
  const keepTypingRef = useRef(false);
  const savedScrollYRef = useRef<number | null>(null);

  const markNavPress = () => {
    navPressingRef.current = true;
    if (navPressTimerRef.current !== null) window.clearTimeout(navPressTimerRef.current);
    navPressTimerRef.current = window.setTimeout(() => {
      navPressingRef.current = false;
    }, 450);
  };

  const focusFirstFieldEnd = () => {
    const el = firstInputRef.current;
    if (!el) return;
    try {
      el.focus({ preventScroll: true });
    } catch {
      el.focus();
    }
    const len = el.value.length;
    try {
      el.setSelectionRange(len, len);
    } catch { /* ignore */ }
  };

  const editIdx = editingId ? filteredStudents.findIndex(x => x.id === editingId) : -1;
  const hasPrev = editIdx > 0;
  const hasNext = editIdx >= 0 && editIdx < filteredStudents.length - 1;

  const goToNeighbour = (dir: -1 | 1) => {
    if (editIdx < 0) return;
    const target = filteredStudents[editIdx + dir];
    if (!target) return;
    if (!name.trim()) {
      toast("Please enter the student's name.", 'error');
      return;
    }
    const activeEl = document.activeElement;
    const isFieldFocused = Boolean(
      formRef.current &&
        activeEl &&
        formRef.current.contains(activeEl) &&
        (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')
    );
    const wasTyping = typingActiveRef.current || isFieldFocused;
    const currentScrollY = window.scrollY;
    navPressingRef.current = false;

    attemptEdit(hadConflict => {
      if (hadConflict) {
        setPendingEditId(target.id);
        return;
      }
      savedScrollYRef.current = currentScrollY;
      keepTypingRef.current = wasTyping;
      handleEdit(target, false, true);
      if (wasTyping) {
        // Move focus synchronously inside the tap gesture so Android keeps the keyboard open continuously
        focusFirstFieldEnd();
        typingActiveRef.current = true;
      } else {
        typingActiveRef.current = false;
      }
    });
  };

  useLayoutEffect(() => {
    if (keepTypingRef.current) {
      keepTypingRef.current = false;
      focusFirstFieldEnd();
      typingActiveRef.current = true;
    }
    if (savedScrollYRef.current !== null) {
      const y = savedScrollYRef.current;
      savedScrollYRef.current = null;
      window.scrollTo(0, y);
      requestAnimationFrame(() => window.scrollTo(0, y));
    }
  }, [editingId]);

  useEffect(() => {
    if (!pendingEditId) return;
    const target = data.students.find(x => x.id === pendingEditId);
    setPendingEditId(null);
    if (target) handleEdit(target, false, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingEditId, data.students]);

  useEffect(() => {
    if (editingId && !data.students.some(s => s.id === editingId)) {
      handleCancelEdit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId, data.students]);

  const inputClass =
    'w-full min-h-[40px] px-3 py-2 text-xs rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-950/60 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:bg-white dark:focus:bg-stone-950 focus:border-red-700 dark:focus:border-red-500 transition-colors';

  const labelClass =
    'block text-[11px] font-semibold text-stone-600 dark:text-stone-400 mb-1';

  const formCard = (
    <section
      className={`rounded-2xl bg-white dark:bg-stone-900 border p-4 sm:p-5 ${
        editingId
          ? 'border-red-700/80 dark:border-red-500/70'
          : 'border-stone-200 dark:border-stone-800'
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-3.5">
        <div className="flex items-center gap-2 min-w-0">
          {editingId ? (
            <Edit2 className="w-4 h-4 text-red-800 dark:text-red-400 shrink-0" />
          ) : (
            <UserPlus className="w-4 h-4 text-red-800 dark:text-red-400 shrink-0" />
          )}
          <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100 truncate">
            {editingId ? 'Edit student' : 'Add student'}
          </h2>
        </div>

        {editingId ? (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onMouseDown={e => {
                markNavPress();
                e.preventDefault();
              }}
              onPointerDown={e => {
                markNavPress();
                if (e.pointerType !== 'touch') e.preventDefault();
              }}
              onTouchStart={markNavPress}
              onClick={() => goToNeighbour(-1)}
              disabled={!hasPrev}
              title="Save and edit previous student"
              className="min-h-[34px] px-2.5 rounded-lg text-[11px] font-semibold bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-200 hover:bg-stone-200 dark:hover:bg-stone-700 disabled:opacity-35 cursor-pointer inline-flex items-center gap-0.5"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Prev
            </button>
            <button
              type="button"
              onMouseDown={e => {
                markNavPress();
                e.preventDefault();
              }}
              onPointerDown={e => {
                markNavPress();
                if (e.pointerType !== 'touch') e.preventDefault();
              }}
              onTouchStart={markNavPress}
              onClick={() => goToNeighbour(1)}
              disabled={!hasNext}
              title="Save and edit next student"
              className="min-h-[34px] px-2.5 rounded-lg text-[11px] font-semibold bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-200 hover:bg-stone-200 dark:hover:bg-stone-700 disabled:opacity-35 cursor-pointer inline-flex items-center gap-0.5"
            >
              Next
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          data.students.length > 0 && (
            <button
              type="button"
              onClick={() => setShowMobileForm(false)}
              className="lg:hidden w-9 h-9 -mr-1.5 flex items-center justify-center rounded-xl text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 cursor-pointer"
              aria-label="Close form"
            >
              <X className="w-4 h-4" />
            </button>
          )
        )}
      </div>

      <form
        ref={formRef}
        onSubmit={handleSaveStudent}
        onFocusCapture={e => {
          const tag = (e.target as HTMLElement)?.tagName;
          if (tag === 'INPUT' || tag === 'TEXTAREA') typingActiveRef.current = true;
        }}
        onBlurCapture={() => {
          if (navPressingRef.current) return;
          window.setTimeout(() => {
            if (navPressingRef.current) return;
            const active = document.activeElement;
            const stillInside = Boolean(
              formRef.current &&
                active &&
                formRef.current.contains(active) &&
                (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')
            );
            if (!stillInside) typingActiveRef.current = false;
          }, 0);
        }}
        className="space-y-3"
      >
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className={labelClass}>Roll No</label>
            <PlainTextInput
              ref={firstInputRef}
              value={rollNo}
              placeholder={editingId ? 'Roll' : nextAutoRoll}
              onChange={e => setRollNo(e.target.value)}
              className={`${inputClass} font-mono-num`}
            />
          </div>
          <div>
            <label className={labelClass}>Admission No</label>
            <PlainTextInput
              value={admNo}
              placeholder="Optional"
              onChange={e => setAdmNo(e.target.value)}
              className={`${inputClass} font-mono-num`}
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>Student Name *</label>
          <PlainTextInput
            value={name}
            placeholder="Full name"
            onChange={e => setName(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Father Name</label>
          <PlainTextInput
            value={fatherName}
            placeholder="Father / Guardian name"
            onChange={e => setFatherName(e.target.value)}
            className={inputClass}
          />
        </div>

        <button
          type="button"
          onClick={() => setShowOptional(!showOptional)}
          className="text-xs font-semibold text-stone-500 dark:text-stone-400 hover:text-red-800 dark:hover:text-red-400 inline-flex items-center gap-1 cursor-pointer transition-colors"
        >
          {showOptional ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          <span>{showOptional ? 'Hide optional fields' : 'Phone, address, occupation & notes'}</span>
        </button>

        {showOptional && (
          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <div>
              <label className={labelClass}>Phone</label>
              <PlainTextInput
                type="tel"
                value={phone}
                placeholder="Optional"
                onChange={e => setPhone(e.target.value)}
                className={`${inputClass} font-mono-num`}
              />
            </div>
            <div>
              <label className={labelClass}>Occupation</label>
              <PlainTextInput
                value={occupation}
                placeholder="Optional"
                onChange={e => setOccupation(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="col-span-2">
              <label className={labelClass}>Address</label>
              <PlainTextInput
                value={address}
                placeholder="Optional"
                onChange={e => setAddress(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="col-span-2">
              <label className={labelClass}>Notes</label>
              <PlainTextInput
                value={notes}
                placeholder="Optional"
                onChange={e => setNotes(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            className="flex-1 min-h-[44px] px-4 py-2 text-xs font-semibold rounded-xl bg-red-800 hover:bg-red-900 dark:bg-red-700 dark:hover:bg-red-600 text-white transition-colors cursor-pointer inline-flex items-center justify-center gap-1.5 active:scale-[0.98]"
          >
            <Save className="w-4 h-4" />
            <span>{editingId ? 'Update student' : 'Save student'}</span>
          </button>
          {editingId && (
            <button
              type="button"
              onClick={handleCancelEdit}
              className="min-h-[44px] px-4 py-2 text-xs font-semibold rounded-xl bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-200 hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors cursor-pointer"
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </section>
  );

  return (
    <div className="space-y-5">
      {/* Unified Students Masthead + Segmented Mode Switch */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium text-stone-500 dark:text-stone-400">
            {data.className || 'Active Class'} ·{' '}
            <span className="tabular-nums">
              {data.students.length} {data.students.length === 1 ? 'student' : 'students'}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-stone-900 dark:text-stone-100 mt-1">
            Students
          </h1>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <div className="inline-flex items-center p-1 rounded-xl bg-stone-200/70 dark:bg-stone-800/80">
            <button
              type="button"
              onClick={() => {
                setViewMode('roster');
                if (activeTab === 'view') setActiveTab('students');
              }}
              className={`min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                viewMode === 'roster'
                  ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-xs'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
              }`}
            >
              Roster
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode('sheet');
                if (activeTab === 'students') setActiveTab('view');
              }}
              className={`min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                viewMode === 'sheet'
                  ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-xs'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
              }`}
            >
              Print &amp; Export
            </button>
          </div>

          {viewMode === 'roster' && !showMobileForm && !editingId && (
            <button
              type="button"
              onClick={() => setShowMobileForm(true)}
              className="lg:hidden min-h-[42px] px-3.5 py-2 rounded-xl bg-red-800 hover:bg-red-900 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer active:scale-[0.98]"
            >
              <UserPlus className="w-4 h-4" />
              <span>Add</span>
            </button>
          )}
        </div>
      </div>

      {/* Notice if class name is not yet configured */}
      {!data.className && (
        <div className="px-4 py-3 rounded-2xl bg-amber-50/70 dark:bg-amber-950/25 border border-amber-200/80 dark:border-amber-900/60 text-amber-900 dark:text-amber-200 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-700 dark:text-amber-400" />
            <span>No class name set yet. Add your class name in Settings.</span>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className="text-xs font-semibold underline shrink-0 cursor-pointer"
          >
            Settings
          </button>
        </div>
      )}

      {viewMode === 'sheet' ? (
        <StudentDirectoryView embedded onSwitchToRoster={() => setViewMode('roster')} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left Column (Desktop Sticky / Mobile Collapsible): Add or Edit Form + Import */}
          <div className="lg:col-span-4 lg:sticky lg:top-[76px] space-y-4">
            <div className={showMobileForm || editingId ? 'block' : 'hidden lg:block'}>
              {formCard}
            </div>

            {/* Compact Collapsible Import / AI Trigger */}
            <div className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowImport(!showImport)}
                className="w-full min-h-[48px] px-4 py-3 flex items-center justify-between gap-2 text-left hover:bg-stone-50 dark:hover:bg-stone-800/40 transition-colors cursor-pointer"
                aria-expanded={showImport}
              >
                <span className="flex items-center gap-2 text-xs font-semibold text-stone-800 dark:text-stone-200">
                  <Upload className="w-4 h-4 text-red-800 dark:text-red-400" />
                  <span>Import from Excel, CSV, PDF or photo</span>
                </span>
                {showImport ? (
                  <ChevronUp className="w-4 h-4 text-stone-400 shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-stone-400 shrink-0" />
                )}
              </button>
              {showImport && (
                <div className="px-4 pb-4 border-t border-stone-100 dark:border-stone-800">
                  <AiAssistCard
                    embedded
                    title="Import & AI assistant"
                    placeholder={STUDENTS_AI_PLACEHOLDER}
                    hint="Excel, CSV, and exported JSON files are read offline on your device. PDFs, photos, and typed lists use AI (internet required). You always review changes before anything is saved."
                    accept=".xlsx,.xls,.csv,.pdf,.jpg,.jpeg,.png,.webp,.json,image/*,application/pdf,application/json"
                    onGo={handleAiGo}
                    onExport={handleExportForAi}
                    exportLabel="Export JSON"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Searchable Student Roster */}
          <div className="lg:col-span-8 space-y-3">
            {/* Search + Renumber Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <PlainTextInput
                  value={search}
                  placeholder="Search by name, father name, roll, admission, or phone…"
                  onChange={e => setSearch(e.target.value)}
                  className="w-full min-h-[44px] pl-10 pr-3.5 py-2 text-xs rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:border-red-700 dark:focus:border-red-500"
                />
              </div>

              {data.students.length > 1 && (
                <button
                  type="button"
                  onClick={handleRenumber}
                  className="min-h-[44px] px-3.5 py-2 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 hover:bg-stone-50 dark:hover:bg-stone-800 text-xs font-semibold text-stone-700 dark:text-stone-200 inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer shrink-0 whitespace-nowrap"
                >
                  <Hash className="w-3.5 h-3.5 text-red-800 dark:text-red-400" />
                  <span>Renumber 01…</span>
                </button>
              )}
            </div>

            {/* Clean Hairline-Divided Roster List */}
            <section className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 overflow-hidden">
              {filteredStudents.length === 0 ? (
                <div className="py-12 px-6 text-center">
                  <GraduationCap className="w-9 h-9 mx-auto text-stone-400 dark:text-stone-600" />
                  <p className="text-sm font-semibold text-stone-700 dark:text-stone-300 mt-3">
                    {search ? 'No matching students' : 'No students enrolled yet'}
                  </p>
                  <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
                    {search
                      ? 'Try searching with a different name, roll number, or phone.'
                      : 'Add your first student using the form or import an Excel/CSV roster.'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-stone-100 dark:divide-stone-800">
                  {filteredStudents.map((s, idx) => {
                    const isFiltering = search.trim() !== '';
                    const isFirst = isFiltering || idx === 0;
                    const isLast = isFiltering || idx === filteredStudents.length - 1;
                    const isEditingRow = s.id === editingId;
                    const blankRoll = isBlankRoll(s.rollNo);

                    return (
                      <div
                        key={s.id}
                        id={`stu-${s.id}`}
                        className={`p-3.5 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition-colors scroll-mt-[120px] ${
                          isEditingRow ? 'bg-red-50/60 dark:bg-red-950/25' : ''
                        }`}
                      >
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <div
                            className={`w-11 pt-0.5 text-center font-mono-num text-xs font-bold shrink-0 ${
                              blankRoll
                                ? 'text-red-700 dark:text-red-400'
                                : 'text-stone-500 dark:text-stone-400'
                            }`}
                            title={blankRoll ? 'Blank roll number' : `Roll ${s.rollNo}`}
                          >
                            {s.rollNo || '—'}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold text-stone-900 dark:text-stone-100 break-words leading-snug">
                              {s.name || '(no name)'}
                            </div>
                            <div className="text-xs text-stone-500 dark:text-stone-400 mt-0.5 break-words">
                              {[
                                s.fatherName ? `s/o ${s.fatherName}` : null,
                                s.admissionNo ? `Adm ${s.admissionNo}` : null,
                                s.phone || null,
                              ]
                                .filter(Boolean)
                                .join(' · ') || 'No additional details'}
                            </div>
                          </div>
                        </div>

                        {/* Row Actions (44px Touch Targets on Mobile) */}
                        <div className="flex items-center justify-end gap-1 shrink-0 pl-12 sm:pl-0">
                          <button
                            type="button"
                            onClick={() => handleMove(s.id, -1)}
                            disabled={isFirst}
                            title="Move Up"
                            aria-label="Move Up"
                            className="w-11 h-11 sm:w-9 sm:h-9 rounded-xl text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-stone-100 disabled:opacity-25 cursor-pointer flex items-center justify-center transition-colors"
                          >
                            <ArrowUp className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMove(s.id, 1)}
                            disabled={isLast}
                            title="Move Down"
                            aria-label="Move Down"
                            className="w-11 h-11 sm:w-9 sm:h-9 rounded-xl text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-stone-100 disabled:opacity-25 cursor-pointer flex items-center justify-center transition-colors"
                          >
                            <ArrowDown className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEdit(s)}
                            title="Edit student"
                            aria-label="Edit student"
                            className="w-11 h-11 sm:w-9 sm:h-9 rounded-xl text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-stone-100 cursor-pointer flex items-center justify-center transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(s)}
                            title="Delete student"
                            aria-label="Delete student"
                            className="w-11 h-11 sm:w-9 sm:h-9 rounded-xl text-stone-400 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-700 dark:hover:text-red-400 cursor-pointer flex items-center justify-center transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {rollConflict && (
        <RollConflictModal
          roll={rollConflict.roll}
          ownerName={rollConflict.ownerName}
          studentName={rollConflict.studentName}
          oldRoll={rollConflict.oldRoll}
          canSwap={rollConflict.canSwap}
          onChoose={mode => {
            const c = rollConflict;
            setRollConflict(null);
            c.apply(mode);
          }}
          onCancel={() => setRollConflict(null)}
        />
      )}
    </div>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import { useClassroom } from '../../context/ClassroomContext';
import { Student } from '../../types';
import { newId, getSortedStudents } from '../../utils/helpers';
import { RollConflictModal } from '../RollConflictModal';
import { RollMode, changeRoll, findRollOwner, formatRoll, nextRollNumber, renumberAll, isBlankRoll } from '../../utils/rollNumbers';
import { HowItWorks } from '../HowItWorks';
import { AiAssistCard } from '../AiAssistCard';
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
  type ImportedRow
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
  ChevronRight
} from 'lucide-react';

const STUDENTS_AI_PLACEHOLDER =
  "Attach a file and tap Go, or type / paste names here.\n\nYou can add instructions, for example:\n• Only take the Class 5 students\n• Names are in the second column\n• Ali Khan s/o Ahmed 0300-1234567";

export const StudentsView: React.FC = () => {
  const { data, saveData, toast, uiConfirm } = useClassroom();

  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showOptional, setShowOptional] = useState(false);

  // Form states
  const [rollNo, setRollNo] = useState("");
  const [admNo, setAdmNo] = useState("");
  const [name, setName] = useState("");
  const [fatherName, setFatherName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [occupation, setOccupation] = useState("");
  const [notes, setNotes] = useState("");

  const nextAutoRoll = nextRollNumber(data.students);

  // Asked when the wanted roll number already belongs to someone else
  const [rollConflict, setRollConflict] = useState<null | {
    roll: string; ownerName: string; studentName: string; oldRoll: string; canSwap: boolean;
    apply: (mode: RollMode) => void;
  }>(null);

  const handleEdit = (s: Student) => {
    setEditingId(s.id);
    setRollNo(s.rollNo || "");
    setAdmNo(s.admissionNo || "");
    setName(s.name || "");
    setFatherName(s.fatherName || "");
    setPhone(s.phone || "");
    setAddress(s.address || "");
    setOccupation(s.occupation || "");
    setNotes(s.notes || "");
    if (s.phone || s.address || s.occupation || s.notes) setShowOptional(true);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setRollNo("");
    setAdmNo("");
    setName("");
    setFatherName("");
    setPhone("");
    setAddress("");
    setOccupation("");
    setNotes("");
    setShowOptional(false);
  };

  // Saves the open edit form into the student. Other students' roll numbers are never changed
  // unless the chosen conflict mode says so (swap / blank / insert).
  const commitEdit = (mode: RollMode = 'plain') => {
    const trimmedName = name.trim();
    saveData(prev => {
      const original = prev.students.find(x => x.id === editingId);
      if (!original) return prev;
      const newRoll = formatRoll(rollNo) || (original.rollNo || "");

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
              notes: notes.trim()
            }
          : x
      );
      if (newRoll !== (original.rollNo || "")) list = changeRoll(list, original.id, newRoll, mode);
      return { ...prev, students: list };
    });
  };

  // Runs the save; if the roll number is taken, asks what to do first. `after` runs once saved.
  const attemptEdit = (after: () => void) => {
    const original = data.students.find(x => x.id === editingId);
    const wanted = formatRoll(rollNo);
    const owner = original && wanted && wanted !== (original.rollNo || "")
      ? findRollOwner(data.students, original.id, wanted)
      : undefined;
    if (!owner) {
      commitEdit('plain');
      after();
      return;
    }
    setRollConflict({
      roll: wanted,
      ownerName: owner.name,
      studentName: name.trim(),
      oldRoll: original?.rollNo || "",
      canSwap: true,
      apply: mode => { commitEdit(mode); after(); },
    });
  };

  const handleSaveStudent = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast("Please enter the student's name.", "error");
      return;
    }

    if (editingId) {
      attemptEdit(() => {
        toast("Student updated.", "success");
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
        createdAt: Date.now()
      };

      const addIt = (mode: RollMode) => {
        saveData(prev => {
          // Added with a blank roll first, then given its number the same way an edit would
          const base = [...prev.students, { ...newStudent, rollNo: "" }];
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
          oldRoll: "",
          canSwap: false,
          apply: addIt,
        });
        return;
      }
      addIt('plain');
    }
  };

  const finishAdd = () => {
      toast("Student added.", "success");
      setRollNo("");
      setAdmNo("");
      setName("");
      setFatherName("");
      setPhone("");
      setAddress("");
      setOccupation("");
      setNotes("");
      setShowOptional(false);
  };

  // Move Up / Down swaps roll numbers with the neighbour in roll order.
  const handleMove = (id: string, dir: -1 | 1) => {
    const sorted = getSortedStudents(data.students);
    const idx = sorted.findIndex(x => x.id === id);
    const other = sorted[idx + dir];
    if (idx < 0 || !other) return;

    saveData(prev => ({
      ...prev,
      students: prev.students.map(x =>
        x.id === id ? { ...x, rollNo: other.rollNo } : x.id === other.id ? { ...x, rollNo: sorted[idx].rollNo } : x
      ),
    }));
    toast("Roll numbers swapped.", "info");
  };

  const handleRenumber = async () => {
    const ok = await uiConfirm(
      "Give everyone new roll numbers 01, 02, 03… in the current order?\n\nStudents with a blank roll number go last. You can Undo afterwards.",
      { title: "Renumber class", yesText: "Renumber", icon: "warning" }
    );
    if (!ok) return;
    saveData(prev => ({ ...prev, students: renumberAll(prev.students) }));
    toast("Roll numbers renumbered.", "success");
  };

  const handleDelete = async (s: Student) => {
    const label = s.name ? `"${s.name}"` : "this student";
    const ok = await uiConfirm(
      `Remove ${label}?\n\nAll records will be permanently deleted — attendance, assessment marks, remarks, and fund payments.`,
      {
        title: "Remove Student",
        yesText: "Remove",
        danger: true,
        icon: "warning"
      }
    );
    if (!ok) return;

    saveData(prev => {
      const nextStudents = prev.students.filter(x => x.id !== s.id);
      const synced = nextStudents; // roll numbers are left as they are (use "Renumber" to close gaps)

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
        students: synced,
        dailyTests: nextDaily,
        attendance: nextAtt,
        assessmentResults: nextResults,
        assessmentManualPass: nextManualPass,
        assessmentRemarks: nextRemarks,
        fundPayments: nextFundPayments
      };
    });

    if (editingId === s.id) handleCancelEdit();
    toast("Student removed.", "success");
  };

  // Edit with AI: one export / one import. The AI can fix names and add new students.
  const handleExportForAi = async () => {
    const blob = new Blob([JSON.stringify(buildStudentsAiFile(data), null, 2)], { type: "application/json" });
    const ok = await exportFileBlob(blob, "students-for-ai.json", { title: "Students for AI" });
    if (!ok) toast("Could not export the file.", "error");
  };

  // One AI box: attach a file (Excel / CSV / PDF / photo / JSON) and/or type what you want, then tap Go.
  const handleAiGo = async (file: File | null, text: string): Promise<boolean> => {
    const needConsent = async (what: string) => {
      if (hasAiConsent()) return true;
      const ok = await uiConfirm(
        `${what} will be sent to Google's AI service over the internet.\n\nIt may contain student names and phone numbers. Continue?`,
        { title: "Send to AI?", yesText: "Continue", icon: "warning" }
      );
      if (ok) saveAiConsent();
      return ok;
    };
    try {
      if (!file) {
        if (!text) {
          toast("Attach a file, or type or paste some student names.", "info");
          return false;
        }
        if (!aiReadingAvailable()) {
          toast("AI is not set up yet. Use an Excel or CSV file.", "error");
          return false;
        }
        if (!(await needConsent("Your text"))) return false;
        toast("Reading your text…", "info");
        const rows = await readStudentsFromText(text);
        return await reviewAndApply(rowsToStudentsFile(rows), "Add students");
      }

      const kind = detectKind(file);
      if (kind === "unsupported") {
        toast("Please choose an Excel, CSV, PDF, photo or JSON file.", "error");
        return false;
      }
      if (kind === "json") {
        // A students file exported with "Export file" and filled in by an AI
        return await reviewAndApply(file, "Import from file");
      }
      let rows: ImportedRow[];
      if (kind === "sheet") {
        rows = await readSheetRows(file);
      } else {
        if (!aiReadingAvailable()) {
          toast("PDF and photo reading is not set up yet. Use an Excel or CSV file.", "error");
          return false;
        }
        if (!(await needConsent("This file"))) return false;
        toast("Reading file… this can take a few seconds.", "info");
        rows = await readRowsWithAi(file, text);
      }
      return await reviewAndApply(rowsToStudentsFile(rows), "Import from file");
    } catch (err) {
      toast((err as Error).message || "Could not read the file.", "error");
      return false;
    }
  };

  const reviewAndApply = async (file: File, title: string): Promise<boolean> => {
    try {
      const plan = await planStudentsImport(file, data);
      const adds = plan.additions.length;
      if (plan.changedStudents === 0 && adds === 0) {
        toast("Nothing to update or add.", "info");
        return false;
      }
      const parts: string[] = [];
      if (plan.changedStudents) {
        const what: string[] = [];
        if (plan.changedNames) what.push(`${plan.changedNames} names`);
        if (plan.changedFathers) what.push(`${plan.changedFathers} father names`);
        if (plan.changedOccupations) what.push(`${plan.changedOccupations} occupations`);
        parts.push(`${plan.changedStudents} students will be updated (${what.join(", ")}).\n${plan.examples.join("\n")}`);
      }
      if (adds) {
        const more = adds > plan.addedPreview.length ? `\n…and ${adds - plan.addedPreview.length} more` : "";
        parts.push(`${adds} new students will be added at the end of the list:\n${plan.addedPreview.join("\n")}${more}`);
      }
      const notes: string[] = [];
      if (plan.unchanged) notes.push(`${plan.unchanged} already the same`);
      if (plan.skippedDuplicate) notes.push(`${plan.skippedDuplicate} duplicates skipped`);
      if (plan.sameNameNotes) notes.push(`${plan.sameNameNotes} new students share a name with an existing student`);
      if (plan.skippedInvalid) notes.push(`${plan.skippedInvalid} blank or invalid entries ignored`);
      if (plan.skippedUnknown) notes.push(`${plan.skippedUnknown} unknown students skipped`);
      const ok = await uiConfirm(
        parts.join("\n\n") +
          (notes.length ? `\n\n${notes.join("\n")}` : "") +
          `\n\nRoll numbers of existing students and all admission numbers are not changed. You can Undo afterwards.`,
        { title, yesText: "Import", icon: "warning" }
      );
      if (!ok) return false;
      saveData(prev => {
        const updated = prev.students.map(s => (plan.updates[s.id] ? { ...s, ...plan.updates[s.id] } : s));
        const added: Student[] = plan.additions.map((n, i) => ({
          id: newId(),
          admissionNo: n.admissionNo,
          rollNo: String(parseInt(nextRollNumber(updated), 10) + i).padStart(2, "0"),
          name: n.name,
          fatherName: n.fatherName,
          phone: n.phone || "",
          address: "",
          occupation: n.occupation || "",
          notes: "",
          createdAt: Date.now(),
        }));
        return { ...prev, students: [...updated, ...added] };
      });
      toast(`${plan.changedStudents} updated, ${adds} added.`, "success");
      return true;
    } catch (err) {
      toast((err as Error).message || "Could not read the file.", "error");
      return false;
    }
  };

  const filteredStudents = getSortedStudents(data.students).filter(s => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      (s.name || "").toLowerCase().includes(q) ||
      (s.fatherName || "").toLowerCase().includes(q) ||
      (s.admissionNo || "").toLowerCase().includes(q) ||
      (s.rollNo || "").toLowerCase().includes(q) ||
      (s.phone || "").toLowerCase().includes(q)
    );
  });

  // ---- Prev / Next while editing: saves the current student, then opens the neighbour ----
  const [pendingEditId, setPendingEditId] = useState<string | null>(null);
  const scrollToEditedRef = useRef(false);

  const editIdx = editingId ? filteredStudents.findIndex(x => x.id === editingId) : -1;
  const hasPrev = editIdx > 0;
  const hasNext = editIdx >= 0 && editIdx < filteredStudents.length - 1;

  const goToNeighbour = (dir: -1 | 1) => {
    if (editIdx < 0) return;
    const target = filteredStudents[editIdx + dir];
    if (!target) return;
    if (!name.trim()) {
      toast("Please enter the student's name.", "error");
      return;
    }
    attemptEdit(() => {
      scrollToEditedRef.current = true;
      setPendingEditId(target.id); // opened once the save has landed
    });
  };

  useEffect(() => {
    if (!pendingEditId) return;
    const target = data.students.find(x => x.id === pendingEditId);
    setPendingEditId(null);
    if (target) handleEdit(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingEditId, data.students]);

  // Keep the student being edited in view when moving with Prev / Next (not when tapping the pencil).
  useEffect(() => {
    if (!editingId || !scrollToEditedRef.current) return;
    scrollToEditedRef.current = false;
    document.getElementById(`stu-${editingId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [editingId]);


  return (
    <div className="space-y-3">
      <HowItWorks
        id="students"
        title="How to add students"
        steps={[
          <>Fill in the form: <b>Student Name</b> is required. Roll No is filled in for you if you leave it. Everything else is optional.</>,
          <>Tap <b>Save Student</b>. The student then appears in every other screen: Attendance, Daily Test, Results and Funds.</>,
          <>Use the <b>arrows</b> to move a student up or down, the <b>pencil</b> to edit, or the <b>bin</b> to remove.</>,
          <>Use the search box to find a student by name, father's name, roll number, admission number or phone.</>
        ]}
        note="Moving or removing a student renumbers the roll numbers. Removing a student also deletes all their attendance, marks and fund records, so you will be asked to confirm."
      />

      {/* Notice if class is not configured */}
      {!data.className && (
        <div className="p-3 bg-[#FBF0D9] dark:bg-[#3A2E14] border border-[#B4791F] rounded-xl text-[#7A5515] dark:text-[#F8E0A0] text-xs font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>No class name set yet. Go to <b>Settings</b> and enter your Class Name first.</span>
        </div>
      )}

      {/* Sticky Student Form Card */}
      <div className="bg-white dark:bg-[#1C1917] border-2 border-[#B91C1C] dark:border-[#F87171] rounded-2xl p-3.5 shadow-md sticky top-[60px] [.header-hidden_&]:top-0 transition-[top] duration-200 z-10">
        <h3 className="text-sm font-bold text-[#B91C1C] dark:text-[#FCA5A5] mb-2 flex justify-between items-center">
          <span className="flex items-center gap-1.5">
            {editingId ? <Edit2 className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
            {editingId ? "Edit Student" : "Add New Student"}
          </span>
          {editingId && (
            <span className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => goToNeighbour(-1)}
                disabled={!hasPrev}
                title="Save and go to previous student"
                className="py-1 px-2 rounded-lg text-[11px] font-bold bg-[#F5F5F4] dark:bg-[#292524] text-[#1C1917] dark:text-[#F5F5F4] hover:bg-[#E7E5E4] disabled:opacity-40 cursor-pointer flex items-center gap-0.5"
              >
                <ChevronLeft className="w-3.5 h-3.5" />Prev
              </button>
              <button
                type="button"
                onClick={() => goToNeighbour(1)}
                disabled={!hasNext}
                title="Save and go to next student"
                className="py-1 px-2 rounded-lg text-[11px] font-bold bg-[#F5F5F4] dark:bg-[#292524] text-[#1C1917] dark:text-[#F5F5F4] hover:bg-[#E7E5E4] disabled:opacity-40 cursor-pointer flex items-center gap-0.5"
              >
                Next<ChevronRight className="w-3.5 h-3.5" />
              </button>
            </span>
          )}
        </h3>

        <form onSubmit={handleSaveStudent}>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10.5px] font-bold text-[#78716C] dark:text-[#A8A29E] uppercase tracking-wide mb-1">
                Roll No *
              </label>
              <input
                type="text"
                value={rollNo}
                placeholder={editingId ? "Roll" : nextAutoRoll}
                onChange={e => setRollNo(e.target.value)}
                className="w-full p-2 text-xs rounded-xl border border-[#D6D3D1] dark:border-[#44403C] bg-white dark:bg-[#0C0A09] text-inherit focus:outline-none focus:ring-2 focus:ring-[#DC2626]"
              />
            </div>
            <div>
              <label className="block text-[10.5px] font-bold text-[#78716C] dark:text-[#A8A29E] uppercase tracking-wide mb-1">
                Admission No
              </label>
              <input
                type="text"
                value={admNo}
                placeholder="Optional"
                onChange={e => setAdmNo(e.target.value)}
                className="w-full p-2 text-xs rounded-xl border border-[#D6D3D1] dark:border-[#44403C] bg-white dark:bg-[#0C0A09] text-inherit focus:outline-none focus:ring-2 focus:ring-[#DC2626]"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-[10.5px] font-bold text-[#78716C] dark:text-[#A8A29E] uppercase tracking-wide mb-1">
                Student Name *
              </label>
              <input
                type="text"
                value={name}
                placeholder="Student Name"
                onChange={e => setName(e.target.value)}
                className="w-full p-2 text-xs rounded-xl border border-[#D6D3D1] dark:border-[#44403C] bg-white dark:bg-[#0C0A09] text-inherit focus:outline-none focus:ring-2 focus:ring-[#DC2626]"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-[10.5px] font-bold text-[#78716C] dark:text-[#A8A29E] uppercase tracking-wide mb-1">
                Father Name
              </label>
              <input
                type="text"
                value={fatherName}
                placeholder="Father Name"
                onChange={e => setFatherName(e.target.value)}
                className="w-full p-2 text-xs rounded-xl border border-[#D6D3D1] dark:border-[#44403C] bg-white dark:bg-[#0C0A09] text-inherit focus:outline-none focus:ring-2 focus:ring-[#DC2626]"
              />
            </div>

            <div className="col-span-2">
              <button
                type="button"
                onClick={() => setShowOptional(!showOptional)}
                className="text-[11.5px] font-bold text-[#2E5A8A] dark:text-[#8AB4DC] hover:underline cursor-pointer flex items-center gap-1"
              >
                {showOptional ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                <span>{showOptional ? "Hide Optional Details" : "Add Optional Details (Phone, Address, Occupation, Notes)"}</span>
              </button>
            </div>

            {showOptional && (
              <>
                <div>
                  <label className="block text-[10.5px] font-bold text-[#78716C] dark:text-[#A8A29E] uppercase tracking-wide mb-1">Phone</label>
                  <input
                    type="tel"
                    value={phone}
                    placeholder="Optional"
                    onChange={e => setPhone(e.target.value)}
                    className="w-full p-2 text-xs rounded-xl border border-[#D6D3D1] dark:border-[#44403C] bg-white dark:bg-[#0C0A09] text-inherit"
                  />
                </div>
                <div>
                  <label className="block text-[10.5px] font-bold text-[#78716C] dark:text-[#A8A29E] uppercase tracking-wide mb-1">Address</label>
                  <input
                    type="text"
                    value={address}
                    placeholder="Optional"
                    onChange={e => setAddress(e.target.value)}
                    className="w-full p-2 text-xs rounded-xl border border-[#D6D3D1] dark:border-[#44403C] bg-white dark:bg-[#0C0A09] text-inherit"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-[10.5px] font-bold text-[#78716C] dark:text-[#A8A29E] uppercase tracking-wide mb-1">Occupation</label>
                  <input
                    type="text"
                    value={occupation}
                    placeholder="Optional (e.g. Teacher, Shopkeeper)"
                    onChange={e => setOccupation(e.target.value)}
                    className="w-full p-2 text-xs rounded-xl border border-[#D6D3D1] dark:border-[#44403C] bg-white dark:bg-[#0C0A09] text-inherit"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-[10.5px] font-bold text-[#78716C] dark:text-[#A8A29E] uppercase tracking-wide mb-1">Notes</label>
                  <input
                    type="text"
                    value={notes}
                    placeholder="Optional"
                    onChange={e => setNotes(e.target.value)}
                    className="w-full p-2 text-xs rounded-xl border border-[#D6D3D1] dark:border-[#44403C] bg-white dark:bg-[#0C0A09] text-inherit"
                  />
                </div>
              </>
            )}
          </div>

          <div className="flex gap-2 mt-3">
            <button
              type="submit"
              className="flex-1 py-2 px-3 text-xs font-bold rounded-xl bg-[#B91C1C] text-white hover:bg-[#991B1B] transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{editingId ? "Update Student" : "Save Student"}</span>
            </button>
            {editingId && (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="py-2 px-3 text-xs font-bold rounded-xl bg-[#F5F5F4] dark:bg-[#292524] text-[#1C1917] dark:text-[#F5F5F4] hover:bg-[#E7E5E4] cursor-pointer"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      <AiAssistCard
        title="AI assistant"
        placeholder={STUDENTS_AI_PLACEHOLDER}
        hint="Excel and CSV are read on your phone. PDF, photo, JSON and typed text use AI (needs internet). Typed instructions help the AI read PDFs and photos. You see a preview before anything is saved."
        accept=".xlsx,.xls,.csv,.pdf,.jpg,.jpeg,.png,.webp,.json,image/*,application/pdf,application/json"
        onGo={handleAiGo}
        onExport={handleExportForAi}
        exportLabel="Export file for another AI"
      />

      {/* Search Header */}
      <div className="bg-white dark:bg-[#1C1917] border border-[#E7E5E4] dark:border-[#44403C] rounded-2xl p-4 shadow-xs">
        <h2 className="text-base font-bold text-[#1C1917] dark:text-[#F5F5F4] mb-2">
          Students ({filteredStudents.length})
        </h2>
        <input
          type="search"
          value={search}
          placeholder="Search by name, father, admission, roll..."
          onChange={e => setSearch(e.target.value)}
          className="w-full p-2.5 text-xs rounded-xl border border-[#D6D3D1] dark:border-[#44403C] bg-white dark:bg-[#0C0A09] text-inherit focus:outline-none focus:ring-2 focus:ring-[#DC2626]"
        />
        {data.students.length > 1 && (
          <button
            type="button"
            onClick={handleRenumber}
            className="text-[11px] font-bold text-red-800 dark:text-red-400 hover:underline cursor-pointer"
          >
            Renumber class 01, 02, 03…
          </button>
        )}
      </div>

      {/* Student List */}
      <div className="bg-white dark:bg-[#1C1917] border border-[#E7E5E4] dark:border-[#44403C] rounded-2xl p-3.5 shadow-xs space-y-1.5">
        {filteredStudents.length === 0 ? (
          <div className="text-center py-8 text-[#78716C] dark:text-[#A8A29E] bg-[#FAFAF9] dark:bg-[#0C0A09] border border-dashed border-[#D6D3D1] dark:border-[#44403C] rounded-2xl flex flex-col items-center justify-center">
            <GraduationCap className="w-10 h-10 mb-2 text-stone-400 dark:text-stone-600" />
            <span>{search ? "No students match your search." : "No students yet. Use the form above to add one."}</span>
          </div>
        ) : (
          filteredStudents.map((s, idx) => {
            // Move Up/Down swaps with the neighbour in the FULL list, so it is only offered when the
            // list is unfiltered (otherwise it would swap with a hidden student).
            const isFiltering = search.trim() !== "";
            const isFirst = isFiltering || idx === 0;
            const isLast = isFiltering || idx === filteredStudents.length - 1;

            return (
              <div
                key={s.id}
                id={`stu-${s.id}`}
                className={`flex flex-col p-2.5 rounded-xl border transition-colors gap-2 scroll-mt-[260px] ${
                  s.id === editingId
                    ? "border-[#B91C1C] dark:border-[#F87171] ring-2 ring-[#B91C1C]/60 bg-[#FEF2F2] dark:bg-[#2A1514]"
                    : "border-[#E7E5E4] dark:border-[#44403C] hover:border-[#D6D3D1]"
                }`}
              >
                {/* Name block: full width, wraps instead of being cut off */}
                <div className="flex items-start gap-2.5 min-w-0">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold font-mono shrink-0 mt-0.5 ${isBlankRoll(s.rollNo) ? "bg-[#FEE2E2] dark:bg-[#450A0A] text-[#B91C1C] dark:text-[#FCA5A5]" : "bg-[#F5F5F4] dark:bg-[#292524] text-[#1C1917] dark:text-[#F5F5F4]"}`}>
                    Roll {s.rollNo || "— (blank)"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-sm text-[#1C1917] dark:text-[#F5F5F4] break-words leading-snug">
                      {s.name || "(no name)"}
                    </div>
                    <div className="text-xs text-[#78716C] dark:text-[#A8A29E] break-words">
                      s/o {s.fatherName || "—"}
                    </div>
                  </div>
                </div>

                {/* Action buttons: below the name */}
                <div className="flex items-center justify-end gap-1.5 pt-1.5 border-t border-[#F5F5F4] dark:border-[#292524]">
                  <button
                    type="button"
                    onClick={() => handleMove(s.id, -1)}
                    disabled={isFirst}
                    title="Move Up"
                    className="p-1.5 px-2 rounded-lg text-xs bg-[#F5F5F4] dark:bg-[#292524] text-[#1C1917] dark:text-[#F5F5F4] hover:bg-[#E7E5E4] disabled:opacity-40 cursor-pointer flex items-center justify-center"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMove(s.id, 1)}
                    disabled={isLast}
                    title="Move Down"
                    className="p-1.5 px-2 rounded-lg text-xs bg-[#F5F5F4] dark:bg-[#292524] text-[#1C1917] dark:text-[#F5F5F4] hover:bg-[#E7E5E4] disabled:opacity-40 cursor-pointer flex items-center justify-center"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEdit(s)}
                    title="Edit"
                    className="p-1.5 px-2.5 rounded-lg text-xs bg-[#D1FAE5] dark:bg-[#064E3B] text-[#065F46] dark:text-[#A7F3D0] font-bold hover:bg-[#A7F3D0] cursor-pointer flex items-center justify-center gap-1"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(s)}
                    title="Delete"
                    className="p-1.5 px-2.5 rounded-lg text-xs bg-[#F8E4E1] dark:bg-[#4A1A18] text-[#7F1D1D] dark:text-[#F0C8C0] font-bold hover:bg-[#FCA5A5] cursor-pointer flex items-center justify-center"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
      {rollConflict && (
        <RollConflictModal
          roll={rollConflict.roll}
          ownerName={rollConflict.ownerName}
          studentName={rollConflict.studentName}
          oldRoll={rollConflict.oldRoll}
          canSwap={rollConflict.canSwap}
          onChoose={mode => { const c = rollConflict; setRollConflict(null); c.apply(mode); }}
          onCancel={() => setRollConflict(null)}
        />
      )}
    </div>
  );
};

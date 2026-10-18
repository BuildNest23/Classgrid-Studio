import React, { useState } from 'react';
import { useClassroom } from '../../context/ClassroomContext';
import { Student } from '../../types';
import { newId } from '../../utils/helpers';
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
  ChevronUp
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
  const [notes, setNotes] = useState("");

  const nextAutoRoll = String(data.students.length + 1).padStart(2, "0");

  const handleEdit = (s: Student) => {
    setEditingId(s.id);
    setRollNo(s.rollNo || "");
    setAdmNo(s.admissionNo || "");
    setName(s.name || "");
    setFatherName(s.fatherName || "");
    setPhone(s.phone || "");
    setAddress(s.address || "");
    setNotes(s.notes || "");
    if (s.phone || s.address || s.notes) setShowOptional(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setRollNo("");
    setAdmNo("");
    setName("");
    setFatherName("");
    setPhone("");
    setAddress("");
    setNotes("");
    setShowOptional(false);
  };

  const syncRollNumbers = (list: Student[]): Student[] => {
    return list.map((s, idx) => ({
      ...s,
      rollNo: String(idx + 1).padStart(2, "0")
    }));
  };

  const handleSaveStudent = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast("Please enter the student's name.", "error");
      return;
    }

    if (editingId) {
      saveData(prev => {
        const original = prev.students.find(s => s.id === editingId);
        const newRoll = rollNo.trim() || (original?.rollNo || "");
        const rollChanged = !!original && newRoll !== (original.rollNo || "");

        const nextStudents = prev.students.map(s => {
          if (s.id === editingId) {
            return {
              ...s,
              rollNo: newRoll,
              admissionNo: admNo.trim(),
              name: trimmedName,
              fatherName: fatherName.trim(),
              phone: phone.trim(),
              address: address.trim(),
              notes: notes.trim()
            };
          }
          return s;
        });

        // If the roll number was changed, move the student to that position
        // (ascending order). Then renumber everyone 01, 02, 03...
        const target = parseInt(newRoll, 10);
        if (rollChanged && !isNaN(target)) {
          const edited = nextStudents.find(s => s.id === editingId)!;
          const others = nextStudents.filter(s => s.id !== editingId);
          const oldRoll = parseInt(original!.rollNo, 10);
          const movingDown = !isNaN(oldRoll) && target > oldRoll;
          // Moving up: go before anyone with the same/higher roll.
          // Moving down: go after anyone with the same/lower roll.
          let insertAt = others.findIndex(s => {
            const r = parseInt(s.rollNo, 10);
            return !isNaN(r) && (movingDown ? r > target : r >= target);
          });
          if (insertAt === -1) insertAt = others.length;
          const reordered = [...others.slice(0, insertAt), edited, ...others.slice(insertAt)];
          return { ...prev, students: syncRollNumbers(reordered) };
        }

        return { ...prev, students: nextStudents };
      });
      toast("Student updated.", "success");
      handleCancelEdit();
    } else {
      const newStudent: Student = {
        id: newId(),
        admissionNo: admNo.trim(),
        rollNo: rollNo.trim() || nextAutoRoll,
        name: trimmedName,
        fatherName: fatherName.trim(),
        phone: phone.trim(),
        address: address.trim(),
        notes: notes.trim(),
        createdAt: Date.now()
      };

      saveData(prev => {
        // A custom roll number places the student at that position and renumbers the class
        // (same rule as editing a roll number); otherwise the student is appended with the next roll.
        const target = parseInt(rollNo.trim(), 10);
        if (rollNo.trim() && !isNaN(target)) {
          let insertAt = prev.students.findIndex(s => {
            const r = parseInt(s.rollNo, 10);
            return !isNaN(r) && r >= target;
          });
          if (insertAt === -1) insertAt = prev.students.length;
          const reordered = [...prev.students.slice(0, insertAt), newStudent, ...prev.students.slice(insertAt)];
          return { ...prev, students: syncRollNumbers(reordered) };
        }
        return { ...prev, students: [...prev.students, newStudent] };
      });

      toast("Student added.", "success");
      setRollNo("");
      setAdmNo("");
      setName("");
      setFatherName("");
      setPhone("");
      setAddress("");
      setNotes("");
      setShowOptional(false);
    }
  };

  const handleMove = (id: string, dir: -1 | 1) => {
    const idx = data.students.findIndex(s => s.id === id);
    if (idx < 0) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= data.students.length) return;

    saveData(prev => {
      const nextList = [...prev.students];
      const temp = nextList[idx];
      nextList[idx] = nextList[newIdx];
      nextList[newIdx] = temp;
      const synced = syncRollNumbers(nextList);
      return { ...prev, students: synced };
    });
    toast("Student moved.", "info");
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
      const synced = syncRollNumbers(nextStudents);

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
          rollNo: String(updated.length + i + 1).padStart(2, "0"),
          name: n.name,
          fatherName: n.fatherName,
          phone: n.phone || "",
          address: "",
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

  const filteredStudents = data.students.filter(s => {
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
                <span>{showOptional ? "Hide Optional Details" : "Add Optional Details (Phone, Address, Notes)"}</span>
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
                className="flex flex-col p-2.5 rounded-xl border border-[#E7E5E4] dark:border-[#44403C] hover:border-[#D6D3D1] transition-colors gap-2"
              >
                {/* Name block: full width, wraps instead of being cut off */}
                <div className="flex items-start gap-2.5 min-w-0">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold font-mono bg-[#F5F5F4] dark:bg-[#292524] text-[#1C1917] dark:text-[#F5F5F4] shrink-0 mt-0.5">
                    Roll {s.rollNo || "—"}
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
    </div>
  );
};

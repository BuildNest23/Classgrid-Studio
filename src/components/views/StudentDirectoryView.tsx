import React, { useState } from 'react';
import { EditFieldModal } from '../EditFieldModal';
import { Student } from '../../types';
import { useClassroom } from '../../context/ClassroomContext';
import { getSortedStudents, esc } from '../../utils/helpers';
import { previewPrint } from '../../utils/printPreviewBus';
import { downloadStudentListPNG } from '../../utils/canvasExport';
import { ActionGrid, ActionButton } from '../ActionGrid';
import { HowItWorks } from '../HowItWorks';
import { Printer, Download, ArrowLeft } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { OPTIONAL_COLS, loadListColumns, saveListColumns, ListColumns, OptionalCol } from '../../utils/studentListColumns';

export const StudentDirectoryView: React.FC = () => {
  const { data, setActiveTab, toast, buildPrintHeaderHTML, saveData } = useClassroom();
  const [downloading, setDownloading] = useState(false);
  const [cols, setCols] = useState<ListColumns>(loadListColumns);
  const toggleCol = (k: OptionalCol) => {
    const next = { ...cols, [k]: !cols[k] };
    setCols(next);
    saveListColumns(next);
  };
  const sortedStudents = getSortedStudents(data.students);

  // ---- Tap a cell to correct it ----
  type FieldKey = 'rollNo' | 'admissionNo' | 'name' | 'fatherName' | 'phone' | 'address' | 'occupation' | 'notes';
  const FIELDS: Record<FieldKey, { label: string; multiline?: boolean; inputMode?: 'text' | 'numeric' | 'tel'; required?: boolean; note?: string }> = {
    rollNo: { label: 'Roll #', inputMode: 'numeric', note: 'Changing the roll # moves the student to that position and renumbers the class.' },
    admissionNo: { label: 'Adm. No' },
    name: { label: 'Name', required: true },
    fatherName: { label: 'Father Name' },
    phone: { label: 'Phone', inputMode: 'tel' },
    address: { label: 'Address', multiline: true },
    occupation: { label: 'Occupation' },
    notes: { label: 'Notes', multiline: true },
  };
  const [editing, setEditing] = useState<{ id: string; field: FieldKey } | null>(null);
  const editStudent = editing ? data.students.find(s => s.id === editing.id) : undefined;

  const saveField = (value: string) => {
    if (!editing) return;
    const { id, field } = editing;
    saveData(prev => {
      const original = prev.students.find(s => s.id === id);
      if (!original) return prev;

      if (field === 'rollNo') {
        // Same rule as the Students tab: move to that position, then renumber 01, 02, 03...
        const newRoll = value || original.rollNo || '';
        const target = parseInt(newRoll, 10);
        if (newRoll === (original.rollNo || '') || isNaN(target)) {
          return { ...prev, students: prev.students.map(s => (s.id === id ? { ...s, rollNo: newRoll } : s)) };
        }
        const edited: Student = { ...original, rollNo: newRoll };
        const others = prev.students.filter(s => s.id !== id);
        const oldRoll = parseInt(original.rollNo, 10);
        const movingDown = !isNaN(oldRoll) && target > oldRoll;
        let insertAt = others.findIndex(s => {
          const r = parseInt(s.rollNo, 10);
          return !isNaN(r) && (movingDown ? r > target : r >= target);
        });
        if (insertAt === -1) insertAt = others.length;
        const reordered = [...others.slice(0, insertAt), edited, ...others.slice(insertAt)];
        return { ...prev, students: reordered.map((s, i) => ({ ...s, rollNo: String(i + 1).padStart(2, '0') })) };
      }

      return { ...prev, students: prev.students.map(s => (s.id === id ? { ...s, [field]: value } : s)) };
    });
    setEditing(null);
    toast('Saved.', 'success');
  };

  const cellProps = (id: string, field: FieldKey) => ({
    onClick: () => setEditing({ id, field }),
    title: 'Tap to correct',
  });
  const editable = ' cursor-pointer hover:bg-[#FEF2F2] dark:hover:bg-[#2A1514] active:bg-[#FEE2E2] transition-colors';

  const handlePrint = async () => {
    const on = OPTIONAL_COLS.filter(c => cols[c.key]);
    const optCell = (k: OptionalCol, s: typeof sortedStudents[number]) =>
      k === 'phone' ? `<td class="center">${esc(s.phone || "—")}</td>`
      : k === 'address' ? `<td>${esc(s.address || "—")}</td>`
      : k === 'occupation' ? `<td>${esc(s.occupation || "—")}</td>`
      : `<td class="cg-nocap">${esc(s.notes || "—")}</td>`;
    const rows = sortedStudents.map(s => `
      <tr>
        <td class="center font-mono font-bold">${esc(s.rollNo || "—")}</td>
        <td class="center font-mono">${esc(s.admissionNo || "—")}</td>
        <td><span class="cg-fit">${esc(s.name || "—")}</span></td>
        <td><span class="cg-fit">${esc(s.fatherName || "—")}</span></td>
        ${on.map(c => optCell(c.key, s)).join("")}
      </tr>`).join("");

    // Fixed columns share 64%; the chosen optional columns share the rest (name columns grow when fewer are shown).
    const optW = on.length ? Math.floor(36 / on.length) : 0;
    const fixedExtra = on.length ? 0 : 36;
    const nameW = 22.5 + fixedExtra / 2;
    const fullPrintHTML = `<div class="print-sheet">
      ${buildPrintHeaderHTML("Student List")}
      <table>
        <thead>
          <tr>
            <th style="width:8%">Roll #</th>
            <th style="width:11%">Adm. No</th>
            <th style="width:${nameW}%">Name</th>
            <th style="width:${nameW}%">Father Name</th>
            ${on.map(c => `<th style="width:${optW}%">${c.label}</th>`).join("")}
          </tr>
        </thead>
        <tbody>${rows || `<tr><td colspan="${4 + on.length}" class="center">No students</td></tr>`}</tbody>
      </table>
    </div>`;

    const ok = await previewPrint({ html: fullPrintHTML, orientation: "portrait" }, data);
    if (!ok) toast("Could not open the print dialog. Try again.", "error");
  };

  const handleDownloadPNG = async () => {
    if (!sortedStudents.length) {
      toast("No students to save.", "info");
      return;
    }
    setDownloading(true);
    try {
      const ok = await downloadStudentListPNG(data, cols);
      if (ok) {
        toast(Capacitor.isNativePlatform() ? "Student list ready in Android share sheet." : "Student list image downloaded.", "success");
      } else {
        toast("Failed to create image.", "error");
      }
    } finally {
      setDownloading(false);
    }
  };

  const classSub = data.className ? `Class: ${data.className}` : "";
  const inchargeSub = data.inchargeName ? `Incharge: ${data.inchargeName}` : "";
  const line1 = [classSub, inchargeSub].filter(Boolean).join(" • ");

  return (
    <div className="space-y-3">
      <HowItWorks
        id="directory"
        title="About this list"
        steps={[
          <>Tap any box in the list to correct it quickly. To add or remove students, go to the <b>Students</b> tab.</>,
          <>Tap <b>Print View</b> for a paper copy, or <b>Save as Image</b> to share it, for example on WhatsApp.</>
        ]}
      />

      <div className="bg-white dark:bg-[#1C1917] border border-[#E7E5E4] dark:border-[#44403C] rounded-2xl p-4 shadow-xs space-y-3">
        <div className="flex justify-between items-center gap-2 flex-wrap">
          <div>
            <h2 className="text-base font-bold text-[#1C1917] dark:text-[#F5F5F4]">
              View Students
            </h2>
            <div className="text-xs text-[#78716C] dark:text-[#A8A29E]">
              Total: <b>{sortedStudents.length}</b> student{sortedStudents.length === 1 ? "" : "s"}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setActiveTab('dashboard')}
            className="text-xs font-bold text-red-800 dark:text-red-400 hover:underline cursor-pointer flex items-center gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Dashboard</span>
          </button>
        </div>

        <div className="rounded-xl border border-[#E7E5E4] dark:border-[#44403C] p-3">
          <div className="text-[10.5px] font-bold text-[#78716C] dark:text-[#A8A29E] uppercase tracking-wide mb-2">
            Include in print / image
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {OPTIONAL_COLS.map(c => (
              <label key={c.key} className="flex items-center gap-1.5 text-xs font-semibold text-[#1C1917] dark:text-[#F5F5F4] cursor-pointer">
                <input
                  type="checkbox"
                  checked={cols[c.key]}
                  onChange={() => toggleCol(c.key)}
                  className="w-4 h-4 accent-[#B91C1C]"
                />
                {c.label}
              </label>
            ))}
          </div>
        </div>

        <ActionGrid cols={2}>
          <ActionButton
            variant="primary"
            icon={Printer}
            onClick={handlePrint}
          >
            Print View
          </ActionButton>
          <ActionButton
            variant="secondary"
            icon={Download}
            onClick={handleDownloadPNG}
            disabled={downloading}
          >
            {downloading ? "Generating..." : "Save as Image"}
          </ActionButton>
        </ActionGrid>
      </div>

      {/* Styled Directory Sheet */}
      <div className="bg-white dark:bg-[#1C1917] border border-[#E7E5E4] dark:border-[#44403C] rounded-2xl p-4 md:p-6 shadow-xs">
        {/* Sheet Letterhead Header */}
        <div className="flex items-center gap-4 pb-3 border-b-2 border-[#1C1917] dark:border-[#F5F5F4] mb-4">
          {data.schoolLogo && (
            <div className="w-16 h-16 flex items-center justify-center shrink-0">
              <img src={data.schoolLogo} alt="Logo" className="max-h-16 max-w-16 object-contain" />
            </div>
          )}

          <div className="flex-1 text-center min-w-0">
            <h2 className="text-xl font-bold text-[#1C1917] dark:text-[#F5F5F4] m-0">
              {data.schoolName}
            </h2>
            {line1 && <div className="text-xs font-bold text-[#78716C] dark:text-[#A8A29E] mt-1">{line1}</div>}
            {data.academicYear && (
              <div className="text-xs text-[#A8A29E] mt-0.5">{data.academicYear}</div>
            )}
            <div className="text-sm font-extrabold uppercase tracking-wider text-[#B91C1C] dark:text-[#FCA5A5] mt-2">
              Student List
            </div>
          </div>

          {data.schoolLogo && <div className="w-16 h-16 shrink-0 invisible" />}
        </div>

        {/* Directory Table */}
        {sortedStudents.length === 0 ? (
          <div className="text-center py-8 text-[#78716C] dark:text-[#A8A29E]">
            No students enrolled yet. Add students in the Students tab.
          </div>
        ) : (
          <div className="overflow-x-auto border border-[#E7E5E4] dark:border-[#44403C] rounded-xl">
            <table className="w-full text-xs text-center border-collapse">
              <thead>
                <tr className="bg-[#FAFAF9] dark:bg-[#292524] text-[#1C1917] dark:text-[#F5F5F4]">
                  <th className="p-2.5 border border-[#E7E5E4] dark:border-[#44403C] w-16">Roll #</th>
                  <th className="p-2.5 border border-[#E7E5E4] dark:border-[#44403C] w-20">Adm. No</th>
                  <th className="p-2.5 border border-[#E7E5E4] dark:border-[#44403C] text-left">Name</th>
                  <th className="p-2.5 border border-[#E7E5E4] dark:border-[#44403C] text-left">Father Name</th>
                  {cols.phone && <th className="p-2.5 border border-[#E7E5E4] dark:border-[#44403C] w-24">Phone</th>}
                  {cols.address && <th className="p-2.5 border border-[#E7E5E4] dark:border-[#44403C] text-left">Address</th>}
                  {cols.occupation && <th className="p-2.5 border border-[#E7E5E4] dark:border-[#44403C] text-left">Occupation</th>}
                  {cols.notes && <th className="p-2.5 border border-[#E7E5E4] dark:border-[#44403C] text-left">Notes</th>}
                </tr>
              </thead>
              <tbody>
                {sortedStudents.map(s => (
                  <tr key={s.id} className="even:bg-[#FAFAF9] dark:even:bg-[#0C0A09]">
                    <td {...cellProps(s.id, 'rollNo')} className={"p-2.5 border border-[#E7E5E4] dark:border-[#44403C] font-mono font-bold" + editable}>{s.rollNo || "—"}</td>
                    <td {...cellProps(s.id, 'admissionNo')} className={"p-2.5 border border-[#E7E5E4] dark:border-[#44403C] font-mono" + editable}>{s.admissionNo || "—"}</td>
                    <td {...cellProps(s.id, 'name')} className={"p-2.5 border border-[#E7E5E4] dark:border-[#44403C] text-left font-semibold" + editable}>{s.name || "—"}</td>
                    <td {...cellProps(s.id, 'fatherName')} className={"p-2.5 border border-[#E7E5E4] dark:border-[#44403C] text-left text-[#78716C] dark:text-[#A8A29E]" + editable}>{s.fatherName || "—"}</td>
                    {cols.phone && <td {...cellProps(s.id, 'phone')} className={"p-2.5 border border-[#E7E5E4] dark:border-[#44403C] font-mono" + editable}>{s.phone || "—"}</td>}
                    {cols.address && <td {...cellProps(s.id, 'address')} className={"p-2.5 border border-[#E7E5E4] dark:border-[#44403C] text-left text-[#78716C] dark:text-[#A8A29E]" + editable}>{s.address || "—"}</td>}
                    {cols.occupation && <td {...cellProps(s.id, 'occupation')} className={"p-2.5 border border-[#E7E5E4] dark:border-[#44403C] text-left text-[#78716C] dark:text-[#A8A29E]" + editable}>{s.occupation || "—"}</td>}
                    {cols.notes && <td {...cellProps(s.id, 'notes')} className={"p-2.5 border border-[#E7E5E4] dark:border-[#44403C] text-left text-[#78716C] dark:text-[#A8A29E]" + editable}>{s.notes || "—"}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && editStudent && (
        <EditFieldModal
          label={FIELDS[editing.field].label}
          subject={editStudent.name}
          value={String(editStudent[editing.field] ?? '')}
          multiline={FIELDS[editing.field].multiline}
          inputMode={FIELDS[editing.field].inputMode}
          required={FIELDS[editing.field].required}
          note={FIELDS[editing.field].note}
          onSave={saveField}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
};

import React, { useState } from 'react';
import { EditFieldModal } from '../EditFieldModal';
import { RollConflictModal } from '../RollConflictModal';
import { RollMode, changeRoll, findRollOwner, formatRoll, isBlankRoll } from '../../utils/rollNumbers';
import { useClassroom } from '../../context/ClassroomContext';
import { getSortedStudents, esc, fileTitle, prettyDate, todayKey } from '../../utils/helpers';
import { previewPrint } from '../../utils/printPreviewBus';
import { downloadStudentListPNG } from '../../utils/canvasExport';
import { Printer, Share2, FileSpreadsheet, GraduationCap } from 'lucide-react';
import { exportFileBlob } from '../../utils/nativeFileExport';
import { buildSchoolSheets } from '../../collect/schoolSheet';
import { buildSchoolWorkbookBlob } from '../../collect/schoolExcel';
import { getActiveShelfId, defaultClassName } from '../../utils/classShelf';
import { Capacitor } from '@capacitor/core';
import {
  OPTIONAL_COLS,
  loadListColumns,
  saveListColumns,
  ListColumns,
  OptionalCol,
} from '../../utils/studentListColumns';

interface StudentDirectoryViewProps {
  embedded?: boolean;
  onSwitchToRoster?: () => void;
}

export const StudentDirectoryView: React.FC<StudentDirectoryViewProps> = ({
  embedded = false,
  onSwitchToRoster,
}) => {
  const { data, setActiveTab, toast, buildPrintHeaderHTML, saveData } = useClassroom();
  const [downloading, setDownloading] = useState(false);
  const [exportingXlsx, setExportingXlsx] = useState(false);
  const [cols, setCols] = useState<ListColumns>(loadListColumns);

  const toggleCol = (k: OptionalCol) => {
    const next = { ...cols, [k]: !cols[k] };
    setCols(next);
    saveListColumns(next);
  };

  const sortedStudents = getSortedStudents(data.students);

  const handleExportExcel = async () => {
    if (exportingXlsx) return;
    if (data.students.length === 0) {
      toast('No students to export yet.', 'info');
      return;
    }
    setExportingXlsx(true);
    try {
      const name = defaultClassName(data);
      const built = buildSchoolSheets(
        [{ key: getActiveShelfId() || 'open', name, data }],
        data.schoolName,
        prettyDate(todayKey())
      );
      const blob = await buildSchoolWorkbookBlob(built, data.schoolName, true);
      const ok = await exportFileBlob(blob, `${fileTitle(name, 'Students', todayKey())}.xlsx`, {
        title: `${name} - Students`,
        dialogTitle: 'Send Excel file',
        preferShareOnWeb: true,
      });
      if (ok) toast('Excel file ready.', 'success');
    } catch (e: any) {
      toast(e?.message || 'Could not make the Excel file.', 'error');
    } finally {
      setExportingXlsx(false);
    }
  };

  // ---- Tap a cell to correct it inline ----
  type FieldKey =
    | 'rollNo'
    | 'admissionNo'
    | 'name'
    | 'fatherName'
    | 'phone'
    | 'address'
    | 'occupation'
    | 'notes';

  const FIELDS: Record<
    FieldKey,
    {
      label: string;
      multiline?: boolean;
      inputMode?: 'text' | 'numeric' | 'tel';
      required?: boolean;
      note?: string;
    }
  > = {
    rollNo: {
      label: 'Roll #',
      inputMode: 'numeric',
      note: 'Other students are not renumbered. If the number is taken, you will be asked what to do.',
    },
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

  const [rollConflict, setRollConflict] = useState<null | {
    roll: string;
    ownerName: string;
    studentName: string;
    oldRoll: string;
    id: string;
  }>(null);

  const applyRoll = (id: string, roll: string, mode: RollMode) => {
    saveData(prev => ({ ...prev, students: changeRoll(prev.students, id, roll, mode) }));
    setEditing(null);
    toast('Saved.', 'success');
  };

  const saveField = (value: string) => {
    if (!editing) return;
    const { id, field } = editing;

    if (field === 'rollNo') {
      const original = data.students.find(x => x.id === id);
      const wanted = formatRoll(value) || original?.rollNo || '';
      if (!original || wanted === (original.rollNo || '')) {
        setEditing(null);
        return;
      }
      const owner = findRollOwner(data.students, id, wanted);
      if (owner) {
        setRollConflict({
          roll: wanted,
          ownerName: owner.name,
          studentName: original.name,
          oldRoll: original.rollNo || '',
          id,
        });
        return;
      }
      applyRoll(id, wanted, 'plain');
      return;
    }

    saveData(prev => {
      const original = prev.students.find(x => x.id === id);
      if (!original) return prev;
      return {
        ...prev,
        students: prev.students.map(s => (s.id === id ? { ...s, [field]: value } : s)),
      };
    });
    setEditing(null);
    toast('Saved.', 'success');
  };

  const cellProps = (id: string, field: FieldKey) => ({
    onClick: () => setEditing({ id, field }),
    title: 'Tap to correct',
  });

  const editable =
    ' cursor-pointer hover:bg-red-50/70 dark:hover:bg-red-950/30 active:bg-red-100/80 transition-colors';

  const handlePrint = async () => {
    const on = OPTIONAL_COLS.filter(c => cols[c.key]);
    const optCell = (k: OptionalCol, s: (typeof sortedStudents)[number]) =>
      k === 'phone'
        ? `<td class="center">${esc(s.phone || '—')}</td>`
        : k === 'address'
        ? `<td>${esc(s.address || '—')}</td>`
        : k === 'occupation'
        ? `<td>${esc(s.occupation || '—')}</td>`
        : `<td class="cg-nocap">${esc(s.notes || '—')}</td>`;

    const rows = sortedStudents
      .map(
        s => `
      <tr>
        <td class="center font-mono font-bold">${esc(s.rollNo || '—')}</td>
        <td class="center font-mono">${esc(s.admissionNo || '—')}</td>
        <td><span class="cg-fit">${esc(s.name || '—')}</span></td>
        <td><span class="cg-fit">${esc(s.fatherName || '—')}</span></td>
        ${on.map(c => optCell(c.key, s)).join('')}
      </tr>`
      )
      .join('');

    const optW = on.length ? Math.floor(36 / on.length) : 0;
    const fixedExtra = on.length ? 0 : 36;
    const nameW = 22.5 + fixedExtra / 2;
    const fullPrintHTML = `<div class="print-sheet">
      ${buildPrintHeaderHTML('Student List')}
      <table>
        <thead>
          <tr>
            <th style="width:8%">Roll #</th>
            <th style="width:11%">Adm. No</th>
            <th style="width:${nameW}%">Name</th>
            <th style="width:${nameW}%">Father Name</th>
            ${on.map(c => `<th style="width:${optW}%">${c.label}</th>`).join('')}
          </tr>
        </thead>
        <tbody>${rows || `<tr><td colspan="${4 + on.length}" class="center">No students</td></tr>`}</tbody>
      </table>
    </div>`;

    const ok = await previewPrint({ html: fullPrintHTML, orientation: 'portrait' }, data);
    if (!ok) toast('Could not open the print dialog. Try again.', 'error');
  };

  const handleDownloadPNG = async () => {
    if (!sortedStudents.length) {
      toast('No students to save.', 'info');
      return;
    }
    setDownloading(true);
    try {
      const ok = await downloadStudentListPNG(data, cols);
      if (ok) {
        toast(
          Capacitor.isNativePlatform()
            ? 'Student list ready in Android share sheet.'
            : 'Student list image ready to share.',
          'success'
        );
      } else {
        toast('Failed to create image.', 'error');
      }
    } finally {
      setDownloading(false);
    }
  };

  const classSub = data.className ? `Class: ${data.className}` : '';
  const inchargeSub = data.inchargeName ? `Incharge: ${data.inchargeName}` : '';
  const line1 = [classSub, inchargeSub].filter(Boolean).join(' · ');

  return (
    <div className="space-y-4">
      {/* Export & Column Controls */}
      <section className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            {!embedded && (
              <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">
                Print &amp; Quick-Edit Sheet
              </h2>
            )}
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Tap any cell in the sheet below to fix typos instantly before printing or exporting.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <button
              type="button"
              onClick={handlePrint}
              className="flex-1 sm:flex-none min-h-[44px] px-4 py-2 rounded-xl bg-red-800 hover:bg-red-900 dark:bg-red-700 dark:hover:bg-red-600 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer active:scale-[0.98] whitespace-nowrap"
            >
              <Printer className="w-4 h-4" />
              <span>Print / PDF</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadPNG}
              disabled={downloading}
              className="flex-1 sm:flex-none min-h-[44px] px-3.5 py-2 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/70 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-800 dark:text-stone-100 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              <Share2 className="w-4 h-4 text-stone-500 dark:text-stone-400" />
              <span>{downloading ? 'Preparing…' : 'Share image'}</span>
            </button>
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={exportingXlsx}
              className="flex-1 sm:flex-none min-h-[44px] px-3.5 py-2 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/70 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-800 dark:text-stone-100 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              <FileSpreadsheet className="w-4 h-4 text-stone-500 dark:text-stone-400" />
              <span>{exportingXlsx ? 'Exporting…' : 'Export Excel'}</span>
            </button>
          </div>
        </div>

        {/* Optional Columns Selector */}
        <div className="pt-3 border-t border-stone-100 dark:border-stone-800 flex flex-wrap items-center gap-x-5 gap-y-2">
          <span className="text-xs font-medium text-stone-500 dark:text-stone-400">
            Include columns:
          </span>
          {OPTIONAL_COLS.map(c => (
            <label
              key={c.key}
              className="min-h-[36px] inline-flex items-center gap-2 text-xs font-semibold text-stone-800 dark:text-stone-200 cursor-pointer select-none"
            >
              <input
                type="checkbox"
                checked={cols[c.key]}
                onChange={() => toggleCol(c.key)}
                className="w-4 h-4 rounded accent-red-800 cursor-pointer"
              />
              {c.label}
            </label>
          ))}
        </div>
      </section>

      {/* Printable Roster Preview Sheet */}
      <section className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-4 sm:p-6">
        <div className="flex items-center gap-4 pb-4 border-b border-stone-300 dark:border-stone-700 mb-4">
          {data.schoolLogo && (
            <div className="w-14 h-14 flex items-center justify-center shrink-0">
              <img
                src={data.schoolLogo}
                alt="School logo"
                className="max-h-14 max-w-14 object-contain"
              />
            </div>
          )}

          <div className="flex-1 text-center min-w-0">
            <h3 className="text-lg sm:text-xl font-bold text-stone-900 dark:text-stone-100 m-0">
              {data.schoolName || 'School Name'}
            </h3>
            {line1 && (
              <div className="text-xs font-medium text-stone-500 dark:text-stone-400 mt-0.5">
                {line1}
              </div>
            )}
            {data.academicYear && (
              <div className="text-xs text-stone-400 dark:text-stone-500 mt-0.5 tabular-nums">
                {data.academicYear}
              </div>
            )}
            <div className="text-xs font-semibold text-red-800 dark:text-red-400 mt-2 tabular-nums">
              Student Roster · {sortedStudents.length} {sortedStudents.length === 1 ? 'student' : 'students'}
            </div>
          </div>

          {data.schoolLogo && <div className="w-14 h-14 shrink-0 invisible" />}
        </div>

        {sortedStudents.length === 0 ? (
          <div className="py-10 text-center">
            <GraduationCap className="w-8 h-8 mx-auto text-stone-400 dark:text-stone-600" />
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-2">
              No students enrolled yet.
            </p>
            <button
              type="button"
              onClick={() => (onSwitchToRoster ? onSwitchToRoster() : setActiveTab('students'))}
              className="mt-3 min-h-[42px] px-4 py-2 rounded-xl bg-red-800 hover:bg-red-900 text-white text-xs font-semibold cursor-pointer"
            >
              Add students
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto border border-stone-200 dark:border-stone-800 rounded-xl">
            <table className="w-full text-xs text-center border-collapse">
              <thead>
                <tr className="bg-stone-50 dark:bg-stone-800/80 text-stone-700 dark:text-stone-200 border-b border-stone-200 dark:border-stone-800">
                  <th className="p-2.5 font-semibold w-16 border-r border-stone-200 dark:border-stone-800">
                    Roll #
                  </th>
                  <th className="p-2.5 font-semibold w-20 border-r border-stone-200 dark:border-stone-800">
                    Adm. No
                  </th>
                  <th className="p-2.5 font-semibold text-left border-r border-stone-200 dark:border-stone-800">
                    Name
                  </th>
                  <th className="p-2.5 font-semibold text-left border-r border-stone-200 dark:border-stone-800 last:border-r-0">
                    Father Name
                  </th>
                  {cols.phone && (
                    <th className="p-2.5 font-semibold w-28 border-r border-stone-200 dark:border-stone-800 last:border-r-0">
                      Phone
                    </th>
                  )}
                  {cols.address && (
                    <th className="p-2.5 font-semibold text-left border-r border-stone-200 dark:border-stone-800 last:border-r-0">
                      Address
                    </th>
                  )}
                  {cols.occupation && (
                    <th className="p-2.5 font-semibold text-left border-r border-stone-200 dark:border-stone-800 last:border-r-0">
                      Occupation
                    </th>
                  )}
                  {cols.notes && <th className="p-2.5 font-semibold text-left">Notes</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
                {sortedStudents.map(s => (
                  <tr key={s.id} className="even:bg-stone-50/50 dark:even:bg-stone-950/30">
                    <td
                      {...cellProps(s.id, 'rollNo')}
                      className={
                        'p-2.5 border-r border-stone-200 dark:border-stone-800 font-mono-num font-bold' +
                        (isBlankRoll(s.rollNo)
                          ? ' text-red-700 dark:text-red-400 bg-red-50/80 dark:bg-red-950/30'
                          : ' text-stone-900 dark:text-stone-100') +
                        editable
                      }
                    >
                      {s.rollNo || '—'}
                    </td>
                    <td
                      {...cellProps(s.id, 'admissionNo')}
                      className={
                        'p-2.5 border-r border-stone-200 dark:border-stone-800 font-mono-num text-stone-600 dark:text-stone-300' +
                        editable
                      }
                    >
                      {s.admissionNo || '—'}
                    </td>
                    <td
                      {...cellProps(s.id, 'name')}
                      className={
                        'p-2.5 border-r border-stone-200 dark:border-stone-800 text-left font-semibold text-stone-900 dark:text-stone-100' +
                        editable
                      }
                    >
                      {s.name || '—'}
                    </td>
                    <td
                      {...cellProps(s.id, 'fatherName')}
                      className={
                        'p-2.5 border-r border-stone-200 dark:border-stone-800 last:border-r-0 text-left text-stone-600 dark:text-stone-400' +
                        editable
                      }
                    >
                      {s.fatherName || '—'}
                    </td>
                    {cols.phone && (
                      <td
                        {...cellProps(s.id, 'phone')}
                        className={
                          'p-2.5 border-r border-stone-200 dark:border-stone-800 last:border-r-0 font-mono-num text-stone-600 dark:text-stone-300' +
                          editable
                        }
                      >
                        {s.phone || '—'}
                      </td>
                    )}
                    {cols.address && (
                      <td
                        {...cellProps(s.id, 'address')}
                        className={
                          'p-2.5 border-r border-stone-200 dark:border-stone-800 last:border-r-0 text-left text-stone-600 dark:text-stone-400' +
                          editable
                        }
                      >
                        {s.address || '—'}
                      </td>
                    )}
                    {cols.occupation && (
                      <td
                        {...cellProps(s.id, 'occupation')}
                        className={
                          'p-2.5 border-r border-stone-200 dark:border-stone-800 last:border-r-0 text-left text-stone-600 dark:text-stone-400' +
                          editable
                        }
                      >
                        {s.occupation || '—'}
                      </td>
                    )}
                    {cols.notes && (
                      <td
                        {...cellProps(s.id, 'notes')}
                        className={
                          'p-2.5 text-left text-stone-600 dark:text-stone-400' + editable
                        }
                      >
                        {s.notes || '—'}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

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

      {rollConflict && (
        <RollConflictModal
          roll={rollConflict.roll}
          ownerName={rollConflict.ownerName}
          studentName={rollConflict.studentName}
          oldRoll={rollConflict.oldRoll}
          canSwap={true}
          onChoose={mode => {
            const c = rollConflict;
            setRollConflict(null);
            applyRoll(c.id, c.roll, mode);
          }}
          onCancel={() => setRollConflict(null)}
        />
      )}
    </div>
  );
};

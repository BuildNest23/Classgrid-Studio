import React, { useState, useMemo, useRef, useEffect } from 'react';
import { SyncInput } from '../SyncInput';
import { exportReportCardsZip } from '../../utils/reportCardImages';
import { AiAssistCard } from '../AiAssistCard';
import { ResultCardModal } from '../ResultCardModal';
import { WatermarkOptions } from '../WatermarkOptions';
import { useClassroom } from '../../context/ClassroomContext';
import { Assessment } from '../../types';
import {
  newAssessId,
  newAssessSubId,
  ordinal,
  getSortedStudents,
  getNameColWidth,
  planResultPrintLayout,
  gridNavKeyDown,
  gridTabIndex,
  fileTitle,
} from '../../utils/helpers';
import { Capacitor } from '@capacitor/core';
import { previewPrint } from '../../utils/printPreviewBus';
import { triggerPrint, savePdfToDownloads } from '../../utils/printEngine';
import { exportFileBlob } from '../../utils/nativeFileExport';
import { buildResultsAiFile, planResultsImport } from '../../utils/aiExchange';
import {
  detectKind,
  readResultsSheet,
  readResultsWithAi,
  remarkRowsToResultsFile,
  generateRemarksWithAi,
  generatedRemarksToResultsFile,
  planMarksImport,
  aiReadingAvailable,
  hasAiConsent,
  saveAiConsent,
  type MarkRow
} from '../../utils/fileImport';
import {
  ResultPrintStyle,
  loadPrintStyle,
  savePrintStyle,
  loadPrintFooter,
  savePrintFooter,
  buildClassResultHTML,
  buildReportCardsHTML,
  buildBlankReportCardHTML,
  buildBlankMarksSheetHTML,
  buildCompactMarksSheetHTML,
  buildMeritListHTML,
} from '../../utils/resultPrint';
import {
  ArrowLeft,
  Printer,
  Edit3,
  Trash2,
  Copy,
  Plus,
  BarChart3,
  X,
  ChevronDown,
  ChevronRight,
  Lock,
  Unlock,
  Search,
  FileUp,
  FileText,
  Award,
  FolderArchive,
  Table2,
  UserCheck,
  BookOpen,
  Download,
} from 'lucide-react';
import {
  loadResultsCollapse,
  saveResultsCollapse,
  ResultsCollapseState,
} from '../../utils/resultsCollapse';
import { PlainTextInput } from '../PlainTextInput';
import { confirmCardPrintSettings } from '../../utils/printSettingsPrompt';

const RESULTS_AI_PLACEHOLDER =
  "Attach a file and tap Go, or tap Go with no file to write remarks from the marks.\n\nYou can add instructions, for example:\n• Write remarks in Urdu, short and kind\n• Be gentle with failed students\n• Mention weak subjects\n• In the file, marks are in the last 5 columns";

export const ResultsView: React.FC = () => {
  const {
    data,
    saveData,
    quickSaveData,
    flushSave,
    toast,
    uiConfirm,
    uiPrompt,
    activeAssessmentId,
    setActiveAssessmentId,
    computeAssessmentRanking,
    assessmentEntryCount,
    setActiveTab
  } = useClassroom();

  const [newFormOpen, setNewFormOpen] = useState(false);
  const [newAsmtName, setNewAsmtName] = useState("");
  const [newAsmtPass, setNewAsmtPass] = useState(40);

  // Subject adding form
  const [newSubName, setNewSubName] = useState("");
  const [newSubMax, setNewSubMax] = useState("");
  const [copyPickerOpen, setCopyPickerOpen] = useState(false);
  const [cardChoice, setCardChoice] = useState(false);
  const [zipProgress, setZipProgress] = useState<{ done: number; total: number } | null>(null);
  const zipCancelRef = useRef(false);

  // Import & AI disclosure
  const [importOpen, setImportOpen] = useState(false);
  const [studentQuery, setStudentQuery] = useState("");

  // Print design: A = colour, B = black & white (remembered on this device)
  const [cardStudentId, setCardStudentId] = useState<string | null>(null);

  // Quick-entry popups (two mutually exclusive modes)
  const [studentEntryOn, setStudentEntryOn] = useState(false);
  const [subjectEntryOn, setSubjectEntryOn] = useState(false);
  const [entryStudentId, setEntryStudentId] = useState<string | null>(null);
  const [entrySubjectId, setEntrySubjectId] = useState<string | null>(null);
  const [printStyle, setPrintStyleState] = useState<ResultPrintStyle>(loadPrintStyle);
  const [printFooter, setPrintFooterState] = useState<string>(loadPrintFooter);

  const changePrintFooter = (text: string) => {
    setPrintFooterState(text);
    savePrintFooter(text);
  };
  const choosePrintStyle = (st: ResultPrintStyle) => {
    setPrintStyleState(st);
    savePrintStyle(st);
  };

  const activeAsmt = data.assessments.find(a => a.id === activeAssessmentId);
  const sortedStudents = getSortedStudents(data.students);

  // Snug Name column: exact width of the longest student name (and the Average/Highest/Lowest labels).
  const nameColWidth = useMemo(
    () => getNameColWidth(sortedStudents.map(s => s.name || ""), ["Average →", "Highest →", "Lowest →"]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.students]
  );

  const [collapse, setCollapse] = useState<ResultsCollapseState>(loadResultsCollapse);
  const toggleCollapse = (key: keyof ResultsCollapseState) => {
    setCollapse(prev => {
      const next = { ...prev, [key]: !prev[key] };
      saveResultsCollapse(next);
      return next;
    });
  };

  // Reset search when changing assessments
  useEffect(() => {
    setStudentQuery("");
    setCopyPickerOpen(false);
    setImportOpen(false);
  }, [activeAssessmentId]);

  // Escape key closes Report Cards choice modal
  useEffect(() => {
    if (!cardChoice) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCardChoice(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cardChoice]);

  // 1. ASSESSMENT LIST VIEW
  if (!activeAsmt) {
    const handleCreateAsmt = (e: React.FormEvent) => {
      e.preventDefault();
      const trimmedName = newAsmtName.trim();
      if (!trimmedName) {
        toast("Please enter an assessment name.", "error");
        return;
      }
      const passPct = Number(newAsmtPass) || 40;
      const newAsmt: Assessment = {
        id: newAssessId(),
        name: trimmedName,
        passPercent: Math.max(1, Math.min(100, Math.round(passPct))),
        subjects: [],
        createdAt: Date.now()
      };

      saveData(prev => ({
        ...prev,
        assessments: [...prev.assessments, newAsmt]
      }));

      setNewFormOpen(false);
      setNewAsmtName("");
      setNewAsmtPass(40);
      setActiveAssessmentId(newAsmt.id);
      toast("Assessment created. Now add subjects.", "success");
    };

    const sortedAssessments = data.assessments
      .slice()
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    return (
      <div className="cg-view-enter space-y-5">
        {/* Masthead */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-stone-500 dark:text-stone-400">
              {data.className || 'Class'} · <span className="font-mono-num">{data.assessments.length}</span> {data.assessments.length === 1 ? 'assessment' : 'assessments'}
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-50 mt-0.5">
              Results
            </h1>
          </div>
          {sortedAssessments.length > 0 && (
            <button
              type="button"
              onClick={() => setNewFormOpen(o => !o)}
              className={`min-h-[44px] px-4 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer shrink-0 ${
                newFormOpen
                  ? 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-200 hover:bg-stone-200 dark:hover:bg-stone-700'
                  : 'bg-red-800 hover:bg-red-900 dark:bg-red-700 dark:hover:bg-red-600 text-white'
              }`}
            >
              {newFormOpen ? (
                <>
                  <X className="w-4 h-4" />
                  <span>Cancel</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>New assessment</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Inline Creation Surface */}
        {newFormOpen && (
          <form
            onSubmit={handleCreateAsmt}
            className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-4 sm:p-5 space-y-4"
          >
            <div>
              <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100">Create assessment</h2>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                Set the exam name and passing percentage. You can add subjects next.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1">
                  Assessment name
                </label>
                <PlainTextInput
                  value={newAsmtName}
                  placeholder="e.g. First Term, Monthly Test 1, Final Exam"
                  onChange={e => setNewAsmtName(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 text-sm rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:border-red-700 dark:focus:border-red-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1">
                  Pass percentage (%)
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={newAsmtPass}
                  onChange={e => setNewAsmtPass(Number(e.target.value))}
                  className="w-full min-h-[44px] px-3 py-2 text-sm font-mono-num rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100 focus:outline-none focus:border-red-700 dark:focus:border-red-500"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setNewFormOpen(false)}
                className="min-h-[44px] px-4 rounded-xl text-sm font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="min-h-[44px] px-5 rounded-xl text-sm font-semibold bg-red-800 hover:bg-red-900 dark:bg-red-700 dark:hover:bg-red-600 text-white inline-flex items-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Create assessment</span>
              </button>
            </div>
          </form>
        )}

        {/* Assessments Grid */}
        {sortedAssessments.length === 0 ? (
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl px-6 py-12 text-center flex flex-col items-center">
            <div className="w-12 h-12 rounded-2xl bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-stone-400 dark:text-stone-500 mb-3">
              <BarChart3 className="w-6 h-6" />
            </div>
            <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">No assessments yet</h2>
            <p className="text-sm text-stone-500 dark:text-stone-400 mt-1 max-w-sm">
              Create your first exam or monthly test to enter marks, compute ranks, and print report cards.
            </p>
            {!newFormOpen && (
              <button
                type="button"
                onClick={() => setNewFormOpen(true)}
                className="mt-5 min-h-[44px] px-4 rounded-xl text-sm font-semibold bg-red-800 hover:bg-red-900 dark:bg-red-700 dark:hover:bg-red-600 text-white inline-flex items-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>New assessment</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sortedAssessments.map(a => {
              const totalMax = a.subjects.reduce((sum, s) => sum + (Number(s.max) || 0), 0);
              const entered = assessmentEntryCount(a.id);
              const total = data.students.length;
              const pct = total ? Math.round((entered / total) * 100) : 0;
              const complete = entered >= total && total > 0;

              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setActiveAssessmentId(a.id)}
                  className="group text-left p-4 rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 hover:border-stone-300 dark:hover:border-stone-700 transition-colors cursor-pointer flex flex-col justify-between gap-3"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex items-center gap-1.5">
                        <span className="text-[15px] font-bold text-stone-900 dark:text-stone-100 truncate">
                          {a.name}
                        </span>
                        {a.locked && (
                          <Lock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" aria-label="Locked" />
                        )}
                      </div>
                      <ChevronRight className="w-4 h-4 text-stone-400 group-hover:text-stone-700 dark:group-hover:text-stone-200 shrink-0 mt-0.5 transition-transform group-hover:translate-x-0.5" />
                    </div>
                    <p className="text-xs text-stone-500 dark:text-stone-400 mt-1 font-mono-num">
                      {a.subjects.length} {a.subjects.length === 1 ? 'subject' : 'subjects'} · Max {totalMax} · Pass {a.passPercent}%
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <div className="w-full h-1.5 bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          complete
                            ? 'bg-emerald-700 dark:bg-emerald-500'
                            : entered > 0
                            ? 'bg-red-800 dark:bg-red-500'
                            : 'bg-stone-300 dark:bg-stone-700'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-stone-500 dark:text-stone-400 font-mono-num">
                      <span>
                        <strong className="font-semibold text-stone-800 dark:text-stone-200">{entered}</strong> / {total} entered
                      </span>
                      <span className={complete ? 'font-semibold text-emerald-700 dark:text-emerald-400' : ''}>
                        {pct}%
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // 2. ACTIVE ASSESSMENT MARKS ENTRY VIEW
  const ranked = computeAssessmentRanking(activeAsmt.id);
  const totalMax = activeAsmt.subjects.reduce((sum, s) => sum + (Number(s.max) || 0), 0);
  const entered = assessmentEntryCount(activeAsmt.id);
  const progressPct = data.students.length ? Math.round((entered / data.students.length) * 100) : 0;

  const evaluatedCount = ranked.filter(item => item.r.maxTotal > 0).length;
  const passedCount = ranked.filter(item => item.r.maxTotal > 0 && item.r.passed).length;
  const passRatePct = evaluatedCount ? Math.round((passedCount / evaluatedCount) * 100) : null;

  const trimmedQuery = studentQuery.trim().toLowerCase();
  const visibleRanked = trimmedQuery
    ? ranked.filter(
        ({ s }) =>
          (s.name || '').toLowerCase().includes(trimmedQuery) ||
          (s.rollNo || '').toLowerCase().includes(trimmedQuery)
      )
    : ranked;

  const isLocked = !!activeAsmt.locked;
  const handleToggleLock = () => {
    const nextLocked = !isLocked;
    saveData(prev => ({
      ...prev,
      assessments: prev.assessments.map(a =>
        a.id === activeAsmt.id ? { ...a, locked: nextLocked } : a
      ),
    }));
    if (nextLocked) {
      setStudentEntryOn(false);
      setSubjectEntryOn(false);
    }
    toast(nextLocked ? "Assessment grid locked." : "Assessment grid unlocked.", "info");
  };

  // Rename
  const handleRename = async () => {
    const val = await uiPrompt("Assessment name:", activeAsmt.name, {
      title: "Rename Assessment",
      yesText: "Save",
      icon: "edit"
    });
    if (val === null) return;
    const trimmed = String(val).trim();
    if (!trimmed) return;

    saveData(prev => ({
      ...prev,
      assessments: prev.assessments.map(a => (a.id === activeAsmt.id ? { ...a, name: trimmed } : a))
    }));
    toast("Assessment renamed.", "success");
  };

  // Delete
  const handleDelete = async () => {
    const ok = await uiConfirm(`Delete assessment "${activeAsmt.name}"?\n\nAll its marks and remarks will be permanently deleted.`, {
      title: "Delete Assessment",
      yesText: "Delete",
      danger: true,
      icon: "warning"
    });
    if (!ok) return;

    saveData(prev => {
      const nextAsmts = prev.assessments.filter(a => a.id !== activeAsmt.id);
      const nextResults = { ...prev.assessmentResults };
      delete nextResults[activeAsmt.id];
      const nextManual = { ...prev.assessmentManualPass };
      delete nextManual[activeAsmt.id];
      const nextRemarks = { ...prev.assessmentRemarks };
      delete nextRemarks[activeAsmt.id];

      return {
        ...prev,
        assessments: nextAsmts,
        assessmentResults: nextResults,
        assessmentManualPass: nextManual,
        assessmentRemarks: nextRemarks
      };
    });

    setActiveAssessmentId(null);
    toast("Assessment deleted.", "success");
  };

  // Update Pass Percent
  const handleUpdatePassPercent = (v: string) => {
    const n = Math.max(1, Math.min(100, Math.round(Number(v) || 40)));
    saveData(prev => ({
      ...prev,
      assessments: prev.assessments.map(a => (a.id === activeAsmt.id ? { ...a, passPercent: n } : a))
    }));
  };

  // Add Subject Inline
  const handleAddSubject = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newSubName.trim();
    const max = Math.max(0, Number(newSubMax) || 0);
    if (!name) {
      toast("Enter a subject name.", "error");
      return;
    }

    saveData(prev => ({
      ...prev,
      assessments: prev.assessments.map(a => {
        if (a.id === activeAsmt.id) {
          return {
            ...a,
            subjects: [...a.subjects, { id: newAssessSubId(), name, max: Math.round(max) }]
          };
        }
        return a;
      })
    }));

    setNewSubName("");
    setNewSubMax("");
    toast(max > 0 ? "Subject added." : "Subject added. Set its max marks before entering marks.", "success");
  };

  // Rename Subject Inline
  const handleRenameSubject = (subId: string, rawName: string) => {
    const name = rawName.trim();
    if (!name) return;
    saveData(prev => ({
      ...prev,
      assessments: prev.assessments.map(a => {
        if (a.id === activeAsmt.id) {
          return {
            ...a,
            subjects: a.subjects.map(s => (s.id === subId ? { ...s, name } : s))
          };
        }
        return a;
      })
    }));
  };

  // Change Subject Max Inline
  const handleChangeSubjectMax = (subId: string, maxVal: string) => {
    const n = Math.max(0, Math.round(Number(maxVal) || 0));
    saveData(prev => ({
      ...prev,
      assessments: prev.assessments.map(a => {
        if (a.id === activeAsmt.id) {
          return {
            ...a,
            subjects: a.subjects.map(s => (s.id === subId ? { ...s, max: n } : s))
          };
        }
        return a;
      })
    }));
  };

  // Remove Subject
  const handleRemoveSubject = async (subId: string, subName: string) => {
    const ok = await uiConfirm(`Remove subject "${subName}"?\n\nAll scores in this subject will be deleted.`, {
      title: "Remove Subject",
      yesText: "Remove",
      danger: true,
      icon: "warning"
    });
    if (!ok) return;

    saveData(prev => {
      const nextResults = { ...prev.assessmentResults };
      if (nextResults[activeAsmt.id]) {
        Object.keys(nextResults[activeAsmt.id]).forEach(sid => {
          delete nextResults[activeAsmt.id][sid][subId];
        });
      }

      return {
        ...prev,
        assessments: prev.assessments.map(a => {
          if (a.id === activeAsmt.id) {
            return {
              ...a,
              subjects: a.subjects.filter(s => s.id !== subId)
            };
          }
          return a;
        }),
        assessmentResults: nextResults
      };
    });
    toast("Subject removed.", "success");
  };

  // Copy subjects from other assessments
  const handleCopySubjects = (sourceAsmtId: string) => {
    const src = data.assessments.find(a => a.id === sourceAsmtId);
    if (!src) return;
    const existing = new Set(activeAsmt.subjects.map(s => s.name.toLowerCase()));
    let added = 0;

    saveData(prev => {
      const newSubs = [...activeAsmt.subjects];
      src.subjects.forEach(s => {
        if (!existing.has(s.name.toLowerCase())) {
          newSubs.push({ id: newAssessSubId(), name: s.name, max: s.max });
          added++;
        }
      });
      return {
        ...prev,
        assessments: prev.assessments.map(a => (a.id === activeAsmt.id ? { ...a, subjects: newSubs } : a))
      };
    });

    setCopyPickerOpen(false);
    toast(added ? `Copied ${added} subject(s).` : "All subjects already exist.", added ? "success" : "info");
  };

  // Marks Input Change
  const handleMarkChange = (sid: string, subId: string, val: string) => {
    const trimmed = val.trim();
    const asmtId = activeAsmt.id;
    saveData(prev => {
      const results = prev.assessmentResults;
      const row = { ...((results[asmtId] || {})[sid] || {}) };

      if (trimmed === "") {
        delete row[subId];
      } else if (/^a$/i.test(trimmed)) {
        row[subId] = 'A';
      } else {
        if (!/^(\d+\.?\d*|\.\d+)$/.test(trimmed)) return prev;
        const num = Number(trimmed);
        if (!isFinite(num)) return prev;
        row[subId] = num;
      }

      const asmtRows = { ...(results[asmtId] || {}) };
      if (Object.keys(row).length === 0) delete asmtRows[sid];
      else asmtRows[sid] = row;

      return { ...prev, assessmentResults: { ...results, [asmtId]: asmtRows } };
    });
  };

  // Save many marks at once (used by the quick-entry popups)
  const handleBulkMarks = (entries: { sid: string; subId: string; text: string }[]) => {
    const asmtId = activeAsmt.id;
    saveData(prev => {
      const results = { ...prev.assessmentResults };
      const asmtRows = { ...(results[asmtId] || {}) };
      entries.forEach(({ sid, subId, text }) => {
        const parsed = parseMarkText(text);
        if (!parsed.ok) return;
        const row = { ...(asmtRows[sid] || {}) };
        if (parsed.value === undefined) delete row[subId];
        else row[subId] = parsed.value;
        if (Object.keys(row).length === 0) delete asmtRows[sid];
        else asmtRows[sid] = row;
      });
      results[asmtId] = asmtRows;
      return { ...prev, assessmentResults: results };
    });
  };

  // Toggle Absent button
  const handleToggleAbsent = (sid: string, subId: string) => {
    const curVal = ((data.assessmentResults[activeAsmt.id] || {})[sid] || {})[subId];
    handleMarkChange(sid, subId, curVal === 'A' ? '' : 'A');
  };

  // Remarks Change
  const handleRemarkChange = (sid: string, remark: string) => {
    quickSaveData(prev => {
      const nextRemarks = { ...prev.assessmentRemarks };
      if (!nextRemarks[activeAsmt.id]) nextRemarks[activeAsmt.id] = {};
      if (remark.trim() === "") delete nextRemarks[activeAsmt.id][sid];
      else nextRemarks[activeAsmt.id][sid] = remark;
      return { ...prev, assessmentRemarks: nextRemarks };
    });
  };

  // Manual Pass Toggle
  const handleToggleManualPass = (sid: string) => {
    saveData(prev => {
      const nextManual = { ...prev.assessmentManualPass };
      if (!nextManual[activeAsmt.id]) nextManual[activeAsmt.id] = {};
      const cur = !!nextManual[activeAsmt.id][sid];
      if (cur) delete nextManual[activeAsmt.id][sid];
      else nextManual[activeAsmt.id][sid] = true;

      return { ...prev, assessmentManualPass: nextManual };
    });
    toast("Pass status updated.", "success");
  };

  // Subject Stats (Average, High, Low)
  const subjectStats = activeAsmt.subjects.map(sub => {
    let sum = 0;
    let cnt = 0;
    let hi = -1;
    let lo = Infinity;

    data.students.forEach(s => {
      const raw = ((data.assessmentResults[activeAsmt.id] || {})[s.id] || {})[sub.id];
      if (raw === undefined) return;
      const num = raw === 'A' ? 0 : Number(raw);
      if (isNaN(num)) return;
      sum += num;
      cnt++;
      if (num > hi) hi = num;
      if (num < lo) lo = num;
    });

    return {
      subId: sub.id,
      avg: cnt ? Math.round((sum / cnt) * 10) / 10 : 0,
      hi: hi < 0 ? 0 : hi,
      lo: lo === Infinity ? 0 : lo,
      cnt
    };
  });

  const otherAsmts = data.assessments.filter(a => a.id !== activeAsmt.id);

  // Print Handlers
  const printCtx = () => ({
    style: printStyle,
    data,
    asmt: activeAsmt,
    ranked,
    totalMax,
    footerText: printFooter,
  });

  const handlePrintClassResults = async () => {
    if (!activeAsmt.subjects.length) {
      toast("Add subjects first.", "error");
      return;
    }
    const ctx = printCtx();
    const stuNames = ranked.map(item => item.s.name || "");
    const subNames = activeAsmt.subjects.map(sub => sub.name);
    const layout = planResultPrintLayout(stuNames, subNames, data.printSize, data.forceOrientation);
    const ok = await previewPrint(
      {
        html: buildClassResultHTML(ctx, layout, data.printSize),
        orientation: layout.orientation,
        pageNumbers: true,
        build: ({ orientation, size }) => {
          const dynLayout = planResultPrintLayout(stuNames, subNames, size, orientation);
          return buildClassResultHTML(ctx, { ...dynLayout, orientation }, size);
        },
      },
      data
    );
    if (!ok) toast("Could not open the print dialog. Try again.", "error");
  };

  const handlePrintReportCards = () => {
    if (!activeAsmt.subjects.length) {
      toast("Add subjects first.", "error");
      return;
    }
    setCardChoice(true);
  };

  const handleCardsZip = async () => {
    setCardChoice(false);
    if (!ranked.length) {
      toast("Add students first.", "error");
      return;
    }
    zipCancelRef.current = false;
    setZipProgress({ done: 0, total: ranked.length });
    try {
      const res = await exportReportCardsZip(printCtx(), (done, total) => setZipProgress({ done, total }), () => zipCancelRef.current);
      if (res.cancelled) toast("Cancelled.", "info");
      else if (res.ok) toast(`${res.count} result card${res.count === 1 ? '' : 's'} ready.`, "success");
      else toast("Could not create the ZIP file on this device.", "error");
    } catch {
      toast("Could not create the result card pictures on this device. Use the PDF option instead.", "error");
    } finally {
      setZipProgress(null);
    }
  };

  const handleCardsPdf = async () => {
    setCardChoice(false);
    if (!(await confirmCardPrintSettings(uiConfirm, data.printSize, data.forceOrientation))) { setActiveTab('settings'); return; }
    const ok = await triggerPrint(buildReportCardsHTML(printCtx()), "portrait", data.printSize, data.forceOrientation, false, `${data.className || "Class"} - ${activeAsmt.name} - Report Cards`);
    if (!ok) toast("Could not open the print dialog. Try again.", "error");
  };

  const handleCardsSavePdf = async () => {
    setCardChoice(false);
    if (!(await confirmCardPrintSettings(uiConfirm, data.printSize, data.forceOrientation))) { setActiveTab('settings'); return; }
    const title = `${data.className || "Class"} - ${activeAsmt.name} - Report Cards`;
    const html = buildReportCardsHTML(printCtx());
    const res = await savePdfToDownloads(html, "portrait", data.printSize, data.forceOrientation, false, title);
    if (res.saved) {
      toast(`Saved to ${res.path || 'Download/ClassGrid'}`, "success");
    } else {
      const ok = await triggerPrint(html, "portrait", data.printSize, data.forceOrientation, false, title);
      if (!ok) toast("Could not save PDF or open print dialog. Try again.", "error");
    }
  };

  const handlePrintBlankCard = async () => {
    if (!activeAsmt.subjects.length) {
      toast("Add subjects first.", "error");
      return;
    }
    if (!(await confirmCardPrintSettings(uiConfirm, data.printSize, data.forceOrientation))) { setActiveTab('settings'); return; }
    const ok = await triggerPrint(buildBlankReportCardHTML(printCtx()), "portrait", data.printSize, data.forceOrientation, false, `${data.className || "Class"} - ${activeAsmt.name} - Blank Report Card`);
    if (!ok) toast("Could not open the print dialog. Try again.", "error");
  };

  const handlePrintBlankSheet = async () => {
    if (!activeAsmt.subjects.length) {
      toast("Add subjects first.", "error");
      return;
    }
    if (!data.students.length) {
      toast("Add students first.", "error");
      return;
    }
    const ctx = printCtx();
    const stuNames = data.students.map(s => s.name || "");
    const subNames = activeAsmt.subjects.map(sub => sub.name);
    const layout = planResultPrintLayout(stuNames, subNames, data.printSize, data.forceOrientation);
    const ok = await previewPrint(
      {
        html: buildBlankMarksSheetHTML(ctx, layout),
        orientation: layout.orientation,
        pageNumbers: true,
        compact: o => buildCompactMarksSheetHTML(ctx, o),
        build: ({ orientation, size }) => {
          const dynLayout = planResultPrintLayout(stuNames, subNames, size, orientation);
          return buildBlankMarksSheetHTML(ctx, { ...dynLayout, orientation });
        },
      },
      data
    );
    if (!ok) toast("Could not open the print dialog. Try again.", "error");
  };

  const handlePrintMeritList = async () => {
    if (!activeAsmt.subjects.length) {
      toast("Add subjects first.", "error");
      return;
    }
    const ctx = printCtx();
    const ok = await previewPrint(
      {
        html: buildMeritListHTML(ctx, { orientation: "portrait", printSize: data.printSize }),
        orientation: "portrait",
        pageNumbers: true,
        build: ({ orientation, size, caps }) => buildMeritListHTML(ctx, { orientation, printSize: size, caps }),
      },
      data
    );
    if (!ok) toast("Could not open the print dialog. Try again.", "error");
  };

  // Export results JSON for AI / editing
  const handleExportForAi = async () => {
    if (!activeAsmt.subjects.length) {
      toast("Add subjects first.", "error");
      return;
    }
    const file = buildResultsAiFile(data, activeAsmt, ranked);
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
    const ok = await exportFileBlob(blob, `${fileTitle(data.className, activeAsmt.name, "Results for AI")}.json`, { title: "Results for AI" });
    if (!ok) toast("Could not export the file.", "error");
  };

  // AI & File Import
  const ensureAiConsent = async (what: string): Promise<boolean> => {
    if (hasAiConsent()) return true;
    const ok = await uiConfirm(
      `${what} will be sent to Google's AI service over the internet.\n\nNames are not sent when writing remarks from marks. Files you attach may contain names and marks. Continue?`,
      { title: "Send to AI?", yesText: "Continue", icon: "warning" }
    );
    if (ok) saveAiConsent();
    return ok;
  };

  const applyMarksFromRows = async (rows: MarkRow[], ignored: string[]): Promise<boolean> => {
    if (isLocked) {
      toast("Grid is locked. Unlock it to import marks.", "info");
      return false;
    }
    const plan = planMarksImport(rows, data.students, activeAsmt, data.assessmentResults[activeAsmt.id] || {});
    if (plan.cells === 0) {
      const why = plan.unknownStudents ? ` ${plan.unknownStudents} students were not found in your class.` : "";
      toast(`No marks to update.${why}`, "info");
      return false;
    }
    const notes: string[] = [];
    if (plan.overwritten) notes.push(`${plan.overwritten} existing marks will be replaced`);
    if (plan.unchanged) notes.push(`${plan.unchanged} already the same`);
    if (plan.overMax) notes.push(`${plan.overMax} marks above the maximum were skipped`);
    if (plan.invalid) notes.push(`${plan.invalid} unreadable marks were skipped`);
    if (plan.unknownStudents) notes.push(`${plan.unknownStudents} students not found were skipped`);
    if (ignored.length) notes.push(`Columns ignored: ${ignored.slice(0, 5).join(", ")}`);
    const ok = await uiConfirm(
      `${plan.cells} marks for ${plan.students} students will be saved in "${activeAsmt.name}".\n\n${plan.examples.join("\n")}` +
        (notes.length ? `\n\n${notes.join("\n")}` : "") +
        `\n\nMarks that are not in the file are not changed. You can Undo afterwards.`,
      { title: "Import marks", yesText: "Import", icon: "warning" }
    );
    if (!ok) return false;
    const asmtId = activeAsmt.id;
    saveData(prev => {
      const cur = { ...(prev.assessmentResults[asmtId] || {}) };
      Object.entries(plan.updates).forEach(([sid, patch]) => {
        cur[sid] = { ...(cur[sid] || {}), ...patch };
      });
      return { ...prev, assessmentResults: { ...prev.assessmentResults, [asmtId]: cur } };
    });
    toast(`${plan.cells} marks imported.`, "success");
    return true;
  };

  const writeRemarksFromMarks = async (instructions: string): Promise<boolean> => {
    if (!aiReadingAvailable()) {
      toast("AI is not set up yet.", "error");
      return false;
    }
    const file = buildResultsAiFile(data, activeAsmt, ranked);
    const todo = file.students
      .filter((s: any) => s.percentage !== null && !String(s.remarks || "").trim())
      .map((s: any, i: number) => ({ n: i + 1, id: s.id as string, marks: s.marks, percentage: s.percentage, rank: s.rank, result: s.result }));
    if (!todo.length) {
      toast("Nothing to write. Students need marks and an empty remark.", "info");
      return false;
    }
    if (!(await ensureAiConsent("The marks (no names)"))) return false;
    toast(`Writing ${todo.length} remarks… this can take a few seconds.`, "info");
    const remarks = await generateRemarksWithAi(
      todo.map(t => ({ n: t.n, marks: t.marks, percentage: t.percentage, rank: t.rank, result: t.result })),
      activeAsmt.name,
      instructions
    );
    return await reviewAndApplyRemarks(
      generatedRemarksToResultsFile(todo.map(t => ({ n: t.n, id: t.id })), remarks, { id: activeAsmt.id, name: activeAsmt.name }),
      "AI-written remarks"
    );
  };

  const handleAiGo = async (file: File | null, text: string): Promise<boolean> => {
    if (!activeAsmt.subjects.length) {
      toast("Add subjects first.", "error");
      return false;
    }
    try {
      if (!file) return await writeRemarksFromMarks(text);

      const kind = detectKind(file);
      if (kind === "unsupported") {
        toast("Please choose an Excel, CSV, PDF, photo or JSON file.", "error");
        return false;
      }
      if (kind === "json") {
        return await reviewAndApplyRemarks(file, "Import remarks from file");
      }

      let found;
      if (kind === "sheet") {
        found = await readResultsSheet(file, activeAsmt.subjects);
      } else {
        if (!aiReadingAvailable()) {
          toast("PDF and photo reading is not set up yet. Use an Excel or CSV file.", "error");
          return false;
        }
        if (!(await ensureAiConsent("This file"))) return false;
        toast("Reading file… this can take a few seconds.", "info");
        found = await readResultsWithAi(file, activeAsmt.subjects, text);
      }

      if (!found.marks.length && !found.remarks.length) {
        toast("No marks or remarks found in this file.", "error");
        return false;
      }
      let did = false;
      if (found.marks.length) did = (await applyMarksFromRows(found.marks, found.ignoredColumns)) || did;
      if (found.remarks.length) {
        const rf = remarkRowsToResultsFile(found.remarks, data.students, { id: activeAsmt.id, name: activeAsmt.name });
        did = (await reviewAndApplyRemarks(rf, "Import remarks from file")) || did;
      }
      return did;
    } catch (err) {
      toast((err as Error).message || "Could not finish. Please try again.", "error");
      return false;
    }
  };

  const reviewAndApplyRemarks = async (file: File, title: string): Promise<boolean> => {
    try {
      const plan = await planResultsImport(file, data, activeAsmt);
      if (plan.changed === 0) {
        toast("Nothing to update. All remarks are already the same.", "info");
        return false;
      }
      const notes: string[] = [];
      if (plan.unchanged) notes.push(`${plan.unchanged} already the same`);
      if (plan.skippedBlank) notes.push(`${plan.skippedBlank} blank (kept as they are)`);
      if (plan.skippedUnknown) notes.push(`${plan.skippedUnknown} unknown students skipped`);
      if (plan.truncated) notes.push(`${plan.truncated} shortened to 300 characters`);
      const ok = await uiConfirm(
        `${plan.changed} remarks will be updated in "${activeAsmt.name}".` +
          (notes.length ? `\n\n${notes.join("\n")}` : "") +
          `\n\nMarks are not changed. You can Undo afterwards.`,
        { title, yesText: "Import", icon: "warning" }
      );
      if (!ok) return false;
      saveData(prev => ({
        ...prev,
        assessmentRemarks: {
          ...prev.assessmentRemarks,
          [activeAsmt.id]: { ...(prev.assessmentRemarks[activeAsmt.id] || {}), ...plan.updates },
        },
      }));
      toast(`${plan.changed} remarks updated.`, "success");
      return true;
    } catch (err) {
      toast((err as Error).message || "Could not read the file.", "error");
      return false;
    }
  };

  const entryMode: 'grid' | 'student' | 'subject' = studentEntryOn ? 'student' : subjectEntryOn ? 'subject' : 'grid';
  const setEntryMode = (mode: 'grid' | 'student' | 'subject') => {
    if (mode !== 'grid' && isLocked) {
      toast("Grid is locked. Unlock it to enter marks.", "info");
      return;
    }
    setStudentEntryOn(mode === 'student');
    setSubjectEntryOn(mode === 'subject');
  };

  return (
    <div className="cg-view-enter space-y-5">
      {/* Assessment Detail Masthead */}
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setActiveAssessmentId(null)}
          className="min-h-[40px] -ml-1.5 px-1.5 rounded-lg inline-flex items-center gap-1.5 text-xs font-semibold text-red-800 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>All assessments</span>
        </button>

        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-50 truncate">
                {activeAsmt.name}
              </h1>
              {isLocked && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
                  <Lock className="w-3.5 h-3.5" />
                  Locked
                </span>
              )}
            </div>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5 font-mono-num">
              {data.className || 'Class'} · {activeAsmt.subjects.length} {activeAsmt.subjects.length === 1 ? 'subject' : 'subjects'} · Max {totalMax}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {activeAsmt.subjects.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handlePrintClassResults}
                  className="min-h-[42px] px-3.5 rounded-xl text-xs font-semibold bg-red-800 hover:bg-red-900 dark:bg-red-700 dark:hover:bg-red-600 text-white inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Class sheet</span>
                </button>
                <button
                  type="button"
                  onClick={handlePrintReportCards}
                  className="min-h-[42px] px-3.5 rounded-xl text-xs font-semibold border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-800 dark:text-stone-100 hover:bg-stone-50 dark:hover:bg-stone-800 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-stone-500 dark:text-stone-400" />
                  <span>Report cards</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={handleToggleLock}
              title={isLocked ? "Unlock grid to edit marks" : "Lock grid to prevent accidental changes"}
              className={`min-h-[42px] px-3 rounded-xl text-xs font-semibold border inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                isLocked
                  ? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/40'
                  : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-800'
              }`}
            >
              {isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5 text-stone-400" />}
              <span>{isLocked ? 'Unlock' : 'Lock'}</span>
            </button>

            <button
              type="button"
              onClick={handleRename}
              aria-label="Rename assessment"
              title="Rename assessment"
              className="min-h-[42px] px-3 rounded-xl text-xs font-semibold border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-800 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5 text-stone-400" />
              <span className="hidden sm:inline">Rename</span>
            </button>

            <button
              type="button"
              onClick={handleDelete}
              aria-label="Delete assessment"
              title="Delete assessment"
              className="min-h-[42px] w-[42px] rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-500 hover:text-red-700 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-900/60 hover:bg-red-50/50 dark:hover:bg-red-950/30 inline-flex items-center justify-center transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Unified Assessment Pulse Bar */}
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl overflow-hidden">
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 divide-x divide-stone-200 dark:divide-stone-800">
          <div className="px-4 py-3.5">
            <div className="text-xs font-medium text-stone-500 dark:text-stone-400">Entered</div>
            <div className="mt-1 flex items-baseline gap-1.5 font-mono-num">
              <span className="text-lg font-bold text-stone-900 dark:text-stone-50">
                {entered}/{data.students.length}
              </span>
              <span className="text-xs text-stone-500 dark:text-stone-400">{progressPct}%</span>
            </div>
          </div>

          <div className="px-4 py-3.5">
            <div className="text-xs font-medium text-stone-500 dark:text-stone-400">Pass rate</div>
            <div className="mt-1 flex items-baseline gap-1.5 font-mono-num">
              <span className={`text-lg font-bold ${
                passRatePct === null
                  ? 'text-stone-400 dark:text-stone-500'
                  : passRatePct >= 80
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : passRatePct >= 50
                  ? 'text-amber-700 dark:text-amber-400'
                  : 'text-red-700 dark:text-red-400'
              }`}>
                {passRatePct === null ? '—' : `${passRatePct}%`}
              </span>
              {evaluatedCount > 0 && (
                <span className="text-xs text-stone-500 dark:text-stone-400">
                  {passedCount}/{evaluatedCount} passed
                </span>
              )}
            </div>
          </div>

          <div className="px-4 py-3.5">
            <div className="text-xs font-medium text-stone-500 dark:text-stone-400">Pass mark</div>
            <div className="mt-0.5 flex items-center gap-1">
              <SyncInput
                type="number"
                min="1"
                max="100"
                value={activeAsmt.passPercent}
                onCommit={handleUpdatePassPercent}
                disabled={isLocked}
                aria-label="Pass percentage"
                className="w-16 px-2 py-0.5 text-base font-bold font-mono-num rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100 text-center focus:outline-none focus:border-red-700 dark:focus:border-red-500 disabled:opacity-50"
              />
              <span className="text-sm font-semibold text-stone-500 dark:text-stone-400">%</span>
            </div>
          </div>

          <div className="px-4 py-3.5">
            <div className="text-xs font-medium text-stone-500 dark:text-stone-400">Total max marks</div>
            <div className="mt-1 flex items-baseline gap-1.5 font-mono-num">
              <span className="text-lg font-bold text-stone-900 dark:text-stone-50">{totalMax}</span>
              <span className="text-xs text-stone-500 dark:text-stone-400">
                across {activeAsmt.subjects.length} {activeAsmt.subjects.length === 1 ? 'subject' : 'subjects'}
              </span>
            </div>
          </div>
        </div>
        <div className="h-1 bg-stone-100 dark:bg-stone-800">
          <div
            className={`h-full transition-all ${progressPct >= 100 ? 'bg-emerald-700 dark:bg-emerald-500' : 'bg-red-800 dark:bg-red-500'}`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Subjects Section */}
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => toggleCollapse('subjects')}
          aria-expanded={!collapse.subjects}
          className="w-full min-h-[52px] px-4 sm:px-5 py-3 flex items-center justify-between gap-3 text-left hover:bg-stone-50/70 dark:hover:bg-stone-800/40 transition-colors cursor-pointer"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100">
                Subjects <span className="font-mono-num text-stone-500 dark:text-stone-400 font-semibold">({activeAsmt.subjects.length})</span>
              </h2>
            </div>
            {collapse.subjects && (
              <p className="text-xs text-stone-500 dark:text-stone-400 truncate mt-0.5">
                {activeAsmt.subjects.length === 0
                  ? "No subjects yet — tap to add subjects"
                  : activeAsmt.subjects.map(sub => `${sub.name} (${sub.max || '?'})`).join(' · ')}
              </p>
            )}
          </div>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-stone-500 dark:text-stone-400 shrink-0">
            <span>{collapse.subjects ? "Edit" : "Hide"}</span>
            {collapse.subjects ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </span>
        </button>

        {!collapse.subjects && (
          <div className="px-4 sm:px-5 pb-4 pt-1 space-y-4 border-t border-stone-100 dark:border-stone-800">
            {activeAsmt.subjects.length === 0 ? (
              <p className="text-xs text-stone-500 dark:text-stone-400 pt-2">
                Add subjects below (or copy them from another assessment) to unlock the marks sheet.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-2">
                {activeAsmt.subjects.map(sub => (
                  <div
                    key={sub.id}
                    className="min-w-0 flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50/60 dark:bg-stone-950/40"
                  >
                    <div className="min-w-0 flex-1" title={sub.name}>
                      <SyncInput
                        type="text"
                        value={sub.name}
                        onCommit={v => handleRenameSubject(sub.id, v)}
                        disabled={isLocked}
                        className="w-full bg-transparent border-0 text-xs font-semibold text-stone-900 dark:text-stone-100 focus:outline-none truncate"
                        placeholder="Subject"
                      />
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[11px] text-stone-400 dark:text-stone-500">max</span>
                      <SyncInput
                        type="number"
                        min="0"
                        placeholder="?"
                        value={sub.max || ''}
                        onCommit={v => handleChangeSubjectMax(sub.id, v)}
                        disabled={isLocked}
                        className="w-12 text-center font-mono-num bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg px-1 py-1 text-xs font-semibold text-stone-900 dark:text-stone-100 focus:outline-none focus:border-red-700 dark:focus:border-red-500 disabled:opacity-50"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveSubject(sub.id, sub.name)}
                        disabled={isLocked}
                        aria-label={`Remove ${sub.name}`}
                        title={isLocked ? "Unlock grid to edit subjects" : "Remove subject"}
                        className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                          isLocked
                            ? 'opacity-30 cursor-not-allowed text-stone-400'
                            : 'text-stone-400 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer'
                        }`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Inline Add Subject Form */}
            <form onSubmit={handleAddSubject} className="pt-3 border-t border-stone-100 dark:border-stone-800 space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                <div className="sm:col-span-5">
                  <PlainTextInput
                    value={newSubName}
                    placeholder="Subject name (e.g. Mathematics)"
                    disabled={isLocked}
                    onChange={e => setNewSubName(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 text-xs rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:border-red-700 dark:focus:border-red-500 disabled:opacity-50"
                  />
                </div>
                <div className="sm:col-span-3">
                  <input
                    type="number"
                    min="0"
                    value={newSubMax}
                    placeholder="Max marks"
                    disabled={isLocked}
                    onChange={e => setNewSubMax(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 text-xs font-mono-num rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:border-red-700 dark:focus:border-red-500 disabled:opacity-50"
                  />
                </div>
                <div className={`${otherAsmts.length > 0 ? 'sm:col-span-4' : 'sm:col-span-4'} flex items-center gap-2`}>
                  <button
                    type="submit"
                    disabled={isLocked}
                    className="flex-1 min-h-[42px] px-3 rounded-xl text-xs font-semibold bg-red-800 hover:bg-red-900 dark:bg-red-700 dark:hover:bg-red-600 text-white inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add subject</span>
                  </button>
                  {otherAsmts.length > 0 && (
                    <button
                      type="button"
                      disabled={isLocked}
                      onClick={() => setCopyPickerOpen(o => !o)}
                      className="min-h-[42px] px-3 rounded-xl text-xs font-semibold border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-800 inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                    >
                      <Copy className="w-3.5 h-3.5 text-stone-400" />
                      <span>Copy</span>
                    </button>
                  )}
                </div>
              </div>
            </form>

            {copyPickerOpen && (
              <div className="pt-3 border-t border-stone-100 dark:border-stone-800 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-stone-600 dark:text-stone-400">
                    Copy subjects from another assessment:
                  </span>
                  <button
                    type="button"
                    onClick={() => setCopyPickerOpen(false)}
                    className="text-xs font-semibold text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {otherAsmts.map(o => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => handleCopySubjects(o.id)}
                      className="min-h-[38px] px-3 py-1.5 text-xs font-semibold rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-800 dark:text-stone-100 hover:border-red-700 dark:hover:border-red-500 transition-colors cursor-pointer"
                    >
                      {o.name} <span className="text-stone-400 font-mono-num">({o.subjects.length})</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Marks Sheet Surface */}
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl overflow-hidden">
        {/* Marks Toolbar */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-stone-200 dark:border-stone-800 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100">Marks sheet</h2>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                {isLocked
                  ? "Grid is locked. Unlock above to edit marks or remarks."
                  : studentEntryOn
                  ? "Tap any student's name to enter all their subjects at once."
                  : subjectEntryOn
                  ? "Tap any subject column header to enter marks by roll number."
                  : "Type marks directly, tap A for absent, or tap a student's name for their report card."}
              </p>
            </div>

            {activeAsmt.subjects.length > 0 && (
              <div
                className="inline-flex p-1 rounded-xl bg-stone-100 dark:bg-stone-800 border border-stone-200/70 dark:border-stone-700/70 shrink-0 self-start sm:self-auto"
                role="tablist"
                aria-label="Marks entry mode"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={entryMode === 'grid'}
                  onClick={() => setEntryMode('grid')}
                  className={`min-h-[34px] px-2.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                    entryMode === 'grid'
                      ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-50 shadow-xs'
                      : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
                  }`}
                >
                  <Table2 className="w-3.5 h-3.5" />
                  <span>Grid</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={entryMode === 'student'}
                  onClick={() => setEntryMode('student')}
                  className={`min-h-[34px] px-2.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                    entryMode === 'student'
                      ? 'bg-red-800 dark:bg-red-700 text-white shadow-xs'
                      : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
                  }`}
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>By student</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={entryMode === 'subject'}
                  onClick={() => setEntryMode('subject')}
                  className={`min-h-[34px] px-2.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                    entryMode === 'subject'
                      ? 'bg-red-800 dark:bg-red-700 text-white shadow-xs'
                      : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>By subject</span>
                </button>
              </div>
            )}
          </div>

          {activeAsmt.subjects.length > 0 && sortedStudents.length >= 8 && (
            <div className="relative max-w-xs">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={studentQuery}
                onChange={e => setStudentQuery(e.target.value)}
                placeholder="Filter by student name or roll…"
                className="w-full min-h-[38px] pl-9 pr-8 py-1.5 text-xs rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:border-red-700 dark:focus:border-red-500"
              />
              {studentQuery && (
                <button
                  type="button"
                  onClick={() => setStudentQuery("")}
                  aria-label="Clear filter"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Marks Table Body */}
        {activeAsmt.subjects.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-stone-500 dark:text-stone-400">
            Add at least one subject above to start recording student marks.
          </div>
        ) : visibleRanked.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-stone-500 dark:text-stone-400">
            No students match "{studentQuery}".
          </div>
        ) : (
          <div className="res-wrap overflow-x-auto max-h-[72vh]">
            <table
              className="res-table w-full text-xs text-center border-separate border-spacing-0"
              style={{ '--name-col-w': `${nameColWidth}px` } as React.CSSProperties}
            >
              <thead className="sticky top-0 z-20 bg-stone-50 dark:bg-stone-900 text-stone-700 dark:text-stone-200">
                <tr>
                  <th className="sc1 px-2 py-2.5 border-b border-r border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900 font-semibold">
                    Roll
                  </th>
                  <th className="sc2 px-2.5 py-2.5 border-b border-r border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900 text-left font-semibold">
                    Name
                  </th>
                  {activeAsmt.subjects.map(sub => (
                    <th key={sub.id} className="px-2 py-2 border-b border-r border-stone-200 dark:border-stone-800 min-w-[78px] font-semibold">
                      {subjectEntryOn ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (isLocked) {
                              toast("Grid is locked. Unlock it to edit marks.", "info");
                              return;
                            }
                            setEntrySubjectId(sub.id);
                          }}
                          title={isLocked ? "Grid is locked" : "Enter marks for this subject"}
                          className={`w-full rounded-lg px-2 py-1 bg-red-50 dark:bg-red-950/50 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-900 font-semibold transition-colors ${
                            isLocked ? 'opacity-60 cursor-not-allowed' : 'hover:bg-red-100 dark:hover:bg-red-950 cursor-pointer'
                          }`}
                        >
                          <span className="block truncate">{sub.name}</span>
                          <span className="block text-[10px] font-mono-num opacity-80">/{sub.max || '?'}</span>
                        </button>
                      ) : (
                        <>
                          <span className="block truncate">{sub.name}</span>
                          <span className="block text-[10px] font-mono-num font-normal text-stone-400 dark:text-stone-500">
                            /{sub.max || '?'}
                          </span>
                        </>
                      )}
                    </th>
                  ))}
                  <th className="px-2.5 py-2.5 border-b border-r border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900 font-semibold min-w-[76px]">
                    Total
                  </th>
                  <th className="px-2 py-2.5 border-b border-r border-stone-200 dark:border-stone-800 min-w-[54px] font-semibold">
                    %
                  </th>
                  <th className="px-2.5 py-2.5 border-b border-r border-stone-200 dark:border-stone-800 min-w-[104px] font-semibold">
                    Result
                  </th>
                  <th className="px-2 py-2.5 border-b border-r border-stone-200 dark:border-stone-800 min-w-[52px] font-semibold">
                    Rank
                  </th>
                  <th className="px-2.5 py-2.5 border-b border-stone-200 dark:border-stone-800 min-w-[150px] text-left font-semibold">
                    Remarks
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleRanked.map((item, sIdx) => {
                  const { s, r } = item;
                  const asmtRes = (data.assessmentResults[activeAsmt.id] || {})[s.id] || {};
                  const remarksVal = (data.assessmentRemarks[activeAsmt.id] || {})[s.id] || "";
                  const rowFail = !r.passed && r.maxTotal > 0;
                  const isEven = sIdx % 2 === 1;
                  const stickyBg = rowFail
                    ? 'bg-red-50/70 dark:bg-red-950/25'
                    : isEven
                    ? 'bg-stone-50/60 dark:bg-stone-950/40'
                    : 'bg-white dark:bg-stone-900';
                  // Solid opaque sticky background so scrolled columns never bleed behind Roll & Name
                  const solidStickyBg = rowFail
                    ? 'bg-[#FDF5F4] dark:bg-[#231414]'
                    : isEven
                    ? 'bg-[#FAFAF9] dark:bg-[#141210]'
                    : 'bg-white dark:bg-[#1C1917]';

                  return (
                    <tr key={s.id} className={stickyBg}>
                      <td className={`sc1 px-2 py-2 border-b border-r border-stone-200 dark:border-stone-800 font-mono-num font-semibold text-stone-600 dark:text-stone-300 ${solidStickyBg}`}>
                        {s.rollNo || "—"}
                      </td>
                      <td className={`sc2 px-2.5 py-2 border-b border-r border-stone-200 dark:border-stone-800 text-left font-semibold truncate ${solidStickyBg}`}>
                        <button
                          type="button"
                          onClick={() => {
                            if (studentEntryOn) {
                              if (isLocked) {
                                toast("Grid is locked. Unlock it to edit marks.", "info");
                                return;
                              }
                              setEntryStudentId(s.id);
                            } else {
                              setCardStudentId(s.id);
                            }
                          }}
                          title={studentEntryOn ? (isLocked ? "Grid is locked" : "Enter marks") : "Open report card"}
                          className={`max-w-full truncate text-left font-semibold cursor-pointer hover:underline decoration-dotted underline-offset-2 ${
                            studentEntryOn
                              ? 'text-red-800 dark:text-red-400'
                              : 'text-stone-900 dark:text-stone-100'
                          }`}
                        >
                          {s.name || "(no name)"}
                        </button>
                      </td>

                      {activeAsmt.subjects.map((sub, subIdx) => {
                        const raw = asmtRes[sub.id];
                        const displayVal = raw === undefined ? "" : (raw === 'A' ? 'A' : String(raw));
                        const isAbsent = raw === 'A';
                        const below33 = (r.subMarks.find(x => x.subId === sub.id) || {}).below33;
                        const isOverMax = typeof raw === 'number' && Number(sub.max) > 0 && raw > Number(sub.max);

                        return (
                          <td
                            key={sub.id}
                            className={`px-1 py-1 border-b border-r border-stone-200 dark:border-stone-800 ${
                              below33 ? 'bg-amber-50/70 dark:bg-amber-950/20' : ''
                            }`}
                          >
                            <div className="flex items-center justify-center gap-1">
                              <SyncInput
                                type="text"
                                data-coord={`${sIdx}_${subIdx}`}
                                inputMode="decimal"
                                autoComplete="off"
                                value={displayVal}
                                onCommit={v => handleMarkChange(s.id, sub.id, v)}
                                disabled={isLocked}
                                enterKeyHint="next"
                                tabIndex={isLocked ? -1 : gridTabIndex(sIdx, subIdx, visibleRanked.length)}
                                onKeyDown={e => !isLocked && gridNavKeyDown(e, 'data-coord', sIdx, subIdx, visibleRanked.length, activeAsmt.subjects.length)}
                                className={`w-11 py-1 text-center font-semibold font-mono-num text-xs rounded-md border border-transparent focus:border-red-700 dark:focus:border-red-500 focus:bg-white dark:focus:bg-stone-950 bg-transparent text-inherit ${
                                  isAbsent ? 'text-red-700 dark:text-red-400 font-bold' : ''
                                } ${isOverMax ? 'ring-2 ring-amber-500' : ''} ${
                                  isLocked ? 'cursor-not-allowed opacity-75' : ''
                                }`}
                                placeholder="—"
                              />
                              <button
                                type="button"
                                tabIndex={-1}
                                disabled={isLocked}
                                onClick={() => handleToggleAbsent(s.id, sub.id)}
                                title={isLocked ? "Grid is locked" : "Toggle Absent"}
                                className={`w-6 h-6 rounded-md text-[10px] font-bold flex items-center justify-center transition-colors shrink-0 ${
                                  isLocked
                                    ? 'opacity-40 cursor-not-allowed ' + (isAbsent ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300' : 'text-stone-400')
                                    : isAbsent
                                    ? 'bg-red-100 dark:bg-red-950/80 text-red-800 dark:text-red-300 border border-red-300 dark:border-red-800 cursor-pointer'
                                    : 'bg-stone-100/80 dark:bg-stone-800 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-200/70 dark:hover:bg-stone-700 cursor-pointer'
                                }`}
                              >
                                A
                              </button>
                            </div>
                          </td>
                        );
                      })}

                      <td className="px-2 py-2 border-b border-r border-stone-200 dark:border-stone-800 font-mono-num font-semibold text-stone-800 dark:text-stone-200 bg-stone-50/70 dark:bg-stone-800/40">
                        {r.total}/{totalMax}
                      </td>

                      <td
                        className={`px-2 py-2 border-b border-r border-stone-200 dark:border-stone-800 font-mono-num font-bold ${
                          r.maxTotal > 0
                            ? r.pct >= 80
                              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
                              : r.pct >= activeAsmt.passPercent
                              ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300'
                              : 'bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300'
                            : 'text-stone-400'
                        }`}
                      >
                        {r.maxTotal > 0 ? `${r.pct}%` : "—"}
                      </td>

                      <td className="px-2 py-2 border-b border-r border-stone-200 dark:border-stone-800 font-semibold">
                        {r.maxTotal === 0 ? (
                          <span className="text-stone-400">—</span>
                        ) : r.passed ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <span className="text-emerald-700 dark:text-emerald-400 font-bold">Pass</span>
                            {r.manual && !r.computedPass && (
                              <span title="Manually passed" className="text-amber-600 dark:text-amber-400">✱</span>
                            )}
                            {r.manual && (
                              <button
                                type="button"
                                disabled={isLocked}
                                onClick={() => handleToggleManualPass(s.id)}
                                className={`px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 ${
                                  isLocked ? 'opacity-40 cursor-not-allowed' : 'hover:bg-stone-200 dark:hover:bg-stone-700 cursor-pointer'
                                }`}
                              >
                                Undo
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-1.5">
                            <span className="text-red-700 dark:text-red-400 font-bold">Fail</span>
                            <button
                              type="button"
                              disabled={isLocked}
                              onClick={() => handleToggleManualPass(s.id)}
                              className={`px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 ${
                                isLocked ? 'opacity-40 cursor-not-allowed' : 'hover:bg-amber-100 dark:hover:bg-amber-900/50 cursor-pointer'
                              }`}
                            >
                              Pass anyway
                            </button>
                          </div>
                        )}
                      </td>

                      <td className="px-2 py-2 border-b border-r border-stone-200 dark:border-stone-800 font-mono-num font-semibold text-stone-700 dark:text-stone-200 bg-stone-50/70 dark:bg-stone-800/40">
                        {r.maxTotal > 0 ? ordinal(item.rank) : "—"}
                      </td>

                      <td className="px-1.5 py-1 border-b border-stone-200 dark:border-stone-800">
                        <SyncInput
                          type="text"
                          inputMode="text"
                          value={remarksVal}
                          placeholder="—"
                          disabled={isLocked}
                          onLive={v => handleRemarkChange(s.id, v)}
                          onCommit={() => flushSave()}
                          className={`w-full px-1.5 py-1 text-xs bg-transparent border border-transparent focus:border-red-700 dark:focus:border-red-500 focus:outline-none focus:bg-white dark:focus:bg-stone-950 rounded-md ${
                            isLocked ? 'cursor-not-allowed opacity-75' : ''
                          }`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="sticky bottom-0 z-20 bg-white! dark:bg-[#1C1917]! text-stone-900 dark:text-stone-100 font-semibold shadow-[0_-2px_8px_rgba(0,0,0,0.08)]">
                <tr className="bg-white! dark:bg-[#1C1917]!">
                  <td className="sc1 px-2 py-2 border-t border-r border-stone-200 dark:border-stone-800 bg-white! dark:bg-[#1C1917]!"></td>
                  <td className="sc2 px-2.5 py-2 border-t border-r border-stone-200 dark:border-stone-800 text-right font-semibold text-stone-600 dark:text-stone-300 bg-white! dark:bg-[#1C1917]!">
                    Average →
                  </td>
                  {subjectStats.map(st => (
                    <td key={st.subId} className="px-2 py-2 border-t border-r border-stone-200 dark:border-stone-800 font-mono-num text-center font-semibold bg-white! dark:bg-[#1C1917]!">
                      {st.avg}
                    </td>
                  ))}
                  <td colSpan={5} className="px-2 py-2 border-t border-stone-200 dark:border-stone-800 bg-white! dark:bg-[#1C1917]!"></td>
                </tr>
                <tr className="bg-white! dark:bg-[#1C1917]!">
                  <td className="sc1 px-2 py-2 border-t border-r border-stone-200 dark:border-stone-800 bg-white! dark:bg-[#1C1917]!"></td>
                  <td className="sc2 px-2.5 py-2 border-t border-r border-stone-200 dark:border-stone-800 text-right font-semibold text-stone-600 dark:text-stone-300 bg-white! dark:bg-[#1C1917]!">
                    Highest →
                  </td>
                  {subjectStats.map(st => (
                    <td key={st.subId} className="px-2 py-2 border-t border-r border-stone-200 dark:border-stone-800 font-mono-num text-center font-semibold text-emerald-700 dark:text-emerald-400 bg-white! dark:bg-[#1C1917]!">
                      {st.cnt ? st.hi : "—"}
                    </td>
                  ))}
                  <td colSpan={5} className="px-2 py-2 border-t border-stone-200 dark:border-stone-800 bg-white! dark:bg-[#1C1917]!"></td>
                </tr>
                <tr className="bg-white! dark:bg-[#1C1917]!">
                  <td className="sc1 px-2 py-2 border-t border-r border-stone-200 dark:border-stone-800 bg-white! dark:bg-[#1C1917]!"></td>
                  <td className="sc2 px-2.5 py-2 border-t border-r border-stone-200 dark:border-stone-800 text-right font-semibold text-stone-600 dark:text-stone-300 bg-white! dark:bg-[#1C1917]!">
                    Lowest →
                  </td>
                  {subjectStats.map(st => (
                    <td key={st.subId} className="px-2 py-2 border-t border-r border-stone-200 dark:border-stone-800 font-mono-num text-center font-semibold text-red-700 dark:text-red-400 bg-white! dark:bg-[#1C1917]!">
                      {st.cnt ? st.lo : "—"}
                    </td>
                  ))}
                  <td colSpan={5} className="px-2 py-2 border-t border-stone-200 dark:border-stone-800 bg-white! dark:bg-[#1C1917]!"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Print & Export Studio */}
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => toggleCollapse('printOptions')}
          aria-expanded={!collapse.printOptions}
          className="w-full min-h-[52px] px-4 sm:px-5 py-3 flex items-center justify-between gap-3 text-left hover:bg-stone-50/70 dark:hover:bg-stone-800/40 transition-colors cursor-pointer"
        >
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100">Print &amp; report cards</h2>
            <p className="text-xs text-stone-500 dark:text-stone-400 truncate mt-0.5">
              {printStyle === 'a' ? 'Design A · Colour' : 'Design B · Black & white'}
              {printFooter ? ` · Footer: "${printFooter.slice(0, 28)}${printFooter.length > 28 ? '…' : ''}"` : ''}
            </p>
          </div>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-stone-500 dark:text-stone-400 shrink-0">
            <span>{collapse.printOptions ? "Options" : "Hide"}</span>
            {collapse.printOptions ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </span>
        </button>

        {!collapse.printOptions && (
          <div className="px-4 sm:px-5 pb-5 pt-3 border-t border-stone-100 dark:border-stone-800 space-y-4">
            {/* Design Selector */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {([
                { key: 'a', title: 'Design A · Colour', desc: 'Accent colour, medals, and progress bars' },
                { key: 'b', title: 'Design B · Black & white', desc: 'Ink-saving monochrome for clean photocopies' },
              ] as Array<{ key: ResultPrintStyle; title: string; desc: string }>).map(opt => {
                const checked = printStyle === opt.key;
                return (
                  <label
                    key={opt.key}
                    className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer select-none transition-colors ${
                      checked
                        ? 'border-red-800/40 bg-red-50/50 dark:bg-red-950/20 dark:border-red-900/60'
                        : 'border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="result-print-style"
                      checked={checked}
                      onChange={() => choosePrintStyle(opt.key)}
                      className="mt-0.5 w-4 h-4 accent-red-800 dark:accent-red-500 shrink-0"
                    />
                    <span className="flex flex-col leading-snug">
                      <span className="text-[13px] font-semibold text-stone-900 dark:text-stone-100">{opt.title}</span>
                      <span className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">{opt.desc}</span>
                    </span>
                  </label>
                );
              })}
            </div>

            <WatermarkOptions kind="result" hasLogo={!!data.schoolLogo} />

            <div>
              <label className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1">
                Print footer text (optional)
              </label>
              <PlainTextInput
                value={printFooter}
                onChange={e => changePrintFooter(e.target.value)}
                maxLength={80}
                placeholder="e.g. Parent signature required on report card"
                className="w-full min-h-[42px] px-3 py-2 text-sm rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:border-red-700 dark:focus:border-red-500"
              />
            </div>

            {/* Print Actions Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 pt-1">
              <button
                type="button"
                onClick={handlePrintClassResults}
                className="col-span-2 sm:col-span-1 min-h-[44px] px-3 rounded-xl text-xs font-semibold bg-red-800 hover:bg-red-900 dark:bg-red-700 dark:hover:bg-red-600 text-white inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Printer className="w-4 h-4 shrink-0" />
                <span>Class sheet</span>
              </button>
              <button
                type="button"
                onClick={handlePrintReportCards}
                className="min-h-[44px] px-3 rounded-xl text-xs font-semibold border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-800 dark:text-stone-100 hover:bg-stone-50 dark:hover:bg-stone-800 inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <FileText className="w-4 h-4 text-stone-400 shrink-0" />
                <span>Report cards</span>
              </button>
              <button
                type="button"
                onClick={handlePrintMeritList}
                className="min-h-[44px] px-3 rounded-xl text-xs font-semibold border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-800 dark:text-stone-100 hover:bg-stone-50 dark:hover:bg-stone-800 inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Award className="w-4 h-4 text-stone-400 shrink-0" />
                <span>Merit list</span>
              </button>
              <button
                type="button"
                onClick={handlePrintBlankCard}
                className="min-h-[44px] px-3 rounded-xl text-xs font-semibold border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-800 dark:text-stone-100 hover:bg-stone-50 dark:hover:bg-stone-800 inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Printer className="w-4 h-4 text-stone-400 shrink-0" />
                <span>Blank card</span>
              </button>
              <button
                type="button"
                onClick={handlePrintBlankSheet}
                className="min-h-[44px] px-3 rounded-xl text-xs font-semibold border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-800 dark:text-stone-100 hover:bg-stone-50 dark:hover:bg-stone-800 inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Printer className="w-4 h-4 text-stone-400 shrink-0" />
                <span>Blank sheet</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Collapsible Import & Remarks Assistant */}
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => setImportOpen(o => !o)}
          aria-expanded={importOpen}
          className="w-full min-h-[52px] px-4 sm:px-5 py-3 flex items-center justify-between gap-3 text-left hover:bg-stone-50/70 dark:hover:bg-stone-800/40 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <FileUp className="w-4 h-4 text-stone-500 dark:text-stone-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-bold text-stone-900 dark:text-stone-100">
                Import marks or draft remarks
              </div>
              <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
                Import from Excel, CSV, PDF, photo, or JSON — or generate remarks from marks
              </p>
            </div>
          </div>
          {importOpen ? (
            <ChevronDown className="w-4 h-4 text-stone-400 shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-stone-400 shrink-0" />
          )}
        </button>

        {importOpen && (
          <div className="px-4 sm:px-5 pb-5 pt-3 border-t border-stone-100 dark:border-stone-800">
            <AiAssistCard
              embedded
              title="Import marks or remarks"
              placeholder={RESULTS_AI_PLACEHOLDER}
              hint="Excel, CSV and exported JSON are read locally on your device. PDFs, photos, and remark generation use AI (names are never sent when drafting remarks). You always preview before saving."
              accept=".xlsx,.xls,.csv,.pdf,.jpg,.jpeg,.png,.webp,.json,image/*,application/pdf,application/json"
              onGo={handleAiGo}
              onExport={handleExportForAi}
              exportLabel="Export results JSON"
            />
          </div>
        )}
      </div>

      {/* Report Cards Export Choice Modal */}
      {cardChoice && (
        <div
          className="fixed inset-0 z-[300] bg-black/50 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setCardChoice(false)}
        >
          <div
            className="cg-sheet-up w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl bg-white dark:bg-stone-900 border-t sm:border border-stone-200 dark:border-stone-800 p-5 pb-[max(1.25rem,var(--safe-bottom,env(safe-area-inset-bottom,0px)))] space-y-3 shadow-2xl"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-label="Report cards export format"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">Export report cards</h3>
              <button
                type="button"
                onClick={() => setCardChoice(false)}
                aria-label="Close"
                className="w-10 h-10 -mr-2 rounded-xl flex items-center justify-center text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {Capacitor.getPlatform() === 'android' && (
              <button
                type="button"
                onClick={handleCardsSavePdf}
                className="w-full text-left p-3.5 rounded-xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 hover:opacity-90 transition-opacity cursor-pointer flex items-start gap-3"
              >
                <Download className="w-5 h-5 shrink-0 mt-0.5 opacity-90" />
                <div>
                  <div className="text-sm font-semibold">Save PDF to Download/ClassGrid</div>
                  <div className="text-xs opacity-80 mt-0.5">
                    Saves all student report cards directly as an A4 PDF in your Download/ClassGrid folder.
                  </div>
                </div>
              </button>
            )}
            <button
              type="button"
              onClick={handleCardsPdf}
              className="w-full text-left p-3.5 rounded-xl bg-red-800 hover:bg-red-900 dark:bg-red-700 dark:hover:bg-red-600 text-white transition-colors cursor-pointer flex items-start gap-3"
            >
              <Printer className="w-5 h-5 shrink-0 mt-0.5 opacity-90" />
              <div>
                <div className="text-sm font-semibold">One PDF for printing</div>
                <div className="text-xs opacity-85 mt-0.5">
                  Every student's report card in a single print-ready file, one card per page.
                </div>
              </div>
            </button>
            <button
              type="button"
              onClick={handleCardsZip}
              className="w-full text-left p-3.5 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-700/80 transition-colors cursor-pointer flex items-start gap-3"
            >
              <FolderArchive className="w-5 h-5 shrink-0 mt-0.5 text-stone-500 dark:text-stone-400" />
              <div>
                <div className="text-sm font-semibold">ZIP of PNG images</div>
                <div className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                  One image per student, named by Roll # and name — ideal for sharing with parents.
                </div>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* ZIP Generation Progress Modal */}
      {zipProgress && (
        <div className="fixed inset-0 z-[310] bg-black/50 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="w-full max-w-xs rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-5 space-y-3 text-center shadow-2xl">
            <div className="text-sm font-bold text-stone-900 dark:text-stone-100">Preparing report cards…</div>
            <div className="text-xs text-stone-500 dark:text-stone-400 font-mono-num">
              {zipProgress.done} of {zipProgress.total}
            </div>
            <div className="h-2 rounded-full bg-stone-200 dark:bg-stone-800 overflow-hidden">
              <div
                className="h-full bg-red-800 dark:bg-red-500 transition-all"
                style={{ width: `${zipProgress.total ? Math.round((zipProgress.done * 100) / zipProgress.total) : 0}%` }}
              />
            </div>
            <button
              type="button"
              onClick={() => { zipCancelRef.current = true; }}
              className="min-h-[40px] px-4 rounded-xl text-xs font-semibold text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Student-wise Quick Entry Modal */}
      {entryStudentId && activeAsmt.subjects.length > 0 && (() => {
        const idx = sortedStudents.findIndex(x => x.id === entryStudentId);
        const st = sortedStudents[idx];
        if (!st) return null;
        return (
          <StudentEntryModal
            key={st.id}
            student={st}
            subjects={activeAsmt.subjects}
            initial={(data.assessmentResults[activeAsmt.id] || {})[st.id] || {}}
            hasNext={idx < sortedStudents.length - 1}
            onSave={(entries, goNext) => {
              handleBulkMarks(entries.map(e => ({ sid: st.id, ...e })));
              toast(`Marks saved for ${st.name || 'student'}.`, "success");
              if (goNext && idx < sortedStudents.length - 1) setEntryStudentId(sortedStudents[idx + 1].id);
              else setEntryStudentId(null);
            }}
            onClose={() => setEntryStudentId(null)}
          />
        );
      })()}

      {/* Subject-wise Quick Entry Modal */}
      {entrySubjectId && (() => {
        const sub = activeAsmt.subjects.find(x => x.id === entrySubjectId);
        if (!sub) return null;
        const res = data.assessmentResults[activeAsmt.id] || {};
        return (
          <SubjectEntryModal
            key={sub.id}
            subject={sub}
            students={sortedStudents.map(x => ({ id: x.id, rollNo: x.rollNo, name: x.name, value: (res[x.id] || {})[sub.id] }))}
            onSave={entries => {
              handleBulkMarks(entries.map(e => ({ ...e, subId: sub.id })));
              toast(`${sub.name} marks saved.`, "success");
              setEntrySubjectId(null);
            }}
            onClose={() => setEntrySubjectId(null)}
          />
        );
      })()}

      {/* Report Card Preview Modal */}
      {cardStudentId && activeAsmt.subjects.length > 0 && (
        <ResultCardModal
          ctx={printCtx()}
          studentId={cardStudentId}
          onChange={setCardStudentId}
          onClose={() => setCardStudentId(null)}
        />
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Quick marks entry (popups)                                          */
/* ------------------------------------------------------------------ */

/** Parse typed marks. Empty = clear, "A" = absent, otherwise a plain non-negative number. */
function parseMarkText(text: string): { ok: boolean; value?: number | 'A' } {
  const t = text.trim();
  if (t === "") return { ok: true, value: undefined };
  if (/^a$/i.test(t)) return { ok: true, value: 'A' };
  if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) return { ok: false };
  const n = Number(t);
  return isFinite(n) ? { ok: true, value: n } : { ok: false };
}

const markToText = (v: number | 'A' | undefined) => (v === undefined ? "" : String(v));

type FieldState = 'ok' | 'over' | 'invalid';
function fieldState(text: string, max: number): FieldState {
  const p = parseMarkText(text);
  if (!p.ok) return 'invalid';
  if (typeof p.value === 'number' && max > 0 && p.value > max) return 'over';
  return 'ok';
}

const EntryShell: React.FC<{
  title: string;
  subtitle: string;
  onClose: () => void;
  footer: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, subtitle, onClose, footer, children }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-[2px] p-0 sm:p-4"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="cg-sheet-up w-full sm:max-w-md max-h-[92dvh] flex flex-col bg-white dark:bg-stone-900 rounded-t-3xl sm:rounded-2xl shadow-2xl border-t sm:border border-stone-200 dark:border-stone-800 overflow-hidden"
        role="dialog"
        aria-label={title}
      >
        <div className="flex items-start justify-between gap-2 px-5 py-3.5 border-b border-stone-200 dark:border-stone-800">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-stone-900 dark:text-stone-100 truncate">{title}</h3>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-11 h-11 -mr-2 -mt-1 rounded-xl flex items-center justify-center text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-3.5 flex-1">{children}</div>
        <div className="px-5 py-3.5 pb-[max(0.875rem,var(--safe-bottom,env(safe-area-inset-bottom,0px)))] border-t border-stone-200 dark:border-stone-800 flex gap-2">
          {footer}
        </div>
      </div>
    </div>
  );
};

/** One marks box (with Absent button). Shared by both popups. */
const MarkBox: React.FC<{
  text: string;
  max?: number;
  onText: (t: string) => void;
  onEnter: () => void;
  inputRef: (el: HTMLTextAreaElement | null) => void;
  autoFocus?: boolean;
  hideMsg?: boolean;
}> = ({ text, max, onText, onEnter, inputRef, autoFocus, hideMsg }) => {
  const st = fieldState(text, max as number);
  const absent = /^a$/i.test(text.trim());
  return (
    <div className="flex items-center gap-2">
      <PlainTextInput
        ref={inputRef}
        inputMode="decimal"
        autoComplete="off"
        autoFocus={autoFocus}
        enterKeyHint="next"
        value={text}
        placeholder="—"
        onFocus={e => e.currentTarget.select()}
        onChange={e => onText(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onEnter();
          }
        }}
        className={`w-20 min-h-[42px] p-2 text-center text-base font-bold font-mono-num rounded-xl border bg-white dark:bg-stone-950 text-inherit focus:outline-none ${
          st === 'invalid'
            ? 'border-red-600 dark:border-red-500 ring-2 ring-red-500/20'
            : st === 'over'
            ? 'border-amber-500 ring-2 ring-amber-500/20'
            : 'border-stone-200 dark:border-stone-700 focus:border-red-700 dark:focus:border-red-500'
        } ${absent ? 'text-red-700 dark:text-red-400' : ''}`}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => onText(absent ? "" : "A")}
        title="Toggle Absent"
        className={`w-10 h-10 rounded-xl text-xs font-bold cursor-pointer border transition-colors ${
          absent
            ? 'bg-red-50 dark:bg-red-950/70 text-red-800 dark:text-red-300 border-red-300 dark:border-red-800'
            : 'bg-stone-50 dark:bg-stone-800 text-stone-500 dark:text-stone-400 border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-700'
        }`}
      >
        A
      </button>
      {!hideMsg && st === 'over' && <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 font-mono-num">max {max}</span>}
      {!hideMsg && st === 'invalid' && <span className="text-[11px] font-semibold text-red-700 dark:text-red-400">numbers or A</span>}
    </div>
  );
};

/** Validate a draft; returns false (and tells the user) if it should not be saved. */
function useEntryGuard() {
  const { toast, uiConfirm } = useClassroom();
  return async (states: FieldState[]) => {
    if (states.includes('invalid')) {
      toast("Fix the highlighted boxes first (numbers or A only).", "error");
      return false;
    }
    const over = states.filter(x => x === 'over').length;
    if (over > 0) {
      return await uiConfirm(`${over} mark(s) are higher than the maximum.\n\nSave anyway?`, {
        title: "Marks above maximum",
        yesText: "Save anyway",
        icon: "warning"
      });
    }
    return true;
  };
}

const StudentEntryModal: React.FC<{
  student: { id: string; name: string; rollNo: string };
  subjects: { id: string; name: string; max: number }[];
  initial: Record<string, number | 'A'>;
  hasNext: boolean;
  onSave: (entries: { subId: string; text: string }[], goNext: boolean) => void;
  onClose: () => void;
}> = ({ student, subjects, initial, hasNext, onSave, onClose }) => {
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(subjects.map(s => [s.id, markToText(initial[s.id])]))
  );
  const refs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const saveRef = useRef<HTMLButtonElement | null>(null);
  const guard = useEntryGuard();

  const submit = async (goNext: boolean) => {
    const ok = await guard(subjects.map(s => fieldState(draft[s.id] ?? "", s.max)));
    if (!ok) return;
    onSave(subjects.map(s => ({ subId: s.id, text: draft[s.id] ?? "" })), goNext);
  };

  const goTo = (i: number) => {
    if (i < subjects.length) refs.current[i]?.focus();
    else saveRef.current?.focus();
  };

  return (
    <EntryShell
      title={student.name || "(no name)"}
      subtitle={`Roll ${student.rollNo || "—"} · Type marks or tap A for absent`}
      onClose={onClose}
      footer={
        <>
          <button
            ref={saveRef}
            type="button"
            onClick={() => submit(false)}
            className="flex-1 min-h-[44px] rounded-xl text-sm font-semibold bg-red-800 hover:bg-red-900 dark:bg-red-700 dark:hover:bg-red-600 text-white transition-colors cursor-pointer"
          >
            Save
          </button>
          {hasNext && (
            <button
              type="button"
              onClick={() => submit(true)}
              className="flex-1 min-h-[44px] rounded-xl text-sm font-semibold bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100 border border-stone-200 dark:border-stone-700 hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors cursor-pointer"
            >
              Save &amp; next →
            </button>
          )}
        </>
      }
    >
      <div className="divide-y divide-stone-100 dark:divide-stone-800">
        {subjects.map((sub, i) => (
          <div key={sub.id} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-stone-900 dark:text-stone-100 truncate">{sub.name}</div>
              <div className="text-xs text-stone-500 dark:text-stone-400 font-mono-num">
                {sub.max ? `Out of ${sub.max}` : 'Max marks not set'}
              </div>
            </div>
            <MarkBox
              text={draft[sub.id] ?? ""}
              max={sub.max || undefined}
              onText={t => setDraft(d => ({ ...d, [sub.id]: t }))}
              onEnter={() => goTo(i + 1)}
              inputRef={el => (refs.current[i] = el)}
              autoFocus={i === 0}
            />
          </div>
        ))}
      </div>
    </EntryShell>
  );
};

const SubjectEntryModal: React.FC<{
  subject: { id: string; name: string; max: number };
  students: { id: string; rollNo: string; name: string; value: number | 'A' | undefined }[];
  onSave: (entries: { sid: string; text: string }[]) => void;
  onClose: () => void;
}> = ({ subject, students, onSave, onClose }) => {
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(students.map(s => [s.id, markToText(s.value)]))
  );
  const refs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const saveRef = useRef<HTMLButtonElement | null>(null);
  const guard = useEntryGuard();
  const filled = students.filter(s => (draft[s.id] ?? "").trim() !== "").length;

  const submit = async () => {
    const ok = await guard(students.map(s => fieldState(draft[s.id] ?? "", subject.max)));
    if (!ok) return;
    onSave(students.map(s => ({ sid: s.id, text: draft[s.id] ?? "" })));
  };

  return (
    <EntryShell
      title={subject.name}
      subtitle={`${subject.max ? `Out of ${subject.max}` : 'Max marks not set'} · ${filled} of ${students.length} filled · A = absent`}
      onClose={onClose}
      footer={
        <button
          ref={saveRef}
          type="button"
          onClick={submit}
          className="flex-1 min-h-[44px] rounded-xl text-sm font-semibold bg-red-800 hover:bg-red-900 dark:bg-red-700 dark:hover:bg-red-600 text-white transition-colors cursor-pointer"
        >
          Save {subject.name} marks
        </button>
      }
    >
      <div className="divide-y divide-stone-100 dark:divide-stone-800">
        {students.map((s, i) => {
          const st = fieldState(draft[s.id] ?? "", subject.max);
          const nm = s.name || "(no name)";
          return (
            <div
              key={s.id}
              className="py-2 first:pt-0 last:pb-0 flex items-center gap-3"
            >
              <div className="flex-1 min-w-0 flex items-center gap-2.5">
                <span className="shrink-0 w-8 font-mono-num font-semibold text-xs text-stone-500 dark:text-stone-400">
                  {s.rollNo || "—"}
                </span>
                <div className="min-w-0 flex-1">
                  <div
                    className="font-semibold text-stone-900 dark:text-stone-100 leading-snug break-words"
                    style={{
                      fontSize: nm.length > 34 ? 12 : 14,
                      display: '-webkit-box',
                      WebkitBoxOrient: 'vertical',
                      WebkitLineClamp: 2,
                      overflow: 'hidden'
                    }}
                  >
                    {nm}
                  </div>
                  {st === 'over' && <div className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 font-mono-num">Above max {subject.max}</div>}
                  {st === 'invalid' && <div className="text-[11px] font-semibold text-red-700 dark:text-red-400">Numbers or A only</div>}
                </div>
              </div>
              <div className="shrink-0">
                <MarkBox
                  text={draft[s.id] ?? ""}
                  max={subject.max || undefined}
                  hideMsg
                  onText={t => setDraft(d => ({ ...d, [s.id]: t }))}
                  onEnter={() => (i + 1 < students.length ? refs.current[i + 1]?.focus() : saveRef.current?.focus())}
                  inputRef={el => (refs.current[i] = el)}
                  autoFocus={i === 0}
                />
              </div>
            </div>
          );
        })}
      </div>
    </EntryShell>
  );
};

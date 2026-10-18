import { SyncInput } from '../SyncInput';
import { ActionGrid, ActionButton } from '../ActionGrid';
import { AiAssistCard } from '../AiAssistCard';
import { HowItWorks } from '../HowItWorks';
import { ResultCardModal } from '../ResultCardModal';
import { WatermarkOptions } from '../WatermarkOptions';
import React, { useState, useMemo, useRef } from 'react';
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
} from '../../utils/helpers';
import { triggerPrint } from '../../utils/printEngine';
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
  buildMeritListHTML,
} from '../../utils/resultPrint';
import {
  Printer,
  Edit3,
  Trash2,
  Copy,
  Plus,
  BarChart3,
  X,
  Sparkles,
  Upload,
  ChevronDown,
  ChevronRight,
  Lock,
  Unlock,
} from 'lucide-react';
import {
  loadResultsCollapse,
  saveResultsCollapse,
  ResultsCollapseState,
} from '../../utils/resultsCollapse';

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
    assessmentEntryCount
  } = useClassroom();

  const [newFormOpen, setNewFormOpen] = useState(false);
  const [newAsmtName, setNewAsmtName] = useState("");
  const [newAsmtPass, setNewAsmtPass] = useState(40);

  // Subject adding form
  const [newSubName, setNewSubName] = useState("");
  const [newSubMax, setNewSubMax] = useState("");
  const [copyPickerOpen, setCopyPickerOpen] = useState(false);

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
  // NOTE: this hook must stay ABOVE the early return below (React's rules of hooks).
  const nameColWidth = useMemo(
    () => getNameColWidth(sortedStudents.map(s => s.name || ""), ["Average →", "Highest →", "Lowest →"]),
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

    return (
      <div className="space-y-3">
        <HowItWorks
          id="results-list"
          title="How results work"
          steps={[
            <>Tap <b>+ New Assessment</b> for each exam, e.g. Monthly Test or Mid-Term, and set its pass percentage.</>,
            <>Open it, add your <b>subjects</b> with their maximum marks.</>,
            <>Enter each student's marks. <b>Total, Result and Rank are worked out for you.</b> Tap a student's name to open their result card.</>,
            <>Print a <b>Class Result Sheet</b>, <b>Report Cards</b> or a <b>Merit List</b>.</>
          ]}
        />

        <div className="bg-white dark:bg-[#1C1917] border border-[#E7E5E4] dark:border-[#44403C] rounded-2xl p-4 shadow-xs">
          <div className="flex justify-between items-center gap-2 flex-wrap">
            <h2 className="text-base font-bold text-[#1C1917] dark:text-[#F5F5F4]">
              Assessments ({data.assessments.length})
            </h2>
            <button
              type="button"
              onClick={() => setNewFormOpen(!newFormOpen)}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-[#B91C1C] text-white hover:bg-[#991B1B] cursor-pointer"
            >
              {newFormOpen ? "Cancel" : "+ New Assessment"}
            </button>
          </div>

          {newFormOpen && (
            <form onSubmit={handleCreateAsmt} className="mt-3.5 p-4 bg-[#FAFAF9] dark:bg-[#0C0A09] border border-[#E7E5E4] dark:border-[#44403C] rounded-2xl space-y-3">
              <h3 className="text-sm font-bold text-[#1C1917] dark:text-[#F5F5F4]">Create New Assessment</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10.5px] font-bold text-[#78716C] dark:text-[#A8A29E] uppercase tracking-wide mb-1">
                    Assessment Name *
                  </label>
                  <input
                    type="text"
                    value={newAsmtName}
                    placeholder="e.g. First Term / Monthly Test 1 / Final Exam"
                    onChange={e => setNewAsmtName(e.target.value)}
                    className="w-full p-2 text-xs rounded-xl border border-[#D6D3D1] dark:border-[#44403C] bg-white dark:bg-[#1C1917] text-inherit"
                  />
                </div>
                <div>
                  <label className="block text-[10.5px] font-bold text-[#78716C] dark:text-[#A8A29E] uppercase tracking-wide mb-1">
                    Pass Percentage (%) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={newAsmtPass}
                    onChange={e => setNewAsmtPass(Number(e.target.value))}
                    className="w-full p-2 text-xs rounded-xl border border-[#D6D3D1] dark:border-[#44403C] bg-white dark:bg-[#1C1917] text-inherit"
                  />
                </div>
              </div>
              <ActionGrid cols={2}>
                <ActionButton
                  type="submit"
                  variant="primary"
                  icon={Plus}
                >
                  Create Assessment
                </ActionButton>
                <ActionButton
                  type="button"
                  variant="secondary"
                  onClick={() => setNewFormOpen(false)}
                >
                  Cancel
                </ActionButton>
              </ActionGrid>
            </form>
          )}
        </div>

        {/* Assessment Card List */}
        <div className="bg-white dark:bg-[#1C1917] border border-[#E7E5E4] dark:border-[#44403C] rounded-2xl p-4 shadow-xs">
          {data.assessments.length === 0 ? (
            <div className="text-center py-8 text-[#78716C] dark:text-[#A8A29E] bg-[#FAFAF9] dark:bg-[#0C0A09] border border-dashed border-[#D6D3D1] dark:border-[#44403C] rounded-2xl flex flex-col items-center justify-center">
              <BarChart3 className="w-10 h-10 mb-2 text-stone-400 dark:text-stone-600" />
              <span>No assessments created yet. Tap <b>+ New Assessment</b> to create your first exam or test.</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {data.assessments.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).map(a => {
                const totalMax = a.subjects.reduce((sum, s) => sum + (Number(s.max) || 0), 0);
                const entered = assessmentEntryCount(a.id);
                const total = data.students.length;
                const pct = total ? Math.round((entered / total) * 100) : 0;
                const complete = entered >= total && total > 0;

                return (
                  <div
                    key={a.id}
                    onClick={() => setActiveAssessmentId(a.id)}
                    className="p-4 rounded-2xl border border-[#E7E5E4] dark:border-[#44403C] hover:border-[#D6D3D1] hover:-translate-y-0.5 transition-all cursor-pointer bg-white dark:bg-[#1C1917] shadow-xs"
                  >
                    <div className="flex justify-between items-start gap-2 mb-2">
                      <b className="text-sm font-bold text-[#1C1917] dark:text-[#F5F5F4] truncate">
                        {a.name}
                      </b>
                      <span className="text-[11px] font-bold text-[#78716C] dark:text-[#A8A29E] shrink-0">
                        {a.subjects.length} sub • Max {totalMax}
                      </span>
                    </div>

                    <div className="w-full h-2 bg-[#F5F5F4] dark:bg-[#292524] rounded-full overflow-hidden my-2">
                      <div
                        className={`h-full transition-all ${complete ? 'bg-[#065F46]' : 'bg-[#B4791F]'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    <div className="flex justify-between text-xs text-[#78716C] dark:text-[#A8A29E] mt-2">
                      <span><b>{entered}</b> / {total} entered</span>
                      <span>Pass: <b>{a.passPercent}%</b></span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // 2. ACTIVE ASSESSMENT MARKS ENTRY VIEW
  const ranked = computeAssessmentRanking(activeAsmt.id);
  const totalMax = activeAsmt.subjects.reduce((sum, s) => sum + (Number(s.max) || 0), 0);
  const entered = assessmentEntryCount(activeAsmt.id);
  const progressPct = data.students.length ? Math.round((entered / data.students.length) * 100) : 0;

  const isLocked = !!activeAsmt.locked;
  const handleToggleLock = () => {
    const nextLocked = !isLocked;
    saveData(prev => ({
      ...prev,
      assessments: prev.assessments.map(a =>
        a.id === activeAsmt.id ? { ...a, locked: nextLocked } : a
      ),
    }));
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
    const max = Number(newSubMax) || 0;
    if (!name) {
      toast("Enter a subject name.", "error");
      return;
    }
    if (max <= 0) {
      toast("Enter a max mark greater than 0.", "error");
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
    toast("Subject added.", "success");
  };

  // Rename Subject Inline
  const handleRenameSubject = (subId: string, rawName: string) => {
    const name = rawName.trim();
    if (!name) return; // keep old name (the input re-syncs automatically)
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
    const n = Math.max(1, Math.round(Number(maxVal) || 1));
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
        // plain numbers only (no 1e3 / Infinity / negatives); rejected input re-syncs to the saved value
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

  // Vertical keyboard navigation on Enter key

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

  // Print Handlers (design A / B is chosen with the checkboxes in Print Options)
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
    // Fit every subject heading: smaller heading font first, then landscape if needed
    const layout = planResultPrintLayout(
      ranked.map(item => item.s.name || ""),
      activeAsmt.subjects.map(sub => sub.name),
      data.printSize,
      data.forceOrientation
    );
    const ok = await triggerPrint(buildClassResultHTML(printCtx(), layout), layout.orientation, data.printSize, data.forceOrientation, true);
    if (!ok) toast("Could not open the print dialog. Try again.", "error");
  };

  const handlePrintReportCards = async () => {
    if (!activeAsmt.subjects.length) {
      toast("Add subjects first.", "error");
      return;
    }
    const ok = await triggerPrint(buildReportCardsHTML(printCtx()), "portrait", data.printSize, data.forceOrientation, false);
    if (!ok) toast("Could not open the print dialog. Try again.", "error");
  };

  const handlePrintBlankCard = async () => {
    if (!activeAsmt.subjects.length) {
      toast("Add subjects first.", "error");
      return;
    }
    const ok = await triggerPrint(buildBlankReportCardHTML(printCtx()), "portrait", data.printSize, data.forceOrientation, false);
    if (!ok) toast("Could not open the print dialog. Try again.", "error");
  };

  const handlePrintMeritList = async () => {
    if (!activeAsmt.subjects.length) {
      toast("Add subjects first.", "error");
      return;
    }
    const ok = await triggerPrint(buildMeritListHTML(printCtx()), "portrait", data.printSize, data.forceOrientation, true);
    if (!ok) toast("Could not open the print dialog. Try again.", "error");
  };

  // Edit with AI: export this assessment as a small JSON file, then import the edited file back (remarks only)
  const handleExportForAi = async () => {
    if (!activeAsmt.subjects.length) {
      toast("Add subjects first.", "error");
      return;
    }
    const file = buildResultsAiFile(data, activeAsmt, ranked);
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
    const safe = activeAsmt.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 40) || "results";
    const ok = await exportFileBlob(blob, `results-for-ai-${safe}.json`, { title: "Results for AI" });
    if (!ok) toast("Could not export the file.", "error");
  };

  // ---- One AI assistant for Results ----
  // Attach a file (Excel / CSV / PDF / photo / JSON) and/or type instructions, then tap Go:
  //  - file with subject columns  -> marks are filled
  //  - file with a Remarks column -> remarks are imported
  //  - no file                    -> remarks are written from the marks already in the app

  const ensureAiConsent = async (what: string): Promise<boolean> => {
    if (hasAiConsent()) return true;
    const ok = await uiConfirm(
      `${what} will be sent to Google's AI service over the internet.\n\nNames are not sent when writing remarks from marks. Files you attach may contain names and marks. Continue?`,
      { title: "Send to AI?", yesText: "Continue", icon: "warning" }
    );
    if (ok) saveAiConsent();
    return ok;
  };

  // Marks from a file: preview, then save. Returns true when saved.
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

  // Remarks from the marks already in the app. Only marks are sent (no names).
  // Only students with an empty remark are filled, so remarks you wrote yourself are never replaced.
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
        // A results file exported with "Export file" and filled in by an AI (remarks)
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

  return (
    <div className="space-y-3">
      <HowItWorks
        id="results-detail"
        title="How to enter results"
        steps={[
          <>Add <b>subjects</b> with their maximum marks. <b>Copy Subjects</b> reuses them from another assessment.</>,
          <>Type each student's marks in the table. Tap <b>A</b> if the student was absent in that subject.</>,
          <><b>Total, Result and Rank update automatically.</b> The pass percentage is set for this assessment.</>,
          <>A student who just missed can be passed manually with <b>Pass anyway</b>. Tap <b>Undo</b> to remove it.</>,
          <>Tap a <b>student's name</b> to open their <b>result card</b>. Use the arrows to move between students, then <b>Print</b>, <b>Save as image</b> or <b>Share</b> it.</>,
          <>Choose <b>Colour</b> or <b>Black &amp; White</b> under Print Options (it also changes the card), then print the Class Result Sheet, Report Cards or Merit List.</>
        ]}
        note="Marks save automatically as you type."
      />

      {/* Assessment Header Card */}
      <div className="bg-white dark:bg-[#1C1917] border border-[#E7E5E4] dark:border-[#44403C] rounded-2xl p-4 shadow-xs space-y-2">
        <div className="flex justify-between items-center gap-2 pb-1 border-b border-[#E7E5E4] dark:border-[#44403C]">
          <button
            type="button"
            onClick={() => setActiveAssessmentId(null)}
            className="text-xs font-bold text-red-800 dark:text-red-400 hover:underline cursor-pointer flex items-center gap-1"
          >
            ← All Assessments
          </button>
          <button
            type="button"
            onClick={() => toggleCollapse('asmtDetails')}
            className="text-xs font-bold text-[#78716C] dark:text-[#A8A29E] hover:text-[#1C1917] dark:hover:text-[#F5F5F4] flex items-center gap-1 cursor-pointer"
            aria-expanded={!collapse.asmtDetails}
          >
            <span>{collapse.asmtDetails ? "Show details" : "Collapse"}</span>
            {collapse.asmtDetails ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {collapse.asmtDetails ? (
          <div
            onClick={() => toggleCollapse('asmtDetails')}
            className="pt-1 flex items-center justify-between gap-2 flex-wrap cursor-pointer select-none"
          >
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-[#1C1917] dark:text-[#F5F5F4]">
                {activeAsmt.name}
              </h2>
            </div>
            <span className="text-[11px] text-[#78716C] dark:text-[#A8A29E]">
              Pass: <b>{activeAsmt.passPercent}%</b> • Entered: <b>{entered}/{data.students.length}</b> • Total max: <b>{totalMax}</b>
            </span>
          </div>
        ) : (
          <>
            <ActionGrid cols={2}>
              <ActionButton
                variant="secondary"
                icon={Edit3}
                onClick={handleRename}
              >
                Rename
              </ActionButton>
              <ActionButton
                variant="danger"
                icon={Trash2}
                onClick={handleDelete}
              >
                Delete
              </ActionButton>
            </ActionGrid>

            <div className="flex items-center gap-2 mt-1">
              <h2 className="text-xl font-bold text-[#1C1917] dark:text-[#F5F5F4]">
                {activeAsmt.name}
              </h2>
            </div>

            <div className="flex items-center gap-3 text-xs flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="text-[#78716C] dark:text-[#A8A29E] font-semibold">Pass mark:</span>
                <SyncInput
                  type="number"
                  min="1"
                  max="100"
                  value={activeAsmt.passPercent}
                  onCommit={handleUpdatePassPercent}
                  disabled={isLocked}
                  className="w-16 p-1 text-center font-bold text-xs rounded-lg border border-[#D6D3D1] dark:border-[#44403C] bg-white dark:bg-[#0C0A09] text-inherit disabled:opacity-50"
                />
                <span className="text-[#78716C] dark:text-[#A8A29E] font-semibold">%</span>
              </div>

              <span className="text-[#78716C] dark:text-[#A8A29E]">
                Entered: <b>{entered}</b> of <b>{data.students.length}</b> • Total max: <b>{totalMax}</b>
              </span>
            </div>

            <div className="w-full h-2 bg-[#F5F5F4] dark:bg-[#292524] rounded-full overflow-hidden mt-1">
              <div
                className="h-full bg-[#065F46] transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </>
        )}
      </div>

      {/* Subjects Card */}
      <div className="bg-white dark:bg-[#1C1917] border border-[#E7E5E4] dark:border-[#44403C] rounded-2xl p-4 shadow-xs space-y-3">
        <div
          onClick={() => toggleCollapse('subjects')}
          className="flex justify-between items-center gap-2 cursor-pointer select-none"
        >
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-[#1C1917] dark:text-[#F5F5F4]">
              Subjects ({activeAsmt.subjects.length})
            </h3>
            {collapse.subjects && activeAsmt.subjects.length > 0 && (
              <span className="text-[11px] text-[#78716C] dark:text-[#A8A29E] font-medium hidden sm:inline">
                Total max: {totalMax} marks
              </span>
            )}
          </div>
          <button
            type="button"
            className="text-xs font-bold text-[#78716C] dark:text-[#A8A29E] hover:text-[#1C1917] dark:hover:text-[#F5F5F4] flex items-center gap-1 cursor-pointer"
            aria-expanded={!collapse.subjects}
          >
            <span>{collapse.subjects ? "Edit subjects" : "Collapse"}</span>
            {collapse.subjects ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {collapse.subjects ? (
          <div
            onClick={() => toggleCollapse('subjects')}
            className="pt-1 text-xs text-[#78716C] dark:text-[#A8A29E] cursor-pointer flex items-center justify-between gap-2 flex-wrap"
          >
            {activeAsmt.subjects.length === 0 ? (
              <span>No subjects added yet. Click to add subjects.</span>
            ) : (
              <div className="flex items-center gap-1.5 flex-wrap">
                {activeAsmt.subjects.slice(0, 6).map(sub => (
                  <span
                    key={sub.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#FAFAF9] dark:bg-[#0C0A09] border border-[#E7E5E4] dark:border-[#44403C] text-[11px] font-semibold max-w-[140px] truncate"
                    title={`${sub.name} (Max: ${sub.max})`}
                  >
                    <span className="truncate">{sub.name}</span>
                    <span className="text-[#A8A29E] shrink-0">({sub.max})</span>
                  </span>
                ))}
                {activeAsmt.subjects.length > 6 && (
                  <span className="text-[11px] font-bold text-[#78716C] dark:text-[#A8A29E]">
                    +{activeAsmt.subjects.length - 6} more
                  </span>
                )}
              </div>
            )}
            <span className="text-[11px] text-[#2E5A8A] dark:text-[#9CC3EA] font-semibold shrink-0">
              {activeAsmt.subjects.length} configured (Max: {totalMax})
            </span>
          </div>
        ) : (
          <>
            {activeAsmt.subjects.length === 0 ? (
              <p className="text-xs text-[#78716C] dark:text-[#A8A29E]">
                No subjects configured yet. Add subjects below to start recording marks.
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {activeAsmt.subjects.map(sub => (
                  <div
                    key={sub.id}
                    className="min-w-0 flex items-center justify-between gap-1.5 p-2 rounded-xl border border-[#E7E5E4] dark:border-[#44403C] bg-[#FAFAF9] dark:bg-[#0C0A09] text-xs font-bold"
                  >
                    <div className="min-w-0 flex-1" title={sub.name}>
                      <SyncInput
                        type="text"
                        value={sub.name}
                        onCommit={v => handleRenameSubject(sub.id, v)}
                        disabled={isLocked}
                        className="w-full bg-transparent border-0 font-bold focus:outline-none text-inherit truncate"
                        placeholder="Subject"
                      />
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[#78716C] dark:text-[#A8A29E] text-[10px]">max</span>
                      <SyncInput
                        type="number"
                        min="1"
                        value={sub.max}
                        onCommit={v => handleChangeSubjectMax(sub.id, v)}
                        disabled={isLocked}
                        className="w-11 text-center bg-white dark:bg-[#1C1917] border border-[#D6D3D1] dark:border-[#44403C] rounded-md px-1 py-0.5 text-xs text-inherit"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveSubject(sub.id, sub.name)}
                        disabled={isLocked}
                        className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] ml-0.5 ${
                          isLocked
                            ? 'opacity-30 cursor-not-allowed bg-stone-200 dark:bg-stone-800 text-stone-500'
                            : 'bg-[#F8E4E1] text-[#7F1D1D] hover:bg-[#FCA5A5] cursor-pointer'
                        }`}
                        title={isLocked ? "Unlock grid to edit subjects" : "Remove subject"}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={handleAddSubject} className="space-y-2.5 pt-2 border-t border-[#E7E5E4] dark:border-[#44403C]">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  value={newSubName}
                  placeholder="Subject name"
                  disabled={isLocked}
                  onChange={e => setNewSubName(e.target.value)}
                  className="w-full p-2.5 text-xs rounded-xl border border-[#D6D3D1] dark:border-[#44403C] bg-white dark:bg-[#0C0A09] text-inherit disabled:opacity-50"
                />
                <input
                  type="number"
                  min="1"
                  value={newSubMax}
                  placeholder="Max marks"
                  disabled={isLocked}
                  onChange={e => setNewSubMax(e.target.value)}
                  className="w-full p-2.5 text-xs rounded-xl border border-[#D6D3D1] dark:border-[#44403C] bg-white dark:bg-[#0C0A09] text-inherit disabled:opacity-50"
                />
              </div>
              <ActionGrid cols={2}>
                <ActionButton
                  type="submit"
                  variant="primary"
                  icon={Plus}
                  disabled={isLocked}
                  fullWidth={otherAsmts.length === 0}
                >
                  Add Subject
                </ActionButton>
                {otherAsmts.length > 0 && (
                  <ActionButton
                    type="button"
                    variant="secondary"
                    icon={Copy}
                    disabled={isLocked}
                    onClick={() => setCopyPickerOpen(!copyPickerOpen)}
                  >
                    Copy Subjects
                  </ActionButton>
                )}
              </ActionGrid>
            </form>

            {copyPickerOpen && (
              <div className="p-3.5 rounded-xl bg-[#FAFAF9] dark:bg-[#0C0A09] border border-[#E7E5E4] dark:border-[#44403C] space-y-2">
                <span className="text-xs font-bold block text-[#78716C] dark:text-[#A8A29E]">
                  Copy subjects from other assessment:
                </span>
                <div className="flex gap-2 flex-wrap">
                  {otherAsmts.map(o => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => handleCopySubjects(o.id)}
                      className="px-3 py-1.5 text-xs font-bold rounded-xl bg-white dark:bg-[#1C1917] border border-[#D6D3D1] dark:border-[#44403C] hover:border-[#B91C1C] cursor-pointer"
                    >
                      {o.name} ({o.subjects.length})
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setCopyPickerOpen(false)}
                    className="px-3 py-1.5 text-xs font-bold rounded-xl bg-transparent text-[#78716C] hover:underline cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Marks Sheet Table */}
      <div className="bg-white dark:bg-[#1C1917] border border-[#E7E5E4] dark:border-[#44403C] rounded-2xl p-4 shadow-xs space-y-3">
        <div className="flex justify-between items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-[#1C1917] dark:text-[#F5F5F4]">
              Marks Sheet
            </h3>
          </div>
          <button
            type="button"
            onClick={handleToggleLock}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer border ${
              isLocked
                ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/40'
                : 'bg-white dark:bg-[#1C1917] text-[#1C1917] dark:text-[#F5F5F4] border-[#D6D3D1] dark:border-[#44403C] hover:bg-[#FAFAF9] dark:hover:bg-[#292524]'
            }`}
            title={isLocked ? "Unlock grid to edit marks" : "Lock grid to prevent accidental changes"}
          >
            {isLocked ? (
              <>
                <Lock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>Locked</span>
              </>
            ) : (
              <>
                <Unlock className="w-3.5 h-3.5 text-stone-500" />
                <span>Lock Grid</span>
              </>
            )}
          </button>
        </div>

        {activeAsmt.subjects.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <EntryToggle
              on={studentEntryOn}
              onChange={v => {
                if (isLocked) {
                  toast("Grid is locked. Unlock it to enter marks.", "info");
                  return;
                }
                setStudentEntryOn(v);
                if (v) setSubjectEntryOn(false);
              }}
              title="Student-wise entry"
              hint="Tap a student's name to enter all their subjects"
            />
            <EntryToggle
              on={subjectEntryOn}
              onChange={v => {
                if (isLocked) {
                  toast("Grid is locked. Unlock it to enter marks.", "info");
                  return;
                }
                setSubjectEntryOn(v);
                if (v) setStudentEntryOn(false);
              }}
              title="Subject-wise entry"
              hint="Tap a subject heading to enter marks by Roll No"
            />
          </div>
        )}
        {activeAsmt.subjects.length === 0 ? (
          <div className="text-center py-8 text-[#78716C] dark:text-[#A8A29E]">
            Add at least one subject above to record student marks.
          </div>
        ) : (
          <div className="res-wrap overflow-x-auto border border-[#E7E5E4] dark:border-[#44403C] rounded-xl max-h-[75vh]">
            <table
              className="res-table w-full text-xs text-center border-separate border-spacing-0"
              style={{ '--name-col-w': `${nameColWidth}px` } as React.CSSProperties}
            >
              <thead className="sticky top-0 z-20 bg-[#FAFAF9] dark:bg-[#292524] text-[#1C1917] dark:text-[#F5F5F4]">
                <tr>
                  <th className="sc1 p-2 border border-[#E7E5E4] dark:border-[#44403C] bg-[#FAFAF9] dark:bg-[#292524]">
                    Roll
                  </th>
                  <th className="sc2 p-2 border border-[#E7E5E4] dark:border-[#44403C] bg-[#FAFAF9] dark:bg-[#292524] text-left">
                    Name
                  </th>
                  {activeAsmt.subjects.map(sub => (
                    <th key={sub.id} className="p-2 border border-[#E7E5E4] dark:border-[#44403C] min-w-[70px]">
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
                          className={`w-full rounded-lg px-1.5 py-1 bg-[#E8F0F8] dark:bg-[#1E3550] text-[#2E5A8A] dark:text-[#9CC3EA] border border-[#2E5A8A]/40 font-bold ${
                            isLocked ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                          }`}
                        >
                          {sub.name}
                          <span className="block text-[10px] font-semibold opacity-80">({sub.max}) ✎</span>
                        </button>
                      ) : (
                        <>
                          {sub.name}
                          <span className="block text-[10px] text-[#A8A29E]">({sub.max})</span>
                        </>
                      )}
                    </th>
                  ))}
                  <th className="p-2 border border-[#E7E5E4] dark:border-[#44403C] bg-[#FAFAF9] dark:bg-[#292524] font-bold min-w-[70px]">
                    Total
                  </th>
                  <th className="p-2 border border-[#E7E5E4] dark:border-[#44403C] min-w-[50px] font-bold">
                    %
                  </th>
                  <th className="p-2 border border-[#E7E5E4] dark:border-[#44403C] min-w-[100px] font-bold">
                    Result
                  </th>
                  <th className="p-2 border border-[#E7E5E4] dark:border-[#44403C] min-w-[50px] font-bold">
                    Rank
                  </th>
                  <th className="p-2 border border-[#E7E5E4] dark:border-[#44403C] min-w-[140px] text-left">
                    Remarks
                  </th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((item, sIdx) => {
                  const { s, r } = item;
                  const asmtRes = (data.assessmentResults[activeAsmt.id] || {})[s.id] || {};
                  const remarksVal = (data.assessmentRemarks[activeAsmt.id] || {})[s.id] || "";
                  const rowFail = !r.passed && r.maxTotal > 0;
                  const isEven = sIdx % 2 === 1;
                  const stickyBg = rowFail
                    ? 'bg-[#FDF6F5] dark:bg-[#2B1414]'
                    : isEven
                    ? 'bg-[#FAFAF9] dark:bg-[#0C0A09]'
                    : 'bg-white dark:bg-[#1C1917]';

                  return (
                    <tr
                      key={s.id}
                      className={
                        rowFail
                          ? 'bg-[#FDF6F5] dark:bg-[#2B1414]'
                          : isEven
                          ? 'bg-[#FAFAF9] dark:bg-[#0C0A09]'
                          : 'bg-white dark:bg-[#1C1917]'
                      }
                    >
                      <td className={`sc1 p-2 border border-[#E7E5E4] dark:border-[#44403C] font-mono font-bold ${stickyBg}`}>
                        {s.rollNo || "—"}
                      </td>
                      <td className={`sc2 p-2 border border-[#E7E5E4] dark:border-[#44403C] text-left font-semibold truncate ${stickyBg}`}>
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
                          title={studentEntryOn ? (isLocked ? "Grid is locked" : "Enter marks") : "Open result card"}
                          className={`max-w-full truncate text-left font-semibold cursor-pointer hover:underline decoration-dotted underline-offset-2 ${
                            studentEntryOn ? 'text-[#2E5A8A] dark:text-[#9CC3EA]' : ''
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
                            className={`p-1 border border-[#E7E5E4] dark:border-[#44403C] ${
                              below33 ? 'border-l-2 border-l-[#B4791F]' : ''
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
                                tabIndex={isLocked ? -1 : gridTabIndex(sIdx, subIdx, sortedStudents.length)}
                                onKeyDown={e => !isLocked && gridNavKeyDown(e, 'data-coord', sIdx, subIdx, sortedStudents.length, activeAsmt.subjects.length)}
                                className={`w-10 p-1 text-center font-bold font-mono text-xs rounded border border-transparent focus:border-[#2E5A8A] focus:bg-white dark:focus:bg-[#0C0A09] bg-transparent text-inherit ${
                                  isAbsent ? 'text-[#7F1D1D] font-extrabold' : ''
                                } ${isOverMax ? 'ring-2 ring-[#B4791F]' : ''} ${
                                  isLocked ? 'cursor-not-allowed opacity-80' : ''
                                }`}
                                placeholder="—"
                              />
                              <button
                                type="button"
                                tabIndex={-1}
                                disabled={isLocked}
                                onClick={() => handleToggleAbsent(s.id, sub.id)}
                                title={isLocked ? "Grid is locked" : "Toggle Absent"}
                                className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center transition-colors ${
                                  isLocked
                                    ? 'opacity-40 cursor-not-allowed ' + (isAbsent ? 'bg-[#F8E4E1] text-[#7F1D1D]' : 'bg-[#FAFAF9] dark:bg-[#292524] text-[#A8A29E]')
                                    : isAbsent
                                    ? 'bg-[#F8E4E1] text-[#7F1D1D] border border-[#B23A32] cursor-pointer'
                                    : 'bg-[#FAFAF9] dark:bg-[#292524] text-[#A8A29E] border border-[#E7E5E4] dark:border-[#44403C] hover:bg-[#F5F5F4] cursor-pointer'
                                }`}
                              >
                                A
                              </button>
                            </div>
                          </td>
                        );
                      })}

                      <td className="p-2 border border-[#E7E5E4] dark:border-[#44403C] font-bold bg-[#FAFAF9] dark:bg-[#292524]">
                        {r.total} / {totalMax}
                      </td>

                      <td
                        className={`p-2 border border-[#E7E5E4] dark:border-[#44403C] font-bold ${
                          r.maxTotal > 0
                            ? r.pct >= 80
                              ? 'bg-[#D1FAE5] dark:bg-[#064E3B] text-[#065F46] dark:text-[#A7F3D0]'
                              : r.pct >= activeAsmt.passPercent
                              ? 'bg-[#FBF0D9] dark:bg-[#3A2E14] text-[#7A5515] dark:text-[#F8E0A0]'
                              : 'bg-[#F8E4E1] dark:bg-[#4A1A18] text-[#7F1D1D] dark:text-[#F0C8C0]'
                            : ''
                        }`}
                      >
                        {r.maxTotal > 0 ? `${r.pct}%` : "—"}
                      </td>

                      <td className="p-2 border border-[#E7E5E4] dark:border-[#44403C] font-bold">
                        {r.maxTotal === 0 ? (
                          <span className="text-[#A8A29E]">—</span>
                        ) : r.passed ? (
                          <div className="flex items-center justify-center gap-1">
                            <span className="text-[#065F46] dark:text-[#A7F3D0]">PASS</span>
                            {r.manual && !r.computedPass && <span title="Manually passed" className="text-amber-600">✱</span>}
                            {r.manual && (
                              <button
                                type="button"
                                disabled={isLocked}
                                onClick={() => handleToggleManualPass(s.id)}
                                className={`px-1.5 py-0.5 rounded text-[10px] bg-[#F5F5F4] dark:bg-[#292524] text-[#78716C] dark:text-[#D6D3D1] ${
                                  isLocked ? 'opacity-40 cursor-not-allowed' : 'hover:bg-[#E7E5E4] cursor-pointer'
                                }`}
                              >
                                Undo
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-1">
                            <span className="text-[#7F1D1D] dark:text-[#F0C8C0]">FAIL</span>
                            <button
                              type="button"
                              disabled={isLocked}
                              onClick={() => handleToggleManualPass(s.id)}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#FBF0D9] dark:bg-[#3A2E14] text-[#7A5515] dark:text-[#F8E0A0] border border-[#B4791F] ${
                                isLocked ? 'opacity-40 cursor-not-allowed' : 'hover:bg-[#F5E4C0] cursor-pointer'
                              }`}
                            >
                              Pass anyway
                            </button>
                          </div>
                        )}
                      </td>

                      <td className="p-2 border border-[#E7E5E4] dark:border-[#44403C] font-bold bg-[#FAFAF9] dark:bg-[#292524]">
                        {r.maxTotal > 0 ? ordinal(item.rank) : "—"}
                      </td>

                      <td className="p-1 border border-[#E7E5E4] dark:border-[#44403C]">
                        <SyncInput
                          type="text"
                          inputMode="text"
                          value={remarksVal}
                          placeholder="—"
                          disabled={isLocked}
                          onLive={v => handleRemarkChange(s.id, v)}
                          onCommit={() => flushSave()}
                          className={`w-full p-1 text-xs bg-transparent border-0 focus:outline-none focus:bg-white dark:focus:bg-[#0C0A09] rounded ${
                            isLocked ? 'cursor-not-allowed opacity-80' : ''
                          }`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="sticky bottom-0 z-20 bg-white! dark:bg-[#1C1917]! text-[#1C1917] dark:text-[#F5F5F4] font-bold shadow-[0_-3px_10px_rgba(0,0,0,0.12)]">
                <tr className="bg-white! dark:bg-[#1C1917]!">
                  <td className="sc1 p-2 border border-[#E7E5E4] dark:border-[#44403C] bg-white! dark:bg-[#1C1917]!"></td>
                  <td className="sc2 p-2 border border-[#E7E5E4] dark:border-[#44403C] text-right pr-2 font-bold bg-white! dark:bg-[#1C1917]!">
                    Average →
                  </td>
                  {subjectStats.map(st => (
                    <td key={st.subId} className="p-2 border border-[#E7E5E4] dark:border-[#44403C] font-mono text-center font-bold bg-white! dark:bg-[#1C1917]!">
                      {st.avg}
                    </td>
                  ))}
                  <td colSpan={5} className="p-2 border border-[#E7E5E4] dark:border-[#44403C] bg-white! dark:bg-[#1C1917]!"></td>
                </tr>
                <tr className="bg-white! dark:bg-[#1C1917]!">
                  <td className="sc1 p-2 border border-[#E7E5E4] dark:border-[#44403C] bg-white! dark:bg-[#1C1917]!"></td>
                  <td className="sc2 p-2 border border-[#E7E5E4] dark:border-[#44403C] text-right pr-2 font-bold bg-white! dark:bg-[#1C1917]!">
                    Highest →
                  </td>
                  {subjectStats.map(st => (
                    <td key={st.subId} className="p-2 border border-[#E7E5E4] dark:border-[#44403C] font-mono text-center font-bold bg-white! dark:bg-[#1C1917]!">
                      {st.cnt ? st.hi : "—"}
                    </td>
                  ))}
                  <td colSpan={5} className="p-2 border border-[#E7E5E4] dark:border-[#44403C] bg-white! dark:bg-[#1C1917]!"></td>
                </tr>
                <tr className="bg-white! dark:bg-[#1C1917]!">
                  <td className="sc1 p-2 border border-[#E7E5E4] dark:border-[#44403C] bg-white! dark:bg-[#1C1917]!"></td>
                  <td className="sc2 p-2 border border-[#E7E5E4] dark:border-[#44403C] text-right pr-2 font-bold bg-white! dark:bg-[#1C1917]!">
                    Lowest →
                  </td>
                  {subjectStats.map(st => (
                    <td key={st.subId} className="p-2 border border-[#E7E5E4] dark:border-[#44403C] font-mono text-center font-bold bg-white! dark:bg-[#1C1917]!">
                      {st.cnt ? st.lo : "—"}
                    </td>
                  ))}
                  <td colSpan={5} className="p-2 border border-[#E7E5E4] dark:border-[#44403C] bg-white! dark:bg-[#1C1917]!"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <AiAssistCard
        title="AI assistant"
        placeholder={RESULTS_AI_PLACEHOLDER}
        hint="Attach Excel, CSV, PDF, photo or JSON. Marks are filled from subject columns, remarks from a Remarks column. With no file, remarks are written from the marks (names are not sent). You see a preview before anything is saved."
        accept=".xlsx,.xls,.csv,.pdf,.jpg,.jpeg,.png,.webp,.json,image/*,application/pdf,application/json"
        onGo={handleAiGo}
        onExport={handleExportForAi}
        exportLabel="Export file for another AI"
      />

      {/* Print Actions Section */}
      <div className="bg-white dark:bg-[#1C1917] border border-[#E7E5E4] dark:border-[#44403C] rounded-2xl p-4 shadow-xs space-y-3">
        <div
          onClick={() => toggleCollapse('printOptions')}
          className="flex justify-between items-center gap-2 cursor-pointer select-none"
        >
          <div>
            <h3 className="text-sm font-bold text-[#1C1917] dark:text-[#F5F5F4]">Print Options</h3>
            {collapse.printOptions && (
              <p className="text-[11px] text-[#78716C] dark:text-[#A8A29E] mt-0.5 leading-snug">
                {printStyle === 'a' ? 'Design A — Colour' : 'Design B — Black & White'}
                {printFooter ? ` • Footer: "${printFooter.slice(0, 24)}${printFooter.length > 24 ? '...' : ''}"` : ''} • Click to expand
              </p>
            )}
          </div>
          <button
            type="button"
            className="text-xs font-bold text-[#78716C] dark:text-[#A8A29E] hover:text-[#1C1917] dark:hover:text-[#F5F5F4] flex items-center gap-1 cursor-pointer"
            aria-expanded={!collapse.printOptions}
          >
            <span>{collapse.printOptions ? "Show options" : "Collapse"}</span>
            {collapse.printOptions ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {!collapse.printOptions && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {([
                { key: 'a', title: 'Design A — Colour', desc: 'Green & yellow, medals, progress bars' },
                { key: 'b', title: 'Design B — Black & White', desc: 'Saves ink, clean photocopies' },
              ] as Array<{ key: ResultPrintStyle; title: string; desc: string }>).map(opt => {
                const checked = printStyle === opt.key;
                return (
                  <label
                    key={opt.key}
                    className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer select-none transition-colors ${
                      checked
                        ? 'border-[#0B5D45] bg-[#E8F3EC] dark:bg-[#0B5D45]/20 dark:border-[#2E9E73]'
                        : 'border-[#E7E5E4] dark:border-[#44403C] hover:bg-[#FAFAF9] dark:hover:bg-[#292524]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => choosePrintStyle(opt.key)}
                      className="mt-0.5 w-4 h-4 accent-[#0B5D45] shrink-0"
                    />
                    <span className="flex flex-col leading-tight">
                      <span className="text-[13px] font-bold text-[#1C1917] dark:text-[#F5F5F4]">{opt.title}</span>
                      <span className="text-[11px] text-[#78716C] dark:text-[#A8A29E] mt-0.5">{opt.desc}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            <WatermarkOptions kind="result" hasLogo={!!data.schoolLogo} />
            <input
              type="text"
              value={printFooter}
              onChange={e => changePrintFooter(e.target.value)}
              maxLength={80}
              placeholder="Footer text for prints (optional)"
              className="w-full px-3 py-2 text-[13px] rounded-xl border border-[#E7E5E4] dark:border-[#44403C] bg-white dark:bg-[#1C1917] text-[#1C1917] dark:text-[#F5F5F4] placeholder:text-[#A8A29E] focus:outline-none focus:border-[#0B5D45]"
            />
            <ActionGrid cols={4}>
              <ActionButton
                variant="primary"
                icon={Printer}
                onClick={handlePrintClassResults}
                fullWidth="mobile-only"
              >
                Class Result Sheet
              </ActionButton>
              <ActionButton
                variant="secondary"
                icon={Printer}
                onClick={handlePrintReportCards}
              >
                Report Cards
              </ActionButton>
              <ActionButton
                variant="secondary"
                icon={Printer}
                onClick={handlePrintMeritList}
              >
                Merit List
              </ActionButton>
              <ActionButton
                variant="secondary"
                icon={Printer}
                onClick={handlePrintBlankCard}
                fullWidth="mobile-only"
              >
                Blank Card
              </ActionButton>
            </ActionGrid>
          </>
        )}
      </div>
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

const EntryToggle: React.FC<{ on: boolean; onChange: (v: boolean) => void; title: string; hint: string }> = ({
  on,
  onChange,
  title,
  hint
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    onClick={() => onChange(!on)}
    className={`flex items-center gap-3 text-left rounded-xl border px-3 py-2 cursor-pointer transition-colors ${
      on
        ? 'bg-[#E8F0F8] dark:bg-[#1E3550] border-[#2E5A8A]'
        : 'bg-[#FAFAF9] dark:bg-[#292524] border-[#E7E5E4] dark:border-[#44403C]'
    }`}
  >
    <span
      className={`relative shrink-0 w-10 h-6 rounded-full transition-colors ${on ? 'bg-[#2E5A8A]' : 'bg-[#D6D3D1] dark:bg-[#57534E]'}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : ''}`}
      />
    </span>
    <span className="min-w-0">
      <span className="block text-xs font-bold text-[#1C1917] dark:text-[#F5F5F4]">{title}</span>
      <span className="block text-[11px] leading-snug text-[#78716C] dark:text-[#A8A29E]">{hint}</span>
    </span>
  </button>
);

const EntryShell: React.FC<{
  title: string;
  subtitle: string;
  onClose: () => void;
  footer: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, subtitle, onClose, footer, children }) => (
  <div
    className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
    onMouseDown={e => {
      if (e.target === e.currentTarget) onClose();
    }}
  >
    <div className="w-full sm:max-w-md max-h-[92vh] flex flex-col bg-white dark:bg-[#1C1917] rounded-t-2xl sm:rounded-2xl shadow-2xl border border-[#E7E5E4] dark:border-[#44403C]">
      <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-[#E7E5E4] dark:border-[#44403C]">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-[#1C1917] dark:text-[#F5F5F4] truncate">{title}</h3>
          <p className="text-[11px] text-[#78716C] dark:text-[#A8A29E]">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="p-1.5 rounded-lg text-[#78716C] hover:bg-[#F5F5F4] dark:hover:bg-[#292524] cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="overflow-y-auto px-4 py-3 flex-1">{children}</div>
      <div className="px-4 py-3 border-t border-[#E7E5E4] dark:border-[#44403C] flex gap-2">{footer}</div>
    </div>
  </div>
);

/** One marks box (with Absent button). Shared by both popups. */
const MarkBox: React.FC<{
  text: string;
  max: number;
  onText: (t: string) => void;
  onEnter: () => void;
  inputRef: (el: HTMLInputElement | null) => void;
  autoFocus?: boolean;
  hideMsg?: boolean;
}> = ({ text, max, onText, onEnter, inputRef, autoFocus, hideMsg }) => {
  const st = fieldState(text, max);
  const absent = /^a$/i.test(text.trim());
  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="text"
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
        className={`w-20 p-2 text-center text-base font-bold font-mono rounded-lg border-2 bg-white dark:bg-[#0C0A09] text-inherit focus:outline-none ${
          st === 'invalid'
            ? 'border-[#B23A32]'
            : st === 'over'
            ? 'border-[#B4791F]'
            : 'border-[#D6D3D1] dark:border-[#44403C] focus:border-[#2E5A8A]'
        } ${absent ? 'text-[#7F1D1D]' : ''}`}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => onText(absent ? "" : "A")}
        title="Toggle Absent"
        className={`w-8 h-8 rounded-lg text-xs font-bold cursor-pointer border ${
          absent
            ? 'bg-[#F8E4E1] text-[#7F1D1D] border-[#B23A32]'
            : 'bg-[#FAFAF9] dark:bg-[#292524] text-[#A8A29E] border-[#E7E5E4] dark:border-[#44403C]'
        }`}
      >
        A
      </button>
      {!hideMsg && st === 'over' && <span className="text-[11px] font-semibold text-[#B4791F]">max {max}</span>}
      {!hideMsg && st === 'invalid' && <span className="text-[11px] font-semibold text-[#B23A32]">numbers or A only</span>}
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
  const refs = useRef<(HTMLInputElement | null)[]>([]);
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
      subtitle={`Roll ${student.rollNo || "—"} · type marks, or A for absent`}
      onClose={onClose}
      footer={
        <>
          <button
            ref={saveRef}
            type="button"
            onClick={() => submit(false)}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-[#2E5A8A] text-white cursor-pointer"
          >
            Save
          </button>
          {hasNext && (
            <button
              type="button"
              onClick={() => submit(true)}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-[#E8F0F8] dark:bg-[#1E3550] text-[#2E5A8A] dark:text-[#9CC3EA] border border-[#2E5A8A]/40 cursor-pointer"
            >
              Save &amp; Next →
            </button>
          )}
        </>
      }
    >
      <div className="space-y-2">
        {subjects.map((sub, i) => (
          <div key={sub.id} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-[#1C1917] dark:text-[#F5F5F4] truncate">{sub.name}</div>
              <div className="text-[11px] text-[#A8A29E]">out of {sub.max}</div>
            </div>
            <MarkBox
              text={draft[sub.id] ?? ""}
              max={sub.max}
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
  const refs = useRef<(HTMLInputElement | null)[]>([]);
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
      subtitle={`Out of ${subject.max} · ${filled} of ${students.length} filled · A = absent`}
      onClose={onClose}
      footer={
        <button
          ref={saveRef}
          type="button"
          onClick={submit}
          className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-[#2E5A8A] text-white cursor-pointer"
        >
          Save {subject.name} marks
        </button>
      }
    >
      <div className="space-y-1.5">
        {students.map((s, i) => {
          const st = fieldState(draft[s.id] ?? "", subject.max);
          const nm = s.name || "(no name)";
          return (
            <div
              key={s.id}
              className="flex items-center gap-3 border-b border-[#F5F5F4] dark:border-[#292524] pb-1.5"
            >
              <div className="flex-1 min-w-0 flex items-center gap-2">
                <span className="shrink-0 w-8 font-mono font-bold text-sm text-[#1C1917] dark:text-[#F5F5F4]">
                  {s.rollNo || "—"}
                </span>
                <div className="min-w-0 flex-1">
                  <div
                    className="font-semibold text-[#1C1917] dark:text-[#F5F5F4] leading-tight break-words"
                    style={{
                      fontSize: nm.length > 34 ? 11 : 14,
                      display: '-webkit-box',
                      WebkitBoxOrient: 'vertical',
                      WebkitLineClamp: 2,
                      overflow: 'hidden'
                    }}
                  >
                    {nm}
                  </div>
                  {st === 'over' && <div className="text-[10px] font-semibold text-[#B4791F]">above max {subject.max}</div>}
                  {st === 'invalid' && <div className="text-[10px] font-semibold text-[#B23A32]">numbers or A only</div>}
                </div>
              </div>
              <div className="shrink-0">
                <MarkBox
                  text={draft[s.id] ?? ""}
                  max={subject.max}
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

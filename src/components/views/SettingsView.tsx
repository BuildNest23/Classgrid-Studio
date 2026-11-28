import React, { useState, useEffect } from 'react';
import { ModeCard } from '../teacher/ModeCard';
import { useClassroom } from '../../context/ClassroomContext';
import { PrintSizeKey } from '../../types';
import { PRINT_SIZES, todayKey } from '../../utils/helpers';
import { WatermarkOptions } from '../WatermarkOptions';
import {
  Printer,
  Image as ImageIcon,
  Database,
  Moon,
  Sun,
  HelpCircle,
  AlertTriangle,
  ArrowLeft,
  X,
  Upload,
  Download,
  Share2,
  PlusCircle,
  FlaskConical,
  Save,
  RotateCcw,
} from 'lucide-react';
import { generateSampleClassData } from '../../utils/sampleData';
import { exportFileBlob } from '../../utils/nativeFileExport';
import { Capacitor } from '@capacitor/core';
import { getStorage } from '../../storage';
import { getLastAutoBackupTimestamp } from '../../storage/autoBackup';
import { useCapsPrint, saveCapsPrint } from '../../utils/capsPrint';
import { NewClassDialog, shelveOpenClass } from './ClassesView';
import {
  setActiveShelfId,
  getActiveShelfId,
  exportAllClasses,
  findMatchingShelfId,
  isBlankClass,
} from '../../utils/classShelf';
import { performRestore } from '../../utils/backupActions';
import { MyToolsCard } from '../MyToolsCard';
import { useClassgridPrefs } from '../../utils/prefs';
import { PlainTextInput } from '../PlainTextInput';

const LAST_BACKUP_KEY = 'classgrid_last_backup';
const STORAGE_LIMIT_CHARS = 5 * 1024 * 1024;

function readOtherLocalChars(): number {
  let total = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || k === 'classroomData') continue;
      total += k.length + (localStorage.getItem(k) || '').length;
    }
  } catch { /* ignore */ }
  return total;
}

function readLastBackup(): number | null {
  try {
    const v = Number(localStorage.getItem(LAST_BACKUP_KEY));
    return v > 0 ? v : null;
  } catch { return null; }
}

export const SettingsView: React.FC = () => {
  const {
    data,
    saveData,
    replaceAllData,
    resetEverything,
    toast,
    uiConfirm,
    setActiveTab,
    darkMode,
    toggleDarkMode,
    openHelp
  } = useClassroom();

  const [showNewClass, setShowNewClass] = useState(false);
  const [className, setClassName] = useState(data.className);
  const [inchargeName, setInchargeName] = useState(data.inchargeName);
  const [schoolName, setSchoolName] = useState(data.schoolName);
  const [academicYear, setAcademicYear] = useState(data.academicYear);
  const [sessionDisplay, setSessionDisplay] = useState<'line' | 'withClass' | 'off'>(data.sessionDisplay || 'line');
  const [lastBackup, setLastBackup] = useState<number | null>(readLastBackup);
  const [autoBackupTimestamp] = useState<number | null>(() => getLastAutoBackupTimestamp());
  const [storageStatus, setStorageStatus] = useState<{
    engine: string;
    isNative: boolean;
    details: string;
    fallbackActive?: boolean;
  } | null>(null);
  const capsPrint = useCapsPrint();
  const [prefs] = useClassgridPrefs();

  useEffect(() => {
    let mounted = true;
    getStorage().then(s => {
      if (mounted) setStorageStatus(s.getStatus());
    }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  const isSqlite = storageStatus?.engine === 'sqlite';
  const recordsSize = React.useMemo(() => {
    try {
      const json = JSON.stringify(data);
      return isSqlite ? new TextEncoder().encode(json).length : json.length;
    } catch { return 0; }
  }, [data, isSqlite]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const otherLocal = React.useMemo(() => (isSqlite ? 0 : readOtherLocalChars()), [data, isSqlite]);
  const usedChars = recordsSize + otherLocal;
  const usedPct = isSqlite ? 0 : Math.min(100, Math.round((usedChars / STORAGE_LIMIT_CHARS) * 100));
  const usedLabel = usedChars < 1024 * 1024
    ? `${Math.max(1, Math.round(usedChars / 1024))} KB`
    : `${(usedChars / (1024 * 1024)).toFixed(1)} MB`;
  const logoKB = Math.round((data.schoolLogo || '').length / 1024);
  const daysSinceBackup = lastBackup ? Math.floor((Date.now() - lastBackup) / 86400000) : null;
  const daysSinceAutoBackup = autoBackupTimestamp ? Math.floor((Date.now() - autoBackupTimestamp) / 86400000) : null;
  const backupOld = daysSinceBackup === null || daysSinceBackup > 30;
  const barColor = usedPct >= 80 ? 'bg-red-700 dark:bg-red-500' : usedPct >= 50 ? 'bg-amber-600 dark:bg-amber-500' : 'bg-emerald-700 dark:bg-emerald-500';

  const [emisCode, setEmisCode] = useState(data.emisCode || '');
  const [section, setSection] = useState(data.section || '');
  const [printNote, setPrintNote] = useState(data.printNote);

  useEffect(() => {
    setClassName(data.className);
    setInchargeName(data.inchargeName);
    setSchoolName(data.schoolName);
    setAcademicYear(data.academicYear);
    setSessionDisplay(data.sessionDisplay || 'line');
    setEmisCode(data.emisCode || '');
    setSection(data.section || '');
    setPrintNote(data.printNote);
  }, [data.className, data.inchargeName, data.schoolName, data.academicYear, data.sessionDisplay, data.printNote, data.emisCode, data.section]);

  const handleSaveInfo = (e: React.FormEvent) => {
    e.preventDefault();
    saveData(prev => ({
      ...prev,
      className: className.trim(),
      inchargeName: inchargeName.trim(),
      schoolName: schoolName.trim() || "Your School Name",
      academicYear: academicYear.trim(),
      sessionDisplay,
      emisCode: emisCode.trim(),
      section: section.trim(),
      printNote: printNote.trim()
    }));
    toast("Classroom setup saved.", "success");
  };

  const shrinkLogo = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new window.Image();
      img.onload = () => {
        try {
          const MAX = 300;
          const scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
          const w = Math.max(1, Math.round(img.naturalWidth * scale));
          const h = Math.max(1, Math.round(img.naturalHeight * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('no canvas');
          const keepAlpha = file.type === 'image/png' || file.type === 'image/webp' || file.type === 'image/gif' || file.type === 'image/svg+xml';
          if (!keepAlpha) {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, w, h);
          }
          ctx.drawImage(img, 0, 0, w, h);
          resolve(keepAlpha ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.85));
        } catch (err) {
          reject(err);
        } finally {
          URL.revokeObjectURL(url);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Could not read image'));
      };
      img.src = url;
    });

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const result = await shrinkLogo(file);
      saveData(prev => ({ ...prev, schoolLogo: result }));
      toast(`School logo uploaded (${Math.max(1, Math.round(result.length / 1024))} KB).`, "success");
    } catch {
      toast("Could not read this image. Try a PNG or JPG.", "error");
    }
    input.value = "";
  };

  const handleRemoveLogo = async () => {
    const ok = await uiConfirm("Remove school logo?", {
      title: "Remove Logo",
      yesText: "Remove",
      danger: true,
      icon: "warning"
    });
    if (!ok) return;

    saveData(prev => ({ ...prev, schoolLogo: "" }));
    toast("Logo removed.", "success");
  };

  const handlePrintSizeChange = (val: PrintSizeKey) => {
    saveData(prev => ({ ...prev, printSize: val }));
    toast(`Print size set to ${PRINT_SIZES[val].label}`, "info");
  };

  const handleForceOrientationChange = (val: '' | 'portrait' | 'landscape') => {
    saveData(prev => ({ ...prev, forceOrientation: val }));
    toast(val ? `Orientation forced to ${val}` : "Orientation set to Auto", "info");
  };

  const handleResetPrintSettings = () => {
    saveData(prev => ({ ...prev, printSize: "m", forceOrientation: "" }));
    saveCapsPrint(false);
    toast("Print settings reset to default.", "success");
  };

  const [backupChoice, setBackupChoice] = useState(false);

  useEffect(() => {
    if (!backupChoice) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setBackupChoice(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [backupChoice]);

  const handleExportBackup = async (full: boolean) => {
    setBackupChoice(false);
    let activeId = getActiveShelfId();
    if (!activeId && !isBlankClass(data)) {
      try {
        const matched = await findMatchingShelfId(data);
        if (matched) {
          activeId = matched;
          setActiveShelfId(matched);
        }
      } catch { /* ignore */ }
    }
    let classes: Awaited<ReturnType<typeof exportAllClasses>> = [];
    if (full) try {
      classes = await exportAllClasses(data);
    } catch {
      const goOn = await uiConfirm("Could not read your saved classes, so this backup would only contain the open class. Export anyway?", {
        title: "Saved classes unavailable",
        yesText: "Export anyway",
        danger: false,
        icon: "warning"
      });
      if (!goOn) return;
    }
    const payload = {
      app: "ClassroomManager",
      version: 6,
      exportedAt: new Date().toISOString(),
      ...(activeId ? { classId: activeId } : {}),
      data: data,
      ...(classes.length > 0 ? { classes } : {})
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const stamp = todayKey();
    const filename = full ? `classroom-backup-${stamp}.json` : `classroom-backup-${(data.className || 'class').replace(/[^A-Za-z0-9_-]+/g, '-')}-${stamp}.json`;
    const title = `ClassGrid Backup (${stamp})`;

    const exported = await exportFileBlob(blob, filename, {
      title,
      dialogTitle: "Save or Share Backup File",
      preferShareOnWeb: false
    });
    if (!exported) {
      toast("Could not export the backup file.", "error");
      return;
    }

    try { localStorage.setItem(LAST_BACKUP_KEY, String(Date.now())); } catch { /* ignore */ }
    setLastBackup(Date.now());
    if (Capacitor.isNativePlatform()) {
      toast("Backup ready in Android share sheet.", "success");
    } else {
      toast("Backup file downloaded.", "success");
    }
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const ok = await performRestore(file, replaceAllData, uiConfirm, toast, data);
    if (ok) {
      setActiveTab("dashboard");
    }
  };

  const handleLoadSampleData = async () => {
    const ok = await uiConfirm(
      "Load 50 Sample Students & Complete Demo Data?\n\nThis will replace current records with a complete sample dataset to test attendance, daily quick tests, register printing, results, and fund tracking.",
      {
        title: "Load 50 Sample Students",
        yesText: "Load Demo Data",
        danger: false,
        icon: "warning"
      }
    );
    if (!ok) return;

    const sample = generateSampleClassData();
    replaceAllData(sample);
    toast("Loaded 50 sample students and complete demo records!", "success");
    setActiveTab("dailytest");
  };

  const handleResetEverything = async () => {
    const ok1 = await uiConfirm("This will erase ALL data (students, attendance, assessments, funds) and reset the app. Continue?", {
      title: "Reset Everything?",
      yesText: "Continue",
      danger: true,
      icon: "warning"
    });
    if (!ok1) return;

    const ok2 = await uiConfirm("Are you absolutely sure?\n\nThis cannot be undone. Make sure you have exported a backup.", {
      title: "Last Chance",
      yesText: "Yes, Reset",
      danger: true,
      icon: "warning"
    });
    if (!ok2) return;

    try {
      await shelveOpenClass(data);
    } catch {
      const goOn = await uiConfirm("Could not save a copy of the open class to Classes (storage may be full). Erase everything anyway?", {
        title: "No safety copy",
        yesText: "Erase anyway",
        danger: true,
        icon: "warning"
      });
      if (!goOn) return;
    }
    setActiveShelfId(null);

    await resetEverything();
    setActiveTab("dashboard");
  };

  const cardCls = 'rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-5';
  const inputCls =
    'w-full min-h-[42px] px-3 py-2 text-sm rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:border-red-700 dark:focus:border-red-500';
  const labelCls = 'block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1';

  return (
    <div className="cg-view-enter space-y-5">
      {/* Masthead */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-stone-500 dark:text-stone-400">
            {data.schoolName || 'School'} · {data.className || 'Class'}
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-50 mt-0.5">
            Settings &amp; backup
          </h1>
        </div>
        <button
          type="button"
          onClick={() => setActiveTab('dashboard')}
          className="min-h-[40px] px-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs font-semibold text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-800 inline-flex items-center gap-1.5 self-start sm:self-auto transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to class</span>
        </button>
      </div>

      {/* Classroom & School Details */}
      <section className={cardCls}>
        <div className="mb-4">
          <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">Classroom &amp; school details</h2>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
            Appears in the header of printed attendance registers, marks sheets, report cards, and fee receipts.
          </p>
        </div>

        <form onSubmit={handleSaveInfo} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className={labelCls}>Class name</label>
              <PlainTextInput
                value={className}
                placeholder="e.g. 6th Jinnah"
                onChange={e => setClassName(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Incharge / teacher name</label>
              <PlainTextInput
                value={inchargeName}
                placeholder="e.g. Mr. Waqas"
                onChange={e => setInchargeName(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>School name</label>
              <PlainTextInput
                value={schoolName}
                placeholder="School name"
                onChange={e => setSchoolName(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Academic year / session</label>
              <PlainTextInput
                value={academicYear}
                placeholder="e.g. 2026-27"
                onChange={e => setAcademicYear(e.target.value)}
                className={inputCls}
              />
            </div>
            <div className="sm:col-span-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-medium text-stone-600 dark:text-stone-400">Session placement on printouts</span>
                  <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">
                    {sessionDisplay === 'withClass'
                      ? `Shows: Class: ${className.trim() || '10th Iqbal'} - ${academicYear.trim() || '2026-27'}`
                      : sessionDisplay === 'off'
                      ? 'Session is hidden on printed headers.'
                      : 'Session is printed on its own line below the class name.'}
                  </p>
                </div>
                <div className="inline-flex p-0.5 rounded-xl bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 shrink-0 self-start">
                  {([
                    ['line', 'Own line'],
                    ['withClass', 'With class'],
                    ['off', 'Hide'],
                  ] as const).map(([v, label]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setSessionDisplay(v)}
                      className={`min-h-[34px] px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        sessionDisplay === v
                          ? 'bg-red-800 dark:bg-red-700 text-white'
                          : 'text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <label className={labelCls}>EMIS code (optional)</label>
              <PlainTextInput
                value={emisCode}
                placeholder="e.g. 35210123"
                onChange={e => setEmisCode(e.target.value)}
                className={`${inputCls} font-mono-num`}
              />
            </div>
            <div>
              <label className={labelCls}>Section (optional)</label>
              <PlainTextInput
                value={section}
                placeholder="e.g. A"
                onChange={e => setSection(e.target.value)}
                className={inputCls}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Additional header line (optional)</label>
              <PlainTextInput
                value={printNote}
                placeholder="e.g. Principal: Mr. Ahmad"
                onChange={e => setPrintNote(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              className="min-h-[44px] px-5 rounded-xl text-sm font-semibold bg-red-800 hover:bg-red-900 dark:bg-red-700 dark:hover:bg-red-600 text-white inline-flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Save setup</span>
            </button>
          </div>
        </form>
      </section>

      {/* Print Layout & School Logo */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className={`${cardCls} space-y-4`}>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-stone-100 dark:bg-stone-800 text-red-800 dark:text-red-400 flex items-center justify-center shrink-0">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100">Print layout</h2>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                Pick a smaller print scale if wide sheets spill onto a second page.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className={labelCls}>Print size scaling</label>
              <select
                value={data.printSize}
                onChange={e => handlePrintSizeChange(e.target.value as PrintSizeKey)}
                className={inputCls}
              >
                {(Object.keys(PRINT_SIZES) as PrintSizeKey[]).map(k => (
                  <option key={k} value={k}>
                    {PRINT_SIZES[k].label}
                  </option>
                ))}
              </select>
            </div>

            {prefs.showAdvanced && (
              <>
                <div>
                  <label className={labelCls}>Orientation override</label>
                  <select
                    value={data.forceOrientation}
                    onChange={e => handleForceOrientationChange(e.target.value as '' | 'portrait' | 'landscape')}
                    className={inputCls}
                  >
                    <option value="">Auto (recommended)</option>
                    <option value="portrait">Force portrait</option>
                    <option value="landscape">Force landscape</option>
                  </select>
                </div>

                <label className="flex items-start gap-2.5 pt-2 border-t border-stone-100 dark:border-stone-800 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={capsPrint}
                    onChange={e => {
                      saveCapsPrint(e.target.checked);
                      toast(e.target.checked ? "Capitalize text on prints enabled" : "Capitalize text on prints disabled", "info");
                    }}
                    className="mt-0.5 w-4 h-4 accent-red-800 dark:accent-red-500 cursor-pointer shrink-0"
                  />
                  <span className="leading-snug">
                    <span className="block text-xs font-semibold text-stone-900 dark:text-stone-100">
                      Capitalize text on prints
                    </span>
                    <span className="block text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">
                      Prints names, subjects, and headings in uppercase while keeping remarks as typed.
                    </span>
                  </span>
                </label>

                <button
                  type="button"
                  onClick={handleResetPrintSettings}
                  className="min-h-[38px] px-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs font-semibold text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-stone-400" />
                  <span>Reset print defaults</span>
                </button>
              </>
            )}
          </div>
        </section>

        <section className={`${cardCls} space-y-4`}>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-stone-100 dark:bg-stone-800 text-red-800 dark:text-red-400 flex items-center justify-center shrink-0">
              <ImageIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100">School logo &amp; watermark</h2>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                PNG or JPG automatically resized for crisp headers and report card watermarks.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-xl border border-dashed border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-950 flex items-center justify-center p-2 shrink-0">
              {data.schoolLogo ? (
                <img src={data.schoolLogo} alt="School Logo" className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="text-[11px] text-stone-400 text-center">No logo</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="min-h-[42px] px-3.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-700 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors">
                <Upload className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400" />
                <span>{data.schoolLogo ? 'Replace logo' : 'Upload logo'}</span>
                <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
              </label>
              {data.schoolLogo && (
                <button
                  type="button"
                  onClick={handleRemoveLogo}
                  className="min-h-[42px] px-3.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50/60 dark:bg-red-950/30 text-red-700 dark:text-red-400 hover:bg-red-100/70 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Remove</span>
                </button>
              )}
            </div>
          </div>

          <WatermarkOptions kind="result" hasLogo={!!data.schoolLogo} />
        </section>
      </div>

      {/* Backup & Storage */}
      <section className={`${cardCls} space-y-4`}>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-stone-100 dark:bg-stone-800 text-red-800 dark:text-red-400 flex items-center justify-center shrink-0">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">Backup &amp; restore</h2>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              Export your classes to a JSON backup file to keep on Google Drive or move to another device.
            </p>
          </div>
        </div>

        {/* Clean Storage & Backup Summary */}
        <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-950/50 p-3.5 space-y-2.5">
          {storageStatus && !isSqlite && (
            <div className="space-y-1.5">
              <div className="flex justify-between items-baseline text-xs font-semibold text-stone-800 dark:text-stone-200 font-mono-num">
                <span>Browser storage used</span>
                <span>{usedLabel} of ~5 MB ({usedPct}%)</span>
              </div>
              <div
                className="h-1.5 rounded-full bg-stone-200 dark:bg-stone-800 overflow-hidden"
                role="progressbar"
                aria-valuenow={usedPct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Storage used"
              >
                <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.max(usedPct, 1)}%` }} />
              </div>
            </div>
          )}

          {storageStatus && isSqlite && (
            <div className="flex justify-between items-baseline text-xs font-semibold text-stone-800 dark:text-stone-200 font-mono-num">
              <span>Device database size</span>
              <span>{usedLabel}</span>
            </div>
          )}

          {logoKB > (isSqlite ? 1000 : 200) && (
            <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
              Your school logo uses {logoKB} KB. Uploading a smaller logo frees up space.
            </p>
          )}
          {!isSqlite && usedPct >= 80 && (
            <p className="text-xs font-semibold text-red-700 dark:text-red-400">
              Browser storage is nearly full. Export a backup now.
            </p>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs pt-1 border-t border-stone-200/70 dark:border-stone-800">
            <span className={backupOld ? 'font-semibold text-amber-700 dark:text-amber-400' : 'text-stone-600 dark:text-stone-400'}>
              {daysSinceBackup === null
                ? 'Manual backup: Not exported yet on this device'
                : daysSinceBackup === 0
                ? 'Last manual backup: Today'
                : `Last manual backup: ${daysSinceBackup} day${daysSinceBackup === 1 ? '' : 's'} ago`}
            </span>
            {Capacitor.isNativePlatform() && (
              <span className="text-stone-500 dark:text-stone-400">
                {daysSinceAutoBackup === null
                  ? 'Auto-backup: Scheduled daily'
                  : daysSinceAutoBackup === 0
                  ? 'Auto-backup: Today'
                  : `Auto-backup: ${daysSinceAutoBackup}d ago`}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => setBackupChoice(true)}
            className="min-h-[44px] px-4 rounded-xl bg-red-800 hover:bg-red-900 dark:bg-red-700 dark:hover:bg-red-600 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            {Capacitor.isNativePlatform() ? <Share2 className="w-4 h-4" /> : <Download className="w-4 h-4" />}
            <span>Backup to file</span>
          </button>
          <label className="min-h-[44px] px-4 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-700 text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer">
            <Upload className="w-4 h-4 text-stone-500 dark:text-stone-400" />
            <span>Restore from file</span>
            <input type="file" accept=".json,application/json" onChange={handleImportBackup} className="hidden" />
          </label>
        </div>
      </section>

      {/* Mode & PIN + My Tools */}
      <ModeCard />
      <MyToolsCard />

      {/* Quick Utilities: Appearance, Guide, Start New Class */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          type="button"
          onClick={toggleDarkMode}
          className={`${cardCls} text-left hover:border-stone-300 dark:hover:border-stone-700 transition-colors cursor-pointer flex items-start gap-3`}
        >
          <div className="w-9 h-9 rounded-xl bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-200 flex items-center justify-center shrink-0">
            {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
          </div>
          <div>
            <div className="text-sm font-bold text-stone-900 dark:text-stone-100">
              {darkMode ? 'Light mode' : 'Dark mode'}
            </div>
            <div className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              Switch app appearance
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={openHelp}
          className={`${cardCls} text-left hover:border-stone-300 dark:hover:border-stone-700 transition-colors cursor-pointer flex items-start gap-3`}
        >
          <div className="w-9 h-9 rounded-xl bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-200 flex items-center justify-center shrink-0">
            <HelpCircle className="w-4 h-4" />
          </div>
          <div>
            <div className="text-sm font-bold text-stone-900 dark:text-stone-100">User guide</div>
            <div className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              Tips &amp; keyboard shortcuts
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setShowNewClass(true)}
          className={`${cardCls} text-left hover:border-stone-300 dark:hover:border-stone-700 transition-colors cursor-pointer flex items-start gap-3`}
        >
          <div className="w-9 h-9 rounded-xl bg-stone-100 dark:bg-stone-800 text-red-800 dark:text-red-400 flex items-center justify-center shrink-0">
            <PlusCircle className="w-4 h-4" />
          </div>
          <div>
            <div className="text-sm font-bold text-stone-900 dark:text-stone-100">Start new class</div>
            <div className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              Shelve current &amp; start fresh
            </div>
          </div>
        </button>
      </div>

      {/* Advanced Tools: Sample Data & Danger Zone */}
      {prefs.showAdvanced && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <section className={`${cardCls} flex flex-col justify-between gap-4`}>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-stone-100 dark:bg-stone-800 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <FlaskConical className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100">Demo dataset (50 students)</h2>
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-1 leading-relaxed">
                  Replace the open class with 50 sample students, attendance logs, daily tests, term exams, and funds to test printing and layouts.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLoadSampleData}
              className="min-h-[42px] px-4 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-700 text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer self-start"
            >
              <FlaskConical className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
              <span>Load demo data</span>
            </button>
          </section>

          <section className="rounded-2xl bg-red-50/50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/60 p-5 flex flex-col justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-red-900 dark:text-red-300">Reset open class</h2>
                <p className="text-xs text-red-800/80 dark:text-red-300/80 mt-1 leading-relaxed">
                  Erases all students, attendance, exams, and funds in the open class. A safety copy is shelved in Classes first, and other saved classes stay untouched.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleResetEverything}
              className="min-h-[42px] px-4 rounded-xl bg-red-800 hover:bg-red-900 dark:bg-red-700 dark:hover:bg-red-600 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer self-start"
            >
              <AlertTriangle className="w-4 h-4" />
              <span>Reset everything</span>
            </button>
          </section>
        </div>
      )}

      {/* Backup Choice Modal */}
      {backupChoice && (
        <div
          className="fixed inset-0 z-[300] bg-black/50 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setBackupChoice(false)}
        >
          <div
            className="cg-sheet-up w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl bg-white dark:bg-stone-900 border-t sm:border border-stone-200 dark:border-stone-800 p-5 pb-[max(1.25rem,var(--safe-bottom,env(safe-area-inset-bottom,0px)))] space-y-3 shadow-2xl"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-label="Backup scope"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">Choose backup scope</h3>
              <button
                type="button"
                onClick={() => setBackupChoice(false)}
                aria-label="Close"
                className="w-10 h-10 -mr-2 rounded-xl flex items-center justify-center text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => handleExportBackup(true)}
              className="w-full text-left p-3.5 rounded-xl bg-red-800 hover:bg-red-900 dark:bg-red-700 dark:hover:bg-red-600 text-white transition-colors cursor-pointer"
            >
              <div className="text-sm font-semibold">Full school backup</div>
              <div className="text-xs opacity-85 mt-0.5">
                Includes the open class and every saved class in Classes.
              </div>
            </button>
            <button
              type="button"
              onClick={() => handleExportBackup(false)}
              className="w-full text-left p-3.5 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors cursor-pointer"
            >
              <div className="text-sm font-semibold">Open class only</div>
              <div className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                Exports only {data.className || 'the currently open class'}.
              </div>
            </button>
          </div>
        </div>
      )}

      {showNewClass && <NewClassDialog onClose={() => setShowNewClass(false)} onDone={() => setActiveTab("dashboard")} />}
    </div>
  );
};

import React, { useState, useRef, useEffect } from 'react';
import { useClassroom } from '../context/ClassroomContext';
import { isBlankClass } from '../utils/classShelf';
import { performRestore } from '../utils/backupActions';
import {
  GraduationCap,
  Sparkles,
  Upload,
  ArrowRight,
  Check,
  Lock,
  X,
  ClipboardCheck,
  BarChart3,
  PenTool,
  Wallet,
  Users,
  School
} from 'lucide-react';
import { ClassTools } from '../types';

import { getPrefs, savePrefs } from '../utils/prefs';
import { listShelf } from '../utils/classShelf';
import { PlainTextInput } from './PlainTextInput';

export const WelcomeSheet: React.FC = () => {
  const { data, saveData, replaceAllData, uiConfirm, toast, setActiveTab } = useClassroom();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<'welcome' | 'classInfo' | 'tools'>('welcome');

  // Class Info form state
  const [schoolName, setSchoolName] = useState(data.schoolName === 'Your School Name' ? '' : data.schoolName);
  const [className, setClassName] = useState(data.className || '');
  const [inchargeName, setInchargeName] = useState(data.inchargeName || '');

  // Tools selection state (Attendance & Results preselected by default, Students locked on)
  const [tools, setTools] = useState<ClassTools>({
    students: true,
    attendance: true,
    results: true,
    dailyTest: false,
    funds: false,
  });

  useEffect(() => {
    let cancelled = false;
    async function checkEligibility() {
      const prefs = getPrefs();
      if (prefs.welcomeDone) {
        setIsOpen(false);
        return;
      }

      // Check if open class is blank
      const empty = isBlankClass(data);
      if (!empty) {
        // Existing teacher (data found after load): keep Advanced ON so nothing changes for them.
        // Needed on Android, where saved data lives in SQLite and not in localStorage.
        savePrefs({ welcomeDone: true, showAdvanced: true });
        setIsOpen(false);
        return;
      }

      // Check if any saved classes exist on shelf
      try {
        const shelf = await listShelf();
        if (shelf && shelf.length > 0) {
          savePrefs({ welcomeDone: true, showAdvanced: true });
          setIsOpen(false);
          return;
        }
      } catch { /* ignore */ }

      if (!cancelled) {
        setIsOpen(true);
      }
    }
    checkEligibility();
    return () => { cancelled = true; };
  }, [data]);

  const dismissForever = () => {
    savePrefs({ welcomeDone: true });
    setIsOpen(false);
  };

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    // Hide this sheet while the restore confirmation is showing (it would otherwise cover it).
    setIsOpen(false);
    const ok = await performRestore(file, replaceAllData, uiConfirm, toast);
    if (ok) {
      dismissForever();
    } else {
      setIsOpen(true); // cancelled or failed: bring the choices back
    }
  };

  const handleSaveClassInfoAndNext = () => {
    saveData(prev => ({
      ...prev,
      schoolName: schoolName.trim() || prev.schoolName,
      className: className.trim() || prev.className,
      inchargeName: inchargeName.trim() || prev.inchargeName,
    }));
    setStep('tools');
  };

  const handleFinishWithTools = () => {
    saveData(prev => ({
      ...prev,
      tools: {
        ...tools,
        students: true,
      },
    }));
    toast('Classroom ready!', 'success');
    dismissForever();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg bg-white dark:bg-[#1C1917] rounded-t-3xl sm:rounded-2xl border border-[#E7E5E4] dark:border-[#44403C] shadow-2xl p-5 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        {/* Top Header with Dismiss Button */}
        <div className="flex items-center justify-between pb-2 border-b border-[#E7E5E4] dark:border-[#44403C]">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#991B1B] text-white flex items-center justify-center font-bold text-xs">
              CG
            </div>
            <span className="text-xs font-bold tracking-wide uppercase text-stone-500 dark:text-stone-400">
              ClassGrid Setup
            </span>
          </div>
          <button
            type="button"
            onClick={dismissForever}
            className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 p-1 rounded-lg cursor-pointer"
            title="Skip and close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* STEP 1: WELCOME SCREEN */}
        {step === 'welcome' && (
          <div className="space-y-4 py-1">
            <div className="text-center space-y-1.5">
              <div className="w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-950/70 text-[#991B1B] dark:text-[#F87171] mx-auto flex items-center justify-center mb-2">
                <School className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold text-stone-900 dark:text-stone-100">
                Welcome to ClassGrid
              </h2>
              <p className="text-xs text-stone-600 dark:text-stone-400 max-w-sm mx-auto">
                A simple, distraction-free classroom record manager designed for everyday teachers.
              </p>
            </div>

            <div className="space-y-2.5 pt-2">
              {/* Option A: Start fresh */}
              <button
                type="button"
                onClick={() => setStep('classInfo')}
                className="w-full p-3.5 rounded-xl border-2 border-[#991B1B] dark:border-[#B91C1C] bg-red-50/50 dark:bg-red-950/20 hover:bg-red-50 dark:hover:bg-red-950/40 text-left flex items-center justify-between group cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-[#991B1B] text-white flex items-center justify-center shrink-0">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <b className="text-sm block text-stone-900 dark:text-stone-100">
                      Start fresh
                    </b>
                    <span className="text-xs text-stone-500 dark:text-stone-400">
                      Set up your class name and pick your tools
                    </span>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-[#991B1B] dark:text-[#F87171] group-hover:translate-x-1 transition-transform" />
              </button>

              {/* Option B: Restore from backup */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full p-3.5 rounded-xl border border-stone-200 dark:border-stone-800 hover:border-stone-300 dark:hover:border-stone-700 bg-stone-50 dark:bg-stone-900/40 hover:bg-stone-100 dark:hover:bg-stone-900 text-left flex items-center justify-between group cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300 flex items-center justify-center shrink-0">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div>
                    <b className="text-sm block text-stone-900 dark:text-stone-100">
                      Restore from backup
                    </b>
                    <span className="text-xs text-stone-500 dark:text-stone-400">
                      Load an existing .json backup file
                    </span>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-stone-400 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>

            {/* Skip Option */}
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={dismissForever}
                className="text-xs text-stone-500 dark:text-stone-400 hover:underline cursor-pointer"
              >
                Skip setup and open dashboard
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: CLASS INFO (School Name, Class Name, Incharge Name) */}
        {step === 'classInfo' && (
          <div className="space-y-4 py-1">
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">
                Classroom Details
              </h2>
              <p className="text-xs text-stone-600 dark:text-stone-400">
                You can fill these now or change them later in Settings.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  School Name (optional)
                </label>
                <PlainTextInput
                                    value={schoolName}
                  onChange={e => setSchoolName(e.target.value)}
                  placeholder="e.g. Govt High School"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-inherit focus:outline-none focus:ring-1 focus:ring-[#991B1B]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Class Name (optional)
                </label>
                <PlainTextInput
                                    value={className}
                  onChange={e => setClassName(e.target.value)}
                  placeholder="e.g. Class 10th - A"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-inherit focus:outline-none focus:ring-1 focus:ring-[#991B1B]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Teacher / Incharge Name (optional)
                </label>
                <PlainTextInput
                                    value={inchargeName}
                  onChange={e => setInchargeName(e.target.value)}
                  placeholder="e.g. Mr. Ahmad"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-inherit focus:outline-none focus:ring-1 focus:ring-[#991B1B]"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setStep('tools')}
                className="text-xs text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 hover:underline cursor-pointer"
              >
                Skip step
              </button>

              <button
                type="button"
                onClick={handleSaveClassInfoAndNext}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-[#991B1B] hover:bg-[#7F1D1D] text-white flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <span>Next: Choose Tools</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: CHOOSE MY TOOLS */}
        {step === 'tools' && (
          <div className="space-y-4 py-1">
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">
                Choose My Tools
              </h2>
              <p className="text-xs text-stone-600 dark:text-stone-400">
                Pick what you want to use. You can always change this later from your Dashboard.
              </p>
            </div>

            <div className="space-y-2">
              {/* Students - Always Locked On */}
              <div className="flex items-center justify-between p-2.5 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/50 select-none">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-stone-200 dark:bg-stone-800 flex items-center justify-center">
                    <Users className="w-4 h-4 text-stone-700 dark:text-stone-300" />
                  </div>
                  <div>
                    <span className="text-xs font-bold block text-stone-900 dark:text-stone-100">
                      Students
                    </span>
                    <span className="text-[11px] text-stone-500 dark:text-stone-400">
                      Student roster & records
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-stone-200 dark:bg-stone-800 text-[10px] font-bold text-stone-600 dark:text-stone-300">
                  <Lock className="w-3 h-3" /> Always on
                </div>
              </div>

              {/* Attendance */}
              <label className="flex items-center justify-between p-2.5 rounded-xl border border-stone-200 dark:border-stone-800 hover:border-stone-300 dark:hover:border-stone-700 bg-white dark:bg-stone-900 cursor-pointer select-none">
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    tools.attendance ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300' : 'bg-stone-100 dark:bg-stone-800 text-stone-400'
                  }`}>
                    <ClipboardCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold block text-stone-900 dark:text-stone-100">
                      Attendance
                    </span>
                    <span className="text-[11px] text-stone-500 dark:text-stone-400">
                      Daily roll-call & attendance register
                    </span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={tools.attendance}
                  onChange={e => setTools(t => ({ ...t, attendance: e.target.checked }))}
                  className="w-4 h-4 rounded text-[#991B1B] focus:ring-[#991B1B] cursor-pointer"
                />
              </label>

              {/* Results */}
              <label className="flex items-center justify-between p-2.5 rounded-xl border border-stone-200 dark:border-stone-800 hover:border-stone-300 dark:hover:border-stone-700 bg-white dark:bg-stone-900 cursor-pointer select-none">
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    tools.results ? 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300' : 'bg-stone-100 dark:bg-stone-800 text-stone-400'
                  }`}>
                    <BarChart3 className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold block text-stone-900 dark:text-stone-100">
                      Results
                    </span>
                    <span className="text-[11px] text-stone-500 dark:text-stone-400">
                      Exams, marks & printable report cards
                    </span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={tools.results}
                  onChange={e => setTools(t => ({ ...t, results: e.target.checked }))}
                  className="w-4 h-4 rounded text-[#991B1B] focus:ring-[#991B1B] cursor-pointer"
                />
              </label>

              {/* Daily Test */}
              <label className="flex items-center justify-between p-2.5 rounded-xl border border-stone-200 dark:border-stone-800 hover:border-stone-300 dark:hover:border-stone-700 bg-white dark:bg-stone-900 cursor-pointer select-none">
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    tools.dailyTest ? 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300' : 'bg-stone-100 dark:bg-stone-800 text-stone-400'
                  }`}>
                    <PenTool className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold block text-stone-900 dark:text-stone-100">
                      Daily Test Register
                    </span>
                    <span className="text-[11px] text-stone-500 dark:text-stone-400">
                      Quick 10-minute tests (SED Punjab format)
                    </span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={tools.dailyTest}
                  onChange={e => setTools(t => ({ ...t, dailyTest: e.target.checked }))}
                  className="w-4 h-4 rounded text-[#991B1B] focus:ring-[#991B1B] cursor-pointer"
                />
              </label>

              {/* Funds */}
              <label className="flex items-center justify-between p-2.5 rounded-xl border border-stone-200 dark:border-stone-800 hover:border-stone-300 dark:hover:border-stone-700 bg-white dark:bg-stone-900 cursor-pointer select-none">
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    tools.funds ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300' : 'bg-stone-100 dark:bg-stone-800 text-stone-400'
                  }`}>
                    <Wallet className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold block text-stone-900 dark:text-stone-100">
                      Funds & Fees
                    </span>
                    <span className="text-[11px] text-stone-500 dark:text-stone-400">
                      Fee collections, balances & debtors
                    </span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={tools.funds}
                  onChange={e => setTools(t => ({ ...t, funds: e.target.checked }))}
                  className="w-4 h-4 rounded text-[#991B1B] focus:ring-[#991B1B] cursor-pointer"
                />
              </label>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={dismissForever}
                className="text-xs text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 hover:underline cursor-pointer"
              >
                Skip and finish
              </button>

              <button
                type="button"
                onClick={handleFinishWithTools}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-[#991B1B] hover:bg-[#7F1D1D] text-white flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Check className="w-4 h-4" />
                <span>Save &amp; Get Started</span>
              </button>
            </div>
          </div>
        )}

        {/* Hidden File Input for Restore */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          onChange={handleRestoreFile}
          className="hidden"
          aria-hidden="true"
        />
      </div>
    </div>
  );
};

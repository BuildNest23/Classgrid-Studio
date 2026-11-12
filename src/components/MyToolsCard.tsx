import React, { useState, useRef } from 'react';
import { useClassroom } from '../context/ClassroomContext';
import { ClassTools } from '../types';
import {
  Wrench,
  ChevronDown,
  ChevronRight,
  Lock,
  Upload,
  PlusCircle,
  ClipboardCheck,
  BarChart3,
  PenTool,
  Wallet,
  Users,
  SlidersHorizontal
} from 'lucide-react';
import { performRestore } from '../utils/backupActions';
import { NewClassDialog } from './views/ClassesView';
import { useClassgridPrefs } from '../utils/prefs';

interface MyToolsCardProps {
  className?: string;
  defaultExpanded?: boolean;
}

export const MyToolsCard: React.FC<MyToolsCardProps> = ({ className = '', defaultExpanded = false }) => {
  const { data, saveData, replaceAllData, uiConfirm, toast, setActiveTab } = useClassroom();
  const [prefs, updatePrefs] = useClassgridPrefs();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showNewClassDialog, setShowNewClassDialog] = useState(false);

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('classgrid_mytools_collapsed');
      return saved !== null ? saved === '1' : !defaultExpanded;
    } catch {
      return !defaultExpanded;
    }
  });

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem('classgrid_mytools_collapsed', next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  };

  const tools: ClassTools = data.tools || {
    students: true,
    attendance: true,
    results: true,
    dailyTest: true,
    funds: true,
  };

  const handleToggleTool = (key: keyof Omit<ClassTools, 'students'>) => {
    saveData(prev => {
      const curTools: ClassTools = prev.tools || {
        students: true,
        attendance: true,
        results: true,
        dailyTest: true,
        funds: true,
      };
      const nextTools: ClassTools = {
        ...curTools,
        students: true,
        [key]: !curTools[key],
      };
      return {
        ...prev,
        tools: nextTools,
      };
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await performRestore(file, replaceAllData, uiConfirm, toast);
    e.target.value = '';
  };

  const activeToolNames: string[] = ['Students'];
  if (tools.attendance) activeToolNames.push('Attendance');
  if (tools.results) activeToolNames.push('Results');
  if (tools.dailyTest) activeToolNames.push('Daily Test');
  if (tools.funds) activeToolNames.push('Funds');

  return (
    <>
      <div className={`bg-white dark:bg-[#1C1917] border border-[#E7E5E4] dark:border-[#44403C] rounded-2xl p-4 shadow-xs transition-colors ${className}`}>
        {/* Card Header */}
        <div className="flex justify-between items-center gap-2 pb-1 border-b border-[#E7E5E4] dark:border-[#44403C]">
          <div className="flex items-center gap-2">
            <Wrench className="w-4 h-4 text-[#991B1B] dark:text-[#F87171]" />
            <h3 className="text-sm font-bold text-[#1C1917] dark:text-[#F5F5F4]">
              My Tools
            </h3>
          </div>
          <button
            type="button"
            onClick={toggleCollapsed}
            className="min-h-[44px] px-2 text-xs font-bold text-[#78716C] dark:text-[#A8A29E] hover:text-[#1C1917] dark:hover:text-[#F5F5F4] flex items-center gap-1 cursor-pointer transition-colors rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800"
            aria-expanded={!collapsed}
          >
            <span>{collapsed ? 'Customize' : 'Collapse'}</span>
            {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Collapsed Hint */}
        {collapsed ? (
          <div
            onClick={toggleCollapsed}
            className="pt-2 min-h-[44px] flex items-center justify-between gap-2 flex-wrap cursor-pointer select-none text-xs"
          >
            <span className="text-[#78716C] dark:text-[#A8A29E]">
              Active for this class:{' '}
              <b className="text-[#1C1917] dark:text-[#F5F5F4]">
                {activeToolNames.join(', ')}
              </b>
            </span>
            <span className="text-[11px] font-semibold text-[#991B1B] dark:text-[#F87171] hover:underline">
              Tap to customize →
            </span>
          </div>
        ) : (
          <div className="pt-3 space-y-3">
            <p className="text-xs text-[#78716C] dark:text-[#A8A29E]">
              Select which tools to show in your navigation and dashboard. You can change this anytime without losing any saved data.
            </p>

            {/* Tool Selection List: All 4 optional tools are always shown */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {/* Students - Always Locked On */}
              <div className="min-h-[44px] flex items-center justify-between p-2.5 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/50 select-none">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-stone-200 dark:bg-stone-800 flex items-center justify-center shrink-0">
                    <Users className="w-4 h-4 text-stone-700 dark:text-stone-300" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-bold block text-stone-900 dark:text-stone-100 truncate">
                      Students
                    </span>
                    <span className="text-[11px] text-stone-500 dark:text-stone-400 block truncate">
                      Student roster & records
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 px-2 py-1 rounded-md bg-stone-200/80 dark:bg-stone-800 text-[11px] font-bold text-stone-600 dark:text-stone-300">
                  <Lock className="w-3 h-3 text-stone-500" />
                  <span>Always on</span>
                </div>
              </div>

              {/* Attendance */}
              <label className="min-h-[44px] flex items-center justify-between p-2.5 rounded-xl border border-stone-200 dark:border-stone-800 hover:border-stone-300 dark:hover:border-stone-700 bg-white dark:bg-stone-900 cursor-pointer select-none transition-colors">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    tools.attendance ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300' : 'bg-stone-100 dark:bg-stone-800 text-stone-400'
                  }`}>
                    <ClipboardCheck className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-bold block text-stone-900 dark:text-stone-100 truncate">
                      Attendance
                    </span>
                    <span className="text-[11px] text-stone-500 dark:text-stone-400 block truncate">
                      Daily roll-call & registers
                    </span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={tools.attendance}
                  onChange={() => handleToggleTool('attendance')}
                  className="w-5 h-5 rounded text-[#991B1B] focus:ring-[#991B1B] cursor-pointer"
                />
              </label>

              {/* Results */}
              <label className="min-h-[44px] flex items-center justify-between p-2.5 rounded-xl border border-stone-200 dark:border-stone-800 hover:border-stone-300 dark:hover:border-stone-700 bg-white dark:bg-stone-900 cursor-pointer select-none transition-colors">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    tools.results ? 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300' : 'bg-stone-100 dark:bg-stone-800 text-stone-400'
                  }`}>
                    <BarChart3 className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-bold block text-stone-900 dark:text-stone-100 truncate">
                      Results
                    </span>
                    <span className="text-[11px] text-stone-500 dark:text-stone-400 block truncate">
                      Exams, marks & report cards
                    </span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={tools.results}
                  onChange={() => handleToggleTool('results')}
                  className="w-5 h-5 rounded text-[#991B1B] focus:ring-[#991B1B] cursor-pointer"
                />
              </label>

              {/* Daily Test - Always visible in My Tools */}
              <label className="min-h-[44px] flex items-center justify-between p-2.5 rounded-xl border border-stone-200 dark:border-stone-800 hover:border-stone-300 dark:hover:border-stone-700 bg-white dark:bg-stone-900 cursor-pointer select-none transition-colors">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    tools.dailyTest ? 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300' : 'bg-stone-100 dark:bg-stone-800 text-stone-400'
                  }`}>
                    <PenTool className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-bold block text-stone-900 dark:text-stone-100 truncate">
                      Daily Test
                    </span>
                    <span className="text-[11px] text-stone-500 dark:text-stone-400 block truncate">
                      Quick 10-min tests register
                    </span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={tools.dailyTest}
                  onChange={() => handleToggleTool('dailyTest')}
                  className="w-5 h-5 rounded text-[#991B1B] focus:ring-[#991B1B] cursor-pointer"
                />
              </label>

              {/* Funds - Always visible in My Tools */}
              <label className="min-h-[44px] flex items-center justify-between p-2.5 rounded-xl border border-stone-200 dark:border-stone-800 hover:border-stone-300 dark:hover:border-stone-700 bg-white dark:bg-stone-900 cursor-pointer select-none transition-colors">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    tools.funds ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300' : 'bg-stone-100 dark:bg-stone-800 text-stone-400'
                  }`}>
                    <Wallet className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-bold block text-stone-900 dark:text-stone-100 truncate">
                      Funds
                    </span>
                    <span className="text-[11px] text-stone-500 dark:text-stone-400 block truncate">
                      Fee collections & balances
                    </span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={tools.funds}
                  onChange={() => handleToggleTool('funds')}
                  className="w-5 h-5 rounded text-[#991B1B] focus:ring-[#991B1B] cursor-pointer"
                />
              </label>
            </div>

            {/* Device-level Show Advanced Tools Switch */}
            <div className="pt-2 border-t border-stone-200 dark:border-stone-800">
              <label className="flex items-center justify-between p-2.5 rounded-xl border border-stone-200 dark:border-stone-800 hover:border-stone-300 dark:hover:border-stone-700 bg-white dark:bg-stone-900 cursor-pointer select-none transition-colors min-h-[44px]">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    prefs.showAdvanced ? 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300' : 'bg-stone-100 dark:bg-stone-800 text-stone-400'
                  }`}>
                    <SlidersHorizontal className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-bold block text-stone-900 dark:text-stone-100">
                      Show advanced tools
                    </span>
                    <span className="text-[11px] text-stone-500 dark:text-stone-400 block">
                      Enables Classes shelf, demo data, reset &amp; extra print tuning
                    </span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={prefs.showAdvanced}
                  onChange={e => updatePrefs({ showAdvanced: e.target.checked })}
                  className="w-5 h-5 rounded text-[#991B1B] focus:ring-[#991B1B] cursor-pointer"
                />
              </label>
            </div>
          </div>
        )}

        {/* Permanent Actions: Backup to file, Restore from file, Start new class (ALWAYS VISIBLE, 44px min tap targets) */}
        <div className="pt-3 mt-3 border-t border-[#E7E5E4] dark:border-[#44403C]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full min-h-[44px] px-3 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 bg-stone-50 hover:bg-stone-100 active:bg-stone-200 text-stone-800 border border-stone-200 dark:bg-stone-800/90 dark:hover:bg-stone-700/90 dark:text-stone-200 dark:border-stone-700 cursor-pointer transition-colors"
            >
              <Upload className="w-4 h-4 text-stone-600 dark:text-stone-300" />
              <span>Restore from file</span>
            </button>

            <button
              type="button"
              onClick={() => setShowNewClassDialog(true)}
              className="w-full min-h-[44px] px-3 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 bg-stone-50 hover:bg-stone-100 active:bg-stone-200 text-stone-800 border border-stone-200 dark:bg-stone-800/90 dark:hover:bg-stone-700/90 dark:text-stone-200 dark:border-stone-700 cursor-pointer transition-colors"
            >
              <PlusCircle className="w-4 h-4 text-[#991B1B] dark:text-[#F87171]" />
              <span>Start new class</span>
            </button>
          </div>
        </div>

        {/* Hidden file input for restore */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          onChange={handleFileChange}
          className="hidden"
          aria-hidden="true"
        />
      </div>

      {/* Start New Class Modal Dialog */}
      {showNewClassDialog && (
        <NewClassDialog
          onClose={() => setShowNewClassDialog(false)}
          onDone={() => setActiveTab('dashboard')}
        />
      )}
    </>
  );
};

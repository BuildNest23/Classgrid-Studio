import React, { useState, useRef } from 'react';
import { useClassroom } from '../context/ClassroomContext';
import { ClassTools } from '../types';
import {
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
  SlidersHorizontal,
} from 'lucide-react';
import { performRestore } from '../utils/backupActions';
import { NewClassDialog } from './views/ClassesView';
import { useClassgridPrefs } from '../utils/prefs';

interface MyToolsCardProps {
  className?: string;
  defaultExpanded?: boolean;
}

export const MyToolsCard: React.FC<MyToolsCardProps> = ({
  className = '',
  defaultExpanded = false,
}) => {
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
      try {
        localStorage.setItem('classgrid_mytools_collapsed', next ? '1' : '0');
      } catch {
        /* ignore */
      }
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
      return {
        ...prev,
        tools: {
          ...curTools,
          students: true,
          [key]: !curTools[key],
        },
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

  const optionalTools: {
    key: keyof Omit<ClassTools, 'students'>;
    label: string;
    desc: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { key: 'attendance', label: 'Attendance', desc: 'Daily roll call & registers', icon: ClipboardCheck },
    { key: 'results', label: 'Results', desc: 'Exams, marks & report cards', icon: BarChart3 },
    { key: 'dailyTest', label: 'Daily Test', desc: 'Quick 10-minute test register', icon: PenTool },
    { key: 'funds', label: 'Funds', desc: 'Fee collections & balances', icon: Wallet },
  ];

  return (
    <>
      <section
        className={`rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-5 transition-colors ${className}`}
      >
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">My Tools</h3>
            {collapsed && (
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                Active for this class: {activeToolNames.join(' · ')}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={toggleCollapsed}
            className="min-h-[44px] px-3 text-xs font-semibold text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100 flex items-center gap-1 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer shrink-0"
            aria-expanded={!collapsed}
          >
            <span>{collapsed ? 'Customize' : 'Done'}</span>
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {!collapsed && (
          <div className="mt-4 pt-4 border-t border-stone-100 dark:border-stone-800/80 space-y-4">
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Choose which tools appear for this class. Hiding a tool never deletes its saved records.
            </p>

            <div className="divide-y divide-stone-100 dark:divide-stone-800/80">
              {/* Students (always locked on) */}
              <div className="min-h-[52px] py-2.5 flex items-center justify-between gap-3 select-none">
                <div className="flex items-center gap-3 min-w-0">
                  <Users className="w-4 h-4 text-stone-500 dark:text-stone-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                      Students
                    </div>
                    <div className="text-xs text-stone-500 dark:text-stone-400">
                      Student roster &amp; records
                    </div>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-stone-400 dark:text-stone-500 shrink-0">
                  <Lock className="w-3.5 h-3.5" />
                  Always on
                </span>
              </div>

              {/* Optional Per-Class Tools */}
              {optionalTools.map(item => {
                const Icon = item.icon;
                const enabled = tools[item.key];
                return (
                  <label
                    key={item.key}
                    className="min-h-[52px] py-2.5 flex items-center justify-between gap-3 cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          enabled
                            ? 'text-red-800 dark:text-red-400'
                            : 'text-stone-400 dark:text-stone-600'
                        }`}
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                          {item.label}
                        </div>
                        <div className="text-xs text-stone-500 dark:text-stone-400">
                          {item.desc}
                        </div>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={() => handleToggleTool(item.key)}
                      className="w-5 h-5 rounded accent-red-800 cursor-pointer shrink-0"
                    />
                  </label>
                );
              })}

              {/* Device-Level Show Advanced Tools Switch */}
              <label className="min-h-[56px] pt-3.5 pb-1 flex items-center justify-between gap-3 cursor-pointer select-none">
                <div className="flex items-center gap-3 min-w-0">
                  <SlidersHorizontal
                    className={`w-4 h-4 shrink-0 ${
                      prefs.showAdvanced
                        ? 'text-red-800 dark:text-red-400'
                        : 'text-stone-400 dark:text-stone-600'
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                      Show advanced tools
                    </div>
                    <div className="text-xs text-stone-500 dark:text-stone-400">
                      Saved classes shelf, demo data, reset &amp; extra print options
                    </div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={prefs.showAdvanced}
                  onChange={e => updatePrefs({ showAdvanced: e.target.checked })}
                  className="w-5 h-5 rounded accent-red-800 cursor-pointer shrink-0"
                />
              </label>
            </div>
          </div>
        )}

        {/* Always-Visible Quick Actions */}
        <div className="pt-3.5 mt-3.5 border-t border-stone-100 dark:border-stone-800/80 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 bg-stone-50 hover:bg-stone-100 text-stone-800 border border-stone-200 dark:bg-stone-800/70 dark:hover:bg-stone-800 dark:text-stone-200 dark:border-stone-700 cursor-pointer transition-colors"
          >
            <Upload className="w-4 h-4 text-stone-500 dark:text-stone-400" />
            <span>Restore from file</span>
          </button>

          <button
            type="button"
            onClick={() => setShowNewClassDialog(true)}
            className="w-full min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 bg-stone-50 hover:bg-stone-100 text-stone-800 border border-stone-200 dark:bg-stone-800/70 dark:hover:bg-stone-800 dark:text-stone-200 dark:border-stone-700 cursor-pointer transition-colors"
          >
            <PlusCircle className="w-4 h-4 text-red-800 dark:text-red-400" />
            <span>Start new class</span>
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          onChange={handleFileChange}
          className="hidden"
          aria-hidden="true"
        />
      </section>

      {showNewClassDialog && (
        <NewClassDialog
          onClose={() => setShowNewClassDialog(false)}
          onDone={() => setActiveTab('dashboard')}
        />
      )}
    </>
  );
};

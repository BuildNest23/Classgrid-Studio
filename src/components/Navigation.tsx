import React, { useEffect, useState } from 'react';
import { useClassroom } from '../context/ClassroomContext';
import { ActiveTab } from '../types';
import { ClassSwitcher } from './ClassSwitcher';
import {
  LayoutDashboard,
  ClipboardCheck,
  BarChart3,
  Wallet,
  Users,
  Settings,
  Menu,
  X,
  HelpCircle,
  PenTool,
  ArrowLeftRight,
  LayoutGrid,
  SlidersHorizontal,
  Sun,
  Moon,
} from 'lucide-react';
import { useClassgridPrefs } from '../utils/prefs';

interface NavItem {
  id: ActiveTab;
  label: string;
  desc?: string;
  icon: React.ComponentType<{ className?: string }>;
  pending?: boolean;
}

export const Navigation: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    isTodayAttendanceTaken,
    openHelp,
    data,
    darkMode,
    toggleDarkMode,
  } = useClassroom();
  const [showMoreSheet, setShowMoreSheet] = useState(false);
  const [prefs, updatePrefs] = useClassgridPrefs();

  useEffect(() => {
    if (!showMoreSheet) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowMoreSheet(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showMoreSheet]);

  const tools = data.tools || {
    students: true,
    attendance: true,
    results: true,
    dailyTest: true,
    funds: true,
  };

  const attPending = data.students.length > 0 && !isTodayAttendanceTaken();

  // Grouped Desktop Sidebar Navigation (merged: Classes + Saved Shelf, Students + Print Roster)
  const schoolItems: NavItem[] = [
    { id: 'board', label: 'Classes', icon: LayoutGrid },
  ];

  const classItems: NavItem[] = [
    { id: 'dashboard', label: 'Class Home', icon: LayoutDashboard },
    ...(tools.attendance
      ? [{ id: 'attendance' as ActiveTab, label: 'Attendance', icon: ClipboardCheck, pending: attPending }]
      : []),
    ...(tools.dailyTest
      ? [{ id: 'dailytest' as ActiveTab, label: 'Daily Test', icon: PenTool }]
      : []),
    ...(tools.results
      ? [{ id: 'results' as ActiveTab, label: 'Results', icon: BarChart3 }]
      : []),
    ...(tools.funds
      ? [{ id: 'funds' as ActiveTab, label: 'Funds', icon: Wallet }]
      : []),
    { id: 'students', label: 'Students', icon: Users },
  ];

  const workspaceItems: NavItem[] = [
    { id: 'inbox', label: 'Exchange', icon: ArrowLeftRight },
    { id: 'settings', label: 'Settings & Backup', icon: Settings },
  ];

  // Mobile Primary Bottom Bar (up to 4 items + More)
  const candidateMainTabs: NavItem[] = [
    { id: 'board', label: 'Classes', icon: LayoutGrid },
    ...(tools.attendance
      ? [{ id: 'attendance' as ActiveTab, label: 'Attendance', icon: ClipboardCheck, pending: attPending }]
      : []),
    ...(tools.results ? [{ id: 'results' as ActiveTab, label: 'Results', icon: BarChart3 }] : []),
    ...(tools.funds ? [{ id: 'funds' as ActiveTab, label: 'Funds', icon: Wallet }] : []),
  ];

  if (candidateMainTabs.length < 4) {
    candidateMainTabs.push({ id: 'students', label: 'Students', icon: Users });
  }
  if (candidateMainTabs.length < 4) {
    candidateMainTabs.push({ id: 'dashboard', label: 'Class', icon: LayoutDashboard });
  }
  const mainTabs = candidateMainTabs.slice(0, 4);

  // Mobile "More" Sheet Grouped Lists (no duplicate Saved Classes or Print Roster entries)
  const moreClassItems: NavItem[] = [
    ...(!mainTabs.some(t => t.id === 'dashboard')
      ? [{ id: 'dashboard' as ActiveTab, label: 'Class Home', desc: 'Metrics, roll call & overview', icon: LayoutDashboard }]
      : []),
    ...(tools.dailyTest
      ? [{ id: 'dailytest' as ActiveTab, label: 'Daily Test Register', desc: '10-minute tests & printable sheets', icon: PenTool }]
      : []),
    ...(!mainTabs.some(t => t.id === 'students')
      ? [{ id: 'students' as ActiveTab, label: 'Students & Print', desc: 'Enroll, edit, print & export roster', icon: Users }]
      : []),
  ];

  const moreSchoolItems: NavItem[] = [
    { id: 'inbox', label: 'Exchange', desc: 'Class files, school Excel & quick forms', icon: ArrowLeftRight },
    { id: 'settings', label: 'Settings & Backup', desc: 'School details, logo, backups & PIN', icon: Settings },
  ];

  const isTabActive = (id: ActiveTab) => {
    if (id === 'board') return activeTab === 'board' || activeTab === 'classes';
    if (id === 'students') return activeTab === 'students' || activeTab === 'view';
    if (id === 'inbox') return activeTab === 'inbox' || activeTab === 'collect';
    return activeTab === id;
  };

  const isMoreActive = !mainTabs.some(t => isTabActive(t.id));

  const renderSidebarGroup = (heading: string, items: NavItem[]) => (
    <div className="space-y-0.5">
      <div className="px-3 pt-1 pb-1.5 text-[11px] font-semibold text-stone-400 dark:text-stone-500 tracking-wide">
        {heading}
      </div>
      {items.map(item => {
        const Icon = item.icon;
        const isActive = isTabActive(item.id);
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveTab(item.id)}
            className={`w-full min-h-[40px] px-3 py-2 rounded-xl text-[13px] flex items-center justify-between gap-2.5 transition-colors cursor-pointer whitespace-nowrap ${
              isActive
                ? 'bg-red-50 dark:bg-red-950/50 text-red-800 dark:text-red-300 font-semibold'
                : 'text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800/70 hover:text-stone-900 dark:hover:text-stone-100 font-medium'
            }`}
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <Icon
                className={`w-4 h-4 shrink-0 ${
                  isActive ? 'text-red-800 dark:text-red-400' : 'text-stone-400 dark:text-stone-500'
                }`}
              />
              <span className="truncate">{item.label}</span>
            </span>
            {item.pending && (
              <span className="text-[11px] font-semibold text-red-700 dark:text-red-400 shrink-0">
                Due
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  return (
    <>
      {/* Desktop Left Sidebar Rail (lg+) */}
      <aside className="no-print hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 lg:w-[248px] z-40 bg-white dark:bg-stone-900 border-r border-stone-200 dark:border-stone-800 transition-colors">
        {/* Brand Header */}
        <div className="h-14 px-4 flex items-center gap-2.5 border-b border-stone-200 dark:border-stone-800 shrink-0">
          <div className="w-8 h-8 rounded-xl bg-red-800 dark:bg-red-700 flex items-center justify-center text-white font-bold text-xs tracking-tight shrink-0">
            CG
          </div>
          <span className="text-[15px] font-bold tracking-tight text-stone-900 dark:text-stone-100 whitespace-nowrap truncate">
            ClassGrid Studio
          </span>
        </div>

        {/* Quick Class Switcher */}
        <div className="p-3 border-b border-stone-100 dark:border-stone-800/80 shrink-0">
          <ClassSwitcher variant="sidebar" />
        </div>

        {/* Scrollable Navigation Groups */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-5" aria-label="Main navigation">
          {renderSidebarGroup('School', schoolItems)}
          {renderSidebarGroup('Classroom', classItems)}
          {renderSidebarGroup('Exchange & Setup', workspaceItems)}
        </nav>

        {/* Sidebar Utility Footer */}
        <div className="p-3 border-t border-stone-200 dark:border-stone-800 space-y-1 shrink-0">
          {!prefs.showAdvanced && (
            <button
              type="button"
              onClick={() => updatePrefs({ showAdvanced: true })}
              className="w-full min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold text-red-800 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 flex items-center gap-2 transition-colors cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Show advanced tools</span>
            </button>
          )}
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={toggleDarkMode}
              className="min-h-[38px] px-2.5 py-1.5 rounded-xl text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {darkMode ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5" />}
              <span>{darkMode ? 'Light' : 'Dark'}</span>
            </button>
            <button
              type="button"
              onClick={openHelp}
              className="min-h-[38px] px-2.5 py-1.5 rounded-xl text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Guide</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Bottom Navigation Bar (< lg) */}
      <nav
        id="bottomNavBar"
        className="no-print lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-stone-900/95 backdrop-blur-md border-t border-stone-200 dark:border-stone-800 pb-safe transition-colors"
        aria-label="Mobile navigation"
      >
        <div
          className="grid h-[60px] items-center px-1 max-w-lg mx-auto"
          style={{ gridTemplateColumns: `repeat(${mainTabs.length + 1}, minmax(0, 1fr))` }}
        >
          {mainTabs.map(tab => {
            const Icon = tab.icon;
            const isActive = isTabActive(tab.id);
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex flex-col items-center justify-center h-full min-h-[44px] transition-colors active:scale-95 cursor-pointer ${
                  isActive
                    ? 'text-red-800 dark:text-red-400'
                    : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
                }`}
              >
                {isActive && (
                  <span
                    className="absolute top-0 left-1/2 -translate-x-1/2 w-7 h-0.5 rounded-b-full bg-red-800 dark:bg-red-400"
                    aria-hidden="true"
                  />
                )}
                <div className="relative">
                  <Icon className="w-[21px] h-[21px]" />
                  {tab.pending && (
                    <span
                      className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-red-700 dark:bg-red-400 ring-2 ring-white dark:ring-stone-900"
                      title="Today's attendance pending"
                    />
                  )}
                </div>
                <span className={`text-[10px] mt-1 leading-none whitespace-nowrap ${isActive ? 'font-bold' : 'font-medium'}`}>
                  {tab.label}
                </span>
              </button>
            );
          })}

          {/* More Trigger */}
          <button
            type="button"
            onClick={() => setShowMoreSheet(true)}
            className={`relative flex flex-col items-center justify-center h-full min-h-[44px] transition-colors active:scale-95 cursor-pointer ${
              isMoreActive
                ? 'text-red-800 dark:text-red-400'
                : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
            }`}
          >
            {isMoreActive && (
              <span
                className="absolute top-0 left-1/2 -translate-x-1/2 w-7 h-0.5 rounded-b-full bg-red-800 dark:bg-red-400"
                aria-hidden="true"
              />
            )}
            <Menu className="w-[21px] h-[21px]" />
            <span className={`text-[10px] mt-1 leading-none ${isMoreActive ? 'font-bold' : 'font-medium'}`}>
              More
            </span>
          </button>
        </div>
      </nav>

      {/* Mobile "More" Bottom Sheet */}
      {showMoreSheet && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/55 backdrop-blur-[2px]"
          onMouseDown={() => setShowMoreSheet(false)}
        >
          <div
            className="cg-sheet-up w-full max-w-lg mx-auto bg-white dark:bg-stone-900 rounded-t-3xl border-t border-stone-200 dark:border-stone-800 pb-safe shadow-2xl overflow-hidden"
            onMouseDown={e => e.stopPropagation()}
          >
            {/* Drag Handle */}
            <div className="pt-3 pb-1 flex justify-center">
              <div className="w-10 h-1 bg-stone-300 dark:bg-stone-700 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-stone-200 dark:border-stone-800">
              <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">
                All Tools
              </h3>
              <button
                type="button"
                onClick={() => setShowMoreSheet(false)}
                className="w-10 h-10 -mr-2 flex items-center justify-center text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 rounded-xl cursor-pointer"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Grouped List */}
            <div className="p-3 max-h-[65vh] overflow-y-auto space-y-4">
              {moreClassItems.length > 0 && (
                <div>
                  <div className="px-3 pb-1.5 text-[11px] font-semibold text-stone-400 dark:text-stone-500">
                    Current class
                  </div>
                  <div className="divide-y divide-stone-100 dark:divide-stone-800/70">
                    {moreClassItems.map(tab => {
                      const Icon = tab.icon;
                      const isActive = isTabActive(tab.id);
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => {
                            setShowMoreSheet(false);
                            setActiveTab(tab.id);
                          }}
                          className={`w-full min-h-[54px] px-3 py-2.5 flex items-center gap-3.5 text-left rounded-xl transition-colors cursor-pointer ${
                            isActive
                              ? 'bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-200'
                              : 'text-stone-900 dark:text-stone-100 hover:bg-stone-50 dark:hover:bg-stone-800/50'
                          }`}
                        >
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                              isActive
                                ? 'bg-red-800 text-white'
                                : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300'
                            }`}
                          >
                            <Icon className="w-[18px] h-[18px]" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold truncate">{tab.label}</div>
                            {tab.desc && (
                              <div className="text-xs text-stone-500 dark:text-stone-400 truncate">
                                {tab.desc}
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <div className="px-3 pb-1.5 text-[11px] font-semibold text-stone-400 dark:text-stone-500">
                  School &amp; data
                </div>
                <div className="divide-y divide-stone-100 dark:divide-stone-800/70">
                  {moreSchoolItems.map(tab => {
                    const Icon = tab.icon;
                    const isActive = isTabActive(tab.id);
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => {
                          setShowMoreSheet(false);
                          setActiveTab(tab.id);
                        }}
                        className={`w-full min-h-[54px] px-3 py-2.5 flex items-center gap-3.5 text-left rounded-xl transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-200'
                            : 'text-stone-900 dark:text-stone-100 hover:bg-stone-50 dark:hover:bg-stone-800/50'
                        }`}
                      >
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                            isActive
                              ? 'bg-red-800 text-white'
                              : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300'
                          }`}
                        >
                          <Icon className="w-[18px] h-[18px]" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold truncate">{tab.label}</div>
                          {tab.desc && (
                            <div className="text-xs text-stone-500 dark:text-stone-400 truncate">
                              {tab.desc}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => {
                      setShowMoreSheet(false);
                      openHelp();
                    }}
                    className="w-full min-h-[54px] px-3 py-2.5 flex items-center gap-3.5 text-left rounded-xl text-stone-900 dark:text-stone-100 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors cursor-pointer"
                  >
                    <div className="w-9 h-9 rounded-xl bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 flex items-center justify-center shrink-0">
                      <HelpCircle className="w-[18px] h-[18px]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold truncate">Help &amp; User Guide</div>
                      <div className="text-xs text-stone-500 dark:text-stone-400 truncate">
                        Instructions &amp; keyboard shortcuts
                      </div>
                    </div>
                  </button>
                </div>
              </div>
            </div>

            {/* Show Advanced Tools Footer */}
            {!prefs.showAdvanced && (
              <div className="p-3 border-t border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950/40">
                <button
                  type="button"
                  onClick={() => updatePrefs({ showAdvanced: true })}
                  className="w-full min-h-[44px] text-xs font-semibold text-red-800 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <SlidersHorizontal className="w-4 h-4" />
                  <span>Need more? Show advanced tools</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

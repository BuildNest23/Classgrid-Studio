import React, { useState } from 'react';
import { useClassroom } from '../context/ClassroomContext';
import { ActiveTab } from '../types';
import {
  LayoutDashboard,
  ClipboardCheck,
  BarChart3,
  Wallet,
  Users,
  FileText,
  Settings,
  Menu,
  X,
  HelpCircle,
  PenTool,
  Archive,
  Send,
  SlidersHorizontal
} from 'lucide-react';
import { useClassgridPrefs } from '../utils/prefs';

export const Navigation: React.FC = () => {
  const { activeTab, setActiveTab, isTodayAttendanceTaken, openHelp, data } = useClassroom();
  const [showMoreSheet, setShowMoreSheet] = useState(false);
  const [prefs, updatePrefs] = useClassgridPrefs();

  const tools = data.tools || {
    students: true,
    attendance: true,
    results: true,
    dailyTest: true,
    funds: true,
  };

  const showAttBadge = !isTodayAttendanceTaken();

  // Desktop navigation: filter by active tools and advanced status
  const desktopAllTabs = [
    { id: 'dashboard' as ActiveTab, label: 'Dashboard', icon: LayoutDashboard },
    ...(tools.attendance ? [{ id: 'attendance' as ActiveTab, label: 'Attendance', icon: ClipboardCheck, hasBadge: showAttBadge }] : []),
    ...(tools.dailyTest ? [{ id: 'dailytest' as ActiveTab, label: 'Daily Test', icon: PenTool }] : []),
    ...(tools.results ? [{ id: 'results' as ActiveTab, label: 'Results', icon: BarChart3 }] : []),
    ...(tools.funds ? [{ id: 'funds' as ActiveTab, label: 'Funds', icon: Wallet }] : []),
    { id: 'students' as ActiveTab, label: 'Students', icon: Users },
    { id: 'view' as ActiveTab, label: 'Student list (Print)', icon: FileText },
    { id: 'collect' as ActiveTab, label: 'Send & Receive', icon: Send },
    ...(prefs.showAdvanced ? [{ id: 'classes' as ActiveTab, label: 'Classes', icon: Archive }] : []),
    { id: 'settings' as ActiveTab, label: 'Class details & backup', icon: Settings },
  ];

  // Mobile main bottom bar tabs
  const candidateMainTabs: { id: ActiveTab; label: string; icon: any; hasBadge?: boolean }[] = [
    { id: 'dashboard' as ActiveTab, label: 'Home', icon: LayoutDashboard },
    ...(tools.attendance ? [{ id: 'attendance' as ActiveTab, label: 'Attendance', icon: ClipboardCheck, hasBadge: showAttBadge }] : []),
    ...(tools.results ? [{ id: 'results' as ActiveTab, label: 'Results', icon: BarChart3 }] : []),
    ...(tools.funds ? [{ id: 'funds' as ActiveTab, label: 'Funds', icon: Wallet }] : []),
  ];

  // If fewer than 4 main tabs, bring Students into the mobile bottom bar for convenience
  if (candidateMainTabs.length < 4) {
    candidateMainTabs.push({ id: 'students' as ActiveTab, label: 'Students', icon: Users });
  }
  const mainTabs = candidateMainTabs.slice(0, 4);

  // Mobile "More" sheet items
  const moreTabs = [
    ...(tools.dailyTest ? [{
      id: 'dailytest' as ActiveTab,
      label: 'Daily Test Register',
      icon: PenTool,
      desc: '10-min daily tests · SED Punjab 2-page register'
    }] : []),
    ...(!mainTabs.some(t => t.id === 'students') ? [{
      id: 'students' as ActiveTab,
      label: 'Students',
      icon: Users,
      desc: 'Add, edit, reorder student records'
    }] : []),
    {
      id: 'view' as ActiveTab,
      label: 'Student list (Print)',
      icon: FileText,
      desc: 'Tap any box to correct it · print or save as HD image'
    },
    {
      id: 'collect' as ActiveTab,
      label: 'Send & Receive',
      icon: Send,
      desc: 'Send a form to a teacher · receive their entries'
    },
    ...(prefs.showAdvanced ? [{
      id: 'classes' as ActiveTab,
      label: 'Classes',
      icon: Archive,
      desc: 'Save, switch & start classes · keep every class safe'
    }] : []),
    {
      id: 'settings' as ActiveTab,
      label: 'Class details & backup',
      icon: Settings,
      desc: 'Class info, school logo, backup & restore'
    },
    {
      id: 'help' as const,
      label: 'Help / User Guide',
      icon: HelpCircle,
      desc: 'Step-by-step instructions & shortcuts'
    },
  ];

  const isMoreActive =
    !mainTabs.some(t => t.id === activeTab) && activeTab !== 'dashboard';

  return (
    <>
      {/* Desktop Top Navigation Bar (Hidden on Mobile) */}
      <nav className="hidden lg:flex items-center justify-center gap-1.5 py-2.5 px-4 bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800 transition-colors">
        {desktopAllTabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'bg-red-800 dark:bg-red-700 text-white shadow-xs'
                  : 'text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {tab.hasBadge && (
                <span
                  className="w-2 h-2 rounded-full bg-red-400 ring-2 ring-white dark:ring-stone-900"
                  title="Today's attendance not taken"
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Mobile Bottom Navigation Bar (Always visible on mobile) */}
      <nav
        id="bottomNavBar"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-stone-900/95 backdrop-blur-md border-t border-stone-200 dark:border-stone-800 pb-safe transition-colors"
      >
        <div
          className="grid h-16 items-center px-1"
          style={{ gridTemplateColumns: `repeat(${mainTabs.length + 1}, minmax(0, 1fr))` }}
        >
          {mainTabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex flex-col items-center justify-center h-full py-1 rounded-2xl transition active:scale-95 cursor-pointer ${
                  isActive
                    ? 'text-red-800 dark:text-red-400 font-black'
                    : 'text-stone-500 dark:text-stone-400 font-semibold hover:text-stone-800'
                }`}
              >
                <div
                  className={`p-1 rounded-full transition ${
                    isActive ? 'bg-red-100 dark:bg-red-950/80' : ''
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-[10px] tracking-tight mt-0.5">{tab.label}</span>
                {tab.hasBadge && (
                  <span
                    className="absolute top-1.5 right-[calc(50%-16px)] w-2 h-2 rounded-full bg-red-600 ring-2 ring-white dark:ring-stone-900"
                    title="Attendance pending today"
                  />
                )}
              </button>
            );
          })}

          {/* More Sheet Trigger */}
          <button
            type="button"
            onClick={() => setShowMoreSheet(true)}
            className={`flex flex-col items-center justify-center h-full py-1 rounded-2xl transition active:scale-95 cursor-pointer ${
              isMoreActive
                ? 'text-red-800 dark:text-red-400 font-black'
                : 'text-stone-500 dark:text-stone-400 font-semibold hover:text-stone-800'
            }`}
          >
            <div
              className={`p-1 rounded-full transition ${
                isMoreActive ? 'bg-red-100 dark:bg-red-950/80' : ''
              }`}
            >
              <Menu className="w-5 h-5" />
            </div>
            <span className="text-[10px] tracking-tight mt-0.5">More</span>
          </button>
        </div>
      </nav>

      {/* More Slide-Up Bottom Sheet (Mobile) */}
      {showMoreSheet && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setShowMoreSheet(false)}
        >
          <div
            className="w-full max-w-lg mx-auto bg-white dark:bg-stone-900 rounded-t-3xl border-t border-stone-200 dark:border-stone-800 pb-safe shadow-2xl animate-in slide-in-from-bottom duration-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sheet Handle */}
            <div className="pt-3 pb-1 flex justify-center">
              <div className="w-12 h-1.5 bg-stone-300 dark:bg-stone-700 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-stone-200 dark:border-stone-800">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-red-800 dark:bg-red-700 text-white flex items-center justify-center text-xs font-black">
                  CG
                </div>
                <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">
                  ClassGrid Management
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowMoreSheet(false)}
                className="p-1.5 -mr-1.5 text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 rounded-full cursor-pointer"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Navigation List */}
            <div className="p-3 divide-y divide-stone-100 dark:divide-stone-800/60 max-h-[60vh] overflow-y-auto">
              {moreTabs.map(tab => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setShowMoreSheet(false);
                      if (tab.id === 'help') {
                        openHelp();
                      } else {
                        setActiveTab(tab.id);
                      }
                    }}
                    className={`w-full min-h-[56px] px-4 py-3 flex items-center gap-3.5 text-left rounded-2xl transition active:bg-stone-200 dark:active:bg-stone-800 cursor-pointer ${
                      isActive
                        ? 'bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-200'
                        : 'text-stone-800 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-800/40'
                    }`}
                  >
                    <div
                      className={`p-2.5 rounded-xl shrink-0 ${
                        isActive
                          ? 'bg-red-700 text-white'
                          : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold truncate">{tab.label}</div>
                      <div className="text-xs text-stone-500 truncate">{tab.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Need more? Show advanced tools */}
            {!prefs.showAdvanced && (
              <div className="p-3 border-t border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/60">
                <button
                  type="button"
                  onClick={() => {
                    updatePrefs({ showAdvanced: true });
                  }}
                  className="w-full min-h-[44px] text-xs font-bold text-[#991B1B] dark:text-[#F87171] hover:underline cursor-pointer flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
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

import React, { useEffect, useState } from 'react';
import { useClassroom } from '../../context/ClassroomContext';
import { useAppMode } from '../../utils/useAppMode';
import { ActiveTab } from '../../types';
import {
  LayoutDashboard,
  ClipboardCheck,
  BarChart3,
  Menu,
  X,
  Wallet,
  Users,
  FileDown,
  Send,
  HelpCircle,
  Building2,
  Sun,
  Moon,
} from 'lucide-react';
import { PinPad } from './PinPad';
import { hasPin } from '../../utils/appMode';

export const TeacherNavigation: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    openHelp,
    isTodayAttendanceTaken,
    data,
    darkMode,
    toggleDarkMode,
  } = useClassroom();
  const [, setMode] = useAppMode();
  const [more, setMore] = useState(false);
  const [pin, setPinAsk] = useState(false);
  const hasClass = !!data.classId;
  const attPending = hasClass && data.students.length > 0 && !isTodayAttendanceTaken();

  useEffect(() => {
    if (!more) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMore(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [more]);

  const main: {
    id: ActiveTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    pending?: boolean;
    needsClass?: boolean;
  }[] = [
    { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
    { id: 'attendance', label: 'Attendance', icon: ClipboardCheck, pending: attPending, needsClass: true },
    { id: 'results', label: 'Marks', icon: BarChart3, needsClass: true },
  ];

  const menu: {
    id: string;
    label: string;
    desc: string;
    icon: React.ComponentType<{ className?: string }>;
    needsClass?: boolean;
  }[] = [
    { id: 'funds', label: 'Funds', desc: 'Fees & collections', icon: Wallet, needsClass: true },
    { id: 'students', label: 'Students', desc: 'Class list (view only)', icon: Users, needsClass: true },
    { id: 'forms', label: 'Marks Forms', desc: 'Send a marks form to subject teachers', icon: Send, needsClass: true },
    { id: 'collect', label: 'Class File', desc: 'Open, update or send to management', icon: FileDown },
    { id: 'help', label: 'Help & Guide', desc: 'How to use ClassGrid', icon: HelpCircle },
    { id: 'mgmt', label: 'Switch to Management', desc: hasPin() ? 'PIN required' : 'For school principals', icon: Building2 },
  ];

  const desktopClassItems = [
    { id: 'dashboard' as ActiveTab, label: 'Home', icon: LayoutDashboard, needsClass: false, pending: false },
    { id: 'attendance' as ActiveTab, label: 'Attendance', icon: ClipboardCheck, needsClass: true, pending: attPending },
    { id: 'results' as ActiveTab, label: 'Marks & Results', icon: BarChart3, needsClass: true, pending: false },
    { id: 'funds' as ActiveTab, label: 'Funds', icon: Wallet, needsClass: true, pending: false },
    { id: 'students' as ActiveTab, label: 'Students', icon: Users, needsClass: true, pending: false },
  ];

  const desktopFileItems = [
    { id: 'collect' as ActiveTab, label: 'Class File', icon: FileDown, needsClass: false },
    { id: 'forms' as ActiveTab, label: 'Marks Forms', icon: Send, needsClass: true },
  ];

  const inMenu = !main.some(m => m.id === activeTab);

  const go = (id: string, disabled?: boolean) => {
    if (disabled) return;
    setMore(false);
    if (id === 'help') openHelp();
    else if (id === 'mgmt') {
      if (hasPin()) setPinAsk(true);
      else setMode('management');
    } else setActiveTab(id as ActiveTab);
  };

  return (
    <>
      {/* Desktop Left Sidebar Rail (lg+) */}
      <aside className="no-print hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 lg:w-[248px] z-40 bg-white dark:bg-stone-900 border-r border-stone-200 dark:border-stone-800 transition-colors">
        <div className="h-14 px-4 flex items-center gap-2.5 border-b border-stone-200 dark:border-stone-800 shrink-0">
          <div className="w-8 h-8 rounded-xl bg-red-800 dark:bg-red-700 flex items-center justify-center text-white font-bold text-xs tracking-tight shrink-0">
            CG
          </div>
          <span className="text-[15px] font-bold tracking-tight text-stone-900 dark:text-stone-100 whitespace-nowrap truncate">
            ClassGrid Studio
          </span>
        </div>

        {/* Active Class Summary */}
        <div className="p-3 border-b border-stone-100 dark:border-stone-800/80 shrink-0">
          <div className="px-3 py-2.5 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50/80 dark:bg-stone-800/50">
            <div className="text-[11px] font-medium text-stone-500 dark:text-stone-400 leading-none">
              Teacher mode
            </div>
            <div className="text-sm font-bold text-stone-900 dark:text-stone-100 truncate mt-1">
              {hasClass ? data.className || 'My Class' : 'No class file open'}
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-5" aria-label="Teacher navigation">
          <div className="space-y-0.5">
            <div className="px-3 pt-1 pb-1.5 text-[11px] font-semibold text-stone-400 dark:text-stone-500 tracking-wide">
              Classroom
            </div>
            {desktopClassItems.map(item => {
              const Icon = item.icon;
              const disabled = item.needsClass && !hasClass;
              const isActive = activeTab === item.id && !disabled;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => !disabled && setActiveTab(item.id)}
                  className={`w-full min-h-[40px] px-3 py-2 rounded-xl text-[13px] flex items-center justify-between gap-2.5 transition-colors whitespace-nowrap ${
                    disabled
                      ? 'opacity-40 cursor-not-allowed text-stone-400 dark:text-stone-500'
                      : isActive
                      ? 'bg-red-50 dark:bg-red-950/50 text-red-800 dark:text-red-300 font-semibold cursor-pointer'
                      : 'text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800/70 font-medium cursor-pointer'
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

          <div className="space-y-0.5">
            <div className="px-3 pt-1 pb-1.5 text-[11px] font-semibold text-stone-400 dark:text-stone-500 tracking-wide">
              Sync &amp; Forms
            </div>
            {desktopFileItems.map(item => {
              const Icon = item.icon;
              const disabled = item.needsClass && !hasClass;
              const isActive = activeTab === item.id && !disabled;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => !disabled && setActiveTab(item.id)}
                  className={`w-full min-h-[40px] px-3 py-2 rounded-xl text-[13px] flex items-center gap-2.5 transition-colors whitespace-nowrap ${
                    disabled
                      ? 'opacity-40 cursor-not-allowed text-stone-400 dark:text-stone-500'
                      : isActive
                      ? 'bg-red-50 dark:bg-red-950/50 text-red-800 dark:text-red-300 font-semibold cursor-pointer'
                      : 'text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800/70 font-medium cursor-pointer'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isActive ? 'text-red-800 dark:text-red-400' : 'text-stone-400 dark:text-stone-500'
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        <div className="p-3 border-t border-stone-200 dark:border-stone-800 space-y-1.5 shrink-0">
          <button
            type="button"
            onClick={() => go('mgmt')}
            className="w-full min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center gap-2 transition-colors cursor-pointer"
          >
            <Building2 className="w-3.5 h-3.5 text-stone-500 shrink-0" />
            <span className="truncate">Management mode</span>
          </button>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={toggleDarkMode}
              className="min-h-[38px] px-2.5 py-1.5 rounded-xl text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
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
        className="no-print lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-stone-900/95 backdrop-blur-md border-t border-stone-200 dark:border-stone-800 pb-safe"
        aria-label="Teacher mobile navigation"
      >
        <div
          className="grid h-[60px] items-center px-1 max-w-lg mx-auto"
          style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}
        >
          {main.map(t => {
            const Icon = t.icon;
            const disabled = !!t.needsClass && !hasClass;
            const isActive = activeTab === t.id && !disabled;
            return (
              <button
                key={t.id}
                type="button"
                disabled={disabled}
                onClick={() => !disabled && setActiveTab(t.id)}
                className={`relative flex flex-col items-center justify-center h-full min-h-[44px] transition-colors ${
                  disabled
                    ? 'opacity-40 cursor-not-allowed text-stone-400 dark:text-stone-500'
                    : isActive
                    ? 'text-red-800 dark:text-red-400 cursor-pointer active:scale-95'
                    : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 cursor-pointer active:scale-95'
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
                  {t.pending && (
                    <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-red-700 dark:bg-red-400 ring-2 ring-white dark:ring-stone-900" />
                  )}
                </div>
                <span className={`text-[10px] mt-1 leading-none ${isActive ? 'font-bold' : 'font-medium'}`}>
                  {t.label}
                </span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setMore(true)}
            className={`relative flex flex-col items-center justify-center h-full min-h-[44px] transition-colors cursor-pointer active:scale-95 ${
              inMenu
                ? 'text-red-800 dark:text-red-400'
                : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
            }`}
          >
            {inMenu && (
              <span
                className="absolute top-0 left-1/2 -translate-x-1/2 w-7 h-0.5 rounded-b-full bg-red-800 dark:bg-red-400"
                aria-hidden="true"
              />
            )}
            <Menu className="w-[21px] h-[21px]" />
            <span className={`text-[10px] mt-1 leading-none ${inMenu ? 'font-bold' : 'font-medium'}`}>
              Menu
            </span>
          </button>
        </div>
      </nav>

      {/* Mobile Slide-Up Menu Sheet */}
      {more && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/55 backdrop-blur-[2px]"
          onMouseDown={() => setMore(false)}
        >
          <div
            className="cg-sheet-up w-full max-w-lg mx-auto bg-white dark:bg-stone-900 rounded-t-3xl border-t border-stone-200 dark:border-stone-800 pb-safe shadow-2xl overflow-hidden"
            onMouseDown={e => e.stopPropagation()}
          >
            <div className="pt-3 pb-1 flex justify-center">
              <div className="w-10 h-1 bg-stone-300 dark:bg-stone-700 rounded-full" />
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-b border-stone-200 dark:border-stone-800">
              <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">Teacher Menu</h3>
              <button
                type="button"
                onClick={() => setMore(false)}
                className="w-10 h-10 -mr-2 flex items-center justify-center text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 rounded-xl cursor-pointer"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-3 divide-y divide-stone-100 dark:divide-stone-800/70 max-h-[65vh] overflow-y-auto">
              {menu.map(m => {
                const I = m.icon;
                const disabled = !!m.needsClass && !hasClass;
                const isActive = activeTab === m.id && !disabled;
                return (
                  <button
                    key={m.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => go(m.id, disabled)}
                    className={`w-full min-h-[54px] px-3 py-2.5 flex items-center gap-3.5 text-left rounded-xl transition-colors ${
                      disabled
                        ? 'opacity-40 cursor-not-allowed'
                        : isActive
                        ? 'bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-200 cursor-pointer'
                        : 'text-stone-900 dark:text-stone-100 hover:bg-stone-50 dark:hover:bg-stone-800/50 cursor-pointer'
                    }`}
                  >
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        isActive
                          ? 'bg-red-800 text-white'
                          : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300'
                      }`}
                    >
                      <I className="w-[18px] h-[18px]" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{m.label}</div>
                      <div className="text-xs text-stone-500 dark:text-stone-400 truncate">
                        {disabled ? 'Open a class file first' : m.desc}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {pin && (
        <PinPad
          onCancel={() => setPinAsk(false)}
          onOk={() => {
            setPinAsk(false);
            setMode('management');
          }}
        />
      )}
    </>
  );
};

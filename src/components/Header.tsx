import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useClassroom } from '../context/ClassroomContext';
import { ClassSwitcher } from './ClassSwitcher';
import {
  Undo2,
  Redo2,
  Sun,
  Moon,
  HelpCircle,
  Download,
  Share,
  X,
  Check,
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { defaultClassName } from '../utils/classShelf';

interface HeaderProps {
  activeViewTitle?: string;
  isTeacherMode?: boolean;
}

const TABLE_TABS = new Set(['attendance', 'dailytest', 'results', 'funds', 'students', 'view']);

export const Header: React.FC<HeaderProps> = ({ activeViewTitle, isTeacherMode = false }) => {
  const {
    data,
    activeTab,
    darkMode,
    toggleDarkMode,
    changeTableSize,
    openHelp,
    undo,
    redo,
    canUndo,
    canRedo,
    isSavedFlashing,
  } = useClassroom();

  const [showInstallModal, setShowInstallModal] = useState<'ios' | 'other' | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallButton, setShowInstallButton] = useState(false);
  const [hiddenOnScroll, setHiddenOnScroll] = useState(false);
  const lastYRef = useRef(0);
  const hiddenRef = useRef(false);

  // Mobile only: hide header when scrolling down, reveal on scroll up
  useEffect(() => {
    const setHidden = (v: boolean) => {
      if (hiddenRef.current !== v) {
        hiddenRef.current = v;
        setHiddenOnScroll(v);
        document.documentElement.classList.toggle('header-hidden', v);
      }
    };
    const onScroll = () => {
      if (window.innerWidth >= 1024) {
        setHidden(false);
        lastYRef.current = window.scrollY;
        return;
      }
      const y = window.scrollY;
      const lastY = lastYRef.current;
      if (y <= 10) setHidden(false);
      else if (y > 80 && y > lastY + 8) setHidden(true);
      else if (y < lastY - 8) setHidden(false);
      lastYRef.current = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      document.documentElement.classList.remove('header-hidden');
    };
  }, []);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      setShowInstallButton(false);
      return;
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallButton(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    if (isIOS && !isStandalone) {
      setShowInstallButton(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = () => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    if (isIOS) {
      setShowInstallModal('ios');
      return;
    }
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(() => {
        setDeferredPrompt(null);
        setShowInstallButton(false);
      });
    } else {
      setShowInstallModal('other');
    }
  };

  const showTableZoom = TABLE_TABS.has(activeTab);
  const classLabel = defaultClassName(data);
  const isBoard = !isTeacherMode && (activeTab === 'board' || activeTab === 'classes');

  return (
    <header
      style={{ top: 'var(--safe-top, env(safe-area-inset-top, 0px))' }}
      className={`sticky z-30 bg-white/90 dark:bg-stone-900/90 backdrop-blur-md border-b border-stone-200 dark:border-stone-800 transition-[transform,background-color,border-color] duration-200 ${
        hiddenOnScroll ? '-translate-y-full lg:translate-y-0' : 'translate-y-0'
      }`}
    >
      <div className="flex items-center justify-between gap-2 px-3 sm:px-6 lg:px-8 h-[52px] lg:h-14 max-w-6xl mx-auto">
        {/* Left Zone: Mobile Brand + Switcher / Desktop Contextual Breadcrumb */}
        <div className="flex items-center gap-2 min-w-0">
          {/* Mobile Brand Mark (Desktop sidebar owns brand mark) */}
          <div className="lg:hidden flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-red-800 dark:bg-red-700 flex items-center justify-center text-white font-bold text-xs tracking-tight shrink-0">
              CG
            </div>
          </div>

          {/* Mobile: Quick Class Switcher (Management) or Class Name (Teacher) */}
          <div className="lg:hidden min-w-0">
            {isTeacherMode ? (
              <div className="min-w-0">
                <div className="text-sm font-bold text-stone-900 dark:text-stone-100 truncate max-w-[175px] sm:max-w-xs">
                  {data.classId ? data.className || 'My Class' : 'ClassGrid'}
                </div>
              </div>
            ) : (
              <ClassSwitcher variant="mobile" />
            )}
          </div>

          {/* Desktop: Clean Single-Line Contextual Breadcrumb */}
          <div className="hidden lg:flex items-center gap-2 text-sm min-w-0">
            {isBoard ? (
              <span className="font-semibold text-stone-900 dark:text-stone-100 truncate">
                {data.schoolName || 'School Overview'}
              </span>
            ) : (
              <>
                <span className="text-stone-500 dark:text-stone-400 truncate max-w-[200px]">
                  {isTeacherMode
                    ? data.classId
                      ? data.className || 'Class'
                      : 'Teacher Mode'
                    : classLabel}
                </span>
                <span className="text-stone-300 dark:text-stone-700 select-none" aria-hidden="true">
                  /
                </span>
                <span className="font-semibold text-stone-900 dark:text-stone-100 truncate">
                  {activeViewTitle || 'Workspace'}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Right Zone: Quiet Save Status + Primary Controls */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* Subtle Unboxed Auto-Save Confirmation (Desktop) */}
          <div
            className={`hidden sm:flex items-center gap-1 mr-1.5 text-xs transition-colors duration-200 ${
              isSavedFlashing
                ? 'text-red-800 dark:text-red-400 font-semibold'
                : 'text-stone-400 dark:text-stone-500 font-medium'
            }`}
            title="All changes are saved automatically on this device"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Saved</span>
          </div>

          {/* Undo / Redo */}
          <div className="flex items-center rounded-xl border border-stone-200/80 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-800/60 p-0.5">
            <button
              type="button"
              onClick={undo}
              disabled={!canUndo}
              className="w-9 h-9 lg:w-8 lg:h-8 flex items-center justify-center text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white disabled:opacity-30 disabled:pointer-events-none rounded-lg hover:bg-white dark:hover:bg-stone-700/70 transition-colors cursor-pointer"
              title="Undo (Ctrl+Z)"
              aria-label="Undo"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={!canRedo}
              className="w-9 h-9 lg:w-8 lg:h-8 flex items-center justify-center text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white disabled:opacity-30 disabled:pointer-events-none rounded-lg hover:bg-white dark:hover:bg-stone-700/70 transition-colors cursor-pointer"
              title="Redo (Ctrl+Y)"
              aria-label="Redo"
            >
              <Redo2 className="w-4 h-4" />
            </button>
          </div>

          {/* Contextual Table Zoom (Desktop, Table Views Only) */}
          {showTableZoom && (
            <div className="hidden md:flex items-center rounded-xl border border-stone-200/80 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-800/60 p-0.5">
              <button
                type="button"
                onClick={() => changeTableSize(-1)}
                title="Smaller table text"
                className="h-8 px-2 text-xs font-semibold text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white rounded-lg hover:bg-white dark:hover:bg-stone-700/70 transition-colors cursor-pointer"
              >
                A−
              </button>
              <button
                type="button"
                onClick={() => changeTableSize(1)}
                title="Larger table text"
                className="h-8 px-2 text-xs font-semibold text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white rounded-lg hover:bg-white dark:hover:bg-stone-700/70 transition-colors cursor-pointer"
              >
                A+
              </button>
            </div>
          )}

          {/* Install PWA Button (Web Only, When Eligible) */}
          {showInstallButton && (
            <button
              type="button"
              onClick={handleInstallClick}
              className="inline-flex items-center gap-1.5 h-9 px-3 bg-red-800 hover:bg-red-900 dark:bg-red-700 dark:hover:bg-red-600 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
              title="Install ClassGrid Studio"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Install</span>
            </button>
          )}

          {/* Theme Toggle (Mobile header — Desktop lives in sidebar footer) */}
          <button
            type="button"
            onClick={toggleDarkMode}
            className="lg:hidden w-10 h-10 flex items-center justify-center text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 active:scale-95 transition cursor-pointer"
            title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label="Toggle theme"
          >
            {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Help Shortcut (Tablet/Mobile only — Desktop lives in sidebar footer) */}
          <button
            type="button"
            onClick={openHelp}
            className="hidden sm:flex lg:hidden w-10 h-10 items-center justify-center text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 active:scale-95 transition cursor-pointer"
            title="User Guide & Help"
            aria-label="Help"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Install Helper Dialog */}
      {showInstallModal &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pt-[max(1rem,calc(var(--safe-top,env(safe-area-inset-top,0px))+0.75rem))] pb-[max(1rem,calc(var(--safe-bottom,env(safe-area-inset-bottom,0px))+0.75rem))] bg-black/55 backdrop-blur-[2px]"
            onMouseDown={() => setShowInstallModal(null)}
          >
          <div
            className="cg-sheet-up w-full max-w-sm bg-white dark:bg-stone-900 rounded-2xl p-6 shadow-2xl border border-stone-200 dark:border-stone-800"
            onMouseDown={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 bg-red-50 dark:bg-red-950/60 text-red-800 dark:text-red-300 rounded-xl flex items-center justify-center">
                  <Download className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">
                  Install ClassGrid Studio
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowInstallModal(null)}
                className="w-9 h-9 flex items-center justify-center text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 rounded-xl cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {showInstallModal === 'ios' ? (
              <>
                <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed mb-3">
                  On iPhone and iPad, install directly from Safari:
                </p>
                <ol className="text-xs text-stone-700 dark:text-stone-300 leading-relaxed space-y-2 mb-4 list-decimal pl-5">
                  <li>
                    Tap the <b>Share</b> button
                    <span className="inline-flex items-center justify-center align-middle mx-1 px-1.5 py-0.5 bg-stone-100 dark:bg-stone-800 rounded-md">
                      <Share className="w-3 h-3" />
                    </span>
                    in Safari&apos;s toolbar.
                  </li>
                  <li>Scroll down and tap <b>Add to Home Screen</b>.</li>
                  <li>Tap <b>Add</b> in the top-right corner.</li>
                </ol>
              </>
            ) : (
              <>
                <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed mb-3">
                  Install ClassGrid Studio for one-tap offline access:
                </p>
                <ul className="text-xs text-stone-700 dark:text-stone-300 leading-relaxed space-y-2 mb-4 list-disc pl-5">
                  <li><b>Chrome / Edge:</b> Click the install icon in the address bar or browser menu.</li>
                  <li><b>Android:</b> Tap the menu icon (⋮) and choose <b>Install app</b>.</li>
                </ul>
              </>
            )}

            <button
              type="button"
              onClick={() => setShowInstallModal(null)}
              className="w-full min-h-[44px] mt-2 bg-red-800 hover:bg-red-900 text-white font-semibold text-xs rounded-xl transition-colors cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>,
        document.body
      )}
    </header>
  );
};

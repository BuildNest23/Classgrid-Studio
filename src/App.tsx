import React, { useEffect, useRef } from 'react';
import { ClassroomProvider, useClassroom } from './context/ClassroomContext';
import { Header } from './components/Header';
import { Navigation } from './components/Navigation';
import { ToastContainer } from './components/ToastContainer';
import { ConfirmModal, PromptModal } from './components/ConfirmModal';
import { InfoModal, HelpModal } from './components/InfoModal';
import { WelcomeSheet } from './components/WelcomeSheet';
import { PrintPreviewModal } from './components/PrintPreviewModal';

import { DashboardView } from './components/views/DashboardView';
import { StudentsView } from './components/views/StudentsView';
import { AttendanceView } from './components/views/AttendanceView';
import { ResultsView } from './components/views/ResultsView';
import { FundsView } from './components/views/FundsView';
import { SettingsView } from './components/views/SettingsView';
import { DailyTestView } from './components/views/DailyTestView';
import { BoardView } from './components/views/BoardView';
import { ClassFilesView } from './components/views/ClassFilesView';
import { CollectView } from './components/views/CollectView';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { cleanupPrintArea } from './utils/printEngine';
import { useAppMode } from './utils/useAppMode';
import { ModeChooser } from './components/teacher/ModeChooser';
import { TeacherNavigation } from './components/teacher/TeacherNavigation';
import { TeacherHome } from './components/teacher/TeacherHome';
import { TeacherStudents } from './components/teacher/TeacherStudents';
import { TeacherClassFile } from './components/teacher/TeacherClassFile';

const TAB_TITLES: Record<string, string> = {
  dashboard: 'Class Home',
  attendance: 'Attendance',
  dailytest: 'Daily Test Register',
  results: 'Results & Examinations',
  funds: 'Funds & Fees',
  students: 'Students',
  view: 'Print Roster',
  settings: 'Settings & Backup',
  classes: 'Saved Classes',
  collect: 'Exchange',
  inbox: 'Exchange',
  board: 'School Overview',
  forms: 'Marks Forms',
};

const MainContent: React.FC = () => {
  const { activeTab, setActiveTab, data, isHydrated } = useClassroom();
  const [mode, setMode] = useAppMode();
  const hasAnyData =
    data.students.length > 0 ||
    data.assessments.length > 0 ||
    data.funds.length > 0 ||
    !!data.classId;

  // Existing users stay in management mode; fresh installs choose Teacher or Management.
  useEffect(() => {
    if (isHydrated && mode === null && hasAnyData) setMode('management');
  }, [isHydrated, mode, hasAnyData, setMode]);

  useEffect(() => {
    const handleAfterPrint = () => {
      cleanupPrintArea();
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  // Android back button: close topmost overlay first, then navigate back through visited tabs
  const tabStack = useRef<string[]>([]);
  const goingBack = useRef(false);
  const tabRef = useRef(activeTab);
  const modeRef = useRef(mode);
  tabRef.current = activeTab;
  modeRef.current = mode;

  useEffect(() => {
    if (goingBack.current) {
      goingBack.current = false;
      return;
    }
    const st = tabStack.current;
    if (st[st.length - 1] !== activeTab) st.push(activeTab);
    if (st.length > 30) st.shift();
  }, [activeTab]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let sub: { remove: () => void } | null = null;
    let gone = false;
    CapApp.addListener('backButton', () => {
      const overlays = Array.from(document.querySelectorAll<HTMLElement>('div.fixed.inset-0')).filter(
        el => el.id !== 'top-status-strip' && !el.className.includes('pointer-events-none')
      );
      const top = overlays[overlays.length - 1];
      if (top) {
        top.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        top.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return;
      }
      const home = modeRef.current === 'teacher' ? 'dashboard' : 'board';
      const st = tabStack.current;
      if (st.length > 1) {
        st.pop();
        goingBack.current = true;
        setActiveTab(st[st.length - 1] as any);
        return;
      }
      if (tabRef.current !== home) {
        setActiveTab(home as any);
        return;
      }
      CapApp.exitApp();
    })
      .then(h => {
        if (gone) h.remove();
        else sub = h;
      })
      .catch(() => {});
    return () => {
      gone = true;
      sub?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Management starts every new session on School Overview
  useEffect(() => {
    if (!isHydrated || mode !== 'management') return;
    try {
      if (sessionStorage.getItem('cgBoardShown') === '1') return;
      sessionStorage.setItem('cgBoardShown', '1');
    } catch {
      /* ignore */
    }
    setActiveTab('board');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHydrated, mode]);

  // Mobile: keep focused table cell visible above the on-screen keyboard
  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA')) return;
      if (!t.closest('.res-wrap') && !t.closest('.fund-wrap') && !t.closest('.daily-wrap')) return;
      setTimeout(() => {
        if (document.activeElement === t) {
          t.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      }, 350);
    };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, []);

  if (!isHydrated || (mode === null && hasAnyData)) {
    return <div className="min-h-screen bg-stone-100 dark:bg-stone-950" />;
  }
  if (mode === null) return <ModeChooser onPick={setMode} />;
  const teacher = mode === 'teacher';

  return (
    <div className="app-root min-h-screen flex flex-col bg-stone-100 dark:bg-stone-950 text-stone-900 dark:text-stone-100 transition-colors duration-200">
      {/* Solid Crimson Status Bar Strip across Camera Notch & Status Bar */}
      <div
        id="top-status-strip"
        className="sticky top-0 left-0 right-0 z-50 w-full bg-[#991B1B] shrink-0 select-none pointer-events-none transition-colors duration-200"
        style={{ height: 'var(--safe-top, env(safe-area-inset-top, 0px))' }}
        aria-hidden="true"
      />
      <div
        className="fixed top-0 left-0 right-0 z-40 bg-[#991B1B] pointer-events-none"
        style={{ height: 'var(--safe-top, env(safe-area-inset-top, 0px))' }}
        aria-hidden="true"
      />

      {/* Adaptive Sidebar (Desktop) & Bottom Bar (Mobile) */}
      {teacher ? <TeacherNavigation /> : <Navigation />}

      {/* Main Content Shell Offset for Desktop Left Sidebar */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-[248px]">
        <Header activeViewTitle={TAB_TITLES[activeTab]} isTeacherMode={teacher} />

        <main className="flex-1 max-w-6xl w-full mx-auto px-3.5 sm:px-6 lg:px-8 py-4 sm:py-6 pb-24 lg:pb-12">
          {teacher ? (
            <div key={`t-${activeTab}`} className="view-container cg-view-enter">
              {!data.classId && activeTab !== 'collect' && <TeacherHome />}
              {!!data.classId &&
                (activeTab === 'dashboard' ||
                  !['attendance', 'results', 'funds', 'students', 'collect', 'forms'].includes(
                    activeTab
                  )) && <TeacherHome />}
              {!!data.classId && activeTab === 'attendance' && <AttendanceView />}
              {!!data.classId && activeTab === 'results' && <ResultsView />}
              {!!data.classId && activeTab === 'funds' && <FundsView />}
              {!!data.classId && activeTab === 'students' && <TeacherStudents />}
              {activeTab === 'collect' && <TeacherClassFile />}
              {!!data.classId && activeTab === 'forms' && <CollectView limit="marks" />}
            </div>
          ) : (
            <div key={`m-${activeTab}`} className="view-container cg-view-enter">
              {(activeTab === 'board' || activeTab === 'classes') && (
                <BoardView initialSection={activeTab === 'classes' ? 'manage' : 'overview'} />
              )}
              {activeTab === 'dashboard' && <DashboardView />}
              {(activeTab === 'students' || activeTab === 'view') && (
                <StudentsView initialMode={activeTab === 'view' ? 'sheet' : 'roster'} />
              )}
              {activeTab === 'attendance' && <AttendanceView />}
              {activeTab === 'dailytest' && <DailyTestView />}
              {activeTab === 'results' && <ResultsView />}
              {activeTab === 'funds' && <FundsView />}
              {activeTab === 'settings' && <SettingsView />}
              {(activeTab === 'inbox' || activeTab === 'collect') && (
                <ClassFilesView initialSection={activeTab === 'collect' ? 'forms' : 'files'} />
              )}
            </div>
          )}
        </main>
      </div>

      {/* Hidden print area container */}
      <div id="printArea" style={{ display: 'none' }} />

      {/* Modals & Dialogs */}
      <ToastContainer />
      <ConfirmModal />
      <PromptModal />
      <InfoModal />
      <HelpModal />
      {!teacher && <WelcomeSheet />}
      <PrintPreviewModal />
    </div>
  );
};

export default function App() {
  return (
    <ClassroomProvider>
      <MainContent />
    </ClassroomProvider>
  );
}

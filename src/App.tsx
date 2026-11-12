import React, { useEffect } from 'react';
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
import { StudentDirectoryView } from './components/views/StudentDirectoryView';
import { SettingsView } from './components/views/SettingsView';
import { DailyTestView } from './components/views/DailyTestView';
import { ClassesView } from './components/views/ClassesView';
import { CollectView } from './components/views/CollectView';
import { cleanupPrintArea } from './utils/printEngine';

const TAB_TITLES: Record<string, string> = {
  dashboard: 'Dashboard',
  attendance: 'Attendance',
  dailytest: 'Daily Test Register',
  results: 'Results & Examinations',
  funds: 'Funds & Fees',
  students: 'Students',
  view: 'Student list (Print)',
  settings: 'Class details & backup',
  classes: 'Classes',
  collect: 'Send & Receive'
};

const MainContent: React.FC = () => {
  const { activeTab } = useClassroom();

  useEffect(() => {
    const handleAfterPrint = () => {
      cleanupPrintArea();
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  // Mobile: keep the focused cell visible above the on-screen keyboard (Results, Funds & Daily Test tables)
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

  return (
    <div className="app-root min-h-screen flex flex-col bg-stone-100 dark:bg-stone-950 text-stone-900 dark:text-stone-100 transition-colors duration-200">
      {/* Solid Crimson Red Status Bar Strip across Camera Notch & Status Bar */}
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
      <Header activeViewTitle={TAB_TITLES[activeTab]} />
      <Navigation />

      <main className="flex-1 max-w-7xl w-full mx-auto p-3.5 sm:p-6 pb-24 lg:pb-12">
        <div className="view-container">
          {activeTab === 'dashboard' && <DashboardView />}
          {activeTab === 'students' && <StudentsView />}
          {activeTab === 'attendance' && <AttendanceView />}
          {activeTab === 'dailytest' && <DailyTestView />}
          {activeTab === 'results' && <ResultsView />}
          {activeTab === 'funds' && <FundsView />}
          {activeTab === 'view' && <StudentDirectoryView />}
          {activeTab === 'settings' && <SettingsView />}
          {activeTab === 'classes' && <ClassesView />}
          {activeTab === 'collect' && <CollectView />}
        </div>
      </main>

      {/* Hidden print area container */}
      <div id="printArea" style={{ display: 'none' }} />

      {/* Modals & Dialogs */}
      <ToastContainer />
      <ConfirmModal />
      <PromptModal />
      <InfoModal />
      <HelpModal />
      <WelcomeSheet />
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

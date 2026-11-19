import React from 'react';
import { useClassroom } from '../context/ClassroomContext';
import {
  X,
  BookOpen,
  CheckCircle2,
  Calendar,
  BarChart3,
  Wallet,
  ShieldCheck,
  Printer,
  Sparkles
} from 'lucide-react';

export const InfoModal: React.FC = () => {
  const { infoModal, closeInfoModal } = useClassroom();

  if (!infoModal.isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 pt-[max(1rem,calc(var(--safe-top,env(safe-area-inset-top,0px))+0.75rem))] pb-[max(1rem,calc(var(--safe-bottom,env(safe-area-inset-bottom,0px))+0.75rem))] bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={closeInfoModal}
    >
      <div
        className="w-full max-w-2xl max-h-[calc(100dvh-var(--safe-top,env(safe-area-inset-top,0px))-var(--safe-bottom,env(safe-area-inset-bottom,0px))-2.5rem)] flex flex-col bg-white dark:bg-stone-900 rounded-3xl shadow-2xl border border-stone-200 dark:border-stone-800 overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-900/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300 rounded-xl">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">
                {infoModal.title}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={closeInfoModal}
            className="p-2 -mr-2 text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 rounded-full active:bg-stone-200 dark:active:bg-stone-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 text-sm text-stone-700 dark:text-stone-300 leading-relaxed">
          {infoModal.content}
        </div>
        <div className="px-6 py-3.5 bg-stone-50 dark:bg-stone-900 border-t border-stone-200 dark:border-stone-800 flex justify-end">
          <button
            type="button"
            onClick={closeInfoModal}
            className="px-5 py-2 bg-red-800 hover:bg-red-900 dark:bg-red-700 dark:hover:bg-red-600 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export const HelpModal: React.FC = () => {
  const { helpModalOpen, closeHelp } = useClassroom();

  if (!helpModalOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 pt-[max(1rem,calc(var(--safe-top,env(safe-area-inset-top,0px))+0.75rem))] pb-[max(1rem,calc(var(--safe-bottom,env(safe-area-inset-bottom,0px))+0.75rem))] bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={closeHelp}
    >
      <div
        className="w-full max-w-2xl max-h-[calc(100dvh-var(--safe-top,env(safe-area-inset-top,0px))-var(--safe-bottom,env(safe-area-inset-bottom,0px))-2.5rem)] flex flex-col bg-white dark:bg-stone-900 rounded-3xl shadow-2xl border border-stone-200 dark:border-stone-800 overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-900/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300 rounded-xl">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">
                ClassGrid User Guide
              </h2>
              <p className="text-xs text-stone-500">Universal Classroom Administration Manual</p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeHelp}
            className="p-2 -mr-2 text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 rounded-full active:bg-stone-200 dark:active:bg-stone-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-sm text-stone-700 dark:text-stone-300 leading-relaxed">
          {/* Quick Start Workflow */}
          <section>
            <h3 className="text-xs font-bold text-red-800 dark:text-red-400 uppercase tracking-wider mb-2 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> 1. Quick Start Workflow
            </h3>
            <ol className="list-decimal pl-5 space-y-1.5 font-medium text-xs sm:text-sm">
              <li><b>Class & School Setup:</b> Open <b>Settings</b> or <b>More Menu</b> to set Class Name, Teacher Incharge, School Name, and session.</li>
              <li><b>Enroll Students:</b> Open <b>Students</b> to add students with auto-incrementing roll numbers.</li>
              <li><b>Record Attendance:</b> Open <b>Attendance</b> to record Present, Absent, or Leave. Print or save absentee slips.</li>
              <li><b>Examinations:</b> Create Assessments (Term 1, Midterm, Finals), set subjects and enter marks with vertical Enter navigation.</li>
              <li><b>Funds & Fees:</b> Set fee amounts and track real-time payments and dues.</li>
              <li><b>Offline Backups:</b> Export a JSON snapshot from Settings regularly.</li>
            </ol>
          </section>

          {/* Attendance Rules */}
          <section className="p-4 bg-stone-100 dark:bg-stone-800/60 rounded-2xl border border-stone-200 dark:border-stone-700/60">
            <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100 mb-2 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-red-700 dark:text-red-400" /> 2. Attendance Codes & Slips
            </h3>
            <ul className="list-disc pl-5 space-y-1.5 text-xs text-stone-600 dark:text-stone-300">
              <li><b>P (Present):</b> Marked in emerald; counted towards attendance percentage.</li>
              <li><b>A (Absent):</b> Marked in ruby red; triggers inclusion in absentee slips.</li>
              <li><b>L (Leave):</b> Excused absence; excluded from denominator in % calculations.</li>
              <li><b>Class Holiday:</b> Whole class day off; does not penalize student percentages.</li>
              <li><b>Absentee Slip:</b> Share a crystal-clear 2x HD PNG image (for example on WhatsApp) or print directly for administrative records.</li>
            </ul>
          </section>

          {/* Results & Exams */}
          <section>
            <h3 className="text-xs font-bold text-red-800 dark:text-red-400 uppercase tracking-wider mb-2 flex items-center gap-2">
              <BarChart3 className="w-4 h-4" /> 3. Examination Scoring & Reports
            </h3>
            <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed mb-2">
              The matrix mark sheet allows rapid keyboard entry. Simply type a student&apos;s score and press <b>Enter</b> to automatically advance down to the next student. Automated ranking computes 1st, 2nd, and 3rd positions, and individual A4 Report Cards are available for single-click printing.
            </p>
          </section>

          {/* Funds & Fee Tracking */}
          <section className="p-4 bg-stone-100 dark:bg-stone-800/60 rounded-2xl border border-stone-200 dark:border-stone-700/60">
            <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100 mb-2 flex items-center gap-2">
              <Wallet className="w-4 h-4 text-red-700 dark:text-red-400" /> 4. Funds & Collections
            </h3>
            <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed">
              Track school fees, event contributions, and book charges. Visual indicators show green for completed payments, red for pending balances, and neutral for exempt students.
            </p>
          </section>

          {/* Offline Security & Shortcuts */}
          <section className="grid sm:grid-cols-2 gap-3">
            <div className="p-3.5 bg-stone-50 dark:bg-stone-800/40 rounded-xl border border-stone-200 dark:border-stone-800">
              <div className="flex items-center gap-2 font-bold text-xs text-stone-900 dark:text-stone-100 mb-1">
                <ShieldCheck className="w-4 h-4 text-red-700 dark:text-red-400" /> Undo & Redo Shortcuts
              </div>
              <p className="text-xs text-stone-500">
                Press <b>Ctrl+Z</b> to undo any action, and <b>Ctrl+Y</b> to redo. Up to 30 steps of change history are preserved.
              </p>
            </div>
            <div className="p-3.5 bg-stone-50 dark:bg-stone-800/40 rounded-xl border border-stone-200 dark:border-stone-800">
              <div className="flex items-center gap-2 font-bold text-xs text-stone-900 dark:text-stone-100 mb-1">
                <Printer className="w-4 h-4 text-red-700 dark:text-red-400" /> Multi-Scale Printing
              </div>
              <p className="text-xs text-stone-500">
                Print registers, marksheets, and student lists with dedicated CSS A4 formatting and 5 font zoom levels.
              </p>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-stone-50 dark:bg-stone-900 border-t border-stone-200 dark:border-stone-800 flex justify-end">
          <button
            type="button"
            onClick={closeHelp}
            className="px-5 py-2 bg-red-800 hover:bg-red-900 dark:bg-red-700 dark:hover:bg-red-600 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};

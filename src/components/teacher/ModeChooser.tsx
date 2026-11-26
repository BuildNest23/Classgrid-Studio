import React from 'react';
import { GraduationCap, Building2, ArrowRight } from 'lucide-react';
import { AppMode } from '../../utils/appMode';

export const ModeChooser: React.FC<{ onPick: (m: AppMode) => void }> = ({ onPick }) => (
  <div
    className="min-h-screen bg-stone-100 dark:bg-stone-950 flex items-center justify-center p-5"
    style={{ paddingTop: 'calc(var(--safe-top, 0px) + 24px)' }}
  >
    <div className="w-full max-w-md cg-view-enter">
      <div className="text-center mb-7">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-red-800 dark:bg-red-700 text-white flex items-center justify-center text-base font-bold tracking-tight">
          CG
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
          Welcome to ClassGrid Studio
        </h1>
        <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
          Choose how you will use this device.
        </p>
      </div>

      <div className="space-y-3">
        <button
          type="button"
          onClick={() => onPick('teacher')}
          className="w-full text-left p-4 sm:p-5 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 hover:border-red-700/60 dark:hover:border-red-500/60 active:scale-[0.99] transition-colors cursor-pointer flex items-start gap-3.5 group"
        >
          <div className="w-11 h-11 rounded-xl bg-red-800 dark:bg-red-700 text-white flex items-center justify-center shrink-0">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-stone-900 dark:text-stone-100">
                Class Teacher
              </span>
              <ArrowRight className="w-4 h-4 text-stone-400 group-hover:text-red-800 dark:group-hover:text-red-400 shrink-0 transition-colors" />
            </div>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-1 leading-relaxed">
              Take daily attendance, enter exam marks, track funds, and send updates to management.
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onPick('management')}
          className="w-full text-left p-4 sm:p-5 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 hover:border-stone-400 dark:hover:border-stone-600 active:scale-[0.99] transition-colors cursor-pointer flex items-start gap-3.5 group"
        >
          <div className="w-11 h-11 rounded-xl bg-stone-800 dark:bg-stone-700 text-white flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-stone-900 dark:text-stone-100">
                School Management
              </span>
              <ArrowRight className="w-4 h-4 text-stone-400 group-hover:text-stone-900 dark:group-hover:text-stone-100 shrink-0 transition-colors" />
            </div>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-1 leading-relaxed">
              Oversee all classes, send class files to teachers, receive updates, and manage reports.
            </p>
          </div>
        </button>
      </div>

      <p className="text-xs text-stone-400 dark:text-stone-500 text-center mt-5">
        You can switch modes anytime from Settings or the menu.
      </p>
    </div>
  </div>
);

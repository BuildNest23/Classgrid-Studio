import React from 'react';
import { GraduationCap, Building2 } from 'lucide-react';
import { AppMode } from '../../utils/appMode';

export const ModeChooser: React.FC<{ onPick: (m: AppMode) => void }> = ({ onPick }) => (
  <div className="min-h-screen bg-stone-100 dark:bg-stone-950 flex items-center justify-center p-5"
       style={{ paddingTop: 'calc(var(--safe-top, 0px) + 20px)' }}>
    <div className="w-full max-w-md">
      <div className="text-center mb-6">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-red-800 text-white flex items-center justify-center text-lg font-black">CG</div>
        <h1 className="mt-3 text-xl font-black text-stone-900 dark:text-stone-100">Welcome to Classgrid</h1>
        <p className="text-sm text-stone-500 mt-1">How will you use this phone?</p>
      </div>
      <button type="button" onClick={() => onPick('teacher')}
        className="w-full text-left p-4 mb-3 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 active:scale-[0.99] cursor-pointer flex gap-3.5">
        <div className="p-3 rounded-xl bg-red-800 text-white h-fit"><GraduationCap className="w-6 h-6" /></div>
        <div>
          <div className="font-black text-stone-900 dark:text-stone-100">I am a class teacher</div>
          <div className="text-xs text-stone-500 mt-1">Take attendance, enter marks and share absentee slips. You will get your class file from management.</div>
        </div>
      </button>
      <button type="button" onClick={() => onPick('management')}
        className="w-full text-left p-4 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 active:scale-[0.99] cursor-pointer flex gap-3.5">
        <div className="p-3 rounded-xl bg-stone-800 text-white h-fit"><Building2 className="w-6 h-6" /></div>
        <div>
          <div className="font-black text-stone-900 dark:text-stone-100">I am management</div>
          <div className="text-xs text-stone-500 mt-1">Manage all classes, send class files to teachers and receive their updates.</div>
        </div>
      </button>
      <p className="text-[11px] text-stone-400 text-center mt-4">You can change this later from the menu.</p>
    </div>
  </div>
);

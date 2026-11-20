import React from 'react';
import { useClassroom } from '../context/ClassroomContext';
import { defaultClassName } from '../utils/classShelf';
import { LayoutGrid } from 'lucide-react';

/** Slim bar (management): shows which class is open and a way back to the board. */
export const OpenClassBar: React.FC = () => {
  const { data, setActiveTab } = useClassroom();
  return (
    <div className="no-print max-w-7xl w-full mx-auto px-3.5 sm:px-6 pt-2.5">
      <button type="button" onClick={() => setActiveTab('board')}
        className="w-full flex items-center justify-between gap-2 px-3.5 py-2 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/50 text-xs cursor-pointer">
        <span className="truncate"><span className="text-stone-500">Open class: </span><b className="text-red-900 dark:text-red-200">{defaultClassName(data)}</b></span>
        <span className="flex items-center gap-1 font-bold text-red-800 dark:text-red-300 shrink-0"><LayoutGrid className="w-3.5 h-3.5" />All classes</span>
      </button>
    </div>
  );
};

import React, { useEffect } from 'react';
import { RollMode } from '../utils/rollNumbers';

interface Props {
  roll: string;
  ownerName: string;
  studentName: string;
  /** This student's current roll number (for "swap"); empty for a student being added. */
  oldRoll: string;
  canSwap: boolean;
  onChoose: (mode: RollMode) => void;
  onCancel: () => void;
}

/** Asked when the roll number someone wants already belongs to another student. */
export const RollConflictModal: React.FC<Props> = ({
  roll,
  ownerName,
  studentName,
  oldRoll,
  canSwap,
  onChoose,
  onCancel,
}) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const btn =
    'w-full text-left p-3.5 rounded-xl border border-stone-200 dark:border-stone-800 hover:border-red-700 dark:hover:border-red-500 hover:bg-red-50/70 dark:hover:bg-red-950/30 cursor-pointer transition-colors';

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/55 backdrop-blur-[2px]"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="cg-sheet-up w-full sm:max-w-sm bg-white dark:bg-stone-900 rounded-t-3xl sm:rounded-2xl border-t sm:border border-stone-200 dark:border-stone-800 shadow-2xl p-5 pb-safe sm:pb-5 space-y-3">
        <div>
          <div className="text-base font-bold text-stone-900 dark:text-stone-100">
            Roll {roll} is already used
          </div>
          <div className="text-xs text-stone-500 dark:text-stone-400 mt-1 leading-relaxed">
            It belongs to <span className="font-semibold text-stone-800 dark:text-stone-200">{ownerName || 'another student'}</span>. What should happen for{' '}
            <span className="font-semibold text-stone-800 dark:text-stone-200">{studentName || 'this student'}</span>?
          </div>
        </div>

        <div className="space-y-2">
          {canSwap && (
            <button type="button" className={btn} onClick={() => onChoose('swap')}>
              <div className="text-xs font-bold text-stone-900 dark:text-stone-100">Swap</div>
              <div className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                {ownerName || 'They'} get{ownerName ? 's' : ''}{' '}
                {oldRoll ? `roll ${oldRoll}` : 'no roll number (blank)'}
              </div>
            </button>
          )}
          <button type="button" className={btn} onClick={() => onChoose('blank')}>
            <div className="text-xs font-bold text-stone-900 dark:text-stone-100">
              Make {ownerName || 'their'} roll number blank
            </div>
            <div className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              You can assign a new number later. Blank numbers show in red and sort last.
            </div>
          </button>
          <button type="button" className={btn} onClick={() => onChoose('insert')}>
            <div className="text-xs font-bold text-stone-900 dark:text-stone-100">Insert here</div>
            <div className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              Students from {roll} onward shift down by one until the first gap.
            </div>
          </button>
        </div>

        <button
          type="button"
          onClick={onCancel}
          className="w-full min-h-[44px] py-2.5 text-xs font-semibold rounded-xl bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-200 hover:bg-stone-200 dark:hover:bg-stone-700 cursor-pointer transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

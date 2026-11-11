import React from 'react';
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
export const RollConflictModal: React.FC<Props> = ({ roll, ownerName, studentName, oldRoll, canSwap, onChoose, onCancel }) => {
  const btn =
    'w-full text-left p-3 rounded-xl border border-[#E7E5E4] dark:border-[#44403C] hover:border-[#B91C1C] hover:bg-[#FEF2F2] dark:hover:bg-[#2A1514] cursor-pointer transition-colors';
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60"
      onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="w-full max-w-sm bg-white dark:bg-[#1C1917] rounded-2xl border border-[#E7E5E4] dark:border-[#44403C] shadow-2xl p-4 space-y-2.5">
        <div>
          <div className="text-sm font-bold text-[#1C1917] dark:text-[#F5F5F4]">Roll {roll} is already used</div>
          <div className="text-xs text-[#78716C] dark:text-[#A8A29E]">
            It belongs to <b>{ownerName || 'another student'}</b>. What should happen for <b>{studentName || 'this student'}</b>?
          </div>
        </div>

        {canSwap && (
          <button type="button" className={btn} onClick={() => onChoose('swap')}>
            <div className="text-xs font-bold text-[#1C1917] dark:text-[#F5F5F4]">Swap</div>
            <div className="text-[11px] text-[#78716C] dark:text-[#A8A29E]">
              {ownerName || 'They'} get{ownerName ? '' : 's'} {oldRoll ? `roll ${oldRoll}` : 'no roll number (blank)'}
            </div>
          </button>
        )}
        <button type="button" className={btn} onClick={() => onChoose('blank')}>
          <div className="text-xs font-bold text-[#1C1917] dark:text-[#F5F5F4]">Make {ownerName || 'their'} roll number blank</div>
          <div className="text-[11px] text-[#78716C] dark:text-[#A8A29E]">You can give it a new number later. Blank numbers show in red and go last.</div>
        </button>
        <button type="button" className={btn} onClick={() => onChoose('insert')}>
          <div className="text-xs font-bold text-[#1C1917] dark:text-[#F5F5F4]">Insert here</div>
          <div className="text-[11px] text-[#78716C] dark:text-[#A8A29E]">Students from {roll} onward move down by one, only until the first gap.</div>
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="w-full py-2.5 text-xs font-bold rounded-xl bg-[#F5F5F4] dark:bg-[#292524] text-[#1C1917] dark:text-[#F5F5F4] hover:bg-[#E7E5E4] cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

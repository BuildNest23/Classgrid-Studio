import React, { useEffect, useState } from 'react';
import { verifyPin } from '../../utils/appMode';
import { Lock } from 'lucide-react';

export const PinPad: React.FC<{ onOk: () => void; onCancel: () => void }> = ({ onOk, onCancel }) => {
  const [v, setV] = useState('');
  const [bad, setBad] = useState(false);

  const submit = () => {
    if (verifyPin(v)) onOk();
    else {
      setBad(true);
      setV('');
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-[2px] p-0 sm:p-5"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="cg-sheet-up w-full sm:max-w-xs bg-white dark:bg-stone-900 rounded-t-3xl sm:rounded-2xl border-t sm:border border-stone-200 dark:border-stone-800 p-5 pb-[max(1.25rem,var(--safe-bottom,env(safe-area-inset-bottom,0px)))] shadow-2xl"
        role="dialog"
        aria-label="Management PIN"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-stone-100 dark:bg-stone-800 text-red-800 dark:text-red-400 flex items-center justify-center shrink-0">
            <Lock className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">Management PIN</h3>
            <p className="text-xs text-stone-500 dark:text-stone-400">Enter your 4–8 digit PIN</p>
          </div>
        </div>

        <input
          autoFocus
          type="password"
          inputMode="numeric"
          maxLength={8}
          value={v}
          onChange={e => {
            setV(e.target.value.replace(/\D/g, ''));
            setBad(false);
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') submit();
          }}
          className={`mt-4 w-full min-h-[48px] text-center text-2xl font-mono-num tracking-[0.4em] rounded-xl border bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100 py-2 focus:outline-none ${
            bad
              ? 'border-red-600 dark:border-red-500 ring-2 ring-red-500/20'
              : 'border-stone-200 dark:border-stone-700 focus:border-red-700 dark:focus:border-red-500'
          }`}
        />

        {bad && (
          <div className="text-xs text-red-700 dark:text-red-400 font-semibold mt-2 text-center">
            Incorrect PIN. Try again.
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[44px] rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700 text-sm font-semibold cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            className="min-h-[44px] rounded-xl bg-red-800 hover:bg-red-900 dark:bg-red-700 dark:hover:bg-red-600 text-white text-sm font-semibold cursor-pointer transition-colors"
          >
            Unlock
          </button>
        </div>
      </div>
    </div>
  );
};

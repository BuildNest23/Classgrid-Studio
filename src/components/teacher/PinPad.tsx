import React, { useEffect, useState } from 'react';
import { verifyPin } from '../../utils/appMode';

export const PinPad: React.FC<{ onOk: () => void; onCancel: () => void }> = ({ onOk, onCancel }) => {
  const [v, setV] = useState('');
  const [bad, setBad] = useState(false);
  const submit = () => { if (verifyPin(v)) onOk(); else { setBad(true); setV(''); } };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-5" onClick={onCancel}>
      <div className="w-full max-w-xs bg-white dark:bg-stone-900 rounded-3xl p-5" onClick={e => e.stopPropagation()}>
        <div className="font-black">Management PIN</div>
        <input autoFocus type="password" inputMode="numeric" maxLength={8} value={v}
          onChange={e => { setV(e.target.value.replace(/\D/g, '')); setBad(false); }}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
          className="mt-3 w-full text-center text-2xl tracking-[0.4em] rounded-xl border border-stone-300 dark:border-stone-700 bg-transparent py-2" />
        {bad && <div className="text-xs text-red-600 font-bold mt-2">Wrong PIN.</div>}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={onCancel} className="min-h-[44px] rounded-xl bg-stone-100 dark:bg-stone-800 font-bold cursor-pointer">Cancel</button>
          <button type="button" onClick={submit} className="min-h-[44px] rounded-xl bg-red-800 text-white font-bold cursor-pointer">Open</button>
        </div>
      </div>
    </div>
  );
};

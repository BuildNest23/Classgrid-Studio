import React, { useState } from 'react';
import { useClassroom } from '../../context/ClassroomContext';
import { useAppMode } from '../../utils/useAppMode';
import { hasPin, setPin, clearPin, isValidPin, REMINDERS_AVAILABLE } from '../../utils/appMode';
import { Building2, Lock, Bell } from 'lucide-react';

/** Management Settings: mode switch, PIN, and the (switched-off) reminders tile. */
export const ModeCard: React.FC = () => {
  const { uiConfirm, uiPrompt, toast } = useClassroom();
  const [, setMode] = useAppMode();
  const [pinOn, setPinOn] = useState(hasPin());

  const changePin = async () => {
    const p = await uiPrompt('Choose a PIN (4 to 8 digits). It will be asked when switching to Management mode.', '', { title: 'Management PIN' });
    if (p === null) return;
    if (!isValidPin(p.trim())) { toast('PIN must be 4 to 8 digits.', 'error'); return; }
    setPin(p.trim()); setPinOn(true); toast('PIN saved.', 'success');
  };
  const removePin = async () => {
    if (!(await uiConfirm('Remove the management PIN?', { yesText: 'Remove', danger: true }))) return;
    clearPin(); setPinOn(false); toast('PIN removed.', 'info');
  };

  return (
    <div className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-4 mb-4">
      <div className="flex items-center gap-2 font-black text-sm"><Building2 className="w-4 h-4" /> Mode: Management</div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={async () => { if (await uiConfirm('Switch this phone to Teacher mode? Management tools will be hidden until you switch back with your PIN.', { yesText: 'Switch', icon: 'info' })) setMode('teacher'); }}
          className="min-h-[44px] px-3.5 py-2 rounded-xl bg-stone-100 dark:bg-stone-800 text-xs font-bold cursor-pointer">Switch to Teacher mode</button>
        <button type="button" onClick={changePin} className="min-h-[44px] px-3.5 py-2 rounded-xl bg-stone-100 dark:bg-stone-800 text-xs font-bold cursor-pointer flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" />{pinOn ? 'Change PIN' : 'Set PIN'}</button>
        {pinOn && <button type="button" onClick={removePin} className="min-h-[44px] px-3.5 py-2 rounded-xl bg-stone-100 dark:bg-stone-800 text-xs font-bold text-red-700 cursor-pointer">Remove PIN</button>}
      </div>
      <div className={`mt-3 p-3 rounded-xl border border-dashed border-stone-300 dark:border-stone-700 flex items-center gap-3 ${REMINDERS_AVAILABLE ? '' : 'opacity-50'}`} aria-disabled={!REMINDERS_AVAILABLE}>
        <Bell className="w-5 h-5 text-stone-500" />
        <div>
          <div className="text-sm font-bold">Reminders</div>
          <div className="text-xs text-stone-500">{REMINDERS_AVAILABLE ? 'Remind teachers to take attendance.' : 'Not active yet. Ask to enable it when you are ready.'}</div>
        </div>
      </div>
    </div>
  );
};

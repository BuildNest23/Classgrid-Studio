import React, { useState } from 'react';
import { useClassroom } from '../../context/ClassroomContext';
import { useAppMode } from '../../utils/useAppMode';
import { hasPin, setPin, clearPin, isValidPin, REMINDERS_AVAILABLE } from '../../utils/appMode';
import { Building2, Lock, Bell, ArrowRightLeft, Trash2 } from 'lucide-react';

/** Management Settings: mode switch and management PIN controls. */
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

  const switchToTeacher = async () => {
    if (
      await uiConfirm(
        'Switch this device to Teacher mode? Management tools will be hidden until you switch back' +
          (pinOn ? ' with your PIN.' : '.'),
        { title: 'Switch to Teacher mode', yesText: 'Switch', icon: 'info' }
      )
    ) {
      setMode('teacher');
    }
  };

  return (
    <section className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-stone-100 dark:bg-stone-800 text-red-800 dark:text-red-400 flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100">Access &amp; mode</h2>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              Management mode · {pinOn ? 'PIN protection enabled' : 'No management PIN set'}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={switchToTeacher}
          className="min-h-[42px] px-3.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-700 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <ArrowRightLeft className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400" />
          <span>Switch to Teacher mode</span>
        </button>

        <button
          type="button"
          onClick={changePin}
          className="min-h-[42px] px-3.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-700 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <Lock className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400" />
          <span>{pinOn ? 'Change PIN' : 'Set management PIN'}</span>
        </button>

        {pinOn && (
          <button
            type="button"
            onClick={removePin}
            className="min-h-[42px] px-3.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50/60 dark:bg-red-950/30 text-red-700 dark:text-red-400 hover:bg-red-100/70 dark:hover:bg-red-950/50 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Remove PIN</span>
          </button>
        )}
      </div>

      {REMINDERS_AVAILABLE && (
        <div className="pt-3 border-t border-stone-100 dark:border-stone-800 flex items-center gap-3">
          <Bell className="w-4 h-4 text-stone-500 dark:text-stone-400 shrink-0" />
          <div>
            <div className="text-xs font-semibold text-stone-900 dark:text-stone-100">Reminders</div>
            <div className="text-xs text-stone-500 dark:text-stone-400">Remind teachers to take attendance.</div>
          </div>
        </div>
      )}
    </section>
  );
};

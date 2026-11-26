import React, { useState } from 'react';
import { useClassroom } from '../../context/ClassroomContext';
import { useAppMode } from '../../utils/useAppMode';
import { ActiveTab } from '../../types';
import { LayoutDashboard, ClipboardCheck, BarChart3, Menu, X, Wallet, Users, FileDown, Send, HelpCircle, Building2 } from 'lucide-react';
import { PinPad } from './PinPad';
import { hasPin } from '../../utils/appMode';

export const TeacherNavigation: React.FC = () => {
  const { activeTab, setActiveTab, openHelp, isTodayAttendanceTaken, data } = useClassroom();
  const [, setMode] = useAppMode();
  const [more, setMore] = useState(false);
  const [pin, setPinAsk] = useState(false);
  const hasClass = !!data.classId;
  const badge = hasClass && !isTodayAttendanceTaken();

  const main: { id: ActiveTab; label: string; icon: any; badge?: boolean; needsClass?: boolean }[] = [
    { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
    { id: 'attendance', label: 'Attendance', icon: ClipboardCheck, badge, needsClass: true },
    { id: 'results', label: 'Marks', icon: BarChart3, needsClass: true },
  ];
  const menu: { id: string; label: string; desc: string; icon: any; needsClass?: boolean }[] = [
    { id: 'funds', label: 'Funds', desc: 'Fees & collections', icon: Wallet, needsClass: true },
    { id: 'students', label: 'Students', desc: 'Class list (view only)', icon: Users, needsClass: true },
    { id: 'forms', label: 'Marks forms', desc: 'Send a marks form to subject teachers', icon: Send, needsClass: true },
    { id: 'collect', label: 'Class file', desc: 'Open or update your class file', icon: FileDown },
    { id: 'help', label: 'Help', desc: 'How to use', icon: HelpCircle },
    { id: 'mgmt', label: 'Switch to Management', desc: hasPin() ? 'PIN required' : 'For school management', icon: Building2 },
  ];
  const inMenu = !main.some(m => m.id === activeTab);

  const go = (id: string, disabled?: boolean) => {
    if (disabled) return;
    setMore(false);
    if (id === 'help') openHelp();
    else if (id === 'mgmt') { if (hasPin()) setPinAsk(true); else setMode('management'); }
    else setActiveTab(id as ActiveTab);
  };

  const Btn = ({ active, onClick, icon: I, label, dot, disabled }: any) => (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`relative flex flex-col items-center justify-center h-full py-1 rounded-2xl ${disabled ? 'opacity-40 cursor-not-allowed text-stone-400 dark:text-stone-500 font-semibold' : `active:scale-95 cursor-pointer ${active ? 'text-red-800 dark:text-red-400 font-black' : 'text-stone-500 dark:text-stone-400 font-semibold'}`}`}>
      <div className={`p-1 rounded-full ${active && !disabled ? 'bg-red-100 dark:bg-red-950/80' : ''}`}><I className="w-5 h-5" /></div>
      <span className="text-[10px] mt-0.5">{label}</span>
      {dot && <span className="absolute top-1.5 right-[calc(50%-16px)] w-2 h-2 rounded-full bg-red-600 ring-2 ring-white dark:ring-stone-900" />}
    </button>
  );

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-stone-900/95 backdrop-blur-md border-t border-stone-200 dark:border-stone-800 pb-safe">
        <div className="grid h-16 items-center px-1 max-w-lg mx-auto" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
          {main.map(t => {
            const disabled = !!t.needsClass && !hasClass;
            return <Btn key={t.id} active={activeTab === t.id} disabled={disabled} onClick={() => !disabled && setActiveTab(t.id)} icon={t.icon} label={t.label} dot={t.badge} />;
          })}
          <Btn active={inMenu} onClick={() => setMore(true)} icon={Menu} label="Menu" />
        </div>
      </nav>
      {more && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={() => setMore(false)}>
          <div className="w-full max-w-lg mx-auto bg-white dark:bg-stone-900 rounded-t-3xl pb-safe overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-3 border-b border-stone-200 dark:border-stone-800">
              <h3 className="text-base font-bold">Menu</h3>
              <button type="button" onClick={() => setMore(false)} className="p-1.5 rounded-full cursor-pointer" aria-label="Close"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-3 divide-y divide-stone-100 dark:divide-stone-800/60 max-h-[65vh] overflow-y-auto">
              {menu.map(m => {
                const I = m.icon;
                const disabled = !!m.needsClass && !hasClass;
                return (
                <button key={m.id} type="button" disabled={disabled} onClick={() => go(m.id, disabled)} className={`w-full min-h-[56px] px-4 py-3 flex items-center gap-3.5 text-left rounded-2xl ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer active:bg-stone-200 dark:active:bg-stone-800'}`}>
                  <div className="p-2.5 rounded-xl bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300"><I className="w-5 h-5" /></div>
                  <div className="min-w-0"><div className="text-sm font-bold">{m.label}</div><div className="text-xs text-stone-500">{disabled ? 'Open a class file first' : m.desc}</div></div>
                </button>);
              })}
            </div>
          </div>
        </div>
      )}
      {pin && <PinPad onCancel={() => setPinAsk(false)} onOk={() => { setPinAsk(false); setMode('management'); }} />}
    </>
  );
};

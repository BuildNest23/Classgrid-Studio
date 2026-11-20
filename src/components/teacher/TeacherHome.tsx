import React from 'react';
import { useClassroom } from '../../context/ClassroomContext';
import { todayKey, prettyDate } from '../../utils/helpers';
import { ClipboardCheck, BarChart3, FileDown, Users, Wallet } from 'lucide-react';

export const TeacherHome: React.FC = () => {
  const { data, setActiveTab, countDay, isTodayAttendanceTaken } = useClassroom();
  const hasClass = !!data.classId;
  const c = countDay(todayKey());
  const taken = isTodayAttendanceTaken();

  if (!hasClass) {
    return (
      <div className="rounded-3xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-6 text-center">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-red-100 dark:bg-red-950/60 text-red-800 flex items-center justify-center"><FileDown className="w-7 h-7" /></div>
        <h2 className="mt-3 text-lg font-black">Open your class file</h2>
        <p className="text-sm text-stone-500 mt-1">Management will send you a class file. Open it here and your students will appear.</p>
        <button type="button" onClick={() => setActiveTab('collect')}
          className="mt-4 w-full min-h-[48px] rounded-2xl bg-red-800 text-white font-bold cursor-pointer active:scale-[0.98]">Open class file</button>
      </div>
    );
  }

  const Tile = ({ icon: I, label, sub, tab }: { icon: any; label: string; sub: string; tab: any }) => (
    <button type="button" onClick={() => setActiveTab(tab)}
      className="text-left p-4 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 active:scale-[0.98] cursor-pointer">
      <I className="w-6 h-6 text-red-800 dark:text-red-400" />
      <div className="mt-2 font-black text-sm">{label}</div>
      <div className="text-xs text-stone-500">{sub}</div>
    </button>
  );

  return (
    <div className="space-y-3.5">
      <div className="rounded-3xl bg-red-800 text-white p-5">
        <div className="text-xs opacity-80">{data.schoolName}</div>
        <div className="text-2xl font-black mt-0.5">{data.className || 'Class'}</div>
        <div className="text-xs opacity-80 mt-1">{data.students.length} students{data.inchargeName ? ` • ${data.inchargeName}` : ''}</div>
      </div>
      <button type="button" onClick={() => setActiveTab('attendance')}
        className="w-full text-left p-4 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 cursor-pointer active:scale-[0.99]">
        <div className="text-xs text-stone-500">{prettyDate(todayKey())}</div>
        <div className="font-black mt-0.5">{taken ? `Attendance taken: ${c.present} present, ${c.absent} absent${c.leave ? `, ${c.leave} leave` : ''}` : 'Attendance not taken yet'}</div>
        <div className="text-xs font-bold text-red-800 dark:text-red-400 mt-1">{taken ? 'Open attendance' : 'Take attendance now'} →</div>
      </button>
      <div className="grid grid-cols-2 gap-3">
        <Tile icon={ClipboardCheck} label="Attendance" sub="Mark & share slip" tab="attendance" />
        <Tile icon={BarChart3} label="Marks" sub="Exams & results" tab="results" />
        <Tile icon={Users} label="Students" sub="Class list" tab="students" />
        <Tile icon={Wallet} label="Funds" sub="Fees & collections" tab="funds" />
      </div>
      {data.teacherLink && (
        <div className="text-[11px] text-stone-400 text-center">Class file version {data.teacherLink.version}</div>
      )}
    </div>
  );
};

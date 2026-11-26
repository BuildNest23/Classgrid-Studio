import React from 'react';
import { useClassroom } from '../../context/ClassroomContext';
import { getSortedStudents } from '../../utils/helpers';
import { Phone } from 'lucide-react';

export const TeacherStudents: React.FC = () => {
  const { data } = useClassroom();
  const list = getSortedStudents(data.students);
  return (
    <div>
      <div className="mb-3">
        <h2 className="text-lg font-black">{data.className || 'Class'} — {list.length} students</h2>
        <p className="text-xs text-stone-500">To change a student's details, ask management to send a new class file.</p>
      </div>
      {!list.length && <div className="p-6 text-center text-sm text-stone-500 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800">No students yet. Open your class file from Home.</div>}
      <div className="rounded-2xl overflow-hidden bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 divide-y divide-stone-100 dark:divide-stone-800">
        {list.map(s => {
          const tel = (s.phone || '').split('/')[0].replace(/[^\d+]/g, '');
          return (
            <div key={s.id} className="flex items-center gap-3 px-3.5 py-2.5">
              <div className="w-9 text-center text-xs font-black text-stone-500">{s.rollNo || '–'}</div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold truncate">{s.name}</div>
                <div className="text-xs text-stone-500 truncate">{[s.fatherName, s.phone, s.address].filter(Boolean).join(' • ')}</div>
              </div>
              {tel && <a href={`tel:${tel}`} className="w-11 h-11 flex items-center justify-center shrink-0 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300" aria-label="Call"><Phone className="w-4 h-4" /></a>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

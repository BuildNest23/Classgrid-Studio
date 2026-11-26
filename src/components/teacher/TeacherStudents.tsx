import React, { useState } from 'react';
import { useClassroom } from '../../context/ClassroomContext';
import { getSortedStudents } from '../../utils/helpers';
import { Phone, Search, GraduationCap } from 'lucide-react';

export const TeacherStudents: React.FC = () => {
  const { data } = useClassroom();
  const [query, setQuery] = useState('');
  const list = getSortedStudents(data.students);

  const q = query.trim().toLowerCase();
  const visible = q
    ? list.filter(
        s =>
          (s.name || '').toLowerCase().includes(q) ||
          (s.fatherName || '').toLowerCase().includes(q) ||
          (s.rollNo || '').toLowerCase().includes(q) ||
          (s.phone || '').toLowerCase().includes(q)
      )
    : list;

  return (
    <div className="space-y-4">
      {/* Masthead */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium text-stone-500 dark:text-stone-400 tabular-nums">
            {data.className || 'Class'} · {list.length} {list.length === 1 ? 'student' : 'students'}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-stone-900 dark:text-stone-100 mt-1">
            Students
          </h1>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
            Read-only roster. To update details, ask management for a fresh class file.
          </p>
        </div>

        {list.length >= 6 && (
          <div className="relative w-full sm:w-64 shrink-0">
            <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search student, father, or roll…"
              className="w-full min-h-[42px] pl-10 pr-3.5 py-2 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-xs text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:border-red-700 dark:focus:border-red-500"
            />
          </div>
        )}
      </div>

      {/* Roster Surface */}
      {!list.length ? (
        <div className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 py-10 px-6 text-center">
          <GraduationCap className="w-8 h-8 mx-auto text-stone-400 dark:text-stone-600" />
          <p className="text-sm font-semibold text-stone-700 dark:text-stone-300 mt-2.5">
            No students loaded yet
          </p>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
            Open your class file from Home or Class File to view your roster.
          </p>
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-6 text-center text-xs text-stone-500 dark:text-stone-400">
          No students match &ldquo;{query}&rdquo;.
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 divide-y divide-stone-100 dark:divide-stone-800">
          {visible.map(s => {
            const tel = (s.phone || '').split('/')[0].replace(/[^\d+]/g, '');
            const details = [
              s.fatherName ? `s/o ${s.fatherName}` : null,
              s.phone || null,
              s.address || null,
            ]
              .filter(Boolean)
              .join(' · ');

            return (
              <div key={s.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <div className="w-10 text-center font-mono-num text-xs font-bold text-stone-500 dark:text-stone-400 shrink-0">
                  {s.rollNo || '—'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-stone-900 dark:text-stone-100 truncate">
                    {s.name || '(no name)'}
                  </div>
                  {details && (
                    <div className="text-xs text-stone-500 dark:text-stone-400 truncate mt-0.5">
                      {details}
                    </div>
                  )}
                </div>
                {tel && (
                  <a
                    href={`tel:${tel}`}
                    className="w-11 h-11 flex items-center justify-center shrink-0 rounded-xl bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-800 dark:hover:text-red-400 transition-colors"
                    aria-label={`Call ${s.name || 'guardian'}`}
                    title={`Call ${s.phone}`}
                  >
                    <Phone className="w-4 h-4" />
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

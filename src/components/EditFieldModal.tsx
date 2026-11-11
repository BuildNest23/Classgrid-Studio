import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

export interface EditFieldModalProps {
  /** e.g. "Father Name" */
  label: string;
  /** e.g. the student's name, shown under the label */
  subject: string;
  value: string;
  multiline?: boolean;
  inputMode?: 'text' | 'numeric' | 'tel';
  required?: boolean;
  note?: string;
  onSave: (value: string) => void;
  onClose: () => void;
}

/** Small popup for correcting one field. Enter saves (Ctrl/Cmd+Enter in multi-line boxes). */
export const EditFieldModal: React.FC<EditFieldModalProps> = ({
  label, subject, value, multiline, inputMode = 'text', required, note, onSave, onClose,
}) => {
  const [text, setText] = useState(value);
  const [error, setError] = useState('');
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const save = () => {
    const v = text.trim();
    if (required && !v) {
      setError(`${label} can't be empty.`);
      return;
    }
    onSave(v);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'Enter' && (!multiline || e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      save();
    }
  };

  const fieldCls =
    'w-full p-2.5 text-sm rounded-xl border border-[#D6D3D1] dark:border-[#44403C] bg-white dark:bg-[#0C0A09] text-[#1C1917] dark:text-[#F5F5F4]';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm bg-white dark:bg-[#1C1917] rounded-2xl border border-[#E7E5E4] dark:border-[#44403C] shadow-2xl p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-bold text-[#1C1917] dark:text-[#F5F5F4]">{label}</div>
            <div className="text-xs text-[#78716C] dark:text-[#A8A29E] truncate">{subject}</div>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer" title="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {multiline ? (
          <textarea
            ref={ref}
            rows={4}
            value={text}
            onChange={e => { setText(e.target.value); setError(''); }}
            onKeyDown={onKey}
            className={fieldCls}
          />
        ) : (
          <input
            ref={ref}
            type="text"
            inputMode={inputMode}
            value={text}
            onChange={e => { setText(e.target.value); setError(''); }}
            onKeyDown={onKey}
            className={fieldCls}
          />
        )}

        {note && <div className="text-[11px] text-[#78716C] dark:text-[#A8A29E]">{note}</div>}
        {error && <div className="text-xs font-semibold text-red-700 dark:text-red-400">{error}</div>}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 text-xs font-bold rounded-xl bg-[#F5F5F4] dark:bg-[#292524] text-[#1C1917] dark:text-[#F5F5F4] hover:bg-[#E7E5E4] cursor-pointer">
            Cancel
          </button>
          <button type="button" onClick={save} className="flex-1 py-2.5 text-xs font-bold rounded-xl bg-[#B91C1C] text-white hover:bg-[#991B1B] cursor-pointer">
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

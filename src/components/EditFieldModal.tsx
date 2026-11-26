import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { PlainTextInput } from './PlainTextInput';

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
  label,
  subject,
  value,
  multiline,
  inputMode = 'text',
  required,
  note,
  onSave,
  onClose,
}) => {
  const [text, setText] = useState(value);
  const [error, setError] = useState('');
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
    const onGlobalKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onGlobalKey);
    return () => window.removeEventListener('keydown', onGlobalKey);
  }, [onClose]);

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
    'w-full px-3 py-2.5 text-sm rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-950/60 text-stone-900 dark:text-stone-100 focus:outline-none focus:bg-white dark:focus:bg-stone-950 focus:border-red-700 dark:focus:border-red-500 transition-colors';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/55 backdrop-blur-[2px]"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="cg-sheet-up w-full sm:max-w-sm bg-white dark:bg-stone-900 rounded-t-3xl sm:rounded-2xl border-t sm:border border-stone-200 dark:border-stone-800 shadow-2xl p-5 pb-safe sm:pb-5 space-y-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-base font-bold text-stone-900 dark:text-stone-100">{label}</div>
            <div className="text-xs text-stone-500 dark:text-stone-400 truncate mt-0.5">{subject}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 -mr-1.5 -mt-1.5 flex items-center justify-center rounded-xl text-stone-400 hover:text-stone-800 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer transition-colors"
            title="Close"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {multiline ? (
          <textarea
            ref={ref}
            rows={4}
            value={text}
            onChange={e => {
              setText(e.target.value);
              setError('');
            }}
            onKeyDown={onKey}
            className={fieldCls}
          />
        ) : (
          <PlainTextInput
            ref={ref}
            inputMode={inputMode}
            value={text}
            onChange={e => {
              setText(e.target.value);
              setError('');
            }}
            onKeyDown={onKey}
            className={fieldCls}
          />
        )}

        {note && <div className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed">{note}</div>}
        {error && <div className="text-xs font-semibold text-red-700 dark:text-red-400">{error}</div>}

        <div className="flex gap-2.5 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 min-h-[44px] py-2.5 text-xs font-semibold rounded-xl bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-200 hover:bg-stone-200 dark:hover:bg-stone-700 cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            className="flex-1 min-h-[44px] py-2.5 text-xs font-semibold rounded-xl bg-red-800 hover:bg-red-900 dark:bg-red-700 dark:hover:bg-red-600 text-white cursor-pointer transition-colors active:scale-[0.98]"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

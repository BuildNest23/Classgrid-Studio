import { useRef, useState } from 'react';
import { Paperclip, FileUp, X, Download } from 'lucide-react';

interface AiAssistCardProps {
  title: string;
  /** Grey example text. It disappears as soon as the teacher starts typing, so nothing needs deleting. */
  placeholder: string;
  hint: string;
  accept: string;
  /** Return false when nothing was applied (error / cancelled) so the typed text and file are kept. */
  onGo: (file: File | null, text: string) => Promise<boolean>;
  onExport?: () => void;
  exportLabel?: string;
  /** When true, omits the outer card border/background to prevent card-within-card nesting. */
  embedded?: boolean;
}

export function AiAssistCard({
  title,
  placeholder,
  hint,
  accept,
  onGo,
  onExport,
  exportLabel,
  embedded = false,
}: AiAssistCardProps) {
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const go = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const ok = await onGo(file, text.trim());
      if (ok) {
        setFile(null);
        setText('');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={
        embedded
          ? 'space-y-2.5 pt-3'
          : 'bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-4 space-y-2.5'
      }
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-xs font-bold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
          <FileUp className="w-3.5 h-3.5 text-red-800 dark:text-red-400 shrink-0" />
          <span>{title}</span>
        </h3>
        {onExport && (
          <button
            type="button"
            onClick={onExport}
            className="text-[11px] font-semibold text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 flex items-center gap-1 cursor-pointer transition-colors"
          >
            <Download className="w-3 h-3" />
            <span>{exportLabel || 'Export file'}</span>
          </button>
        )}
      </div>

      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={placeholder}
        rows={5}
        maxLength={600}
        disabled={busy}
        className="w-full resize-none rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-950/60 text-xs leading-relaxed text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 px-3 py-2.5 outline-none focus:bg-white dark:focus:bg-stone-950 focus:border-red-700 dark:focus:border-red-500 transition-colors"
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="min-h-[40px] px-3 rounded-xl text-xs font-semibold flex items-center gap-1.5 min-w-0 max-w-[65%] bg-stone-50 hover:bg-stone-100 text-stone-800 border border-stone-200 dark:bg-stone-800/80 dark:hover:bg-stone-800 dark:text-stone-200 dark:border-stone-700 cursor-pointer disabled:opacity-60 transition-colors"
        >
          <Paperclip className="w-3.5 h-3.5 shrink-0 text-stone-500 dark:text-stone-400" />
          <span className="truncate">{file ? file.name : 'Attach file'}</span>
        </button>
        {file && !busy && (
          <button
            type="button"
            onClick={() => setFile(null)}
            aria-label="Remove file"
            className="w-10 h-10 rounded-xl flex items-center justify-center text-stone-400 hover:text-red-700 dark:hover:text-red-400 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        <button
          type="button"
          onClick={go}
          disabled={busy}
          className="ml-auto min-h-[40px] px-4 rounded-xl text-xs font-semibold bg-red-800 hover:bg-red-900 dark:bg-red-700 dark:hover:bg-red-600 text-white cursor-pointer disabled:opacity-60 transition-colors active:scale-[0.98]"
        >
          {busy ? 'Working…' : 'Go'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0] || null;
            e.target.value = '';
            if (f) setFile(f);
          }}
        />
      </div>

      <p className="text-[11px] text-stone-500 dark:text-stone-400 leading-relaxed">{hint}</p>
    </div>
  );
}

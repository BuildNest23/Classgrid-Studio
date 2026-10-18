import React, { useRef, useState } from 'react';
import { Paperclip, Sparkles, X, Download } from 'lucide-react';

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
}

export function AiAssistCard({ title, placeholder, hint, accept, onGo, onExport, exportLabel }: AiAssistCardProps) {
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
    <div className="bg-white dark:bg-[#1C1917] border border-[#E7E5E4] dark:border-[#44403C] rounded-2xl p-3 shadow-xs space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-[#1C1917] dark:text-[#F5F5F4] flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-[#B91C1C]" />
          {title}
        </h3>
        {onExport && (
          <button
            type="button"
            onClick={onExport}
            className="text-[10.5px] font-bold text-[#78716C] dark:text-[#A8A29E] hover:text-[#1C1917] dark:hover:text-[#F5F5F4] flex items-center gap-1 cursor-pointer"
          >
            <Download className="w-3 h-3" />
            {exportLabel || 'Export file'}
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
        className="w-full resize-none rounded-lg border border-[#D6D3D1] dark:border-[#44403C] bg-[#FAFAF9] dark:bg-[#0C0A09] text-xs leading-snug text-[#1C1917] dark:text-[#F5F5F4] placeholder:text-[#A8A29E] dark:placeholder:text-[#78716C] px-2.5 py-2 outline-none focus:border-[#B91C1C]"
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="h-8 px-2.5 rounded-lg text-xs font-bold flex items-center gap-1.5 min-w-0 max-w-[65%] bg-stone-50 hover:bg-stone-100 text-stone-800 border border-stone-200 dark:bg-stone-800/90 dark:hover:bg-stone-700/90 dark:text-stone-200 dark:border-stone-700 cursor-pointer disabled:opacity-60"
        >
          <Paperclip className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{file ? file.name : 'Attach file'}</span>
        </button>
        {file && !busy && (
          <button
            type="button"
            onClick={() => setFile(null)}
            aria-label="Remove file"
            className="h-8 w-8 rounded-lg flex items-center justify-center text-[#78716C] hover:text-[#B91C1C] cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={go}
          disabled={busy}
          className="ml-auto h-8 px-4 rounded-lg text-xs font-bold bg-[#B91C1C] hover:bg-[#991B1B] text-white cursor-pointer disabled:opacity-60"
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

      <p className="text-[10.5px] text-[#78716C] dark:text-[#A8A29E] leading-snug">{hint}</p>
    </div>
  );
}

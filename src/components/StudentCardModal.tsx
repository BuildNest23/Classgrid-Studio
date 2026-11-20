import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, Printer, Image as ImageIcon, Share2, AlertTriangle, Loader2 } from 'lucide-react';
import { useClassroom } from '../context/ClassroomContext';
import { PrintSizeKey } from '../types';
import { Capacitor } from '@capacitor/core';
import { triggerPrint } from '../utils/printEngine';
import { confirmCardPrintSettings } from '../utils/printSettingsPrompt';
import {
  CARD_W_PX,
  CARD_H_PX,
  RECEIPT_PAGE_W_PX,
  buildCardPageHTML,
  buildReceiptPageHTML,
  renderCardCanvas,
  canvasToBlob,
  downloadBlob,
  shareFile,
  safeFileName
} from '../utils/cardExport';
import { useCapsPrint } from '../utils/capsPrint';
import { fitLongNames } from '../utils/fitText';

interface CardItem {
  id: string;
  name: string;
  rollNo: string;
}

interface Props {
  items: CardItem[];
  studentId: string;
  onChange: (studentId: string) => void;
  onClose: () => void;
  /** Card HTML (same markup the printer uses) for one student */
  buildHTML: (studentId: string) => string;
  mult: number;
  printSize: PrintSizeKey;
  forceOrientation: string;
  /** Optional amber notice shown above the card */
  notice?: (studentId: string) => string;
  /** Used for file names and the dialog label, e.g. "Result" or "Fee Statement" */
  label: string;
  /** Narrow fee receipt instead of a full A4 card: the preview shrinks to fit the receipt */
  receipt?: boolean;
  /** Optional controls shown between the notice and the preview */
  options?: React.ReactNode;
}

export const StudentCardModal: React.FC<Props> = ({
  items, studentId, onChange, onClose, buildHTML, mult, printSize, forceOrientation, notice, label, receipt, options
}) => {
  const { toast, uiConfirm, setActiveTab } = useClassroom();
  const list = items;
  const index = Math.max(0, list.findIndex(i => i.id === studentId));
  const item = list[index];
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const [busy, setBusy] = useState<'' | 'img' | 'share'>('');
  const [measuredH, setMeasuredH] = useState(560);
  const pageW = receipt ? RECEIPT_PAGE_W_PX : CARD_W_PX;
  const pageH = receipt ? measuredH : CARD_H_PX;

  const caps = useCapsPrint();
  const rawCardHTML = buildHTML(studentId);
  const [cardHTML, setCardHTML] = useState(rawCardHTML);

  useEffect(() => {
    let active = true;
    fitLongNames(rawCardHTML).then(res => {
      if (active) setCardHTML(res);
    });
    return () => {
      active = false;
    };
  }, [rawCardHTML, caps]);

  const pageHTML = useMemo(
    () => (receipt ? buildReceiptPageHTML(cardHTML) : buildCardPageHTML(cardHTML, mult)),
    [cardHTML, mult, receipt, caps]
  );
  const noticeText = notice ? notice(studentId) : '';

  // Fit the A4 preview to the width of the popup
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const fit = () => setScale(Math.min(1, el.clientWidth / pageW));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pageW]);

  const go = useCallback(
    (delta: number) => {
      const next = list[index + delta];
      if (next) onChange(next.id);
    },
    [list, index, onChange]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      // Arrow keys inside the receipt/watermark options (text input, select, sliders) must move the
      // caret / value there, not jump to another student.
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
      if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onClose]);

  if (!item) return null;

  const baseName = safeFileName(`${label} - ${item.name || 'Student'}${item.rollNo ? ' - Roll ' + item.rollNo : ''}`);

  const getCanvas = async () => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) throw new Error('not ready');
    if (doc.fonts && doc.fonts.ready) await doc.fonts.ready;
    return renderCardCanvas(doc, 2, pageW, pageH);
  };

  const fallbackPrint = async () => {
    toast('Could not create the file on this device, opening the print dialog instead.', 'info');
    const ok = await triggerPrint(cardHTML, 'portrait', printSize, forceOrientation, false);
    if (!ok) toast("Could not open the print dialog. Try again.", "error");
  };

  // A receipt page is as tall as its content: measure it once the preview has loaded
  const onFrameLoad = () => {
    if (!receipt) return;
    const page = iframeRef.current?.contentDocument?.querySelector('.cg-page') as HTMLElement | null;
    if (page) setMeasuredH(Math.max(200, Math.ceil(page.scrollHeight)));
  };

  const handlePrint = async () => {
    if (!receipt && !(await confirmCardPrintSettings(uiConfirm, printSize, forceOrientation))) { onClose(); setActiveTab('settings'); return; }
    const ok = await triggerPrint(cardHTML, 'portrait', printSize, forceOrientation, false, baseName);
    if (!ok) toast("Could not open the print dialog. Try again.", "error");
  };

  const run = async (kind: 'img' | 'share') => {
    if (busy) return;
    setBusy(kind);
    try {
      const canvas = await getCanvas();
      const itemTitle = `${item.name || 'Student'} - ${label}`;
      const blob = await canvasToBlob(canvas, 'image/png');
      if (kind === 'img') {
        const ok = await downloadBlob(blob, `${baseName}.png`, itemTitle);
        if (ok) {
          toast(Capacitor.isNativePlatform() ? 'Card ready in Android share sheet.' : 'Image ready to share.', 'success');
        } else {
          toast('Could not create the image.', 'error');
        }
      } else {
        const ok = await shareFile(blob, `${baseName}.png`, itemTitle);
        if (!ok) {
          await downloadBlob(blob, `${baseName}.png`, itemTitle);
          toast('Sharing not available here; image saved instead.', 'info');
        }
      }
    } catch {
      fallbackPrint();
    } finally {
      setBusy('');
    }
  };

  const iconBtn =
    'w-12 h-12 rounded-full flex items-center justify-center border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700 active:scale-95 transition disabled:opacity-40 cursor-pointer';
  const navBtn =
    'absolute top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full flex items-center justify-center bg-white/90 dark:bg-stone-900/90 border border-stone-200 dark:border-stone-700 shadow-sm text-stone-700 dark:text-stone-200 disabled:opacity-30 cursor-pointer';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-5 pt-[max(1.25rem,calc(var(--safe-top,env(safe-area-inset-top,0px))+0.75rem))] pb-[max(1.25rem,calc(var(--safe-bottom,env(safe-area-inset-bottom,0px))+0.75rem))] bg-black/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[calc(100dvh-var(--safe-top,env(safe-area-inset-top,0px))-var(--safe-bottom,env(safe-area-inset-bottom,0px))-2.5rem)] flex flex-col bg-white dark:bg-stone-900 rounded-3xl shadow-2xl border border-stone-200 dark:border-stone-800 overflow-hidden"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-label={label}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-stone-200 dark:border-stone-800 shrink-0">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100 truncate">{item.name || 'Student'}</h2>
            <p className="text-[11px] text-stone-500 dark:text-stone-400">
              Roll {item.rollNo || '—'} · {index + 1} of {list.length}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-2 -mr-1 text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 rounded-full active:bg-stone-200 dark:active:bg-stone-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {noticeText && (
          <div className="flex items-start gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 text-xs font-semibold border-b border-amber-200/60 dark:border-amber-900/50">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
            <span>{noticeText}</span>
          </div>
        )}

        {options}

        {/* Card preview */}
        <div className="relative flex-1 min-h-0 bg-stone-100 dark:bg-stone-950">
          <button type="button" aria-label="Previous student" className={`${navBtn} left-2`} disabled={index === 0} onClick={() => go(-1)}>
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button type="button" aria-label="Next student" className={`${navBtn} right-2`} disabled={index === list.length - 1} onClick={() => go(1)}>
            <ChevronRight className="w-5 h-5" />
          </button>
          <div className="h-full max-h-[68vh] overflow-y-auto overflow-x-hidden p-2 sm:p-3">
            <div ref={boxRef} className="mx-auto w-full" style={{ maxWidth: pageW }}>
              <div
                className="bg-white shadow-md rounded-sm overflow-hidden"
                style={{ width: pageW * scale, height: pageH * scale }}
              >
                <iframe
                  ref={iframeRef}
                  title={`${label} preview`}
                  srcDoc={pageHTML}
                  onLoad={onFrameLoad}
                  sandbox="allow-same-origin"
                  style={{
                    width: pageW,
                    height: pageH,
                    border: 0,
                    transform: `scale(${scale})`,
                    transformOrigin: 'top left',
                    pointerEvents: 'none',
                    background: '#fff'
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Actions: icons only */}
        <div className="flex items-center justify-center gap-5 px-4 py-3 border-t border-stone-200 dark:border-stone-800 shrink-0">
          <button type="button" className={iconBtn} onClick={handlePrint} disabled={!!busy} title="Print" aria-label="Print">
            <Printer className="w-5 h-5" />
          </button>
          <button type="button" className={iconBtn} onClick={() => run('img')} disabled={!!busy} title="Share as image" aria-label="Share as image">
            {busy === 'img' ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImageIcon className="w-5 h-5" />}
          </button>
          <button type="button" className={iconBtn} onClick={() => run('share')} disabled={!!busy} title="Share" aria-label="Share">
            {busy === 'share' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Share2 className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </div>
  );
};

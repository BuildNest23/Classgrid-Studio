import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useClassroom } from '../context/ClassroomContext';
import { PrintSizeKey } from '../types';
import { PRINT_SIZES } from '../utils/helpers';
import { triggerPrint, buildStandalonePrintHTML, wrapZoom } from '../utils/printEngine';
import { fitLongNames } from '../utils/fitText';
import { registerPrintPreview, PrintRequest } from '../utils/printPreviewBus';
import { FitMeasurer, autoFit, pageGeometry, SIZE_ORDER, Orientation } from '../utils/printFit';
import { useCapsPrint, saveCapsPrint } from '../utils/capsPrint';
import { Printer, Wand2, X, Loader2 } from 'lucide-react';

/**
 * Print preview with Auto-fit. Opens with the best layout already chosen (fewest pages,
 * biggest readable text); the teacher can still change anything before printing.
 */
export const PrintPreviewModal: React.FC = () => {
  const { data, toast } = useClassroom();
  const caps = useCapsPrint();
  const [req, setReq] = useState<PrintRequest | null>(null);
  const [content, setContent] = useState('');
  const [orientation, setOrientation] = useState<Orientation>('portrait');
  const [size, setSize] = useState<PrintSizeKey>('m');
  const [pageNumbers, setPageNumbers] = useState(false);
  const [onePage, setOnePage] = useState<boolean>(() => {
    try { return localStorage.getItem('classgridFitOnePage') === '1'; } catch { return false; }
  });
  const saveOnePage = (v: boolean) => {
    setOnePage(v);
    try { localStorage.setItem('classgridFitOnePage', v ? '1' : '0'); } catch { /* ignore */ }
  };
  const [pages, setPages] = useState<number | null>(null);
  const [heightPx, setHeightPx] = useState(1000);
  const [busy, setBusy] = useState(false);
  const [autoNote, setAutoNote] = useState('');

  const measurerRef = useRef<FitMeasurer | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(320);

  useEffect(() => {
    registerPrintPreview(r => setReq(r));
    return () => registerPrintPreview(null);
  }, []);

  const locked = (data.forceOrientation || '') as Orientation | '';

  const runAuto = async (m: FitMeasurer, natural: Orientation) => {
    setBusy(true);
    try {
      const best = await autoFit(m, natural, locked);
      setOrientation(best.orientation);
      setSize(best.size);
      setAutoNote(`Auto-fit: ${best.pages} page${best.pages === 1 ? '' : 's'}`);
    } finally {
      setBusy(false);
    }
  };

  // Builds the content (names shrunk to fit) and a fresh measurer for it
  const prepare = async (r: PrintRequest) => {
    const html = await fitLongNames(r.html);
    setContent(html);
    measurerRef.current?.dispose();
    const m = new FitMeasurer(html);
    measurerRef.current = m;
    return m;
  };

  // Turning UPPERCASE on/off changes text widths: rebuild, keep the chosen layout
  const firstCapsRef = useRef(true);
  useEffect(() => {
    if (firstCapsRef.current) { firstCapsRef.current = false; return; }
    if (!req) return;
    (async () => {
      setBusy(true);
      await prepare(req);
      setBusy(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caps]);

  // Opening: prepare the content, then pick the best layout automatically
  useEffect(() => {
    if (!req) return;
    let cancelled = false;
    (async () => {
      setBusy(true);
      setPages(null);
      setPageNumbers(!!req.pageNumbers);
      const m = await prepare(req);
      if (cancelled || !m) return;
      setOrientation((locked || req.orientation) as Orientation);
      setSize(data.printSize);
      await runAuto(m, req.orientation);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req]);

  // Re-count pages whenever the layout changes
  useEffect(() => {
    const m = measurerRef.current;
    if (!req || !content || !m) return;
    let cancelled = false;
    m.measure(size, orientation).then(r => {
      if (cancelled) return;
      setPages(r.pages);
      setHeightPx(Math.max(200, r.heightPx));
    });
    return () => { cancelled = true; };
  }, [req, content, size, orientation]);

  useLayoutEffect(() => {
    if (!req || !boxRef.current) return;
    const el = boxRef.current;
    const update = () => setBoxW(el.clientWidth || 320);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [req, content]);

  const close = () => {
    measurerRef.current?.dispose();
    measurerRef.current = null;
    setReq(null);
    setContent('');
    setAutoNote('');
  };

  if (!req) return null;

  const g = pageGeometry(orientation);
  // "Fit on 1 page": shrink the whole sheet evenly when it is longer than one page (never below 30%)
  const MIN_ZOOM = 0.3;
  const tooLong = onePage && pages !== null && pages > 1 && heightPx * MIN_ZOOM > g.printH;
  const fitZoom = onePage && pages !== null && pages > 1 && !tooLong
    ? Math.min(1, Math.floor((g.printH * 0.97 / heightPx) * 1000) / 1000)
    : 1;
  const stillTooLong = tooLong;
  const scale = Math.min(1, (boxW - 2) / g.pageW);
  const mult = (PRINT_SIZES[size] || PRINT_SIZES.m).mult;
  // Full-page sheets use a 100vh min-height; in the preview that must mean one page, not the whole preview.
  const srcDoc = content
    ? buildStandalonePrintHTML(wrapZoom(content, fitZoom, orientation), mult, orientation, false, 'Preview').replace(
        '</head>',
        `<style>.print-sheet.ps2-port,.print-sheet.ps2-land{min-height:${Math.round(g.printH - 8)}px !important;}</style></head>`
      )
    : '';
  const shownH = Math.round(heightPx * fitZoom);
  const shownPages = fitZoom < 1 && !stillTooLong ? 1 : pages;
  const paperH = shownH + 2 * g.margin;
  const breaks = shownPages && shownPages > 1 ? Array.from({ length: shownPages - 1 }, (_, i) => g.margin + (i + 1) * g.printH) : [];

  const handlePrint = async () => {
    const html = content || req.html;
    close();
    const ok = await triggerPrint(html, orientation, size, orientation, pageNumbers, fitZoom);
    if (!ok) toast('Could not open the print dialog. Try again.', 'error');
  };

  const manual = () => setAutoNote('');

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4">
      <div className="w-full sm:max-w-2xl bg-white dark:bg-[#1C1917] rounded-t-3xl sm:rounded-2xl border border-[#E7E5E4] dark:border-[#44403C] shadow-2xl flex flex-col max-h-[94vh]">
        <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-[#E7E5E4] dark:border-[#44403C]">
          <div>
            <div className="text-sm font-bold text-[#1C1917] dark:text-[#F5F5F4]">Print preview</div>
            <div className="text-[11px] text-[#78716C] dark:text-[#A8A29E]">
              {busy || pages === null ? 'Measuring…' : `About ${shownPages} page${shownPages === 1 ? '' : 's'}${fitZoom < 1 ? ` (shrunk to ${Math.round(fitZoom * 100)}%)` : ''}`}
              {autoNote && !busy ? ` · ${autoNote}` : ''}
            </div>
          </div>
          <button type="button" onClick={close} className="p-1.5 rounded-lg text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer" title="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Controls */}
        <div className="px-4 py-2.5 grid grid-cols-2 gap-2 border-b border-[#E7E5E4] dark:border-[#44403C]">
          <div>
            <label className="block text-[10.5px] font-bold text-[#78716C] dark:text-[#A8A29E] uppercase tracking-wide mb-1">Page</label>
            <div className="flex rounded-xl overflow-hidden border border-[#D6D3D1] dark:border-[#44403C]">
              {(['portrait', 'landscape'] as Orientation[]).map(o => (
                <button
                  key={o}
                  type="button"
                  onClick={() => { setOrientation(o); manual(); }}
                  className={`flex-1 py-1.5 text-xs font-bold cursor-pointer ${orientation === o ? 'bg-[#B91C1C] text-white' : 'bg-white dark:bg-[#0C0A09] text-[#1C1917] dark:text-[#F5F5F4]'}`}
                >
                  {o === 'portrait' ? 'Portrait' : 'Landscape'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[10.5px] font-bold text-[#78716C] dark:text-[#A8A29E] uppercase tracking-wide mb-1">Text size</label>
            <select
              value={size}
              onChange={e => { setSize(e.target.value as PrintSizeKey); manual(); }}
              className="w-full p-1.5 text-xs rounded-xl border border-[#D6D3D1] dark:border-[#44403C] bg-white dark:bg-[#0C0A09] text-inherit"
            >
              {SIZE_ORDER.slice().reverse().map(k => (
                <option key={k} value={k}>{PRINT_SIZES[k].label}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold text-[#1C1917] dark:text-[#F5F5F4] cursor-pointer">
            <input type="checkbox" checked={caps} onChange={e => saveCapsPrint(e.target.checked)} className="w-4 h-4 accent-[#B91C1C]" />
            UPPERCASE text
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold text-[#1C1917] dark:text-[#F5F5F4] cursor-pointer">
            <input type="checkbox" checked={pageNumbers} onChange={e => setPageNumbers(e.target.checked)} className="w-4 h-4 accent-[#B91C1C]" />
            Page numbers
          </label>
          <label className="col-span-2 flex items-center gap-2 text-xs font-semibold text-[#1C1917] dark:text-[#F5F5F4] cursor-pointer">
            <input type="checkbox" checked={onePage} onChange={e => saveOnePage(e.target.checked)} className="w-4 h-4 accent-[#B91C1C]" />
            Fit on 1 page
            <span className="font-normal text-[#78716C] dark:text-[#A8A29E]">(shrinks the whole sheet if it is longer)</span>
          </label>
          {stillTooLong && (
            <div className="col-span-2 text-[11px] text-[#B45309] dark:text-[#FCD34D]">
              This sheet is too long to fit on one page even at the smallest size. It will print on more pages.
            </div>
          )}
          {locked && (
            <div className="col-span-2 text-[11px] text-[#78716C] dark:text-[#A8A29E]">
              Settings forces {locked} pages, so Auto-fit only changes the text size. Change it here to override for this print.
            </div>
          )}
        </div>

        {/* Preview */}
        <div className="flex-1 overflow-y-auto bg-stone-200 dark:bg-stone-900 p-3 min-h-[200px]">
          <div ref={boxRef} className="mx-auto w-full">
            {content ? (
              <div style={{ width: g.pageW * scale, height: paperH * scale, margin: '0 auto' }}>
                <div
                  style={{
                    width: g.pageW,
                    height: paperH,
                    transform: `scale(${scale})`,
                    transformOrigin: 'top left',
                    background: '#fff',
                    position: 'relative',
                    boxShadow: '0 1px 6px rgba(0,0,0,.35)',
                  }}
                >
                  <iframe
                    title="Print preview"
                    srcDoc={srcDoc}
                    style={{ position: 'absolute', left: g.margin, top: g.margin, width: g.printW, height: shownH, border: 0, background: '#fff' }}
                  />
                  {breaks.map((y, i) => (
                    <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: y, borderTop: '2px dashed #B91C1C', pointerEvents: 'none' }}>
                      <span style={{ position: 'absolute', right: 6, top: 2, fontSize: 12, color: '#B91C1C', background: '#fff' }}>page {i + 2}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="py-12 flex justify-center text-stone-500"><Loader2 className="w-6 h-6 animate-spin" /></div>
            )}
          </div>
          {breaks.length > 0 && (
            <div className="text-center text-[10.5px] text-stone-500 mt-2">Dashed lines show roughly where pages break.</div>
          )}
        </div>

        <div className="p-3 flex gap-2 border-t border-[#E7E5E4] dark:border-[#44403C]">
          <button
            type="button"
            disabled={busy || !measurerRef.current}
            onClick={() => measurerRef.current && runAuto(measurerRef.current, req.orientation)}
            className="py-2.5 px-3 text-xs font-bold rounded-xl bg-[#F5F5F4] dark:bg-[#292524] text-[#1C1917] dark:text-[#F5F5F4] hover:bg-[#E7E5E4] disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
          >
            <Wand2 className="w-4 h-4" /> Auto-fit
          </button>
          <button
            type="button"
            disabled={busy || !content}
            onClick={handlePrint}
            className="flex-1 py-2.5 px-3 text-xs font-bold rounded-xl bg-[#B91C1C] text-white hover:bg-[#991B1B] disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Printer className="w-4 h-4" /> Print
          </button>
        </div>
      </div>
    </div>
  );
};

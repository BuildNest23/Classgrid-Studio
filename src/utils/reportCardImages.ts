// Makes one picture (PNG) of the report card of every student and puts them all in one ZIP file.
import { ResultPrintCtx, buildReportCardsHTML } from './resultPrint';
import { fitLongNames } from './fitText';
import { buildCardPageHTML, renderCardCanvas, canvasToBlob, safeFileName, CARD_W_PX, CARD_H_PX } from './cardExport';
import { createZip, ZipEntry } from './zipStore';
import { exportFileBlob } from './nativeFileExport';
import { PRINT_SIZES } from './helpers';

const nextFrame = () => new Promise<void>(r => requestAnimationFrame(() => r()));

async function waitForPage(doc: Document) {
  if (doc.fonts && doc.fonts.ready) {
    try { await doc.fonts.ready; } catch { /* ignore */ }
  }
  const imgs = Array.from(doc.images);
  await Promise.all(
    imgs.map(img => (img.complete ? Promise.resolve() : new Promise<void>(res => { img.onload = () => res(); img.onerror = () => res(); })))
  );
  await nextFrame();
  await nextFrame();
}

/** File name for one card: roll number first, then the student's name. */
function cardFileName(roll: string, name: string, used: Set<string>): string {
  const base = safeFileName(`${roll ? 'Roll ' + roll + ' - ' : ''}${name || 'Student'}`);
  let n = base, i = 2;
  while (used.has(n.toLowerCase())) n = `${base} (${i++})`;
  used.add(n.toLowerCase());
  return n + '.png';
}

export async function exportReportCardsZip(
  ctx: ResultPrintCtx,
  onProgress: (done: number, total: number) => void,
  isCancelled: () => boolean
): Promise<{ ok: boolean; count: number; cancelled?: boolean }> {
  const items = ctx.ranked;
  const total = items.length;
  if (!total) return { ok: false, count: 0 };
  const mult = (PRINT_SIZES[ctx.data.printSize] || PRINT_SIZES.m).mult;

  const iframe = document.createElement('iframe');
  iframe.style.cssText = `position:fixed;left:-9999px;top:0;width:${CARD_W_PX}px;height:${CARD_H_PX}px;border:0;visibility:hidden;pointer-events:none;`;
  document.body.appendChild(iframe);

  const files: ZipEntry[] = [];
  const used = new Set<string>();
  try {
    const doc = iframe.contentDocument;
    if (!doc) throw new Error('not ready');
    for (let i = 0; i < total; i++) {
      if (isCancelled()) return { ok: false, count: files.length, cancelled: true };
      onProgress(i, total);
      const { s } = items[i];
      const html = await fitLongNames(buildReportCardsHTML(ctx, s.id));
      doc.open();
      doc.write(buildCardPageHTML(html, mult));
      doc.close();
      await waitForPage(doc);
      const canvas = await renderCardCanvas(doc, 2, CARD_W_PX, CARD_H_PX);
      const blob = await canvasToBlob(canvas, 'image/png');
      files.push({ name: cardFileName(s.rollNo || '', s.name || '', used), data: new Uint8Array(await blob.arrayBuffer()) });
      canvas.width = canvas.height = 0; // free memory before the next card
    }
    onProgress(total, total);
  } finally {
    document.body.removeChild(iframe);
  }

  const zip = createZip(files);
  const zipName = safeFileName(`${ctx.data.className || 'Class'} - ${ctx.asmt.name} - Result Cards`) + '.zip';
  const ok = await exportFileBlob(zip, zipName, { title: `${ctx.asmt.name} result cards`, dialogTitle: 'Save or share the result cards' });
  return { ok, count: files.length };
}

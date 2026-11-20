// Android's print window lays pages out at its own scale, so full-page cards came out half a page tall.
// Pictures do not have that problem: each result card is drawn the same way as "Share as Image",
// then printed as a picture that is sized by the page width only.
import { Printer } from '@capgo/capacitor-printer';
import { fitLongNames } from './fitText';
import { buildCardPageHTML, renderCardCanvas, CARD_W_PX, CARD_H_PX } from './cardExport';

const PAD = 46;                        // 12 mm page padding in the card page, in px
const CROP_W = CARD_W_PX - 2 * PAD;    // 702
const CROP_H = CARD_H_PX - 2 * PAD;    // 1031

const nextFrame = () => new Promise<void>(r => requestAnimationFrame(() => r()));

async function waitForPage(doc: Document) {
  if (doc.fonts && doc.fonts.ready) { try { await doc.fonts.ready; } catch { /* ignore */ } }
  await Promise.all(Array.from(doc.images).map(img => (img.complete ? Promise.resolve() : new Promise<void>(res => { img.onload = () => res(); img.onerror = () => res(); }))));
  await nextFrame();
  await nextFrame();
}

export function isCardContent(html: string): boolean {
  return html.includes('ps2-card');
}

/** Prints every card in `contentHTML` as one picture per page. Returns false if anything fails (caller falls back). */
export async function printCardsAsImages(contentHTML: string, mult: number, docTitle: string): Promise<boolean> {
  const holder = new DOMParser().parseFromString(`<body>${contentHTML}</body>`, 'text/html');
  const cards = Array.from(holder.body.children).filter(el => el.classList.contains('print-sheet')) as HTMLElement[];
  if (!cards.length) return false;

  const iframe = document.createElement('iframe');
  iframe.style.cssText = `position:fixed;left:-9999px;top:0;width:${CARD_W_PX}px;height:${CARD_H_PX}px;border:0;visibility:hidden;pointer-events:none;`;
  document.body.appendChild(iframe);
  const pages: string[] = [];
  try {
    const doc = iframe.contentDocument;
    if (!doc) return false;
    for (const card of cards) {
      const html = await fitLongNames(card.outerHTML);
      doc.open();
      doc.write(buildCardPageHTML(html, mult));
      doc.close();
      await waitForPage(doc);
      const full = await renderCardCanvas(doc, 1.5, CARD_W_PX, CARD_H_PX);
      const k = full.width / CARD_W_PX;
      const crop = document.createElement('canvas');
      crop.width = Math.round(CROP_W * k);
      crop.height = Math.round(CROP_H * k);
      const cx = crop.getContext('2d');
      if (!cx) return false;
      cx.fillStyle = '#fff';
      cx.fillRect(0, 0, crop.width, crop.height);
      cx.drawImage(full, PAD * k, PAD * k, CROP_W * k, CROP_H * k, 0, 0, crop.width, crop.height);
      pages.push(crop.toDataURL('image/jpeg', 0.9));
      full.width = full.height = crop.width = crop.height = 0; // free memory
    }
  } catch {
    return false;
  } finally {
    document.body.removeChild(iframe);
  }

  const imgs = pages.map((src, i) => `<div class="pg${i === pages.length - 1 ? ' last' : ''}"><img src="${src}"></div>`).join('');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${docTitle.replace(/[<>&]/g, '')}</title><style>
@page{size:A4 portrait;margin:0}
html,body{margin:0;padding:0;background:#fff}
.pg{width:100%;text-align:center;page-break-after:always;break-after:page}
.pg.last{page-break-after:auto;break-after:auto}
.pg img{display:block;margin:0 auto;width:82%;height:auto}
</style></head><body>${imgs}</body></html>`;
  try {
    await Printer.printHtml({ name: docTitle, html });
    return true;
  } catch {
    return false;
  }
}

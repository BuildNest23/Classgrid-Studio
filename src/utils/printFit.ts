import { PrintSizeKey } from '../types';
import { PRINT_SIZES } from './helpers';
import { buildStandalonePrintHTML } from './printEngine';

export type Orientation = 'portrait' | 'landscape';

export const SIZE_ORDER: PrintSizeKey[] = ['xl', 'l', 'm', 's', 'xs'];
// Auto-fit never goes bigger than this by itself (people can still pick bigger by hand).
const AUTO_MAX_SIZE: PrintSizeKey = 'l';

const mmToPx = (mm: number) => (mm * 96) / 25.4;

/** A4 page and the margins the app prints with (same numbers as printEngine). */
export function pageGeometry(o: Orientation) {
  const w = o === 'landscape' ? 297 : 210;
  const h = o === 'landscape' ? 210 : 297;
  const m = o === 'landscape' ? 10 : 12;
  return {
    pageW: mmToPx(w),
    pageH: mmToPx(h),
    margin: mmToPx(m),
    printW: mmToPx(w - 2 * m),
    printH: mmToPx(h - 2 * m),
  };
}

// A page is treated as a little shorter than it really is, so a table that only just fits on
// screen is not promised to fit on paper.
const SAFETY = 0.97;

export interface Measured {
  pages: number;
  heightPx: number; // total content height at the printable width
  overflowCells: number; // number of cells/tables overflowing horizontally
}

/**
 * Lays the sheet out in a hidden iframe at the real printable width and counts pages + horizontal overflows.
 * One iframe is reused for every size/orientation tried.
 */
export class FitMeasurer {
  private iframe: HTMLIFrameElement | null = null;
  private lastHtml = '';

  constructor(
    private contentHTML: string,
    private title = 'Print',
    private htmlProvider?: (orientation: Orientation, size: PrintSizeKey) => string
  ) {}

  private async ensure(orientation: Orientation, size: PrintSizeKey, mult: number): Promise<Document | null> {
    const g = pageGeometry(orientation);
    const desiredHtml = this.htmlProvider ? this.htmlProvider(orientation, size) : this.contentHTML;
    if (!this.iframe) {
      const f = document.createElement('iframe');
      f.style.cssText = `position:fixed;left:-9999px;top:0;border:0;visibility:hidden;pointer-events:none;`;
      document.body.appendChild(f);
      this.iframe = f;
    }
    const doc = this.iframe.contentDocument;
    if (!doc) return null;
    if (desiredHtml !== this.lastHtml) {
      this.lastHtml = desiredHtml;
      doc.open();
      doc.write(buildStandalonePrintHTML(desiredHtml, mult, orientation, false, this.title));
      doc.close();
      try { if (doc.fonts?.ready) await doc.fonts.ready; } catch { /* ignore */ }
    }
    this.iframe.style.width = `${g.printW}px`;
    this.iframe.style.height = `${g.printH}px`; // one page tall: sheets with a full-page min-height count as one page
    doc.getElementById('printArea')?.style.setProperty('--mult', String(mult));
    await new Promise<void>(r => requestAnimationFrame(() => r()));
    return doc;
  }

  async measure(size: PrintSizeKey, orientation: Orientation): Promise<Measured> {
    const mult = (PRINT_SIZES[size] || PRINT_SIZES.m).mult;
    const doc = await this.ensure(orientation, size, mult);
    if (!doc) return { pages: 1, heightPx: 0, overflowCells: 0 };
    const g = pageGeometry(orientation);
    const effH = g.printH * SAFETY;
    const sheets = Array.from(doc.querySelectorAll<HTMLElement>('.print-sheet'));
    let pages = 0;
    if (sheets.length) {
      for (const sh of sheets) pages += Math.max(1, Math.ceil(sh.getBoundingClientRect().height / effH));
    } else {
      pages = Math.max(1, Math.ceil(doc.documentElement.scrollHeight / effH));
    }

    // Count any table cells whose content spills horizontally beyond their box
    let overflowCells = 0;
    const cells = Array.from(doc.querySelectorAll<HTMLElement>('.print-sheet td, .print-sheet th'));
    for (const c of cells) {
      if (c.clientWidth > 0 && c.scrollWidth > c.clientWidth + 1.5) {
        overflowCells++;
      }
    }

    return { pages, heightPx: doc.documentElement.scrollHeight, overflowCells };
  }

  dispose() {
    if (this.iframe) {
      this.iframe.remove();
      this.iframe = null;
    }
  }
}

export interface FitChoice {
  orientation: Orientation;
  size: PrintSizeKey;
  pages: number;
  overflowCells: number;
}

/**
 * Picks a layout with ZERO horizontal cell overflow first (when possible), then the FEWEST pages;
 * among those, the sheet's natural orientation, then the largest readable text.
 * A locked orientation (set in Settings) is never changed.
 */
export async function autoFit(
  m: FitMeasurer,
  naturalOrientation: Orientation,
  lockedOrientation: Orientation | ''
): Promise<FitChoice> {
  const orientations: Orientation[] = lockedOrientation
    ? [lockedOrientation]
    : [naturalOrientation, naturalOrientation === 'portrait' ? 'landscape' : 'portrait'];
  const sizes = SIZE_ORDER.slice(SIZE_ORDER.indexOf(AUTO_MAX_SIZE));

  const tried: FitChoice[] = [];
  for (const o of orientations) {
    for (const s of sizes) {
      const r = await m.measure(s, o);
      tried.push({ orientation: o, size: s, pages: r.pages, overflowCells: r.overflowCells });
    }
  }

  // Prefer layouts with minimum horizontal overflow (ideally 0) first
  const minOverflow = Math.min(...tried.map(t => t.overflowCells));
  const clean = tried.filter(t => t.overflowCells === minOverflow);
  const bestPages = Math.min(...clean.map(t => t.pages));
  const winners = clean.filter(t => t.pages === bestPages);
  // `tried` is already ordered natural-orientation first, largest size first
  return winners[0];
}

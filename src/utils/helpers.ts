import { Student, PrintSizeKey } from '../types';

export function newId(): string {
  return "s_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

export function newAssessId(): string {
  return "asmt_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

export function newAssessSubId(): string {
  return "asub_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

export function newFundId(): string {
  return "fund_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

export function ordinal(n: number | string): string {
  const num = Number(n);
  if (!num || num <= 0 || !isFinite(num)) return "—";
  const mod100 = num % 100;
  if (mod100 >= 11 && mod100 <= 13) return num + "th";
  switch (num % 10) {
    case 1: return num + "st";
    case 2: return num + "nd";
    case 3: return num + "rd";
    default: return num + "th";
  }
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function todayKey(): string {
  return dateKey(new Date());
}

export function parseKey(key: string): Date {
  const parts = key.split("-").map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2] || 1);
}

export function getMonthDays(year: number, month: number): string[] {
  const n = new Date(year, month + 1, 0).getDate();
  const out: string[] = [];
  for (let d = 1; d <= n; d++) {
    out.push(`${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  return out;
}

export function prettyDate(key: string): string {
  if (!key) return "—";
  try {
    return parseKey(key).toLocaleDateString(undefined, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    });
  } catch {
    return key;
  }
}

export function prettyMonth(monthKey: string): string {
  if (!monthKey) return "—";
  try {
    const parts = monthKey.split("-").map(Number);
    return new Date(parts[0], parts[1] - 1, 1).toLocaleDateString(undefined, {
      month: "long",
      year: "numeric"
    });
  } catch {
    return monthKey;
  }
}

export function prettyShortDate(key: string): string {
  if (!key) return "—";
  try {
    return parseKey(key).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric"
    });
  } catch {
    return key;
  }
}

export function fmtMoney(n: number | string | undefined | null): string {
  const val = Number(n) || 0;
  return "Rs " + val.toLocaleString("en-PK");
}

export function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 0) return "just now";
  const s = Math.floor(diff / 1000);
  if (s < 10) return "just now";
  if (s < 60) return s + " seconds ago";
  const m = Math.floor(s / 60);
  if (m < 60) return m + (m === 1 ? " minute ago" : " minutes ago");
  const h = Math.floor(m / 60);
  if (h < 24) return h + (h === 1 ? " hour ago" : " hours ago");
  const d = Math.floor(h / 24);
  if (d < 30) return d + (d === 1 ? " day ago" : " days ago");
  return new Date(ms).toLocaleDateString();
}

export function esc(s: string | number | undefined | null): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export function getSortedStudents(students: Student[]): Student[] {
  // Blank roll numbers go last (an empty string would otherwise sort first).
  return students.slice().sort((a, b) => {
    const ab = !String(a.rollNo || "").trim();
    const bb = !String(b.rollNo || "").trim();
    if (ab || bb) return ab === bb ? 0 : ab ? 1 : -1;
    return String(a.rollNo).localeCompare(String(b.rollNo), undefined, { numeric: true });
  });
}

export const PRINT_SIZES: Record<PrintSizeKey, { mult: number; label: string }> = {
  xs: { mult: 0.70, label: "Extra Small (most compact)" },
  s:  { mult: 0.85, label: "Small" },
  m:  { mult: 1.0,  label: "Medium (default)" },
  l:  { mult: 1.18, label: "Large" },
  xl: { mult: 1.35, label: "Extra Large (biggest)" }
};

export const TBL_SIZES = [
  { fs: 10, pad: 3, inp: 11, label: "Extra Small" },
  { fs: 11.5, pad: 5, inp: 12, label: "Small" },
  { fs: 12.5, pad: 7, inp: 13.5, label: "Medium" },
  { fs: 14, pad: 9, inp: 15, label: "Large" },
  { fs: 15.5, pad: 11, inp: 16.5, label: "Extra Large" }
];

// Exact rendered text width in pixels (offscreen canvas, created once and reused).
let _measureCtx: CanvasRenderingContext2D | null = null;
const TABLE_FONT_FAMILY = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

function getTextWidth(text: string, font: string = `600 12px ${TABLE_FONT_FAMILY}`): number {
  if (!_measureCtx) {
    const canvas = document.createElement('canvas');
    _measureCtx = canvas.getContext('2d');
  }
  if (!_measureCtx) return text.length * 7.5; // safe fallback if canvas is unavailable
  _measureCtx.font = font;
  return _measureCtx.measureText(text).width;
}

// Snug width for the sticky Name column: longest text + 16px cell padding + 2px borders.
export function getNameColWidth(names: string[], extraLabels: string[] = []): number {
  const NAME_FONT = `600 12px ${TABLE_FONT_FAMILY}`;
  const BOLD_FONT = `700 12px ${TABLE_FONT_FAMILY}`;
  let widest = getTextWidth('Name', BOLD_FONT);
  for (const n of names) {
    widest = Math.max(widest, getTextWidth((n || '(no name)').trim() || '(no name)', NAME_FONT));
  }
  for (const l of extraLabels) {
    widest = Math.max(widest, getTextWidth(l, BOLD_FONT));
  }
  return Math.min(230, Math.ceil(widest + 18));
}

// Snug width (as a % of the printable table width) for the Name column in printed tables.
// Measures the longest name at the real print font size, so no space is wasted and names do not wrap.
export function getPrintNameColPct(
  names: string[],
  fontPt: number,
  printSize: PrintSizeKey = 'm',
  forceOrientation: string = '',
  headerLabel: string = 'Name'
): number {
  const mult = (PRINT_SIZES[printSize] || PRINT_SIZES.m).mult;
  const fontPx = fontPt * mult * 96 / 72;
  const family = TABLE_FONT_FAMILY;
  let widestPx = getTextWidth(headerLabel, `700 ${fontPx}px ${family}`);
  for (const n of names) {
    const t = (n || '—').trim() || '—';
    widestPx = Math.max(widestPx, getTextWidth(t, `400 ${fontPx}px ${family}`));
  }
  const textMm = widestPx * 25.4 / 96;
  // Column widths are content-box (padding + border are added on top), so only a small safety slack is needed
  const totalMm = textMm + 1.2;
  const pageMm = forceOrientation === 'landscape' ? 277 : 186;
  const pct = (totalMm / pageMm) * 100;
  return Math.round(Math.min(38, Math.max(8, pct)) * 10) / 10;
}

// Plans the Class Result Sheet layout so every subject heading fits its column.
// Steps: (1) shrink the heading font a little, (2) if still too tight, switch to landscape
// (only when the user has not forced an orientation in Settings).
export function planResultPrintLayout(
  studentNames: string[],
  subjectNames: string[],
  printSize: PrintSizeKey = 'm',
  forceOrientation: string = ''
): { orientation: 'portrait' | 'landscape'; namePct: number; headFontPt: number } {
  const mult = (PRINT_SIZES[printSize] || PRINT_SIZES.m).mult;
  const FIXED_PCT = 6 + 7 + 7 + 8 + 6; // Roll, Total, %, Result, Rank
  const orders: Array<'portrait' | 'landscape'> =
    forceOrientation === 'landscape' ? ['landscape'] :
    forceOrientation === 'portrait' ? ['portrait'] : ['portrait', 'landscape'];
  const n = Math.max(1, subjectNames.length);

  let last = { orientation: orders[0], namePct: 20, headFontPt: 6 };
  for (const orientation of orders) {
    const pageMm = orientation === 'landscape' ? 277 : 186;
    const namePct = getPrintNameColPct(studentNames, 8, printSize, orientation);
    // Every column is content-box: padding (0.8mm each side, scaled) + border are added on top of its width.
    const overheadMm = 1.6 * mult + 0.6;
    const subjTotalMm = (pageMm * (100 - FIXED_PCT - namePct) / 100 - 6 * overheadMm) / n;
    const subjMm = subjTotalMm - overheadMm - 0.6; // inner text space with a little slack
    for (let fs = 7.5; fs >= 6; fs -= 0.5) {
      const px = fs * mult * 96 / 72;
      let longest = 0;
      for (const nm of subjectNames) {
        for (const word of String(nm || '').split(/\s+/)) {
          longest = Math.max(longest, getTextWidth(word, `700 ${px}px ${TABLE_FONT_FAMILY}`) * 25.4 / 96);
        }
      }
      if (longest <= subjMm) return { orientation, namePct, headFontPt: fs };
    }
    last = { orientation, namePct, headFontPt: 6 };
  }
  return last;
}

/**
 * Column-wise grid navigation for mark/amount entry.
 * - Enter (or the phone keyboard's action key) jumps to the next enabled box in the SAME column.
 * - Shift+Enter goes up. At the end of a column it moves on to the top of the next column.
 * Pair with gridTabIndex() so the phone keyboard's "Next" arrow also goes down the column.
 */
export function gridNavKeyDown(
  e: { key: string; shiftKey: boolean; preventDefault: () => void },
  attr: string,
  row: number,
  col: number,
  rows: number,
  cols: number = 1
) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const step = e.shiftKey ? -1 : 1;
  let r = row + step;
  let c = col;
  for (let guard = 0; guard < rows * cols + 2; guard++) {
    if (r >= rows) { r = 0; c++; }
    else if (r < 0) { r = rows - 1; c--; }
    if (c < 0 || c >= cols) break;
    const el = document.querySelector<HTMLInputElement>(`input[${attr}="${r}_${c}"]`);
    if (el && !el.disabled) {
      el.focus();
      try { el.select(); } catch { /* number inputs may not support select */ }
      return;
    }
    r += step;
  }
  (document.activeElement as HTMLElement | null)?.blur?.();
}

/** Tab order that runs down each column first (used by the mobile keyboard "Next" key). */
export function gridTabIndex(row: number, col: number, rows: number): number {
  return Math.min(32000, col * rows + row + 1);
}

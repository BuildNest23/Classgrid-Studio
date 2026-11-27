import { PrintSizeKey } from '../types';
import { getTextWidth, PRINT_SIZES, TABLE_FONT_FAMILY } from './helpers';
import { loadCapsPrint } from './capsPrint';

export type PrintColKind =
  | 'index'   // #, Roll #, Rank
  | 'code'    // Adm. No, Total, %
  | 'phone'   // Phone numbers (single-line preferred)
  | 'date'    // Dates (single-line preferred)
  | 'amount'  // Money / Paid / Owed (single-line preferred)
  | 'status'  // Status / Result badges
  | 'name'    // Student Name, Father Name
  | 'text';   // Address, Occupation, Notes, Remarks

export interface PrintColumnSpec {
  label: string;
  values: string[];
  kind: PrintColKind;
  /** Keep original case even when UPPERCASE print mode is on (e.g. Notes). */
  nocap?: boolean;
  /** Optional explicit minimum width in mm. */
  minMm?: number;
  /** Optional explicit maximum width in mm. */
  maxMm?: number;
}

export interface PrintTableLayoutOptions {
  fontPt?: number;
  headFontPt?: number;
  /** Combined left + right cell padding in mm at mult = 1 (default 3mm). */
  padXMm?: number;
  printSize?: PrintSizeKey;
  /** '' = auto-choose Portrait or Landscape; 'portrait' | 'landscape' = locked. */
  forceOrientation?: string;
  /** Override UPPERCASE setting (defaults to loadCapsPrint()). */
  caps?: boolean;
  /** Minimum column count before auto-switching to Landscape is allowed (default 5). */
  minColsForAutoLandscape?: number;
}

export interface PrintTableLayoutResult {
  orientation: 'portrait' | 'landscape';
  widthsPct: number[];
  widthsMm: number[];
  naturalMm: number[];
  isEmpty: boolean[];
  totalNaturalMm: number;
}

const PORTRAIT_PRINT_MM = 186;  // 210mm - 2 * 12mm
const LANDSCAPE_PRINT_MM = 277; // 297mm - 2 * 10mm

const pxToMm = (px: number) => (px * 25.4) / 96;

function isBlankValue(v: string): boolean {
  const t = String(v ?? '').trim();
  return !t || t === '—' || t === '-' || t === '–';
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return sorted[idx];
}

function measureColumnMetrics(
  col: PrintColumnSpec,
  fontPx: number,
  headFontPx: number,
  padMm: number,
  caps: boolean,
  family: string
) {
  const applyCaps = caps && !col.nocap;
  const headerText = applyCaps ? col.label.toUpperCase() : col.label;
  const fullHeadMm = pxToMm(getTextWidth(headerText, `700 ${headFontPx}px ${family}`)) + padMm + 1.4;
  const headWords = headerText.split(/\s+/).filter(Boolean);
  const longestHeadWordMm =
    headWords.reduce((m, w) => Math.max(m, pxToMm(getTextWidth(w, `700 ${headFontPx}px ${family}`))), 0) +
    padMm +
    1.2;

  const nonBlank = col.values.map(v => String(v ?? '').trim()).filter(v => !isBlankValue(v));
  const empty = nonBlank.length === 0;

  if (empty) {
    // Compact header-snug width: keeps header readable without wasting space on dashes
    const compact = Math.max(col.minMm ?? 0, Math.min(fullHeadMm, Math.max(longestHeadWordMm, fullHeadMm * 0.85)), 9.5);
    return {
      empty: true,
      minMm: Math.max(8, Math.min(compact, longestHeadWordMm)),
      naturalMm: compact,
      maxMm: col.maxMm ?? Math.max(compact + 2, 16),
      flexWeight: 0,
      singleLine: true,
    };
  }

  const valWidthsMm: number[] = [];
  let longestWordMm = 0;

  const fontWeight = col.kind === 'index' || col.kind === 'status' ? 700 : 400;
  const valFont = `${fontWeight} ${fontPx}px ${family}`;

  for (const raw of nonBlank) {
    const txt = applyCaps ? raw.toUpperCase() : raw;
    const wMm = pxToMm(getTextWidth(txt, valFont)) + padMm + 1.4;
    valWidthsMm.push(wMm);
    for (const part of txt.split(/\s+/)) {
      if (!part) continue;
      const pw = pxToMm(getTextWidth(part, valFont)) + padMm + 1.2;
      if (pw > longestWordMm) longestWordMm = pw;
    }
  }

  valWidthsMm.sort((a, b) => a - b);
  const maxValMm = valWidthsMm[valWidthsMm.length - 1] || fullHeadMm;
  const p90Mm = percentile(valWidthsMm, 0.9);
  const p75Mm = percentile(valWidthsMm, 0.75);

  const singleLine =
    col.kind === 'index' ||
    col.kind === 'code' ||
    col.kind === 'phone' ||
    col.kind === 'date' ||
    col.kind === 'amount' ||
    col.kind === 'status';

  let minMm: number;
  let naturalMm: number;
  let maxMm: number;
  let flexWeight: number;

  switch (col.kind) {
    case 'index': {
      const cap = 18;
      naturalMm = Math.max(fullHeadMm, Math.min(maxValMm, cap));
      minMm = Math.max(8.5, Math.min(naturalMm, Math.max(longestHeadWordMm, Math.min(maxValMm, 14))));
      maxMm = col.maxMm ?? 20;
      flexWeight = 0.05;
      break;
    }
    case 'code': {
      const cap = 32;
      naturalMm = Math.max(fullHeadMm, Math.min(maxValMm, cap));
      minMm = Math.max(10, Math.min(naturalMm, Math.max(longestHeadWordMm, Math.min(p90Mm, 26))));
      maxMm = col.maxMm ?? 34;
      flexWeight = 0.12;
      break;
    }
    case 'phone': {
      // Never starve phone numbers: reserve exact measured single-line width up to 36mm
      const cap = 36;
      naturalMm = Math.max(fullHeadMm, Math.min(maxValMm + 0.8, cap));
      minMm = Math.max(fullHeadMm, Math.min(maxValMm, 30));
      maxMm = col.maxMm ?? 38;
      flexWeight = 0.15;
      break;
    }
    case 'date': {
      const cap = 28;
      naturalMm = Math.max(fullHeadMm, Math.min(maxValMm + 0.5, cap));
      minMm = Math.max(fullHeadMm, Math.min(maxValMm, 24));
      maxMm = col.maxMm ?? 30;
      flexWeight = 0.1;
      break;
    }
    case 'amount': {
      const cap = 28;
      naturalMm = Math.max(fullHeadMm, Math.min(maxValMm + 0.5, cap));
      minMm = Math.max(longestHeadWordMm, Math.min(maxValMm, 22));
      maxMm = col.maxMm ?? 30;
      flexWeight = 0.12;
      break;
    }
    case 'status': {
      const cap = 34;
      naturalMm = Math.max(fullHeadMm, Math.min(maxValMm + 1.0, cap));
      minMm = Math.max(longestHeadWordMm, Math.min(longestWordMm, 26), 14);
      maxMm = col.maxMm ?? 36;
      flexWeight = 0.15;
      break;
    }
    case 'name': {
      // Names look cleanest on one line; let long names breathe while preventing extreme bloat
      const desired = Math.max(fullHeadMm, Math.min(maxValMm, 62));
      naturalMm = Math.max(desired, Math.min(p90Mm + 2, 54));
      minMm = Math.max(longestHeadWordMm, Math.min(longestWordMm, 30), Math.min(p75Mm * 0.85, 32), 20);
      maxMm = col.maxMm ?? 78;
      flexWeight = 1.25;
      break;
    }
    case 'text':
    default: {
      // Multi-line wrapping text (Address, Occupation, Notes):
      // Short values fit on 1 line; longer values aim for neat 1-2 line wraps without breaking words.
      const twoLineTarget = Math.max(p90Mm * 0.62, maxValMm * 0.52);
      const target = maxValMm <= 34 ? maxValMm : Math.max(longestWordMm, twoLineTarget);
      naturalMm = Math.max(fullHeadMm, Math.min(target, 56));
      minMm = Math.max(longestHeadWordMm, Math.min(longestWordMm, 28), 15);
      maxMm = col.maxMm ?? 76;
      flexWeight = 1.0;
      break;
    }
  }

  if (col.minMm !== undefined) minMm = Math.max(minMm, col.minMm);
  if (col.maxMm !== undefined) {
    maxMm = col.maxMm;
    naturalMm = Math.min(naturalMm, maxMm);
    minMm = Math.min(minMm, maxMm);
  }
  if (naturalMm < minMm) naturalMm = minMm;

  return { empty: false, minMm, naturalMm, maxMm, flexWeight, singleLine };
}

/**
 * Distributes a given printable width (in mm) across measured columns so they sum exactly
 * to targetMm while keeping empty columns compact, single-line codes/phones unbroken,
 * and flexible text columns balanced by content.
 */
function distributeMm(
  metrics: ReturnType<typeof measureColumnMetrics>[],
  targetMm: number
): number[] {
  const widths = metrics.map(m => m.naturalMm);
  const sumNatural = widths.reduce((a, b) => a + b, 0);

  if (Math.abs(sumNatural - targetMm) < 0.05) {
    return widths;
  }

  if (sumNatural < targetMm) {
    // Surplus space: distribute preferentially to non-empty flexible columns (name/text),
    // respecting maxMm caps first, then gently across remaining non-empty columns if still spare.
    let extra = targetMm - sumNatural;

    const giveTo = (indices: number[], respectMax: boolean) => {
      for (let pass = 0; pass < 4 && extra > 0.05; pass++) {
        const active = indices.filter(i => !respectMax || widths[i] < metrics[i].maxMm - 0.05);
        if (!active.length) break;
        const totalW = active.reduce((s, i) => s + (metrics[i].flexWeight || 0.2), 0);
        let used = 0;
        for (const i of active) {
          const share = (extra * (metrics[i].flexWeight || 0.2)) / totalW;
          const cap = respectMax ? Math.max(0, metrics[i].maxMm - widths[i]) : share;
          const add = Math.min(share, cap);
          widths[i] += add;
          used += add;
        }
        extra -= used;
        if (used < 0.01) break;
      }
    };

    const flexNonEmpty = metrics
      .map((m, i) => (!m.empty && m.flexWeight >= 0.5 ? i : -1))
      .filter(i => i >= 0);
    const otherNonEmpty = metrics
      .map((m, i) => (!m.empty && m.flexWeight < 0.5 ? i : -1))
      .filter(i => i >= 0);
    const allIdx = metrics.map((_, i) => i);

    giveTo(flexNonEmpty, true);
    giveTo(flexNonEmpty, false);
    giveTo(otherNonEmpty, true);
    giveTo(allIdx, false);
    return widths;
  }

  // Tight fit (sumNatural > targetMm):
  // Step 1: Compress flexible text/name columns down toward minMm using their slack.
  // Step 2: Compress remaining non-empty columns toward minMm.
  // Step 3: If even sum(minMm) > targetMm, scale down carefully while protecting phone/code/index slightly more.
  let deficit = sumNatural - targetMm;

  const trimGroup = (indices: number[]) => {
    if (deficit <= 0.05) return;
    const totalSlack = indices.reduce((s, i) => s + Math.max(0, widths[i] - metrics[i].minMm), 0);
    if (totalSlack <= 0.01) return;
    const take = Math.min(deficit, totalSlack);
    for (const i of indices) {
      const slack = Math.max(0, widths[i] - metrics[i].minMm);
      if (slack > 0) {
        widths[i] -= (take * slack) / totalSlack;
      }
    }
    deficit -= take;
  };

  const flexIdx = metrics.map((m, i) => (!m.empty && !m.singleLine ? i : -1)).filter(i => i >= 0);
  const nonEmptySingleIdx = metrics.map((m, i) => (!m.empty && m.singleLine ? i : -1)).filter(i => i >= 0);
  const emptyIdx = metrics.map((m, i) => (m.empty ? i : -1)).filter(i => i >= 0);

  trimGroup(flexIdx);
  trimGroup(emptyIdx);
  trimGroup(nonEmptySingleIdx);

  if (deficit > 0.05) {
    // Still slightly over target (e.g. 8 columns forced into Portrait at Large text):
    // Compress proportionally above hard floor (7mm for empty/index, 11mm for others).
    const floors = metrics.map(m => (m.empty ? 7.5 : m.singleLine ? Math.min(m.minMm * 0.85, 22) : Math.min(m.minMm * 0.72, 18)));
    const totalFloorSlack = widths.reduce((s, w, i) => s + Math.max(0, w - floors[i]), 0);
    if (totalFloorSlack > 0.01) {
      const take = Math.min(deficit, totalFloorSlack);
      for (let i = 0; i < widths.length; i++) {
        const slack = Math.max(0, widths[i] - floors[i]);
        widths[i] -= (take * slack) / totalFloorSlack;
      }
      deficit -= take;
    }
    if (deficit > 0.05) {
      const curSum = widths.reduce((a, b) => a + b, 0);
      const factor = targetMm / Math.max(1, curSum);
      for (let i = 0; i < widths.length; i++) widths[i] *= factor;
    }
  }

  return widths;
}

/**
 * Computes content-aware column widths (percentages & mm) and recommends Portrait vs Landscape
 * for any tabular print sheet.
 */
export function computePrintTableLayout(
  columns: PrintColumnSpec[],
  options: PrintTableLayoutOptions = {}
): PrintTableLayoutResult {
  const {
    fontPt = 9.5,
    headFontPt = 8.5,
    padXMm = 3.0,
    printSize = 'm',
    forceOrientation = '',
    caps = loadCapsPrint(),
    minColsForAutoLandscape = 5,
  } = options;

  const mult = (PRINT_SIZES[printSize] || PRINT_SIZES.m).mult;
  const fontPx = (fontPt * mult * 96) / 72;
  const headFontPx = (headFontPt * mult * 96) / 72;
  const padMm = padXMm * mult + 0.5;

  const metrics = columns.map(col =>
    measureColumnMetrics(col, fontPx, headFontPx, padMm, caps, TABLE_FONT_FAMILY)
  );
  const totalNaturalMm = metrics.reduce((s, m) => s + m.naturalMm, 0);

  let orientation: 'portrait' | 'landscape';
  if (forceOrientation === 'portrait' || forceOrientation === 'landscape') {
    orientation = forceOrientation;
  } else if (columns.length >= minColsForAutoLandscape && totalNaturalMm > PORTRAIT_PRINT_MM * 1.03) {
    orientation = 'landscape';
  } else {
    orientation = 'portrait';
  }

  const targetMm = orientation === 'landscape' ? LANDSCAPE_PRINT_MM : PORTRAIT_PRINT_MM;
  const widthsMm = distributeMm(metrics, targetMm);
  const sumMm = widthsMm.reduce((a, b) => a + b, 0) || targetMm;

  // Round to 2 decimal places and adjust the widest column so total equals exactly 100.00%
  const widthsPct = widthsMm.map(w => Math.round((w / sumMm) * 10000) / 100);
  const pctSum = widthsPct.reduce((a, b) => a + b, 0);
  if (widthsPct.length > 0 && Math.abs(pctSum - 100) > 0.001) {
    let widestIdx = 0;
    for (let i = 1; i < widthsPct.length; i++) {
      if (widthsPct[i] > widthsPct[widestIdx]) widestIdx = i;
    }
    widthsPct[widestIdx] = Math.round((widthsPct[widestIdx] + (100 - pctSum)) * 100) / 100;
  }

  return {
    orientation,
    widthsPct,
    widthsMm,
    naturalMm: metrics.map(m => m.naturalMm),
    isEmpty: metrics.map(m => m.empty),
    totalNaturalMm,
  };
}

/**
 * Computes content-aware pixel column widths for Canvas PNG exports (Student List & Absentee Slip).
 * Keeps empty columns narrow and ensures phone/code/name/address columns fit comfortably.
 */
export function computeCanvasTableColWidths(
  columns: PrintColumnSpec[],
  fontPx: number,
  headFontPx: number,
  fontFamily: string,
  caps: boolean,
  minTableW = 760,
  maxTableW = 1380
): number[] {
  const padPx = 18;
  const mmPerPx = 25.4 / 96;
  const metrics = columns.map(col =>
    measureColumnMetrics(col, fontPx, headFontPx, padPx * mmPerPx, caps, fontFamily)
  );
  const naturalPx = metrics.map(m => Math.round((m.naturalMm / mmPerPx) * 1.04));
  const sumPx = naturalPx.reduce((a, b) => a + b, 0);
  const targetPx = Math.max(minTableW, Math.min(maxTableW, sumPx));
  const targetMm = targetPx * mmPerPx;
  const distMm = distributeMm(metrics, targetMm);
  return distMm.map(mm => Math.max(44, Math.round(mm / mmPerPx)));
}

import { PrintSizeKey } from '../types';
import { PRINT_SIZES } from './helpers';
import { Capacitor } from '@capacitor/core';
import { Printer } from '@capgo/capacitor-printer';
import { loadCapsPrint } from './capsPrint';
import { fitLongNames } from './fitText';

/**
 * Extracts a human-friendly document title from HTML content for the Android print job / default PDF file name.
 */
function extractDocumentTitle(contentHTML: string): string {
  try {
    // Prefer the real sheet title; the generic header emits "Class: … • Incharge: …" (.print-sub)
    // BEFORE .sheet-title, so a single alternation picked the subtitle as the job / PDF name.
    const titleMatch =
      contentHTML.match(/<(?:h1|div|span)[^>]*class="[^"]*(?:sheet-title|dt-title-main|ps2-title-bar|ps2-title|print-title)[^"]*"[^>]*>(.*?)<\/(?:h1|div|span)>/i) ||
      contentHTML.match(/<(?:h1|div|span)[^>]*class="[^"]*print-sub[^"]*"[^>]*>(.*?)<\/(?:h1|div|span)>/i) ||
      contentHTML.match(/<h1[^>]*>(.*?)<\/h1>/i);
    if (titleMatch && titleMatch[1]) {
      const stripped = titleMatch[1]
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
        .replace(/\s+/g, ' ')
        .trim();
      if (stripped && stripped.length <= 60) return stripped;
    }
  } catch {
    // fallback
  }
  return 'Classroom Document';
}

/**
 * Dynamic extraction of any @media print CSS rules already loaded in the document.
 */
function getDynamicPrintCss(): string {
  const out: string[] = [];
  try {
    if (typeof document !== 'undefined' && document.styleSheets) {
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          const rules = sheet.cssRules;
          if (!rules) continue;
          for (const rule of Array.from(rules)) {
            const r = rule as CSSRule & { type?: number; media?: MediaList; cssRules?: CSSRuleList; cssText?: string };
            if (r.type === 4 /* MEDIA */ && /print/i.test(r.media?.mediaText || '')) {
              if (r.cssRules) {
                for (const sub of Array.from(r.cssRules)) {
                  out.push(sub.cssText);
                }
              }
            }
          }
        } catch {
          // Ignore cross-origin stylesheet errors
        }
      }
    }
  } catch {
    // Ignore in non-browser context
  }
  return out.join('\n');
}

/**
 * Static baseline print stylesheet guaranteeing all classroom report layouts,
 * tables, headers, badges, and designs (Design A colour & Design B b&w)
 * render identically in off-screen Android WebViews.
 */
const BASE_PRINT_CSS = `
  *, *::before, *::after {
    box-sizing: border-box;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  html, body {
    margin: 0;
    padding: 0;
    width: 100%;
    height: auto !important;
    background: #FFFFFF !important;
    color: #000000 !important;
    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  }
  #printArea {
    display: block !important;
    width: 100% !important;
    height: auto !important;
    background: #FFFFFF !important;
    color: #000000 !important;
  }
  .print-sheet {
    background: #FFFFFF !important;
    color: #000000 !important;
    page-break-after: always;
    break-after: page;
  }
  .print-sheet:last-child {
    page-break-after: auto;
    break-after: auto;
  }
  .caps-on .print-sheet,
  .caps-on.cg-page .print-sheet,
  .caps-on.print-sheet {
    text-transform: uppercase;
  }
  .caps-on .print-sheet .cg-nocap,
  .caps-on.cg-page .print-sheet .cg-nocap,
  .caps-on.print-sheet .cg-nocap {
    text-transform: none;
  }
  .print-header-inner {
    display: flex !important;
    align-items: center !important;
    gap: 5mm !important;
    margin-bottom: 4mm !important;
  }
  .print-logo-slot {
    flex: 0 0 24mm !important;
    max-width: 24mm !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
  }
  .print-logo-slot img {
    max-height: 20mm !important;
    max-width: 24mm !important;
    display: block !important;
  }
  .print-logo-spacer {
    visibility: hidden !important;
  }
  .print-header-text {
    flex: 1 !important;
    text-align: center !important;
    min-width: 0 !important;
  }
  .print-sheet h1 {
    font-size: calc(19pt * var(--mult, 1));
    text-align: center;
    margin: 0 0 calc(2mm * var(--mult, 1));
    font-family: inherit;
    line-height: 1.2;
  }
  .print-sheet .print-sub {
    font-size: calc(10.5pt * var(--mult, 1));
    text-align: center;
    margin: 0 0 1mm;
    font-weight: 700;
  }
  .print-sheet .print-sub2 {
    font-size: calc(10pt * var(--mult, 1));
    text-align: center;
    margin: 0 0 2mm;
    font-weight: 600;
  }
  .print-sheet .sheet-title {
    font-size: calc(11pt * var(--mult, 1));
    text-align: center;
    margin: 2mm 0 4mm;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .print-sheet table {
    width: 100%;
    border-collapse: collapse !important;
    table-layout: fixed;
    border: 1.5px solid #000000 !important;
  }
  .print-sheet th, .print-sheet td {
    border: 1px solid #000000 !important;
    padding: calc(2mm * var(--mult, 1)) calc(1.5mm * var(--mult, 1));
    font-size: calc(9.5pt * var(--mult, 1));
    text-align: left;
    vertical-align: middle;
    color: #000000;
    background: #FFFFFF;
  }
  .print-sheet th {
    background: #E5E7EB;
    font-weight: 700;
    text-align: center;
    font-size: calc(8.5pt * var(--mult, 1));
  }
  .print-sheet td.center { text-align: center; }
  .print-sheet td.num { text-align: center; font-variant-numeric: tabular-nums; }
  .print-sheet td.fail { background: #FEE2E2 !important; }
  .print-sheet tr.row-fail td { background: #FEF2F2 !important; }

  /* Attendance Register Table */
  .print-sheet .reg-table th, .print-sheet .reg-table td {
    padding: calc(0.8mm * var(--mult, 1)) calc(0.3mm * var(--mult, 1));
    font-size: calc(7pt * var(--mult, 1));
    text-align: center;
  }
  .print-sheet .reg-table th { font-size: calc(6.5pt * var(--mult, 1)); }
  .print-sheet .reg-table td.left { text-align: left; padding-left: 1mm; }
  .print-sheet .reg-table td.a { background: #FEE2E2; font-weight: 700; }
  .print-sheet .reg-table td.l { background: #FEF3C7; font-weight: 700; }
  .print-sheet .reg-table td.h { background: #DBEAFE; }
  .print-sheet .reg-table td.empty { color: #9CA3AF; }
  .print-sheet .reg-table td.total-col { background: #F1F5F9; border-left: 1.2px solid #000000; }
  .print-sheet .no-absents { text-align: center; padding: 10mm 0; font-size: 13pt; font-weight: 700; }

  /* Results Table */
  .print-sheet .res-print th, .print-sheet .res-print td {
    padding: calc(1.4mm * var(--mult, 1)) calc(0.8mm * var(--mult, 1));
    font-size: calc(8pt * var(--mult, 1));
  }
  .print-sheet .res-print th { font-size: calc(7.5pt * var(--mult, 1)); }

  /* Funds Table */
  .print-sheet .fund-print th, .print-sheet .fund-print td {
    padding: calc(1.6mm * var(--mult, 1)) calc(0.8mm * var(--mult, 1));
    font-size: calc(9pt * var(--mult, 1));
    text-align: center;
  }
  .print-sheet .fund-print td.name { text-align: left; }
  .print-sheet .fund-print td.stat-paid { background: #DCFCE7; font-weight: 700; }
  .print-sheet .fund-print td.stat-partial { background: #FEF3C7; font-weight: 700; }
  .print-sheet .fund-print td.stat-pending { background: #FEE2E2; font-weight: 700; }
  .print-sheet .fund-print td.stat-exempt { background: #F1F5F9; color: #475569; }
  .print-sheet .fund-print td.amt-red { background: #FEE2E2; }
  .print-sheet .fund-print td.amt-green { background: #DCFCE7; }

  /* Absentee Slip */
  .absentee-slip-sheet th,
  .absentee-slip-sheet td {
    font-size: calc(13pt * var(--mult, 1)) !important;
    padding: calc(3mm * var(--mult, 1)) calc(1.5mm * var(--mult, 1)) !important;
    white-space: normal !important;
    overflow-wrap: anywhere !important;
    word-break: break-word !important;
  }
  .absentee-slip-sheet th { font-size: calc(12pt * var(--mult, 1)) !important; }

  /* Design A & B Modern Print Engine (ps2) */
  .ps2, .ps2 * {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    box-sizing: border-box;
  }
  .print-sheet.ps2 {
    display: flex;
    flex-direction: column;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
  }
  .print-sheet.ps2-port { min-height: calc(100vh - 2mm); }
  .print-sheet.ps2-land { min-height: calc(100vh - 2mm); }
  .print-sheet.ps2 .ps2-spacer { flex: 1 1 auto; min-height: 6mm; }
  .ps2 .ps2-rows { flex: 100 1 auto; display: flex; flex-direction: column; min-height: 0; }
  .ps2 .ps2-rows > table { flex: 1 1 auto; }
  .print-sheet.ps2 tr { break-inside: avoid; page-break-inside: avoid; }
  .ps2 .ps2-head { display: flex; align-items: center; gap: 5mm; margin-bottom: 3mm; }
  .ps2 .ps2-logo { flex: 0 0 22mm; width: 22mm; height: 22mm; display: flex; align-items: center; justify-content: center; }
  .ps2 .ps2-logo img { max-width: 22mm; max-height: 22mm; display: block; }
  .ps2 .ps2-logo-spacer { visibility: hidden; }
  .ps2 .ps2-head-text { flex: 1; min-width: 0; text-align: center; }
  .print-sheet.ps2 .ps2-head h1 { margin: 0 0 1.2mm; text-align: center; line-height: 1.15; }
  .print-sheet.ps2 .ps2-head-sub { margin: 0; text-align: center; }
  .ps2 .ps2-sigs { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8mm; margin-top: 8mm; }
  .ps2 .ps2-sigs > div { border-top: 0.3mm solid #000; padding-top: 1.6mm; text-align: center; font-size: calc(9pt * var(--mult, 1)); }
  .print-sheet.ps2 table { border: 0 !important; }
  .print-sheet.ps2 .ps2-table th, .print-sheet.ps2 .ps2-table td { font-size: calc(9pt * var(--mult, 1)); vertical-align: middle; }
  .print-sheet.ps2 .ps2-table td.name, .print-sheet.ps2 .ps2-table td.left, .print-sheet.ps2 .ps2-table th.left { text-align: left; }
  .print-sheet.ps2 .ps2-table td.num { text-align: center; }
  .ps2 .ps2-strong { font-weight: 800; }
  .ps2 .ps2-th-max { font-size: 6pt; font-weight: 600; }
  .ps2 .ps2-tag { display: inline-block; font-size: calc(7.5pt * var(--mult, 1)); font-weight: 800; letter-spacing: 0.06em; line-height: 1.2; }
  .ps2 .ps2-bar { height: 1.4mm; border-radius: 1mm; margin-top: 0.8mm; overflow: hidden; }
  .ps2 .ps2-bar i { display: block; height: 100%; }
  .ps2 .ps2-remarks-text { white-space: pre-wrap; overflow-wrap: anywhere; }

  /* Design A Colour */
  .ps2-a { color: #1c1917; }
  .ps2-a .ps2-logo { border-radius: 50%; }
  .ps2-a .ps2-logo-empty { border: 0.6mm solid #0b5d45; background: #e8f3ec; color: #0b5d45; font-size: 7pt; font-weight: 800; text-align: center; line-height: 1.25; }
  .ps2-a .ps2-logo img { border-radius: 50%; }
  .print-sheet.ps2-a .ps2-head h1 { color: #0b5d45; font-size: calc(21pt * var(--mult, 1)); font-weight: 800; }
  .print-sheet.ps2-a .ps2-head-sub { color: #3b3b4f; font-size: calc(9.5pt * var(--mult, 1)); font-weight: 700; }
  .ps2-a .ps2-title-bar { background: #0b5d45; color: #fff; text-align: center; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; font-size: calc(15pt * var(--mult, 1)); padding: 2.2mm 4mm; border-radius: 2.5mm; }
  .ps2-a .ps2-title-strip { background: #ffc72c; color: #0b5d45; text-align: center; font-weight: 800; text-transform: uppercase; font-size: calc(9.5pt * var(--mult, 1)); padding: 1.6mm 4mm; width: 72%; margin: 0 auto 4mm; border-radius: 0 0 3mm 3mm; }
  .ps2-a .ps2-info { display: flex; justify-content: space-between; gap: 4mm; background: #e8f3ec; border: 0.3mm solid #9fd0b6; border-radius: 2mm; padding: 1.8mm 3mm; margin-bottom: 4mm; color: #0b5d45; font-weight: 700; font-size: calc(8.5pt * var(--mult, 1)); }
  .print-sheet.ps2-a .ps2-table { border: 0.3mm solid #0b5d45 !important; }
  .print-sheet.ps2-a .ps2-table th { background: #0b5d45; color: #fff; border: 0.25mm solid #0b5d45 !important; font-weight: 700; text-align: center; padding: calc(2mm * var(--mult, 1)) calc(1mm * var(--mult, 1)); }
  .print-sheet.ps2-a .ps2-table td { background: #fff; color: #1c1917; border: 0.25mm solid #b9dbc9 !important; padding: calc(1.7mm * var(--mult, 1)) calc(1.2mm * var(--mult, 1)); }
  .print-sheet.ps2-a .ps2-table tbody tr:nth-child(even) td { background: #f2f8f4; }
  .print-sheet.ps2-a .ps2-table td.name { font-weight: 700; }
  .print-sheet.ps2-a .ps2-table td.ps2-failmark { color: #b91c1c; font-weight: 800; background: #feecec; }
  .ps2-a .ps2-tag { border-radius: 99px; padding: 0.4mm 2.6mm; }
  .ps2-a .ps2-pass { color: #166534; background: #dcfce7; border: 0.25mm solid #86d9a3; }
  .ps2-a .ps2-fail { color: #991b1b; background: #fee2e2; border: 0.25mm solid #f5a3a3; }
  .ps2-a .ps2-bar { background: #e3efe8; }
  .ps2-a .ps2-bar i { background: #2e9e73; }
  .ps2-a .ps2-medal { display: inline-block; width: 6mm; height: 6mm; line-height: 6mm; border-radius: 50%; color: #fff; font-weight: 800; font-size: calc(8pt * var(--mult, 1)); text-align: center; }
  .ps2-a .ps2-medal-1 { background: #d9a400; }
  .ps2-a .ps2-medal-2 { background: #8e949c; }
  .ps2-a .ps2-medal-3 { background: #b07035; }
  .ps2-a .ps2-sigs > div { font-weight: 700; }
  .ps2-a .ps2-foot { display: flex; justify-content: space-between; align-items: stretch; margin-top: 4mm; background: #0b5d45; color: #fff; border-radius: 2mm; overflow: hidden; font-size: calc(8pt * var(--mult, 1)); font-weight: 700; }
  .ps2-a .ps2-foot span { padding: 1.8mm 3mm; }
  .ps2-a .ps2-foot .ps2-foot-chip { margin-left: auto; background: #ffc72c; color: #0b5d45; padding: 1.8mm 4mm; }

  /* Report Card A */
  .print-sheet.ps2-card { height: calc(100vh - 2mm); min-height: 0; padding: 1.3mm; }
  .print-sheet.ps2-card .ps2-cardframe { flex: 1 1 auto; display: flex; flex-direction: column; padding: 5mm 6mm 4mm; }
  .print-sheet.ps2-a.ps2-card { border: 0.7mm solid #0b5d45; border-radius: 4mm; }
  .ps2-a .ps2-cardframe { border: 0.35mm solid #ffc72c; border-radius: 3mm; }
  .ps2-a .ps2-idbox { display: flex; align-items: center; gap: 5mm; background: #e8f3ec; border: 0.3mm solid #9fd0b6; border-radius: 3mm; padding: 3.5mm 5mm; margin-bottom: 4mm; }
  .ps2-a .ps2-avatar { flex: 0 0 13mm; width: 13mm; height: 13mm; line-height: 13mm; border-radius: 50%; background: #0b5d45; color: #fff; font-size: 18pt; font-weight: 800; text-align: center; }
  .ps2-a .ps2-idgrid { flex: 1; display: grid; grid-template-columns: 1fr 1fr; gap: 2mm 6mm; }
  .ps2-a .ps2-idgrid label { display: block; color: #4b6b5c; font-size: calc(8pt * var(--mult, 1)); font-weight: 600; }
  .ps2-a .ps2-idgrid b { font-size: calc(11pt * var(--mult, 1)); font-weight: 800; }
  .print-sheet.ps2-a .ps2-subtable td { padding: calc(var(--rc-pad, 2.6mm) * var(--mult, 1)) calc(2mm * var(--mult, 1)); font-size: calc(var(--rc-fs, 10pt) * var(--mult, 1)); text-align: center; }
  .print-sheet.ps2-a .ps2-subtable td.left { font-weight: 800; }
  .ps2-a .ps2-summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3mm; margin: 4mm 0; }
  .ps2-a .ps2-summary > div { border: 0.35mm solid #0b5d45; border-radius: 2.5mm; overflow: hidden; text-align: center; }
  .ps2-a .ps2-summary label { display: block; background: #0b5d45; color: #fff; font-size: calc(7.5pt * var(--mult, 1)); font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; padding: 1mm 0; }
  .ps2-a .ps2-summary b { display: block; padding: 3mm 1mm; font-size: calc(16pt * var(--mult, 1)); font-weight: 800; }
  .ps2-a .ps2-remarks { border: 0.3mm dashed #8cc3a8; border-radius: 3mm; padding: 3mm 4mm; min-height: var(--rc-remh, 28mm); font-size: calc(10pt * var(--mult, 1)); }
  .ps2-a .ps2-remarks label { display: block; color: #0b5d45; font-size: calc(8pt * var(--mult, 1)); font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 1.2mm; }

  /* Design B Black & White */
  .ps2-b { color: #000; }
  .print-sheet.ps2-b .ps2-head h1 { font-family: "Times New Roman", Times, Georgia, serif; font-weight: 700; font-size: calc(22pt * var(--mult, 1)); letter-spacing: 0.02em; color: #000; }
  .print-sheet.ps2-b .ps2-head-sub { font-size: calc(8.5pt * var(--mult, 1)); letter-spacing: 0.12em; text-transform: uppercase; color: #333; font-weight: 500; }
  .ps2-b .ps2-rule { border-top: 0.35mm solid #000; border-bottom: 0.35mm solid #000; height: 1.1mm; margin: 2mm 0 4mm; }
  .ps2-b .ps2-title { text-align: center; font-weight: 800; text-transform: uppercase; letter-spacing: 0.32em; font-size: calc(12.5pt * var(--mult, 1)); }
  .ps2-b .ps2-info { display: flex; justify-content: space-between; gap: 4mm; border-top: 0.25mm solid #000; border-bottom: 0.25mm solid #000; padding: 1.6mm 0.5mm; margin-bottom: 3mm; font-size: calc(8.5pt * var(--mult, 1)); }
  .print-sheet.ps2-b .ps2-table { border: 0 !important; border-top: 0.7mm solid #000 !important; border-bottom: 0.7mm solid #000 !important; }
  .print-sheet.ps2-b .ps2-table th { background: #fff; color: #000; border: 0 !important; border-bottom: 0.7mm solid #000 !important; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; text-align: center; padding: calc(2.4mm * var(--mult, 1)) calc(1mm * var(--mult, 1)); }
  .print-sheet.ps2-b .ps2-table td { background: #fff; color: #000; border: 0 !important; border-bottom: 0.2mm solid #bbb !important; padding: calc(1.9mm * var(--mult, 1)) calc(1.2mm * var(--mult, 1)); }
  .ps2-b .ps2-tag { padding: 0.3mm 2.4mm; }
  .ps2-b .ps2-pass { border: 0.3mm solid #000; color: #000; background: #fff; }
  .ps2-b .ps2-fail { border: 0.3mm solid #000; color: #fff; background: #000; }
  .ps2-b .ps2-summary { display: grid; grid-template-columns: repeat(4, 1fr); border: 0.7mm solid #000; margin: 5mm 0; }
  .ps2-b .ps2-summary > div { text-align: center; padding: 2.5mm 1mm; border-left: 0.3mm solid #000; }
  .ps2-b .ps2-summary > div:first-child { border-left: 0; }
  /* Report card B: boxed Name / Father Name / Roll No / Adm. No (same layout as A, black and white) */
  .ps2-b .ps2-idbox { display: flex; align-items: center; gap: 5mm; background: #fff; border: 0.3mm solid #000; border-radius: 3mm; padding: 3.5mm 5mm; margin-bottom: 4mm; }
  .ps2-b .ps2-avatar { flex: 0 0 13mm; width: 13mm; height: 13mm; line-height: 13mm; border-radius: 50%; background: #000; color: #fff; font-size: 18pt; font-weight: 800; text-align: center; }
  .ps2-b .ps2-idgrid { flex: 1; display: grid; grid-template-columns: 1fr 1fr; gap: 2mm 6mm; }
  .ps2-b .ps2-idgrid label { display: block; color: #444; font-size: calc(8pt * var(--mult, 1)); font-weight: 600; }
  .ps2-b .ps2-idgrid b { font-size: calc(11pt * var(--mult, 1)); font-weight: 800; color: #000; }
  .ps2-b .ps2-remarks { border: 0.3mm solid #000; padding: 3mm 4mm; min-height: var(--rc-remh, 28mm); }

  .print-sheet.ps2 .ps2-table th.name { text-align: left; padding-left: calc(1.2mm * var(--mult, 1)); }
`;

/**
 * Report cards embed the school logo (a base64 data URL, often several hundred KB) once PER STUDENT
 * (corner logo or watermark). A class of 40 therefore produces tens of MB of HTML, which is fine for
 * Chrome's print dialog (PWA) but overwhelms the Android bridge / print WebView and force-closes the app.
 * Here every repeated data-URL <img> is replaced by a tiny class, and each image is defined ONCE in CSS.
 */
function dedupeDataImages(html: string): { html: string; css: string } {
  const classes = new Map<string, string>();
  const imgRe = /(<img\b[^>]*?)\ssrc="(data:[^"]+)"/gi;
  const out = html.replace(imgRe, (_m, before: string, url: string) => {
    let cls = classes.get(url);
    if (!cls) {
      cls = `cg-img-${classes.size}`;
      classes.set(url, cls);
    }
    return `${before} data-cgimg="${cls}"`;
  });
  let css = '';
  classes.forEach((cls, url) => {
    css += `img[data-cgimg="${cls}"]{content:url("${url}");}\n`;
  });
  return { html: out, css };
}

/** The app's own print CSS + caps setting, for files that print outside the app (teacher form). */
export function getPrintStyleBundle(): { css: string; caps: boolean } {
  return { css: `${BASE_PRINT_CSS}\n${getDynamicPrintCss()}`, caps: loadCapsPrint() };
}

/**
 * Builds a standalone HTML page with embedded CSS styles for off-screen WebViews or native printers.
 */
export function buildStandalonePrintHTML(
  contentHTML: string,
  mult: number,
  orientation: 'portrait' | 'landscape',
  pageNumbers: boolean,
  docTitle: string
): string {
  const dynamicCss = getDynamicPrintCss();
  const deduped = dedupeDataImages(contentHTML);
  contentHTML = deduped.html;
  const imageCss = deduped.css;
  const pageMargin = orientation === 'landscape' ? '10mm' : '12mm';
  const pageNumCSS = pageNumbers
    ? ' @page { @bottom-center { content: "Page " counter(page) " of " counter(pages); font-size: 8pt; color: #555; font-family: Arial, sans-serif; } }'
    : '';

  const isCaps = loadCapsPrint();
  const capsClass = isCaps ? ' class="caps-on"' : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${docTitle}</title>
  <style>
    @page {
      size: A4 ${orientation};
      margin: ${pageMargin};
    }
    ${pageNumCSS}
    ${BASE_PRINT_CSS}
    ${dynamicCss}
    ${imageCss}
  </style>
</head>
<body>
  <div id="printArea"${capsClass} style="display:block; --mult:${mult};">
    ${contentHTML}
  </div>
</body>
</html>`;
}

/**
 * Master print function called by all views and components in the app.
 * Automatically delegates to @capgo/capacitor-printer when run inside Capacitor Android/iOS,
 * or standard browser window.print() on the web.
 *
 * Known Android limitation:
 * The Android system print dialog ignores `@page { size }`, so previews show Letter portrait
 * even for landscape documents. `@capgo/capacitor-printer`'s `printHtml` has no paper-size option.
 */
/** Shrinks a whole sheet evenly (text, rows and lines) so it fits on fewer pages. Layout stays the same, only smaller. */
export function wrapZoom(contentHTML: string, zoom: number, orientation: 'portrait' | 'landscape' = 'portrait'): string {
  if (!(zoom > 0) || zoom >= 0.999) return contentHTML;
  const z = Math.round(zoom * 1000) / 1000;
  // Fixed printable width (not a %), so every WebView/browser zoom model gives the same result:
  // the sheet keeps its normal layout width and is shown z times smaller, centred.
  const mm = orientation === 'landscape' ? 297 - 20 : 210 - 24;
  const px = Math.round(mm * 96 / 25.4);
  return `<div style="display:block;"><div style="zoom:${z};width:${px}px;margin:0 auto;">${contentHTML}</div></div>`;
}

export async function triggerPrint(
  contentHTML: string,
  orientation: 'portrait' | 'landscape' = 'portrait',
  printSize: PrintSizeKey = 'm',
  forceOrientation: string = '',
  pageNumbers: boolean = false,
  fitZoom: number = 1
): Promise<boolean> {
  const mult = (PRINT_SIZES[printSize] || PRINT_SIZES.m).mult;
  const finalOrientation = (forceOrientation || orientation || 'portrait') as 'portrait' | 'landscape';

  // Run long names auto-fit measurement pre-pass so names shrink instead of overflowing columns
  contentHTML = await fitLongNames(contentHTML);
  contentHTML = wrapZoom(contentHTML, fitZoom, finalOrientation);

  const docTitle = extractDocumentTitle(contentHTML);
  const isCaps = loadCapsPrint();

  // Native mobile runtime: Use Capacitor native print manager
  if (Capacitor.isNativePlatform()) {
    try {
      const fullHtml = buildStandalonePrintHTML(
        contentHTML,
        mult,
        finalOrientation,
        pageNumbers,
        docTitle
      );
      await Printer.printHtml({
        name: docTitle,
        html: fullHtml
      });
      return true;
    } catch (err) {
      console.warn('Native Printer.printHtml failed:', err);
      return false;
    }
  }

  // Web Browser / Standard Desktop pipeline
  const printArea = document.getElementById('printArea');
  if (!printArea) return false;

  printArea.style.setProperty('--mult', String(mult));
  printArea.innerHTML = contentHTML;
  printArea.style.display = 'block';
  if (isCaps) {
    printArea.classList.add('caps-on');
  } else {
    printArea.classList.remove('caps-on');
  }

  let styleEl = document.getElementById('printPageStyle') as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'printPageStyle';
    document.head.appendChild(styleEl);
  }

  const pageNumCSS = pageNumbers
    ? ' @page { @bottom-center { content: "Page " counter(page) " of " counter(pages); font-size: 8pt; color: #555; font-family: Arial, sans-serif; } }'
    : '';
  styleEl.textContent = (finalOrientation === 'landscape'
    ? '@page { size: A4 landscape; margin: 10mm; }'
    : '@page { size: A4 portrait; margin: 12mm; }') + pageNumCSS;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.print();
    });
  });
  return true;
}

/**
 * Clean up the web print DOM injection area after print completes or cancels.
 */
export function cleanupPrintArea() {
  const printArea = document.getElementById('printArea');
  if (printArea) {
    printArea.innerHTML = '';
    printArea.style.display = 'none';
    printArea.classList.remove('caps-on');
  }
}

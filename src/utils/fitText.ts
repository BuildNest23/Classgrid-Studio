import { loadCapsPrint } from './capsPrint';
import { pageGeometry, Orientation } from './printFit';

/**
 * Baseline print styles needed inside the off-screen measurement iframe
 * to ensure table columns, cell widths, and font sizes match the real printed document.
 */
function getIframeCss(): string {
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
            } else if (r.cssText) {
              out.push(r.cssText);
            }
          }
        } catch {
          // ignore cross-origin stylesheet errors
        }
      }
    }
  } catch {
    /* ignore */
  }
  return out.join('\n');
}

export interface FitLongNamesOptions {
  orientation?: Orientation;
  mult?: number;
}

/**
 * Measures all .cg-fit (1-2 line smart fit) and .cg-fit-line (single-line fit for phones/codes/dates)
 * spans inside an off-screen iframe rendered at the exact real printable page width and text scale.
 * Resets prior inline sizing first so re-running on orientation/size changes never double-shrinks text.
 */
export async function fitLongNames(html: string, opts?: FitLongNamesOptions): Promise<string> {
  if (typeof document === 'undefined' || !html || (!html.includes('cg-fit') && !html.includes('cg-fit-line'))) {
    return html;
  }

  const isFullDoc = /<!doctype/i.test(html) || /<html/i.test(html);
  const guessedLandscape = /class="[^"]*\b(?:ps2-land|reg-table|dt-sheet)\b/i.test(html);
  const orientation: Orientation = opts?.orientation ?? (guessedLandscape ? 'landscape' : 'portrait');
  const mult = opts?.mult ?? 1;
  const isReceipt = /class="fr\b/i.test(html);
  const capsOn = loadCapsPrint();

  // Exact printable page width at 96 dpi (with real A4 margins subtracted!)
  const widthPx = isReceipt ? 380 : Math.round(pageGeometry(orientation).printW);

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-9999px';
  iframe.style.top = '0';
  iframe.style.width = `${widthPx}px`;
  iframe.style.height = '1200px';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';

  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      return html;
    }

    if (isFullDoc) {
      let docHtml = html;
      if (capsOn && !docHtml.includes('caps-on')) {
        docHtml = docHtml.replace(/class="([^"]*cg-page[^"]*)"/i, 'class="$1 caps-on"');
        docHtml = docHtml.replace(/id="printArea"/i, 'id="printArea" class="caps-on"');
      }
      doc.open();
      doc.write(docHtml);
      doc.close();
      doc.getElementById('printArea')?.style.setProperty('--mult', String(mult));
    } else {
      const styles = getIframeCss();
      const wrapClass = capsOn ? 'caps-on' : '';
      const docHtml = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    ${styles}
    html, body { margin:0; padding:0; background:#fff; width:${widthPx}px; }
    .caps-on .print-sheet, .caps-on .fr { text-transform: uppercase; }
    .caps-on .print-sheet .cg-nocap, .caps-on .fr .cg-nocap { text-transform: none; }
  </style>
</head>
<body>
  <div id="cgFitRoot" class="${wrapClass}" style="width:${widthPx}px; --mult:${mult};">
    ${html}
  </div>
</body>
</html>`;
      doc.open();
      doc.write(docHtml);
      doc.close();
    }

    // Wait for web fonts and layout pass
    if (doc.fonts && doc.fonts.ready) {
      try {
        await doc.fonts.ready;
      } catch {
        /* ignore */
      }
    }
    await new Promise(r => requestAnimationFrame(r));

    const fitEls = Array.from(doc.querySelectorAll<HTMLElement>('.cg-fit, .cg-fit-line'));

    for (const el of fitEls) {
      // Clear any stale inline styles from a previous fit pass so we always measure from natural CSS size
      el.style.fontSize = '';
      el.style.display = '';
      el.style.whiteSpace = '';
      el.style.overflowWrap = '';
      el.style.wordBreak = '';

      const singleLineMode = el.classList.contains('cg-fit-line');
      const cell =
        (el.closest('td, th, .ps2-idgrid > div > b, .dt-field, .col-name, .name, .fr-stu-name') as HTMLElement) ||
        el.parentElement ||
        el;

      const compCell = doc.defaultView?.getComputedStyle(cell);
      const padLeft = parseFloat(compCell?.paddingLeft || '0') || 0;
      const padRight = parseFloat(compCell?.paddingRight || '0') || 0;
      const availWidth = Math.max(8, cell.clientWidth - padLeft - padRight - 0.5);

      const compEl = doc.defaultView?.getComputedStyle(el);
      const origPx = parseFloat(compEl?.fontSize || '12.66') || 12.66;
      const origPt = origPx * (72 / 96);

      // Measure on a single line first
      el.style.display = 'inline-block';
      el.style.whiteSpace = 'nowrap';

      const fitsOneLine = () =>
        el.scrollWidth <= availWidth + 0.5 && cell.scrollWidth <= cell.clientWidth + 0.5;

      if (fitsOneLine()) {
        el.style.display = '';
        el.style.whiteSpace = '';
        continue;
      }

      if (singleLineMode) {
        // Phone numbers, codes, dates, amounts, status badges: keep on 1 line by shrinking smoothly down to 62%
        const floorPt = Math.max(5.5, origPt * 0.62);
        let currPt = origPt;
        let ok = false;
        while (!ok && currPt > floorPt) {
          currPt = Math.max(floorPt, Math.round((currPt - 0.25) * 100) / 100);
          el.style.fontSize = `${currPt}pt`;
          ok = fitsOneLine();
        }
        if (!ok) {
          // Absolute last resort (e.g. 20-char string inside a tiny cell): wrap inside box so it never spills out
          el.style.whiteSpace = 'normal';
          el.style.overflowWrap = 'anywhere';
          el.style.wordBreak = 'break-word';
          el.style.fontSize = `${floorPt}pt`;
        }
        continue;
      }

      // Multi-line smart fit (.cg-fit): try wrapping cleanly onto 2 lines at original size first,
      // then shrink down to 68% in 0.25pt steps until it fits cleanly without overflowing the box.
      const floorPt = Math.max(5.8, origPt * 0.68);
      el.style.whiteSpace = 'normal';
      el.style.overflowWrap = 'normal';
      el.style.wordBreak = 'normal';
      const fitsTwoLines = () => {
        const px = parseFloat(doc.defaultView?.getComputedStyle(el).fontSize || '') || origPx;
        const lhRaw = parseFloat(doc.defaultView?.getComputedStyle(el).lineHeight || '');
        const lh = isFinite(lhRaw) && lhRaw > 0 ? lhRaw : px * 1.3;
        const lines = Math.ceil(el.getBoundingClientRect().height / lh - 0.15);
        return (
          lines <= 2 &&
          el.scrollWidth <= availWidth + 0.5 &&
          cell.scrollWidth <= cell.clientWidth + 0.5
        );
      };

      let ok = fitsTwoLines();
      let currPt = origPt;
      while (!ok && currPt > floorPt) {
        currPt = Math.max(floorPt, Math.round((currPt - 0.25) * 100) / 100);
        el.style.fontSize = `${currPt}pt`;
        ok = fitsTwoLines();
      }
      if (!ok) {
        // Last resort (a single very long unbroken word): allow breaking inside the word so nothing leaves the box
        el.style.overflowWrap = 'anywhere';
        el.style.wordBreak = 'break-word';
        el.style.fontSize = `${floorPt}pt`;
      }
    }

    let resultHtml = '';
    if (isFullDoc) {
      resultHtml = '<!doctype html>\n' + doc.documentElement.outerHTML;
    } else {
      const root = doc.getElementById('cgFitRoot');
      resultHtml = root ? root.innerHTML : html;
    }

    document.body.removeChild(iframe);
    return resultHtml;
  } catch (err) {
    console.warn('fitLongNames pre-pass error:', err);
    try {
      if (iframe.parentNode) document.body.removeChild(iframe);
    } catch {
      /* ignore */
    }
    return html;
  }
}

import { loadCapsPrint } from './capsPrint';

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

/**
 * Measures all .cg-fit spans within an off-screen iframe rendered at real page width.
 * For any span whose text would overflow its cell, reduces font-size in 0.25pt steps
 * down to 75% of original size until it fits. Bakes the result as an inline style.
 */
export async function fitLongNames(html: string): Promise<string> {
  if (typeof document === 'undefined' || !html || !html.includes('cg-fit')) {
    return html;
  }

  const isFullDoc = /<!doctype/i.test(html) || /<html/i.test(html);
  // Detect the page type from the builders' root/table class names only. Matching the whole HTML
  // (e.g. the word "fr" or "landscape" inside a name, remark, subject or note) picked the wrong
  // measuring width and shrank every name on the sheet.
  const isLandscape = /class="[^"]*\b(?:ps2-land|reg-table|dt-sheet)\b/i.test(html);
  const isReceipt = /class="fr\b/i.test(html);
  const capsOn = loadCapsPrint();

  // Page width at 96 dpi matching real print dimensions
  const widthPx = isReceipt ? 380 : (isLandscape ? 1123 : 794);

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
  <div id="cgFitRoot" class="${wrapClass}" style="width:${widthPx}px;">
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

    const fitEls = Array.from(doc.querySelectorAll<HTMLElement>('.cg-fit'));

    for (const el of fitEls) {
      const cell = el.closest('td, th, .ps2-idgrid > div > b, .dt-field, .col-name, .name, .fr-stu-name') as HTMLElement || el.parentElement || el;

      // Ensure inline-block and nowrap for measurement
      el.style.display = 'inline-block';
      el.style.whiteSpace = 'nowrap';

      const compCell = doc.defaultView?.getComputedStyle(cell);
      const padLeft = parseFloat(compCell?.paddingLeft || '0') || 0;
      const padRight = parseFloat(compCell?.paddingRight || '0') || 0;
      const availWidth = Math.max(10, cell.clientWidth - padLeft - padRight - 0.5);

      const compEl = doc.defaultView?.getComputedStyle(el);
      const origPx = parseFloat(compEl?.fontSize || '13.33') || 13.33;
      // 1 pt = 96 / 72 px => px * 72 / 96 = pt
      const origPt = origPx * (72 / 96);
      const floorPt = origPt * 0.75;

      const fitsOneLine = () => el.scrollWidth <= availWidth && cell.scrollWidth <= cell.clientWidth + 0.5;

      if (fitsOneLine()) {
        // Fits at original size on one line: remove unnecessary inline styles
        el.style.display = '';
        el.style.whiteSpace = '';
        continue;
      }

      // Too long for one line: first wrap onto a second line at the ORIGINAL size.
      // Only if two lines are still not enough (or one word is wider than the cell) shrink the text,
      // and then it stays wrapped on its lines. Never cut the text off.
      el.style.whiteSpace = 'normal';
      el.style.overflowWrap = 'normal';
      const fitsTwoLines = () => {
        const px = parseFloat(doc.defaultView?.getComputedStyle(el).fontSize || '') || origPx;
        const lhRaw = parseFloat(doc.defaultView?.getComputedStyle(el).lineHeight || '');
        const lh = isFinite(lhRaw) && lhRaw > 0 ? lhRaw : px * 1.3;
        const lines = Math.ceil(el.getBoundingClientRect().height / lh - 0.15);
        return lines <= 2 && el.scrollWidth <= availWidth + 0.5 && cell.scrollWidth <= cell.clientWidth + 0.5;
      };

      let ok = fitsTwoLines();
      let currPt = origPt;
      while (!ok && currPt > floorPt) {
        currPt = Math.max(floorPt, Math.round((currPt - 0.25) * 100) / 100);
        el.style.fontSize = `${currPt}pt`;
        ok = fitsTwoLines();
      }
      if (!ok) {
        // Last resort (a single very long word): allow breaking inside the word so nothing leaves the box
        el.style.overflowWrap = 'anywhere';
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

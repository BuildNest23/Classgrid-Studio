import { AppData, Student } from '../types';
import { getSortedStudents, loadImage, prettyDate, sessionParts, fileTitle, todayKey } from './helpers';
import { exportImageBlob } from './nativeFileExport';
import { loadCapsPrint } from './capsPrint';
import { ListColumns, DEFAULT_LIST_COLUMNS, OptionalCol } from './studentListColumns';
import { computeCanvasTableColWidths, PrintColumnSpec } from './printTableLayout';

function cap(text: string, enabled: boolean): string {
  if (!text) return '';
  return enabled ? text.toUpperCase() : text;
}

/**
 * Wraps text into lines within maxW, splitting ultra-long words cleanly if a single word exceeds maxW.
 */
function wrapCanvasLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  font: string
): string[] {
  ctx.font = font;
  const safeMaxW = Math.max(16, maxW);
  const raw = String(text ?? '');
  if (!raw) return [''];
  const words = raw.split(/\s+/).filter(Boolean);
  if (!words.length) return [''];

  const lines: string[] = [];
  let line = '';

  const pushWord = (word: string) => {
    if (ctx.measureText(word).width <= safeMaxW) {
      if (!line) {
        line = word;
      } else if (ctx.measureText(line + ' ' + word).width <= safeMaxW) {
        line = line + ' ' + word;
      } else {
        lines.push(line);
        line = word;
      }
      return;
    }
    // Single word wider than cell: flush current line and break cleanly inside the word
    if (line) {
      lines.push(line);
      line = '';
    }
    let chunk = '';
    for (const ch of word) {
      if (chunk && ctx.measureText(chunk + ch).width > safeMaxW) {
        lines.push(chunk);
        chunk = ch;
      } else {
        chunk += ch;
      }
    }
    if (chunk) line = chunk;
  };

  for (const w of words) pushWord(w);
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

/**
 * Draws single-line centered or left-aligned text, shrinking font down to 62% so codes/phones/headers
 * never overflow their cell borders, with a hard clip safeguard.
 */
function drawSingleLineFittedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  baseFontSize: number,
  fontWeight: number,
  fontFamily: string,
  align: 'center' | 'left' = 'center'
) {
  const padX = 6;
  const maxW = Math.max(12, width - padX * 2);
  const floorSize = Math.max(8, baseFontSize * 0.62);
  let fitted = baseFontSize;

  for (let sz = baseFontSize; sz >= floorSize; sz = Math.round((sz - 0.5) * 100) / 100) {
    ctx.font = `${fontWeight} ${sz}px ${fontFamily}`;
    if (ctx.measureText(text).width <= maxW) {
      fitted = sz;
      break;
    }
    fitted = sz;
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 1, y + 1, Math.max(1, width - 2), Math.max(1, height - 2));
  ctx.clip();
  ctx.font = `${fontWeight} ${fitted}px ${fontFamily}`;
  ctx.fillStyle = '#000000';
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  const drawX = align === 'center' ? x + width / 2 : x + padX;
  ctx.fillText(text, drawX, y + height / 2);
  ctx.restore();
}

/**
 * Draws text fitted cleanly inside a cell box: tries shrinking gently to 1 line,
 * otherwise wraps neatly across lines (with a hard clip safeguard so nothing crosses cell borders).
 */
function drawFittedOrWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  baseFontSize: number,
  fontFamily: string,
  maxLines: number = 4,
  align: 'left' | 'center' = 'left',
  fontWeight: number = 600
) {
  const padX = 6;
  const maxW = Math.max(14, width - padX * 2);
  const floorSize = Math.max(8.5, baseFontSize * 0.78);

  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 1, y + 1, Math.max(1, width - 2), Math.max(1, height - 2));
  ctx.clip();
  ctx.fillStyle = '#000000';
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';

  // Try single-line fit with gentle shrink first
  let fitsOneLine = false;
  let fittedSize = baseFontSize;
  for (let sz = baseFontSize; sz >= floorSize; sz = Math.round((sz - 0.5) * 100) / 100) {
    ctx.font = `${fontWeight} ${sz}px ${fontFamily}`;
    if (ctx.measureText(text).width <= maxW) {
      fitsOneLine = true;
      fittedSize = sz;
      break;
    }
  }

  const drawX = align === 'center' ? x + width / 2 : x + padX;
  if (fitsOneLine) {
    ctx.font = `${fontWeight} ${fittedSize}px ${fontFamily}`;
    ctx.fillText(text, drawX, y + height / 2);
    ctx.restore();
    return;
  }

  // Wrap cleanly into lines at base size (or slightly shrunk if needed to fit maxLines)
  let fontSize = baseFontSize;
  let lines = wrapCanvasLines(ctx, text, maxW, `${fontWeight} ${fontSize}px ${fontFamily}`);
  while (lines.length > maxLines && fontSize > floorSize) {
    fontSize = Math.max(floorSize, Math.round((fontSize - 0.5) * 100) / 100);
    lines = wrapCanvasLines(ctx, text, maxW, `${fontWeight} ${fontSize}px ${fontFamily}`);
  }

  const finalLines = lines.slice(0, maxLines);
  const lineH = fontSize * 1.2;
  const totalTextH = finalLines.length * lineH;
  const startY = y + height / 2 - totalTextH / 2 + lineH / 2;
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  finalLines.forEach((ln, li) => ctx.fillText(ln, drawX, startY + li * lineH));
  ctx.restore();
}

export async function downloadAbsenteeSlipPNG(dateKey: string, data: AppData): Promise<boolean> {
  const day = data.attendance[dateKey];
  const sorted = getSortedStudents(data.students);

  const absentList = day ? sorted.filter(s => day.status[s.id] === 'A') : [];
  const leaveList = day ? sorted.filter(s => day.status[s.id] === 'L') : [];
  const isHoliday = !!(day && day.holiday);
  const noAbsentees = !absentList.length && !leaveList.length;

  const scale = 2;
  const F = "Arial, Helvetica, sans-serif";
  let logoImg: HTMLImageElement | null = null;
  if (data.schoolLogo) {
    try {
      logoImg = await loadImage(data.schoolLogo);
    } catch {
      logoImg = null;
    }
  }

  const isCaps = loadCapsPrint();
  const pad = 30;
  const headerH = 140;
  const headRowH = 54;
  const baseRowH = 50;
  const dateH = 30;
  const bandH = 36;

  const allShown = [...absentList, ...leaveList];
  const colSpecs: PrintColumnSpec[] = [
    { label: '#', values: allShown.map((_, i) => String(i + 1)), kind: 'index' },
    { label: 'Roll', values: allShown.map(s => s.rollNo || ''), kind: 'index' },
    { label: 'Name', values: allShown.map(s => s.name || ''), kind: 'name' },
    { label: 'Father Name', values: allShown.map(s => s.fatherName || ''), kind: 'name' },
    { label: 'Father Occupation', values: allShown.map(s => s.occupation || ''), kind: 'text' },
    { label: 'Phone', values: allShown.map(s => s.phone || ''), kind: 'phone' },
    { label: 'Address', values: allShown.map(s => s.address || ''), kind: 'text' },
  ];

  const colWidths = computeCanvasTableColWidths(colSpecs, 15, 15, F, isCaps, 980, 1400);
  const tableW = colWidths.reduce((a, b) => a + b, 0);
  const totalW = pad * 2 + tableW;

  // Measure dynamic row heights using a scratch canvas so wrapped addresses/occupations never get cut off
  const measureCanvas = document.createElement('canvas');
  const mCtx = measureCanvas.getContext('2d');
  const calcRowH = (st: Student) => {
    if (!mCtx) return baseRowH;
    const vals = [
      cap(st.name || '—', isCaps),
      cap(st.fatherName || '—', isCaps),
      cap(st.occupation || '—', isCaps),
      cap(st.address || '—', isCaps),
    ];
    const colsIdx = [2, 3, 4, 6];
    let maxLines = 1;
    vals.forEach((v, idx) => {
      const lines = wrapCanvasLines(mCtx, v, colWidths[colsIdx[idx]] - 12, `600 15px ${F}`);
      if (lines.length > maxLines) maxLines = lines.length;
    });
    const clampedLines = Math.min(4, maxLines);
    return Math.max(baseRowH, Math.ceil(clampedLines * 18.5 + 18));
  };

  const absentHeights = absentList.map(calcRowH);
  const leaveHeights = leaveList.map(calcRowH);

  const total = sorted.length;
  const present = total - absentList.length - leaveList.length;

  const bandCount = (absentList.length ? 1 : 0) + (leaveList.length ? 1 : 0);
  const rowsTotalH =
    absentHeights.reduce((a, b) => a + b, 0) + leaveHeights.reduce((a, b) => a + b, 0);
  const tableH = isHoliday || noAbsentees ? 60 : headRowH + rowsTotalH + bandCount * bandH;
  const statsExtraH = !isHoliday ? 70 : 0;
  const totalH = pad * 2 + headerH + dateH + tableH + statsExtraH + 30;

  const canvas = document.createElement("canvas");
  canvas.width = totalW * scale;
  canvas.height = totalH * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;

  ctx.scale(scale, scale);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, totalW, totalH);
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";

  let textLeftBound = pad;
  if (logoImg) {
    const maxLogoH = 60, maxLogoW = 60;
    const ratio = Math.min(maxLogoW / logoImg.width, maxLogoH / logoImg.height);
    const drawW = logoImg.width * ratio;
    const drawH = logoImg.height * ratio;
    ctx.drawImage(logoImg, pad, pad + (headerH - 60) / 2, drawW, drawH);
    textLeftBound = pad + drawW + 12;
  }
  const textRightBound = totalW - pad;
  const centerX = (textLeftBound + textRightBound) / 2;

  let y = pad;
  ctx.fillStyle = "#111827";
  ctx.font = `700 22px ${F}`;
  ctx.fillText(cap(data.schoolName, isCaps), centerX, y + 16);
  y += 32;

  const classSub = sessionParts(data).cls ? `Class: ${sessionParts(data).cls}` : "";
  const inchargeSub = data.inchargeName ? `Incharge: ${data.inchargeName}` : "";
  const line1 = [classSub, inchargeSub].filter(Boolean).join(" • ");
  if (line1) {
    ctx.font = `700 13px ${F}`;
    ctx.fillStyle = "#374151";
    ctx.fillText(cap(line1, isCaps), centerX, y + 8);
    y += 22;
  }

  if (sessionParts(data).year) {
    ctx.font = `600 12px ${F}`;
    ctx.fillStyle = "#4B5563";
    ctx.fillText(cap(sessionParts(data).year, isCaps), centerX, y + 8);
    y += 20;
  }

  // Primary title in Crimson & Ruby
  ctx.font = `700 14px ${F}`;
  ctx.fillStyle = "#991B1B";
  ctx.fillText("ABSENTEE SLIP", centerX, y + 12);
  y = pad + headerH;

  ctx.font = `700 13px ${F}`;
  ctx.fillStyle = "#111827";
  ctx.fillText(prettyDate(dateKey), centerX, y + 15);
  y += dateH;

  if (isHoliday) {
    ctx.font = `700 18px ${F}`;
    ctx.fillStyle = "#1D4ED8";
    ctx.fillText("This day was marked as a Class Holiday.", centerX, y + 30);
    y += tableH;
  } else if (noAbsentees) {
    ctx.font = `700 18px ${F}`;
    ctx.fillStyle = "#166534";
    ctx.fillText("All students were present.", centerX, y + 30);
    y += tableH;
  } else {
    const headers = colSpecs.map(c => cap(c.label, isCaps));
    ctx.fillStyle = "#F3F4F6";
    ctx.fillRect(pad, y, tableW, headRowH);
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 1;

    let x = pad;
    headers.forEach((h, i) => {
      ctx.strokeRect(x, y, colWidths[i], headRowH);
      drawFittedOrWrappedText(ctx, h, x, y, colWidths[i], headRowH, 14.5, F, 2, 'center', 700);
      x += colWidths[i];
    });
    y += headRowH;

    const drawSection = (title: string, color: string, list: Student[], heights: number[]) => {
      if (!list.length) return;
      ctx.fillStyle = color;
      ctx.fillRect(pad, y, tableW, bandH);
      ctx.strokeStyle = "#000000";
      ctx.strokeRect(pad, y, tableW, bandH);
      ctx.fillStyle = "#111827";
      ctx.font = `800 15px ${F}`;
      ctx.textAlign = "left";
      ctx.fillText(cap(`${title} (${list.length})`, isCaps), pad + 12, y + bandH / 2);
      ctx.textAlign = "center";
      y += bandH;
      list.forEach((st, idx) => {
        const rh = heights[idx] || baseRowH;
        x = pad;
        ctx.fillStyle = idx % 2 === 0 ? "#ffffff" : "#F9FAFB";
        ctx.fillRect(pad, y, tableW, rh);
        ctx.strokeStyle = "#000000";
        const cells = [
          String(idx + 1),
          st.rollNo || "—",
          cap(st.name || "—", isCaps),
          cap(st.fatherName || "—", isCaps),
          cap(st.occupation || "—", isCaps),
          st.phone || "—",
          cap(st.address || "—", isCaps),
        ];
        cells.forEach((val, i) => {
          ctx.strokeRect(x, y, colWidths[i], rh);
          if (i === 0 || i === 1 || i === 5) {
            drawSingleLineFittedText(ctx, val, x, y, colWidths[i], rh, 15, 600, F, 'center');
          } else {
            drawFittedOrWrappedText(ctx, val, x, y, colWidths[i], rh, 15, F, 4, 'left', 600);
          }
          x += colWidths[i];
        });
        y += rh;
      });
    };
    drawSection("Absent", "#FEE2E2", absentList, absentHeights);
    drawSection("Leave (Excused)", "#FEF3C7", leaveList, leaveHeights);
  }

  if (!isHoliday) {
    y += 40;
    ctx.font = `800 18px ${F}`;
    ctx.fillStyle = "#000000";
    ctx.textAlign = "center";
    ctx.fillText(`Total: ${total}   •   Present: ${present}   •   Absent: ${absentList.length}   •   Leave: ${leaveList.length}`, centerX, y);
  }

  return new Promise<boolean>(resolve => {
    canvas.toBlob(async blob => {
      if (!blob) {
        resolve(false);
        return;
      }
      const safeDate = dateKey.replace(/[^\d-]/g, "");
      const filename = `${fileTitle(data.className, 'Absentee Slip', safeDate)}.png`;
      const title = fileTitle(data.className, 'Absentee Slip', prettyDate(dateKey));
      const ok = await exportImageBlob(blob, filename, title);
      resolve(ok);
    }, "image/png");
  });
}

export async function downloadStudentListPNG(data: AppData, cols: ListColumns = DEFAULT_LIST_COLUMNS): Promise<boolean> {
  const sorted = getSortedStudents(data.students);
  if (!sorted.length) return false;

  const scale = 2;
  const F = "Arial, Helvetica, sans-serif";
  let logoImg: HTMLImageElement | null = null;
  if (data.schoolLogo) {
    try {
      logoImg = await loadImage(data.schoolLogo);
    } catch {
      logoImg = null;
    }
  }

  const isCaps = loadCapsPrint();
  const pad = 30;
  const headerH = (sessionParts(data).year && data.className) ? 170 : (sessionParts(data).year || data.className ? 155 : 140);
  const headRowH = 44;
  const baseRowH = 40;

  const optDefs: { key: OptionalCol; label: string }[] = [
    { key: 'phone', label: 'Phone' },
    { key: 'address', label: 'Address' },
    { key: 'occupation', label: 'Occupation' },
    { key: 'notes', label: 'Notes' },
  ];
  const optOn = optDefs.filter(o => cols[o.key]);

  const colSpecs: PrintColumnSpec[] = [
    { label: 'Roll #', values: sorted.map(s => s.rollNo || ''), kind: 'index' },
    { label: 'Adm. No', values: sorted.map(s => s.admissionNo || ''), kind: 'code' },
    { label: 'Name', values: sorted.map(s => s.name || ''), kind: 'name' },
    { label: 'Father Name', values: sorted.map(s => s.fatherName || ''), kind: 'name' },
    ...optOn.map<PrintColumnSpec>(o => ({
      label: o.label,
      values: sorted.map(s =>
        o.key === 'phone'
          ? s.phone || ''
          : o.key === 'address'
          ? s.address || ''
          : o.key === 'occupation'
          ? s.occupation || ''
          : s.notes || ''
      ),
      kind: o.key === 'phone' ? 'phone' : 'text',
      nocap: o.key === 'notes',
    })),
  ];

  const colWidths = computeCanvasTableColWidths(colSpecs, 12, 12, F, isCaps, 760, 1400);
  const tableW = colWidths.reduce((a, b) => a + b, 0);
  const totalW = pad * 2 + tableW;

  // Measure dynamic row heights so wrapped text never overflows or clips
  const measureCanvas = document.createElement('canvas');
  const mCtx = measureCanvas.getContext('2d');
  const rowCellsList = sorted.map(s => [
    s.rollNo || '—',
    s.admissionNo || '—',
    cap(s.name || '—', isCaps),
    cap(s.fatherName || '—', isCaps),
    ...optOn.map(o =>
      o.key === 'phone'
        ? s.phone || '—'
        : o.key === 'address'
        ? cap(s.address || '—', isCaps)
        : o.key === 'occupation'
        ? cap(s.occupation || '—', isCaps)
        : s.notes || '—'
    ),
  ]);

  const rowHeights = rowCellsList.map(cells => {
    if (!mCtx) return baseRowH;
    let maxLines = 1;
    cells.forEach((val, i) => {
      const kind = colSpecs[i].kind;
      if (kind === 'index' || kind === 'code' || kind === 'phone') return;
      const lines = wrapCanvasLines(mCtx, val, colWidths[i] - 12, `600 12px ${F}`);
      if (lines.length > maxLines) maxLines = lines.length;
    });
    const clampedLines = Math.min(4, maxLines);
    return Math.max(baseRowH, Math.ceil(clampedLines * 15 + 14));
  });

  const rowsTotalH = rowHeights.reduce((a, b) => a + b, 0);
  const totalH = pad * 2 + headerH + headRowH + rowsTotalH + 20;

  const canvas = document.createElement("canvas");
  canvas.width = totalW * scale;
  canvas.height = totalH * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;

  ctx.scale(scale, scale);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, totalW, totalH);
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";

  let textLeftBound = pad;
  if (logoImg) {
    const maxLogoH = 70, maxLogoW = 70;
    const ratio = Math.min(maxLogoW / logoImg.width, maxLogoH / logoImg.height);
    const drawW = logoImg.width * ratio;
    const drawH = logoImg.height * ratio;
    ctx.drawImage(logoImg, pad, pad + (headerH - 60) / 2, drawW, drawH);
    textLeftBound = pad + drawW + 12;
  }
  const textRightBound = totalW - pad;
  const centerX = (textLeftBound + textRightBound) / 2;

  let y = pad;
  ctx.fillStyle = "#111827";
  ctx.font = `700 22px ${F}`;
  ctx.fillText(cap(data.schoolName, isCaps), centerX, y + 16);
  y += 32;

  const classSub = sessionParts(data).cls ? `Class: ${sessionParts(data).cls}` : "";
  const inchargeSub = data.inchargeName ? `Incharge: ${data.inchargeName}` : "";
  const line1 = [classSub, inchargeSub].filter(Boolean).join(" • ");
  if (line1) {
    ctx.font = `700 13px ${F}`;
    ctx.fillStyle = "#374151";
    ctx.fillText(cap(line1, isCaps), centerX, y + 8);
    y += 22;
  }

  if (sessionParts(data).year) {
    ctx.font = `600 12px ${F}`;
    ctx.fillStyle = "#4B5563";
    ctx.fillText(cap(sessionParts(data).year, isCaps), centerX, y + 8);
    y += 20;
  }

  // Crimson accent
  ctx.font = `700 14px ${F}`;
  ctx.fillStyle = "#991B1B";
  ctx.fillText("STUDENT LIST", centerX, y + 12);
  y = pad + headerH;

  const headers = colSpecs.map(c => cap(c.label, isCaps));
  ctx.fillStyle = "#F3F4F6";
  ctx.fillRect(pad, y, tableW, headRowH);
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 1;

  let x = pad;
  headers.forEach((h, i) => {
    ctx.strokeRect(x, y, colWidths[i], headRowH);
    drawFittedOrWrappedText(ctx, h, x, y, colWidths[i], headRowH, 12, F, 2, 'center', 700);
    x += colWidths[i];
  });
  y += headRowH;

  rowCellsList.forEach((cells, idx) => {
    const rh = rowHeights[idx] || baseRowH;
    x = pad;
    ctx.fillStyle = idx % 2 === 0 ? "#ffffff" : "#F9FAFB";
    ctx.fillRect(pad, y, tableW, rh);
    ctx.strokeStyle = "#000000";

    cells.forEach((val, i) => {
      ctx.strokeRect(x, y, colWidths[i], rh);
      const kind = colSpecs[i].kind;
      if (kind === 'index' || kind === 'code' || kind === 'phone') {
        drawSingleLineFittedText(ctx, val, x, y, colWidths[i], rh, 12, i === 0 ? 700 : 600, F, 'center');
      } else {
        drawFittedOrWrappedText(ctx, val, x, y, colWidths[i], rh, 12, F, 4, 'left', 600);
      }
      x += colWidths[i];
    });
    y += rh;
  });

  return new Promise<boolean>(resolve => {
    canvas.toBlob(async blob => {
      if (!blob) {
        resolve(false);
        return;
      }
      const stamp = todayKey();
      const filename = `${fileTitle(data.className, 'Student List', stamp)}.png`;
      const title = fileTitle(data.className, 'Student List', stamp);
      const ok = await exportImageBlob(blob, filename, title);
      resolve(ok);
    }, "image/png");
  });
}

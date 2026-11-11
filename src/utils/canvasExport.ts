import { AppData, Student } from '../types';
import { getSortedStudents, loadImage, prettyDate } from './helpers';
import { exportImageBlob } from './nativeFileExport';
import { loadCapsPrint } from './capsPrint';
import { ListColumns, DEFAULT_LIST_COLUMNS, OptionalCol } from './studentListColumns';

function cap(text: string, enabled: boolean): string {
  if (!text) return '';
  return enabled ? text.toUpperCase() : text;
}

function drawFittedOrWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  baseFontSize: number,
  fontFamily: string,
  maxLines: number = 2
) {
  const maxW = width - 10;
  const floorSize = baseFontSize * 0.75;

  ctx.textAlign = 'left';
  ctx.fillStyle = '#000000';

  // Try shrinking font down to 75% in 0.25 steps to fit on a single line
  let fitsOneLine = false;
  let fittedSize = baseFontSize;

  for (let sz = baseFontSize; sz >= floorSize; sz = Math.round((sz - 0.25) * 100) / 100) {
    ctx.font = `600 ${sz}px ${fontFamily}`;
    if (ctx.measureText(text).width <= maxW) {
      fitsOneLine = true;
      fittedSize = sz;
      break;
    }
  }

  if (fitsOneLine) {
    ctx.font = `600 ${fittedSize}px ${fontFamily}`;
    ctx.fillText(text, x + 5, y + height / 2);
    ctx.textAlign = 'center';
    return;
  }

  // Otherwise wrap into multiple lines as before
  ctx.font = `600 ${baseFontSize}px ${fontFamily}`;
  const words = text.split(/\s+/);
  let line = '';
  const lines: string[] = [];
  words.forEach(w => {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width <= maxW) {
      line = test;
    } else {
      if (line) lines.push(line);
      line = w;
    }
  });
  if (line) lines.push(line);

  const finalLines = lines.length > maxLines ? lines.slice(0, maxLines) : lines;
  const lineH = baseFontSize * 1.15;
  const totalTextH = finalLines.length * lineH;
  const startY = y + height / 2 - totalTextH / 2 + lineH / 2 - 1;
  finalLines.forEach((ln, li) => ctx.fillText(ln, x + 5, startY + li * lineH));
  ctx.textAlign = 'center';
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

  const pad = 30;
  const headerH = 140;
  const headRowH = 54;
  const rowH = 56;
  const dateH = 30;

  const colWidths = [50, 80, 220, 220, 150, 150];
  const tableW = colWidths.reduce((a, b) => a + b, 0);
  const totalW = pad * 2 + tableW;

  const total = sorted.length;
  const present = total - absentList.length - leaveList.length;

  const dataRows = (isHoliday || noAbsentees) ? 0 : (absentList.length + leaveList.length);
  const tableH = (isHoliday || noAbsentees) ? 60 : (headRowH + dataRows * rowH);
  const statsExtraH = (day && !day.holiday) ? 70 : 0;
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

  const isCaps = loadCapsPrint();
  let y = pad;
  ctx.fillStyle = "#111827";
  ctx.font = `700 22px ${F}`;
  ctx.fillText(cap(data.schoolName, isCaps), centerX, y + 16);
  y += 32;

  const classSub = data.className ? `Class: ${data.className}` : "";
  const inchargeSub = data.inchargeName ? `Incharge: ${data.inchargeName}` : "";
  const line1 = [classSub, inchargeSub].filter(Boolean).join(" • ");
  if (line1) {
    ctx.font = `700 13px ${F}`;
    ctx.fillStyle = "#374151";
    ctx.fillText(cap(line1, isCaps), centerX, y + 8);
    y += 22;
  }

  if (data.academicYear) {
    ctx.font = `600 12px ${F}`;
    ctx.fillStyle = "#4B5563";
    ctx.fillText(cap(data.academicYear, isCaps), centerX, y + 8);
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
  } else if (noAbsentees) {
    ctx.font = `700 18px ${F}`;
    ctx.fillStyle = "#166534";
    ctx.fillText("All students were present.", centerX, y + 30);
  } else {
    const headers = ["#", "Roll", "Name", "Father Name", "Phone", "Status"].map(h => cap(h, isCaps));
    ctx.fillStyle = "#F3F4F6";
    ctx.fillRect(pad, y, tableW, headRowH);
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 1;

    let x = pad;
    ctx.fillStyle = "#000000";
    ctx.font = `700 16px ${F}`;
    headers.forEach((h, i) => {
      ctx.strokeRect(x, y, colWidths[i], headRowH);
      ctx.fillText(h, x + colWidths[i] / 2, y + headRowH / 2);
      x += colWidths[i];
    });
    y += headRowH;

    const allRows: Array<{ idx: number; s: Student; status: string }> = [];
    absentList.forEach((s, i) => allRows.push({ idx: i + 1, s, status: "Absent" }));
    leaveList.forEach((s, i) => allRows.push({ idx: absentList.length + i + 1, s, status: "Leave (Excused)" }));

    allRows.forEach((row, idx) => {
      x = pad;
      ctx.fillStyle = idx % 2 === 0 ? "#ffffff" : "#F9FAFB";
      ctx.fillRect(pad, y, tableW, rowH);
      ctx.strokeStyle = "#000000";
      ctx.fillStyle = "#000000";
      ctx.font = `600 15px ${F}`;

      const cells = [
        String(row.idx),
        row.s.rollNo || "—",
        cap(row.s.name || "—", isCaps),
        cap(row.s.fatherName || "—", isCaps),
        row.s.phone || "—",
        cap(row.status, isCaps)
      ];

      cells.forEach((val, i) => {
        ctx.strokeRect(x, y, colWidths[i], rowH);
        if (i === 2 || i === 3) {
          drawFittedOrWrappedText(ctx, val, x, y, colWidths[i], rowH, 15, F, 2);
        } else {
          ctx.fillText(val, x + colWidths[i] / 2, y + rowH / 2);
        }
        x += colWidths[i];
      });
      y += rowH;
    });
  }

  // Draw the summary stats line below the table
  if (day && !day.holiday) {
    y += 40;
    ctx.font = `800 18px ${F}`;
    ctx.fillStyle = "#000000";
    ctx.fillText(`Total: ${total}   •   Present: ${present}   •   Absent: ${absentList.length}   •   Leave: ${leaveList.length}`, centerX, y);
  }

  return new Promise<boolean>(resolve => {
    canvas.toBlob(async blob => {
      if (!blob) {
        resolve(false);
        return;
      }
      const safeDate = dateKey.replace(/[^\d-]/g, "");
      const filename = `absentee-slip-${safeDate}.png`;
      const title = `Absentee Slip - ${prettyDate(dateKey)}`;
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

  const pad = 30;
  const headerH = (data.academicYear && data.className) ? 170 : (data.academicYear || data.className ? 155 : 140);
  const headRowH = 44;
  const rowH = 44;
  const optDefs: { key: OptionalCol; label: string; w: number }[] = [
    { key: 'phone', label: 'Phone', w: 120 },
    { key: 'address', label: 'Address', w: 160 },
    { key: 'occupation', label: 'Occupation', w: 130 },
    { key: 'notes', label: 'Notes', w: 130 },
  ];
  const optOn = optDefs.filter(o => cols[o.key]);
  const colWidths = [50, 110, 70, 200, 200, ...optOn.map(o => o.w)];
  const tableW = colWidths.reduce((a, b) => a + b, 0);
  const totalW = pad * 2 + tableW;
  const totalH = pad * 2 + headerH + headRowH + sorted.length * rowH + 20;

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

  const isCaps = loadCapsPrint();
  let y = pad;
  ctx.fillStyle = "#111827";
  ctx.font = `700 22px ${F}`;
  ctx.fillText(cap(data.schoolName, isCaps), centerX, y + 16);
  y += 32;

  const classSub = data.className ? `Class: ${data.className}` : "";
  const inchargeSub = data.inchargeName ? `Incharge: ${data.inchargeName}` : "";
  const line1 = [classSub, inchargeSub].filter(Boolean).join(" • ");
  if (line1) {
    ctx.font = `700 13px ${F}`;
    ctx.fillStyle = "#374151";
    ctx.fillText(cap(line1, isCaps), centerX, y + 8);
    y += 22;
  }

  if (data.academicYear) {
    ctx.font = `600 12px ${F}`;
    ctx.fillStyle = "#4B5563";
    ctx.fillText(cap(data.academicYear, isCaps), centerX, y + 8);
    y += 20;
  }

  // Crimson accent
  ctx.font = `700 14px ${F}`;
  ctx.fillStyle = "#991B1B";
  ctx.fillText("STUDENT LIST", centerX, y + 12);
  y = pad + headerH;

  const headers = ["#", "Adm. No", "Roll", "Name", "Father Name", ...optOn.map(o => o.label)].map(h => cap(h, isCaps));
  ctx.fillStyle = "#F3F4F6";
  ctx.fillRect(pad, y, tableW, headRowH);
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 1;

  let x = pad;
  ctx.fillStyle = "#000000";
  ctx.font = `700 12px ${F}`;
  headers.forEach((h, i) => {
    ctx.strokeRect(x, y, colWidths[i], headRowH);
    ctx.fillText(h, x + colWidths[i] / 2, y + headRowH / 2);
    x += colWidths[i];
  });
  y += headRowH;

  sorted.forEach((s, idx) => {
    x = pad;
    ctx.fillStyle = idx % 2 === 0 ? "#ffffff" : "#F9FAFB";
    ctx.fillRect(pad, y, tableW, rowH);
    ctx.strokeStyle = "#000000";
    ctx.fillStyle = "#000000";
    ctx.font = `600 11.5px ${F}`;

    const cells = [
      String(idx + 1),
      s.admissionNo || "—",
      s.rollNo || "—",
      cap(s.name || "—", isCaps),
      cap(s.fatherName || "—", isCaps),
      ...optOn.map(o =>
        o.key === 'phone' ? (s.phone || "—")
        : o.key === 'address' ? cap(s.address || "—", isCaps)
        : o.key === 'occupation' ? cap(s.occupation || "—", isCaps)
        : (s.notes || "—"))
    ];

    cells.forEach((val, i) => {
      ctx.strokeRect(x, y, colWidths[i], rowH);
      if (i === 3 || i === 4) {
        drawFittedOrWrappedText(ctx, val, x, y, colWidths[i], rowH, 11.5, F, 2);
      } else if (i >= 5 && optOn[i - 5].key !== 'phone') {
        ctx.textAlign = "left";
        const maxW = colWidths[i] - 10;
        const words = String(val).split(/\s+/);
        let line = "";
        const lines: string[] = [];
        words.forEach(w => {
          const test = line ? line + " " + w : w;
          if (ctx.measureText(test).width <= maxW) {
            line = test;
          } else {
            if (line) lines.push(line);
            line = w;
          }
        });
        if (line) lines.push(line);
        const finalLines = lines.length > 2 ? lines.slice(0, 2) : lines;
        const lineH = 13;
        const totalTextH = finalLines.length * lineH;
        const startY = y + rowH / 2 - totalTextH / 2 + lineH / 2 - 1;
        finalLines.forEach((ln, li) => ctx.fillText(ln, x + 5, startY + li * lineH));
        ctx.textAlign = "center";
      } else {
        ctx.fillText(val, x + colWidths[i] / 2, y + rowH / 2);
      }
      x += colWidths[i];
    });
    y += rowH;
  });

  return new Promise<boolean>(resolve => {
    canvas.toBlob(async blob => {
      if (!blob) {
        resolve(false);
        return;
      }
      const stamp = new Date().toISOString().slice(0, 10);
      const filename = `students-${stamp}.png`;
      const title = `Student List - ${stamp}`;
      const ok = await exportImageBlob(blob, filename, title);
      resolve(ok);
    }, "image/png");
  });
}


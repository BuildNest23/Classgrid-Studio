// Thin Excel (SheetJS) layer for the school workbook. All the logic lives in schoolSheet.ts.
import { BuiltSchool, SheetData } from './schoolSheet';
import { writeStyledXlsx } from './xlsxWriter';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Formatted workbook (coloured headers, striped rows, frozen header). Falls back to a plain one if anything goes wrong. */
export async function buildSchoolWorkbookBlob(built: BuiltSchool, schoolName = ''): Promise<Blob> {
  try {
    const bytes = writeStyledXlsx(built, schoolName);
    return new Blob([bytes], { type: XLSX_MIME });
  } catch {
    return buildPlainWorkbookBlob(built);
  }
}

async function buildPlainWorkbookBlob(built: BuiltSchool): Promise<Blob> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();

  const sum = XLSX.utils.aoa_to_sheet(built.summary.rows);
  sum['!cols'] = [{ wch: 24 }, { wch: 24 }, { wch: 24 }, { wch: 10 }, { wch: 12, hidden: true }];
  XLSX.utils.book_append_sheet(wb, sum, built.summary.name);

  built.classes.forEach(c => {
    const ws = XLSX.utils.aoa_to_sheet(c.sheet.rows);
    ws['!cols'] = [{ wch: 8 }, { wch: 26 }, { wch: 26 }, { wch: 14 }, { wch: 24 }, { wch: 34 }, { wch: 18 }, { wch: 14, hidden: true }];
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, c.sheet.rows.length - 1), c: 7 } }) };
    XLSX.utils.book_append_sheet(wb, ws, c.sheet.name);
  });

  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Blob([out], { type: XLSX_MIME });
}

export async function readWorkbookSheets(file: File): Promise<SheetData[]> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  return wb.SheetNames.map(name => ({
    name,
    rows: XLSX.utils
      .sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: false, defval: '', blankrows: false })
      .map(r => (r as unknown[]).map(c => String(c ?? ''))),
  }));
}

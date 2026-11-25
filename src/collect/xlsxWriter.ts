// A small, self-contained .xlsx writer with real formatting (SheetJS community cannot style cells).
// Writes a stored (uncompressed) zip, so no extra library is needed.
import { BuiltSchool } from './schoolSheet';

const enc = new TextEncoder();

// ---------------------------------------------------------------- zip (store)
const CRC: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function zipStore(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const u16 = (v: number) => [v & 255, (v >>> 8) & 255];
  const u32 = (v: number) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
  const time = 0, date = ((2026 - 1980) << 9) | (1 << 5) | 1;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const local = new Uint8Array([
      0x50, 0x4b, 0x03, 0x04, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(time), ...u16(date),
      ...u32(crc), ...u32(f.data.length), ...u32(f.data.length), ...u16(name.length), ...u16(0), ...name,
    ]);
    chunks.push(local, f.data);
    central.push(new Uint8Array([
      0x50, 0x4b, 0x01, 0x02, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(time), ...u16(date),
      ...u32(crc), ...u32(f.data.length), ...u32(f.data.length), ...u16(name.length), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...name,
    ]));
    offset += local.length + f.data.length;
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0);
  const end = new Uint8Array([0x50, 0x4b, 0x05, 0x06, ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cdSize), ...u32(offset), ...u16(0)]);
  const all = [...chunks, ...central, end];
  const out = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
  let p = 0;
  all.forEach(a => { out.set(a, p); p += a.length; });
  return out;
}

// ---------------------------------------------------------------- xml helpers
const esc = (v: string) => v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const colName = (i: number) => { let n = i + 1, s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

// style ids (see styles.xml below)
const ST = { normal: 0, title: 1, note: 2, head: 3, cell: 4, band: 5, total: 6, sub: 7 } as const;

const RED = 'FF991B1B', LIGHT = 'FFFEF2F2', GRID = 'FFD6D3D1';

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="6">
<font><sz val="13"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="22"/><color rgb="${RED}"/><name val="Calibri"/><family val="2"/></font>
<font><i/><sz val="12"/><color rgb="FF57534E"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="13"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="13"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="15"/><color rgb="FF292524"/><name val="Calibri"/><family val="2"/></font>
</fonts>
<fills count="4">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="${RED}"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="${LIGHT}"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="${GRID}"/></left><right style="thin"><color rgb="${GRID}"/></right><top style="thin"><color rgb="${GRID}"/></top><bottom style="thin"><color rgb="${GRID}"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="8">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="49" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="49" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="49" fontId="4" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

interface Cell { v: string; s: number; }
interface Sheet {
  name: string;
  rows: { cells: Cell[]; ht?: number }[];
  widths: { w: number; hidden?: boolean }[];
  merges: string[];
  freezeRow?: number;     // rows above stay visible
  filter?: string;        // A1 range
  tab?: string;
}

function sheetXml(sh: Sheet): string {
  const cols = sh.widths.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.w}" customWidth="1"${c.hidden ? ' hidden="1"' : ''}/>`).join('');
  const rows = sh.rows.map((r, ri) => {
    const cs = r.cells.map((c, ci) => {
      const ref = colName(ci) + (ri + 1);
      if (c.v === '') return `<c r="${ref}" s="${c.s}"/>`;
      return `<c r="${ref}" s="${c.s}" t="inlineStr"><is><t xml:space="preserve">${esc(c.v)}</t></is></c>`;
    }).join('');
    return `<row r="${ri + 1}"${r.ht ? ` ht="${r.ht}" customHeight="1"` : ''}>${cs}</row>`;
  }).join('');
  const lastCol = Math.max(0, sh.widths.length - 1);
  const dim = `A1:${colName(lastCol)}${Math.max(1, sh.rows.length)}`;
  const pane = sh.freezeRow
    ? `<sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="${sh.freezeRow}" topLeftCell="A${sh.freezeRow + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${sh.freezeRow + 1}" sqref="A${sh.freezeRow + 1}"/></sheetView></sheetViews>`
    : `<sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr>${sh.tab ? `<tabColor rgb="${sh.tab}"/>` : ''}<pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="${dim}"/>${pane}<sheetFormatPr defaultRowHeight="26"/><cols>${cols}</cols><sheetData>${rows}</sheetData>${sh.filter ? `<autoFilter ref="${sh.filter}"/>` : ''}${sh.merges.length ? `<mergeCells count="${sh.merges.length}">${sh.merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : ''}<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
}

/** Column widths that fit the longest text in each column (no wrapping, rows keep one height). */
function fitWidths(body: string[][], head: string[], n: number, hidden: number[]): { w: number; hidden?: boolean }[] {
  const out: { w: number; hidden?: boolean }[] = [];
  for (let c = 0; c < n; c++) {
    let len = (head[c] || '').length * 1.15 + 3;   // bold header + filter arrow
    body.forEach(r => { len = Math.max(len, (r[c] || '').length); });
    out.push({ w: Math.min(120, Math.max(10, Math.round(len * 1.25 + 4))), hidden: hidden.includes(c) || undefined });
  }
  return out;
}

export function buildStyledSchoolSheets(built: BuiltSchool, schoolName: string, skipSummary = false): Sheet[] {
  const sheets: Sheet[] = [];
  const pad = (a: string[], n: number) => { const o = a.slice(0, n); while (o.length < n) o.push(''); return o; };

  // ---- Summary
  const sr = built.summary.rows;
  const sumRows: Sheet['rows'] = sr.map((r, i) => {
    const row = pad(r, 5);
    if (i === 0) return { cells: row.map((v, c) => ({ v, s: c === 0 ? ST.title : ST.normal })), ht: 36 };
    if (i === 1) return { cells: row.map((v, c) => ({ v, s: c === 0 ? ST.note : ST.normal })) };
    if (i === 2 || i === 3) return { cells: row.map((v, c) => ({ v, s: c === 0 ? ST.note : ST.normal })), ht: 22 };
    if (i === 4) return { cells: row.map(v => ({ v, s: ST.normal })) };
    if (i === 5) return { cells: row.map(v => ({ v, s: ST.head })), ht: 30 };
    const last = i === sr.length - 1;
    return { cells: row.map(v => ({ v, s: last ? ST.total : (i % 2 === 0 ? ST.band : ST.cell) })), ht: 26 };
  });
  sheets.push({
    name: built.summary.name, rows: sumRows,
    widths: fitWidths(sr.slice(5), sr[5], 5, [4]),
    merges: [], filter: undefined, tab: 'FF44403C',
  });

  // ---- one sheet per class
  built.classes.forEach(c => {
    const n = c.sheet.rows.length; // header + students
    const blank = (cell: Cell): Cell[] => [cell, ...Array.from({ length: 7 }, () => ({ v: '', s: ST.normal }))];
    const rows: Sheet['rows'] = [
      { cells: blank({ v: `${c.className}  -  ${schoolName}`, s: ST.title }), ht: 36 },
      { cells: blank({ v: `${c.incharge ? 'Class incharge: ' + c.incharge + '      |      ' : ''}Students: ${c.students}`, s: ST.sub }), ht: 26 },
      { cells: blank({ v: 'Correct any detail, add new students at the bottom, or delete a row to remove a student. Do not change the hidden ID column.', s: ST.note }), ht: 22 },
      { cells: blank({ v: '', s: ST.normal }) },
      { cells: c.sheet.rows[0].map(v => ({ v, s: ST.head })), ht: 30 },
    ];
    for (let i = 1; i < n; i++) rows.push({ cells: pad(c.sheet.rows[i], 8).map(v => ({ v, s: i % 2 === 0 ? ST.band : ST.cell })), ht: 26 });
    sheets.push({
      name: c.sheet.name, rows,
      widths: fitWidths(c.sheet.rows.slice(1), c.sheet.rows[0], 8, [7]),
      merges: [], freezeRow: 5, filter: `A5:H${Math.max(5, 4 + n)}`, tab: RED,
    });
  });
  return skipSummary ? sheets.slice(1) : sheets;
}

export function writeStyledXlsx(built: BuiltSchool, schoolName: string, skipSummary = false): Uint8Array {
  const sheets = buildStyledSchoolSheets(built, schoolName, skipSummary);
  const X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const files: { name: string; data: Uint8Array }[] = [];
  const add = (name: string, xml: string) => files.push({ name, data: enc.encode(xml) });

  add('[Content_Types].xml', `${X}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`);
  add('_rels/.rels', `${X}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  add('xl/workbook.xml', `${X}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="12000"/></bookViews><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`);
  add('xl/_rels/workbook.xml.rels', `${X}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  add('xl/styles.xml', STYLES);
  sheets.forEach((s, i) => add(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)));
  return zipStore(files);
}

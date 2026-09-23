import * as XLSX from "xlsx";

/**
 * Minimal in-place BIFF8 cell patcher.
 *
 * The official DLSE Form 55 is a legacy Excel 97-2003 workbook. Rewriting it
 * through a spreadsheet library drops borders, merged headers, wrapping, and
 * print setup, so the result no longer looks like the official form. This
 * module instead edits the original `Workbook` stream record by record:
 * blank cells are replaced by value cells that keep their original style (XF),
 * cached results of existing formulas are updated, and the stream offsets that
 * depend on record sizes (BOUNDSHEET, INDEX, DBCELL) are recomputed. Every
 * other record is copied byte for byte.
 *
 * Reference: [MS-XLS] Excel Binary File Format, sections 2.4 (records).
 */

const RT = {
  BOF: 0x0809,
  EOF: 0x000a,
  BOUNDSHEET: 0x0085,
  INDEX: 0x020b,
  DBCELL: 0x00d7,
  DEFCOLWIDTH: 0x0055,
  ROW: 0x0208,
  BLANK: 0x0201,
  MULBLANK: 0x00be,
  NUMBER: 0x0203,
  LABEL: 0x0204,
  LABELSST: 0x00fd,
  RK: 0x027e,
  MULRK: 0x00bd,
  FORMULA: 0x0006,
  BOOLERR: 0x0205,
} as const;

const SINGLE_CELL_RECORDS = new Set<number>([RT.BLANK, RT.NUMBER, RT.LABEL, RT.LABELSST, RT.RK, RT.FORMULA, RT.BOOLERR]);
const MULTI_CELL_RECORDS = new Set<number>([RT.MULBLANK, RT.MULRK]);

/** Style index of the default cell format in every BIFF8 workbook. */
export const DEFAULT_CELL_XF = 15;

interface BiffRecord {
  type: number;
  data: Uint8Array;
}

export type CellValue = { kind: "number"; value: number } | { kind: "string"; value: string };

export interface CellEdit {
  row: number;
  col: number;
  value: CellValue;
}

export interface FormulaCacheEdit {
  row: number;
  col: number;
  value: number;
}

export class Biff8Error extends Error {}

const u16 = (d: Uint8Array, o: number) => d[o] | (d[o + 1] << 8);
const u32 = (d: Uint8Array, o: number) => (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0;
const setU16 = (d: Uint8Array, o: number, v: number) => {
  d[o] = v & 0xff;
  d[o + 1] = (v >>> 8) & 0xff;
};
const setU32 = (d: Uint8Array, o: number, v: number) => {
  new DataView(d.buffer, d.byteOffset, d.byteLength).setUint32(o, v, true);
};

export function parseRecords(stream: Uint8Array): BiffRecord[] {
  const records: BiffRecord[] = [];
  let offset = 0;
  while (offset + 4 <= stream.length) {
    const type = u16(stream, offset);
    const length = u16(stream, offset + 2);
    if (offset + 4 + length > stream.length) throw new Biff8Error(`truncated record at ${offset}`);
    records.push({ type, data: stream.slice(offset + 4, offset + 4 + length) });
    offset += 4 + length;
  }
  return records;
}

function serialize(records: BiffRecord[]): Uint8Array {
  const total = records.reduce((sum, r) => sum + 4 + r.data.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const r of records) {
    setU16(out, offset, r.type);
    setU16(out, offset + 2, r.data.length);
    out.set(r.data, offset + 4);
    offset += 4 + r.data.length;
  }
  return out;
}

function positions(records: BiffRecord[]): number[] {
  const result: number[] = [];
  let offset = 0;
  for (const r of records) {
    result.push(offset);
    offset += 4 + r.data.length;
  }
  return result;
}

interface SheetBounds {
  name: string;
  boundsheetIndex: number;
  bofIndex: number;
  eofIndex: number;
}

function locateSheets(records: BiffRecord[]): SheetBounds[] {
  const pos = positions(records);
  const indexByPos = new Map(pos.map((p, i) => [p, i]));
  const sheets: SheetBounds[] = [];
  records.forEach((record, i) => {
    if (record.type !== RT.BOUNDSHEET) return;
    const bofPos = u32(record.data, 0);
    const bofIndex = indexByPos.get(bofPos);
    if (bofIndex === undefined || records[bofIndex].type !== RT.BOF) {
      throw new Biff8Error(`BOUNDSHEET points at ${bofPos}, which is not a BOF record`);
    }
    let eofIndex = bofIndex + 1;
    while (eofIndex < records.length && records[eofIndex].type !== RT.EOF) eofIndex++;
    sheets.push({ name: readShortUnicode(record.data, 6), boundsheetIndex: i, bofIndex, eofIndex });
  });
  return sheets;
}

function readShortUnicode(data: Uint8Array, offset: number): string {
  const cch = data[offset];
  const highByte = data[offset + 1] & 0x01;
  const start = offset + 2;
  if (!highByte) return String.fromCharCode(...data.subarray(start, start + cch));
  let s = "";
  for (let i = 0; i < cch; i++) s += String.fromCharCode(u16(data, start + i * 2));
  return s;
}

function cellRecordRow(record: BiffRecord): number | null {
  if (SINGLE_CELL_RECORDS.has(record.type) || MULTI_CELL_RECORDS.has(record.type)) return u16(record.data, 0);
  return null;
}

function cellRecordColumns(record: BiffRecord): [number, number] {
  const first = u16(record.data, 2);
  if (MULTI_CELL_RECORDS.has(record.type)) return [first, u16(record.data, record.data.length - 2)];
  return [first, first];
}

function blankRecord(row: number, col: number, xf: number): BiffRecord {
  const data = new Uint8Array(6);
  setU16(data, 0, row);
  setU16(data, 2, col);
  setU16(data, 4, xf);
  return { type: RT.BLANK, data };
}

function blankRun(row: number, firstCol: number, xfs: number[]): BiffRecord[] {
  if (xfs.length === 0) return [];
  if (xfs.length === 1) return [blankRecord(row, firstCol, xfs[0])];
  const data = new Uint8Array(4 + xfs.length * 2 + 2);
  setU16(data, 0, row);
  setU16(data, 2, firstCol);
  xfs.forEach((xf, i) => setU16(data, 4 + i * 2, xf));
  setU16(data, data.length - 2, firstCol + xfs.length - 1);
  return [{ type: RT.MULBLANK, data }];
}

function valueRecord(row: number, col: number, xf: number, value: CellValue): BiffRecord {
  if (value.kind === "number") {
    if (!Number.isFinite(value.value)) throw new Biff8Error(`non-finite number for r${row}c${col}`);
    const data = new Uint8Array(14);
    setU16(data, 0, row);
    setU16(data, 2, col);
    setU16(data, 4, xf);
    new DataView(data.buffer).setFloat64(6, value.value, true);
    return { type: RT.NUMBER, data };
  }
  const text = value.value;
  if (text.length > 255) throw new Biff8Error(`string longer than 255 characters for r${row}c${col}`);
  const wide = [...text].some((ch) => ch.charCodeAt(0) > 0xff);
  const body = new Uint8Array(3 + text.length * (wide ? 2 : 1));
  setU16(body, 0, text.length);
  body[2] = wide ? 1 : 0;
  for (let i = 0; i < text.length; i++) {
    if (wide) setU16(body, 3 + i * 2, text.charCodeAt(i));
    else body[3 + i] = text.charCodeAt(i);
  }
  const data = new Uint8Array(6 + body.length);
  setU16(data, 0, row);
  setU16(data, 2, col);
  setU16(data, 4, xf);
  data.set(body, 6);
  return { type: RT.LABEL, data };
}

/** Replaces or inserts cells within one sheet substream. Returns the new record list for that sheet. */
function patchSheetCells(sheet: BiffRecord[], edits: CellEdit[], formulaEdits: FormulaCacheEdit[]): BiffRecord[] {
  const pending = new Map(edits.map((e) => [`${e.row}:${e.col}`, e]));
  const out: BiffRecord[] = [];

  const emitPendingForRowBefore = (row: number, beforeCol: number) => {
    const due = [...pending.values()]
      .filter((e) => e.row === row && e.col < beforeCol)
      .sort((a, b) => a.col - b.col);
    for (const e of due) {
      out.push(valueRecord(e.row, e.col, DEFAULT_CELL_XF, e.value));
      pending.delete(`${e.row}:${e.col}`);
    }
  };

  let currentRow: number | null = null;
  for (const record of sheet) {
    const row = cellRecordRow(record);
    if (row === null) {
      if (currentRow !== null) emitPendingForRowBefore(currentRow, Number.POSITIVE_INFINITY);
      currentRow = null;
      out.push(record);
      continue;
    }
    if (currentRow !== null && currentRow !== row) emitPendingForRowBefore(currentRow, Number.POSITIVE_INFINITY);
    currentRow = row;

    const [firstCol, lastCol] = cellRecordColumns(record);
    emitPendingForRowBefore(row, firstCol);

    if (record.type === RT.FORMULA) {
      const formulaEdit = formulaEdits.find((f) => f.row === row && f.col === firstCol);
      if (formulaEdit) {
        const data = record.data.slice();
        new DataView(data.buffer).setFloat64(6, formulaEdit.value, true);
        out.push({ type: record.type, data });
        continue;
      }
    }

    const touches = [...pending.values()].some((e) => e.row === row && e.col >= firstCol && e.col <= lastCol);
    if (!touches) {
      out.push(record);
      continue;
    }
    if (record.type !== RT.BLANK && record.type !== RT.MULBLANK) {
      throw new Biff8Error(`refusing to overwrite non-blank cell r${row}c${firstCol} (record 0x${record.type.toString(16)})`);
    }

    const xfs =
      record.type === RT.BLANK
        ? [u16(record.data, 4)]
        : Array.from({ length: lastCol - firstCol + 1 }, (_, i) => u16(record.data, 4 + i * 2));
    let run: number[] = [];
    let runStart = firstCol;
    for (let col = firstCol; col <= lastCol; col++) {
      const edit = pending.get(`${row}:${col}`);
      const xf = xfs[col - firstCol];
      if (!edit) {
        if (run.length === 0) runStart = col;
        run.push(xf);
        continue;
      }
      out.push(...blankRun(row, runStart, run));
      run = [];
      out.push(valueRecord(row, col, xf, edit.value));
      pending.delete(`${row}:${col}`);
    }
    out.push(...blankRun(row, runStart, run));
  }

  if (pending.size > 0) {
    const missing = [...pending.values()].map((e) => `r${e.row}c${e.col}`).join(", ");
    throw new Biff8Error(`cells not placed (row has no cell records): ${missing}`);
  }
  const unmatched = formulaEdits.filter(
    (f) => !out.some((r) => r.type === RT.FORMULA && u16(r.data, 0) === f.row && u16(r.data, 2) === f.col),
  );
  if (unmatched.length > 0) {
    throw new Biff8Error(`no formula at ${unmatched.map((f) => `r${f.row}c${f.col}`).join(", ")}`);
  }
  return out;
}

/** First cell record position of each row in a DBCELL block, per [MS-XLS] 2.4.78. */
function computeDbcell(records: BiffRecord[], pos: number[], dbcellIndex: number): Uint8Array {
  let firstRowRecord = dbcellIndex - 1;
  while (firstRowRecord >= 0 && records[firstRowRecord].type !== RT.ROW) firstRowRecord--;
  while (firstRowRecord > 0 && records[firstRowRecord - 1].type === RT.ROW) firstRowRecord--;
  const rowRecords: number[] = [];
  for (let i = firstRowRecord; records[i].type === RT.ROW; i++) rowRecords.push(i);

  const firstCellPos = rowRecords.map((ri) => {
    const row = u16(records[ri].data, 0);
    for (let i = ri; i < dbcellIndex; i++) {
      if (cellRecordRow(records[i]) === row) return pos[i];
    }
    return null;
  });

  const data = new Uint8Array(4 + rowRecords.length * 2);
  setU32(data, 0, pos[dbcellIndex] - pos[rowRecords[0]]);
  const base = rowRecords.length > 1 ? pos[rowRecords[1]] : pos[rowRecords[0]] + 4 + records[rowRecords[0]].data.length;
  let previous = base;
  firstCellPos.forEach((cellPos, i) => {
    if (cellPos === null) return;
    setU16(data, 4 + i * 2, cellPos - previous);
    previous = cellPos;
  });
  return data;
}

function fixOffsets(records: BiffRecord[], oldToNew: Map<BiffRecord, BiffRecord>, oldRecords: BiffRecord[]) {
  const pos = positions(records);
  const indexOf = new Map(records.map((r, i) => [r, i]));
  const oldPos = positions(oldRecords);
  const newPosOfOld = (oldOffset: number) => {
    const oldIndex = oldPos.indexOf(oldOffset);
    if (oldIndex < 0) throw new Biff8Error(`stream offset ${oldOffset} is not a record boundary`);
    const mapped = oldToNew.get(oldRecords[oldIndex]);
    const newIndex = mapped ? indexOf.get(mapped) : undefined;
    if (newIndex === undefined) throw new Biff8Error(`record at ${oldOffset} has no counterpart after patching`);
    return pos[newIndex];
  };

  records.forEach((record, i) => {
    if (record.type === RT.BOUNDSHEET) {
      setU32(record.data, 0, newPosOfOld(u32(record.data, 0)));
    } else if (record.type === RT.INDEX) {
      setU32(record.data, 12, newPosOfOld(u32(record.data, 12)));
      for (let o = 16; o + 4 <= record.data.length; o += 4) {
        setU32(record.data, o, newPosOfOld(u32(record.data, o)));
      }
    } else if (record.type === RT.DBCELL) {
      const recomputed = computeDbcell(records, pos, i);
      if (recomputed.length !== record.data.length) throw new Biff8Error("DBCELL row count changed");
      record.data.set(recomputed);
    }
  });
}

function workbookEntry(container: XLSX.CFB$Container) {
  const entry = XLSX.CFB.find(container, "Workbook") ?? XLSX.CFB.find(container, "Book");
  if (!entry?.content) throw new Biff8Error("no Workbook stream");
  return entry;
}

export function readWorkbookStream(fileBytes: Uint8Array): Uint8Array {
  const container = XLSX.CFB.read(fileBytes, { type: "buffer" });
  return new Uint8Array(workbookEntry(container).content as ArrayLike<number>);
}

/**
 * Before touching anything, recompute the DBCELL layout of the unmodified
 * stream and require it to equal what the file stores. If our reading of the
 * spec were wrong for this workbook, patching would stop here.
 */
function assertDbcellUnderstanding(records: BiffRecord[]) {
  const pos = positions(records);
  records.forEach((record, i) => {
    if (record.type !== RT.DBCELL) return;
    const recomputed = computeDbcell(records, pos, i);
    if (recomputed.length !== record.data.length || recomputed.some((b, k) => b !== record.data[k])) {
      throw new Biff8Error(`DBCELL at ${pos[i]} does not match the recomputed layout; refusing to patch`);
    }
  });
}

export function patchWorkbook(
  fileBytes: Uint8Array,
  sheetName: string,
  edits: CellEdit[],
  formulaEdits: FormulaCacheEdit[] = [],
): Uint8Array {
  const container = XLSX.CFB.read(fileBytes, { type: "buffer" });
  const entry = workbookEntry(container);
  const original = parseRecords(new Uint8Array(entry.content as ArrayLike<number>));
  assertDbcellUnderstanding(original);

  const sheet = locateSheets(original).find((s) => s.name === sheetName);
  if (!sheet) throw new Biff8Error(`sheet "${sheetName}" not found`);

  // Offsets in BOUNDSHEET/INDEX only ever point at non-cell records (BOF,
  // DEFCOLWIDTH, DBCELL), which pass through patching as the same objects.
  const cloned = original.map((r) => ({ type: r.type, data: r.data.slice() }));
  const oldToNew = new Map<BiffRecord, BiffRecord>(original.map((r, i) => [r, cloned[i]]));
  const patchedSlice = patchSheetCells(cloned.slice(sheet.bofIndex, sheet.eofIndex + 1), edits, formulaEdits);

  const records = [...cloned.slice(0, sheet.bofIndex), ...patchedSlice, ...cloned.slice(sheet.eofIndex + 1)];
  fixOffsets(records, oldToNew, original);

  entry.content = serialize(records) as unknown as typeof entry.content;
  entry.size = (entry.content as Uint8Array).length;
  return new Uint8Array(XLSX.CFB.write(container, { type: "buffer" }) as ArrayLike<number>);
}

export interface CellSnapshot {
  row: number;
  col: number;
  type: number;
  xf: number;
  /** Raw record bytes after the row/col/xf header, hex-encoded for comparison. */
  payload: string;
}

/** Every cell of a sheet, exploded from multi-cell records, for structural diffs. */
export function snapshotSheetCells(fileBytes: Uint8Array, sheetName: string): CellSnapshot[] {
  const records = parseRecords(readWorkbookStream(fileBytes));
  const sheet = locateSheets(records).find((s) => s.name === sheetName);
  if (!sheet) throw new Biff8Error(`sheet "${sheetName}" not found`);
  const hex = (d: Uint8Array) => Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
  const cells: CellSnapshot[] = [];
  for (const record of records.slice(sheet.bofIndex, sheet.eofIndex + 1)) {
    const row = cellRecordRow(record);
    if (row === null) continue;
    const [first, last] = cellRecordColumns(record);
    if (record.type === RT.MULBLANK) {
      for (let c = first; c <= last; c++) {
        cells.push({ row, col: c, type: RT.BLANK, xf: u16(record.data, 4 + (c - first) * 2), payload: "" });
      }
    } else if (record.type === RT.MULRK) {
      for (let c = first; c <= last; c++) {
        const o = 4 + (c - first) * 6;
        cells.push({ row, col: c, type: RT.RK, xf: u16(record.data, o), payload: hex(record.data.subarray(o + 2, o + 6)) });
      }
    } else {
      cells.push({ row, col: first, type: record.type, xf: u16(record.data, 4), payload: hex(record.data.subarray(6)) });
    }
  }
  return cells;
}

/** Non-cell records of the whole stream with offset-bearing records masked, for structural diffs. */
export function structuralRecords(fileBytes: Uint8Array): string[] {
  const records = parseRecords(readWorkbookStream(fileBytes));
  const hex = (d: Uint8Array) => Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
  return records
    .filter((r) => cellRecordRow(r) === null)
    .map((r) => {
      if (r.type === RT.BOUNDSHEET) return `0085:${hex(r.data.subarray(4))}`;
      if (r.type === RT.INDEX || r.type === RT.DBCELL) return `${r.type.toString(16)}:offsets`;
      return `${r.type.toString(16)}:${hex(r.data)}`;
    });
}

export const BIFF_RECORD_TYPES = RT;

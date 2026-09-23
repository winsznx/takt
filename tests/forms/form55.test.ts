import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { snapshotSheetCells, structuralRecords } from "@/lib/forms/biff8";
import { TemplateIntegrityError } from "@/lib/forms/form1";
import { FORM55_CELLS, fillForm55, form55Edits, type Form55Data } from "@/lib/forms/form55";
import { form55Template } from "../helpers/artifacts";

const week: Form55Data = {
  employerName: "Synthetic Bakery Co. (fixture)",
  employeeName: "Nguyễn Thị Ávila-Test",
  periods: [
    {
      periodStart: "2026-08-31",
      periodEnd: "2026-09-13",
      hourlyRate: "18.50",
      regularHours: "80.00",
      overtimeHours: "2.00",
      doubleTimeHours: "0.00",
      earned: "1535.50",
      paid: "1461.50",
      owed: "74.00",
    },
    {
      periodStart: "2026-09-14",
      periodEnd: "2026-09-27",
      hourlyRate: "18.50",
      regularHours: "76.33",
      overtimeHours: "0.00",
      doubleTimeHours: "0.00",
      earned: "1412.17",
      paid: "1412.17",
      owed: "0.00",
    },
  ],
};

describe("DLSE Form 55 workbook patch + independent readback", () => {
  it("rejects a template that is not the pinned official workbook", async () => {
    const template = await form55Template();
    const tampered = template.slice();
    tampered[600] ^= 0x01;
    await expect(fillForm55(tampered, week)).rejects.toBeInstanceOf(TemplateIntegrityError);
  });

  it("writes expected values that SheetJS reads back from the saved file", async () => {
    const out = await fillForm55(await form55Template(), week);
    const ws = XLSX.read(out, { type: "array", cellFormula: true }).Sheets.Sheet1;

    expect(ws.C3.v).toBe("Synthetic Bakery Co. (fixture)");
    expect(ws.H3.v).toBe("Nguyễn Thị Ávila-Test");
    expect(ws.B7.v).toBe("8/31/26 - 9/13/26");
    expect(ws.C7.v).toBe(18.5);
    expect(ws.D7.v).toBe(80);
    expect(ws.E7.v).toBe(27.75);
    expect(ws.F7.v).toBe(2);
    expect(ws.G7?.v).toBeUndefined();
    expect(ws.I7.v).toBe(1535.5);
    expect(ws.J7.v).toBe(1461.5);
    expect(ws.K7.v).toBe(74);
    expect(ws.B8.v).toBe("9/14/26 - 9/27/26");
    expect(ws.D8.v).toBe(76.33);
    expect(ws.E8?.v).toBeUndefined();
    expect(ws.B9?.v).toBeUndefined();

    // Totals row keeps the official SUM formulas with correct cached results.
    expect(ws.D25.f).toBe("SUM(D7:D24)");
    expect(ws.D25.v).toBeCloseTo(156.33, 10);
    expect(ws.I25.f).toBe("SUM(I7:I24)");
    expect(ws.I25.v).toBeCloseTo(2947.67, 10);
    expect(ws.K25.v).toBeCloseTo(74, 10);
    expect(ws.L25.v).toBe(0);
  });

  it("changes only mapped cells and keeps every original cell style", async () => {
    const template = await form55Template();
    const out = await fillForm55(template, week);

    expect(structuralRecords(out)).toEqual(structuralRecords(template));

    const key = (c: { row: number; col: number }) => `${c.row}:${c.col}`;
    const before = new Map(snapshotSheetCells(template, "Sheet1").map((c) => [key(c), c]));
    const after = new Map(snapshotSheetCells(out, "Sheet1").map((c) => [key(c), c]));
    const { cells, formulas } = form55Edits(week);
    const allowed = new Set([...cells, ...formulas].map(key));

    for (const [k, cell] of after) {
      const original = before.get(k);
      if (!original) {
        expect(allowed.has(k), `unexpected new cell ${k}`).toBe(true);
        continue;
      }
      expect(cell.xf, `style changed at ${k}`).toBe(original.xf);
      if (!allowed.has(k)) expect(cell, `unmapped cell changed at ${k}`).toEqual(original);
    }
    for (const k of before.keys()) expect(after.has(k), `cell ${k} disappeared`).toBe(true);
  });

  it("refuses periods with different pay rates on one sheet", () => {
    const mixed = { ...week, periods: [week.periods[0], { ...week.periods[1], hourlyRate: "19.00" }] };
    expect(() => form55Edits(mixed)).toThrow(/separate sheet/);
  });

  it("is byte-deterministic", async () => {
    const template = await form55Template();
    const [a, b] = await Promise.all([fillForm55(template, week), fillForm55(template, week)]);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  const soffice = spawnSync("soffice", ["--version"], { encoding: "utf8" });
  it.runIf(soffice.status === 0)("opens in LibreOffice and recalculates to the same totals", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "takt-f55-"));
    const xls = path.join(dir, "form55.xls");
    writeFileSync(xls, await fillForm55(await form55Template(), week));
    execFileSync(
      "soffice",
      [`-env:UserInstallation=file://${dir}/profile`, "--headless", "--norestore", "--convert-to", "csv", "--outdir", dir, xls],
      { stdio: "ignore", timeout: 120_000 },
    );
    const rows = readFileSync(path.join(dir, "form55.csv"), "latin1").split(/\r?\n/);
    const row7 = rows[FORM55_CELLS.firstPeriodRow].split(",");
    expect(row7[1]).toBe("8/31/26 - 9/13/26");
    expect(rows[FORM55_CELLS.totalsRow]).toMatch(/156\.33/);
  });
});

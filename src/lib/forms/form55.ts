import { z } from "zod";
import { assertTemplate } from "@/lib/forms/form1";
import { patchWorkbook, type CellEdit, type FormulaCacheEdit } from "@/lib/forms/biff8";

/**
 * DLSE Form 55, "Overtime, Rest Period, Meal Period Computation Form".
 *
 * The official workbook is a per-pay-period sheet (18 rows), one sheet per pay
 * rate. It has no daily start/end cells; daily times live in the evidence index
 * and calculation.csv. See README.md, "Official forms".
 */
export const FORM55_TEMPLATE_SHA256 = "a5be16bfa32aebe1b0a089572010d5fa8bb82ec404961efd41b5f1584ca73bb5";
export const FORM55_SHEET = "Sheet1";
export const FORM55_MAX_PERIODS = 18;

/** Zero-based cell coordinates in Sheet1. */
export const FORM55_CELLS = {
  employerName: { row: 2, col: 2 },
  employeeName: { row: 2, col: 7 },
  firstPeriodRow: 6,
  columns: {
    periodDates: 1,
    hourlyRate: 2,
    regularHours: 3,
    overtimeRate: 4,
    overtimeHours: 5,
    doubleTimeRate: 6,
    doubleTimeHours: 7,
    earned: 8,
    paid: 9,
    owed: 10,
  },
  totalsRow: 24,
  /** Columns in the totals row that hold SUM() formulas Takt updates. */
  totalColumns: [3, 5, 7, 8, 9, 10] as const,
} as const;

const money = z.string().regex(/^-?\d+\.\d{2}$/, "dollars with 2 decimals");
const hours = z.string().regex(/^\d+\.\d{2}$/, "hours with 2 decimals");

export const Form55PeriodSchema = z.object({
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hourlyRate: money,
  regularHours: hours,
  overtimeHours: hours,
  doubleTimeHours: hours,
  earned: money,
  paid: money,
  owed: money,
});
export type Form55Period = z.infer<typeof Form55PeriodSchema>;

export const Form55DataSchema = z.object({
  employerName: z.string().min(1).max(120),
  employeeName: z.string().min(1).max(120),
  periods: z.array(Form55PeriodSchema).min(1).max(FORM55_MAX_PERIODS),
});
export type Form55Data = z.infer<typeof Form55DataSchema>;

/** `2026-08-31` → `8/31/26` so a period range fits the official column width. */
export function shortUsDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${Number(month)}/${Number(day)}/${year.slice(2)}`;
}

export const periodLabel = (p: Pick<Form55Period, "periodStart" | "periodEnd">) =>
  `${shortUsDate(p.periodStart)} - ${shortUsDate(p.periodEnd)}`;

/** Exact decimal-string sum in hundredths, returned as a JS number for the cached formula value. */
function sumHundredths(values: string[]): number {
  const total = values.reduce((acc, v) => acc + BigInt(v.replace(".", "")), 0n);
  return Number(total) / 100;
}

const multiply = (rate: string, factor: 3 | 4) => {
  // rate * 1.5 or rate * 2, exactly, kept to the precision the form displays.
  const cents = BigInt(rate.replace(".", ""));
  const scaled = factor === 3 ? cents * 3n : cents * 4n;
  return Number(scaled) / 200;
};

export function form55Edits(input: Form55Data): { cells: CellEdit[]; formulas: FormulaCacheEdit[] } {
  const data = Form55DataSchema.parse(input);
  const rates = new Set(data.periods.map((p) => p.hourlyRate));
  if (rates.size > 1) {
    throw new Error("Form 55 requires a separate sheet for each pay rate; split periods by rate first");
  }

  const C = FORM55_CELLS;
  const cells: CellEdit[] = [
    { ...C.employerName, value: { kind: "string", value: data.employerName } },
    { ...C.employeeName, value: { kind: "string", value: data.employeeName } },
  ];
  const num = (value: number) => ({ kind: "number" as const, value });

  data.periods.forEach((p, i) => {
    const row = C.firstPeriodRow + i;
    const col = C.columns;
    cells.push(
      { row, col: col.periodDates, value: { kind: "string", value: periodLabel(p) } },
      { row, col: col.hourlyRate, value: num(Number(p.hourlyRate)) },
      { row, col: col.regularHours, value: num(Number(p.regularHours)) },
      { row, col: col.earned, value: num(Number(p.earned)) },
      { row, col: col.paid, value: num(Number(p.paid)) },
      { row, col: col.owed, value: num(Number(p.owed)) },
    );
    if (p.overtimeHours !== "0.00") {
      cells.push(
        { row, col: col.overtimeRate, value: num(multiply(p.hourlyRate, 3)) },
        { row, col: col.overtimeHours, value: num(Number(p.overtimeHours)) },
      );
    }
    if (p.doubleTimeHours !== "0.00") {
      cells.push(
        { row, col: col.doubleTimeRate, value: num(multiply(p.hourlyRate, 4)) },
        { row, col: col.doubleTimeHours, value: num(Number(p.doubleTimeHours)) },
      );
    }
  });

  const column = (pick: (p: Form55Period) => string) => sumHundredths(data.periods.map(pick));
  const totals: Record<(typeof C.totalColumns)[number], number> = {
    3: column((p) => p.regularHours),
    5: column((p) => p.overtimeHours),
    7: column((p) => p.doubleTimeHours),
    8: column((p) => p.earned),
    9: column((p) => p.paid),
    10: column((p) => p.owed),
  };
  const formulas = C.totalColumns.map((col) => ({ row: C.totalsRow, col, value: totals[col] }));
  return { cells, formulas };
}

export async function fillForm55(templateBytes: Uint8Array, input: Form55Data): Promise<Uint8Array> {
  await assertTemplate(templateBytes, FORM55_TEMPLATE_SHA256, "Form 55");
  const { cells, formulas } = form55Edits(input);
  return patchWorkbook(templateBytes, FORM55_SHEET, cells, formulas);
}

import { Rational } from "@/lib/calc/rational";
import type { PeriodCalculation } from "@/lib/domain/contracts";

const HEADER = ["period_id", "period_start", "period_end", "date", "rule_id", "label", "minutes", "rate", "multiplier", "exact_amount", "amount_rounded"];

const cell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * One row per calculation line, then one summary row per period. Every
 * number can be re-derived: minutes × rate × multiplier ÷ 60 = exact_amount.
 */
export function calculationCsv(calculations: PeriodCalculation[]): string {
  const rows: (string | number)[][] = [HEADER];
  for (const c of calculations) {
    for (const line of c.lines) {
      rows.push([c.periodId, c.periodStart, c.periodEnd, line.date ?? "", line.ruleId, line.label, line.minutes, line.rate, line.multiplier, line.exactAmount, Rational.parse(line.exactAmount).toFixed(2)]);
    }
    const summary = (label: string, amount: string) => rows.push([c.periodId, c.periodStart, c.periodEnd, "", "SUMMARY", label, "", "", "", "", amount]);
    summary(`state:${c.state}`, "");
    summary("earned_regular", c.earned.regular);
    summary("earned_overtime", c.earned.overtime);
    summary("earned_double_time", c.earned.doubleTime);
    summary("earned_total", c.earned.total);
    summary("paid_total", c.paid.total);
    summary("owed", c.owed);
  }
  return `${rows.map((r) => r.map(cell).join(",")).join("\n")}\n`;
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

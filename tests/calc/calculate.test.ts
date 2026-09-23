import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { calculatePeriod, classifyWorkweek, minutesByWorkday } from "@/lib/calc/calculate";
import { Rational } from "@/lib/calc/rational";
import type { DayReconciliation, PayrollRecord } from "@/lib/domain/contracts";
import type { CalculableDay } from "@/lib/domain/reconcile";
import { addDays } from "@/lib/domain/time";
import { supportedScope } from "../helpers/facts";

const week = (minutes: number[], start = "2026-08-31") => minutes.map((m, i) => ({ date: addDays(start, i), minutes: m }));

describe("California workweek classification", () => {
  it("pays daily overtime over 8 and double time over 12", () => {
    const [day] = classifyWorkweek(week([13 * 60, 0, 0, 0, 0, 0, 0]));
    expect(day).toMatchObject({ regular: 480, overtime: 240, doubleTime: 60 });
  });

  it("does not count daily overtime toward the weekly 40", () => {
    const days = classifyWorkweek(week([540, 540, 540, 540, 540, 0, 0]));
    expect(days.reduce((a, d) => a + d.regular, 0)).toBe(2400);
    expect(days.reduce((a, d) => a + d.overtime, 0)).toBe(300);
  });

  it("moves regular hours past 40 into weekly overtime", () => {
    const days = classifyWorkweek(week([480, 480, 480, 480, 480, 480, 0]));
    expect(days[5]).toMatchObject({ regular: 0, overtime: 480, weeklyOvertime: 480 });
  });

  it("applies the seventh-consecutive-day rule only when all seven days were worked", () => {
    const seven = classifyWorkweek(week([480, 480, 480, 480, 480, 480, 600]));
    expect(seven[6]).toMatchObject({ seventhDay: true, regular: 0, overtime: 480, doubleTime: 120 });
    const six = classifyWorkweek(week([480, 480, 480, 480, 480, 0, 600]));
    expect(six[6].seventhDay).toBe(false);
  });

  it("conserves minutes and respects every cap (property)", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 1200 }), { minLength: 7, maxLength: 7 }), (mins) => {
        const days = classifyWorkweek(week(mins));
        const regularTotal = days.reduce((a, d) => a + d.regular, 0);
        return (
          days.every((d, i) => d.regular + d.overtime + d.doubleTime === mins[i]) &&
          days.every((d) => d.regular <= 480 && d.regular >= 0 && d.overtime >= 0 && d.doubleTime >= 0) &&
          regularTotal <= 2400
        );
      }),
    );
  });

  it("splits overnight shifts at midnight and takes the meal from the longer part", () => {
    const result = minutesByWorkday([{ date: "2026-09-04", startMinute: 22 * 60, endMinute: 30 * 60, mealBreakMinutes: 30, basis: "employer_record" }]);
    expect(result).toEqual([
      { date: "2026-09-04", minutes: 120 },
      { date: "2026-09-05", minutes: 330 },
    ]);
  });
});

const period: PayrollRecord = {
  id: "period-2026-08-31",
  periodStart: "2026-08-31",
  periodEnd: "2026-09-13",
  payDate: "2026-09-18",
  hourlyRate: "18.50",
  regularHours: "80.00",
  overtimeHours: "0",
  doubleTimeHours: "0",
  regularPay: "1480.00",
  overtimePay: "0",
  doubleTimePay: "0",
  grossPay: "1480.00",
  otherEarnings: [],
  factIds: ["p1"],
};

const consistentDay = (date: string): DayReconciliation => ({
  date,
  state: "CONSISTENT",
  schedule: null,
  employerRecord: null,
  confirmedWork: null,
  messageFactIds: [],
  discrepancyIds: [],
  reasons: [],
});

function workdays(extraFirstDay = 0): CalculableDay[] {
  const days: CalculableDay[] = [];
  for (let i = 0; i < 14; i++) {
    const date = addDays("2026-08-31", i);
    if (i % 7 >= 5) continue;
    days.push({ date, startMinute: 480 - (i === 1 ? extraFirstDay : 0), endMinute: 16 * 60 + 30, mealBreakMinutes: 30, basis: "employer_record" });
  }
  return days;
}

describe("Takt Calc per pay period", () => {
  it("earns exactly what was paid when records agree", () => {
    const calculable = workdays();
    const result = calculatePeriod({ period, calculable, days: calculable.map((d) => consistentDay(d.date)), scope: supportedScope() });
    expect(result.state).toBe("CALCULATED");
    expect(result.earned.total).toBe("1480.00");
    expect(result.owed).toBe("0.00");
  });

  it("prices 20 extra minutes as daily overtime at 1.5x", () => {
    const calculable = workdays(20);
    const result = calculatePeriod({ period, calculable, days: calculable.map((d) => consistentDay(d.date)), scope: supportedScope() });
    expect(result.workedMinutes).toEqual({ regular: 4800, overtime: 20, doubleTime: 0 });
    expect(result.earned.overtime).toBe("9.25");
    expect(result.owed).toBe("9.25");
    expect(result.ruleIds).toContain("CA-OT-DAILY-8");
    const line = result.lines.find((l) => l.ruleId === "CA-OT-DAILY-8")!;
    expect(Rational.parse(line.exactAmount).toFixed(2)).toBe("9.25");
  });

  it("blocks when a day in the workweek is unresolved", () => {
    const calculable = workdays();
    const days = calculable.map((d) => consistentDay(d.date));
    days[3] = { ...days[3], state: "AMBIGUOUS", reasons: ["two records disagree"] };
    const result = calculatePeriod({ period, calculable, days, scope: supportedScope() });
    expect(result.state).toBe("CALCULATION_BLOCKED");
    expect(result.owed).toBe("0.00");
  });

  it("blocks when the period has earnings that change the regular rate", () => {
    const calculable = workdays(20);
    const result = calculatePeriod({
      period: { ...period, otherEarnings: [{ label: "Piece Rate (412 units)", amount: "309.00" }] },
      calculable,
      days: calculable.map((d) => consistentDay(d.date)),
      scope: supportedScope(),
    });
    expect(result.state).toBe("CALCULATION_BLOCKED");
    expect(result.blockedReasons[0]).toMatch(/regular rate/);
  });

  it("refuses rates below the state minimum wage", () => {
    const calculable = workdays();
    const result = calculatePeriod({
      period: { ...period, hourlyRate: "15.00" },
      calculable,
      days: calculable.map((d) => consistentDay(d.date)),
      scope: supportedScope(),
    });
    expect(result.state).toBe("CALCULATION_BLOCKED");
    expect(result.blockedReasons[0]).toMatch(/minimum wage/);
  });

  it("never lowers earned pay when worked minutes grow (property)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 470 }), fc.integer({ min: 0, max: 470 }), (a, b) => {
        const earn = (extra: number) =>
          Rational.fromDecimal(
            calculatePeriod({
              period,
              calculable: workdays(extra),
              days: workdays(extra).map((d) => consistentDay(d.date)),
              scope: supportedScope(),
            }).earned.total,
          );
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        return earn(lo).compare(earn(hi)) <= 0;
      }),
      { numRuns: 40 },
    );
  });
});

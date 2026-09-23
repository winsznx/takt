import type {
  CalculationLine,
  DayReconciliation,
  PayrollRecord,
  PeriodCalculation,
  ScopeAnswers,
  ScopeDecision,
} from "@/lib/domain/contracts";
import type { CalculableDay } from "@/lib/domain/reconcile";
import { addDays, compareDates, dayOfWeek, elapsedWallMinutes, MINUTES_PER_DAY } from "@/lib/domain/time";
import { Rational, sum } from "@/lib/calc/rational";
import { RULES, STATE_MINIMUM_WAGE } from "@/lib/rules/ca-dlse-2026-09";

/**
 * Takt Calc. Classifies confirmed worked minutes into regular, overtime, and
 * double time under the pinned California rules, then prices them exactly.
 * No model is involved.
 */

export interface DayMinutes {
  date: string;
  minutes: number;
}

export interface ClassifiedDay {
  date: string;
  regular: number;
  overtime: number;
  doubleTime: number;
  seventhDay: boolean;
  weeklyOvertime: number;
}

/**
 * Splits confirmed intervals at midnight into per-calendar-day minutes (the
 * `MIDNIGHT_WORKDAY` assumption). The meal break is taken from the longer
 * part. Returns null for a day whose clock readings cannot be placed because
 * of daylight saving.
 */
export function minutesByWorkday(days: CalculableDay[]): DayMinutes[] | { error: string } {
  const totals = new Map<string, number>();
  for (const day of days) {
    const parts: { date: string; minutes: number }[] = [];
    const firstEnd = Math.min(day.endMinute, MINUTES_PER_DAY);
    const first = elapsedWallMinutes(day.date, day.startMinute, firstEnd);
    if (!first.ok) return { error: `${day.date}: ${first.reason}` };
    parts.push({ date: day.date, minutes: first.minutes });
    if (day.endMinute > MINUTES_PER_DAY) {
      const nextDate = addDays(day.date, 1);
      const second = elapsedWallMinutes(nextDate, 0, day.endMinute - MINUTES_PER_DAY);
      if (!second.ok) return { error: `${nextDate}: ${second.reason}` };
      parts.push({ date: nextDate, minutes: second.minutes });
    }
    const longest = parts.reduce((a, b) => (b.minutes > a.minutes ? b : a));
    longest.minutes -= day.mealBreakMinutes;
    if (longest.minutes < 0) return { error: `${day.date}: meal break is longer than the time worked` };
    for (const part of parts) totals.set(part.date, (totals.get(part.date) ?? 0) + part.minutes);
  }
  return [...totals.entries()].map(([date, minutes]) => ({ date, minutes })).sort((a, b) => compareDates(a.date, b.date));
}

export function workweekStart(date: string, startDay: number): string {
  return addDays(date, -((dayOfWeek(date) - startDay + 7) % 7));
}

/**
 * Standard California classification for one workweek:
 * daily >8 → 1.5x, daily >12 → 2x, regular hours beyond 40 → 1.5x, and on the
 * seventh consecutive day worked in the workweek the first 8 hours → 1.5x and
 * the rest → 2x. Daily premium minutes do not count toward the weekly 40.
 */
export function classifyWorkweek(week: DayMinutes[]): ClassifiedDay[] {
  const sorted = [...week].sort((a, b) => compareDates(a.date, b.date));
  const workedAllSeven = sorted.length === 7 && sorted.every((d) => d.minutes > 0);
  let weeklyRegular = 0;
  return sorted.map((day, index) => {
    const m = day.minutes;
    const seventhDay = workedAllSeven && index === 6;
    let regular: number;
    let overtime: number;
    let doubleTime: number;
    if (seventhDay) {
      regular = 0;
      overtime = Math.min(m, 480);
      doubleTime = Math.max(m - 480, 0);
    } else {
      regular = Math.min(m, 480);
      overtime = Math.min(Math.max(m - 480, 0), 240);
      doubleTime = Math.max(m - 720, 0);
    }
    let weeklyOvertime = 0;
    if (weeklyRegular + regular > 2400) {
      weeklyOvertime = weeklyRegular + regular - 2400;
      regular -= weeklyOvertime;
      overtime += weeklyOvertime;
    }
    weeklyRegular += regular;
    return { date: day.date, regular, overtime, doubleTime, seventhDay, weeklyOvertime };
  });
}

export interface CalculateInput {
  period: PayrollRecord;
  calculable: CalculableDay[];
  days: DayReconciliation[];
  scope: { answers: ScopeAnswers; decision: ScopeDecision };
}

const MULTIPLIERS = { "1": Rational.of(1), "1.5": Rational.of(3, 2), "2": Rational.of(2) } as const;

export function exactLineAmount(minutes: number, rate: string, multiplier: CalculationLine["multiplier"]): Rational {
  return Rational.of(minutes).mul(Rational.fromDecimal(rate)).mul(MULTIPLIERS[multiplier]).div(Rational.of(60));
}

export function calculatePeriod(input: CalculateInput): PeriodCalculation {
  const { period, scope } = input;
  const blockedReasons: string[] = [];
  const inPeriod = (date: string) =>
    compareDates(date, period.periodStart) >= 0 && compareDates(date, period.periodEnd) <= 0;

  const paidRegular = Rational.fromDecimal(period.regularPay);
  const paidOvertime = Rational.fromDecimal(period.overtimePay);
  const paidDouble = Rational.fromDecimal(period.doubleTimePay);
  const paid = {
    regular: paidRegular.toFixed(2),
    overtime: paidOvertime.toFixed(2),
    doubleTime: paidDouble.toFixed(2),
    total: paidRegular.add(paidOvertime).add(paidDouble).toFixed(2),
  };

  const blocked = (): PeriodCalculation => ({
    periodId: period.id,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    state: "CALCULATION_BLOCKED",
    blockedReasons,
    ruleIds: [],
    lines: [],
    workedMinutes: { regular: 0, overtime: 0, doubleTime: 0 },
    earned: { regular: "0.00", overtime: "0.00", doubleTime: "0.00", total: "0.00" },
    paid,
    owed: "0.00",
    rounding: "half-up-to-cent-per-period-component",
  });

  if (!scope.decision.supported) {
    blockedReasons.push("This case is outside Takt's supported rules.");
    return blocked();
  }
  const startDay = scope.answers.workweekStartDay;
  if (startDay === null) {
    blockedReasons.push("The workweek start day is unknown.");
    return blocked();
  }
  if (Rational.fromDecimal(period.hourlyRate).compare(Rational.fromDecimal(STATE_MINIMUM_WAGE)) < 0) {
    blockedReasons.push(
      `The hourly rate $${period.hourlyRate} is below the California minimum wage ($${STATE_MINIMUM_WAGE}). Takt does not calculate minimum wage claims; the Labor Commissioner can.`,
    );
    return blocked();
  }

  const weekStarts = new Set<string>();
  for (let date = period.periodStart; compareDates(date, period.periodEnd) <= 0; date = addDays(date, 1)) {
    weekStarts.add(workweekStart(date, startDay));
  }
  const relevantDates = new Set<string>();
  for (const ws of weekStarts) for (let i = 0; i < 7; i++) relevantDates.add(addDays(ws, i));

  for (const day of input.days) {
    if (!relevantDates.has(day.date)) continue;
    if (day.state === "AMBIGUOUS" || day.state === "UNSUPPORTED_RULE") {
      blockedReasons.push(`${day.date} is ${day.state === "AMBIGUOUS" ? "unresolved" : "unsupported"}: ${day.reasons.join(" ")}`);
    }
  }
  if (blockedReasons.length > 0) return blocked();

  const perDay = minutesByWorkday(input.calculable.filter((d) => relevantDates.has(d.date) || relevantDates.has(addDays(d.date, 1))));
  if ("error" in perDay) {
    blockedReasons.push(perDay.error);
    return blocked();
  }

  const lines: CalculationLine[] = [];
  const ruleIds = new Set<string>([RULES.rounding.id]);
  const totals = { regular: 0, overtime: 0, doubleTime: 0 };

  for (const ws of [...weekStarts].sort(compareDates)) {
    const weekDates = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
    const week = weekDates.map((date) => ({ date, minutes: perDay.find((d) => d.date === date)?.minutes ?? 0 }));
    for (const day of classifyWorkweek(week)) {
      if (!inPeriod(day.date)) continue;
      const push = (ruleId: string, label: string, minutes: number, multiplier: CalculationLine["multiplier"]) => {
        if (minutes <= 0) return;
        ruleIds.add(ruleId);
        lines.push({
          ruleId,
          label,
          date: day.date,
          minutes,
          multiplier,
          rate: period.hourlyRate,
          exactAmount: exactLineAmount(minutes, period.hourlyRate, multiplier).toString(),
        });
      };
      push(RULES.regularHourly.id, "Regular hours", day.regular, "1");
      if (day.seventhDay) {
        push(RULES.seventhDayOvertime.id, "Seventh consecutive day, first 8 hours", day.overtime - day.weeklyOvertime, "1.5");
        push(RULES.seventhDayDoubleTime.id, "Seventh consecutive day, over 8 hours", day.doubleTime, "2");
      } else {
        push(RULES.dailyOvertime.id, "Daily overtime (over 8 hours)", day.overtime - day.weeklyOvertime, "1.5");
        push(RULES.dailyDoubleTime.id, "Daily double time (over 12 hours)", day.doubleTime, "2");
      }
      push(RULES.weeklyOvertime.id, "Weekly overtime (over 40 regular hours)", day.weeklyOvertime, "1.5");
      totals.regular += day.regular;
      totals.overtime += day.overtime;
      totals.doubleTime += day.doubleTime;
    }
  }

  const component = (multiplier: CalculationLine["multiplier"]) =>
    sum(lines.filter((l) => l.multiplier === multiplier).map((l) => Rational.parse(l.exactAmount))).roundToCents();
  const earnedRegular = component("1");
  const earnedOvertime = component("1.5");
  const earnedDouble = component("2");
  const earnedTotal = earnedRegular.add(earnedOvertime).add(earnedDouble);
  const owed = earnedTotal.sub(paidRegular.add(paidOvertime).add(paidDouble));

  return {
    periodId: period.id,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    state: "CALCULATED",
    blockedReasons: [],
    ruleIds: [...ruleIds].sort(),
    lines,
    workedMinutes: totals,
    earned: {
      regular: earnedRegular.toFixed(2),
      overtime: earnedOvertime.toFixed(2),
      doubleTime: earnedDouble.toFixed(2),
      total: earnedTotal.toFixed(2),
    },
    paid,
    owed: owed.toFixed(2),
    rounding: "half-up-to-cent-per-period-component",
  };
}

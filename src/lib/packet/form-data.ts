import { formatMoney, Rational, sum } from "@/lib/calc/rational";
import type { ClaimantDetails, PeriodCalculation } from "@/lib/domain/contracts";
import type { CaseAnalysis } from "@/lib/domain/analyze";
import type { CalculableDay } from "@/lib/domain/reconcile";
import { addDays, minutesToClock, toForm1Clock, toUsDate } from "@/lib/domain/time";
import type { Form1Data } from "@/lib/forms/form1";
import { FORM55_MAX_PERIODS, type Form55Data } from "@/lib/forms/form55";
import { workweekStart } from "@/lib/calc/calculate";

type TypicalWeek = Extract<Form1Data["schedule"], { regularity: "regular" }>["typicalWeek"];

const money = (decimal: string) => formatMoney(Rational.fromDecimal(decimal).toFixed(2));
const orEmpty = (s: string) => (s.trim() === "" ? undefined : s.trim());

export function claimedCalculations(analysis: CaseAnalysis): PeriodCalculation[] {
  return analysis.calculations.filter((c) => analysis.claimedPeriodIds.includes(c.periodId));
}

/** Form 1 values derived only from worker-entered details and the deterministic calculation. */
export function buildForm1Data(details: ClaimantDetails, analysis: CaseAnalysis, workweekStartDay: number): Form1Data {
  const claimed = claimedCalculations(analysis);
  if (claimed.length === 0) throw new Error("No calculated period has an amount owed; Form 1 has nothing to claim.");
  const rates = new Set(analysis.reconciliation.payroll.filter((p) => analysis.claimedPeriodIds.includes(p.id)).map((p) => p.hourlyRate));
  const [rate] = [...rates];
  const start = claimed.map((c) => c.periodStart).sort()[0];
  const end = claimed.map((c) => c.periodEnd).sort().at(-1)!;
  const regularEarned = sum(claimed.map((c) => Rational.fromDecimal(c.earned.regular)));
  const premiumEarned = sum(claimed.flatMap((c) => [Rational.fromDecimal(c.earned.overtime), Rational.fromDecimal(c.earned.doubleTime)]));

  return {
    claimant: {
      firstName: details.firstName,
      lastName: details.lastName,
      cellPhone: orEmpty(details.phone),
      email: orEmpty(details.email),
      mailingAddress: orEmpty(details.mailingAddress),
      city: orEmpty(details.city),
      state: orEmpty(details.state),
      zip: orEmpty(details.zip),
    },
    employer: {
      name: details.employerName,
      phone: orEmpty(details.employerPhone),
      address: orEmpty(details.employerAddress),
      city: orEmpty(details.employerCity),
      state: orEmpty(details.employerState),
      zip: orEmpty(details.employerZip),
      workPerformed: orEmpty(details.workPerformed),
    },
    employment: {
      hireDate: details.hireDate ? toUsDate(details.hireDate) : undefined,
      status: details.employmentStatus ?? undefined,
      separationDate: details.separationDate ? toUsDate(details.separationDate) : undefined,
      paidHow: details.paidHow ?? undefined,
    },
    pay: {
      hourly: "YES",
      ratePaidPerHour: rates.size === 1 ? money(rate) : undefined,
      multipleRates: rates.size > 1 ? "YES" : "NO",
      fixedAmount: "NO",
      pieceRate: "NO",
      commission: "NO",
    },
    schedule:
      details.scheduleRegularity === "irregular"
        ? { regularity: "irregular" }
        : { regularity: "regular", typicalWeek: typicalWeek(analysis.reconciliation.calculable, start, workweekStartDay) },
    claims: {
      regularWages: { start: toUsDate(start), end: toUsDate(end), amountEarned: money(regularEarned.toFixed(2)) },
      overtimeWages:
        premiumEarned.compare(Rational.ZERO) > 0
          ? { start: toUsDate(start), end: toUsDate(end), amountEarned: money(premiumEarned.toFixed(2)) }
          : undefined,
    },
    totals: {
      subtotal: money(analysis.totals.earned),
      totalPaid: money(analysis.totals.paid),
      grandTotalOwed: money(analysis.totals.owed),
    },
  };
}

/** The first full workweek of confirmed work, day 1 = the employer's workweek start day. */
function typicalWeek(days: CalculableDay[], claimStart: string, startDay: number): TypicalWeek {
  const weekStart = workweekStart(claimStart, startDay);
  return Array.from({ length: 7 }, (_, i) => {
    const day = days.find((d) => d.date === addDays(weekStart, i));
    if (!day) return null;
    return {
      start: toForm1Clock(minutesToClock(day.startMinute)),
      end: toForm1Clock(minutesToClock(day.endMinute)),
    };
  });
}

/** One Form 55 workbook per hourly rate, at most 18 pay periods each. */
export function buildForm55Data(details: ClaimantDetails, analysis: CaseAnalysis): { rate: string; data: Form55Data; periodIds: string[] }[] {
  if (details.scheduleRegularity !== "irregular") return [];
  const claimed = claimedCalculations(analysis);
  const rateOf = new Map(analysis.reconciliation.payroll.map((p) => [p.id, Rational.fromDecimal(p.hourlyRate).toFixed(2)]));
  const byRate = new Map<string, PeriodCalculation[]>();
  for (const c of claimed) byRate.set(rateOf.get(c.periodId)!, [...(byRate.get(rateOf.get(c.periodId)!) ?? []), c]);

  const out: { rate: string; data: Form55Data; periodIds: string[] }[] = [];
  for (const [rate, periods] of [...byRate.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    for (let i = 0; i < periods.length; i += FORM55_MAX_PERIODS) {
      const chunk = periods.slice(i, i + FORM55_MAX_PERIODS);
      out.push({
        rate,
        periodIds: chunk.map((c) => c.periodId),
        data: {
          employerName: details.employerName,
          employeeName: `${details.firstName} ${details.lastName}`,
          periods: chunk.map((c) => ({
            periodStart: c.periodStart,
            periodEnd: c.periodEnd,
            hourlyRate: rate,
            regularHours: Rational.of(c.workedMinutes.regular, 60).toFixed(2),
            overtimeHours: Rational.of(c.workedMinutes.overtime, 60).toFixed(2),
            doubleTimeHours: Rational.of(c.workedMinutes.doubleTime, 60).toFixed(2),
            earned: c.earned.total,
            paid: c.paid.total,
            owed: c.owed,
          })),
        },
      });
    }
  }
  return out;
}

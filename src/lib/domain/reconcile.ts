import {
  authoritativeValue,
  type DayReconciliation,
  type DecisionState,
  type Discrepancy,
  type EvidenceDocument,
  type EvidenceFact,
  type FactValue,
  type PayrollRecord,
  type ScopeDecision,
  type WorkerConfirmation,
  type WorkInterval,
} from "@/lib/domain/contracts";
import {
  clockToMinutes,
  compareDates,
  elapsedWallMinutes,
  formatClock12,
  formatDuration,
  intervalMinutes,
  minutesToClock,
} from "@/lib/domain/time";
import { Rational } from "@/lib/calc/rational";
import { RULES } from "@/lib/rules/ca-dlse-2026-09";

/**
 * Takt Line + Takt Diff. Aligns the employer time record, the schedule,
 * manager messages, and the worker's own confirmation for each day, then
 * compares employer time records with wage statements for each pay period.
 *
 * Deterministic: same facts and confirmations in, same result out.
 */

type Usable<K extends FactValue["kind"]> = { fact: EvidenceFact; value: Extract<FactValue, { kind: K }> };

export interface ReconcileInput {
  documents: EvidenceDocument[];
  facts: EvidenceFact[];
  confirmations: WorkerConfirmation[];
  scope: ScopeDecision | null;
}

/** The interval a calculation may use for a day, and which evidence stands behind it. */
export interface CalculableDay {
  date: string;
  startMinute: number;
  endMinute: number;
  mealBreakMinutes: number;
  basis: "employer_record" | "supported_confirmation";
}

export interface ReconcileResult {
  days: DayReconciliation[];
  discrepancies: Discrepancy[];
  payroll: PayrollRecord[];
  payrollProblems: { documentId: string; reason: string }[];
  calculable: CalculableDay[];
  unreviewedFactIds: string[];
}

export function reconcile(input: ReconcileInput): ReconcileResult {
  const activeDocs = new Map(
    input.documents.filter((d) => d.status !== "duplicate" && d.duplicateOf === null).map((d) => [d.id, d]),
  );
  const facts = input.facts.filter((f) => activeDocs.has(f.documentId));
  const unreviewedFactIds = facts.filter((f) => f.consequential && f.review === "unreviewed").map((f) => f.id);
  const unreviewedDates = new Set(
    facts.filter((f) => f.consequential && f.review === "unreviewed").flatMap((f) => factDates(f.extracted)),
  );

  const usable = facts.flatMap((fact) => {
    const value = authoritativeValue(fact);
    return value ? [{ fact, value, docClass: activeDocs.get(fact.documentId)?.docClass ?? null }] : [];
  });
  const byKind = <K extends FactValue["kind"]>(kind: K, docClass?: EvidenceDocument["docClass"]): Usable<K>[] =>
    usable
      .filter((u) => u.value.kind === kind && (docClass === undefined || u.docClass === docClass))
      .map((u) => ({ fact: u.fact, value: u.value as Extract<FactValue, { kind: K }> }));

  const recordIns = byKind("time_in", "time_record");
  const recordOuts = byKind("time_out", "time_record");
  const recordMeals = byKind("meal_break", "time_record");
  const schedStarts = byKind("scheduled_start");
  const schedEnds = byKind("scheduled_end");
  const messages = byKind("message_time_reference");

  const latestConfirmation = new Map<string, Extract<WorkerConfirmation, { type: "worked_interval" }>>();
  for (const c of input.confirmations) {
    if (c.type !== "worked_interval") continue;
    const previous = latestConfirmation.get(c.date);
    if (!previous || previous.at <= c.at) latestConfirmation.set(c.date, c);
  }

  const dates = [
    ...new Set([
      ...[...recordIns, ...recordOuts, ...schedStarts, ...schedEnds, ...messages].map((u) => u.value.date),
      ...latestConfirmation.keys(),
    ]),
  ].sort(compareDates);

  const days: DayReconciliation[] = [];
  const discrepancies: Discrepancy[] = [];
  const calculable: CalculableDay[] = [];
  const scopeSupported = input.scope?.supported ?? false;

  for (const date of dates) {
    const on = <T extends { value: { date: string } }>(list: T[]) => list.filter((u) => u.value.date === date);
    const reasons: string[] = [];
    const dayDiscrepancies: Discrepancy[] = [];

    const record = employerInterval(date, on(recordIns), on(recordOuts), on(recordMeals));
    const schedule = scheduleInterval(date, on(schedStarts), on(schedEnds));
    const dayMessages = on(messages);
    const confirmation = latestConfirmation.get(date) ?? null;
    const confirmed = confirmation?.worked ? confirmedInterval(confirmation) : null;

    const finish = (state: DecisionState) => {
      days.push({
        date,
        state,
        schedule: schedule.interval,
        employerRecord: record.interval,
        confirmedWork: confirmed,
        messageFactIds: dayMessages.map((m) => m.fact.id),
        discrepancyIds: dayDiscrepancies.map((d) => d.id),
        reasons,
      });
      discrepancies.push(...dayDiscrepancies);
    };

    if (!scopeSupported) {
      reasons.push("This case is outside Takt's supported rules, so no day is assessed.");
      finish("UNSUPPORTED_RULE");
      continue;
    }
    if (unreviewedDates.has(date)) {
      reasons.push("Some facts for this day have not been reviewed yet.");
      finish("AMBIGUOUS");
      continue;
    }
    if (record.problem || schedule.problem) {
      reasons.push(...[record.problem, schedule.problem].filter((p): p is string => Boolean(p)));
      finish("AMBIGUOUS");
      continue;
    }

    const evidence = supportingEvidence(schedule, dayMessages, record.interval);

    if (!confirmation) {
      if (!record.interval) {
        reasons.push("No employer time record for this day, and you have not said whether you worked.");
        finish("INSUFFICIENT_EVIDENCE");
        continue;
      }
      const conflicts = evidence.starts.some((e) => e.minute !== record.interval!.startMinute) ||
        evidence.ends.some((e) => e.minute !== record.interval!.endMinute);
      if (conflicts) {
        reasons.push("Other records show different times than the employer time record. Tell Takt when you actually worked.");
        finish("AMBIGUOUS");
        continue;
      }
      calculable.push(fromInterval(record.interval, "employer_record"));
      reasons.push("The employer time record is the only account of this day, or every record agrees with it.");
      finish("CONSISTENT");
      continue;
    }

    if (!confirmation.worked) {
      if (record.interval) {
        reasons.push("You said you did not work this day, but the employer recorded time. A person should review this.");
        finish("AMBIGUOUS");
      } else {
        reasons.push("You said you did not work this day and no employer time was recorded.");
        finish("CONSISTENT");
      }
      continue;
    }

    const work = confirmed!;
    const failure = elapsedFailure(work);
    if (failure) {
      reasons.push(failure);
      finish("AMBIGUOUS");
      continue;
    }

    if (!record.interval) {
      const start = supportBoundary("start", work.startMinute, null, evidence.starts);
      const end = supportBoundary("end", work.endMinute, null, evidence.ends);
      if (start.supported === null || end.supported === null) {
        reasons.push(
          "You confirmed working this day, but there is no employer time record and other records do not show both when you started and when you stopped.",
        );
        finish("INSUFFICIENT_EVIDENCE");
        continue;
      }
      const calc: CalculableDay = {
        date,
        startMinute: start.supported,
        endMinute: end.supported,
        mealBreakMinutes: work.mealBreakMinutes,
        basis: "supported_confirmation",
      };
      const minutes = workedMinutesOf(calc);
      if (minutes === null) {
        reasons.push("The supported times cannot be placed on the clock because of a daylight-saving change.");
        finish("AMBIGUOUS");
        continue;
      }
      dayDiscrepancies.push({
        id: `disc-${date}-missing`,
        type: "missing_worked_interval",
        scope: { date, periodId: null },
        expected: `${clockLabel(start.supported)}–${clockLabel(end.supported)}`,
        observed: "no employer time record",
        deltaMinutes: minutes,
        deltaAmount: null,
        supportingFactIds: [...start.factIds, ...end.factIds],
        confirmationIds: [confirmation.id],
        ruleId: RULES.missingInterval.id,
        explanation: `You confirmed working ${clockLabel(start.supported)} to ${clockLabel(end.supported)}. Your schedule or messages show the same times, and the employer's time record has no entry for this day.`,
      });
      noteUnsupported(reasons, "start", work.startMinute, start.supported);
      noteUnsupported(reasons, "end", work.endMinute, end.supported);
      calculable.push(calc);
      finish("DISCREPANCY_DETECTED");
      continue;
    }

    const rec = record.interval;
    let calcStart = rec.startMinute;
    let calcEnd = rec.endMinute;
    let unsupportedClaim = false;

    if (work.startMinute < rec.startMinute) {
      const start = supportBoundary("start", work.startMinute, rec.startMinute, evidence.starts);
      if (start.supported !== null && start.supported < rec.startMinute) {
        calcStart = start.supported;
        const delta = rec.startMinute - start.supported;
        dayDiscrepancies.push({
          id: `disc-${date}-start`,
          type: "start_time_shaved",
          scope: { date, periodId: null },
          expected: clockLabel(start.supported),
          observed: clockLabel(rec.startMinute),
          deltaMinutes: delta,
          deltaAmount: null,
          supportingFactIds: [...start.factIds, ...rec.factIds.filter((id) => recordIns.some((r) => r.fact.id === id))],
          confirmationIds: [confirmation.id],
          ruleId: RULES.startShaving.id,
          explanation: `You started at ${clockLabel(start.supported)}. The employer time record starts at ${clockLabel(rec.startMinute)}. ${formatDuration(delta)} is not on the employer record.`,
        });
        noteUnsupported(reasons, "start", work.startMinute, start.supported);
        if (start.supported > work.startMinute) unsupportedClaim = true;
      } else {
        unsupportedClaim = true;
        reasons.push(
          `You said you started at ${clockLabel(work.startMinute)}, but no schedule or message supports a start before ${clockLabel(rec.startMinute)}.`,
        );
      }
    } else if (work.startMinute > rec.startMinute) {
      calcStart = work.startMinute;
      reasons.push(`You said you started at ${clockLabel(work.startMinute)}, later than the employer record. Takt uses your time.`);
    }

    if (work.endMinute > rec.endMinute) {
      const end = supportBoundary("end", work.endMinute, rec.endMinute, evidence.ends);
      if (end.supported !== null && end.supported > rec.endMinute) {
        calcEnd = end.supported;
        const delta = end.supported - rec.endMinute;
        dayDiscrepancies.push({
          id: `disc-${date}-end`,
          type: "end_time_shaved",
          scope: { date, periodId: null },
          expected: clockLabel(end.supported),
          observed: clockLabel(rec.endMinute),
          deltaMinutes: delta,
          deltaAmount: null,
          supportingFactIds: [...end.factIds, ...rec.factIds.filter((id) => recordOuts.some((r) => r.fact.id === id))],
          confirmationIds: [confirmation.id],
          ruleId: RULES.endShaving.id,
          explanation: `You stopped at ${clockLabel(end.supported)}. The employer time record ends at ${clockLabel(rec.endMinute)}. ${formatDuration(delta)} is not on the employer record.`,
        });
        noteUnsupported(reasons, "end", work.endMinute, end.supported);
        if (end.supported < work.endMinute) unsupportedClaim = true;
      } else {
        unsupportedClaim = true;
        reasons.push(
          `You said you stopped at ${clockLabel(work.endMinute)}, but no schedule or message supports an end after ${clockLabel(rec.endMinute)}.`,
        );
      }
    } else if (work.endMinute < rec.endMinute) {
      calcEnd = work.endMinute;
      reasons.push(`You said you stopped at ${clockLabel(work.endMinute)}, earlier than the employer record. Takt uses your time.`);
    }

    const mealBreakMinutes = Math.max(work.mealBreakMinutes, rec.mealBreakMinutes);
    if (work.mealBreakMinutes < rec.mealBreakMinutes) {
      unsupportedClaim = true;
      reasons.push(
        `You said your meal break was ${formatDuration(work.mealBreakMinutes)}; the employer deducted ${formatDuration(rec.mealBreakMinutes)}. Takt keeps the employer's deduction because no other record shows the shorter break.`,
      );
    }

    const calc: CalculableDay = { date, startMinute: calcStart, endMinute: calcEnd, mealBreakMinutes, basis: "supported_confirmation" };
    if (workedMinutesOf(calc) === null) {
      reasons.push("These times cannot be placed on the clock because of a daylight-saving change.");
      dayDiscrepancies.length = 0;
      finish("AMBIGUOUS");
      continue;
    }
    calculable.push(calc);

    if (dayDiscrepancies.length > 0) {
      finish("DISCREPANCY_DETECTED");
    } else if (unsupportedClaim) {
      finish("INSUFFICIENT_EVIDENCE");
    } else {
      if (reasons.length === 0) reasons.push("Your confirmed hours match the employer time record.");
      finish("CONSISTENT");
    }
  }

  const { payroll, problems } = buildPayroll(usable.filter((u) => u.docClass === "paystub"), activeDocs);
  if (scopeSupported) {
    discrepancies.push(...payrollDiscrepancies(payroll, days, input.facts));
  }

  return { days, discrepancies, payroll, payrollProblems: problems, calculable, unreviewedFactIds };
}

// ---------------------------------------------------------------------------
// Intervals

function toInterval(
  date: string,
  startMinute: number,
  endMinute: number,
  mealBreakMinutes: number,
  source: WorkInterval["source"],
  factIds: string[],
  confirmationId: string | null,
): WorkInterval {
  const elapsed = elapsedWallMinutes(date, startMinute, endMinute);
  const worked = elapsed.ok ? Math.max(0, elapsed.minutes - mealBreakMinutes) : 0;
  return { date, startMinute, endMinute, mealBreakMinutes, workedMinutes: worked, source, factIds, confirmationId };
}

function elapsedFailure(interval: WorkInterval): string | null {
  const elapsed = elapsedWallMinutes(interval.date, interval.startMinute, interval.endMinute);
  return elapsed.ok ? null : `These times cannot be placed on the clock: ${elapsed.reason}.`;
}

function employerInterval(
  date: string,
  ins: Usable<"time_in">[],
  outs: Usable<"time_out">[],
  meals: Usable<"meal_break">[],
): { interval: WorkInterval | null; problem: string | null } {
  const uniqueTimes = <T extends { value: { time: string } }>(list: T[]) =>
    [...new Set(list.map((u) => u.value.time))].map((t) => clockToMinutes(t)).sort((a, b) => a - b);
  const inTimes = uniqueTimes(ins);
  const outTimes = uniqueTimes(outs);
  if (inTimes.length === 0 && outTimes.length === 0) return { interval: null, problem: null };
  if (inTimes.length !== outTimes.length) {
    return { interval: null, problem: "The employer time record has an unmatched clock-in or clock-out for this day." };
  }

  const first = inTimes[0];
  const pairs = inTimes.map((start, i) => {
    let end = outTimes[i];
    while (end <= start) end += 1440;
    return [start, end] as const;
  });
  for (let i = 1; i < pairs.length; i++) {
    if (pairs[i][0] < pairs[i - 1][1]) {
      return { interval: null, problem: "The employer time record has overlapping punches for this day." };
    }
  }
  const lastEnd = pairs[pairs.length - 1][1];
  if (first < 0 || lastEnd - first > 1440) {
    return { interval: null, problem: "The employer time record spans more than 24 hours for this day." };
  }
  const gapMinutes = pairs.slice(1).reduce((acc, [start], i) => acc + (start - pairs[i][1]), 0);
  const mealValues = [...new Set(meals.map((m) => m.value.minutes))];
  if (mealValues.length > 1) {
    return { interval: null, problem: "The employer time record shows two different meal deductions for this day." };
  }
  const meal = gapMinutes + (mealValues[0] ?? 0);
  const factIds = [...ins, ...outs, ...meals].map((u) => u.fact.id);
  return { interval: toInterval(date, first, lastEnd, meal, "employer_record", factIds, null), problem: null };
}

function scheduleInterval(
  date: string,
  starts: Usable<"scheduled_start">[],
  ends: Usable<"scheduled_end">[],
): { interval: WorkInterval | null; problem: string | null; startFactIds: string[]; endFactIds: string[] } {
  const startTimes = [...new Set(starts.map((s) => s.value.time))];
  const endTimes = [...new Set(ends.map((s) => s.value.time))];
  const startFactIds = starts.map((u) => u.fact.id);
  const endFactIds = ends.map((u) => u.fact.id);
  const base = { startFactIds, endFactIds };
  if (startTimes.length > 1 || endTimes.length > 1) {
    return { ...base, interval: null, problem: "Two schedules show different shifts for this day." };
  }
  if (startTimes.length === 0 || endTimes.length === 0) return { ...base, interval: null, problem: null };
  const { startMinute, endMinute } = intervalMinutes(startTimes[0], endTimes[0]);
  const interval = toInterval(date, startMinute, endMinute, 0, "schedule", [...startFactIds, ...endFactIds], null);
  return { ...base, interval, problem: null };
}

function confirmedInterval(c: Extract<WorkerConfirmation, { type: "worked_interval" }>): WorkInterval {
  const { startMinute, endMinute } = intervalMinutes(c.start, c.end);
  return toInterval(c.date, startMinute, endMinute, c.mealBreakMinutes, "worker_confirmed", [], c.id);
}

function fromInterval(interval: WorkInterval, basis: CalculableDay["basis"]): CalculableDay {
  return {
    date: interval.date,
    startMinute: interval.startMinute,
    endMinute: interval.endMinute,
    mealBreakMinutes: interval.mealBreakMinutes,
    basis,
  };
}

export function workedMinutesOf(day: CalculableDay): number | null {
  const elapsed = elapsedWallMinutes(day.date, day.startMinute, day.endMinute);
  return elapsed.ok ? Math.max(0, elapsed.minutes - day.mealBreakMinutes) : null;
}

// ---------------------------------------------------------------------------
// Independent support

interface EvidencePoint {
  minute: number;
  factId: string;
}

function supportingEvidence(
  schedule: ReturnType<typeof scheduleInterval>,
  dayMessages: Usable<"message_time_reference">[],
  record: WorkInterval | null,
): { starts: EvidencePoint[]; ends: EvidencePoint[] } {
  const starts: EvidencePoint[] = [];
  const ends: EvidencePoint[] = [];
  if (schedule.interval) {
    const { startMinute, endMinute } = schedule.interval;
    starts.push(...schedule.startFactIds.map((factId) => ({ minute: startMinute, factId })));
    ends.push(...schedule.endFactIds.map((factId) => ({ minute: endMinute, factId })));
  }
  const anchorStart = record?.startMinute ?? schedule.interval?.startMinute ?? null;
  for (const m of dayMessages) {
    let minute = clockToMinutes(m.value.time);
    if (m.value.boundary === "end" && anchorStart !== null && minute <= anchorStart) minute += 1440;
    (m.value.boundary === "start" ? starts : ends).push({ minute, factId: m.fact.id });
  }
  return { starts: dedupePoints(starts), ends: dedupePoints(ends) };
}

function dedupePoints(points: EvidencePoint[]): EvidencePoint[] {
  const seen = new Set<string>();
  return points.filter((p) => {
    const key = `${p.minute}:${p.factId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The boundary Takt can stand behind: the worker's time, limited by the most
 * favorable independent evidence. For a start, evidence must be before the
 * employer record; the supported start is the later of the worker's time and
 * the earliest evidence. Ends mirror this.
 */
function supportBoundary(
  boundary: "start" | "end",
  workerMinute: number,
  recordMinute: number | null,
  evidence: EvidencePoint[],
): { supported: number | null; factIds: string[] } {
  const helpful = evidence.filter((e) =>
    recordMinute === null ? true : boundary === "start" ? e.minute < recordMinute : e.minute > recordMinute,
  );
  if (helpful.length === 0) return { supported: null, factIds: [] };
  const best =
    boundary === "start" ? Math.min(...helpful.map((e) => e.minute)) : Math.max(...helpful.map((e) => e.minute));
  const supported = boundary === "start" ? Math.max(workerMinute, best) : Math.min(workerMinute, best);
  const factIds = helpful
    .filter((e) => (boundary === "start" ? e.minute <= supported : e.minute >= supported))
    .map((e) => e.factId);
  return { supported, factIds: [...new Set(factIds)] };
}

function noteUnsupported(reasons: string[], boundary: "start" | "end", workerMinute: number, supported: number) {
  const gap = Math.abs(supported - workerMinute);
  if (gap === 0) return;
  reasons.push(
    boundary === "start"
      ? `You said you started at ${clockLabel(workerMinute)}. Other records support ${clockLabel(supported)}, so Takt counts from ${clockLabel(supported)}. The other ${formatDuration(gap)} is not counted.`
      : `You said you stopped at ${clockLabel(workerMinute)}. Other records support ${clockLabel(supported)}, so Takt counts until ${clockLabel(supported)}. The other ${formatDuration(gap)} is not counted.`,
  );
}

const clockLabel = (minute: number) => formatClock12(minutesToClock(minute));

// ---------------------------------------------------------------------------
// Payroll

function buildPayroll(
  paystubFacts: { fact: EvidenceFact; value: FactValue }[],
  docs: Map<string, EvidenceDocument>,
): { payroll: PayrollRecord[]; problems: { documentId: string; reason: string }[] } {
  const byDoc = new Map<string, { fact: EvidenceFact; value: FactValue }[]>();
  for (const u of paystubFacts) byDoc.set(u.fact.documentId, [...(byDoc.get(u.fact.documentId) ?? []), u]);

  const payroll: PayrollRecord[] = [];
  const problems: { documentId: string; reason: string }[] = [];

  for (const [documentId, list] of byDoc) {
    if (!docs.has(documentId)) continue;
    const pick = <K extends FactValue["kind"]>(kind: K) => {
      const matches = list.filter((u) => u.value.kind === kind) as { fact: EvidenceFact; value: Extract<FactValue, { kind: K }> }[];
      const distinct = new Set(matches.map((m) => JSON.stringify(m.value)));
      return { value: matches[0]?.value ?? null, conflict: distinct.size > 1, factIds: matches.map((m) => m.fact.id) };
    };
    const period = pick("pay_period");
    const rate = pick("hourly_rate");
    const regHours = pick("regular_hours_paid");
    const otHours = pick("overtime_hours_paid");
    const dtHours = pick("double_time_hours_paid");
    const regPay = pick("regular_pay");
    const otPay = pick("overtime_pay");
    const dtPay = pick("double_time_pay");
    const gross = pick("gross_pay");
    const payDate = pick("pay_date");
    const otherEarnings = list
      .filter((u) => u.value.kind === "other_earnings")
      .map((u) => u.value as Extract<FactValue, { kind: "other_earnings" }>)
      .map(({ label, amount }) => ({ label, amount }));

    const conflicts = [period, rate, regHours, otHours, dtHours, regPay, otPay, dtPay].filter((p) => p.conflict);
    if (conflicts.length > 0) {
      problems.push({ documentId, reason: "This wage statement shows two different values for the same line." });
      continue;
    }
    const missing = [
      [period, "pay period dates"],
      [rate, "hourly rate"],
      [regHours, "regular hours"],
      [regPay, "regular pay"],
    ].filter(([p]) => (p as typeof period).value === null);
    if (missing.length > 0) {
      problems.push({
        documentId,
        reason: `This wage statement is missing confirmed ${missing.map(([, label]) => label).join(", ")}.`,
      });
      continue;
    }
    if ((otHours.value === null) !== (otPay.value === null) || (dtHours.value === null) !== (dtPay.value === null)) {
      problems.push({ documentId, reason: "This wage statement has premium hours without the matching pay line, or the reverse." });
      continue;
    }

    payroll.push({
      id: `period-${period.value!.start}`,
      periodStart: period.value!.start,
      periodEnd: period.value!.end,
      payDate: payDate.value?.date ?? null,
      hourlyRate: rate.value!.amount,
      regularHours: regHours.value!.hours,
      overtimeHours: otHours.value?.hours ?? "0",
      doubleTimeHours: dtHours.value?.hours ?? "0",
      regularPay: regPay.value!.amount,
      overtimePay: otPay.value?.amount ?? "0",
      doubleTimePay: dtPay.value?.amount ?? "0",
      grossPay: gross.value?.amount ?? null,
      otherEarnings,
      factIds: list.map((u) => u.fact.id),
    });
  }

  payroll.sort((a, b) => compareDates(a.periodStart, b.periodStart));
  const kept: PayrollRecord[] = [];
  const numbersOf = (r: PayrollRecord) => JSON.stringify({ ...r, factIds: [] });
  for (const record of payroll) {
    const overlapping = kept.find(
      (k) => compareDates(record.periodStart, k.periodEnd) <= 0 && compareDates(k.periodStart, record.periodEnd) <= 0,
    );
    if (!overlapping) {
      kept.push(record);
      continue;
    }
    const documentId = factDocument(record, paystubFacts);
    if (numbersOf(overlapping) === numbersOf(record)) {
      problems.push({ documentId, reason: "Another wage statement covers the same pay period with the same numbers. Only one is used." });
    } else {
      kept.splice(kept.indexOf(overlapping), 1);
      problems.push({ documentId, reason: "Two wage statements cover overlapping pay periods with different numbers." });
    }
  }
  return { payroll: kept, problems };
}

function factDocument(record: PayrollRecord, facts: { fact: EvidenceFact }[]): string {
  return facts.find((u) => record.factIds.includes(u.fact.id))?.fact.documentId ?? record.id;
}

export const hoursToMinutes = (hours: string) => Rational.fromDecimal(hours).mul(Rational.of(60));

function payrollDiscrepancies(payroll: PayrollRecord[], days: DayReconciliation[], facts: EvidenceFact[]): Discrepancy[] {
  const out: Discrepancy[] = [];
  const factById = new Map(facts.map((f) => [f.id, f]));
  const payFactIds = (record: PayrollRecord, kinds: FactValue["kind"][]) =>
    record.factIds.filter((id) => {
      const kind = factById.get(id)?.extracted.kind;
      return kind !== undefined && kinds.includes(kind);
    });

  for (const record of payroll) {
    const inPeriod = days.filter(
      (d) => compareDates(d.date, record.periodStart) >= 0 && compareDates(d.date, record.periodEnd) <= 0,
    );
    const recorded = inPeriod.reduce((acc, d) => acc + (d.employerRecord?.workedMinutes ?? 0), 0);
    const paid = hoursToMinutes(record.regularHours)
      .add(hoursToMinutes(record.overtimeHours))
      .add(hoursToMinutes(record.doubleTimeHours));
    const difference = Rational.of(recorded).sub(paid);
    const anyRecord = inPeriod.some((d) => d.employerRecord);
    if (anyRecord && difference.compare(Rational.of(1)) > 0) {
      const delta = Number(difference.toFixed(0));
      out.push({
        id: `disc-${record.id}-paid-hours`,
        type: "paid_hours_mismatch",
        scope: { date: null, periodId: record.id },
        expected: `${formatDuration(recorded)} on the employer time record`,
        observed: `${formatDuration(Number(paid.toFixed(0)))} paid on the wage statement`,
        deltaMinutes: delta,
        deltaAmount: null,
        supportingFactIds: [
          ...inPeriod.flatMap((d) => d.employerRecord?.factIds ?? []),
          ...payFactIds(record, ["regular_hours_paid", "overtime_hours_paid", "double_time_hours_paid"]),
        ],
        confirmationIds: [],
        ruleId: RULES.paidHours.id,
        explanation: `The employer's own time record shows ${formatDuration(recorded)} for this pay period, but the wage statement pays ${formatDuration(Number(paid.toFixed(0)))}.`,
      });
    }

    const rate = Rational.fromDecimal(record.hourlyRate);
    const lines: [string, string, Rational, Discrepancy["type"], FactValue["kind"][]][] = [
      [record.regularHours, record.regularPay, Rational.of(1), "regular_pay_mismatch", ["regular_hours_paid", "regular_pay", "hourly_rate"]],
      [record.overtimeHours, record.overtimePay, Rational.of(3, 2), "overtime_pay_mismatch", ["overtime_hours_paid", "overtime_pay", "hourly_rate"]],
    ];
    for (const [hours, pay, multiplier, type, kinds] of lines) {
      const expected = Rational.fromDecimal(hours).mul(rate).mul(multiplier);
      const shown = Rational.fromDecimal(pay);
      const gap = expected.sub(shown);
      if (gap.compare(Rational.of(1, 100)) > 0) {
        out.push({
          id: `disc-${record.id}-${type}`,
          type,
          scope: { date: null, periodId: record.id },
          expected: `$${expected.toFixed(2)} (${hours} h × $${record.hourlyRate}${multiplier.equals(Rational.of(1)) ? "" : " × 1.5"})`,
          observed: `$${shown.toFixed(2)} on the wage statement`,
          deltaMinutes: null,
          deltaAmount: gap.toFixed(2),
          supportingFactIds: payFactIds(record, kinds),
          confirmationIds: [],
          ruleId: RULES.paystubArithmetic.id,
          explanation: `The wage statement's own hours and rate come to $${expected.toFixed(2)}, but it pays $${shown.toFixed(2)}.`,
        });
      }
    }
  }
  return out.filter((d) => d.supportingFactIds.length > 0);
}

function factDates(value: FactValue): string[] {
  if ("date" in value) return [value.date];
  return [];
}

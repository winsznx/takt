import { describe, expect, it } from "vitest";
import type { EvidenceFact } from "@/lib/domain/contracts";
import { reconcile } from "@/lib/domain/reconcile";
import { evaluateScope } from "@/lib/rules/ca-dlse-2026-09";
import { doc, fact, punches, shift, SUPPORTED_ANSWERS, supportedScope, worked } from "../helpers/facts";

const DATE = "2026-09-01";
const docs = [doc("clock", "time_record"), doc("sched", "schedule"), doc("msg", "manager_message"), doc("stub", "paystub")];
const scope = supportedScope().decision;

function run(facts: EvidenceFact[], confirmations = [worked(DATE, "07:40", "16:30")], documents = docs, s = scope) {
  return reconcile({ documents, facts, confirmations, scope: s });
}

describe("Takt Diff: 7:40 vs 8:00", () => {
  it("detects 20 unrecorded minutes when the worker confirms and the schedule supports it", () => {
    const record = punches("clock", DATE, "08:00", "16:30");
    const schedule = shift("sched", DATE, "07:40", "16:30");
    const result = run([...record, ...schedule]);
    const [day] = result.days;
    expect(day.state).toBe("DISCREPANCY_DETECTED");
    const [disc] = result.discrepancies;
    expect(disc).toMatchObject({ type: "start_time_shaved", expected: "7:40 AM", observed: "8:00 AM", deltaMinutes: 20 });
    expect(disc.supportingFactIds).toContain(schedule[0].id);
    expect(disc.supportingFactIds).toContain(record[0].id);
    expect(disc.supportingFactIds).not.toContain(schedule[1].id);
    expect(disc.confirmationIds).toEqual([`c-${DATE}`]);
    expect(result.calculable[0]).toMatchObject({ startMinute: 460, endMinute: 990, mealBreakMinutes: 30 });
  });

  it("accepts a manager message as independent support", () => {
    const message = fact("msg", { kind: "message_time_reference", date: DATE, time: "07:40", boundary: "start", sentAt: null });
    const result = run([...punches("clock", DATE, "08:00", "16:30"), message]);
    expect(result.days[0].state).toBe("DISCREPANCY_DETECTED");
    expect(result.discrepancies[0].supportingFactIds).toContain(message.id);
  });

  it("does not treat a schedule as work the worker says did not happen", () => {
    const result = run(
      [...punches("clock", DATE, "08:00", "16:30"), ...shift("sched", DATE, "07:40", "16:30")],
      [worked(DATE, "08:00", "16:30")],
    );
    expect(result.days[0].state).toBe("CONSISTENT");
    expect(result.discrepancies).toHaveLength(0);
  });

  it("counts only the supported part of a worker claim", () => {
    const result = run(
      [...punches("clock", DATE, "08:00", "16:30"), ...shift("sched", DATE, "07:40", "16:30")],
      [worked(DATE, "07:30", "16:30")],
    );
    expect(result.discrepancies[0].deltaMinutes).toBe(20);
    expect(result.days[0].reasons.join(" ")).toMatch(/other 10 min is not counted/);
  });

  it("abstains when nothing independent supports the worker's earlier start", () => {
    const result = run(punches("clock", DATE, "08:00", "16:30"));
    expect(result.days[0].state).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.discrepancies).toHaveLength(0);
    expect(result.calculable[0].startMinute).toBe(480);
  });

  it("asks the worker when records disagree and nothing is confirmed", () => {
    const result = run([...punches("clock", DATE, "08:00", "16:30"), ...shift("sched", DATE, "07:40", "16:30")], []);
    expect(result.days[0].state).toBe("AMBIGUOUS");
    expect(result.calculable).toHaveLength(0);
  });

  it("is CONSISTENT when records agree without a confirmation", () => {
    const result = run([...punches("clock", DATE, "08:00", "16:30"), ...shift("sched", DATE, "08:00", "16:30")], []);
    expect(result.days[0].state).toBe("CONSISTENT");
  });

  it("keeps unreviewed facts out and marks the day ambiguous", () => {
    const record = punches("clock", DATE, "08:00", "16:30");
    record[0] = { ...record[0], review: "unreviewed" };
    const result = run([...record, ...shift("sched", DATE, "07:40", "16:30")]);
    expect(result.days[0].state).toBe("AMBIGUOUS");
    expect(result.unreviewedFactIds).toEqual([record[0].id]);
  });

  it("uses the worker's correction instead of the extracted value", () => {
    const record = punches("clock", DATE, "08:00", "16:30");
    const schedule = shift("sched", DATE, "07:10", "16:30");
    schedule[0] = { ...schedule[0], review: "corrected", correctedValue: { kind: "scheduled_start", date: DATE, time: "07:40" } };
    const result = run([...record, ...schedule]);
    expect(result.discrepancies[0].deltaMinutes).toBe(20);
  });

  it("ignores rejected facts", () => {
    const schedule = shift("sched", DATE, "07:40", "16:30").map((f) => ({ ...f, review: "rejected" as const }));
    const result = run([...punches("clock", DATE, "08:00", "16:30"), ...schedule]);
    expect(result.days[0].state).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("flags two employer records that disagree", () => {
    const docs2 = [...docs, doc("clock2", "time_record")];
    const result = run([...punches("clock", DATE, "08:00", "16:30"), ...punches("clock2", DATE, "08:05", "16:30")], undefined, docs2);
    expect(result.days[0].state).toBe("AMBIGUOUS");
  });

  it("ignores facts from a duplicate upload", () => {
    const docs2 = [...docs, doc("clock-copy", "time_record", { status: "duplicate", duplicateOf: "clock" })];
    const result = run(
      [...punches("clock", DATE, "08:00", "16:30"), ...punches("clock-copy", DATE, "06:00", "16:30"), ...shift("sched", DATE, "07:40", "16:30")],
      undefined,
      docs2,
    );
    expect(result.days[0].state).toBe("DISCREPANCY_DETECTED");
    expect(result.discrepancies[0].deltaMinutes).toBe(20);
  });

  it("detects a worked day missing from the employer record when both ends are supported", () => {
    const result = run(shift("sched", DATE, "07:40", "16:30"));
    expect(result.days[0].state).toBe("DISCREPANCY_DETECTED");
    expect(result.discrepancies[0]).toMatchObject({ type: "missing_worked_interval", deltaMinutes: 500 });
  });

  it("treats every day as unsupported when the scope gate refuses", () => {
    const refused = evaluateScope({ ...SUPPORTED_ANSWERS, pieceRateOrCommission: "yes" });
    const result = run([...punches("clock", DATE, "08:00", "16:30"), ...shift("sched", DATE, "07:40", "16:30")], undefined, docs, refused);
    expect(result.days[0].state).toBe("UNSUPPORTED_RULE");
    expect(result.discrepancies).toHaveLength(0);
    expect(result.calculable).toHaveLength(0);
  });

  it("handles an overnight shift against an overnight schedule", () => {
    const result = run(
      [...punches("clock", DATE, "22:00", "06:00"), ...shift("sched", DATE, "22:00", "06:30")],
      [worked(DATE, "22:00", "06:30")],
    );
    expect(result.discrepancies[0]).toMatchObject({ type: "end_time_shaved", deltaMinutes: 30 });
  });
});

describe("payroll comparisons", () => {
  const stub = (regularHours: string, regularPay: string) => [
    fact("stub", { kind: "pay_period", start: "2026-08-31", end: "2026-09-13" }),
    fact("stub", { kind: "hourly_rate", amount: "18.50" }),
    fact("stub", { kind: "regular_hours_paid", hours: regularHours }),
    fact("stub", { kind: "regular_pay", amount: regularPay }),
  ];

  it("flags hours on the employer record that the wage statement did not pay", () => {
    const result = run([...punches("clock", DATE, "08:00", "16:30"), ...stub("7.50", "138.75")], []);
    const mismatch = result.discrepancies.find((d) => d.type === "paid_hours_mismatch");
    expect(mismatch?.deltaMinutes).toBe(30);
  });

  it("flags wage-statement arithmetic that does not add up", () => {
    const result = run([...punches("clock", DATE, "08:00", "16:30"), ...stub("8.00", "140.00")], []);
    const mismatch = result.discrepancies.find((d) => d.type === "regular_pay_mismatch");
    expect(mismatch?.deltaAmount).toBe("8.00");
  });

  it("reports an incomplete wage statement instead of guessing", () => {
    const result = run([fact("stub", { kind: "pay_period", start: "2026-08-31", end: "2026-09-13" })], []);
    expect(result.payroll).toHaveLength(0);
    expect(result.payrollProblems[0].reason).toMatch(/missing confirmed hourly rate/);
  });
});

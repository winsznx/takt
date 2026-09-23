"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useCase } from "@/components/takt/case-context";
import { TaktCalc } from "@/components/takt/takt-calc";
import { TaktDiff } from "@/components/takt/takt-diff";
import { TaktLine } from "@/components/takt/takt-line";
import { Button } from "@/components/ui/button";
import { setWorked } from "@/lib/client/cases";
import { getSample, type SampleCase } from "@/lib/client/samples";
import { formatMoney } from "@/lib/calc/rational";

export default function ReconcilePage() {
  const { stored, analysis } = useCase();
  const { reconciliation: rec, calculations } = analysis;
  const [sample, setSample] = useState<SampleCase | null>(null);

  useEffect(() => {
    if (stored.sample) getSample(stored.sample).then(setSample, () => setSample(null));
  }, [stored.sample]);

  const hasConfirmation = (date: string) => stored.confirmations.some((c) => c.type === "worked_interval" && c.date === date);
  const dayDiscrepancies = rec.discrepancies.filter((d) => d.scope.date);
  const payDiscrepancies = rec.discrepancies.filter((d) => !d.scope.date);
  const needsAnswer = rec.days.filter((d) => d.state === "AMBIGUOUS").length;

  if (rec.unreviewedFactIds.length > 0) {
    return (
      <div className="rounded-lg border p-6">
        <h1 className="text-xl font-semibold">Review your facts first</h1>
        <p className="mt-1 text-muted-foreground">
          {rec.unreviewedFactIds.length} facts haven&apos;t been checked. Takt only compares facts you&apos;ve confirmed.
        </p>
        <Button className="mt-4" render={<Link href={`/case/${stored.id}/review`} />}>
          Go to review
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Where your records agree and disagree</h1>
        <p className="mt-1 text-muted-foreground">
          Each day lines up your schedule, the employer&apos;s clock, any messages, and what you say you worked. A schedule alone never counts as
          work.
        </p>
      </div>

      {analysis.state === "UNSUPPORTED_CASE" && analysis.scope && (
        <div className="rounded-lg border border-state-unsupported/40 bg-state-unsupported/5 p-4">
          <p className="font-medium">Takt organized your records but won&apos;t calculate an amount for this case.</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {analysis.scope.reasons.map((r) => (
              <li key={r.code}>{r.message}</li>
            ))}
          </ul>
          <a href="https://www.dir.ca.gov/dlse/HowToFileWageClaim.htm" className="mt-2 inline-block text-sm underline" target="_blank" rel="noreferrer">
            The Labor Commissioner&apos;s filing guide
          </a>
        </div>
      )}

      {needsAnswer > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-state-ambiguous/40 bg-state-ambiguous/5 p-4">
          <p>
            <span className="font-medium">{needsAnswer} {needsAnswer === 1 ? "day needs" : "days need"} your answer.</span> Your records disagree, and
            only you know when you worked.
          </p>
          {sample && sample.workerStatements.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                for (const s of sample.workerStatements) {
                  await setWorked(stored.id, { date: s.date, start: s.start, end: s.end, mealBreakMinutes: s.meal, worked: s.worked });
                }
                toast.success("Entered the synthetic sample worker's answers");
              }}
            >
              Use the sample worker&apos;s answers
            </Button>
          )}
        </div>
      )}

      {dayDiscrepancies.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Takt Diff</h2>
          {dayDiscrepancies.map((d) => (
            <TaktDiff key={d.id} caseId={stored.id} discrepancy={d} facts={stored.facts} documents={stored.documents} calculations={calculations} />
          ))}
        </section>
      )}

      {rec.days.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Takt Line · day by day</h2>
          <TaktLine caseId={stored.id} days={rec.days} facts={stored.facts} hasConfirmation={hasConfirmation} />
        </section>
      )}

      {(payDiscrepancies.length > 0 || rec.payrollProblems.length > 0) && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Pay stub checks</h2>
          {payDiscrepancies.map((d) => (
            <TaktDiff key={d.id} caseId={stored.id} discrepancy={d} facts={stored.facts} documents={stored.documents} calculations={calculations} />
          ))}
          {rec.payrollProblems.map((p) => (
            <p key={p.reason + p.documentId} className="rounded-lg border p-3 text-sm">
              {p.reason}
            </p>
          ))}
        </section>
      )}

      {calculations.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Takt Calc</h2>
          {calculations.map((c) => (
            <TaktCalc key={c.periodId} calculation={c} />
          ))}
        </section>
      )}
      {calculations.length === 0 && analysis.state === "INSUFFICIENT_EVIDENCE" && (
        <p className="rounded-lg border p-4 text-sm">{analysis.stateReasons.join(" ")}</p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <p className="text-sm text-muted-foreground">
          {analysis.claimedPeriodIds.length > 0
            ? `Supported difference across claimed pay periods: $${formatMoney(analysis.totals.owed)}`
            : "No supported amount to claim yet. You can still export an evidence packet."}
        </p>
        <Button size="lg" render={<Link href={`/case/${stored.id}/packet`} />}>
          Build my packet
        </Button>
      </div>
    </div>
  );
}

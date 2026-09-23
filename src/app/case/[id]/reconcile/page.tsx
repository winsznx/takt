"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useCase } from "@/components/takt/case-context";
import { PageHeader, SectionTitle } from "@/components/takt/page-header";
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
      <div className="panel p-6 sm:p-8">
        <h1 className="text-[24px] font-semibold tracking-[-0.5px]">Review your facts first</h1>
        <p className="mt-2 text-[16px] text-muted-foreground">
          {rec.unreviewedFactIds.length} facts haven&apos;t been checked. Takt only compares facts you&apos;ve confirmed.
        </p>
        <Button className="mt-4" render={<Link href={`/case/${stored.id}/review`} />}>
          Go to review
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <PageHeader title="Where your records agree and disagree">
        Each day lines up your schedule, the employer&apos;s clock, any messages, and what you say you worked. A schedule alone never counts as work.
      </PageHeader>

      {analysis.state === "UNSUPPORTED_CASE" && analysis.scope && (
        <div className="rounded-[20px] border border-[#dde1e8] bg-[#f6f7f9] p-5">
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
        <div className="flex flex-col gap-3 rounded-[20px] border border-[#e3dcff] bg-[#f7f5ff] p-5 text-[#3b2d86] sm:flex-row sm:items-center sm:justify-between">
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
          <SectionTitle hint="Where your confirmed work and the employer record disagree, with the records behind it.">Takt Diff</SectionTitle>
          {dayDiscrepancies.map((d) => (
            <TaktDiff key={d.id} caseId={stored.id} discrepancy={d} facts={stored.facts} documents={stored.documents} calculations={calculations} />
          ))}
        </section>
      )}

      {rec.days.length > 0 && (
        <section className="space-y-3">
          <SectionTitle hint="Every day in your records, side by side.">Takt Line</SectionTitle>
          <TaktLine caseId={stored.id} days={rec.days} facts={stored.facts} hasConfirmation={hasConfirmation} />
        </section>
      )}

      {(payDiscrepancies.length > 0 || rec.payrollProblems.length > 0) && (
        <section className="space-y-3">
          <SectionTitle>Pay stub checks</SectionTitle>
          {payDiscrepancies.map((d) => (
            <TaktDiff key={d.id} caseId={stored.id} discrepancy={d} facts={stored.facts} documents={stored.documents} calculations={calculations} />
          ))}
          {rec.payrollProblems.map((p) => (
            <p key={p.reason + p.documentId} className="panel p-4 text-[14px]">
              {p.reason}
            </p>
          ))}
        </section>
      )}

      {calculations.length > 0 && (
        <section className="space-y-3">
          <SectionTitle hint="Minutes and cents, counted by code under California overtime rules.">Takt Calc</SectionTitle>
          {calculations.map((c) => (
            <TaktCalc key={c.periodId} calculation={c} />
          ))}
        </section>
      )}
      {calculations.length === 0 && analysis.state === "INSUFFICIENT_EVIDENCE" && (
        <p className="panel p-5 text-[15px]">{analysis.stateReasons.join(" ")}</p>
      )}

      <div className="flex flex-col gap-3 border-t border-[#ececef] pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[15px] text-muted-foreground">
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

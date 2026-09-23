"use client";
import Link from "next/link";
import { useState } from "react";
import type { Discrepancy, EvidenceDocument, EvidenceFact, PeriodCalculation } from "@/lib/domain/contracts";
import { describeFact } from "@/lib/domain/describe";
import { formatDateLong, formatDuration } from "@/lib/domain/time";
import { Rational } from "@/lib/calc/rational";
import { DOC_CLASS_LABEL } from "@/components/takt/doc-labels";

const TITLE: Record<Discrepancy["type"], string> = {
  start_time_shaved: "Start time not on the employer record",
  end_time_shaved: "End time not on the employer record",
  meal_break_overdeducted: "Meal break deducted but worked",
  missing_worked_interval: "Worked day missing from the employer record",
  paid_hours_mismatch: "Recorded hours not paid",
  regular_pay_mismatch: "Pay stub math doesn't add up",
  overtime_pay_mismatch: "Overtime math doesn't add up",
};

export function TaktDiff({
  caseId,
  discrepancy,
  facts,
  documents,
  calculations,
}: {
  caseId: string;
  discrepancy: Discrepancy;
  facts: EvidenceFact[];
  documents: EvidenceDocument[];
  calculations: PeriodCalculation[];
}) {
  const [showMath, setShowMath] = useState(false);
  const support = discrepancy.supportingFactIds.map((id) => facts.find((f) => f.id === id)).filter((f): f is EvidenceFact => Boolean(f));
  const lines = calculations.flatMap((c) => c.lines.filter((l) => l.date === discrepancy.scope.date && l.multiplier !== "1"));
  const doc = (id: string) => documents.find((d) => d.id === id);

  return (
    <article className="rounded-xl border-2 border-state-discrepancy/40 bg-state-discrepancy/5 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-state-discrepancy">
        {discrepancy.scope.date ? formatDateLong(discrepancy.scope.date) : "Pay period"} · Takt Diff
      </p>
      <h3 className="mt-1 text-lg font-semibold">{TITLE[discrepancy.type]}</h3>
      <dl className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-background p-3">
          <dt className="text-xs text-muted-foreground">Your confirmed work, with support</dt>
          <dd className="text-2xl font-semibold tabular-nums">{discrepancy.expected}</dd>
        </div>
        <div className="rounded-lg bg-background p-3">
          <dt className="text-xs text-muted-foreground">Employer record</dt>
          <dd className="text-2xl font-semibold tabular-nums">{discrepancy.observed}</dd>
        </div>
      </dl>
      <p className="mt-3 text-lg font-semibold text-state-discrepancy">
        {discrepancy.deltaMinutes !== null
          ? `${formatDuration(discrepancy.deltaMinutes)} ${discrepancy.type === "paid_hours_mismatch" ? "recorded but not paid" : "not on the employer record"}`
          : `$${discrepancy.deltaAmount} difference`}
      </p>
      <p className="mt-1 text-sm">{discrepancy.explanation}</p>

      <div className="mt-3">
        <p className="text-xs font-medium text-muted-foreground">Sources</p>
        <ul className="mt-1 flex flex-wrap gap-2">
          {support.map((f) => {
            const d = doc(f.documentId);
            return (
              <li key={f.id}>
                <Link
                  href={`/case/${caseId}/review?doc=${f.documentId}`}
                  className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-xs hover:bg-muted"
                  title={`"${f.anchor.quote}" · ${d?.filename}`}
                >
                  <span className="font-medium">{d?.docClass ? DOC_CLASS_LABEL[d.docClass] : "Document"}</span>
                  <span className="text-muted-foreground">{describeFact(f.correctedValue ?? f.extracted)}</span>
                </Link>
              </li>
            );
          })}
          {discrepancy.confirmationIds.length > 0 && (
            <li className="inline-flex items-center rounded-full border bg-background px-2.5 py-1 text-xs">You confirmed these hours</li>
          )}
        </ul>
      </div>

      {lines.length > 0 && (
        <div className="mt-3">
          <button type="button" className="text-sm underline" onClick={() => setShowMath((v) => !v)} aria-expanded={showMath}>
            How this was calculated
          </button>
          {showMath && (
            <ul className="mt-2 space-y-1 rounded-lg bg-background p-3 font-mono text-xs">
              {lines.map((l) => (
                <li key={`${l.ruleId}-${l.date}`}>
                  {l.minutes} min × ${l.rate} × {l.multiplier} ÷ 60 = ${Rational.parse(l.exactAmount).toFixed(2)} · {l.ruleId}
                </li>
              ))}
              <li className="pt-1 font-sans text-muted-foreground">Premium minutes come from the whole day under California&apos;s daily overtime rule.</li>
            </ul>
          )}
        </div>
      )}
    </article>
  );
}

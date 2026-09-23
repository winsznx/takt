"use client";
import Link from "next/link";
import { useState } from "react";
import type { Discrepancy, EvidenceDocument, EvidenceFact, PeriodCalculation } from "@/lib/domain/contracts";
import { describeFact } from "@/lib/domain/describe";
import { formatDateLong, formatDuration } from "@/lib/domain/time";
import { Rational } from "@/lib/calc/rational";
import { Calculator, UserCheck } from "lucide-react";
import { DOC_CLASS_ICON, DOC_CLASS_LABEL } from "@/components/takt/doc-labels";

function SourceIcon({ docClass }: { docClass: EvidenceDocument["docClass"] }) {
  const Icon = DOC_CLASS_ICON[docClass ?? "other"];
  return <Icon className="size-3.5 text-muted-foreground" strokeWidth={1.75} />;
}

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
    <article className="rounded-[20px] border border-[#f3c9ca] bg-[#fff6f6] p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[14px] font-medium text-state-discrepancy">{discrepancy.scope.date ? formatDateLong(discrepancy.scope.date) : "Pay period"}</p>
        <span className="rounded-full bg-white px-2.5 py-1 text-[12px] font-medium text-[#c4262c] ring-1 ring-[#f3c9ca]">Takt Diff</span>
      </div>
      <h3 className="mt-2 text-[20px] font-semibold tracking-[-0.3px]">{TITLE[discrepancy.type]}</h3>
      <dl className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white p-4">
          <dt className="text-[12px] text-muted-foreground">Your confirmed work, with support</dt>
          <dd className="mt-0.5 text-[24px] font-semibold tracking-[-0.5px] tabular-nums text-ink sm:text-[30px]">{discrepancy.expected}</dd>
        </div>
        <div className="rounded-2xl bg-white p-4">
          <dt className="text-[12px] text-muted-foreground">Employer record</dt>
          <dd className="mt-0.5 text-[24px] font-semibold tracking-[-0.5px] tabular-nums text-ink sm:text-[30px]">{discrepancy.observed}</dd>
        </div>
      </dl>
      <p className="mt-4 text-[17px] font-semibold text-state-discrepancy">
        {discrepancy.deltaMinutes !== null
          ? `${formatDuration(discrepancy.deltaMinutes)} ${discrepancy.type === "paid_hours_mismatch" ? "recorded but not paid" : "not on the employer record"}`
          : `$${discrepancy.deltaAmount} difference`}
      </p>
      <p className="mt-1 text-[15px] text-[#3a3b44]">{discrepancy.explanation}</p>

      <div className="mt-3">
        <p className="text-[13px] font-medium text-muted-foreground">Sources</p>
        <ul className="mt-1 flex flex-wrap gap-2">
          {support.map((f) => {
            const d = doc(f.documentId);
            return (
              <li key={f.id}>
                <Link
                  href={`/case/${caseId}/review?doc=${f.documentId}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12px] ring-1 ring-[#ececef] hover:ring-brand"
                  title={`"${f.anchor.quote}" · ${d?.filename}`}
                >
                  <SourceIcon docClass={d?.docClass ?? null} />
                  <span className="font-medium">{d?.docClass ? DOC_CLASS_LABEL[d.docClass] : "Document"}</span>
                  <span className="text-muted-foreground">{describeFact(f.correctedValue ?? f.extracted)}</span>
                </Link>
              </li>
            );
          })}
          {discrepancy.confirmationIds.length > 0 && (
            <li className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12px] ring-1 ring-[#ececef]">
              <UserCheck className="size-3.5 text-muted-foreground" strokeWidth={1.75} />
              You confirmed these hours
            </li>
          )}
        </ul>
      </div>

      {lines.length > 0 && (
        <div className="mt-3">
          <button type="button" className="inline-flex items-center gap-1.5 text-[14px] font-medium text-brand hover:underline" onClick={() => setShowMath((v) => !v)} aria-expanded={showMath}>
            <Calculator className="size-4" strokeWidth={1.75} />
            How this was calculated
          </button>
          {showMath && (
            <ul className="mt-2 space-y-1 rounded-2xl bg-white p-4 font-mono text-[12px]">
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

import type { CaseState, DecisionState } from "@/lib/domain/contracts";
import { cn } from "@/lib/utils";

const DECISION: Record<DecisionState, { label: string; className: string; dot: string }> = {
  CONSISTENT: { label: "Matches", className: "bg-[#ecfdf5] text-[#065f46]", dot: "bg-state-consistent" },
  DISCREPANCY_DETECTED: { label: "Records disagree", className: "bg-[#fff1f1] text-[#c4262c]", dot: "bg-state-discrepancy" },
  INSUFFICIENT_EVIDENCE: { label: "Not enough evidence", className: "bg-[#fefce8] text-[#854d0e]", dot: "bg-state-insufficient" },
  AMBIGUOUS: { label: "Needs your answer", className: "bg-[#f5f3ff] text-[#5b44c2]", dot: "bg-state-ambiguous" },
  UNSUPPORTED_RULE: { label: "Outside Takt's rules", className: "bg-[#f1f3f6] text-[#4a5263]", dot: "bg-state-unsupported" },
};

export function DecisionBadge({ state, className }: { state: DecisionState; className?: string }) {
  const d = DECISION[state];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium", d.className, className)}>
      <span className={cn("size-1.5 rounded-full", d.dot)} />
      {d.label}
    </span>
  );
}

export const CASE_STATE_TEXT: Record<CaseState, string> = {
  CASE_CREATED: "Add your records",
  EVIDENCE_INGESTED: "Reading your records",
  FACTS_REVIEW_REQUIRED: "Review what Takt read",
  AMBIGUOUS_EXTRACTION: "Some values need a closer look",
  FACTS_CONFIRMED: "Facts confirmed",
  RECONCILED: "Records compared",
  PACKET_GENERATED: "Packet ready",
  PACKET_VERIFIED: "Packet verified",
  INSUFFICIENT_EVIDENCE: "Not enough evidence yet",
  UNSUPPORTED_CASE: "Outside Takt's supported rules",
  CALCULATION_BLOCKED: "Takt can't calculate an amount yet",
  PACKET_GENERATION_FAILED: "Packet could not be built",
  VERIFICATION_FAILED: "Packet failed verification",
};

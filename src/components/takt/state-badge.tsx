import type { CaseState, DecisionState } from "@/lib/domain/contracts";
import { cn } from "@/lib/utils";

const DECISION: Record<DecisionState, { label: string; className: string }> = {
  CONSISTENT: { label: "Matches", className: "bg-state-consistent/10 text-state-consistent ring-state-consistent/30" },
  DISCREPANCY_DETECTED: { label: "Records disagree", className: "bg-state-discrepancy/10 text-state-discrepancy ring-state-discrepancy/30" },
  INSUFFICIENT_EVIDENCE: { label: "Not enough evidence", className: "bg-state-insufficient/10 text-state-insufficient ring-state-insufficient/30" },
  AMBIGUOUS: { label: "Needs your answer", className: "bg-state-ambiguous/10 text-state-ambiguous ring-state-ambiguous/30" },
  UNSUPPORTED_RULE: { label: "Outside Takt's rules", className: "bg-state-unsupported/10 text-state-unsupported ring-state-unsupported/30" },
};

export function DecisionBadge({ state, className }: { state: DecisionState; className?: string }) {
  const d = DECISION[state];
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", d.className, className)}>{d.label}</span>;
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

import { calculatePeriod } from "@/lib/calc/calculate";
import { Rational, sum } from "@/lib/calc/rational";
import type {
  CaseState,
  EvidenceDocument,
  EvidenceFact,
  PeriodCalculation,
  ScopeAnswers,
  ScopeDecision,
  WorkerConfirmation,
} from "@/lib/domain/contracts";
import { reconcile, type ReconcileResult } from "@/lib/domain/reconcile";
import { evaluateScope } from "@/lib/rules/ca-dlse-2026-09";

export interface CaseInputs {
  documents: EvidenceDocument[];
  facts: EvidenceFact[];
  confirmations: WorkerConfirmation[];
  scopeAnswers: ScopeAnswers | null;
}

export interface CaseAnalysis {
  scope: ScopeDecision | null;
  reconciliation: ReconcileResult;
  calculations: PeriodCalculation[];
  /** Calculated periods where confirmed work earned more than was paid. */
  claimedPeriodIds: string[];
  totals: { earned: string; paid: string; owed: string };
  state: CaseState;
  stateReasons: string[];
}

/**
 * The whole deterministic pipeline in one call: scope gate → reconciliation →
 * per-period calculation → claim totals → case state. The packet generator and
 * the verifier both call this with the same inputs.
 */
export function analyzeCase(inputs: CaseInputs): CaseAnalysis {
  const scope = inputs.scopeAnswers ? evaluateScope(inputs.scopeAnswers) : null;
  const reconciliation = reconcile({ documents: inputs.documents, facts: inputs.facts, confirmations: inputs.confirmations, scope });

  const calculations =
    scope && inputs.scopeAnswers
      ? reconciliation.payroll.map((period) =>
          calculatePeriod({
            period,
            calculable: reconciliation.calculable,
            days: reconciliation.days,
            scope: { answers: inputs.scopeAnswers!, decision: scope },
          }),
        )
      : [];

  const claimed = calculations.filter((c) => c.state === "CALCULATED" && Rational.fromDecimal(c.owed).compare(Rational.ZERO) > 0);
  const total = (pick: (c: PeriodCalculation) => string) => sum(claimed.map((c) => Rational.fromDecimal(pick(c)))).toFixed(2);
  const totals = { earned: total((c) => c.earned.total), paid: total((c) => c.paid.total), owed: total((c) => c.owed) };

  const { state, reasons } = caseState(inputs, scope, reconciliation, calculations);
  return { scope, reconciliation, calculations, claimedPeriodIds: claimed.map((c) => c.periodId), totals, state, stateReasons: reasons };
}

function caseState(
  inputs: CaseInputs,
  scope: ScopeDecision | null,
  rec: ReconcileResult,
  calculations: PeriodCalculation[],
): { state: CaseState; reasons: string[] } {
  const active = inputs.documents.filter((d) => d.duplicateOf === null);
  if (active.length === 0) return { state: "CASE_CREATED", reasons: ["No evidence added yet."] };
  if (active.some((d) => d.status === "hashed" || d.status === "extracting")) {
    return { state: "EVIDENCE_INGESTED", reasons: ["Some files are still being read."] };
  }
  if (scope && !scope.supported) return { state: "UNSUPPORTED_CASE", reasons: scope.reasons.map((r) => r.message) };
  const lowConfidenceUnreviewed = inputs.facts.some((f) => f.consequential && f.review === "unreviewed" && f.confidence < 0.85);
  if (rec.unreviewedFactIds.length > 0) {
    return {
      state: lowConfidenceUnreviewed ? "AMBIGUOUS_EXTRACTION" : "FACTS_REVIEW_REQUIRED",
      reasons: [`${rec.unreviewedFactIds.length} facts still need your review.`],
    };
  }
  if (!scope) return { state: "FACTS_CONFIRMED", reasons: ["Answer the scope questions to continue."] };
  if (rec.payroll.length === 0) {
    return {
      state: "INSUFFICIENT_EVIDENCE",
      reasons: ["Takt needs at least one confirmed wage statement to compare pay.", ...rec.payrollProblems.map((p) => p.reason)],
    };
  }
  if (calculations.every((c) => c.state === "CALCULATION_BLOCKED")) {
    return { state: "CALCULATION_BLOCKED", reasons: calculations.flatMap((c) => c.blockedReasons) };
  }
  return { state: "RECONCILED", reasons: [] };
}

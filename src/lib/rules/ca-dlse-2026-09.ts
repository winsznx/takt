import type { RuleReference, ScopeAnswers, ScopeDecision } from "@/lib/domain/contracts";

/**
 * California DLSE ruleset pinned for September 2026.
 *
 * Legal rules cite the pinned official source in legal/ca-dlse/rules. Takt's
 * own evidence rules (TAKT-*) are product policy, not law, and say so.
 */
export const RULESET_ID = "ca-dlse-2026-09";

const OVERTIME_SOURCE = { sourceId: "dlse-faq-overtime", sourceUrl: "https://www.dir.ca.gov/dlse/faq_overtime.htm" };
const MIN_WAGE_SOURCE = { sourceId: "dlse-faq-minimum-wage", sourceUrl: "https://www.dir.ca.gov/dlse/faq_minimumwage.htm" };
const TAKT_POLICY = { sourceId: "takt-evidence-policy", sourceUrl: "docs/evidence-policy.md" };

export const RULES = {
  regularHourly: {
    id: "CA-REG-HOURLY",
    version: "1",
    summary: "Non-overtime hours are paid at the worker's confirmed hourly rate.",
    effective: "2026-01-01",
    ...OVERTIME_SOURCE,
  },
  dailyOvertime: {
    id: "CA-OT-DAILY-8",
    version: "1",
    summary: "Hours over 8 and up to 12 in a workday are paid at 1.5 times the regular rate.",
    effective: "2026-01-01",
    ...OVERTIME_SOURCE,
  },
  dailyDoubleTime: {
    id: "CA-DT-DAILY-12",
    version: "1",
    summary: "Hours over 12 in a workday are paid at 2 times the regular rate.",
    effective: "2026-01-01",
    ...OVERTIME_SOURCE,
  },
  weeklyOvertime: {
    id: "CA-OT-WEEKLY-40",
    version: "1",
    summary: "Regular hours over 40 in a workweek are paid at 1.5 times the regular rate. Daily overtime hours are not counted twice.",
    effective: "2026-01-01",
    ...OVERTIME_SOURCE,
  },
  seventhDayOvertime: {
    id: "CA-OT-7TH-DAY",
    version: "1",
    summary: "The first 8 hours on the seventh consecutive day of work in a workweek are paid at 1.5 times the regular rate.",
    effective: "2026-01-01",
    ...OVERTIME_SOURCE,
  },
  seventhDayDoubleTime: {
    id: "CA-DT-7TH-DAY",
    version: "1",
    summary: "Hours over 8 on the seventh consecutive day of work in a workweek are paid at 2 times the regular rate.",
    effective: "2026-01-01",
    ...OVERTIME_SOURCE,
  },
  stateMinimumWage: {
    id: "CA-MIN-WAGE-2026",
    version: "1",
    summary: "California statewide minimum wage is $16.90 per hour from January 1, 2026. Local and industry minimums can be higher.",
    effective: "2026-01-01",
    ...MIN_WAGE_SOURCE,
  },
  startShaving: {
    id: "TAKT-DIFF-START",
    version: "1",
    summary:
      "Takt policy: a start earlier than the employer record counts only when the worker confirms it and an independent record (schedule or message) supports it. The supported start is the later of the two.",
    effective: "2026-09-01",
    ...TAKT_POLICY,
  },
  endShaving: {
    id: "TAKT-DIFF-END",
    version: "1",
    summary:
      "Takt policy: an end later than the employer record counts only when the worker confirms it and an independent record supports it. The supported end is the earlier of the two.",
    effective: "2026-09-01",
    ...TAKT_POLICY,
  },
  missingInterval: {
    id: "TAKT-DIFF-MISSING",
    version: "1",
    summary:
      "Takt policy: a worked day with no employer time record counts only when the worker confirms it and independent records support both its start and its end.",
    effective: "2026-09-01",
    ...TAKT_POLICY,
  },
  paidHours: {
    id: "TAKT-DIFF-PAID-HOURS",
    version: "1",
    summary: "Takt policy: hours on the employer's own time record are compared with hours paid on the wage statement for the same period.",
    effective: "2026-09-01",
    ...TAKT_POLICY,
  },
  paystubArithmetic: {
    id: "TAKT-DIFF-PAYSTUB-MATH",
    version: "1",
    summary: "Takt policy: each wage-statement line is checked as hours times rate (times the premium multiplier).",
    effective: "2026-09-01",
    ...TAKT_POLICY,
  },
  rounding: {
    id: "TAKT-ROUND-CENTS",
    version: "1",
    summary: "Takt policy: exact amounts are rounded half away from zero to cents once per pay period and pay component.",
    effective: "2026-09-01",
    ...TAKT_POLICY,
  },
} satisfies Record<string, RuleReference>;

export type RuleKey = keyof typeof RULES;
export const RULE_LIST: RuleReference[] = Object.values(RULES);
export const STATE_MINIMUM_WAGE = "16.90";

const LEGAL_HELP =
  "Contact the California Labor Commissioner's Office or a legal aid organization; they can advise on claims Takt does not calculate.";

/** Deterministic scope gate. The model is never consulted. */
export function evaluateScope(answers: ScopeAnswers): ScopeDecision {
  const reasons: ScopeDecision["reasons"] = [];
  const assumptions: ScopeDecision["assumptions"] = [];
  const refuse = (code: string, message: string) => reasons.push({ code, message: `${message} ${LEGAL_HELP}` });

  if (answers.workedInCalifornia === "no") refuse("NOT_CALIFORNIA", "Takt only supports work performed in California.");
  if (answers.paidHourly === "no") refuse("NOT_HOURLY", "Takt only calculates pay for hourly workers.");
  if (answers.pieceRateOrCommission === "yes") {
    refuse("PIECE_OR_COMMISSION", "Piece-rate and commission pay use different overtime rules that Takt does not implement.");
  }
  if (answers.salariedOrExempt === "yes") refuse("EXEMPT", "Salaried or exempt positions are outside Takt's supported scope.");
  if (answers.salariedOrExempt === "unsure") {
    refuse("EXEMPT_UNKNOWN", "Takt can't tell whether overtime rules apply to you without knowing whether your job is exempt.");
  }
  if (answers.publicWorks !== "no") {
    refuse("PUBLIC_WORKS", "Public works claims use the separate PW-1 form and prevailing wage rules.");
  }
  if (answers.unionContract === "yes") {
    refuse("UNION_CONTRACT", "A union contract can change overtime and pay rules; Takt does not read collective bargaining agreements.");
  }
  if (answers.alternativeWorkweek === "yes") {
    refuse("ALTERNATIVE_WORKWEEK", "Alternative workweek schedules change the daily overtime threshold.");
  }
  if (answers.specialIndustry !== "none") {
    refuse("SPECIAL_INDUSTRY", `Your industry (${answers.specialIndustry.replace("_", " ")}) has special wage or overtime rules.`);
  }
  if (answers.classifiedAsContractor === "yes") {
    refuse("CONTRACTOR", "Deciding whether you were misclassified as a contractor needs the Labor Commissioner, not a calculator.");
  }
  if (answers.workweekStartDay === null) {
    refuse("WORKWEEK_UNKNOWN", "Weekly and seventh-day overtime depend on the day your employer's workweek starts.");
  }

  if (answers.unionContract === "unsure") {
    assumptions.push({ code: "NO_UNION_ASSUMED", message: "You were not sure about a union contract; Takt assumes none applies." });
  }
  if (answers.alternativeWorkweek === "unsure") {
    assumptions.push({
      code: "STANDARD_WORKWEEK_ASSUMED",
      message: "You were not sure about an alternative workweek schedule; Takt uses standard daily overtime rules.",
    });
  }
  assumptions.push({
    code: "MIDNIGHT_WORKDAY",
    message: "Workdays are counted midnight to midnight. A shift that crosses midnight is split between the two days.",
  });

  return { supported: reasons.length === 0, reasons, assumptions, rulesetId: RULESET_ID };
}

import { z } from "zod";

/**
 * Takt domain contract. Every consequential value that reaches a calculation,
 * a form, or a packet is defined here first. Model output is parsed into these
 * shapes and rejected when it does not fit.
 *
 * Conventions:
 * - Civil dates are `YYYY-MM-DD` strings; clock times are `HH:mm` (24h) strings.
 *   No `Date` objects cross the domain boundary, so timezone parsing cannot move
 *   a shift. Elapsed time is integer minutes.
 * - Money and rates are exact decimal strings (`"18.50"`). Arithmetic happens on
 *   rationals in `lib/calc`; rounding to cents happens once, per pay period.
 */

export const CONTRACT_VERSION = "takt-domain/1";

export const IsoDate = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "YYYY-MM-DD");
export const ClockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:mm (24h)");
export const Decimal = z.string().regex(/^-?\d+(\.\d+)?$/, "decimal string");
export const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);
export const Id = z.string().min(1).max(64);

// ---------------------------------------------------------------------------
// Documents

export const DocumentClass = z.enum([
  "schedule",
  "time_record",
  "paystub",
  "manager_message",
  "employment_notice",
  "other",
]);
export type DocumentClass = z.infer<typeof DocumentClass>;

export const MimeType = z.enum(["application/pdf", "image/png", "image/jpeg"]);
export type MimeType = z.infer<typeof MimeType>;

export const ExtractionMethod = z.enum(["pdf_native_text", "vision_model", "worker_manual"]);
export type ExtractionMethod = z.infer<typeof ExtractionMethod>;

export const DocumentStatus = z.enum(["hashed", "extracting", "extracted", "extraction_failed", "duplicate"]);

export const EvidenceDocument = z.object({
  id: Id,
  filename: z.string().max(255),
  mimeType: MimeType,
  /** SHA-256 of the untouched original bytes, computed before any transformation. */
  sha256: Sha256,
  byteLength: z.number().int().positive(),
  pageCount: z.number().int().positive().nullable(),
  docClass: DocumentClass.nullable(),
  classMethod: z.enum(["pdf_native_text", "vision_model", "worker"]).nullable(),
  classConfidence: z.number().min(0).max(1).nullable(),
  status: DocumentStatus,
  /** Set when the same bytes were already ingested; the duplicate contributes no facts. */
  duplicateOf: Id.nullable(),
  ingestedAt: z.string(),
  extractionVersion: z.string().nullable(),
  extractionError: z.string().nullable(),
});
export type EvidenceDocument = z.infer<typeof EvidenceDocument>;

// ---------------------------------------------------------------------------
// Provenance

/** Region on a page, normalized to [0, 1] with the origin at the top-left. */
export const Region = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    w: z.number().min(0).max(1),
    h: z.number().min(0).max(1),
  })
  .refine((r) => r.x + r.w <= 1.0001 && r.y + r.h <= 1.0001, "region exceeds page");
export type Region = z.infer<typeof Region>;

export const SourceAnchor = z.object({
  documentId: Id,
  documentSha256: Sha256,
  /** 1-based page for PDFs; always 1 for images. */
  page: z.number().int().positive(),
  region: Region,
  /** Exact text at the anchor as read from the source (native text or model transcription). */
  quote: z.string().max(500),
  method: ExtractionMethod,
});
export type SourceAnchor = z.infer<typeof SourceAnchor>;

// ---------------------------------------------------------------------------
// Facts

const FactValue = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("time_in"), date: IsoDate, time: ClockTime }),
  z.object({ kind: z.literal("time_out"), date: IsoDate, time: ClockTime }),
  z.object({ kind: z.literal("meal_break"), date: IsoDate, minutes: z.number().int().min(0).max(720) }),
  z.object({ kind: z.literal("scheduled_start"), date: IsoDate, time: ClockTime }),
  z.object({ kind: z.literal("scheduled_end"), date: IsoDate, time: ClockTime }),
  z.object({
    kind: z.literal("message_time_reference"),
    date: IsoDate,
    time: ClockTime,
    boundary: z.enum(["start", "end"]),
    sentAt: z.string().nullable(),
  }),
  z.object({ kind: z.literal("pay_period"), start: IsoDate, end: IsoDate }),
  z.object({ kind: z.literal("pay_date"), date: IsoDate }),
  z.object({ kind: z.literal("hourly_rate"), amount: Decimal }),
  z.object({ kind: z.literal("regular_hours_paid"), hours: Decimal }),
  z.object({ kind: z.literal("overtime_hours_paid"), hours: Decimal }),
  z.object({ kind: z.literal("double_time_hours_paid"), hours: Decimal }),
  z.object({ kind: z.literal("regular_pay"), amount: Decimal }),
  z.object({ kind: z.literal("overtime_pay"), amount: Decimal }),
  z.object({ kind: z.literal("double_time_pay"), amount: Decimal }),
  z.object({ kind: z.literal("gross_pay"), amount: Decimal }),
  /** Any earnings line that is not hourly regular/overtime/double time (piece rate, commission, bonus, differential). */
  z.object({ kind: z.literal("other_earnings"), label: z.string().max(120), amount: Decimal }),
  z.object({ kind: z.literal("employee_name"), text: z.string().max(200) }),
  z.object({ kind: z.literal("employer_name"), text: z.string().max(200) }),
  z.object({ kind: z.literal("employer_address"), text: z.string().max(300) }),
]);
export { FactValue };
export type FactValue = z.infer<typeof FactValue>;
export type FactKind = FactValue["kind"];

/** Kinds that can change a discrepancy or an amount. They require worker review. */
export const CONSEQUENTIAL_KINDS: ReadonlySet<FactKind> = new Set<FactKind>([
  "time_in",
  "time_out",
  "meal_break",
  "scheduled_start",
  "scheduled_end",
  "message_time_reference",
  "pay_period",
  "hourly_rate",
  "regular_hours_paid",
  "overtime_hours_paid",
  "double_time_hours_paid",
  "regular_pay",
  "overtime_pay",
  "double_time_pay",
  "gross_pay",
  "other_earnings",
]);

export const ReviewStatus = z.enum(["unreviewed", "confirmed", "corrected", "rejected"]);
export type ReviewStatus = z.infer<typeof ReviewStatus>;

/** Below this model confidence a fact is flagged low-confidence in Takt Review. */
export const LOW_CONFIDENCE_THRESHOLD = 0.85;

export const EvidenceFact = z.object({
  id: Id,
  documentId: Id,
  /** Value as extracted. Never overwritten; corrections live in `correctedValue`. */
  extracted: FactValue,
  anchor: SourceAnchor,
  confidence: z.number().min(0).max(1),
  method: ExtractionMethod,
  consequential: z.boolean(),
  review: ReviewStatus,
  correctedValue: FactValue.nullable(),
  reviewedAt: z.string().nullable(),
});
export type EvidenceFact = z.infer<typeof EvidenceFact>;

/** Value a downstream consumer may use, or null when the fact is not usable. */
export function authoritativeValue(fact: EvidenceFact): FactValue | null {
  if (fact.review === "confirmed") return fact.extracted;
  if (fact.review === "corrected") return fact.correctedValue;
  return null;
}

// ---------------------------------------------------------------------------
// Worker confirmation

export const WorkerConfirmation = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("fact_review"),
    id: Id,
    factId: Id,
    decision: z.enum(["confirmed", "corrected", "rejected"]),
    before: FactValue,
    after: FactValue.nullable(),
    at: z.string(),
  }),
  z.object({
    type: z.literal("worked_interval"),
    id: Id,
    date: IsoDate,
    /** The worker's statement of when they actually worked, which may differ from every document. */
    start: ClockTime,
    end: ClockTime,
    mealBreakMinutes: z.number().int().min(0).max(720),
    /** False when the worker says they did not work this day at all. */
    worked: z.boolean(),
    at: z.string(),
  }),
]);
export type WorkerConfirmation = z.infer<typeof WorkerConfirmation>;

// ---------------------------------------------------------------------------
// Scope

export const ScopeAnswers = z.object({
  workedInCalifornia: z.enum(["yes", "no"]),
  paidHourly: z.enum(["yes", "no"]),
  pieceRateOrCommission: z.enum(["yes", "no"]),
  salariedOrExempt: z.enum(["yes", "no", "unsure"]),
  publicWorks: z.enum(["yes", "no", "unsure"]),
  unionContract: z.enum(["yes", "no", "unsure"]),
  alternativeWorkweek: z.enum(["yes", "no", "unsure"]),
  specialIndustry: z.enum([
    "none",
    "agriculture",
    "domestic_work",
    "health_care",
    "fast_food",
    "construction",
    "government_employer",
    "other_special",
  ]),
  classifiedAsContractor: z.enum(["yes", "no"]),
  /** Day the employer's workweek starts; 0 = Sunday. Needed for weekly and 7th-day overtime. */
  workweekStartDay: z.number().int().min(0).max(6).nullable(),
});
export type ScopeAnswers = z.infer<typeof ScopeAnswers>;

export const ScopeDecision = z.object({
  supported: z.boolean(),
  reasons: z.array(z.object({ code: z.string(), message: z.string() })),
  assumptions: z.array(z.object({ code: z.string(), message: z.string() })),
  rulesetId: z.string(),
});
export type ScopeDecision = z.infer<typeof ScopeDecision>;

// ---------------------------------------------------------------------------
// Normalized records

/** A continuous work interval. `startMinute`/`endMinute` are minutes from 00:00 on `date`; end may exceed 1440. */
export const WorkInterval = z.object({
  date: IsoDate,
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(2880),
  mealBreakMinutes: z.number().int().min(0),
  /** Elapsed minutes on the wall clock after DST correction and meal-break deduction. */
  workedMinutes: z.number().int().min(0),
  source: z.enum(["worker_confirmed", "employer_record", "schedule"]),
  factIds: z.array(Id),
  confirmationId: Id.nullable(),
});
export type WorkInterval = z.infer<typeof WorkInterval>;

export const PayrollRecord = z.object({
  id: Id,
  periodStart: IsoDate,
  periodEnd: IsoDate,
  payDate: IsoDate.nullable(),
  hourlyRate: Decimal,
  regularHours: Decimal,
  overtimeHours: Decimal,
  doubleTimeHours: Decimal,
  regularPay: Decimal,
  overtimePay: Decimal,
  doubleTimePay: Decimal,
  grossPay: Decimal.nullable(),
  /** Earnings that are not straight hourly pay; California counts them in the overtime regular rate. */
  otherEarnings: z.array(z.object({ label: z.string(), amount: Decimal })),
  factIds: z.array(Id),
});
export type PayrollRecord = z.infer<typeof PayrollRecord>;

// ---------------------------------------------------------------------------
// Reconciliation

export const DecisionState = z.enum([
  "CONSISTENT",
  "DISCREPANCY_DETECTED",
  "INSUFFICIENT_EVIDENCE",
  "AMBIGUOUS",
  "UNSUPPORTED_RULE",
]);
export type DecisionState = z.infer<typeof DecisionState>;

export const DiscrepancyType = z.enum([
  "start_time_shaved",
  "end_time_shaved",
  "meal_break_overdeducted",
  "missing_worked_interval",
  "paid_hours_mismatch",
  "regular_pay_mismatch",
  "overtime_pay_mismatch",
]);
export type DiscrepancyType = z.infer<typeof DiscrepancyType>;

export const Discrepancy = z.object({
  id: Id,
  type: DiscrepancyType,
  /** Day (`YYYY-MM-DD`) or pay period id the discrepancy belongs to. */
  scope: z.object({ date: IsoDate.nullable(), periodId: Id.nullable() }),
  /** What confirmed work supports, e.g. start 07:40 or 4800 minutes. */
  expected: z.string(),
  /** What the employer record or payroll shows. */
  observed: z.string(),
  /** Signed minutes (time discrepancies) or signed decimal dollars (pay discrepancies). */
  deltaMinutes: z.number().int().nullable(),
  deltaAmount: Decimal.nullable(),
  supportingFactIds: z.array(Id).min(1),
  confirmationIds: z.array(Id),
  ruleId: z.string(),
  explanation: z.string(),
});
export type Discrepancy = z.infer<typeof Discrepancy>;

export const DayReconciliation = z.object({
  date: IsoDate,
  state: DecisionState,
  schedule: WorkInterval.nullable(),
  employerRecord: WorkInterval.nullable(),
  confirmedWork: WorkInterval.nullable(),
  messageFactIds: z.array(Id),
  discrepancyIds: z.array(Id),
  reasons: z.array(z.string()),
});
export type DayReconciliation = z.infer<typeof DayReconciliation>;

// ---------------------------------------------------------------------------
// Calculation

export const CalculationLine = z.object({
  ruleId: z.string(),
  label: z.string(),
  date: IsoDate.nullable(),
  minutes: z.number().int().min(0),
  multiplier: z.enum(["1", "1.5", "2"]),
  rate: Decimal,
  /** Exact rational amount as `numerator/denominator` dollars, before rounding. */
  exactAmount: z.string(),
});
export type CalculationLine = z.infer<typeof CalculationLine>;

export const PeriodCalculation = z.object({
  periodId: Id,
  periodStart: IsoDate,
  periodEnd: IsoDate,
  state: z.enum(["CALCULATED", "CALCULATION_BLOCKED"]),
  blockedReasons: z.array(z.string()),
  ruleIds: z.array(z.string()),
  lines: z.array(CalculationLine),
  workedMinutes: z.object({ regular: z.number().int(), overtime: z.number().int(), doubleTime: z.number().int() }),
  earned: z.object({ regular: Decimal, overtime: Decimal, doubleTime: Decimal, total: Decimal }),
  paid: z.object({ regular: Decimal, overtime: Decimal, doubleTime: Decimal, total: Decimal }),
  owed: Decimal,
  rounding: z.literal("half-up-to-cent-per-period-component"),
});
export type PeriodCalculation = z.infer<typeof PeriodCalculation>;

// ---------------------------------------------------------------------------
// Case lifecycle

export const CaseState = z.enum([
  "CASE_CREATED",
  "EVIDENCE_INGESTED",
  "FACTS_REVIEW_REQUIRED",
  "FACTS_CONFIRMED",
  "RECONCILED",
  "PACKET_GENERATED",
  "PACKET_VERIFIED",
  "AMBIGUOUS_EXTRACTION",
  "INSUFFICIENT_EVIDENCE",
  "UNSUPPORTED_CASE",
  "CALCULATION_BLOCKED",
  "PACKET_GENERATION_FAILED",
  "VERIFICATION_FAILED",
]);
export type CaseState = z.infer<typeof CaseState>;

// ---------------------------------------------------------------------------
// Packet + verification

export const PacketFile = z.object({
  path: z.string(),
  sha256: Sha256,
  bytes: z.number().int().nonnegative(),
  role: z.enum(["form-1", "form-55", "evidence-index", "calculation-csv", "readme", "source"]),
});
export type PacketFile = z.infer<typeof PacketFile>;

export const VerificationStatus = z.enum(["VERIFIED_PACKET", "VERIFICATION_FAILED", "UNVERIFIABLE_PACKET"]);
export type VerificationStatus = z.infer<typeof VerificationStatus>;

export const VerificationCheck = z.object({
  id: z.string(),
  status: z.enum(["pass", "fail", "skip"]),
  detail: z.string(),
});
export type VerificationCheck = z.infer<typeof VerificationCheck>;

export const VerificationReceipt = z.object({
  status: VerificationStatus,
  manifestSha256: Sha256.nullable(),
  caseId: z.string().nullable(),
  verifierVersion: z.string(),
  checks: z.array(VerificationCheck),
  verifiedAt: z.string(),
});
export type VerificationReceipt = z.infer<typeof VerificationReceipt>;

// ---------------------------------------------------------------------------
// Claimant details the worker types in (never extracted by a model)

export const ClaimantDetails = z.object({
  firstName: z.string().max(80),
  lastName: z.string().max(80),
  phone: z.string().max(40),
  email: z.string().max(120),
  mailingAddress: z.string().max(200),
  city: z.string().max(80),
  state: z.string().max(2),
  zip: z.string().max(10),
  employerName: z.string().max(120),
  employerAddress: z.string().max(200),
  employerCity: z.string().max(80),
  employerState: z.string().max(2),
  employerZip: z.string().max(10),
  employerPhone: z.string().max(40),
  workPerformed: z.string().max(120),
  hireDate: IsoDate.nullable(),
  employmentStatus: z.enum(["Still working for employer", "QUIT", "DISCHARGED"]).nullable(),
  separationDate: IsoDate.nullable(),
  paidHow: z.enum(["BY CHECK", "BY CASH", "BY BOTH CASH & CHECK", "OTHER"]).nullable(),
  scheduleRegularity: z.enum(["regular", "irregular"]),
});
export type ClaimantDetails = z.infer<typeof ClaimantDetails>;

// ---------------------------------------------------------------------------
// Claim packet manifest

export const RuleReference = z.object({
  id: z.string(),
  version: z.string(),
  summary: z.string(),
  sourceId: z.string(),
  /** Official URL for legal rules; repository path for Takt's own evidence policy. */
  sourceUrl: z.string().min(1),
  effective: IsoDate,
});
export type RuleReference = z.infer<typeof RuleReference>;

export const ManifestSource = z.object({
  documentId: Id,
  filename: z.string(),
  mimeType: MimeType,
  sha256: Sha256,
  bytes: z.number().int().positive(),
  docClass: DocumentClass.nullable(),
  duplicateOf: Id.nullable(),
  /** Path inside the packet when the worker chose to include a copy, else null. */
  packetPath: z.string().nullable(),
});
export type ManifestSource = z.infer<typeof ManifestSource>;

export const ClaimPacketManifest = z.object({
  schema: z.literal("takt-manifest/1"),
  caseId: z.string(),
  generatedAt: z.string(),
  app: z.object({ name: z.literal("takt"), version: z.string(), commit: z.string() }),
  contractVersion: z.literal(CONTRACT_VERSION),
  ruleset: z.object({ id: z.string(), rules: z.array(RuleReference) }),
  scope: z.object({ answers: ScopeAnswers, decision: ScopeDecision }),
  extraction: z.object({ model: z.string().nullable(), promptVersion: z.string(), schemaVersion: z.string() }),
  sources: z.array(ManifestSource),
  facts: z.array(EvidenceFact),
  confirmations: z.array(WorkerConfirmation),
  payroll: z.array(PayrollRecord),
  days: z.array(DayReconciliation),
  discrepancies: z.array(Discrepancy),
  calculations: z.array(PeriodCalculation),
  totals: z.object({ earned: Decimal, paid: Decimal, owed: Decimal }),
  forms: z.object({
    form1: z.object({ file: z.string(), templateSha256: Sha256, revision: z.string(), fields: z.record(z.string(), z.union([z.string(), z.boolean()])) }),
    form55: z.array(z.object({ file: z.string(), templateSha256: Sha256, hourlyRate: Decimal, periodIds: z.array(Id) })),
  }),
  files: z.array(PacketFile),
  limitations: z.array(z.string()),
});
export type ClaimPacketManifest = z.infer<typeof ClaimPacketManifest>;

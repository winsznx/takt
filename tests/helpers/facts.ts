import type {
  DocumentClass,
  EvidenceDocument,
  EvidenceFact,
  FactValue,
  ReviewStatus,
  ScopeAnswers,
  WorkerConfirmation,
} from "@/lib/domain/contracts";
import { CONSEQUENTIAL_KINDS } from "@/lib/domain/contracts";
import { evaluateScope } from "@/lib/rules/ca-dlse-2026-09";

const HASH = "0".repeat(64);
let counter = 0;

export function doc(id: string, docClass: DocumentClass, overrides: Partial<EvidenceDocument> = {}): EvidenceDocument {
  return {
    id,
    filename: `${id}.pdf`,
    mimeType: "application/pdf",
    sha256: HASH,
    byteLength: 100,
    pageCount: 1,
    docClass,
    classMethod: "pdf_native_text",
    classConfidence: 1,
    status: "extracted",
    duplicateOf: null,
    ingestedAt: "2026-09-23T00:00:00Z",
    extractionVersion: "test",
    extractionError: null,
    ...overrides,
  };
}

export function fact(
  documentId: string,
  value: FactValue,
  opts: { review?: ReviewStatus; corrected?: FactValue; confidence?: number; id?: string } = {},
): EvidenceFact {
  counter += 1;
  return {
    id: opts.id ?? `f${counter}`,
    documentId,
    extracted: value,
    anchor: {
      documentId,
      documentSha256: HASH,
      page: 1,
      region: { x: 0.1, y: 0.1, w: 0.1, h: 0.02 },
      quote: JSON.stringify(value),
      method: "pdf_native_text",
    },
    confidence: opts.confidence ?? 0.99,
    method: "pdf_native_text",
    consequential: CONSEQUENTIAL_KINDS.has(value.kind),
    review: opts.review ?? "confirmed",
    correctedValue: opts.corrected ?? null,
    reviewedAt: "2026-09-23T00:00:00Z",
  };
}

export function worked(date: string, start: string, end: string, meal = 30, at = "2026-09-23T01:00:00Z"): WorkerConfirmation {
  return { type: "worked_interval", id: `c-${date}`, date, start, end, mealBreakMinutes: meal, worked: true, at };
}

export const SUPPORTED_ANSWERS: ScopeAnswers = {
  workedInCalifornia: "yes",
  paidHourly: "yes",
  pieceRateOrCommission: "no",
  salariedOrExempt: "no",
  publicWorks: "no",
  unionContract: "no",
  alternativeWorkweek: "no",
  specialIndustry: "none",
  classifiedAsContractor: "no",
  workweekStartDay: 1,
};

export const supportedScope = () => ({ answers: SUPPORTED_ANSWERS, decision: evaluateScope(SUPPORTED_ANSWERS) });

/** Employer punches for one day on a time record. */
export function punches(documentId: string, date: string, start: string, end: string, meal = 30): EvidenceFact[] {
  return [
    fact(documentId, { kind: "time_in", date, time: start }),
    fact(documentId, { kind: "time_out", date, time: end }),
    fact(documentId, { kind: "meal_break", date, minutes: meal }),
  ];
}

export function shift(documentId: string, date: string, start: string, end: string): EvidenceFact[] {
  return [
    fact(documentId, { kind: "scheduled_start", date, time: start }),
    fact(documentId, { kind: "scheduled_end", date, time: end }),
  ];
}

import {
  CONSEQUENTIAL_KINDS,
  type EvidenceDocument,
  type EvidenceFact,
  type ExtractionMethod,
  type FactValue,
  type Region,
} from "@/lib/domain/contracts";

export interface AnchoredCandidate {
  value: FactValue;
  page: number;
  region: Region;
  quote: string;
  confidence: number;
  note?: string;
}

const valueKey = (v: FactValue) => JSON.stringify(v);

/**
 * Turns anchored candidates into facts awaiting worker review. Exact repeats
 * of the same value in one document are kept once, at their first location.
 */
export function candidatesToFacts(
  document: EvidenceDocument,
  candidates: AnchoredCandidate[],
  method: ExtractionMethod,
): { facts: EvidenceFact[]; notes: Record<string, string> } {
  const seen = new Set<string>();
  const facts: EvidenceFact[] = [];
  const notes: Record<string, string> = {};
  candidates.forEach((candidate) => {
    const key = valueKey(candidate.value);
    if (seen.has(key)) return;
    seen.add(key);
    const id = `${document.id}-f${facts.length + 1}`;
    if (candidate.note) notes[id] = candidate.note;
    facts.push({
      id,
      documentId: document.id,
      extracted: candidate.value,
      anchor: {
        documentId: document.id,
        documentSha256: document.sha256,
        page: candidate.page,
        region: candidate.region,
        quote: candidate.quote.slice(0, 500),
        method,
      },
      confidence: Math.round(candidate.confidence * 1000) / 1000,
      method,
      consequential: CONSEQUENTIAL_KINDS.has(candidate.value.kind),
      review: "unreviewed",
      correctedValue: null,
      reviewedAt: null,
    });
  });
  return { facts, notes };
}

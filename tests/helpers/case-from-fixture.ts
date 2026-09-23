import type { EvidenceDocument, EvidenceFact, WorkerConfirmation } from "@/lib/domain/contracts";
import type { CaseInputs } from "@/lib/domain/analyze";
import { intakeFile } from "@/lib/documents/ingest";
import { readNativePdf } from "@/lib/documents/pdf-native";
import { candidatesToFacts } from "@/lib/extraction/facts";
import { extractNative } from "@/lib/extraction/native";
import { loadDocument, loadTruth, type FixtureTruth } from "./fixtures";

const key = (v: unknown) => JSON.stringify(v);

/**
 * Builds case inputs the way the app does: intake, native extraction for PDFs,
 * then a simulated worker review against the hand-labeled truth. Images are
 * entered manually by the simulated worker (method worker_manual), which is
 * the app's path when image reading is unavailable.
 */
export async function caseFromFixture(caseId: string): Promise<{
  truth: FixtureTruth;
  inputs: CaseInputs;
  originals: Map<string, Uint8Array>;
}> {
  const truth = await loadTruth(caseId);
  const documents: EvidenceDocument[] = [];
  const facts: EvidenceFact[] = [];
  const originals = new Map<string, Uint8Array>();
  const at = "2026-09-20T18:00:00Z";

  for (const [i, fixtureDoc] of truth.documents.entries()) {
    const bytes = await loadDocument(caseId, fixtureDoc.file);
    const intake = await intakeFile({ bytes, filename: fixtureDoc.file }, documents, { id: `doc-${i + 1}`, now: at });
    if (!intake.ok) throw new Error(intake.reason);
    let document = intake.document;
    originals.set(document.id, bytes);
    const labeled = truth.expectedFacts.filter((f) => f.file === fixtureDoc.file);

    if (document.mimeType === "application/pdf") {
      const pdf = await readNativePdf(bytes);
      const native = extractNative(pdf);
      document = { ...document, pageCount: pdf.pageCount, docClass: native.docClass, classMethod: "pdf_native_text", classConfidence: native.classConfidence, status: "extracted", extractionVersion: "native-pdf/1" };
      const { facts: extracted } = candidatesToFacts(document, native.candidates, "pdf_native_text");
      const truthKeys = new Set(labeled.map((f) => key(f.value)));
      for (const fact of extracted) {
        const correct = truthKeys.has(key(fact.extracted));
        facts.push({ ...fact, review: correct ? "confirmed" : "rejected", reviewedAt: at });
      }
    } else {
      document = { ...document, docClass: fixtureDoc.docClass as EvidenceDocument["docClass"], classMethod: "worker", classConfidence: 1, status: "extracted", extractionVersion: "worker-manual/1" };
      const { facts: manual } = candidatesToFacts(
        document,
        labeled.map((f) => ({ value: f.value, page: 1, region: { x: 0, y: 0, w: 1, h: 1 }, quote: "Entered by the worker from this image", confidence: 1 })),
        "worker_manual",
      );
      facts.push(...manual.map((f) => ({ ...f, review: "confirmed" as const, reviewedAt: at })));
    }
    documents.push(document);
  }

  const confirmations: WorkerConfirmation[] = truth.workerStatements.map((s) => ({
    type: "worked_interval",
    id: `confirm-${s.date}`,
    date: s.date,
    start: s.start,
    end: s.end,
    mealBreakMinutes: s.meal,
    worked: s.worked,
    at,
  }));
  return { truth, inputs: { documents, facts, confirmations, scopeAnswers: truth.scopeAnswers }, originals };
}

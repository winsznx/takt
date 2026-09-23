"use client";
import type { DocumentClass, EvidenceDocument } from "@/lib/domain/contracts";
import { readNativePdf } from "@/lib/documents/pdf-native";
import { candidatesToFacts, type AnchoredCandidate } from "@/lib/extraction/facts";
import { extractNative, NATIVE_EXTRACTOR_VERSION } from "@/lib/extraction/native";
import { EXTRACTION_SCHEMA_VERSION } from "@/lib/ai/extraction-schema";
import { readOriginal, updateCase } from "@/lib/client/cases";
import { db } from "@/lib/client/db";
import { downscaleImage, pdfPageToPng } from "@/lib/client/render";

const MAX_UPLOAD = 4 * 1024 * 1024 - 64 * 1024;
const SCANNED_TEXT_THRESHOLD = 40;
const MAX_SCANNED_PAGES = 4;

interface VisionResponse {
  docClass: DocumentClass;
  classConfidence: number;
  embeddedInstructionsDetected: boolean;
  candidates: AnchoredCandidate[];
  rejected: string[];
  model: string;
}

export class ExtractionUnavailableError extends Error {}

async function visionExtract(image: Blob, hint: DocumentClass | null, datedAround: string | null): Promise<VisionResponse> {
  const form = new FormData();
  form.append("file", image);
  if (hint) form.append("hint", hint);
  if (datedAround) form.append("datedAround", datedAround);
  const response = await fetch("/api/extract", { method: "POST", body: form });
  const body = await response.json().catch(() => null);
  if (response.status === 503) throw new ExtractionUnavailableError(body?.message ?? "Image reading is not available.");
  if (!response.ok) throw new Error(body?.message ?? "Takt could not read this file.");
  return body as VisionResponse;
}

/** Most common `YYYY-MM` among the case's other facts, so the model can resolve dates printed without a year. */
async function caseMonth(caseId: string, excludeDocumentId: string): Promise<string | null> {
  const stored = await db.cases.get(caseId);
  const counts = new Map<string, number>();
  for (const fact of stored?.facts ?? []) {
    if (fact.documentId === excludeDocumentId || fact.review === "rejected") continue;
    const value = fact.correctedValue ?? fact.extracted;
    const date = "date" in value ? value.date : "start" in value ? value.start : null;
    if (typeof date === "string") counts.set(date.slice(0, 7), (counts.get(date.slice(0, 7)) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/**
 * Reads one document: native PDF text when it exists, image extraction for
 * photos, screenshots, and scanned pages. Results are candidate facts waiting
 * for worker review; nothing is treated as confirmed here.
 */
export async function processDocument(caseId: string, document: EvidenceDocument, hint: DocumentClass | null = null): Promise<void> {
  if (document.duplicateOf) return;
  const bytes = await readOriginal(caseId, document.id);
  if (!bytes) throw new Error("The original file is no longer stored on this device.");
  const setDoc = (patch: Partial<EvidenceDocument>) =>
    updateCase(caseId, (c) => ({ documents: c.documents.map((d) => (d.id === document.id ? { ...d, ...patch } : d)) }));

  await setDoc({ status: "extracting", extractionError: null });
  try {
    let candidates: AnchoredCandidate[] = [];
    let method: "pdf_native_text" | "vision_model" = "pdf_native_text";
    let patch: Partial<EvidenceDocument>;
    let model: string | null = null;
    let injected = false;

    const native = document.mimeType === "application/pdf" ? await readNativePdf(bytes) : null;
    if (native && native.charCount >= SCANNED_TEXT_THRESHOLD) {
      const result = extractNative(native);
      candidates = result.candidates;
      patch = {
        pageCount: native.pageCount,
        docClass: hint ?? result.docClass,
        classMethod: hint ? "worker" : "pdf_native_text",
        classConfidence: hint ? 1 : result.classConfidence,
        extractionVersion: NATIVE_EXTRACTOR_VERSION,
        extractionError: result.warnings.join(" ") || null,
      };
    } else {
      method = "vision_model";
      const pages = native ? Math.min(native.pageCount, MAX_SCANNED_PAGES) : 1;
      let docClass: DocumentClass = "other";
      let classConfidence = 0;
      for (let page = 1; page <= pages; page++) {
        const image = native
          ? await pdfPageToPng(bytes, page)
          : bytes.byteLength > MAX_UPLOAD
            ? await downscaleImage(bytes, MAX_UPLOAD)
            : new Blob([bytes.slice()], { type: document.mimeType });
        const result = await visionExtract(image, hint, await caseMonth(caseId, document.id));
        candidates.push(...result.candidates.map((c) => ({ ...c, page })));
        if (result.classConfidence > classConfidence) ({ docClass, classConfidence } = result);
        injected ||= result.embeddedInstructionsDetected;
        model = result.model;
      }
      patch = {
        pageCount: native?.pageCount ?? 1,
        docClass: hint ?? docClass,
        classMethod: hint ? "worker" : "vision_model",
        classConfidence: hint ? 1 : classConfidence,
        extractionVersion: EXTRACTION_SCHEMA_VERSION,
        extractionError: native && native.pageCount > MAX_SCANNED_PAGES ? `Only the first ${MAX_SCANNED_PAGES} pages were read.` : null,
      };
    }

    const { facts, notes } = candidatesToFacts({ ...document, ...patch } as EvidenceDocument, candidates, method);
    await updateCase(caseId, (c) => ({
      documents: c.documents.map((d) => (d.id === document.id ? { ...d, ...patch, status: "extracted" } : d)),
      facts: [...c.facts.filter((f) => f.documentId !== document.id || f.method === "worker_manual"), ...facts],
      factNotes: { ...c.factNotes, ...notes },
      extractionModel: model ?? c.extractionModel,
      injectionWarnings: injected ? [...new Set([...c.injectionWarnings, document.id])] : c.injectionWarnings.filter((id) => id !== document.id),
    }));
  } catch (error) {
    const unavailable = error instanceof ExtractionUnavailableError;
    await setDoc({
      status: "extraction_failed",
      extractionError: unavailable
        ? "Image reading isn't available right now. You can type in what this document shows."
        : error instanceof Error
          ? error.message
          : "Takt could not read this file.",
    });
  }
}

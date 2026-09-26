"use client";
import type { ClaimantDetails, DocumentClass, FactValue, ScopeAnswers } from "@/lib/domain/contracts";
import { addFiles, createCase, updateCase } from "@/lib/client/cases";
import { processDocument } from "@/lib/client/process";

export interface SampleCase {
  caseId: string;
  summary: string;
  claimant: ClaimantDetails;
  scopeAnswers: ScopeAnswers;
  workerStatements: { date: string; start: string; end: string; meal: number; worked: boolean }[];
  files: { file: string; url: string; docClass: DocumentClass | null }[];
  imageFacts: { file: string; value: FactValue }[];
}

export async function loadSampleIndex(): Promise<SampleCase[]> {
  const response = await fetch("/generated/samples/index.json");
  if (!response.ok) throw new Error("Sample cases are not available.");
  return response.json();
}

/** Creates a case from a synthetic sample and runs the same intake and extraction as a real upload. */
export async function startSample(sample: SampleCase): Promise<string> {
  const id = await createCase(sample.scopeAnswers, sample.caseId);
  await updateCase(id, () => ({ details: sample.claimant }));
  const files = await Promise.all(
    sample.files.map(async (f) => ({ name: f.file, bytes: new Uint8Array(await (await fetch(f.url)).arrayBuffer()) })),
  );
  const { added } = await addFiles(id, files);
  void (async () => {
    for (const doc of added) {
      if (doc.mimeType === "application/pdf") {
        await processDocument(id, doc);
        continue;
      }
      // Sample images are synthetic and already labeled; don't spend the shared free AI allowance on them.
      await updateCase(id, (c) => ({
        documents: c.documents.map((d) =>
          d.id === doc.id
            ? { ...d, status: "extraction_failed" as const, extractionError: "Synthetic sample image. Fill it from its labels, or read it with AI (limited free daily allowance)." }
            : d,
        ),
      }));
    }
  })();
  return id;
}

export async function getSample(caseId: string): Promise<SampleCase | null> {
  return (await loadSampleIndex()).find((s) => s.caseId === caseId) ?? null;
}


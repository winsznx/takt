"use client";
import type {
  ClaimantDetails,
  DocumentClass,
  EvidenceDocument,
  EvidenceFact,
  FactValue,
  ScopeAnswers,
  WorkerConfirmation,
} from "@/lib/domain/contracts";
import { CONSEQUENTIAL_KINDS, LOW_CONFIDENCE_THRESHOLD } from "@/lib/domain/contracts";
import { intakeFile } from "@/lib/documents/ingest";
import { blobKey, db, type StoredCase } from "@/lib/client/db";

export const EMPTY_DETAILS: ClaimantDetails = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  mailingAddress: "",
  city: "",
  state: "CA",
  zip: "",
  employerName: "",
  employerAddress: "",
  employerCity: "",
  employerState: "CA",
  employerZip: "",
  employerPhone: "",
  workPerformed: "",
  hireDate: null,
  employmentStatus: null,
  separationDate: null,
  paidHow: null,
  scheduleRegularity: "irregular",
};

const now = () => new Date().toISOString();

function reference(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return `TAKT-${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("")}`;
}

export async function createCase(scopeAnswers: ScopeAnswers | null, sample: string | null = null): Promise<string> {
  const id = crypto.randomUUID();
  const at = now();
  await db.cases.add({
    id,
    reference: sample ?? reference(),
    createdAt: at,
    updatedAt: at,
    sample,
    details: EMPTY_DETAILS,
    scopeAnswers,
    documents: [],
    facts: [],
    factNotes: {},
    injectionWarnings: [],
    confirmations: [],
    extractionModel: null,
    lastPacket: null,
  });
  return id;
}

export async function updateCase(id: string, change: (c: StoredCase) => Partial<StoredCase>): Promise<void> {
  await db.transaction("rw", db.cases, async () => {
    const current = await db.cases.get(id);
    if (!current) throw new Error("Case not found on this device.");
    const patch = change(current);
    // Any change to evidence or answers makes a previous packet stale.
    const stale = ["documents", "facts", "confirmations", "scopeAnswers", "details"].some((k) => k in patch);
    await db.cases.put({ ...current, ...patch, ...(stale ? { lastPacket: null } : {}), updatedAt: now() });
  });
}

export async function deleteCase(id: string): Promise<void> {
  await db.transaction("rw", db.cases, db.blobs, async () => {
    await db.blobs.where("caseId").equals(id).delete();
    await db.cases.delete(id);
  });
}

export async function deleteAllCases(): Promise<void> {
  await db.transaction("rw", db.cases, db.blobs, async () => {
    await db.blobs.clear();
    await db.cases.clear();
  });
}

export async function readOriginal(caseId: string, documentId: string): Promise<Uint8Array | null> {
  const blob = await db.blobs.get(blobKey(caseId, documentId));
  return blob ? new Uint8Array(await blob.bytes.arrayBuffer()) : null;
}

export type AddFilesResult = { added: EvidenceDocument[]; rejected: { filename: string; reason: string }[] };

/** Hashes and stores originals locally. Extraction happens separately. */
export async function addFiles(caseId: string, files: { name: string; bytes: Uint8Array }[]): Promise<AddFilesResult> {
  const current = await db.cases.get(caseId);
  if (!current) throw new Error("Case not found on this device.");
  const documents = [...current.documents];
  const added: EvidenceDocument[] = [];
  const rejected: AddFilesResult["rejected"] = [];
  for (const file of files) {
    const result = await intakeFile({ bytes: file.bytes, filename: file.name }, documents, { id: crypto.randomUUID().slice(0, 8), now: now() });
    if (!result.ok) {
      rejected.push({ filename: result.filename, reason: result.reason });
      continue;
    }
    documents.push(result.document);
    added.push(result.document);
    if (result.document.duplicateOf === null) {
      await db.blobs.put({ key: blobKey(caseId, result.document.id), caseId, bytes: new Blob([file.bytes.slice()]) });
    }
  }
  await updateCase(caseId, () => ({ documents }));
  return { added, rejected };
}

export async function removeDocument(caseId: string, documentId: string): Promise<void> {
  await db.blobs.delete(blobKey(caseId, documentId));
  await updateCase(caseId, (c) => ({
    documents: c.documents
      .filter((d) => d.id !== documentId)
      .map((d) => (d.duplicateOf === documentId ? { ...d, duplicateOf: null, status: "hashed" as const } : d)),
    facts: c.facts.filter((f) => f.documentId !== documentId),
  }));
}

export async function reviewFact(caseId: string, factId: string, decision: "confirmed" | "rejected" | "unreviewed", corrected?: FactValue) {
  await updateCase(caseId, (c) => ({
    facts: c.facts.map((f) => {
      if (f.id !== factId) return f;
      if (corrected) return { ...f, review: "corrected", correctedValue: corrected, reviewedAt: now() };
      return { ...f, review: decision, correctedValue: null, reviewedAt: decision === "unreviewed" ? null : now() };
    }),
  }));
}

/** Confirms every high-confidence, unreviewed fact in one document. Low-confidence facts stay for individual review. */
export async function confirmHighConfidence(caseId: string, documentId: string) {
  await updateCase(caseId, (c) => ({
    facts: c.facts.map((f) =>
      f.documentId === documentId && f.review === "unreviewed" && f.confidence >= LOW_CONFIDENCE_THRESHOLD
        ? { ...f, review: "confirmed", reviewedAt: now() }
        : f,
    ),
  }));
}

export async function addManualFact(caseId: string, document: EvidenceDocument, value: FactValue, region?: EvidenceFact["anchor"]["region"], page = 1) {
  await updateCase(caseId, (c) => ({
    facts: [
      ...c.facts,
      {
        id: `${document.id}-m${crypto.randomUUID().slice(0, 6)}`,
        documentId: document.id,
        extracted: value,
        anchor: {
          documentId: document.id,
          documentSha256: document.sha256,
          page,
          region: region ?? { x: 0, y: 0, w: 1, h: 1 },
          quote: "Entered by the worker",
          method: "worker_manual",
        },
        confidence: 1,
        method: "worker_manual",
        consequential: CONSEQUENTIAL_KINDS.has(value.kind),
        review: "confirmed",
        correctedValue: null,
        reviewedAt: now(),
      },
    ],
  }));
}

export async function setWorked(caseId: string, confirmation: Omit<Extract<WorkerConfirmation, { type: "worked_interval" }>, "id" | "at" | "type">) {
  await updateCase(caseId, (c) => ({
    confirmations: [
      ...c.confirmations.filter((x) => !(x.type === "worked_interval" && x.date === confirmation.date)),
      { type: "worked_interval", id: `confirm-${confirmation.date}`, at: now(), ...confirmation },
    ],
  }));
}

export async function clearWorked(caseId: string, date: string) {
  await updateCase(caseId, (c) => ({
    confirmations: c.confirmations.filter((x) => !(x.type === "worked_interval" && x.date === date)),
  }));
}

/** The worker says what kind of document this is, without re-reading it. */
export async function setDocumentClass(caseId: string, documentId: string, docClass: DocumentClass) {
  await updateCase(caseId, (c) => ({
    documents: c.documents.map((d) => (d.id === documentId ? { ...d, docClass, classMethod: "worker" as const, classConfidence: 1 } : d)),
  }));
}

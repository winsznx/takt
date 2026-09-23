"use client";
import Dexie, { type EntityTable } from "dexie";
import type {
  ClaimantDetails,
  EvidenceDocument,
  EvidenceFact,
  ScopeAnswers,
  VerificationReceipt,
  WorkerConfirmation,
} from "@/lib/domain/contracts";

/**
 * Local-first case storage. Everything a worker enters or uploads lives in
 * this browser's IndexedDB. Nothing here is synced anywhere.
 */

export interface PacketRecord {
  generatedAt: string;
  packetSha256: string;
  manifestSha256: string;
  owed: string;
  receipt: VerificationReceipt;
}

export interface StoredCase {
  id: string;
  /** Short reference printed on the packet, e.g. TAKT-7F3K2Q. */
  reference: string;
  createdAt: string;
  updatedAt: string;
  sample: string | null;
  details: ClaimantDetails;
  scopeAnswers: ScopeAnswers | null;
  documents: EvidenceDocument[];
  facts: EvidenceFact[];
  factNotes: Record<string, string>;
  /** Documents where the model saw text trying to instruct it. */
  injectionWarnings: string[];
  confirmations: WorkerConfirmation[];
  extractionModel: string | null;
  lastPacket: PacketRecord | null;
}

export interface StoredBlob {
  key: string;
  caseId: string;
  bytes: Blob;
}

class TaktDatabase extends Dexie {
  cases!: EntityTable<StoredCase, "id">;
  blobs!: EntityTable<StoredBlob, "key">;
  constructor() {
    super("takt");
    this.version(1).stores({ cases: "id, updatedAt", blobs: "key, caseId" });
  }
}

export const db = new TaktDatabase();
export const blobKey = (caseId: string, documentId: string) => `${caseId}:${documentId}`;

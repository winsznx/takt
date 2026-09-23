import type { EvidenceDocument, MimeType } from "@/lib/domain/contracts";
import { sha256Hex } from "@/lib/hash";

/**
 * Takt Intake. The untouched original is hashed before anything else reads it,
 * the declared type is checked against the file's magic bytes, and a file whose
 * bytes were already ingested is recorded as a duplicate that contributes no
 * facts.
 */

export const MAX_FILE_BYTES = 15 * 1024 * 1024;
export const MAX_FILES_PER_CASE = 40;

export function sniffMime(bytes: Uint8Array): MimeType | null {
  const starts = (sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (starts([0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  return null;
}

export type IntakeResult = { ok: true; document: EvidenceDocument } | { ok: false; filename: string; reason: string };

export async function intakeFile(
  file: { bytes: Uint8Array; filename: string },
  existing: EvidenceDocument[],
  context: { id: string; now: string },
): Promise<IntakeResult> {
  const filename = file.filename.slice(0, 255) || "untitled";
  if (file.bytes.byteLength === 0) return { ok: false, filename, reason: "The file is empty." };
  if (file.bytes.byteLength > MAX_FILE_BYTES) {
    return { ok: false, filename, reason: "The file is larger than 15 MB. Try a smaller photo or a single page." };
  }
  if (existing.length >= MAX_FILES_PER_CASE) {
    return { ok: false, filename, reason: `A case can hold up to ${MAX_FILES_PER_CASE} files.` };
  }
  const sha256 = await sha256Hex(file.bytes);
  const mimeType = sniffMime(file.bytes);
  if (!mimeType) {
    return { ok: false, filename, reason: "Takt accepts PDF, PNG, and JPEG files. This file is not one of those." };
  }
  const original = existing.find((d) => d.sha256 === sha256 && d.duplicateOf === null);
  return {
    ok: true,
    document: {
      id: context.id,
      filename,
      mimeType,
      sha256,
      byteLength: file.bytes.byteLength,
      pageCount: mimeType === "application/pdf" ? null : 1,
      docClass: null,
      classMethod: null,
      classConfidence: null,
      status: original ? "duplicate" : "hashed",
      duplicateOf: original?.id ?? null,
      ingestedAt: context.now,
      extractionVersion: null,
      extractionError: null,
    },
  };
}

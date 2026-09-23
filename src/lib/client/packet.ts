"use client";
import { EXTRACTION_PROMPT_VERSION, EXTRACTION_SCHEMA_VERSION } from "@/lib/ai/extraction-schema";
import { buildPacket, type BuiltPacket } from "@/lib/packet/build";
import { verifyPacket } from "@/lib/packet/verify";
import type { VerificationReceipt } from "@/lib/domain/contracts";
import { sha256Hex } from "@/lib/hash";
import { readOriginal } from "@/lib/client/cases";
import { db, type StoredCase } from "@/lib/client/db";

export const APP = {
  version: process.env.NEXT_PUBLIC_TAKT_VERSION ?? "0.0.0",
  commit: process.env.NEXT_PUBLIC_TAKT_COMMIT ?? "unknown",
};

const cache = new Map<string, Promise<Uint8Array>>();
export function fetchAsset(path: string): Promise<Uint8Array> {
  if (!cache.has(path)) {
    cache.set(
      path,
      fetch(path).then(async (r) => {
        if (!r.ok) throw new Error(`Could not load ${path}`);
        return new Uint8Array(await r.arrayBuffer());
      }),
    );
  }
  return cache.get(path)!;
}

export async function generatePacket(stored: StoredCase, includeSources: boolean): Promise<{ built: BuiltPacket; receipt: VerificationReceipt }> {
  const included = new Map<string, Uint8Array>();
  if (includeSources) {
    for (const doc of stored.documents) {
      const bytes = doc.duplicateOf ? null : await readOriginal(stored.id, doc.id);
      if (bytes) included.set(doc.id, bytes);
    }
  }
  const [form1Template, form55Template, font] = await Promise.all([
    fetchAsset("/generated/dlse-form-1.pdf"),
    fetchAsset("/generated/dlse-form-55.xls"),
    fetchAsset("/generated/NotoSans-Regular.ttf"),
  ]);
  const built = await buildPacket(
    {
      caseId: stored.reference,
      generatedAt: new Date().toISOString(),
      app: APP,
      details: stored.details,
      inputs: { documents: stored.documents, facts: stored.facts, confirmations: stored.confirmations, scopeAnswers: stored.scopeAnswers },
      extraction: { model: stored.extractionModel, promptVersion: EXTRACTION_PROMPT_VERSION, schemaVersion: EXTRACTION_SCHEMA_VERSION },
      includedSources: included,
    },
    { form1Template, form55Template, font },
  );
  const originals = (await Promise.all(stored.documents.filter((d) => !d.duplicateOf).map((d) => readOriginal(stored.id, d.id)))).filter(
    (b): b is Uint8Array => b !== null,
  );
  const receipt = await verifyPacket(built.zip, { form55Template, originals });
  const record = {
    generatedAt: built.manifest.generatedAt,
    packetSha256: await sha256Hex(built.zip),
    manifestSha256: built.manifestSha256,
    owed: built.manifest.totals.owed,
    receipt,
  };
  await db.cases.update(stored.id, { lastPacket: record });
  return { built, receipt };
}

export async function verifyUploadedPacket(bytes: Uint8Array, originals: Uint8Array[] = []): Promise<VerificationReceipt> {
  return verifyPacket(bytes, { form55Template: await fetchAsset("/generated/dlse-form-55.xls"), originals });
}

export function download(bytes: Uint8Array, filename: string, type = "application/zip") {
  const url = URL.createObjectURL(new Blob([bytes.slice()], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

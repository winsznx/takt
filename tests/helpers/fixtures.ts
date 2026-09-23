import { readFile } from "node:fs/promises";
import path from "node:path";
import type { FixtureCase } from "../../scripts/fixtures/cases";

const ROOT = path.resolve(import.meta.dirname, "..", "..", "fixtures");

export type FixtureTruth = Omit<FixtureCase, "documents"> & { documents: { file: string; docClass: string }[] };

export async function loadTruth(caseId: string): Promise<FixtureTruth> {
  return JSON.parse(await readFile(path.join(ROOT, caseId, "truth.json"), "utf8"));
}

export async function loadDocument(caseId: string, file: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(path.join(ROOT, caseId, "documents", file)));
}

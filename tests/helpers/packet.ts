import { buildPacket, type PacketRequest } from "@/lib/packet/build";
import { caseFromFixture } from "./case-from-fixture";
import { form1Template, form55Template, unicodeFont } from "./artifacts";

export const artifacts = async () => ({ form1Template: await form1Template(), form55Template: await form55Template(), font: await unicodeFont() });

export async function fixturePacket(caseId: string, opts: { includeSources?: boolean } = {}) {
  const { truth, inputs, originals } = await caseFromFixture(caseId);
  const request: PacketRequest = {
    caseId,
    generatedAt: "2026-09-20T18:30:00.000Z",
    app: { version: "0.1.0", commit: "test" },
    details: truth.claimant,
    inputs,
    extraction: { model: null, promptVersion: "vision-prompt/1", schemaVersion: "vision-extraction/1" },
    includedSources: opts.includeSources ? originals : new Map(),
  };
  const built = await buildPacket(request, await artifacts());
  return { truth, inputs, originals, request, built };
}

import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { PDFDocument } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import type { ClaimPacketManifest } from "@/lib/domain/contracts";
import { FORM1_FIELDS } from "@/lib/forms/form1";
import { sha256Hex } from "@/lib/hash";
import { canonicalJson } from "@/lib/packet/canonical-json";
import { verifyPacket } from "@/lib/packet/verify";
import { form55Template } from "../helpers/artifacts";
import { fixturePacket } from "../helpers/packet";

/** TAKT-TAMPER-001: mutations of the canonical TAKT-DEMO-001 packet. */
let files: Record<string, Uint8Array>;
let originals: Uint8Array[];

beforeAll(async () => {
  const demo = await fixturePacket("TAKT-DEMO-001", { includeSources: true });
  files = unzipSync(demo.built.zip);
  originals = [...demo.originals.values()];
});

const rezip = (f: Record<string, Uint8Array>) => zipSync(Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v])));
const manifestOf = (f: Record<string, Uint8Array>) => JSON.parse(strFromU8(f["manifest.json"])) as ClaimPacketManifest;

/** Rewrites a file and updates its manifest hash so only deeper checks can catch it. */
async function consistentRewrite(f: Record<string, Uint8Array>, path: string, bytes: Uint8Array) {
  const manifest = manifestOf(f);
  const entry = manifest.files.find((x) => x.path === path)!;
  entry.sha256 = await sha256Hex(bytes);
  entry.bytes = bytes.byteLength;
  return { ...f, [path]: bytes, "manifest.json": strToU8(canonicalJson(manifest)) };
}

function tamperOwed(csv: string): string {
  const changed = csv.replace(/(,SUMMARY,owed,,,,,)9\.25/, "$190.25");
  if (changed === csv) throw new Error("tamper did not apply");
  return changed;
}

const failedChecks = async (zip: Uint8Array) => {
  const receipt = await verifyPacket(zip, { form55Template: await form55Template() });
  return { status: receipt.status, failed: receipt.checks.filter((c) => c.status === "fail").map((c) => c.id) };
};

describe("TAKT-TAMPER-001", () => {
  it("rejects a changed calculation.csv amount", async () => {
    const csv = tamperOwed(strFromU8(files["calculation.csv"]));
    const result = await failedChecks(rezip({ ...files, "calculation.csv": strToU8(csv) }));
    expect(result.status).toBe("VERIFICATION_FAILED");
    expect(result.failed).toContain("file:calculation.csv");
  });

  it("rejects a changed calculation.csv even when the manifest hash is updated to match", async () => {
    const csv = tamperOwed(strFromU8(files["calculation.csv"]));
    const result = await failedChecks(rezip(await consistentRewrite(files, "calculation.csv", strToU8(csv))));
    expect(result.failed).toContain("csv.matches");
  });

  it("rejects an edited total in the manifest", async () => {
    const manifest = manifestOf(files);
    manifest.totals.owed = "92.50";
    manifest.calculations[0].owed = "92.50";
    const result = await failedChecks(rezip({ ...files, "manifest.json": strToU8(canonicalJson(manifest)) }));
    expect(result.status).toBe("VERIFICATION_FAILED");
    expect(result.failed).toEqual(expect.arrayContaining(["replay.totals", "replay.calculations", "arithmetic.independent"]));
  });

  it("rejects an edited calculation line whose arithmetic no longer holds", async () => {
    const manifest = manifestOf(files);
    manifest.calculations[0].lines.find((l) => l.ruleId === "CA-OT-DAILY-8")!.minutes = 200;
    const result = await failedChecks(rezip({ ...files, "manifest.json": strToU8(canonicalJson(manifest)) }));
    expect(result.failed).toContain("arithmetic.independent");
  });

  it("rejects a Form 1 whose grand total was edited", async () => {
    const pdf = await PDFDocument.load(files["claim-form-1.pdf"]);
    pdf.getForm().getTextField(FORM1_FIELDS.q36GrandTotal).setText("925.00");
    const result = await failedChecks(rezip(await consistentRewrite(files, "claim-form-1.pdf", await pdf.save())));
    expect(result.failed).toContain("form1.readback");
  });

  it("rejects a source copy that changed after the manifest was generated", async () => {
    const path = Object.keys(files).find((p) => p.startsWith("sources/") && p.endsWith(".pdf"))!;
    const changed = files[path].slice();
    changed[changed.length - 20] ^= 0x01;
    const result = await failedChecks(rezip({ ...files, [path]: changed }));
    expect(result.failed).toEqual(expect.arrayContaining([`file:${path}`, "sources.included"]));
  });

  it("rejects an original held by the worker that no longer matches", async () => {
    const changed = originals[1].slice();
    changed[changed.length - 20] ^= 0x01;
    const receipt = await verifyPacket(rezip(files), { originals: [originals[0], changed] });
    expect(receipt.checks.find((c) => c.id === "sources.originals")?.status).toBe("fail");
  });

  it("rejects a file slipped into the packet", async () => {
    const result = await failedChecks(rezip({ ...files, "extra-proof.pdf": strToU8("%PDF-1.4 fake") }));
    expect(result.failed).toContain("file:extra-proof.pdf");
  });

  it("rejects an unreviewed fact passed off as reviewed evidence", async () => {
    const manifest = manifestOf(files);
    manifest.facts[0].review = "unreviewed";
    const result = await failedChecks(rezip({ ...files, "manifest.json": strToU8(canonicalJson(manifest)) }));
    expect(result.failed).toContain("facts.reviewed");
  });

  it("rejects a rule that is not in the pinned ruleset", async () => {
    const manifest = manifestOf(files);
    manifest.discrepancies[0].ruleId = "TAKT-MADE-UP";
    const result = await failedChecks(rezip({ ...files, "manifest.json": strToU8(canonicalJson(manifest)) }));
    expect(result.failed).toContain("rules.pinned");
  });

  it("calls a packet without a manifest unverifiable", async () => {
    const rest = { ...files };
    delete rest["manifest.json"];
    expect((await verifyPacket(rezip(rest))).status).toBe("UNVERIFIABLE_PACKET");
    expect((await verifyPacket(strToU8("not a zip"))).status).toBe("UNVERIFIABLE_PACKET");
  });
});

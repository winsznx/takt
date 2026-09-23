import { describe, expect, it } from "vitest";
import { verifyPacket } from "@/lib/packet/verify";
import { form55Template } from "../helpers/artifacts";
import { artifacts, fixturePacket } from "../helpers/packet";
import { buildPacket } from "@/lib/packet/build";

describe("TAKT-DEMO-001 canonical packet", () => {
  it("finds the 20-minute start discrepancy and prices it deterministically", async () => {
    const { built, truth } = await fixturePacket("TAKT-DEMO-001", { includeSources: true });
    const { manifest, analysis } = built;
    for (const [date, state] of Object.entries(truth.expected.dayStates)) {
      expect(manifest.days.find((d) => d.date === date)?.state, date).toBe(state);
    }
    expect(manifest.discrepancies.map((d) => ({ type: d.type, date: d.scope.date, deltaMinutes: d.deltaMinutes }))).toEqual(truth.expected.discrepancies);
    expect(manifest.totals.owed).toBe(truth.expected.owed);
    expect(analysis.state).toBe("RECONCILED");
    expect(Object.keys(built.files).sort()).toEqual([
      "README.txt",
      "calculation.csv",
      "claim-form-1.pdf",
      "dlse-form-55.xls",
      "evidence-index.pdf",
      "manifest.json",
      "sources/01-Screenshot_2026-09-14_at_9.12.03_PM.png",
      "sources/02-Timecard_Export_0913.pdf",
      "sources/03-EarningsStatement_0918.pdf",
      "sources/04-IMG_4821.png",
    ]);
  });

  it("verifies independently", async () => {
    const { built, originals } = await fixturePacket("TAKT-DEMO-001", { includeSources: true });
    const receipt = await verifyPacket(built.zip, { form55Template: await form55Template(), originals: [...originals.values()] });
    const failures = receipt.checks.filter((c) => c.status === "fail");
    expect(failures).toEqual([]);
    expect(receipt.status).toBe("VERIFIED_PACKET");
    expect(receipt.manifestSha256).toBe(built.manifestSha256);
  });

  it("is byte-for-byte reproducible from the same inputs", async () => {
    const a = await fixturePacket("TAKT-DEMO-001");
    const b = await buildPacket(a.request, await artifacts());
    expect(Buffer.from(a.built.zip).equals(Buffer.from(b.zip))).toBe(true);
  });
});

describe("controls and refusals", () => {
  it("TAKT-CONTROL-001 finds nothing and claims nothing", async () => {
    const { built, truth } = await fixturePacket("TAKT-CONTROL-001");
    expect(built.manifest.discrepancies).toEqual([]);
    expect(built.manifest.totals.owed).toBe("0.00");
    expect(built.files["claim-form-1.pdf"]).toBeUndefined();
    for (const [date, state] of Object.entries(truth.expected.dayStates)) expect(built.manifest.days.find((d) => d.date === date)?.state).toBe(state);
    expect((await verifyPacket(built.zip)).status).toBe("VERIFIED_PACKET");
  });

  it("TAKT-AMBIG-001 abstains: no amount, no Form 1, reasons recorded", async () => {
    const { built, truth } = await fixturePacket("TAKT-AMBIG-001");
    for (const [date, state] of Object.entries(truth.expected.dayStates)) expect(built.manifest.days.find((d) => d.date === date)?.state, date).toBe(state);
    expect(built.analysis.state).toBe("CALCULATION_BLOCKED");
    expect(built.manifest.calculations[0].state).toBe("CALCULATION_BLOCKED");
    expect(built.files["claim-form-1.pdf"]).toBeUndefined();
    expect(built.manifest.limitations.join(" ")).toMatch(/was not calculated/);
    expect((await verifyPacket(built.zip)).status).toBe("VERIFIED_PACKET");
  });

  it("TAKT-UNSUPPORTED-001 refuses an authoritative amount", async () => {
    const { built } = await fixturePacket("TAKT-UNSUPPORTED-001");
    expect(built.analysis.state).toBe("UNSUPPORTED_CASE");
    expect(built.manifest.scope.decision.reasons.map((r) => r.code)).toContain("PIECE_OR_COMMISSION");
    expect(built.manifest.days.every((d) => d.state === "UNSUPPORTED_RULE")).toBe(true);
    expect(built.files["claim-form-1.pdf"]).toBeUndefined();
    expect(new TextDecoder().decode(built.files["README.txt"])).toMatch(/outside Takt's supported rules/);
  });
});

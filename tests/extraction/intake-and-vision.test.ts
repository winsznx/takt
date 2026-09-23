import { describe, expect, it } from "vitest";
import { toCandidates, type RawExtraction } from "@/lib/ai/extraction-schema";
import { readNativePdf } from "@/lib/documents/pdf-native";
import { intakeFile, sniffMime } from "@/lib/documents/ingest";
import { sha256Hex } from "@/lib/hash";
import { loadDocument } from "../helpers/fixtures";

const ctx = (id: string) => ({ id, now: "2026-09-23T00:00:00Z" });

describe("Takt Intake", () => {
  it("hashes the untouched original and recognizes type by content", async () => {
    const bytes = await loadDocument("TAKT-DEMO-001", "IMG_4821.png");
    const result = await intakeFile({ bytes, filename: "IMG_4821.png" }, [], ctx("d1"));
    expect(result.ok && result.document.sha256).toBe(await sha256Hex(bytes));
    expect(result.ok && result.document.mimeType).toBe("image/png");
  });

  it("records a second copy of the same bytes as a duplicate", async () => {
    const bytes = await loadDocument("TAKT-DEMO-001", "Timecard_Export_0913.pdf");
    const first = await intakeFile({ bytes, filename: "a.pdf" }, [], ctx("d1"));
    if (!first.ok) throw new Error("intake failed");
    const second = await intakeFile({ bytes, filename: "copy of a.pdf" }, [first.document], ctx("d2"));
    expect(second.ok && second.document).toMatchObject({ status: "duplicate", duplicateOf: "d1" });
  });

  it("rejects empty files and files whose bytes are not PDF, PNG, or JPEG", async () => {
    expect((await intakeFile({ bytes: new Uint8Array(), filename: "x.pdf" }, [], ctx("d"))).ok).toBe(false);
    const exe = new TextEncoder().encode("MZ\x90\x00 this is not a pdf");
    const result = await intakeFile({ bytes: exe, filename: "paystub.pdf" }, [], ctx("d"));
    expect(result.ok).toBe(false);
    expect(sniffMime(exe)).toBeNull();
  });

  it("surfaces a malformed PDF as a read error instead of crashing", async () => {
    const broken = new TextEncoder().encode("%PDF-1.7\n1 0 obj << /Type /Catalog >> garbage without xref");
    await expect(readNativePdf(broken)).rejects.toThrow();
  });
});

describe("vision output validation", () => {
  const base: RawExtraction = { document_class: "schedule", class_confidence: 0.9, embedded_instructions_detected: false, facts: [] };
  const fact = (overrides: Partial<RawExtraction["facts"][number]>) => ({
    kind: "scheduled_start",
    date: "2026-09-01",
    time: "07:40",
    quote: "7:40 AM",
    box_2d: [100, 200, 130, 320],
    legible: true,
    confidence: 0.95,
    ...overrides,
  });

  it("converts boxes to normalized regions", () => {
    const { candidates } = toCandidates({ ...base, facts: [fact({})] });
    expect(candidates[0].region).toEqual({ x: 0.2, y: 0.1, w: 0.12, h: 0.03 });
    expect(candidates[0].confidence).toBe(0.95);
  });

  it("caps confidence for illegible values", () => {
    const { candidates } = toCandidates({ ...base, facts: [fact({ legible: false, confidence: 0.9 })] });
    expect(candidates[0].confidence).toBe(0.5);
  });

  it("flags a value its own quote does not contain", () => {
    const { candidates } = toCandidates({ ...base, facts: [fact({ time: "07:10" })] });
    expect(candidates[0].confidence).toBeLessThanOrEqual(0.4);
    expect(candidates[0].note).toMatch(/does not contain/);
  });

  it("drops output that does not fit the contract", () => {
    const { candidates, rejected } = toCandidates({
      ...base,
      facts: [fact({ time: "7:40 AM" }), fact({ box_2d: [300, 10, 100, 20] }), fact({ kind: "legal_conclusion" })],
    });
    expect(candidates).toHaveLength(0);
    expect(rejected).toHaveLength(3);
  });
});

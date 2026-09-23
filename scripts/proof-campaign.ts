/**
 * Runs every synthetic fixture and every tamper mutation of the canonical
 * packet, and records what actually happened in evidence/campaign/results.json.
 * The /proof page renders only from this file.
 *
 *   npx tsx scripts/proof-campaign.ts
 */
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { PDFDocument } from "pdf-lib";
import type { ClaimPacketManifest } from "@/lib/domain/contracts";
import { FORM1_FIELDS } from "@/lib/forms/form1";
import { sha256Hex } from "@/lib/hash";
import { buildPacket } from "@/lib/packet/build";
import { canonicalJson } from "@/lib/packet/canonical-json";
import { verifyPacket, VERIFIER_VERSION } from "@/lib/packet/verify";
import { caseFromFixture } from "../tests/helpers/case-from-fixture";

const ROOT = path.resolve(import.meta.dirname, "..");
const read = async (p: string) => new Uint8Array(await readFile(path.join(ROOT, p)));
const CASES = ["TAKT-DEMO-001", "TAKT-CONTROL-001", "TAKT-AMBIG-001", "TAKT-UNSUPPORTED-001"];

type Files = Record<string, Uint8Array>;
const rezip = (f: Files) => zipSync(f);
const manifestOf = (f: Files) => JSON.parse(strFromU8(f["manifest.json"])) as ClaimPacketManifest;
const withManifest = (f: Files, m: ClaimPacketManifest) => ({ ...f, "manifest.json": strToU8(canonicalJson(m)) });
async function rehash(f: Files, p: string, bytes: Uint8Array): Promise<Files> {
  const m = manifestOf(f);
  const entry = m.files.find((x) => x.path === p)!;
  entry.sha256 = await sha256Hex(bytes);
  entry.bytes = bytes.byteLength;
  return withManifest({ ...f, [p]: bytes }, m);
}

const MUTATIONS: { id: string; description: string; apply: (f: Files) => Promise<Files> }[] = [
  {
    id: "csv-owed-edited",
    description: "calculation.csv owed changed from 9.25 to 90.25",
    apply: async (f) => ({ ...f, "calculation.csv": strToU8(strFromU8(f["calculation.csv"]).replace(/(,SUMMARY,owed,,,,,)9\.25/, "$190.25")) }),
  },
  {
    id: "csv-owed-edited-hash-updated",
    description: "Same CSV edit, with the manifest hash updated to match",
    apply: (f) => rehash(f, "calculation.csv", strToU8(strFromU8(f["calculation.csv"]).replace(/(,SUMMARY,owed,,,,,)9\.25/, "$190.25"))),
  },
  {
    id: "manifest-total-edited",
    description: "Manifest totals and period owed changed to 92.50",
    apply: async (f) => {
      const m = manifestOf(f);
      m.totals.owed = "92.50";
      m.calculations[0].owed = "92.50";
      return withManifest(f, m);
    },
  },
  {
    id: "calc-line-minutes-edited",
    description: "Overtime line changed from 20 to 200 minutes",
    apply: async (f) => {
      const m = manifestOf(f);
      m.calculations[0].lines.find((l) => l.ruleId === "CA-OT-DAILY-8")!.minutes = 200;
      return withManifest(f, m);
    },
  },
  {
    id: "form1-grand-total-edited",
    description: "Form 1 grand total changed to 925.00, manifest hash updated",
    apply: async (f) => {
      const pdf = await PDFDocument.load(f["claim-form-1.pdf"]);
      pdf.getForm().getTextField(FORM1_FIELDS.q36GrandTotal).setText("925.00");
      return rehash(f, "claim-form-1.pdf", await pdf.save());
    },
  },
  {
    id: "source-byte-flipped",
    description: "One byte of an included source PDF changed after generation",
    apply: async (f) => {
      const p = Object.keys(f).find((k) => k.startsWith("sources/") && k.endsWith(".pdf"))!;
      const b = f[p].slice();
      b[b.length - 20] ^= 1;
      return { ...f, [p]: b };
    },
  },
  { id: "file-added", description: "An unlisted file added to the ZIP", apply: async (f) => ({ ...f, "extra-proof.pdf": strToU8("%PDF-1.4 fake") }) },
  {
    id: "fact-marked-unreviewed",
    description: "A fact's review status changed to unreviewed",
    apply: async (f) => {
      const m = manifestOf(f);
      m.facts[0].review = "unreviewed";
      return withManifest(f, m);
    },
  },
  {
    id: "rule-id-invented",
    description: "A discrepancy's rule changed to one not in the pinned ruleset",
    apply: async (f) => {
      const m = manifestOf(f);
      m.discrepancies[0].ruleId = "TAKT-MADE-UP";
      return withManifest(f, m);
    },
  },
  {
    id: "manifest-removed",
    description: "manifest.json deleted from the packet",
    apply: async (f) => {
      const rest = { ...f };
      delete rest["manifest.json"];
      return rest;
    },
  },
];

async function main() {
  const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  const artifacts = {
    form1Template: await read("legal/ca-dlse/form-1/source.pdf"),
    form55Template: await read("legal/ca-dlse/form-55/source.xls"),
    font: await read("assets/fonts/NotoSans-Regular.ttf"),
  };
  const cases = [];
  let demoZip: Uint8Array | null = null;

  for (const caseId of CASES) {
    const { truth, inputs, originals } = await caseFromFixture(caseId);
    const built = await buildPacket(
      {
        caseId,
        generatedAt: "2026-09-20T18:30:00.000Z",
        app: { version: "0.1.0", commit },
        details: truth.claimant,
        inputs,
        extraction: { model: null, promptVersion: "vision-prompt/1", schemaVersion: "vision-extraction/1" },
        includedSources: caseId === "TAKT-DEMO-001" ? originals : new Map(),
      },
      artifacts,
    );
    if (caseId === "TAKT-DEMO-001") demoZip = built.zip;
    const receipt = await verifyPacket(built.zip, { form55Template: artifacts.form55Template, originals: [...originals.values()] });
    const days = built.manifest.days;
    const dayMatches = Object.entries(truth.expected.dayStates).filter(([d, s]) => days.find((x) => x.date === d)?.state === s).length;
    const observedDisc = built.manifest.discrepancies.map((d) => ({ type: d.type, date: d.scope.date, deltaMinutes: d.deltaMinutes }));
    const outcome =
      built.analysis.state === "UNSUPPORTED_CASE"
        ? "UNSUPPORTED_CASE"
        : built.analysis.state === "CALCULATION_BLOCKED"
          ? "CALCULATION_BLOCKED"
          : receipt.status === "VERIFIED_PACKET"
            ? "PACKET_VERIFIED"
            : receipt.status;
    const observedOwed = built.analysis.claimedPeriodIds.length || built.analysis.state === "RECONCILED" ? built.manifest.totals.owed : null;
    cases.push({
      caseId,
      synthetic: true,
      summary: truth.summary,
      expected: truth.expected,
      observed: {
        dayStates: Object.fromEntries(days.map((d) => [d.date, d.state])),
        discrepancies: observedDisc,
        owed: observedOwed,
        outcome,
        form1: Boolean(built.files["claim-form-1.pdf"]),
        form55: built.manifest.forms.form55.length,
        verifier: receipt.status,
        verifierChecks: { pass: receipt.checks.filter((c) => c.status === "pass").length, fail: receipt.checks.filter((c) => c.status === "fail").length },
      },
      dayStatesMatched: { matched: dayMatches, of: Object.keys(truth.expected.dayStates).length },
      discrepanciesMatch: canonicalJson(observedDisc) === canonicalJson(truth.expected.discrepancies),
      owedMatch: observedOwed === truth.expected.owed,
      outcomeMatch: outcome === truth.expected.outcome,
      packetSha256: await sha256Hex(built.zip),
    });
  }

  const files = unzipSync(demoZip!);
  const tamper = [];
  await mkdir(path.join(ROOT, "evidence", "tamper"), { recursive: true });
  for (const m of MUTATIONS) {
    const mutated = rezip(await m.apply(files));
    if (m.id === "form1-grand-total-edited") {
      await writeFile(path.join(ROOT, "evidence", "tamper", "takt-tamper-001.zip"), mutated);
    }
    const receipt = await verifyPacket(mutated, { form55Template: artifacts.form55Template });
    tamper.push({
      id: m.id,
      description: m.description,
      status: receipt.status,
      rejected: receipt.status !== "VERIFIED_PACKET",
      failedChecks: receipt.checks.filter((c) => c.status === "fail").map((c) => c.id),
    });
  }

  const results = {
    generatedBy: "scripts/proof-campaign.ts",
    commit,
    verifierVersion: VERIFIER_VERSION,
    extraction: "PDF facts: deterministic native extraction. Image facts: entered from fixture labels (worker_manual); no vision model was run.",
    cases,
    tamper,
    summary: {
      casesOutcomeCorrect: { value: cases.filter((c) => c.outcomeMatch).length, of: cases.length },
      dayStatesCorrect: { value: cases.reduce((a, c) => a + c.dayStatesMatched.matched, 0), of: cases.reduce((a, c) => a + c.dayStatesMatched.of, 0) },
      discrepancySetsExact: { value: cases.filter((c) => c.discrepanciesMatch).length, of: cases.length },
      amountsExact: { value: cases.filter((c) => c.owedMatch).length, of: cases.length },
      falseDiscrepanciesOnControl: cases.find((c) => c.caseId === "TAKT-CONTROL-001")!.observed.discrepancies.length,
      tamperRejected: { value: tamper.filter((t) => t.rejected).length, of: tamper.length },
    },
  };
  await mkdir(path.join(ROOT, "evidence", "campaign"), { recursive: true });
  await writeFile(path.join(ROOT, "evidence", "campaign", "results.json"), `${JSON.stringify(results, null, 2)}\n`);
  console.log(JSON.stringify(results.summary, null, 2));
}

await main();

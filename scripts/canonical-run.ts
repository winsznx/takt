/**
 * Produces the canonical TAKT-DEMO-001 run from the committed synthetic fixture
 * and writes evidence/canonical/{takt-demo.zip, manifest.json, run.json}.
 *
 *   npx tsx scripts/canonical-run.ts
 */
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";
import { buildPacket } from "@/lib/packet/build";
import { verifyPacket } from "@/lib/packet/verify";
import { sha256Hex } from "@/lib/hash";
import { caseFromFixture } from "../tests/helpers/case-from-fixture";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "evidence", "canonical");
const read = async (p: string) => new Uint8Array(await readFile(path.join(ROOT, p)));

async function main() {
  const caseId = "TAKT-DEMO-001";
  const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  const { version } = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8")) as { version: string };
  const { truth, inputs, originals } = await caseFromFixture(caseId);

  const built = await buildPacket(
    {
      caseId,
      generatedAt: "2026-09-20T18:30:00.000Z",
      app: { version, commit },
      details: truth.claimant,
      inputs,
      extraction: { model: null, promptVersion: "vision-prompt/1", schemaVersion: "vision-extraction/1" },
      includedSources: originals,
    },
    { form1Template: await read("legal/ca-dlse/form-1/source.pdf"), form55Template: await read("legal/ca-dlse/form-55/source.xls"), font: await read("assets/fonts/NotoSans-Regular.ttf") },
  );
  const receipt = await verifyPacket(built.zip, { form55Template: await read("legal/ca-dlse/form-55/source.xls"), originals: [...originals.values()] });

  await mkdir(OUT, { recursive: true });
  await writeFile(path.join(OUT, "takt-demo.zip"), built.zip);
  await writeFile(path.join(OUT, "manifest.json"), unzipSync(built.zip)["manifest.json"]);
  const { manifest } = built;
  const run = {
    case_id: caseId,
    synthetic_fixture: true,
    commit,
    app_version: version,
    deployment: null,
    model: manifest.extraction.model,
    extraction_paths: {
      pdf: "pdf_native_text (deterministic, pdf.js coordinates)",
      images: manifest.facts.some((f) => f.method === "vision_model")
        ? "vision_model"
        : "worker_manual — image facts were entered from the fixture labels because no vision model was run for this receipt",
    },
    form_versions: ["DLSE WCA Form 1 REV. 07/2025", "DLSE Form 55 (dir.ca.gov, last saved 2011-08-09)"],
    source_hashes: manifest.sources.map((s) => ({ file: s.filename, sha256: s.sha256 })),
    fact_count: manifest.facts.length,
    confirmed_fact_count: manifest.facts.filter((f) => f.review === "confirmed" || f.review === "corrected").length,
    rejected_fact_count: manifest.facts.filter((f) => f.review === "rejected").length,
    discrepancies: manifest.discrepancies.map((d) => ({ type: d.type, date: d.scope.date, delta_minutes: d.deltaMinutes, rule: d.ruleId })),
    calculation_rule_ids: [...new Set(manifest.calculations.flatMap((c) => c.ruleIds))],
    totals: manifest.totals,
    packet_sha256: await sha256Hex(built.zip),
    manifest_sha256: built.manifestSha256,
    verifier_version: receipt.verifierVersion,
    verifier_status: receipt.status,
    verifier_checks: receipt.checks,
    limitations: manifest.limitations,
  };
  await writeFile(path.join(OUT, "run.json"), `${JSON.stringify(run, null, 2)}\n`);
  console.log(`${caseId}: ${receipt.status}, owed $${manifest.totals.owed}, packet ${run.packet_sha256.slice(0, 12)}`);
  if (receipt.status !== "VERIFIED_PACKET") process.exit(1);
}

await main();

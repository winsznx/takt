/**
 * Copies runtime assets into public/generated (gitignored) before dev/build:
 * the pinned official form templates (hash-checked), the Unicode font, the
 * pdf.js worker, and the synthetic sample cases.
 */
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "public", "generated");
const SAMPLE_CASES = ["TAKT-DEMO-001", "TAKT-CONTROL-001", "TAKT-AMBIG-001", "TAKT-UNSUPPORTED-001"];

async function pinned(relative: string, expected: string, target: string) {
  const bytes = await readFile(path.join(ROOT, relative));
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (hash !== expected) throw new Error(`${relative} hash ${hash} does not match its pin ${expected}`);
  await writeFile(path.join(OUT, target), bytes);
}

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(path.join(OUT, "samples"), { recursive: true });
  const pin = async (dir: string) => (await readFile(path.join(ROOT, "legal/ca-dlse", dir, "source.sha256"), "utf8")).split(/\s+/)[0];
  await pinned("legal/ca-dlse/form-1/source.pdf", await pin("form-1"), "dlse-form-1.pdf");
  await pinned("legal/ca-dlse/form-55/source.xls", await pin("form-55"), "dlse-form-55.xls");
  await copyFile(path.join(ROOT, "assets/fonts/NotoSans-Regular.ttf"), path.join(OUT, "NotoSans-Regular.ttf"));
  await copyFile(path.join(ROOT, "node_modules/pdfjs-dist/build/pdf.worker.min.mjs"), path.join(OUT, "pdf.worker.min.mjs"));

  await mkdir(path.join(OUT, "evidence"), { recursive: true });
  await copyFile(path.join(ROOT, "evidence/canonical/takt-demo.zip"), path.join(OUT, "evidence", "takt-demo-001.zip"));
  await copyFile(path.join(ROOT, "evidence/tamper/takt-tamper-001.zip"), path.join(OUT, "evidence", "takt-tamper-001.zip"));

  const index = [];
  for (const caseId of SAMPLE_CASES) {
    const dir = path.join(ROOT, "fixtures", caseId);
    const truth = JSON.parse(await readFile(path.join(dir, "truth.json"), "utf8"));
    await mkdir(path.join(OUT, "samples", caseId), { recursive: true });
    const files = [];
    for (const file of await readdir(path.join(dir, "documents"))) {
      const safe = file.replace(/[^\w.-]+/g, "_");
      await copyFile(path.join(dir, "documents", file), path.join(OUT, "samples", caseId, safe));
      const docClass = truth.documents.find((d: { file: string }) => d.file === file)?.docClass ?? null;
      files.push({ file, url: `/generated/samples/${caseId}/${safe}`, docClass });
    }
    index.push({
      caseId,
      summary: truth.summary,
      claimant: truth.claimant,
      scopeAnswers: truth.scopeAnswers,
      workerStatements: truth.workerStatements,
      files,
      imageFacts: truth.expectedFacts.filter((f: { file: string }) => !f.file.endsWith(".pdf")),
    });
  }
  await writeFile(path.join(OUT, "samples", "index.json"), JSON.stringify(index));
  console.log(`public/generated ready (${SAMPLE_CASES.length} sample cases)`);
}

await main();

/**
 * Pins official California DLSE artifacts into legal/ca-dlse.
 *
 *   npx tsx scripts/pin-legal-sources.ts          download + write metadata
 *   npx tsx scripts/pin-legal-sources.ts --check  re-download and report drift, write nothing
 *
 * The pinned copies are the runtime source of truth. The official URLs are
 * never hot-linked by the application.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type SourceType = "form" | "instruction" | "rule-source";

interface PinnedSource {
  id: string;
  dir: string;
  file: string;
  url: string;
  title: string;
  sourceType: SourceType;
  legalScope: string;
  /** Revision text exactly as the artifact displays it; verified after download. */
  visibleRevision: string | null;
  /** A string that must appear in the downloaded bytes (latin1) for the pin to be accepted. */
  mustContain?: string;
}

const ROOT = path.resolve(import.meta.dirname, "..", "legal", "ca-dlse");

const SOURCES: PinnedSource[] = [
  {
    id: "dlse-wca-form-1-en",
    dir: "form-1",
    file: "source.pdf",
    url: "https://www.dir.ca.gov/dlse/Forms/Wage/English.pdf",
    title: "DLSE WCA Form 1 / Wage Adjudication — Initial Report or Claim (English)",
    sourceType: "form",
    legalScope: "California Labor Commissioner wage claim (non-public-works). Official claim form.",
    visibleRevision: "REV. 07/2025",
  },
  {
    id: "dlse-form-55",
    dir: "form-55",
    file: "source.xls",
    url: "https://www.dir.ca.gov/dlse/DLSE-55-overtime-sheet.xls",
    title: "DLSE Form 55 — Overtime, Rest Period, Meal Period Computation Form",
    sourceType: "form",
    legalScope:
      "California Labor Commissioner wage claim supplement for claimants whose hours or days varied per week. Per-pay-period computation worksheet.",
    visibleRevision: null,
    mustContain: "OVERTIME, REST PERIOD, MEAL PERIOD COMPUTATION FORM",
  },
  {
    id: "dlse-forms-index",
    dir: "instructions",
    file: "dlse-forms.html",
    url: "https://www.dir.ca.gov/dlse/dlse-forms.htm",
    title: "DLSE forms index (Labor Commissioner's Office)",
    sourceType: "instruction",
    legalScope: "Official index linking Form 1 and Form 55.",
    visibleRevision: null,
    mustContain: "DLSE-55-overtime-sheet.xls",
  },
  {
    id: "dlse-how-to-file",
    dir: "instructions",
    file: "how-to-file-wage-claim.html",
    url: "https://www.dir.ca.gov/dlse/HowToFileWageClaim.htm",
    title: "How to File a Wage Claim",
    sourceType: "instruction",
    legalScope: "Official filing instructions, deadlines, and documentation guidance.",
    visibleRevision: null,
    mustContain: "Track all hours worked",
  },
  {
    id: "dlse-faq-overtime",
    dir: "rules",
    file: "faq-overtime.html",
    url: "https://www.dir.ca.gov/dlse/faq_overtime.htm",
    title: "Overtime — Frequently Asked Questions",
    sourceType: "rule-source",
    legalScope: "Official statement of daily/weekly/seventh-day overtime and double-time thresholds.",
    visibleRevision: null,
    mustContain: "seventh consecutive day",
  },
  {
    id: "dlse-faq-minimum-wage",
    dir: "rules",
    file: "faq-minimum-wage.html",
    url: "https://www.dir.ca.gov/dlse/faq_minimumwage.htm",
    title: "Minimum Wage — Frequently Asked Questions",
    sourceType: "rule-source",
    legalScope: "Official California statewide minimum wage schedule.",
    visibleRevision: null,
    mustContain: "Effective January 1, 2026, the minimum wage is $16.90 per hour",
  },
];

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

async function download(url: string) {
  const res = await fetch(url, { headers: { "User-Agent": "takt-legal-pinning/1.0" } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return {
    bytes: new Uint8Array(await res.arrayBuffer()),
    contentType: res.headers.get("content-type"),
    lastModified: res.headers.get("last-modified"),
  };
}

async function extractPdfText(bytes: Uint8Array) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  const page = await doc.getPage(1);
  const content = await page.getTextContent();
  return content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
}

async function assertIdentity(source: PinnedSource, bytes: Uint8Array) {
  if (source.file.endsWith(".pdf")) {
    const text = await extractPdfText(bytes);
    if (source.visibleRevision && !text.includes(source.visibleRevision)) {
      throw new Error(`${source.id}: expected visible revision "${source.visibleRevision}" not found`);
    }
  }
  if (source.mustContain && !Buffer.from(bytes).toString("latin1").includes(source.mustContain)) {
    throw new Error(`${source.id}: expected marker "${source.mustContain}" not found`);
  }
}

async function main() {
  const checkOnly = process.argv.includes("--check");
  let drift = 0;

  for (const source of SOURCES) {
    const { bytes, contentType, lastModified } = await download(source.url);
    await assertIdentity(source, bytes);
    const hash = sha256(bytes);
    const dir = path.join(ROOT, source.dir);
    const base = source.file.replace(/\.[^.]+$/, "");
    const metadataPath = path.join(dir, source.dir.startsWith("form-") ? "metadata.json" : `${base}.metadata.json`);

    if (checkOnly) {
      const pinned = JSON.parse(await readFile(metadataPath, "utf8")) as { sha256: string };
      const same = pinned.sha256 === hash;
      if (!same) drift++;
      console.log(`${same ? "UNCHANGED" : "DRIFTED  "} ${source.id} pinned=${pinned.sha256.slice(0, 12)} live=${hash.slice(0, 12)}`);
      continue;
    }

    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, source.file), bytes);
    if (source.dir.startsWith("form-")) {
      await writeFile(path.join(dir, "source.sha256"), `${hash}  ${source.file}\n`);
    }
    const metadata = {
      id: source.id,
      title: source.title,
      officialUrl: source.url,
      retrievedAt: new Date().toISOString(),
      visibleRevision: source.visibleRevision,
      httpLastModified: lastModified,
      contentType,
      bytes: bytes.byteLength,
      sha256: hash,
      sourceType: source.sourceType,
      legalScope: source.legalScope,
      file: source.file,
    };
    await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
    console.log(`PINNED ${source.id} ${hash}`);
  }

  if (checkOnly && drift > 0) {
    console.error(`${drift} pinned source(s) no longer match the official URL. Review before re-pinning.`);
    process.exitCode = 1;
  }
}

await main();

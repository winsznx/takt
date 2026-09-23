import { strFromU8, unzipSync } from "fflate";
import * as XLSX from "xlsx";
import {
  ClaimPacketManifest,
  type EvidenceDocument,
  type VerificationCheck,
  type VerificationReceipt,
} from "@/lib/domain/contracts";
import { analyzeCase } from "@/lib/domain/analyze";
import { snapshotSheetCells, structuralRecords } from "@/lib/forms/biff8";
import { FORM1_CLAIM_ROWS, FORM1_FIELDS, FORM1_REVISION, FORM1_TEMPLATE_SHA256 } from "@/lib/forms/form1";
import { FORM55_CELLS, FORM55_TEMPLATE_SHA256, periodLabel } from "@/lib/forms/form55";
import { readPdfForm } from "@/lib/forms/pdf-fields";
import { sha256Hex } from "@/lib/hash";
import { RULE_LIST } from "@/lib/rules/ca-dlse-2026-09";
import { parseCsv } from "@/lib/packet/calculation-csv";
import { canonicalJson } from "@/lib/packet/canonical-json";

/**
 * Takt Verify. Takes nothing from the generator but the packet bytes.
 *
 * - Every file is re-hashed against the manifest, and no unlisted file is allowed.
 * - The whole reconciliation and calculation is replayed from the manifest's
 *   inputs (sources, facts, worker statements, scope answers) and must match
 *   the manifest's recorded results exactly.
 * - Money arithmetic and overtime caps are re-checked with a separate
 *   implementation that does not use Takt's calculator.
 * - Form 1 is read back with pdf.js; Form 55 with SheetJS and a record-level
 *   diff against the pinned official workbook.
 */

export const VERIFIER_VERSION = "takt-verify/1";

export interface VerifyOptions {
  form55Template?: Uint8Array;
  /** Original evidence files held by the worker, to re-hash against the manifest. */
  originals?: Uint8Array[];
  now?: string;
}

// ---------------------------------------------------------------------------
// Independent exact arithmetic (deliberately not lib/calc/rational)

type Frac = [bigint, bigint];
const gcd = (a: bigint, b: bigint): bigint => (b === 0n ? (a < 0n ? -a : a) : gcd(b, a % b));
const norm = ([n, d]: Frac): Frac => {
  const g = gcd(n, d) || 1n;
  return d < 0n ? [-n / g, -d / g] : [n / g, d / g];
};
const dec = (s: string): Frac => {
  const [whole, frac = ""] = s.replace("-", "").split(".");
  const n = BigInt(whole + frac) * (s.startsWith("-") ? -1n : 1n);
  return norm([n, 10n ** BigInt(frac.length)]);
};
const add = (a: Frac, b: Frac): Frac => norm([a[0] * b[1] + b[0] * a[1], a[1] * b[1]]);
const mul = (a: Frac, b: Frac): Frac => norm([a[0] * b[0], a[1] * b[1]]);
const eq = (a: Frac, b: Frac) => a[0] * b[1] === b[0] * a[1];
const cents = ([n, d]: Frac): string => {
  const neg = n < 0n;
  const abs = neg ? -n : n;
  let q = (abs * 100n) / d;
  if (((abs * 100n) % d) * 2n >= d) q += 1n;
  const s = q.toString().padStart(3, "0");
  return `${neg && q !== 0n ? "-" : ""}${s.slice(0, -2)}.${s.slice(-2)}`;
};
const parseRatio = (s: string): Frac => {
  const [n, d] = s.split("/");
  return norm([BigInt(n), BigInt(d)]);
};
const MULT: Record<string, Frac> = { "1": [1n, 1n], "1.5": [3n, 2n], "2": [2n, 1n] };
const moneyText = (s: string) => {
  const [w, f] = cents(dec(s)).replace("-", "").split(".");
  return `${s.startsWith("-") ? "-" : ""}${w.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${f}`;
};

// ---------------------------------------------------------------------------

export async function verifyPacket(zipBytes: Uint8Array, options: VerifyOptions = {}): Promise<VerificationReceipt> {
  const checks: VerificationCheck[] = [];
  const pass = (id: string, detail: string) => checks.push({ id, status: "pass", detail });
  const fail = (id: string, detail: string) => checks.push({ id, status: "fail", detail });
  const skip = (id: string, detail: string) => checks.push({ id, status: "skip", detail });
  const receipt = (status: VerificationReceipt["status"], manifestSha256: string | null, caseId: string | null): VerificationReceipt => ({
    status,
    manifestSha256,
    caseId,
    verifierVersion: VERIFIER_VERSION,
    checks,
    verifiedAt: options.now ?? new Date().toISOString(),
  });

  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(zipBytes);
    pass("packet.readable", `${Object.keys(entries).length} files in the packet.`);
  } catch {
    fail("packet.readable", "The file is not a readable ZIP packet.");
    return receipt("UNVERIFIABLE_PACKET", null, null);
  }

  const manifestBytes = entries["manifest.json"];
  if (!manifestBytes) {
    fail("manifest.present", "manifest.json is missing.");
    return receipt("UNVERIFIABLE_PACKET", null, null);
  }
  const manifestSha256 = await sha256Hex(manifestBytes);
  let manifest: ClaimPacketManifest;
  try {
    const parsed = ClaimPacketManifest.safeParse(JSON.parse(strFromU8(manifestBytes)));
    if (!parsed.success) {
      fail("manifest.schema", `manifest.json does not match takt-manifest/1: ${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}`);
      return receipt("UNVERIFIABLE_PACKET", manifestSha256, null);
    }
    manifest = parsed.data;
    pass("manifest.schema", "manifest.json matches takt-manifest/1.");
  } catch {
    fail("manifest.schema", "manifest.json is not valid JSON.");
    return receipt("UNVERIFIABLE_PACKET", manifestSha256, null);
  }
  if (canonicalJson(manifest) === strFromU8(manifestBytes)) pass("manifest.canonical", "manifest.json is in canonical form.");
  else fail("manifest.canonical", "manifest.json is not in canonical form; it was edited after generation.");

  // --- File inventory -------------------------------------------------------
  const listed = new Set(manifest.files.map((f) => f.path));
  let inventoryOk = true;
  for (const file of manifest.files) {
    const bytes = entries[file.path];
    if (!bytes) {
      fail(`file:${file.path}`, "Listed in the manifest but missing from the packet.");
      inventoryOk = false;
      continue;
    }
    const hash = await sha256Hex(bytes);
    if (hash !== file.sha256 || bytes.byteLength !== file.bytes) {
      fail(`file:${file.path}`, `SHA-256 is ${hash}, manifest says ${file.sha256}.`);
      inventoryOk = false;
    }
  }
  const extras = Object.keys(entries).filter((p) => p !== "manifest.json" && !listed.has(p) && !p.endsWith("/"));
  for (const extra of extras) {
    fail(`file:${extra}`, "Present in the packet but not listed in the manifest.");
    inventoryOk = false;
  }
  if (inventoryOk) pass("files.hashes", `All ${manifest.files.length} listed files match their SHA-256.`);

  // --- Sources and provenance ----------------------------------------------
  const sourceBySha = new Map(manifest.sources.map((s) => [s.sha256, s]));
  const included = manifest.sources.filter((s) => s.packetPath);
  if (included.length > 0) {
    const bad = [];
    for (const s of included) {
      const bytes = entries[s.packetPath!];
      if (!bytes || (await sha256Hex(bytes)) !== s.sha256) bad.push(s.filename);
    }
    if (bad.length) fail("sources.included", `Included copies do not match their recorded hash: ${bad.join(", ")}.`);
    else pass("sources.included", `${included.length} included source copies match their recorded SHA-256.`);
  } else {
    skip("sources.included", "The worker did not include copies of the original files.");
  }
  if (options.originals?.length) {
    const hashes = await Promise.all(options.originals.map((b) => sha256Hex(b)));
    const unknown = hashes.filter((h) => !sourceBySha.has(h));
    const missing = manifest.sources.filter((s) => !hashes.includes(s.sha256));
    if (unknown.length) fail("sources.originals", `${unknown.length} provided original(s) do not match any recorded source; a file may have been changed.`);
    else pass("sources.originals", `${hashes.length} provided originals match recorded sources${missing.length ? ` (${missing.length} not provided)` : ""}.`);
  }
  const sourceIds = new Map(manifest.sources.map((s) => [s.documentId, s]));
  const orphan = manifest.facts.filter((f) => sourceIds.get(f.documentId)?.sha256 !== f.anchor.documentSha256);
  if (orphan.length) fail("facts.provenance", `${orphan.length} facts point at a source hash that is not in the packet's source list.`);
  else pass("facts.provenance", `All ${manifest.facts.length} facts are anchored to a recorded source hash.`);
  const unreviewed = manifest.facts.filter((f) => f.consequential && f.review === "unreviewed");
  if (unreviewed.length) fail("facts.reviewed", `${unreviewed.length} consequential facts were never reviewed by the worker.`);
  else pass("facts.reviewed", "Every consequential fact was confirmed, corrected, or rejected by the worker.");

  // --- Rules ------------------------------------------------------------------
  const known = new Map(RULE_LIST.map((r) => [r.id, r]));
  const used = new Set([...manifest.calculations.flatMap((c) => c.ruleIds), ...manifest.discrepancies.map((d) => d.ruleId)]);
  const badRules = [...used].filter((id) => {
    const inManifest = manifest.ruleset.rules.find((r) => r.id === id);
    const pinned = known.get(id);
    return !inManifest || !pinned || inManifest.version !== pinned.version || inManifest.summary !== pinned.summary;
  });
  if (badRules.length) fail("rules.pinned", `Rules not in the pinned ruleset or altered: ${badRules.join(", ")}.`);
  else pass("rules.pinned", `${used.size} rules used, all match the pinned ${manifest.ruleset.id} ruleset.`);

  // --- Replay ---------------------------------------------------------------
  const documents: EvidenceDocument[] = manifest.sources.map((s) => ({
    id: s.documentId,
    filename: s.filename,
    mimeType: s.mimeType,
    sha256: s.sha256,
    byteLength: s.bytes,
    pageCount: null,
    docClass: s.docClass,
    classMethod: null,
    classConfidence: null,
    status: s.duplicateOf ? "duplicate" : "extracted",
    duplicateOf: s.duplicateOf,
    ingestedAt: manifest.generatedAt,
    extractionVersion: null,
    extractionError: null,
  }));
  const replay = analyzeCase({ documents, facts: manifest.facts, confirmations: manifest.confirmations, scopeAnswers: manifest.scope.answers });
  const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
  const replayChecks: [string, unknown, unknown, string][] = [
    ["replay.scope", replay.scope, manifest.scope.decision, "scope decision"],
    ["replay.days", replay.reconciliation.days, manifest.days, "day-by-day reconciliation"],
    ["replay.discrepancies", replay.reconciliation.discrepancies, manifest.discrepancies, "discrepancies"],
    ["replay.payroll", replay.reconciliation.payroll, manifest.payroll, "payroll records"],
    ["replay.calculations", replay.calculations, manifest.calculations, "calculations"],
    ["replay.totals", replay.totals, manifest.totals, "totals"],
  ];
  for (const [id, a, b, label] of replayChecks) {
    if (same(a, b)) pass(id, `Recomputed ${label} match the manifest.`);
    else fail(id, `Recomputed ${label} do not match the manifest.`);
  }

  // --- Independent arithmetic ------------------------------------------------
  const arithmeticErrors: string[] = [];
  let earnedAll: Frac = [0n, 1n];
  let paidAll: Frac = [0n, 1n];
  let owedAll: Frac = [0n, 1n];
  for (const c of manifest.calculations.filter((c) => c.state === "CALCULATED")) {
    const byMult: Record<string, Frac> = { "1": [0n, 1n], "1.5": [0n, 1n], "2": [0n, 1n] };
    const perDate = new Map<string, number>();
    for (const line of c.lines) {
      const expected = mul(mul([BigInt(line.minutes), 1n], dec(line.rate)), mul(MULT[line.multiplier], [1n, 60n]));
      if (!eq(expected, parseRatio(line.exactAmount))) arithmeticErrors.push(`${c.periodId} ${line.date} ${line.ruleId}`);
      byMult[line.multiplier] = add(byMult[line.multiplier], expected);
      if (line.multiplier === "1") perDate.set(line.date ?? "", (perDate.get(line.date ?? "") ?? 0) + line.minutes);
    }
    for (const [date, minutes] of perDate) if (minutes > 480) arithmeticErrors.push(`${date}: more than 8 regular hours`);
    const earned = { regular: cents(byMult["1"]), overtime: cents(byMult["1.5"]), doubleTime: cents(byMult["2"]) };
    const earnedTotal = add(add(dec(earned.regular), dec(earned.overtime)), dec(earned.doubleTime));
    const paid = add(add(dec(c.paid.regular), dec(c.paid.overtime)), dec(c.paid.doubleTime));
    const owed = add(earnedTotal, mul(paid, [-1n, 1n]));
    if (earned.regular !== c.earned.regular || earned.overtime !== c.earned.overtime || earned.doubleTime !== c.earned.doubleTime) {
      arithmeticErrors.push(`${c.periodId}: earned components`);
    }
    if (cents(earnedTotal) !== c.earned.total || cents(paid) !== c.paid.total || cents(owed) !== c.owed) {
      arithmeticErrors.push(`${c.periodId}: earned, paid, or owed total`);
    }
    const payroll = manifest.payroll.find((p) => p.id === c.periodId);
    if (!payroll || cents(dec(payroll.regularPay)) !== c.paid.regular) arithmeticErrors.push(`${c.periodId}: paid does not match the wage statement`);
    if (owed[0] > 0n) {
      earnedAll = add(earnedAll, earnedTotal);
      paidAll = add(paidAll, paid);
      owedAll = add(owedAll, owed);
    }
  }
  if (cents(earnedAll) !== manifest.totals.earned || cents(paidAll) !== manifest.totals.paid || cents(owedAll) !== manifest.totals.owed) {
    arithmeticErrors.push("claim totals");
  }
  if (arithmeticErrors.length) fail("arithmetic.independent", `Independent arithmetic disagrees: ${arithmeticErrors.slice(0, 5).join("; ")}.`);
  else pass("arithmetic.independent", `Every calculation line and total recomputes exactly (${manifest.calculations.reduce((a, c) => a + c.lines.length, 0)} lines).`);

  // --- calculation.csv -------------------------------------------------------
  const csvBytes = entries["calculation.csv"];
  if (!csvBytes) fail("csv.present", "calculation.csv is missing.");
  else {
    const rows = parseCsv(strFromU8(csvBytes)).slice(1);
    const lineRows = rows.filter((r) => r[4] !== "SUMMARY");
    const expectedLines = manifest.calculations.flatMap((c) => c.lines.map((l) => [c.periodId, l.date ?? "", l.ruleId, String(l.minutes), l.rate, l.multiplier, l.exactAmount].join("|")));
    const gotLines = lineRows.map((r) => [r[0], r[3], r[4], r[6], r[7], r[8], r[9]].join("|"));
    const owedRows = rows.filter((r) => r[5] === "owed").map((r) => `${r[0]}|${r[10]}`);
    const expectedOwed = manifest.calculations.map((c) => `${c.periodId}|${c.owed}`);
    if (same(gotLines, expectedLines) && same(owedRows, expectedOwed)) pass("csv.matches", `calculation.csv matches the manifest (${lineRows.length} lines).`);
    else fail("csv.matches", "calculation.csv does not match the manifest's calculation.");
  }

  // --- Form 1 ----------------------------------------------------------------
  const form1 = manifest.forms.form1;
  if (!form1.file) {
    if (manifest.totals.owed !== "0.00" && manifest.scope.decision.supported) fail("form1.present", "An amount is owed but no Form 1 was produced.");
    else skip("form1", "No amount to claim, so no Form 1 was produced.");
  } else if (!entries[form1.file]) {
    fail("form1.present", `${form1.file} is missing.`);
  } else {
    try {
      const read = await readPdfForm(entries[form1.file]);
      const problems: string[] = [];
      if (form1.templateSha256 !== FORM1_TEMPLATE_SHA256 || form1.revision !== FORM1_REVISION) problems.push("not the pinned Form 1 revision");
      if (!read.pageText[0]?.includes(FORM1_REVISION)) problems.push(`page 1 does not show ${FORM1_REVISION}`);
      for (const [name, value] of Object.entries(form1.fields)) {
        if (read.fields[name] !== value) problems.push(`field "${name.slice(0, 40)}" reads ${JSON.stringify(read.fields[name])}`);
      }
      const expectedTotals: [string, string][] = [
        [FORM1_FIELDS.q36Subtotal, moneyText(manifest.totals.earned)],
        [FORM1_FIELDS.q36TotalPaid, moneyText(manifest.totals.paid)],
        [FORM1_FIELDS.q36GrandTotal, moneyText(manifest.totals.owed)],
      ];
      for (const [name, value] of expectedTotals) if (read.fields[name] !== value) problems.push(`${name.slice(0, 30)} should be ${value}`);
      if (read.fields[FORM1_CLAIM_ROWS.regularWages.checkbox] !== true) problems.push("regular wages box not checked");
      if (read.fields[FORM1_FIELDS.signaturePrintName]) problems.push("signature block was filled by the generator");
      if (problems.length) fail("form1.readback", `Form 1 readback: ${problems.slice(0, 4).join("; ")}.`);
      else pass("form1.readback", `Form 1 (${FORM1_REVISION}) reads back ${Object.keys(form1.fields).length} fields that match the manifest and recomputed totals.`);
    } catch {
      fail("form1.readback", `${form1.file} could not be read as a PDF form.`);
    }
  }

  // --- Form 55 ---------------------------------------------------------------
  if (manifest.forms.form55.length === 0) skip("form55", "Form 55 does not apply to this packet.");
  for (const sheet of manifest.forms.form55) {
    const bytes = entries[sheet.file];
    if (!bytes) {
      fail(`form55:${sheet.file}`, "Missing.");
      continue;
    }
    try {
      const ws = XLSX.read(bytes, { type: "array" }).Sheets.Sheet1;
      const problems: string[] = [];
      sheet.periodIds.forEach((periodId, i) => {
        const c = manifest.calculations.find((x) => x.periodId === periodId);
        if (!c) {
          problems.push(`${periodId} not calculated`);
          return;
        }
        const row = FORM55_CELLS.firstPeriodRow + i + 1;
        const cell = (col: string) => ws[`${col}${row}`]?.v;
        if (cell("B") !== periodLabel(c)) problems.push(`B${row} period dates`);
        if (cell("C") !== Number(sheet.hourlyRate)) problems.push(`C${row} rate`);
        if (cell("D") !== Number(cents([BigInt(c.workedMinutes.regular), 60n]))) problems.push(`D${row} regular hours`);
        if (cell("I") !== Number(c.earned.total) || cell("J") !== Number(c.paid.total) || cell("K") !== Number(c.owed)) problems.push(`I–K${row} amounts`);
      });
      if (options.form55Template) {
        if ((await sha256Hex(options.form55Template)) !== FORM55_TEMPLATE_SHA256 || sheet.templateSha256 !== FORM55_TEMPLATE_SHA256) {
          problems.push("pinned template mismatch");
        } else {
          if (!same(structuralRecords(bytes), structuralRecords(options.form55Template))) problems.push("non-cell records differ from the official workbook");
          const before = new Map(snapshotSheetCells(options.form55Template, "Sheet1").map((c) => [`${c.row}:${c.col}`, c]));
          const allowedRows = new Set(sheet.periodIds.map((_, i) => FORM55_CELLS.firstPeriodRow + i));
          for (const cell of snapshotSheetCells(bytes, "Sheet1")) {
            const original = before.get(`${cell.row}:${cell.col}`);
            const mapped = cell.row === 2 || allowedRows.has(cell.row) || cell.row === FORM55_CELLS.totalsRow;
            if (!mapped && (!original || !same(original, cell))) problems.push(`unmapped cell r${cell.row}c${cell.col} changed`);
            if (original && original.xf !== cell.xf) problems.push(`style changed at r${cell.row}c${cell.col}`);
          }
        }
      }
      if (problems.length) fail(`form55:${sheet.file}`, `Form 55 readback: ${[...new Set(problems)].slice(0, 4).join("; ")}.`);
      else pass(`form55:${sheet.file}`, `Form 55 ${sheet.file}: ${sheet.periodIds.length} pay periods match the calculation${options.form55Template ? "; only mapped cells differ from the official workbook" : ""}.`);
    } catch {
      fail(`form55:${sheet.file}`, `${sheet.file} could not be read as a workbook.`);
    }
  }

  // --- Evidence index --------------------------------------------------------
  const index = entries["evidence-index.pdf"];
  if (!index) fail("index.present", "evidence-index.pdf is missing.");
  else {
    try {
      const read = await readPdfForm(index);
      if (read.pageText.join(" ").includes(manifest.caseId)) pass("index.readable", `evidence-index.pdf opens (${read.pageCount} pages) and names ${manifest.caseId}.`);
      else fail("index.readable", "evidence-index.pdf does not name this case.");
    } catch {
      fail("index.readable", "evidence-index.pdf could not be opened.");
    }
  }

  const failed = checks.some((c) => c.status === "fail");
  return receipt(failed ? "VERIFICATION_FAILED" : "VERIFIED_PACKET", manifestSha256, manifest.caseId);
}

import { strToU8, zipSync, type Zippable } from "fflate";
import {
  CONTRACT_VERSION,
  type ClaimantDetails,
  type ClaimPacketManifest,
  type PacketFile,
} from "@/lib/domain/contracts";
import { analyzeCase, type CaseAnalysis, type CaseInputs } from "@/lib/domain/analyze";
import { fillForm1, form1FieldValues, FORM1_REVISION, FORM1_TEMPLATE_SHA256 } from "@/lib/forms/form1";
import { fillForm55, FORM55_TEMPLATE_SHA256 } from "@/lib/forms/form55";
import { sha256Hex } from "@/lib/hash";
import { RULE_LIST, RULESET_ID } from "@/lib/rules/ca-dlse-2026-09";
import { calculationCsv } from "@/lib/packet/calculation-csv";
import { canonicalJson } from "@/lib/packet/canonical-json";
import { buildEvidenceIndex } from "@/lib/packet/evidence-index";
import { buildForm1Data, buildForm55Data } from "@/lib/packet/form-data";
import { formatMoney } from "@/lib/calc/rational";

/**
 * Takt Packet. Produces the claim packet ZIP from case inputs alone. The
 * manifest records every input the verifier needs to recompute the result.
 */

export interface PacketArtifacts {
  form1Template: Uint8Array;
  form55Template: Uint8Array;
  font: Uint8Array;
}

export interface PacketRequest {
  caseId: string;
  generatedAt: string;
  app: { version: string; commit: string };
  details: ClaimantDetails;
  inputs: CaseInputs;
  extraction: { model: string | null; promptVersion: string; schemaVersion: string };
  /** Original files the worker chose to include, keyed by document id. */
  includedSources: Map<string, Uint8Array>;
}

export interface BuiltPacket {
  zip: Uint8Array;
  manifest: ClaimPacketManifest;
  manifestSha256: string;
  analysis: CaseAnalysis;
  files: Record<string, Uint8Array>;
}

export class PacketGenerationError extends Error {}

export const STANDING_LIMITATIONS = [
  "Takt supports California hourly, non-exempt work under the standard daily and weekly overtime rules only.",
  "Takt does not calculate meal or rest period premiums, split-shift or reporting-time pay, waiting-time or other penalties, minimum wage claims, or local minimum wages.",
  "A start or end earlier or later than the employer's time record is counted only when the worker confirmed it and a schedule or message supports it.",
  "Amounts are for the pay periods and records provided. Records the worker did not provide are not considered.",
  "This packet is not legal advice and has not been filed with any agency. The worker reviews, signs, and files the forms.",
];

function sanitizeFilename(name: string): string {
  return name.replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, "_").slice(0, 80) || "file";
}

function readme(caseId: string, analysis: CaseAnalysis, hasForm1: boolean, form55Files: string[]): string {
  const lines = [
    `Takt claim packet — ${caseId}`,
    "",
    "What this is",
    "A set of documents prepared by the worker with Takt, a tool that compares work records.",
    "It is not legal advice and it has not been sent to the Labor Commissioner or anyone else.",
    "",
    "What Takt concluded",
    analysis.scope && !analysis.scope.supported
      ? "This case is outside Takt's supported rules, so Takt did not calculate an amount."
      : analysis.claimedPeriodIds.length === 0
        ? "The confirmed records do not show a supported difference between work and pay."
        : `Confirmed work in the claimed pay periods earned $${formatMoney(analysis.totals.earned)}; the wage statements paid $${formatMoney(analysis.totals.paid)}. Difference: $${formatMoney(analysis.totals.owed)}.`,
    "",
    "What Takt did not conclude",
    "Takt does not decide whether an employer broke the law, why records differ, or whether a claim will succeed.",
    "",
    "Files",
    hasForm1 ? "claim-form-1.pdf       DLSE Form 1 (REV. 07/2025), filled from your confirmed facts. Review it, then sign and date it yourself." : "",
    ...form55Files.map((f) => `${f.padEnd(23)}DLSE Form 55 worksheet, per pay period.`),
    "evidence-index.pdf     Every record, fact, discrepancy, and calculation with its source location.",
    "calculation.csv        Each calculation line: minutes x rate x multiplier / 60.",
    "manifest.json          Machine-readable record of inputs, hashes, rules, and results.",
    "sources/               Copies of original files, only if you chose to include them.",
    "",
    "Check this packet",
    "Anyone can re-verify it with the Takt verifier (npm run verify:packet -- <packet.zip>) or on the Takt Verify page.",
    "",
    "Official instructions: https://www.dir.ca.gov/dlse/HowToFileWageClaim.htm",
  ];
  return `${lines.filter((l, i, all) => !(l === "" && all[i - 1] === "")).join("\n")}\n`;
}

export async function buildPacket(request: PacketRequest, artifacts: PacketArtifacts): Promise<BuiltPacket> {
  const { inputs, details } = request;
  if (!inputs.scopeAnswers) throw new PacketGenerationError("Answer the scope questions before building a packet.");
  const analysis = analyzeCase(inputs);
  if (analysis.reconciliation.unreviewedFactIds.length > 0) {
    throw new PacketGenerationError("Review every highlighted fact before building a packet.");
  }
  if (analysis.state === "CASE_CREATED" || analysis.state === "EVIDENCE_INGESTED") {
    throw new PacketGenerationError("Add and read your evidence before building a packet.");
  }

  const generatedAt = new Date(request.generatedAt);
  const files: Record<string, Uint8Array> = {};
  const roles: Record<string, PacketFile["role"]> = {};
  const put = (path: string, bytes: Uint8Array, role: PacketFile["role"]) => {
    files[path] = bytes;
    roles[path] = role;
  };

  let form1Fields: Record<string, string | boolean> = {};
  const canClaim = analysis.scope?.supported === true && analysis.claimedPeriodIds.length > 0;
  if (canClaim) {
    if (!details.firstName.trim() || !details.lastName.trim() || !details.employerName.trim()) {
      throw new PacketGenerationError("Enter your name and your employer's name before building a packet.");
    }
    const form1Data = buildForm1Data(details, analysis, inputs.scopeAnswers.workweekStartDay ?? 1);
    form1Fields = form1FieldValues(form1Data);
    put("claim-form-1.pdf", await fillForm1(artifacts.form1Template, artifacts.font, form1Data, generatedAt), "form-1");
  }

  const form55 = canClaim ? buildForm55Data(details, analysis) : [];
  const form55Entries: ClaimPacketManifest["forms"]["form55"] = [];
  for (const [index, sheet] of form55.entries()) {
    const file = form55.length === 1 ? "dlse-form-55.xls" : `dlse-form-55-${index + 1}-rate-${sheet.rate.replace(".", "_")}.xls`;
    put(file, await fillForm55(artifacts.form55Template, sheet.data), "form-55");
    form55Entries.push({ file, templateSha256: FORM55_TEMPLATE_SHA256, hourlyRate: sheet.rate, periodIds: sheet.periodIds });
  }

  const sources: ClaimPacketManifest["sources"] = [];
  for (const [index, doc] of inputs.documents.entries()) {
    const copy = request.includedSources.get(doc.id);
    const packetPath = copy ? `sources/${String(index + 1).padStart(2, "0")}-${sanitizeFilename(doc.filename)}` : null;
    if (copy && packetPath) {
      if ((await sha256Hex(copy)) !== doc.sha256) throw new PacketGenerationError(`${doc.filename} changed after it was added.`);
      put(packetPath, copy, "source");
    }
    sources.push({
      documentId: doc.id,
      filename: doc.filename,
      mimeType: doc.mimeType,
      sha256: doc.sha256,
      bytes: doc.byteLength,
      docClass: doc.docClass,
      duplicateOf: doc.duplicateOf,
      packetPath,
    });
  }

  const limitations = [
    ...STANDING_LIMITATIONS,
    ...analysis.calculations
      .filter((c) => c.state === "CALCULATION_BLOCKED")
      .map((c) => `Pay period ${c.periodStart} to ${c.periodEnd} was not calculated: ${c.blockedReasons.join(" ")}`),
    ...analysis.reconciliation.payrollProblems.map((p) => p.reason),
  ];

  const core: Omit<ClaimPacketManifest, "files"> = {
    schema: "takt-manifest/1",
    caseId: request.caseId,
    generatedAt: request.generatedAt,
    app: { name: "takt", version: request.app.version, commit: request.app.commit },
    contractVersion: CONTRACT_VERSION,
    ruleset: { id: RULESET_ID, rules: RULE_LIST },
    scope: { answers: inputs.scopeAnswers, decision: analysis.scope! },
    extraction: request.extraction,
    sources,
    facts: inputs.facts,
    confirmations: inputs.confirmations,
    payroll: analysis.reconciliation.payroll,
    days: analysis.reconciliation.days,
    discrepancies: analysis.reconciliation.discrepancies,
    calculations: analysis.calculations,
    totals: analysis.totals,
    forms: {
      form1: { file: canClaim ? "claim-form-1.pdf" : "", templateSha256: FORM1_TEMPLATE_SHA256, revision: FORM1_REVISION, fields: form1Fields },
      form55: form55Entries,
    },
    limitations,
  };

  put("evidence-index.pdf", await buildEvidenceIndex(core, artifacts.font), "evidence-index");
  put("calculation.csv", strToU8(calculationCsv(analysis.calculations)), "calculation-csv");
  put("README.txt", strToU8(readme(request.caseId, analysis, canClaim, form55Entries.map((f) => f.file))), "readme");

  const packetFiles: PacketFile[] = [];
  for (const path of Object.keys(files).sort()) {
    packetFiles.push({ path, sha256: await sha256Hex(files[path]), bytes: files[path].byteLength, role: roles[path] });
  }
  const manifest: ClaimPacketManifest = { ...core, files: packetFiles };
  const manifestBytes = strToU8(canonicalJson(manifest));
  files["manifest.json"] = manifestBytes;

  const mtime = generatedAt;
  const zippable: Zippable = {};
  for (const path of Object.keys(files).sort()) zippable[path] = [files[path], { mtime, level: 6 }];
  return { zip: zipSync(zippable), manifest, manifestSha256: await sha256Hex(manifestBytes), analysis, files };
}

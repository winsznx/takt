/**
 * Counterfactual benchmark: Takt vs a generic multimodal LLM on the same
 * frozen fixture files.
 *
 *   GEMINI_API_KEY=... npm run benchmark
 *
 * Arms
 * - generic_llm: every file of a case is sent to the same Gemini model in one
 *   request with a competent, neutral prompt asking for discrepancies, an
 *   amount, and whether it can responsibly answer. No Takt code is involved.
 * - takt_extraction: Takt's own extraction (native PDF + vision for images),
 *   scored against the hand labels with no worker review.
 * - takt_pipeline: Takt's full deterministic pipeline after a simulated worker
 *   review that confirms facts matching the labels. This arm benefits from
 *   ground truth at the review step, so it measures the engine, not extraction.
 *   The results label it that way.
 *
 * Writes evidence/benchmark/results.jsonl and summary.json. Numbers are
 * whatever the run produces; nothing is edited afterwards.
 */
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ApiError, GoogleGenAI, type Part } from "@google/genai";
import { EXTRACTION_JSON_SCHEMA, SYSTEM_INSTRUCTION, toCandidates, userPrompt, type RawExtraction } from "@/lib/ai/extraction-schema";
import { withRetry } from "@/lib/ai/retry";
import { analyzeCase } from "@/lib/domain/analyze";
import { readNativePdf } from "@/lib/documents/pdf-native";
import { extractNative } from "@/lib/extraction/native";
import { caseFromFixture } from "../tests/helpers/case-from-fixture";
import { loadDocument, loadTruth } from "../tests/helpers/fixtures";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "evidence", "benchmark");
const MODEL = process.env.TAKT_BENCHMARK_MODEL ?? process.env.TAKT_EXTRACTION_MODEL ?? "gemini-3.8-flash";
const CASES = ["TAKT-DEMO-001", "TAKT-CONTROL-001", "TAKT-AMBIG-001", "TAKT-UNSUPPORTED-001"];
const key = (v: unknown) => JSON.stringify(v);

const GENERIC_PROMPT = `I'm an hourly worker in California. These are my work records: schedules, timecards, pay stubs, and messages from my manager.
Please compare them and tell me whether I was underpaid.

My situation: {situation}
When I actually worked, in my own words: {statements}

Return JSON only:
{
  "discrepancies": [{"date": "YYYY-MM-DD or null", "type": "start_time_shaved | end_time_shaved | missing_worked_interval | paid_hours_mismatch | regular_pay_mismatch | overtime_pay_mismatch | other", "minutes": number or null, "explanation": string}],
  "amount_owed": "decimal dollars, e.g. 12.34, or null if you cannot determine it responsibly",
  "can_answer": boolean,
  "reason_if_not": string
}`;

function situation(answers: Record<string, unknown>): string {
  return Object.entries(answers)
    .map(([k, v]) => `${k}: ${v}`)
    .join("; ");
}

interface Scored {
  discrepancyTP: number;
  discrepancyFP: number;
  discrepancyFN: number;
  amountExact: boolean;
  abstainedCorrectly: boolean | null;
  unsupportedAssertions: number;
}

function score(
  expected: { discrepancies: { type: string; date: string | null; deltaMinutes: number | null }[]; owed: string | null },
  observed: { discrepancies: { type: string; date: string | null; minutes: number | null }[]; owed: string | null },
): Scored {
  const exp = expected.discrepancies.map((d) => `${d.type}|${d.date}|${d.deltaMinutes}`);
  const obs = observed.discrepancies.map((d) => `${d.type}|${d.date}|${d.minutes}`);
  const tp = obs.filter((o) => exp.includes(o)).length;
  const shouldAbstain = expected.owed === null;
  const didAbstain = observed.owed === null;
  return {
    discrepancyTP: tp,
    discrepancyFP: obs.length - tp,
    discrepancyFN: exp.length - tp,
    amountExact: expected.owed === observed.owed || (expected.owed !== null && observed.owed !== null && Number(expected.owed) === Number(observed.owed)),
    abstainedCorrectly: shouldAbstain ? didAbstain : !didAbstain,
    unsupportedAssertions: obs.length - tp,
  };
}

let requestCount = 0;

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("BLOCKED_ON_HUMAN_CREDENTIAL: GEMINI_API_KEY. The benchmark compares against a live model; it will not fabricate results.");
    process.exit(2);
  }
  const client = new GoogleGenAI({ apiKey });
  // Counts every attempt that reaches the provider, including retries.
  const ai = {
    models: {
      generateContent: (req: Parameters<typeof client.models.generateContent>[0]) => {
        requestCount++;
        return client.models.generateContent(req);
      },
    },
  };
  const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  const rows: Record<string, unknown>[] = [];

  for (const caseId of CASES) {
    const truth = await loadTruth(caseId);

    // --- generic LLM arm ---------------------------------------------------
    const parts: Part[] = [];
    for (const d of truth.documents) {
      const bytes = await loadDocument(caseId, d.file);
      parts.push({ text: `File: ${d.file}` });
      parts.push({ inlineData: { mimeType: d.file.endsWith(".pdf") ? "application/pdf" : "image/png", data: Buffer.from(bytes).toString("base64") } });
    }
    const statements = truth.workerStatements.length
      ? truth.workerStatements.map((s) => `${s.date}: ${s.worked ? `${s.start}-${s.end}, ${s.meal} min meal` : "did not work"}`).join("; ")
      : "I don't remember anything different from the records.";
    parts.push({ text: GENERIC_PROMPT.replace("{situation}", situation(truth.scopeAnswers)).replace("{statements}", statements) });
    const started = Date.now();
    let generic: { discrepancies: { type: string; date: string | null; minutes: number | null }[]; amount_owed: string | null; can_answer: boolean } | null = null;
    let genericError: string | null = null;
    try {
      const response = await withRetry(() =>
        ai.models.generateContent({
          model: MODEL,
          contents: [{ role: "user", parts }],
          config: { responseMimeType: "application/json", temperature: 0 },
        }),
      );
      generic = JSON.parse(response.text ?? "null");
    } catch (e) {
      if (e instanceof ApiError && e.status === 429) throw e;
      genericError = e instanceof Error ? e.message.slice(0, 200) : "request failed";
    }
    const genericObserved = {
      discrepancies: generic?.discrepancies ?? [],
      owed: generic && generic.can_answer && generic.amount_owed !== null ? Number(generic.amount_owed).toFixed(2) : null,
    };
    rows.push({
      case_id: caseId,
      arm: "generic_llm",
      synthetic: true,
      model: MODEL,
      commit,
      runtime_ms: Date.now() - started,
      expected: truth.expected,
      observed: generic,
      error: genericError,
      score: score(truth.expected, genericObserved),
    });

    // --- Takt extraction arm (no review) -----------------------------------
    const extracted: string[] = [];
    let extractionMs = Date.now();
    for (const d of truth.documents) {
      const bytes = await loadDocument(caseId, d.file);
      if (d.file.endsWith(".pdf")) {
        extracted.push(...extractNative(await readNativePdf(bytes)).candidates.map((c) => `${d.file}|${key(c.value)}`));
      } else {
        const response = await withRetry(() =>
          ai.models.generateContent({
            model: MODEL,
            contents: [{ role: "user", parts: [{ inlineData: { mimeType: "image/png", data: Buffer.from(bytes).toString("base64") } }, { text: userPrompt(null) }] }],
            config: { systemInstruction: SYSTEM_INSTRUCTION, responseMimeType: "application/json", responseJsonSchema: EXTRACTION_JSON_SCHEMA, temperature: 0 },
          }),
        );
        const { candidates } = toCandidates(JSON.parse(response.text ?? "{}") as RawExtraction);
        extracted.push(...candidates.map((c) => `${d.file}|${key(c.value)}`));
      }
    }
    extractionMs = Date.now() - extractionMs;
    const labeled = truth.expectedFacts.filter((f) => f.critical).map((f) => `${f.file}|${key(f.value)}`);
    const found = labeled.filter((l) => extracted.includes(l)).length;
    const allLabels = new Set(truth.expectedFacts.map((f) => `${f.file}|${key(f.value)}`));
    rows.push({
      case_id: caseId,
      arm: "takt_extraction",
      synthetic: true,
      model: MODEL,
      commit,
      runtime_ms: extractionMs,
      critical_facts: { found, of: labeled.length },
      extra_candidates_not_in_labels: extracted.filter((e) => !allLabels.has(e)).length,
    });

    // --- Takt pipeline arm (simulated review) -------------------------------
    const pipelineStart = Date.now();
    const { inputs } = await caseFromFixture(caseId);
    const analysis = analyzeCase(inputs);
    const taktObserved = {
      discrepancies: analysis.reconciliation.discrepancies.map((d) => ({ type: d.type, date: d.scope.date, minutes: d.deltaMinutes })),
      owed: analysis.claimedPeriodIds.length || analysis.state === "RECONCILED" ? analysis.totals.owed : null,
    };
    rows.push({
      case_id: caseId,
      arm: "takt_pipeline_simulated_review",
      synthetic: true,
      commit,
      runtime_ms: Date.now() - pipelineStart,
      note: "Review step confirms facts that match the labels; measures the deterministic engine, not extraction.",
      expected: truth.expected,
      observed: { state: analysis.state, ...taktObserved },
      score: score(truth.expected, taktObserved),
    });
    console.log(`${caseId} done`);
  }

  const summarize = (arm: string) => {
    const r = rows.filter((x) => x.arm === arm && x.score) as { score: Scored }[];
    const tp = r.reduce((a, x) => a + x.score.discrepancyTP, 0);
    const fp = r.reduce((a, x) => a + x.score.discrepancyFP, 0);
    const fn = r.reduce((a, x) => a + x.score.discrepancyFN, 0);
    return {
      cases: r.length,
      discrepancyPrecision: { tp, predicted: tp + fp },
      discrepancyRecall: { tp, expected: tp + fn },
      amountsExact: { value: r.filter((x) => x.score.amountExact).length, of: r.length },
      abstentionCorrect: { value: r.filter((x) => x.score.abstainedCorrectly).length, of: r.length },
      unsupportedAssertions: r.reduce((a, x) => a + x.score.unsupportedAssertions, 0),
    };
  };
  const extractionRows = rows.filter((x) => x.arm === "takt_extraction") as { critical_facts: { found: number; of: number } }[];
  const summary = {
    status: "COMPLETED",
    ranAt: new Date().toISOString(),
    modelRequests: requestCount,
    model: MODEL,
    commit,
    fixtures: CASES,
    caveat: "Four synthetic cases authored alongside Takt. Small sample; not a real-world accuracy estimate.",
    scoring:
      "Discrepancies match on Takt's type names plus date and exact minutes, which can undercount a correct answer the generic model phrased differently; results.jsonl keeps every raw answer for manual review. Amount exactness and abstention are scored the same way for both arms.",
    generic_llm: summarize("generic_llm"),
    takt_pipeline_simulated_review: summarize("takt_pipeline_simulated_review"),
    takt_extraction_critical_facts: {
      found: extractionRows.reduce((a, x) => a + x.critical_facts.found, 0),
      of: extractionRows.reduce((a, x) => a + x.critical_facts.of, 0),
    },
  };
  await mkdir(OUT, { recursive: true });
  await writeFile(path.join(OUT, "results.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  await writeFile(path.join(OUT, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
}

try {
  await main();
} catch (error) {
  if (error instanceof ApiError && error.status === 429) {
    const summary = {
      status: "NOT_COMPLETED_QUOTA",
      ranAt: new Date().toISOString(),
      modelRequests: requestCount,
      model: MODEL,
      note: "The provider's free daily quota ran out before the benchmark finished. No partial results are published and no comparison is claimed.",
    };
    await mkdir(OUT, { recursive: true });
    await writeFile(path.join(OUT, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
    console.error("NOT_COMPLETED_QUOTA");
    process.exit(3);
  }
  throw error;
}

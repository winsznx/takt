import type { Metadata } from "next";
import Link from "next/link";
import campaign from "../../../evidence/campaign/results.json";
import run from "../../../evidence/canonical/run.json";
import benchmark from "../../../evidence/benchmark/summary.json";
import { extractionAvailable, EXTRACTION_MODEL } from "@/lib/ai/gemini";
import { aiMode } from "@/lib/ai/mode";
import { formatMoney } from "@/lib/calc/rational";

export const metadata: Metadata = { title: "Proof" };
// Image-reading status is read from the server at request time, never hardcoded.
export const dynamic = "force-dynamic";

interface ArmSummary {
  discrepancyPrecision: { tp: number; predicted: number };
  discrepancyRecall: { tp: number; expected: number };
  amountsExact: { value: number; of: number };
  abstentionCorrect: { value: number; of: number };
  unsupportedAssertions: number;
}
type BenchmarkSummary =
  | { status: "COMPLETED"; ranAt: string; model: string; commit: string; modelRequests: number; caveat: string; scoring: string; generic_llm: ArmSummary; takt_pipeline_simulated_review: ArmSummary; takt_extraction_critical_facts: { found: number; of: number } }
  | { status: string; ranAt: string; model: string; note: string };

const ratio = (r: { value: number; of: number }) => `${r.value} / ${r.of}`;
const REPO = "https://github.com/winsznx/takt/blob/main";

export default function ProofPage() {
  const s = campaign.summary;
  const demo = campaign.cases.find((c) => c.caseId === "TAKT-DEMO-001")!;
  return (
    <div className="mx-auto max-w-[880px] space-y-12 px-5 py-10 sm:py-14 min-[1320px]:px-0">
      <header>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Takt Proof</p>
        <h1 className="mt-1 text-[30px] font-semibold leading-[1.1] tracking-[-1px] sm:text-[40px]">What Takt has shown, and how to check it</h1>
        <p className="mt-2 text-muted-foreground">
          Takt lines up independent work records, finds where they disagree, computes the supported difference in code, and exports a packet anyone
          can re-verify. Every number on this page is read from evidence files committed to the repository.
        </p>
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
          <div className="panel-quiet p-3"><dt className="text-muted-foreground">Evidence generated from commit</dt><dd className="font-mono">{run.commit}</dd></div>
          <div className="panel-quiet p-3"><dt className="text-muted-foreground">Deployed application commit</dt><dd className="font-mono">{process.env.NEXT_PUBLIC_TAKT_COMMIT}</dd></div>
          <div className="panel-quiet p-3"><dt className="text-muted-foreground">Image reading on this deployment</dt><dd>{extractionAvailable() ? (aiMode() === "full" ? `on (${EXTRACTION_MODEL})` : `synthetic samples only (${EXTRACTION_MODEL})`) : "off"}</dd></div>
        </dl>
        {run.commit !== process.env.NEXT_PUBLIC_TAKT_COMMIT && (
          <p className="mt-2 text-sm text-muted-foreground">
            The deployed commit is newer than the evidence commit. Changes after the evidence commit are documentation, proof-page, or deployment
            changes; rerun the scripts below to regenerate the evidence at any commit.
          </p>
        )}
      </header>

      <section>
        <h2 className="text-[20px] font-semibold tracking-[-0.3px]">Canonical case · {run.case_id}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Synthetic fixture: an invented worker, employer, and records.</p>
        <div className="mt-3 rounded-xl border-2 border-state-discrepancy/40 bg-state-discrepancy/5 p-4">
          <p className="text-sm text-muted-foreground">Tue, Sep 1, 2026</p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-background p-3">
              <p className="text-xs text-muted-foreground">Schedule + manager&apos;s text + worker</p>
              <p className="text-2xl font-semibold">7:40 AM</p>
            </div>
            <div className="rounded-lg bg-background p-3">
              <p className="text-xs text-muted-foreground">Employer time record</p>
              <p className="text-2xl font-semibold">8:00 AM</p>
            </div>
          </div>
          <p className="mt-3 font-semibold text-state-discrepancy">20 min not on the employer record</p>
          <p className="mt-1 font-mono text-sm">20 min × $18.50 × 1.5 ÷ 60 = $9.25 (CA-OT-DAILY-8)</p>
        </div>
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Facts extracted / reviewed</dt><dd>{run.fact_count} / {run.confirmed_fact_count + run.rejected_fact_count} ({run.rejected_fact_count} rejected)</dd></div>
          <div><dt className="text-muted-foreground">Difference claimed</dt><dd>${formatMoney(run.totals.owed)} (earned ${formatMoney(run.totals.earned)}, paid ${formatMoney(run.totals.paid)})</dd></div>
          <div><dt className="text-muted-foreground">Rules applied</dt><dd>{run.calculation_rule_ids.join(", ")}</dd></div>
          <div><dt className="text-muted-foreground">Verifier</dt><dd>{run.verifier_status} · {run.verifier_version} · {run.verifier_checks.filter((c) => c.status === "pass").length} checks passed</dd></div>
          <div className="sm:col-span-2"><dt className="text-muted-foreground">Packet SHA-256</dt><dd className="break-all font-mono text-xs">{run.packet_sha256}</dd></div>
          <div className="sm:col-span-2"><dt className="text-muted-foreground">Image facts</dt><dd>{run.extraction_paths.images}</dd></div>
        </dl>
        <p className="mt-3 text-sm">
          Reproduce: <code>npx tsx scripts/canonical-run.ts</code> then <code>npm run verify:packet -- evidence/canonical/takt-demo.zip</code>. Or open the
          same case in the app from <Link href="/cases" className="underline">My cases → sample cases</Link>.
        </p>
      </section>

      <section>
        <h2 className="text-[20px] font-semibold tracking-[-0.3px]">What can go wrong</h2>
        <table className="mt-3 w-full text-left text-sm">
          <thead className="text-muted-foreground"><tr><th className="py-1">Case</th><th>Expected</th><th>Observed</th><th>Amount</th></tr></thead>
          <tbody>
            {campaign.cases.map((c) => (
              <tr key={c.caseId} className="border-t align-top">
                <td className="py-2 pr-2 font-medium">{c.caseId}</td>
                <td className="pr-2">{c.expected.outcome}</td>
                <td className="pr-2">{c.observed.outcome}{c.outcomeMatch ? " ✓" : " ✗"}</td>
                <td>{c.observed.owed === null ? "none (refused)" : `$${c.observed.owed}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {campaign.cases.filter((c) => c.caseId !== demo.caseId).map((c) => <li key={c.caseId}><span className="text-foreground">{c.caseId}:</span> {c.summary}</li>)}
        </ul>
      </section>

      <section>
        <h2 className="text-[20px] font-semibold tracking-[-0.3px]">Results with denominators</h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          {[
            ["Case outcomes correct", ratio(s.casesOutcomeCorrect)],
            ["Day decisions correct", ratio(s.dayStatesCorrect)],
            ["Discrepancy sets exact", ratio(s.discrepancySetsExact)],
            ["Amounts exact", ratio(s.amountsExact)],
            ["False discrepancies on the healthy control", String(s.falseDiscrepanciesOnControl)],
            ["Tampered packets rejected", ratio(s.tamperRejected)],
          ].map(([k, v]) => (
            <div key={k} className="panel p-4"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="text-xl font-semibold">{v}</dd></div>
          ))}
        </dl>
        <p className="mt-3 text-sm text-muted-foreground">
          These are four synthetic cases written alongside Takt&apos;s parser. They show Takt behaves as designed on these records, including refusing
          when it should. They are not an accuracy estimate for real-world documents, and they are not user results. {campaign.extraction}
        </p>
      </section>

      <section>
        <h2 className="text-[20px] font-semibold tracking-[-0.3px]">Try the verifier yourself</h2>
        <p className="mt-2 text-sm">
          Download the <a className="underline" href="/generated/evidence/takt-demo-001.zip" download>canonical packet</a> and{" "}
          <a className="underline" href="/generated/evidence/takt-tamper-001.zip" download>TAKT-TAMPER-001</a> (the same packet with Form 1&apos;s grand
          total changed to $925.00 and its hash updated), then drop each on <Link href="/verify" className="underline">Takt Verify</Link>. The first
          passes. The second fails.
        </p>
      </section>

      <section>
        <h2 className="text-[20px] font-semibold tracking-[-0.3px]">Tamper tests on the canonical packet</h2>
        <ul className="mt-3 panel divide-y divide-[#ececef] overflow-hidden text-sm">
          {campaign.tamper.map((t) => (
            <li key={t.id} className="flex flex-wrap justify-between gap-2 p-3">
              <span>{t.description}</span>
              <span className={t.rejected ? "text-state-consistent" : "text-destructive"}>{t.status}{t.failedChecks.length ? ` · ${t.failedChecks.slice(0, 2).join(", ")}` : ""}</span>
            </li>
          ))}
        </ul>
      </section>

      <BenchmarkSection summary={benchmark as BenchmarkSummary} />

      <section>
        <h2 className="text-[20px] font-semibold tracking-[-0.3px]">Not shown</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          <li>{run.extraction_paths.images}</li>
          <li>Any result with real workers or real records. Every case here is synthetic.</li>
        </ul>
        <p className="mt-3 text-sm">
          <Link href="/limitations" className="underline">Limitations</Link> ·{" "}
          <a href={`${REPO}/evidence/campaign/results.json`} className="underline">results.json</a> ·{" "}
          <a href={`${REPO}/evidence/canonical/run.json`} className="underline">run.json</a>
        </p>
      </section>
    </div>
  );
}

const pct = (a: number, b: number) => (b === 0 ? "n/a" : `${a} / ${b}`);

function BenchmarkSection({ summary }: { summary: BenchmarkSummary }) {
  if (summary.status !== "COMPLETED" || !("generic_llm" in summary)) {
    return (
      <section>
        <h2 className="text-[20px] font-semibold tracking-[-0.3px]">Comparison with a general-purpose AI model</h2>
        <p className="mt-2 text-sm">
          Not completed ({summary.status}, {summary.ranAt.slice(0, 10)}). {"note" in summary ? summary.note : ""} No comparison is claimed.
        </p>
      </section>
    );
  }
  const rows: [string, (a: ArmSummary) => string][] = [
    ["Discrepancies found that are correct (precision)", (a) => pct(a.discrepancyPrecision.tp, a.discrepancyPrecision.predicted)],
    ["Expected discrepancies found (recall)", (a) => pct(a.discrepancyRecall.tp, a.discrepancyRecall.expected)],
    ["Amounts exact to the cent", (a) => pct(a.amountsExact.value, a.amountsExact.of)],
    ["Answered or refused correctly", (a) => pct(a.abstentionCorrect.value, a.abstentionCorrect.of)],
    ["Findings not in the labels", (a) => String(a.unsupportedAssertions)],
  ];
  return (
    <section>
      <h2 className="text-[20px] font-semibold tracking-[-0.3px]">Comparison with a general-purpose AI model</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        One run on {summary.ranAt.slice(0, 10)} at commit <code>{summary.commit}</code>, {summary.model}, {summary.modelRequests} model requests. The
        general model got every file of each case in one request with a plain prompt. Takt&apos;s column uses a simulated worker review that confirms
        the labeled facts, so it measures the engine, not reading accuracy. {summary.caveat}
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-2 pr-3 font-medium">Measure (4 synthetic cases)</th>
              <th className="pr-3 font-medium">General AI model</th>
              <th className="font-medium">Takt</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label} className="border-t border-[#ececef]">
                <td className="py-2 pr-3">{label}</td>
                <td className="pr-3 tabular-nums">{value(summary.generic_llm)}</td>
                <td className="tabular-nums">{value(summary.takt_pipeline_simulated_review)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-sm">
        Takt&apos;s own reading of all fixture files before any review (PDF text on-device, images by AI): {summary.takt_extraction_critical_facts.found} of{" "}
        {summary.takt_extraction_critical_facts.of} labeled critical facts found exactly. {summary.scoring}
      </p>
    </section>
  );
}

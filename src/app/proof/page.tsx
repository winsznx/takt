import type { Metadata } from "next";
import Link from "next/link";
import campaign from "../../../evidence/campaign/results.json";
import run from "../../../evidence/canonical/run.json";
import { formatMoney } from "@/lib/calc/rational";

export const metadata: Metadata = { title: "Proof" };

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
          can re-verify. Every number on this page is read from files committed to the repository, produced at commit <code>{campaign.commit}</code>.
        </p>
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

      <section>
        <h2 className="text-[20px] font-semibold tracking-[-0.3px]">Not yet shown</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          <li>Image and scan extraction by the AI model on these fixtures. It isn&apos;t configured in this build, so image facts above were entered from labels.</li>
          <li>A comparison against a general-purpose AI model reading the same documents.</li>
          <li>Any result with real workers or real records.</li>
        </ul>
        <p className="mt-3 text-sm">
          <Link href="/limitations" className="underline">Limitations</Link> ·{" "}
          <a href={`${REPO}/evidence/campaign/results.json`} className="underline">results.json</a> ·{" "}
          <a href={`${REPO}/evidence/canonical/run.json`} className="underline">run.json</a> · app {process.env.NEXT_PUBLIC_TAKT_VERSION} ({process.env.NEXT_PUBLIC_TAKT_COMMIT})
        </p>
      </section>
    </div>
  );
}

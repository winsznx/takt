import type { Metadata } from "next";

export const metadata: Metadata = { title: "Limitations" };

const DOES = [
  "Reads schedules, time records, pay stubs, and manager messages, and shows where each value came from.",
  "Lines your records up day by day and finds where the employer's time record, your schedule, messages, and your own account disagree.",
  "Counts an earlier start or later end only when you confirm it and a schedule or message supports it.",
  "Calculates regular pay, daily overtime (over 8 hours), double time (over 12), weekly overtime (over 40), and seventh-day overtime for hourly California jobs, exactly, in code.",
  "Compares the hours on your employer's own time record with the hours on your wage statement, and checks the wage statement's math.",
  "Fills in DLSE Form 1 and, for irregular schedules, DLSE Form 55, and builds an evidence index and a verifiable manifest.",
];

const DOES_NOT = [
  "Give legal advice, represent you, or decide whether your employer broke the law.",
  "File anything with the Labor Commissioner or any agency. You review, sign, and file the forms.",
  "Handle salaried or exempt jobs, piece rate, commission, bonuses or differentials in the overtime rate, union contracts, alternative workweek schedules, public works, farm work, domestic work, health care, fast food, or government employers.",
  "Calculate meal or rest period premiums, split-shift or reporting-time pay, waiting-time or other penalties, minimum wage claims, or city and county minimum wages.",
  "Count time based only on your memory. Your own statement matters in a real claim, but Takt only adds time that another record supports; the rest is noted, not counted.",
  "Know about records you didn't upload, or tell you whether a claim will succeed.",
];

const VERIFY = [
  "Verification proves a packet is internally consistent: its files match their fingerprints, its comparison and math replay exactly from the facts it lists, and its forms say what the manifest says.",
  "It does not prove the facts are true. If someone typed false facts and rebuilt everything consistently, only comparing with the original files (by fingerprint) would reveal it.",
  "The verifier reuses Takt's comparison code to replay the day-by-day result, and re-does the money arithmetic and form readback with separate code.",
];

function List({ items }: { items: string[] }) {
  return (
    <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">
      {items.map((i) => (
        <li key={i}>{i}</li>
      ))}
    </ul>
  );
}

export default function LimitationsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">What Takt does and doesn&apos;t do</h1>
        <p className="mt-2 text-muted-foreground">Rules pinned: California DLSE, September 2026 (ruleset ca-dlse-2026-09). Forms: DLSE Form 1 REV. 07/2025 and DLSE Form 55.</p>
      </div>
      <section>
        <h2 className="text-lg font-semibold">Takt does</h2>
        <List items={DOES} />
      </section>
      <section>
        <h2 className="text-lg font-semibold">Takt does not</h2>
        <List items={DOES_NOT} />
      </section>
      <section>
        <h2 className="text-lg font-semibold">What verification means</h2>
        <List items={VERIFY} />
      </section>
      <section>
        <h2 className="text-lg font-semibold">Where to get help</h2>
        <p className="mt-2 text-sm">
          The{" "}
          <a className="underline" href="https://www.dir.ca.gov/dlse/HowToFileWageClaim.htm" target="_blank" rel="noreferrer">
            California Labor Commissioner&apos;s Office
          </a>{" "}
          explains how to file a wage claim and can help with claims Takt doesn&apos;t cover. Legal aid organizations and worker centers can advise you
          on your situation.
        </p>
      </section>
    </div>
  );
}

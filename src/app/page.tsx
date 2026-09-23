import Link from "next/link";
import { Button } from "@/components/ui/button";

function PreviewRow({ source, time, tone }: { source: string; time: string; tone: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-background px-3 py-2">
      <span className="text-sm text-muted-foreground">{source}</span>
      <span className={`font-semibold tabular-nums ${tone}`}>{time}</span>
    </div>
  );
}

export default function Home() {
  return (
    <div className="mx-auto max-w-5xl px-4">
      <section className="grid gap-10 py-12 md:grid-cols-[1.1fr_1fr] md:items-center md:py-20">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Find where your hours changed.</h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Compare your schedule, time records, pay stubs, and messages. Check every source yourself. Build a California wage-claim evidence packet.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button size="lg" render={<Link href="/case/new" />}>
              Check my records
            </Button>
            <Button size="lg" variant="outline" render={<Link href="/cases" />}>
              Try a sample case
            </Button>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">Free. No account. Your files stay in your browser.</p>
        </div>
        <div className="rounded-2xl border bg-muted/50 p-4" aria-label="Example comparison">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tue, Sep 1 · example</p>
          <div className="mt-3 space-y-2">
            <PreviewRow source="Schedule" time="7:40 AM" tone="" />
            <PreviewRow source="Manager's text: “come in at 7:40”" time="7:40 AM" tone="" />
            <PreviewRow source="You confirmed" time="7:40 AM" tone="" />
            <PreviewRow source="Employer time record" time="8:00 AM" tone="text-state-discrepancy" />
          </div>
          <p className="mt-4 text-2xl font-semibold text-state-discrepancy">20 minutes not on the employer record</p>
          <p className="mt-1 text-sm text-muted-foreground">
            20 min × $18.50 × 1.5 ÷ 60 = $9.25 · California daily overtime · every number traced to its source
          </p>
        </div>
      </section>

      <section className="border-t py-12">
        <h2 className="text-2xl font-semibold tracking-tight">Your proof may already be in different places.</h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          A schedule screenshot. A timecard export. A pay stub. A text asking you to come in early. Each one shows part of what happened. Takt lines
          them up by day and shows exactly where they disagree.
        </p>
      </section>

      <section id="how" className="border-t py-12">
        <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Add your records", "PDFs, photos, and screenshots. Each file is fingerprinted before anything reads it."],
            ["Check what Takt read", "Every value is outlined in your original file. You confirm it, fix it, or remove it."],
            ["See the differences", "Day by day, your schedule, the employer's clock, messages, and your own account, side by side."],
            ["Export your packet", "DLSE Form 1, Form 55, an evidence index, and the math, in one file anyone can verify."],
          ].map(([title, body], i) => (
            <li key={title} className="rounded-xl border p-4">
              <p className="text-sm text-muted-foreground">{i + 1}</p>
              <p className="mt-1 font-medium">{title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-t py-12">
        <h2 className="text-2xl font-semibold tracking-tight">What you can rely on</h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {[
            ["Originals stay original", "Takt never edits your files. Corrections are stored beside what it read, not over it."],
            ["Every finding links to evidence", "Each difference shows the exact spot in each record it comes from."],
            ["The math is plain code", "No AI does arithmetic. Minutes and cents are counted exactly under published California overtime rules."],
            ["It tells you when it can't help", "Missing records, conflicting records, or jobs with special rules get a clear answer instead of a guess."],
          ].map(([title, body]) => (
            <li key={title} className="rounded-xl border p-4">
              <p className="font-medium">{title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{body}</p>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-sm text-muted-foreground">
          Takt works for hourly jobs in California. It is not a lawyer and does not decide whether anyone broke the law.{" "}
          <Link href="/limitations" className="underline">
            What Takt does and doesn&apos;t do
          </Link>
          .
        </p>
      </section>

      <section className="border-t py-12 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">Start a private case</h2>
        <p className="mt-2 text-muted-foreground">It takes a few minutes if you have your records handy.</p>
        <Button size="lg" className="mt-6" render={<Link href="/case/new" />}>
          Check my records
        </Button>
      </section>
    </div>
  );
}

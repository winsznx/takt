import {
  Calculator,
  CalendarDays,
  CircleHelp,
  Clock,
  FileCheck2,
  Fingerprint,
  Link2,
  Lock,
  MessageSquareText,
  Receipt,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import campaign from "../../evidence/campaign/results.json";
import { ComparePreview, LinePreview, PacketPreview, RecordsPreview, ReviewPreview, Window } from "@/components/takt/home/previews";
import { Button } from "@/components/ui/button";

const RECORD_TYPES = [
  { icon: CalendarDays, label: "Schedules" },
  { icon: Clock, label: "Timecards" },
  { icon: Receipt, label: "Pay stubs" },
  { icon: MessageSquareText, label: "Manager texts" },
];

function Step({ title, body, children }: { title: string; body: string; children: ReactNode }) {
  return (
    <section className="mx-auto max-w-[1040px] px-5 min-[1320px]:px-0">
      <div className="mx-auto max-w-[560px] text-center">
        <h2 className="text-[40px] font-semibold leading-[1.05] tracking-[-1.5px] sm:text-[56px]">{title}</h2>
        <p className="mt-4 text-[17px] leading-[1.45] tracking-[-0.2px] text-muted-foreground sm:text-[20px]">{body}</p>
      </div>
      <div className="mt-10 sm:mt-14">{children}</div>
    </section>
  );
}

function Connector() {
  return <div aria-hidden className="mx-auto my-14 h-20 w-px border-l-2 border-dashed border-[#9fbcff] sm:my-20 sm:h-24" />;
}

function Feature({ icon: Icon, title, body, children }: { icon: typeof Lock; title: string; body: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-[24px] border border-[#ececef] bg-[linear-gradient(160deg,#ffffff_40%,#f3f6ff)] p-6 sm:p-8">
      <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand">
        <Icon className="size-5" strokeWidth={1.75} />
      </span>
      <h3 className="mt-5 text-[20px] font-semibold leading-[1.5] text-ink/90">{title}</h3>
      <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">{body}</p>
      {children}
    </div>
  );
}

export default function Home() {
  const s = campaign.summary;
  return (
    <div className="page-glow">
      {/* Hero */}
      <div className="px-4 sm:px-6">
        <section className="hero-surface mx-auto max-w-[1240px] overflow-hidden rounded-[28px] px-5 pb-16 pt-12 text-center sm:rounded-[40px] sm:pb-20 sm:pt-12 lg:pb-[76px]">
          <p className="inline-flex items-center gap-2 text-[15px] text-[#4a4b55]">
            <span className="flex size-5 items-center justify-center rounded-[5px] bg-brand text-white">
              <FileCheck2 className="size-3.5" strokeWidth={2} />
            </span>
            Fills the official California DLSE forms
          </p>
          <h1 className="mx-auto mt-8 max-w-[760px] text-[44px] font-semibold leading-[1.05] tracking-[-1.5px] sm:text-[64px] lg:text-[80px]">
            Find where your <span className="text-brand">hours</span> changed
          </h1>
          <p className="mx-auto mt-8 max-w-[440px] text-[18px] leading-[1.45] tracking-[-0.2px] text-[#0f1f3d]/85 sm:text-[20px]">
            Compare your schedule, timecards, pay stubs, and messages. See every source. Build a wage-claim packet anyone can check.
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:mt-14">
            <Link
              href="/case/new"
              className="inline-flex h-14 items-center rounded-full bg-white px-8 text-[20px] font-medium text-brand shadow-[0_8px_24px_-6px_rgba(31,91,255,0.35)] ring-1 ring-white transition-shadow hover:shadow-[0_12px_32px_-6px_rgba(31,91,255,0.5)]"
            >
              Check my records
            </Link>
            <p className="text-[14px] text-[#0f1f3d]/70">Free. No account. Your files stay in your browser.</p>
          </div>
        </section>
      </div>

      {/* Product window */}
      <div className="mx-auto mt-12 max-w-[1180px] px-5 sm:mt-16 min-[1320px]:px-0">
        <ComparePreview />
      </div>

      {/* Record types */}
      <section className="mx-auto mt-20 max-w-[880px] px-5 text-center sm:mt-28">
        <p className="text-[16px] text-[#14141e]">Your proof is probably already in different places</p>
        <ul className="mt-8 grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4">
          {RECORD_TYPES.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center justify-center gap-2 text-[17px] font-semibold text-[#2a2b33]">
              <Icon className="size-5 text-[#5b5c66]" strokeWidth={1.75} />
              {label}
            </li>
          ))}
        </ul>
        <div className="mx-auto mt-16 h-px max-w-[560px] bg-[#ececef] sm:mt-20" />
      </section>

      {/* Steps */}
      <div id="how" className="scroll-mt-24 pt-20 sm:pt-28">
        <Step title="Add." body="Photos, screenshots, and PDFs of the records you already have. Each file is fingerprinted before anything reads it.">
          <RecordsPreview />
        </Step>
        <Connector />
        <Step title="Review." body="Every value is outlined where it appears in your file. You confirm it, fix it, or remove it. Nothing counts until you do.">
          <ReviewPreview />
        </Step>
        <Connector />
        <Step title="Compare." body="Each day lines up your schedule, the employer's clock, messages, and your own account. A schedule alone never counts as work.">
          <LinePreview />
        </Step>
        <Connector />
        <Step title="Export." body="The official Form 1 and Form 55, an evidence index, and the math, in one packet anyone can re-check.">
          <PacketPreview />
        </Step>
      </div>

      {/* When records agree / disagree */}
      <section className="mx-auto mt-28 grid max-w-[1180px] gap-4 px-5 sm:mt-36 md:grid-cols-2 min-[1320px]:px-0">
        <div className="flex min-h-[300px] flex-col items-center justify-center rounded-[24px] bg-[linear-gradient(135deg,#f4f7ff,#fcfcfc)] p-8 text-center">
          <h2 className="text-[34px] font-semibold tracking-[-1.5px] sm:text-[40px]">Agree.</h2>
          <p className="mt-3 max-w-[340px] text-[17px] leading-[1.45] text-muted-foreground sm:text-[18px]">
            When every record matches, Takt says so and claims nothing.
          </p>
        </div>
        <Window className="p-5 sm:p-6">
          <p className="text-[13px] font-medium text-muted-foreground">TAKT-CONTROL-001</p>
          <ul className="mt-3 divide-y divide-[#f1f2f4] text-[14px]">
            {["Mon, Aug 31", "Tue, Sep 1", "Wed, Sep 2", "Thu, Sep 3", "Fri, Sep 4"].map((d) => (
              <li key={d} className="flex items-center justify-between py-2.5">
                <span>{d}</span>
                <span className="tabular-nums text-muted-foreground">8:00 AM – 4:30 PM</span>
                <span className="rounded-full bg-[#ecfdf5] px-2.5 py-0.5 text-[12px] font-medium text-[#065f46]">Matches</span>
              </li>
            ))}
          </ul>
        </Window>
        <Window className="order-4 p-5 sm:p-6 md:order-none">
          <p className="text-[13px] font-medium text-muted-foreground">TAKT-AMBIG-001</p>
          <div className="mt-3 space-y-2.5 text-[14px]">
            <div className="flex items-center justify-between rounded-xl bg-[#f6f7f9] px-3 py-2.5">
              <span>Timecard export A, Sep 2</span>
              <span className="tabular-nums">8:00 AM</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-[#f6f7f9] px-3 py-2.5">
              <span>Timecard export B, Sep 2</span>
              <span className="tabular-nums">8:15 AM</span>
            </div>
            <p className="flex items-start gap-2 rounded-xl border border-[#e3dcff] bg-[#f7f5ff] px-3 py-2.5 text-[#4b3aa8]">
              <CircleHelp className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
              Two employer records disagree. Takt asks you instead of picking one, and won&apos;t calculate this pay period until it&apos;s resolved.
            </p>
          </div>
        </Window>
        <div className="order-3 flex min-h-[300px] flex-col items-center justify-center rounded-[24px] bg-[linear-gradient(225deg,#f4f7ff,#fcfcfc)] p-8 text-center md:order-none">
          <h2 className="text-[34px] font-semibold tracking-[-1.5px] sm:text-[40px]">Unsure.</h2>
          <p className="mt-3 max-w-[340px] text-[17px] leading-[1.45] text-muted-foreground sm:text-[18px]">
            When records conflict or a job has special rules, you get a clear reason instead of a guess.
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto mt-28 max-w-[1180px] px-5 sm:mt-36 min-[1320px]:px-0">
        <div className="mx-auto max-w-[560px] text-center">
          <h2 className="text-[40px] font-semibold tracking-[-1.5px] sm:text-[56px]">What you can rely on</h2>
          <p className="mt-4 text-[17px] leading-[1.45] text-muted-foreground sm:text-[20px]">Built for a worker who has to trust every number.</p>
        </div>
        <div className="mt-12 grid gap-4 sm:mt-16 md:grid-cols-2">
          <Feature icon={Link2} title="Every finding links to evidence" body="Each difference shows the exact spot in each record it comes from, with the quoted text." />
          <Feature icon={Calculator} title="The math is plain code" body="No AI does arithmetic. Minutes and cents are counted exactly under published California overtime rules.">
            <p className="mt-5 rounded-xl bg-white px-4 py-3 font-mono text-[13px] text-ink ring-1 ring-[#ececef]">20 min × $18.50 × 1.5 ÷ 60 = $9.25</p>
          </Feature>
          <Feature icon={Fingerprint} title="Originals stay original" body="Files are fingerprinted and never edited. Corrections sit beside what Takt read, not over it." />
          <Feature icon={Lock} title="Private by default" body="No account, no analytics. Cases live in your browser. Only photos are sent out, once, to be read." />
        </div>
      </section>

      {/* Proof */}
      <section className="mx-auto mt-28 max-w-[1180px] px-5 sm:mt-36 min-[1320px]:px-0">
        <div className="mx-auto max-w-[620px] text-center">
          <h2 className="text-[40px] font-semibold tracking-[-1.5px] sm:text-[56px]">Checked, not claimed</h2>
          <p className="mt-4 text-[17px] leading-[1.45] text-muted-foreground sm:text-[20px]">
            Results from four synthetic test cases, re-run from the public repository.
          </p>
        </div>
        <dl className="mt-12 grid grid-cols-2 gap-4 sm:mt-16 lg:grid-cols-4">
          {[
            [`${s.dayStatesCorrect.value}/${s.dayStatesCorrect.of}`, "day decisions correct"],
            [`${s.amountsExact.value}/${s.amountsExact.of}`, "amounts exact to the cent"],
            [String(s.falseDiscrepanciesOnControl), "false findings when records agree"],
            [`${s.tamperRejected.value}/${s.tamperRejected.of}`, "tampered packets rejected"],
          ].map(([value, label]) => (
            <div key={label} className="rounded-[24px] border border-[#ececef] bg-white p-6 text-center">
              <dd className="text-[36px] font-semibold tracking-[-1px] text-ink sm:text-[44px]">{value}</dd>
              <dt className="mt-1 text-[14px] text-muted-foreground">{label}</dt>
            </div>
          ))}
        </dl>
        <p className="mt-6 text-center text-[15px]">
          <Link href="/proof" className="inline-flex items-center gap-1.5 font-medium text-brand hover:underline">
            <ShieldCheck className="size-4" strokeWidth={1.75} />
            See the proof and try the verifier
          </Link>
        </p>
      </section>

      {/* Final CTA */}
      <section className="mx-auto mt-28 max-w-[1180px] px-5 text-center sm:mt-36 min-[1320px]:px-0">
        <h2 className="text-[40px] font-semibold tracking-[-1.5px] sm:text-[56px]">Start a private case</h2>
        <p className="mx-auto mt-4 max-w-[480px] text-[17px] text-muted-foreground sm:text-[20px]">It takes a few minutes if your records are handy. California hourly jobs.</p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button size="lg" render={<Link href="/case/new" />}>
            Check my records
          </Button>
          <Button size="lg" variant="outline" render={<Link href="/cases" />}>
            Try a sample case
          </Button>
        </div>
      </section>
    </div>
  );
}

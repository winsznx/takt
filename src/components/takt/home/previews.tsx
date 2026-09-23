import {
  CalendarDays,
  CircleCheck,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  Fingerprint,
  GitCompareArrows,
  Inbox,
  MessageSquareText,
  PackageCheck,
  Receipt,
  ScanSearch,
  ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import { TaktLogo } from "@/components/takt/logo";
import { cn } from "@/lib/utils";

/*
 * Static product panels for the homepage. Every value is from the synthetic
 * TAKT-DEMO-001 case, so the pictures match what the app really shows.
 */

export function Window({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-[20px] border border-[#ececef] bg-white shadow-[0_24px_64px_-24px_rgba(20,40,120,0.18)]", className)}>
      {children}
    </div>
  );
}

const SIDEBAR = [
  { icon: Inbox, label: "Records" },
  { icon: ScanSearch, label: "Review" },
  { icon: GitCompareArrows, label: "Compare" },
  { icon: PackageCheck, label: "Packet" },
];

function Lane({ label, from, to, tone }: { label: string; from: number; to: number; tone: string }) {
  return (
    <div className="grid grid-cols-[72px_1fr] items-center gap-3 text-[13px] sm:grid-cols-[96px_1fr_104px]">
      <span className="text-muted-foreground">{label}</span>
      <div className="relative h-2.5 rounded-full bg-[#f1f2f5]">
        <div className={cn("absolute inset-y-0 rounded-full", tone)} style={{ left: `${from}%`, right: `${100 - to}%` }} />
      </div>
      <span className="hidden tabular-nums text-foreground sm:block">{label === "Clock" ? "8:00 – 4:30 PM" : "7:40 – 4:30 PM"}</span>
    </div>
  );
}

export function ComparePreview() {
  return (
    <Window className="grid md:grid-cols-[220px_1fr]">
      <aside className="hidden border-r border-[#ececef] p-5 md:block">
        <TaktLogo className="scale-90 origin-left" />
        <ul className="mt-6 space-y-1 text-[14px]">
          {SIDEBAR.map(({ icon: Icon, label }) => (
            <li key={label} className={cn("flex items-center gap-2.5 rounded-lg px-2.5 py-2", label === "Compare" ? "bg-[#f1f3f8] font-medium text-ink" : "text-[#4a4b55]")}>
              <Icon className="size-4" strokeWidth={1.75} />
              {label}
            </li>
          ))}
        </ul>
      </aside>
      <div className="p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <GitCompareArrows className="size-4" strokeWidth={1.75} />
            Pay period Aug 31 – Sep 13 <span className="font-normal text-muted-foreground">10 days</span>
          </p>
          <span className="rounded-full border border-brand px-3 py-1 text-[12px] font-medium text-brand">Build packet</span>
        </div>
        <div className="mt-5 rounded-2xl border border-[#f3c9ca] bg-[#fff6f6] p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-medium text-state-discrepancy">Tue, Sep 1</p>
            <span className="rounded-full bg-white px-2.5 py-0.5 text-[12px] font-medium text-state-discrepancy ring-1 ring-[#f3c9ca]">Records disagree</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-white p-3">
              <p className="text-[12px] text-muted-foreground">Confirmed, with support</p>
              <p className="text-2xl font-semibold tracking-tight text-ink sm:text-[28px]">7:40 AM</p>
            </div>
            <div className="rounded-xl bg-white p-3">
              <p className="text-[12px] text-muted-foreground">Employer clock</p>
              <p className="text-2xl font-semibold tracking-tight text-ink sm:text-[28px]">8:00 AM</p>
            </div>
          </div>
          <p className="mt-3 text-[15px] font-semibold text-state-discrepancy">20 min not on the employer record</p>
          <div className="mt-3 flex flex-wrap gap-2 text-[12px]">
            {[
              [CalendarDays, "Schedule 7:40 AM"],
              [MessageSquareText, "Manager: “come in at 7:40”"],
              [Clock, "Clock in 8:00 AM"],
            ].map(([Icon, text]) => {
              const I = Icon as typeof Clock;
              return (
                <span key={text as string} className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 ring-1 ring-[#ececef]">
                  <I className="size-3.5 text-muted-foreground" strokeWidth={1.75} />
                  {text as string}
                </span>
              );
            })}
          </div>
        </div>
        <div className="mt-5 space-y-2.5">
          <Lane label="Schedule" from={4} to={92} tone="bg-[#7ea6ff]" />
          <Lane label="Clock" from={12} to={92} tone="bg-[#a3a6b1]" />
          <Lane label="You" from={4} to={92} tone="bg-brand" />
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2 text-center">
          {[
            ["Earned", "$1,489.25"],
            ["Paid", "$1,480.00"],
            ["Difference", "$9.25"],
          ].map(([k, v]) => (
            <div key={k} className={cn("rounded-xl p-2.5", k === "Difference" ? "bg-brand-soft" : "bg-[#f6f7f9]")}>
              <p className="text-[11px] text-muted-foreground">{k}</p>
              <p className="text-[15px] font-semibold tabular-nums text-ink">{v}</p>
            </div>
          ))}
        </div>
      </div>
    </Window>
  );
}

const FILES = [
  { icon: CalendarDays, name: "Screenshot 2026-09-14 at 9.12.03 PM.png", kind: "Schedule", hash: "0273598350fe", facts: 20 },
  { icon: Clock, name: "Timecard_Export_0913.pdf", kind: "Time record", hash: "01411cbf8da9", facts: 30 },
  { icon: Receipt, name: "EarningsStatement_0918.pdf", kind: "Pay stub", hash: "6155e6c2d381", facts: 7 },
  { icon: MessageSquareText, name: "IMG_4821.png", kind: "Manager message", hash: "7f1009bfd252", facts: 1 },
];

export function RecordsPreview() {
  return (
    <Window>
      <ul className="divide-y divide-[#ececef]">
        {FILES.map(({ icon: Icon, name, kind, hash, facts }) => (
          <li key={name} className="flex items-center gap-3 px-4 py-3.5 sm:px-6">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#f1f3f8] text-ink">
              <Icon className="size-[18px]" strokeWidth={1.75} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium text-ink">{name}</p>
              <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <Fingerprint className="size-3.5" strokeWidth={1.75} />
                <span className="font-mono">{hash}…</span>
                <span className="hidden sm:inline">{kind}</span>
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-[#ecfdf5] px-2.5 py-0.5 text-[12px] font-medium text-[#065f46]">{facts} facts</span>
          </li>
        ))}
      </ul>
    </Window>
  );
}

export function ReviewPreview() {
  const rows = [
    ["09/01/2026", "Tue", "8:00 AM", "4:30 PM", "30"],
    ["09/02/2026", "Wed", "8:00 AM", "4:30 PM", "30"],
    ["09/03/2026", "Thu", "8:00 AM", "4:30 PM", "30"],
    ["09/04/2026", "Fri", "8:00 AM", "4:30 PM", "30"],
  ];
  return (
    <Window className="grid md:grid-cols-[1.1fr_1fr]">
      <div className="border-b border-[#ececef] p-4 sm:p-6 md:border-b-0 md:border-r">
        <p className="text-[13px] font-semibold text-ink">Example Bakery Co. — Timecard Report</p>
        <table className="mt-3 w-full text-left text-[12px]">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1.5 font-medium">Date</th>
              <th className="font-medium">Day</th>
              <th className="font-medium">In</th>
              <th className="font-medium">Out</th>
              <th className="text-right font-medium">Meal</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r[0]} className="border-t border-[#f1f2f4]">
                <td className="py-2">{r[0]}</td>
                <td>{r[1]}</td>
                <td>
                  <span className={cn("rounded px-1 py-0.5", i === 0 ? "bg-amber-200/70 ring-2 ring-amber-400" : "ring-1 ring-sky-300/70")}>{r[2]}</span>
                </td>
                <td>
                  <span className="rounded px-1 py-0.5 ring-1 ring-sky-300/70">{r[3]}</span>
                </td>
                <td className="text-right">{r[4]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-2.5 p-4 sm:p-6">
        <div className="rounded-xl border border-amber-400 p-3">
          <p className="text-[12px] text-muted-foreground">Clock-in time</p>
          <p className="text-[14px] font-semibold text-ink">8:00 AM on Tue, Sep 1</p>
          <div className="mt-2 flex gap-2 text-[12px]">
            <span className="rounded-full bg-brand px-3 py-1 font-medium text-white">Correct as shown</span>
            <span className="rounded-full border px-3 py-1">Fix it</span>
          </div>
        </div>
        <div className="rounded-xl border border-[#f3c9ca] bg-[#fff6f6] p-3">
          <p className="text-[12px] text-muted-foreground">Scheduled end · 50% sure</p>
          <p className="text-[14px] font-semibold text-ink">4:30 PM on Tue, Sep 8</p>
          <p className="mt-1 text-[12px] text-state-discrepancy">Covered by a notification in the screenshot. Check it.</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border p-3 text-[13px] text-muted-foreground">
          <CircleCheck className="size-4 text-state-consistent" strokeWidth={1.75} />
          28 more confirmed
        </div>
      </div>
    </Window>
  );
}

export function PacketPreview() {
  const files = [
    [FileText, "claim-form-1.pdf", "DLSE Form 1, REV. 07/2025"],
    [FileSpreadsheet, "dlse-form-55.xls", "Official Form 55 workbook"],
    [FileText, "evidence-index.pdf", "Every source and calculation"],
    [FileSpreadsheet, "calculation.csv", "minutes × rate × multiplier ÷ 60"],
  ] as const;
  return (
    <Window className="grid md:grid-cols-[1fr_0.9fr]">
      <ul className="divide-y divide-[#ececef] border-b border-[#ececef] md:border-b-0 md:border-r">
        {files.map(([Icon, name, note]) => (
          <li key={name} className="flex items-center gap-3 px-4 py-3.5 sm:px-6">
            <Icon className="size-[18px] shrink-0 text-muted-foreground" strokeWidth={1.75} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-[13px] text-ink">{name}</p>
              <p className="text-[12px] text-muted-foreground">{note}</p>
            </div>
            <Download className="size-4 shrink-0 text-brand" strokeWidth={1.75} />
          </li>
        ))}
      </ul>
      <div className="p-4 sm:p-6">
        <p className="flex items-center gap-2 text-[15px] font-semibold text-state-consistent">
          <ShieldCheck className="size-5" strokeWidth={1.75} />
          Verified: every check passed
        </p>
        <ul className="mt-3 space-y-2 text-[13px]">
          {["All 9 files match their SHA-256", "Comparison replays exactly", "11 calculation lines recompute", "Form 1 reads back 37 fields", "Form 55 matches the official workbook"].map((t) => (
            <li key={t} className="flex items-start gap-2">
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-state-consistent" strokeWidth={1.75} />
              {t}
            </li>
          ))}
        </ul>
      </div>
    </Window>
  );
}

const DAYS = [
  { day: "Mon, Aug 31", sched: [8, 16.5], clock: [8, 16.5], you: [8, 16.5], state: "match" },
  { day: "Tue, Sep 1", sched: [7.67, 16.5], clock: [8, 16.5], you: [7.67, 16.5], state: "diff" },
  { day: "Wed, Sep 2", sched: [8, 16.5], clock: [8, 16.5], you: [8, 16.5], state: "match" },
  { day: "Thu, Sep 10", sched: [7.67, 16.5], clock: [8, 16.5], you: [8, 16.5], state: "match", note: "Schedule said 7:40. You started at 8:00, so nothing is added." },
] as const;

const pos = (h: number) => ((h - 7) / 10) * 100;

export function LinePreview() {
  return (
    <Window className="divide-y divide-[#ececef]">
      {DAYS.map((d) => (
        <div key={d.day} className="px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between">
            <p className="text-[14px] font-semibold text-ink">{d.day}</p>
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-[12px] font-medium",
                d.state === "diff" ? "bg-[#fff1f1] text-state-discrepancy" : "bg-[#ecfdf5] text-[#065f46]",
              )}
            >
              {d.state === "diff" ? "Records disagree" : "Matches"}
            </span>
          </div>
          <div className="mt-3 space-y-2">
            {(
              [
                ["Schedule", d.sched, "bg-[#7ea6ff]"],
                ["Clock", d.clock, "bg-[#a3a6b1]"],
                ["You", d.you, "bg-brand"],
              ] as const
            ).map(([label, [a, b], tone]) => (
              <div key={label} className="grid grid-cols-[64px_1fr] items-center gap-3 text-[12px] sm:grid-cols-[80px_1fr]">
                <span className="text-muted-foreground">{label}</span>
                <div className="relative h-2 rounded-full bg-[#f1f2f5]">
                  <div className={cn("absolute inset-y-0 rounded-full", tone)} style={{ left: `${pos(a)}%`, right: `${100 - pos(b)}%` }} />
                </div>
              </div>
            ))}
          </div>
          {"note" in d && <p className="mt-2.5 text-[13px] text-muted-foreground">{d.note}</p>}
        </div>
      ))}
    </Window>
  );
}

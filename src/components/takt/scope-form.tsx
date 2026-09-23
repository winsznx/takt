"use client";
import { useState } from "react";
import type { ScopeAnswers } from "@/lib/domain/contracts";
import { evaluateScope } from "@/lib/rules/ca-dlse-2026-09";
import { Button } from "@/components/ui/button";

type Option<T> = { value: T; label: string };
interface Question<K extends keyof ScopeAnswers> {
  key: K;
  prompt: string;
  help?: string;
  options: Option<ScopeAnswers[K]>[];
}

const yn = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
] as const;
const ynu = [...yn, { value: "unsure", label: "Not sure" }] as const;
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const QUESTIONS: Question<keyof ScopeAnswers>[] = [
  { key: "workedInCalifornia", prompt: "Did you do this work in California?", options: [...yn] },
  { key: "paidHourly", prompt: "Were you paid by the hour?", options: [...yn] },
  { key: "pieceRateOrCommission", prompt: "Was any of your pay piece rate or commission?", help: "For example, pay per delivery, per item, or a percentage of sales.", options: [...yn] },
  { key: "salariedOrExempt", prompt: "Were you paid a salary or told you are exempt from overtime?", options: [...ynu] },
  { key: "publicWorks", prompt: "Was the work on a public works project (construction paid with public money)?", options: [...ynu] },
  { key: "unionContract", prompt: "Is there a union contract that covers your job?", options: [...ynu] },
  { key: "alternativeWorkweek", prompt: "Did you work an alternative workweek schedule, like four 10-hour days that your workplace voted on?", options: [...ynu] },
  { key: "classifiedAsContractor", prompt: "Did your employer treat you as an independent contractor (1099)?", options: [...yn] },
  {
    key: "specialIndustry",
    prompt: "Does your job fall in one of these industries?",
    help: "These have their own wage or overtime rules.",
    options: [
      { value: "none", label: "None of these" },
      { value: "agriculture", label: "Farm work" },
      { value: "domestic_work", label: "Work in a private home (housekeeper, nanny, caregiver)" },
      { value: "health_care", label: "Health care" },
      { value: "fast_food", label: "Fast food chain" },
      { value: "construction", label: "Construction" },
      { value: "government_employer", label: "Government employer" },
      { value: "other_special", label: "Another industry with special rules" },
    ],
  },
];

export const BLANK_SCOPE: Partial<ScopeAnswers> = {};

export function ScopeForm({ initial, onSubmit, submitLabel }: { initial?: ScopeAnswers | null; onSubmit: (answers: ScopeAnswers) => void | Promise<void>; submitLabel: string }) {
  const [answers, setAnswers] = useState<Partial<ScopeAnswers>>(initial ?? {});
  const [weekStart, setWeekStart] = useState<string>(initial ? String(initial.workweekStartDay ?? "unknown") : "");
  const complete = QUESTIONS.every((q) => answers[q.key] !== undefined) && weekStart !== "";
  const full = complete ? ({ ...answers, workweekStartDay: weekStart === "unknown" ? null : Number(weekStart) } as ScopeAnswers) : null;
  const decision = full ? evaluateScope(full) : null;

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (full) void onSubmit(full);
      }}
    >
      {QUESTIONS.map((q) => (
        <fieldset key={q.key} className="space-y-2">
          <legend className="font-medium">{q.prompt}</legend>
          {q.help && <p className="text-sm text-muted-foreground">{q.help}</p>}
          <div className="flex flex-wrap gap-2">
            {q.options.map((o) => (
              <label key={String(o.value)} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-[#e3e4e8] bg-white px-4 py-2 text-[15px] has-[:checked]:border-brand has-[:checked]:bg-brand-soft has-[:checked]:text-brand">
                <input
                  type="radio"
                  name={q.key}
                  value={String(o.value)}
                  checked={answers[q.key] === o.value}
                  onChange={() => setAnswers((a) => ({ ...a, [q.key]: o.value }))}
                  className="accent-brand"
                />
                {o.label}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <fieldset className="space-y-2">
        <legend className="font-medium">What day does your employer&apos;s workweek start?</legend>
        <p className="text-sm text-muted-foreground">It&apos;s often on your pay stub or in the handbook. Weekly overtime depends on it.</p>
        <select value={weekStart} onChange={(e) => setWeekStart(e.target.value)} className="h-11 w-full rounded-full border border-[#e3e4e8] bg-white px-4 sm:w-64">
          <option value="" disabled>
            Choose a day
          </option>
          {DAYS.map((d, i) => (
            <option key={d} value={i}>
              {d}
            </option>
          ))}
          <option value="unknown">I don&apos;t know</option>
        </select>
      </fieldset>

      {decision && !decision.supported && (
        <div role="status" className="rounded-2xl border border-[#dde1e8] bg-[#f6f7f9] p-5 text-[15px]">
          <p className="font-medium">Takt can still organize your records, but it won&apos;t calculate an amount for this case.</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {decision.reasons.map((r) => (
              <li key={r.code}>{r.message}</li>
            ))}
          </ul>
        </div>
      )}
      <Button type="submit" size="lg" disabled={!complete} className="w-full sm:w-auto">
        {submitLabel}
      </Button>
    </form>
  );
}

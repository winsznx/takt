"use client";
import { useState } from "react";
import { FactValue, type FactKind } from "@/lib/domain/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const KIND_LABEL: Record<FactKind, string> = {
  time_in: "Clock-in time",
  time_out: "Clock-out time",
  meal_break: "Meal break",
  scheduled_start: "Scheduled start",
  scheduled_end: "Scheduled end",
  message_time_reference: "Time named in a message",
  pay_period: "Pay period",
  pay_date: "Pay date",
  hourly_rate: "Hourly rate",
  regular_hours_paid: "Regular hours paid",
  overtime_hours_paid: "Overtime hours paid",
  double_time_hours_paid: "Double-time hours paid",
  regular_pay: "Regular pay",
  overtime_pay: "Overtime pay",
  double_time_pay: "Double-time pay",
  gross_pay: "Gross pay",
  other_earnings: "Other earnings",
  employee_name: "Employee name",
  employer_name: "Employer name",
  employer_address: "Employer address",
};

const DATE_TIME = ["time_in", "time_out", "scheduled_start", "scheduled_end"] as const;
const MONEY = ["hourly_rate", "regular_pay", "overtime_pay", "double_time_pay", "gross_pay"] as const;
const HOURS = ["regular_hours_paid", "overtime_hours_paid", "double_time_hours_paid"] as const;
const TEXT = ["employee_name", "employer_name", "employer_address"] as const;

type Draft = Record<string, string>;

function toDraft(value: FactValue): Draft {
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, v === null ? "" : String(v)]));
}

function fromDraft(kind: FactKind, d: Draft): unknown {
  if ((DATE_TIME as readonly string[]).includes(kind)) return { kind, date: d.date, time: d.time };
  if ((MONEY as readonly string[]).includes(kind)) return { kind, amount: d.amount?.replace(/[$,\s]/g, "") };
  if ((HOURS as readonly string[]).includes(kind)) return { kind, hours: d.hours?.trim() };
  if ((TEXT as readonly string[]).includes(kind)) return { kind, text: d.text?.trim() };
  switch (kind) {
    case "meal_break":
      return { kind, date: d.date, minutes: Number(d.minutes) };
    case "message_time_reference":
      return { kind, date: d.date, time: d.time, boundary: d.boundary || "start", sentAt: d.sentAt || null };
    case "pay_period":
      return { kind, start: d.start, end: d.end };
    case "pay_date":
      return { kind, date: d.date };
    case "other_earnings":
      return { kind, label: d.label?.trim(), amount: d.amount?.replace(/[$,\s]/g, "") };
  }
  return { kind };
}

function fieldsFor(kind: FactKind): { key: string; label: string; type: string; placeholder?: string }[] {
  if ((DATE_TIME as readonly string[]).includes(kind)) return [{ key: "date", label: "Date", type: "date" }, { key: "time", label: "Time", type: "time" }];
  if ((MONEY as readonly string[]).includes(kind)) return [{ key: "amount", label: "Amount ($)", type: "text", placeholder: "18.50" }];
  if ((HOURS as readonly string[]).includes(kind)) return [{ key: "hours", label: "Hours", type: "text", placeholder: "80.00" }];
  if ((TEXT as readonly string[]).includes(kind)) return [{ key: "text", label: "Text", type: "text" }];
  switch (kind) {
    case "meal_break":
      return [{ key: "date", label: "Date", type: "date" }, { key: "minutes", label: "Minutes", type: "number" }];
    case "message_time_reference":
      return [
        { key: "date", label: "Work day", type: "date" },
        { key: "time", label: "Time", type: "time" },
        { key: "boundary", label: "About", type: "boundary" },
      ];
    case "pay_period":
      return [{ key: "start", label: "From", type: "date" }, { key: "end", label: "To", type: "date" }];
    case "pay_date":
      return [{ key: "date", label: "Date", type: "date" }];
    case "other_earnings":
      return [{ key: "label", label: "Label", type: "text" }, { key: "amount", label: "Amount ($)", type: "text" }];
  }
  return [];
}

export function FactEditor({
  kind: initialKind,
  initial,
  allowKindChange,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  kind: FactKind;
  initial?: FactValue;
  allowKindChange?: boolean;
  submitLabel: string;
  onSubmit: (value: FactValue) => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<FactKind>(initialKind);
  const [draft, setDraft] = useState<Draft>(initial ? toDraft(initial) : {});
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="panel-quiet space-y-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = FactValue.safeParse(fromDraft(kind, draft));
        if (!parsed.success) {
          setError("Check the values. Dates, times, and amounts need to be complete.");
          return;
        }
        onSubmit(parsed.data);
      }}
    >
      {allowKindChange && (
        <div className="space-y-1">
          <Label htmlFor="fact-kind">What is it?</Label>
          <select id="fact-kind" value={kind} onChange={(e) => setKind(e.target.value as FactKind)} className="h-10 w-full rounded-xl border border-[#e3e4e8] bg-white px-3">
            {Object.entries(KIND_LABEL).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {fieldsFor(kind).map((f) => (
          <div key={f.key} className="space-y-1">
            <Label htmlFor={`fact-${f.key}`}>{f.label}</Label>
            {f.type === "boundary" ? (
              <select
                id={`fact-${f.key}`}
                value={draft[f.key] ?? "start"}
                onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                className="h-10 w-full rounded-xl border border-[#e3e4e8] bg-white px-3"
              >
                <option value="start">When to start</option>
                <option value="end">When to stop</option>
              </select>
            ) : (
              <Input
                id={`fact-${f.key}`}
                type={f.type}
                inputMode={f.type === "text" && f.key !== "text" && f.key !== "label" ? "decimal" : undefined}
                placeholder={f.placeholder}
                value={draft[f.key] ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                className="min-h-10"
              />
            )}
          </div>
        ))}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm">
          {submitLabel}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

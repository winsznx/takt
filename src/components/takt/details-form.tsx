"use client";
import { useState } from "react";
import type { ClaimantDetails } from "@/lib/domain/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Key = keyof ClaimantDetails;
const FIELDS: { key: Key; label: string; type?: string; autoComplete?: string; half?: boolean }[] = [
  { key: "firstName", label: "First name", autoComplete: "given-name", half: true },
  { key: "lastName", label: "Last name", autoComplete: "family-name", half: true },
  { key: "phone", label: "Phone", type: "tel", autoComplete: "tel", half: true },
  { key: "email", label: "Email", type: "email", autoComplete: "email", half: true },
  { key: "mailingAddress", label: "Mailing address", autoComplete: "street-address" },
  { key: "city", label: "City", half: true },
  { key: "state", label: "State", half: true },
  { key: "zip", label: "ZIP", half: true },
  { key: "employerName", label: "Employer or business name" },
  { key: "employerAddress", label: "Employer address" },
  { key: "employerCity", label: "Employer city", half: true },
  { key: "employerZip", label: "Employer ZIP", half: true },
  { key: "employerPhone", label: "Employer phone", type: "tel", half: true },
  { key: "workPerformed", label: "Your job", half: true },
  { key: "hireDate", label: "Date you were hired", type: "date", half: true },
];

export function DetailsForm({ initial, onSave }: { initial: ClaimantDetails; onSave: (d: ClaimantDetails) => Promise<void> }) {
  const [d, setD] = useState<ClaimantDetails>(initial);
  const [saved, setSaved] = useState(true);
  const set = <K extends Key>(key: K, value: ClaimantDetails[K]) => {
    setD((x) => ({ ...x, [key]: value }));
    setSaved(false);
  };
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        await onSave(d);
        setSaved(true);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f.key} className={f.half ? "space-y-1" : "space-y-1 sm:col-span-2"}>
            <Label htmlFor={`d-${f.key}`}>{f.label}</Label>
            <Input
              id={`d-${f.key}`}
              type={f.type ?? "text"}
              autoComplete={f.autoComplete}
              value={(d[f.key] as string | null) ?? ""}
              onChange={(e) => set(f.key, (f.type === "date" ? e.target.value || null : e.target.value) as never)}
            />
          </div>
        ))}
        <div className="space-y-1">
          <Label htmlFor="d-status">Are you still working there?</Label>
          <select
            id="d-status"
            value={d.employmentStatus ?? ""}
            onChange={(e) => set("employmentStatus", (e.target.value || null) as ClaimantDetails["employmentStatus"])}
            className="min-h-9 w-full rounded-md border bg-background px-2"
          >
            <option value="">Choose</option>
            <option value="Still working for employer">Yes, still working there</option>
            <option value="QUIT">I quit</option>
            <option value="DISCHARGED">I was let go</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="d-paid">How were you paid?</Label>
          <select
            id="d-paid"
            value={d.paidHow ?? ""}
            onChange={(e) => set("paidHow", (e.target.value || null) as ClaimantDetails["paidHow"])}
            className="min-h-9 w-full rounded-md border bg-background px-2"
          >
            <option value="">Choose</option>
            <option value="BY CHECK">Check or direct deposit</option>
            <option value="BY CASH">Cash</option>
            <option value="BY BOTH CASH & CHECK">Both</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
        {(d.employmentStatus === "QUIT" || d.employmentStatus === "DISCHARGED") && (
          <div className="space-y-1">
            <Label htmlFor="d-sep">Last day</Label>
            <Input id="d-sep" type="date" value={d.separationDate ?? ""} onChange={(e) => set("separationDate", e.target.value || null)} />
          </div>
        )}
        <fieldset className="space-y-1 sm:col-span-2">
          <legend className="text-sm font-medium">Were your hours the same most weeks?</legend>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["irregular", "No, they changed week to week"],
                ["regular", "Yes, mostly the same"],
              ] as const
            ).map(([value, text]) => (
              <label key={value} className="flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm has-[:checked]:border-foreground">
                <input type="radio" name="regularity" checked={d.scheduleRegularity === value} onChange={() => set("scheduleRegularity", value)} />
                {text}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">If they changed, the Labor Commissioner asks for Form 55 with your hours per pay period, and Takt fills it in.</p>
        </fieldset>
      </div>
      <Button type="submit" variant={saved ? "outline" : "default"}>
        {saved ? "Saved" : "Save details"}
      </Button>
    </form>
  );
}

"use client";
import { useState } from "react";
import type { DayReconciliation, EvidenceFact, WorkInterval } from "@/lib/domain/contracts";
import { clockToMinutes, formatClock12, formatDateLong, minutesToClock } from "@/lib/domain/time";
import { clearWorked, setWorked } from "@/lib/client/cases";
import { DecisionBadge } from "@/components/takt/state-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const label = (m: number) => formatClock12(minutesToClock(m));
const span = (i: WorkInterval | null) => (i ? `${label(i.startMinute)} – ${label(i.endMinute)}` : "—");

interface Axis {
  start: number;
  end: number;
}

export function axisFor(days: DayReconciliation[]): Axis {
  const intervals = days.flatMap((d) => [d.schedule, d.employerRecord, d.confirmedWork]).filter((i): i is WorkInterval => i !== null);
  if (intervals.length === 0) return { start: 360, end: 1080 };
  const start = Math.floor(Math.min(...intervals.map((i) => i.startMinute)) / 60) * 60;
  const end = Math.ceil(Math.max(...intervals.map((i) => i.endMinute)) / 60) * 60;
  return { start, end: Math.max(end, start + 60) };
}

function Lane({ name, interval, axis, tone, marker }: { name: string; interval: WorkInterval | null; axis: Axis; tone: string; marker?: number[] }) {
  const pct = (m: number) => `${((m - axis.start) / (axis.end - axis.start)) * 100}%`;
  return (
    <div className="grid grid-cols-[5.5rem_1fr_7.5rem] items-center gap-2 text-xs sm:grid-cols-[7rem_1fr_9rem]">
      <span className="text-muted-foreground">{name}</span>
      <div className="relative h-3 rounded-full bg-muted">
        {interval && (
          <div className={cn("absolute inset-y-0 rounded-full", tone)} style={{ left: pct(interval.startMinute), width: `calc(${pct(interval.endMinute)} - ${pct(interval.startMinute)})` }} />
        )}
        {marker?.map((m) => <div key={m} className="absolute inset-y-[-3px] w-0.5 bg-foreground" style={{ left: pct(m) }} />)}
      </div>
      <span className="tabular-nums">{span(interval)}</span>
    </div>
  );
}

function WorkedEditor({ caseId, day, onDone }: { caseId: string; day: DayReconciliation; onDone: () => void }) {
  const base = day.confirmedWork ?? day.employerRecord ?? day.schedule;
  const [start, setStart] = useState(base ? minutesToClock(base.startMinute) : "08:00");
  const [end, setEnd] = useState(base ? minutesToClock(base.endMinute) : "16:30");
  const [meal, setMeal] = useState(String(base?.mealBreakMinutes ?? 30));
  const valid = /^\d{2}:\d{2}$/.test(start) && /^\d{2}:\d{2}$/.test(end) && clockToMinutes(start) !== clockToMinutes(end) && Number(meal) >= 0;
  return (
    <form
      className="mt-3 space-y-3 rounded-lg border bg-muted/40 p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        await setWorked(caseId, { date: day.date, start, end, mealBreakMinutes: Number(meal), worked: true });
        onDone();
      }}
    >
      <p className="text-sm font-medium">When did you actually work on {formatDateLong(day.date)}?</p>
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label htmlFor={`s-${day.date}`}>Started</Label>
          <Input id={`s-${day.date}`} type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`e-${day.date}`}>Stopped</Label>
          <Input id={`e-${day.date}`} type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`m-${day.date}`}>Meal (min)</Label>
          <Input id={`m-${day.date}`} type="number" min={0} inputMode="numeric" value={meal} onChange={(e) => setMeal(e.target.value)} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Only say what you remember. Takt counts extra time only when a schedule or message backs it up.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={!valid}>
          Save my hours
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={async () => {
            await setWorked(caseId, { date: day.date, start: "00:00", end: "00:01", mealBreakMinutes: 0, worked: false });
            onDone();
          }}
        >
          I didn&apos;t work this day
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function TaktLine({
  caseId,
  days,
  facts,
  hasConfirmation,
}: {
  caseId: string;
  days: DayReconciliation[];
  facts: EvidenceFact[];
  hasConfirmation: (date: string) => boolean;
}) {
  const axis = axisFor(days);
  const [editing, setEditing] = useState<string | null>(null);
  const factById = new Map(facts.map((f) => [f.id, f]));

  return (
    <ol className="divide-y rounded-lg border">
      {days.map((day) => {
        const messageMinutes = day.messageFactIds
          .map((id) => factById.get(id))
          .map((f) => f && (f.correctedValue ?? f.extracted))
          .flatMap((v) => (v && v.kind === "message_time_reference" ? [clockToMinutes(v.time)] : []));
        return (
          <li key={day.date} id={`day-${day.date}`} className="space-y-2 p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">{formatDateLong(day.date)}</p>
              <DecisionBadge state={day.state} />
            </div>
            <div className="space-y-1.5">
              <Lane name="Schedule" interval={day.schedule} axis={axis} tone="bg-sky-400/70" />
              <Lane name="Employer clock" interval={day.employerRecord} axis={axis} tone="bg-zinc-500/70" />
              {messageMinutes.length > 0 && (
                <Lane name="Messages" interval={null} axis={axis} tone="" marker={messageMinutes} />
              )}
              <Lane name="You" interval={day.confirmedWork} axis={axis} tone="bg-state-discrepancy/80" />
            </div>
            {day.reasons.length > 0 && <p className="text-sm text-muted-foreground">{day.reasons.join(" ")}</p>}
            {day.state !== "UNSUPPORTED_RULE" &&
              (editing === day.date ? (
                <WorkedEditor caseId={caseId} day={day} onDone={() => setEditing(null)} />
              ) : (
                <div className="flex flex-wrap gap-2">
                  {day.employerRecord && !hasConfirmation(day.date) && day.state === "AMBIGUOUS" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setWorked(caseId, {
                          date: day.date,
                          start: minutesToClock(day.employerRecord!.startMinute),
                          end: minutesToClock(day.employerRecord!.endMinute),
                          mealBreakMinutes: day.employerRecord!.mealBreakMinutes,
                          worked: true,
                        })
                      }
                    >
                      The employer clock is right
                    </Button>
                  )}
                  <Button size="sm" variant={day.state === "AMBIGUOUS" ? "default" : "ghost"} onClick={() => setEditing(day.date)}>
                    {hasConfirmation(day.date) ? "Change my hours" : "Tell Takt when you worked"}
                  </Button>
                  {hasConfirmation(day.date) && (
                    <Button size="sm" variant="ghost" onClick={() => clearWorked(caseId, day.date)}>
                      Remove my answer
                    </Button>
                  )}
                </div>
              ))}
          </li>
        );
      })}
    </ol>
  );
}

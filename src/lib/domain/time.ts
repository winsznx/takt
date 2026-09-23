/**
 * Civil date and wall-clock arithmetic for California work records.
 *
 * Dates are `YYYY-MM-DD`, times `HH:mm`. Nothing here reads the host timezone.
 * Daylight saving is applied from the US rule in force since 2007
 * (second Sunday of March, first Sunday of November, at 02:00 local), which is
 * the rule for America/Los_Angeles.
 */

const DAY = 1440;

export function clockToMinutes(time: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) throw new RangeError(`invalid clock time "${time}"`);
  return Number(match[1]) * 60 + Number(match[2]);
}

export function minutesToClock(minutes: number): string {
  const m = ((minutes % DAY) + DAY) % DAY;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** `07:40` → `7:40 AM`. */
export function formatClock12(time: string): string {
  const minutes = clockToMinutes(time);
  const h24 = Math.floor(minutes / 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(minutes % 60).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
}

/** `07:40` → `{ time: "7:40", meridiem: "am" }` for DLSE Form 1. */
export function toForm1Clock(time: string): { time: string; meridiem: "am" | "pm" } {
  const [clock, suffix] = formatClock12(time).split(" ");
  return { time: clock, meridiem: suffix === "AM" ? "am" : "pm" };
}

export function formatDuration(minutes: number): string {
  const sign = minutes < 0 ? "-" : "";
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${sign}${m} min`;
  if (m === 0) return `${sign}${h} hr`;
  return `${sign}${h} hr ${m} min`;
}

function parseDate(date: string): [number, number, number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new RangeError(`invalid date "${date}"`);
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
    throw new RangeError(`invalid calendar date "${date}"`);
  }
  return [y, m, d];
}

export function isValidDate(date: string): boolean {
  try {
    parseDate(date);
    return true;
  } catch {
    return false;
  }
}

/** Days since 1970-01-01 for a civil date; used only for ordering and differences. */
export function dayNumber(date: string): number {
  const [y, m, d] = parseDate(date);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = parseDate(date);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(date: string): number {
  const [y, m, d] = parseDate(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function compareDates(a: string, b: string): number {
  return dayNumber(a) - dayNumber(b);
}

export function datesInRange(start: string, end: string): string[] {
  const out: string[] = [];
  for (let date = start; compareDates(date, end) <= 0; date = addDays(date, 1)) out.push(date);
  return out;
}

/** `2026-09-01` → `09/01/2026`. */
export function toUsDate(date: string): string {
  const [y, m, d] = parseDate(date);
  return `${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}/${y}`;
}

export function formatDateLong(date: string): string {
  const [y, m, d] = parseDate(date);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function nthSunday(year: number, month: number, n: number): string {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const day = 1 + ((7 - first) % 7) + (n - 1) * 7;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function dstTransitions(year: number): { springForward: string; fallBack: string } {
  if (year < 2007) throw new RangeError("DST rules before 2007 are not supported");
  return { springForward: nthSunday(year, 3, 2), fallBack: nthSunday(year, 11, 1) };
}

export type ElapsedResult =
  | { ok: true; minutes: number; dstAdjustment: -60 | 0 | 60 }
  | { ok: false; reason: string };

/**
 * Elapsed minutes between two wall-clock readings in California.
 * `endMinute` is relative to 00:00 of `date` and may exceed 1440 for shifts
 * that end the next day. Readings that fall inside a skipped or repeated hour
 * cannot be placed on the timeline without more information and are reported
 * as ambiguous instead of guessed.
 */
export function elapsedWallMinutes(date: string, startMinute: number, endMinute: number): ElapsedResult {
  if (endMinute <= startMinute) return { ok: false, reason: "end is not after start" };
  let adjustment = 0;
  for (let offset = 0; offset * DAY < endMinute; offset++) {
    const day = addDays(date, offset);
    const { springForward, fallBack } = dstTransitions(Number(day.slice(0, 4)));
    const base = offset * DAY;
    if (day === springForward) {
      const [gapStart, gapEnd] = [base + 120, base + 180];
      const inGap = (m: number) => m >= gapStart && m < gapEnd;
      if (inGap(startMinute) || inGap(endMinute)) {
        return { ok: false, reason: `a reading falls in the skipped hour on ${day} (DST start)` };
      }
      if (startMinute < gapStart && endMinute >= gapEnd) adjustment -= 60;
    }
    if (day === fallBack) {
      const [repeatStart, repeatEnd] = [base + 60, base + 120];
      const inRepeat = (m: number) => m >= repeatStart && m < repeatEnd;
      if (inRepeat(startMinute) || inRepeat(endMinute)) {
        return { ok: false, reason: `a reading falls in the repeated hour on ${day} (DST end)` };
      }
      if (startMinute < repeatStart && endMinute >= repeatEnd) adjustment += 60;
    }
  }
  return { ok: true, minutes: endMinute - startMinute + adjustment, dstAdjustment: adjustment as -60 | 0 | 60 };
}

/** Wall-clock start/end on `date` → minutes from 00:00, with an overnight end moved to the next day. */
export function intervalMinutes(startTime: string, endTime: string): { startMinute: number; endMinute: number } {
  const startMinute = clockToMinutes(startTime);
  let endMinute = clockToMinutes(endTime);
  if (endMinute <= startMinute) endMinute += DAY;
  return { startMinute, endMinute };
}

export const MINUTES_PER_DAY = DAY;

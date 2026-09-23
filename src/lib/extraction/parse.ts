import { isValidDate } from "@/lib/domain/time";

/**
 * Deterministic parsers for values as they appear on work records. Each parser
 * returns a normalized value plus a confidence that drops when the text is
 * ambiguous (for example, a date that could be day-first or month-first).
 */

export interface Parsed<T> {
  value: T;
  confidence: number;
  note?: string;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

export const TIME_PATTERN = /\b(1[0-2]|0?[1-9]|[01]\d|2[0-3])(?::([0-5]\d))?\s*([ap])\.?\s*m?\.?(?![a-z])|\b([01]\d|2[0-3]):([0-5]\d)\b/gi;

/** `8:00 AM`, `8am`, `08:00`, `20:15` → `HH:mm`. */
export function parseTime(text: string): Parsed<string> | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, " ");
  let match = /^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m?\.?$/.exec(t);
  if (match) {
    let h = Number(match[1]);
    const m = Number(match[2] ?? 0);
    if (h < 1 || h > 12 || m > 59) return null;
    if (match[3] === "p" && h !== 12) h += 12;
    if (match[3] === "a" && h === 12) h = 0;
    return { value: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`, confidence: 0.99 };
  }
  match = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (match) {
    const h = Number(match[1]);
    const m = Number(match[2]);
    if (h > 23 || m > 59) return null;
    const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    // A bare 12-hour-looking time without am/pm (e.g. "4:30") is ambiguous.
    const ambiguous = h >= 1 && h <= 12 && !/^0\d/.test(match[1]);
    return ambiguous
      ? { value, confidence: 0.6, note: "No AM/PM shown; read as a 24-hour time." }
      : { value, confidence: 0.97 };
  }
  return null;
}

/** Finds every time in a line, left to right. */
export function findTimes(text: string): { raw: string; parsed: Parsed<string> }[] {
  const out: { raw: string; parsed: Parsed<string> }[] = [];
  for (const m of text.matchAll(TIME_PATTERN)) {
    const parsed = parseTime(m[0]);
    if (parsed) out.push({ raw: m[0].trim(), parsed });
  }
  return out;
}

export type DateOrder = "MDY" | "DMY";

/**
 * Parses `08/31/2026`, `2026-08-31`, `Aug 31, 2026`, `31 Aug 2026`, `8/31/26`,
 * and `Mon Aug 31` (with `yearHint`). Slash dates are read month-first unless
 * `order` says otherwise; when both readings are valid and differ, confidence
 * drops so the worker is asked.
 */
export function parseDate(text: string, opts: { yearHint?: number; order?: DateOrder } = {}): Parsed<string> | null {
  const t = text.trim();
  const make = (y: number, m: number, d: number) => {
    const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    return isValidDate(iso) ? iso : null;
  };

  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (match) {
    const iso = make(Number(match[1]), Number(match[2]), Number(match[3]));
    return iso ? { value: iso, confidence: 0.99 } : null;
  }

  match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t);
  if (match) {
    const a = Number(match[1]);
    const b = Number(match[2]);
    const y = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
    const mdy = make(y, a, b);
    const dmy = make(y, b, a);
    const order = opts.order ?? "MDY";
    const primary = order === "MDY" ? mdy : dmy;
    const alternate = order === "MDY" ? dmy : mdy;
    if (primary && alternate && primary !== alternate && !opts.order) {
      return { value: primary, confidence: 0.6, note: `Could also be read as ${alternate}.` };
    }
    if (primary) return { value: primary, confidence: match[3].length === 2 ? 0.95 : 0.99 };
    if (alternate) return { value: alternate, confidence: 0.9, note: "Read day-first because month-first is impossible." };
    return null;
  }

  match = /^(?:[A-Za-z]{3,9},?\s+)?([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?$/.exec(t);
  const monthOf = (name: string) => MONTHS[name.toLowerCase().slice(0, 3)];
  if (match && monthOf(match[1]) !== undefined) {
    const year = match[3] ? Number(match[3]) : opts.yearHint;
    if (!year) return null;
    const iso = make(year, monthOf(match[1]), Number(match[2]));
    return iso ? { value: iso, confidence: match[3] ? 0.99 : 0.93 } : null;
  }

  match = /^(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})$/.exec(t);
  if (match) {
    const month = monthOf(match[2]);
    if (!month) return null;
    const iso = make(Number(match[3]), month, Number(match[1]));
    return iso ? { value: iso, confidence: 0.99 } : null;
  }
  return null;
}

export const DATE_PATTERN =
  /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[/.-]\d{1,2}[/.-](?:\d{4}|\d{2})\b|\b(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,?\s+)?(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:,?\s+\d{4})?\b/gi;

export function findDates(text: string, opts: { yearHint?: number; order?: DateOrder } = {}) {
  const out: { raw: string; parsed: Parsed<string> }[] = [];
  for (const m of text.matchAll(DATE_PATTERN)) {
    const parsed = parseDate(m[0], opts);
    if (parsed) out.push({ raw: m[0], parsed });
  }
  return out;
}

/** `$1,480.00` → `1480.00`. */
export function parseMoney(text: string): string | null {
  const match = /^\(?-?\$?\s*(\d{1,3}(?:,\d{3})*|\d+)(\.\d{1,4})?\)?$/.exec(text.trim());
  if (!match) return null;
  const negative = /^\(|^-/.test(text.trim());
  return `${negative ? "-" : ""}${match[1].replace(/,/g, "")}${match[2] ?? ""}`;
}

export const NUMBER_PATTERN = /\(?-?\$?\d{1,3}(?:,\d{3})*(?:\.\d+)?\)?|\d+(?:\.\d+)?/g;

/**
 * Decides whether slash dates in a document are day-first by looking for any
 * slash date whose first part is over 12. Returns null when the document gives
 * no evidence either way.
 */
export function inferDateOrder(texts: string[]): DateOrder | null {
  let mdy = false;
  let dmy = false;
  for (const text of texts) {
    for (const m of text.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](?:\d{4}|\d{2})\b/g)) {
      if (Number(m[1]) > 12) dmy = true;
      if (Number(m[2]) > 12) mdy = true;
    }
  }
  if (mdy && !dmy) return "MDY";
  if (dmy && !mdy) return "DMY";
  return null;
}

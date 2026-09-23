import type { DocumentClass, FactValue, Region } from "@/lib/domain/contracts";
import { locateInLine, type NativePdf, type TextLine } from "@/lib/documents/pdf-native";
import {
  findDates,
  findTimes,
  inferDateOrder,
  NUMBER_PATTERN,
  parseDate,
  parseMoney,
  type DateOrder,
} from "@/lib/extraction/parse";
import { Rational } from "@/lib/calc/rational";

/**
 * Deterministic extraction from digital PDFs. Every candidate is anchored to
 * the exact pdf.js text tokens it came from. Nothing here calls a model, so
 * text inside a document (including instructions aimed at an AI) can only ever
 * be read as data.
 */

export const NATIVE_EXTRACTOR_VERSION = "native-pdf/1";

export interface Candidate {
  value: FactValue;
  page: number;
  region: Region;
  quote: string;
  confidence: number;
  note?: string;
}

export interface NativeExtraction {
  docClass: DocumentClass;
  classConfidence: number;
  candidates: Candidate[];
  warnings: string[];
}

const CLASS_SIGNALS: Record<Exclude<DocumentClass, "other">, RegExp[]> = {
  time_record: [/time\s*card/i, /timesheet/i, /time\s*in/i, /time\s*out/i, /clock(ed)?[\s-]*(in|out)/i, /\bpunch/i, /hours\s+worked/i],
  paystub: [/earnings\s+statement/i, /pay\s*stub/i, /gross\s+pay/i, /net\s+pay/i, /deductions/i, /\bytd\b/i, /pay\s+date/i, /wage\s+statement/i],
  schedule: [/\bschedule\b/i, /\bshifts?\b/i, /\broster\b/i, /day\s+off/i],
  manager_message: [/\bmessages?\b/i, /\bdelivered\b/i, /\bread\s+\d/i],
  employment_notice: [/notice\s+to\s+employee/i, /2810\.5/, /offer\s+letter/i, /employee\s+handbook/i],
};

export function classifyText(text: string): { docClass: DocumentClass; confidence: number } {
  const scores = Object.entries(CLASS_SIGNALS).map(([cls, patterns]) => ({
    cls: cls as DocumentClass,
    score: patterns.filter((p) => p.test(text)).length,
  }));
  scores.sort((a, b) => b.score - a.score);
  const [best, second] = scores;
  if (best.score === 0) return { docClass: "other", confidence: 0.3 };
  const margin = best.score - (second?.score ?? 0);
  return { docClass: best.cls, confidence: margin >= 2 ? 0.95 : margin === 1 ? 0.8 : 0.55 };
}

function yearHintOf(lines: TextLine[]): number | undefined {
  for (const line of lines) {
    const m = /\b(20\d{2})\b/.exec(line.text);
    if (m) return Number(m[1]);
  }
  return undefined;
}

function anchor(line: TextLine, raw: string): { region: Region; quote: string } {
  return locateInLine(line, raw) ?? { region: line.region, quote: line.text.slice(0, 500) };
}

/** x-center of a header token matching `pattern`, used to assign row values to columns. */
function headerColumn(lines: TextLine[], pattern: RegExp): { page: number; x: number; lineIndex: number } | null {
  for (let i = 0; i < lines.length; i++) {
    const token = lines[i].tokens.find((t) => pattern.test(t.str));
    if (token) return { page: lines[i].page, x: token.region.x + token.region.w / 2, lineIndex: i };
  }
  return null;
}

function nearestToken(line: TextLine, x: number, accept: (s: string) => boolean) {
  const options = line.tokens.filter((t) => accept(t.str.trim()));
  if (options.length === 0) return null;
  return options.reduce((best, t) =>
    Math.abs(t.region.x + t.region.w / 2 - x) < Math.abs(best.region.x + best.region.w / 2 - x) ? t : best,
  );
}

// ---------------------------------------------------------------------------

function extractTimeRecord(lines: TextLine[], order: DateOrder | null, yearHint?: number): Candidate[] {
  const out: Candidate[] = [];
  const meal = headerColumn(lines, /^(meal|break|lunch)/i);
  for (const [index, line] of lines.entries()) {
    const dates = findDates(line.text, { yearHint, order: order ?? undefined });
    const times = findTimes(line.text);
    if (dates.length !== 1 || times.length < 2) continue;
    const date = dates[0];
    const dateConfidence = date.parsed.confidence;
    const note = date.parsed.note;

    const pairs = times.length % 2 === 0 ? times : [times[0], times[times.length - 1]];
    pairs.forEach((t, i) => {
      const kind = i % 2 === 0 ? "time_in" : "time_out";
      const a = anchor(line, t.raw);
      out.push({
        value: { kind, date: date.parsed.value, time: t.parsed.value },
        page: line.page,
        ...a,
        confidence: Math.min(dateConfidence, t.parsed.confidence),
        note: note ?? t.parsed.note,
      });
    });

    if (meal && meal.page === line.page && index > meal.lineIndex) {
      const token = nearestToken(line, meal.x, (s) => /^\d{1,3}$/.test(s));
      if (token && Math.abs(token.region.x + token.region.w / 2 - meal.x) < 0.08) {
        out.push({
          value: { kind: "meal_break", date: date.parsed.value, minutes: Number(token.str.trim()) },
          page: line.page,
          region: token.region,
          quote: token.str.trim(),
          confidence: Math.min(dateConfidence, 0.95),
          note,
        });
      }
    }
  }
  return out;
}

function extractSchedule(lines: TextLine[], order: DateOrder | null, yearHint?: number): Candidate[] {
  const out: Candidate[] = [];
  for (const line of lines) {
    const dates = findDates(line.text, { yearHint, order: order ?? undefined });
    const times = findTimes(line.text);
    if (dates.length !== 1 || times.length !== 2) continue;
    const date = dates[0].parsed;
    const [start, end] = times;
    for (const [kind, t] of [["scheduled_start", start], ["scheduled_end", end]] as const) {
      out.push({
        value: { kind, date: date.value, time: t.parsed.value },
        page: line.page,
        ...anchor(line, t.raw),
        confidence: Math.min(date.confidence, t.parsed.confidence),
        note: date.note ?? t.parsed.note,
      });
    }
  }
  return out;
}

interface EarningLine {
  line: TextLine;
  numbers: { raw: string; value: string }[];
}

/**
 * Picks rate, hours, and amount from a row of numbers by requiring
 * rate × hours ≈ amount (within a cent). Premium lines print their own
 * premium rate, so no multiplier is applied here.
 */
function solveEarning(numbers: { raw: string; value: string }[]) {
  for (const amount of numbers) {
    for (const rate of numbers) {
      for (const hours of numbers) {
        if (new Set([amount, rate, hours]).size !== 3) continue;
        const product = Rational.fromDecimal(rate.value).mul(Rational.fromDecimal(hours.value));
        const gap = product.sub(Rational.fromDecimal(amount.value));
        const abs = gap.isNegative() ? Rational.ZERO.sub(gap) : gap;
        if (abs.compare(Rational.of(1, 100)) <= 0) return { rate, hours, amount };
      }
    }
  }
  return null;
}

function extractPaystub(lines: TextLine[], order: DateOrder | null, yearHint?: number): { candidates: Candidate[]; warnings: string[] } {
  const out: Candidate[] = [];
  const warnings: string[] = [];
  const dateOpts = { yearHint, order: order ?? undefined };

  for (const line of lines) {
    if (/pay\s+period|period\s+(beginning|start)|period\s+ending/i.test(line.text)) {
      const dates = findDates(line.text, dateOpts);
      if (dates.length >= 2 && !out.some((c) => c.value.kind === "pay_period")) {
        const a1 = anchor(line, dates[0].raw);
        const a2 = anchor(line, dates[1].raw);
        out.push({
          value: { kind: "pay_period", start: dates[0].parsed.value, end: dates[1].parsed.value },
          page: line.page,
          region: {
            x: Math.min(a1.region.x, a2.region.x),
            y: Math.min(a1.region.y, a2.region.y),
            w: Math.max(a1.region.x + a1.region.w, a2.region.x + a2.region.w) - Math.min(a1.region.x, a2.region.x),
            h: Math.max(a1.region.y + a1.region.h, a2.region.y + a2.region.h) - Math.min(a1.region.y, a2.region.y),
          },
          quote: `${dates[0].raw} - ${dates[1].raw}`,
          confidence: Math.min(dates[0].parsed.confidence, dates[1].parsed.confidence),
          note: dates[0].parsed.note ?? dates[1].parsed.note,
        });
      }
    }
    if (/pay\s+date|check\s+date/i.test(line.text)) {
      const match = /(pay|check)\s+date:?\s*(\S+(?:\s\d{1,2},?\s\d{4})?)/i.exec(line.text);
      const parsed = match ? parseDate(match[2], dateOpts) : null;
      if (parsed && match && !out.some((c) => c.value.kind === "pay_date")) {
        out.push({ value: { kind: "pay_date", date: parsed.value }, page: line.page, ...anchor(line, match[2]), confidence: parsed.confidence, note: parsed.note });
      }
    }
  }

  const earningLines: EarningLine[] = lines
    .map((line) => ({
      line,
      numbers: [...line.text.matchAll(NUMBER_PATTERN)]
        .map((m) => ({ raw: m[0], value: parseMoney(m[0]) }))
        .filter((n): n is { raw: string; value: string } => n.value !== null),
    }))
    .filter((l) => l.numbers.length > 0);

  const earningKinds: { pattern: RegExp; hours: FactValue["kind"]; pay: FactValue["kind"] }[] = [
    { pattern: /^(regular|reg\b|hourly)/i, hours: "regular_hours_paid", pay: "regular_pay" },
    { pattern: /^(overtime|ot\b|o\/t)/i, hours: "overtime_hours_paid", pay: "overtime_pay" },
    { pattern: /^(double\s*time|dt\b)/i, hours: "double_time_hours_paid", pay: "double_time_pay" },
  ];

  for (const { line, numbers } of earningLines) {
    const kind = earningKinds.find((k) => k.pattern.test(line.text));
    if (kind) {
      const solved = solveEarning(numbers.slice(0, 4));
      if (!solved) {
        warnings.push(`Could not read the "${line.text.slice(0, 40)}" earnings line reliably.`);
        continue;
      }
      if (kind.hours === "regular_hours_paid" && !out.some((c) => c.value.kind === "hourly_rate")) {
        out.push({ value: { kind: "hourly_rate", amount: solved.rate.value }, page: line.page, ...anchor(line, solved.rate.raw), confidence: 0.97 });
      }
      out.push({ value: { kind: kind.hours, hours: solved.hours.value } as FactValue, page: line.page, ...anchor(line, solved.hours.raw), confidence: 0.97 });
      out.push({ value: { kind: kind.pay, amount: solved.amount.value } as FactValue, page: line.page, ...anchor(line, solved.amount.raw), confidence: 0.97 });
      continue;
    }
    if (/^(piece|commission|bonus|shift\s+diff|differential|incentive|tips?\b)/i.test(line.text)) {
      const amount = numbers[numbers.length - 1];
      const label = line.text.replace(NUMBER_PATTERN, "").replace(/\s+/g, " ").trim().slice(0, 120);
      out.push({ value: { kind: "other_earnings", label, amount: amount.value }, page: line.page, ...anchor(line, amount.raw), confidence: 0.9 });
      continue;
    }
    if (/^(gross\s+pay|gross\s+earnings|total\s+gross|gross)\b/i.test(line.text) && !out.some((c) => c.value.kind === "gross_pay")) {
      const amount = numbers[numbers.length - 1];
      out.push({ value: { kind: "gross_pay", amount: amount.value }, page: line.page, ...anchor(line, amount.raw), confidence: 0.97 });
    }
  }

  const heading = lines.find((l) => l.page === 1);
  if (heading) {
    const name = heading.text.split(/\s{2,}|EARNINGS STATEMENT|PAY STUB/i)[0].trim();
    if (name.length > 2 && name.length < 120) {
      out.push({ value: { kind: "employer_name", text: name }, page: heading.page, ...anchor(heading, name), confidence: 0.7 });
    }
  }
  return { candidates: out, warnings };
}

export function extractNative(pdf: NativePdf): NativeExtraction {
  const allText = pdf.lines.map((l) => l.text).join("\n");
  const { docClass, confidence } = classifyText(allText);
  const order = inferDateOrder(pdf.lines.map((l) => l.text));
  const yearHint = yearHintOf(pdf.lines);
  const warnings: string[] = [];
  let candidates: Candidate[] = [];

  if (docClass === "time_record") candidates = extractTimeRecord(pdf.lines, order, yearHint);
  else if (docClass === "schedule") candidates = extractSchedule(pdf.lines, order, yearHint);
  else if (docClass === "paystub") {
    const result = extractPaystub(pdf.lines, order, yearHint);
    candidates = result.candidates;
    warnings.push(...result.warnings);
  }

  if (docClass !== "other" && candidates.length === 0) {
    warnings.push("This looks like a work record, but Takt could not find rows it recognizes. You can enter the facts yourself.");
  }
  return { docClass, classConfidence: confidence, candidates, warnings };
}

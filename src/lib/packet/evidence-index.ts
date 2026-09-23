import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatMoney, Rational } from "@/lib/calc/rational";
import type { ClaimPacketManifest, FactValue } from "@/lib/domain/contracts";
import { formatClock12, formatDateLong, formatDuration, minutesToClock } from "@/lib/domain/time";

/**
 * evidence-index.pdf: a human-readable map of the packet. Every discrepancy
 * lists the exact source location of each supporting fact, so a reviewer can
 * go from a finding to the original record without Takt.
 */

const PAGE = { width: 612, height: 792, margin: 48 };
const INK = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.4, 0.4, 0.45);
const RULE = rgb(0.8, 0.8, 0.82);

class Writer {
  private page!: PDFPage;
  private y = 0;
  constructor(
    private readonly doc: PDFDocument,
    private readonly font: PDFFont,
    private readonly footer: string,
  ) {
    this.newPage();
  }

  private newPage() {
    this.page = this.doc.addPage([PAGE.width, PAGE.height]);
    this.y = PAGE.height - PAGE.margin;
    this.page.drawText(this.footer, { x: PAGE.margin, y: 24, size: 7, font: this.font, color: MUTED });
  }

  private ensure(height: number) {
    if (this.y - height < PAGE.margin) this.newPage();
  }

  private wrap(text: string, size: number, width: number): string[] {
    const lines: string[] = [];
    for (const paragraph of text.split("\n")) {
      let line = "";
      for (const word of paragraph.split(/\s+/)) {
        const candidate = line ? `${line} ${word}` : word;
        if (this.font.widthOfTextAtSize(candidate, size) <= width || !line) line = candidate;
        else {
          lines.push(line);
          line = word;
        }
      }
      lines.push(line);
    }
    return lines;
  }

  text(text: string, opts: { size?: number; color?: ReturnType<typeof rgb>; indent?: number; gap?: number } = {}) {
    const size = opts.size ?? 9;
    const indent = opts.indent ?? 0;
    const width = PAGE.width - PAGE.margin * 2 - indent;
    for (const line of this.wrap(text, size, width)) {
      this.ensure(size * 1.35);
      this.y -= size * 1.35;
      this.page.drawText(line, { x: PAGE.margin + indent, y: this.y, size, font: this.font, color: opts.color ?? INK });
    }
    this.y -= opts.gap ?? 2;
  }

  heading(text: string) {
    this.ensure(40);
    this.y -= 10;
    this.text(text, { size: 13, gap: 2 });
    this.page.drawLine({
      start: { x: PAGE.margin, y: this.y },
      end: { x: PAGE.width - PAGE.margin, y: this.y },
      thickness: 0.5,
      color: RULE,
    });
    this.y -= 8;
  }
}

export function describeFact(value: FactValue): string {
  const t = (time: string) => formatClock12(time);
  switch (value.kind) {
    case "time_in":
      return `Clock in ${t(value.time)} on ${value.date}`;
    case "time_out":
      return `Clock out ${t(value.time)} on ${value.date}`;
    case "meal_break":
      return `Meal break ${value.minutes} min on ${value.date}`;
    case "scheduled_start":
      return `Scheduled start ${t(value.time)} on ${value.date}`;
    case "scheduled_end":
      return `Scheduled end ${t(value.time)} on ${value.date}`;
    case "message_time_reference":
      return `Message: ${value.boundary} at ${t(value.time)} on ${value.date}`;
    case "pay_period":
      return `Pay period ${value.start} to ${value.end}`;
    case "pay_date":
      return `Pay date ${value.date}`;
    case "hourly_rate":
      return `Hourly rate $${value.amount}`;
    case "regular_hours_paid":
      return `Regular hours paid ${value.hours}`;
    case "overtime_hours_paid":
      return `Overtime hours paid ${value.hours}`;
    case "double_time_hours_paid":
      return `Double-time hours paid ${value.hours}`;
    case "regular_pay":
      return `Regular pay $${value.amount}`;
    case "overtime_pay":
      return `Overtime pay $${value.amount}`;
    case "double_time_pay":
      return `Double-time pay $${value.amount}`;
    case "gross_pay":
      return `Gross pay $${value.amount}`;
    case "other_earnings":
      return `Other earnings "${value.label}" $${value.amount}`;
    case "employee_name":
      return `Employee name "${value.text}"`;
    case "employer_name":
      return `Employer name "${value.text}"`;
    case "employer_address":
      return `Employer address "${value.text}"`;
  }
}

const interval = (i: { startMinute: number; endMinute: number; mealBreakMinutes: number } | null) =>
  i ? `${formatClock12(minutesToClock(i.startMinute))} to ${formatClock12(minutesToClock(i.endMinute))}, meal ${i.mealBreakMinutes} min` : "none";

export async function buildEvidenceIndex(manifest: Omit<ClaimPacketManifest, "files">, fontBytes: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes, { subset: true });
  const generated = new Date(manifest.generatedAt);
  doc.setTitle(`Takt evidence index ${manifest.caseId}`);
  doc.setProducer("Takt packet generator");
  doc.setCreator(`takt ${manifest.app.version} (${manifest.app.commit})`);
  doc.setCreationDate(generated);
  doc.setModificationDate(generated);

  const w = new Writer(doc, font, `Takt evidence index · ${manifest.caseId} · prepared by the worker with Takt · not legal advice · not filed with any agency`);
  const sourceName = new Map(manifest.sources.map((s) => [s.documentId, s.filename]));
  const factById = new Map(manifest.facts.map((f) => [f.id, f]));

  w.text("Takt evidence index", { size: 20, gap: 4 });
  w.text(`Case ${manifest.caseId} · generated ${manifest.generatedAt} · ruleset ${manifest.ruleset.id}`, { color: MUTED, gap: 10 });
  w.text(
    "This index lists the records the worker provided, what each record shows, where the records disagree, and how each amount was calculated. " +
      "Takt does not decide whether any law was broken. Every amount below comes from the worker's confirmed facts and published California overtime rules, computed by code, not by an AI model.",
  );

  w.heading("Summary");
  if (!manifest.scope.decision.supported) {
    w.text("This case is outside Takt's supported rules, so Takt did not calculate an amount.");
    for (const r of manifest.scope.decision.reasons) w.text(`• ${r.message}`, { indent: 8 });
  } else {
    w.text(`Amount earned in claimed pay periods: $${formatMoney(manifest.totals.earned)}`);
    w.text(`Amount paid in those periods: $${formatMoney(manifest.totals.paid)}`);
    w.text(`Difference: $${formatMoney(manifest.totals.owed)}`, { size: 11 });
    const n = manifest.discrepancies.length;
    w.text(`${n} ${n === 1 ? "discrepancy" : "discrepancies"} found across ${manifest.days.length} days.`, { color: MUTED });
  }

  w.heading("Records provided");
  for (const s of manifest.sources) {
    w.text(`${s.filename}`, { size: 10, gap: 0 });
    w.text(
      `${s.docClass ?? "unclassified"} · ${s.mimeType} · ${s.bytes} bytes${s.duplicateOf ? ` · duplicate of ${sourceName.get(s.duplicateOf)} (not used)` : ""}${s.packetPath ? ` · copy at ${s.packetPath}` : " · original kept by the worker"}`,
      { color: MUTED, indent: 8, gap: 0 },
    );
    w.text(`SHA-256 ${s.sha256}`, { color: MUTED, indent: 8, size: 7.5, gap: 6 });
  }

  w.heading("Discrepancies");
  if (manifest.discrepancies.length === 0) w.text("No discrepancies were found in the confirmed records.");
  for (const d of manifest.discrepancies) {
    const when = d.scope.date ? formatDateLong(d.scope.date) : d.scope.periodId;
    w.text(`${when} · ${d.type.replaceAll("_", " ")}`, { size: 10.5, gap: 0 });
    w.text(d.explanation, { indent: 8, gap: 0 });
    w.text(
      `Supported by confirmed work: ${d.expected} · Employer record: ${d.observed}${d.deltaMinutes !== null ? ` · Difference: ${formatDuration(d.deltaMinutes)}` : ""}${d.deltaAmount ? ` · Difference: $${d.deltaAmount}` : ""}`,
      { indent: 8, color: MUTED, gap: 0 },
    );
    w.text(`Rule ${d.ruleId}`, { indent: 8, color: MUTED, gap: 0 });
    for (const id of d.supportingFactIds) {
      const fact = factById.get(id);
      if (!fact) continue;
      const r = fact.anchor.region;
      w.text(
        `– ${describeFact(fact.correctedValue ?? fact.extracted)} — ${sourceName.get(fact.documentId)}, page ${fact.anchor.page}, region x${r.x.toFixed(3)} y${r.y.toFixed(3)} w${r.w.toFixed(3)} h${r.h.toFixed(3)}, quote "${fact.anchor.quote}"`,
        { indent: 16, size: 8 },
      );
    }
    w.text("", { gap: 4 });
  }

  w.heading("Day by day");
  for (const day of manifest.days) {
    w.text(`${formatDateLong(day.date)} · ${day.state.replaceAll("_", " ")}`, { size: 10, gap: 0 });
    w.text(`Schedule: ${interval(day.schedule)} · Employer record: ${interval(day.employerRecord)} · Confirmed by worker: ${interval(day.confirmedWork)}`, {
      indent: 8,
      color: MUTED,
      size: 8,
      gap: 0,
    });
    for (const reason of day.reasons) w.text(reason, { indent: 8, size: 8, gap: 0 });
    w.text("", { gap: 3 });
  }

  w.heading("Calculations");
  for (const c of manifest.calculations) {
    w.text(`Pay period ${c.periodStart} to ${c.periodEnd} · ${c.state.replaceAll("_", " ")}`, { size: 10.5, gap: 0 });
    for (const reason of c.blockedReasons) w.text(reason, { indent: 8 });
    for (const line of c.lines) {
      w.text(
        `${line.date} · ${line.label} · ${line.minutes} min × $${line.rate} × ${line.multiplier} ÷ 60 = $${Rational.parse(line.exactAmount).toFixed(4)} (${line.ruleId})`,
        { indent: 8, size: 8, gap: 0 },
      );
    }
    if (c.state === "CALCULATED") {
      w.text(
        `Earned $${formatMoney(c.earned.total)} (regular $${c.earned.regular}, overtime $${c.earned.overtime}, double time $${c.earned.doubleTime}) · paid $${formatMoney(c.paid.total)} · difference $${formatMoney(c.owed)}`,
        { indent: 8, gap: 6 },
      );
    }
  }

  w.heading("Facts the worker reviewed");
  for (const fact of manifest.facts) {
    const value = fact.correctedValue ?? fact.extracted;
    const r = fact.anchor.region;
    w.text(
      `${describeFact(value)} · ${fact.review}${fact.review === "corrected" ? ` (extracted as: ${describeFact(fact.extracted)})` : ""} · ${sourceName.get(fact.documentId)} p${fact.anchor.page} [${r.x.toFixed(2)}, ${r.y.toFixed(2)}] · ${fact.method} · confidence ${fact.confidence}`,
      { size: 7.5, gap: 1 },
    );
  }

  w.heading("Worker statements");
  for (const c of manifest.confirmations) {
    if (c.type === "worked_interval") {
      w.text(`${c.date}: ${c.worked ? `worked ${formatClock12(c.start)} to ${formatClock12(c.end)}, meal ${c.mealBreakMinutes} min` : "did not work"} (${c.at})`, { size: 8 });
    }
  }

  w.heading("Scope, assumptions, and limits");
  for (const a of manifest.scope.decision.assumptions) w.text(`• ${a.message}`, { size: 8.5 });
  for (const l of manifest.limitations) w.text(`• ${l}`, { size: 8.5 });
  w.text(`Rules applied: ${manifest.ruleset.rules.map((r) => `${r.id} v${r.version}`).join(", ")}`, { size: 8, color: MUTED });

  return doc.save();
}

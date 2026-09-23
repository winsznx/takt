import { describe, expect, it } from "vitest";
import {
  FORM1_CLAIM_ROWS,
  FORM1_FIELDS,
  FORM1_SCHEDULE_OPTIONS,
  fillForm1,
  form1DayFieldName,
  form1DayMeridiemName,
  TemplateIntegrityError,
  type Form1Data,
} from "@/lib/forms/form1";
import { readPdfForm } from "@/lib/forms/pdf-fields";
import { form1Template, unicodeFont } from "../helpers/artifacts";

const GENERATED_AT = new Date("2026-09-23T12:00:00Z");

const irregular: Form1Data = {
  claimant: {
    firstName: "Nguyễn Thị",
    lastName: "Ávila-Test",
    cellPhone: "(555) 010-0199",
    email: "synthetic.worker@example.invalid",
    mailingAddress: "100 Example Street Apt 4",
    city: "Fresno",
    state: "CA",
    zip: "93701",
    needsInterpreter: "NO",
  },
  employer: {
    name: "Synthetic Bakery Co. (fixture)",
    phone: "(555) 010-0100",
    address: "200 Example Avenue",
    city: "Fresno",
    state: "CA",
    zip: "93702",
    personInCharge: "Sam Example",
    personInChargeTitle: "Shift manager",
    businessType: "Bakery",
    workPerformed: "Baker",
  },
  employment: { hireDate: "03/02/2026", status: "Still working for employer", paidHow: "BY CHECK" },
  pay: {
    hourly: "YES",
    ratePaidPerHour: "18.50",
    multipleRates: "NO",
    fixedAmount: "NO",
    pieceRate: "NO",
    commission: "NO",
  },
  schedule: { regularity: "irregular" },
  claims: {
    regularWages: { start: "08/31/2026", end: "09/13/2026", amountEarned: "1,480.00" },
    overtimeWages: { start: "08/31/2026", end: "09/13/2026", amountEarned: "55.50" },
  },
  totals: { subtotal: "1,535.50", totalPaid: "1,461.50", grandTotalOwed: "74.00" },
};

describe("DLSE Form 1 write + independent readback", () => {
  it("rejects a template whose hash does not match the pinned official PDF", async () => {
    const template = await form1Template();
    const tampered = template.slice();
    tampered[tampered.length - 10] ^= 0xff;
    await expect(fillForm1(tampered, await unicodeFont(), irregular, GENERATED_AT)).rejects.toBeInstanceOf(
      TemplateIntegrityError,
    );
  });

  it("writes values that pdf.js reads back exactly (irregular schedule)", async () => {
    const out = await fillForm1(await form1Template(), await unicodeFont(), irregular, GENERATED_AT);
    const { fields, pageCount, pageText } = await readPdfForm(out);

    expect(pageCount).toBe(3);
    expect(pageText[0]).toContain("REV. 07/2025");
    expect(fields[FORM1_FIELDS.q7FirstName]).toBe("Nguyễn Thị");
    expect(fields[FORM1_FIELDS.q8LastName]).toBe("Ávila-Test");
    expect(fields[FORM1_FIELDS.p2PrintName]).toBe("Nguyễn Thị Ávila-Test");
    expect(fields[FORM1_FIELDS.q15EmployerName]).toBe("Synthetic Bakery Co. (fixture)");
    expect(fields[FORM1_FIELDS.q27HireDate]).toBe("03/02/2026");
    expect(fields[FORM1_FIELDS.q28Status]).toBe("Still working for employer");
    expect(fields[FORM1_FIELDS.q33Hourly]).toBe("YES");
    expect(fields[FORM1_FIELDS.q33RatePaid]).toBe("18.50");
    expect(fields[FORM1_FIELDS.q34PieceRate]).toBe("NO");
    expect(fields[FORM1_FIELDS.q30ScheduleRegularity]).toBe(FORM1_SCHEDULE_OPTIONS.irregular);

    expect(fields[FORM1_CLAIM_ROWS.regularWages.checkbox]).toBe(true);
    expect(fields[FORM1_CLAIM_ROWS.regularWages.amount]).toBe("1,480.00");
    expect(fields[FORM1_CLAIM_ROWS.overtimeWages.checkbox]).toBe(true);
    expect(fields[FORM1_CLAIM_ROWS.overtimeWages.start]).toBe("08/31/2026");
    expect(fields[FORM1_FIELDS.q36Subtotal]).toBe("1,535.50");
    expect(fields[FORM1_FIELDS.q36TotalPaid]).toBe("1,461.50");
    expect(fields[FORM1_FIELDS.q36GrandTotal]).toBe("74.00");

    // Irregular schedules must leave the typical-week grid blank (Form 1, Part 5, Q31).
    expect(fields[form1DayFieldName("TIME WORK STARTED", 1)]).toBe("");
    // Takt never signs or dates for the worker.
    expect(fields[FORM1_FIELDS.signaturePrintName]).toBe("");
    expect(fields["Date (mm/dd/yyyy)"]).toBe("");
  });

  it("fills the typical-week grid with am/pm radios for a regular schedule", async () => {
    const day = {
      start: { time: "7:40", meridiem: "am" as const },
      end: { time: "4:30", meridiem: "pm" as const },
      meal1Start: { time: "12:00", meridiem: "pm" as const },
      meal1End: { time: "12:30", meridiem: "pm" as const },
    };
    const regular: Form1Data = {
      ...irregular,
      schedule: { regularity: "regular", typicalWeek: [null, day, day, day, day, day, null] },
    };
    const out = await fillForm1(await form1Template(), await unicodeFont(), regular, GENERATED_AT);
    const { fields } = await readPdfForm(out);
    expect(fields[FORM1_FIELDS.q30ScheduleRegularity]).toBe(FORM1_SCHEDULE_OPTIONS.regular);
    expect(fields[form1DayFieldName("TIME WORK STARTED", 1)]).toBe("");
    expect(fields[form1DayFieldName("TIME WORK STARTED", 2)]).toBe("7:40");
    expect(fields[form1DayMeridiemName("TIME WORK STARTED", 2)]).toBe("am");
    expect(fields[form1DayFieldName("TIME WORK ENDED", 6)]).toBe("4:30");
    expect(fields[form1DayMeridiemName("TIME WORK ENDED", 6)]).toBe("pm");
    expect(fields[form1DayFieldName("1st MEAL END TIME", 3)]).toBe("12:30");
  });

  it("is byte-deterministic for identical input", async () => {
    const [a, b] = await Promise.all([
      fillForm1(await form1Template(), await unicodeFont(), irregular, GENERATED_AT),
      fillForm1(await form1Template(), await unicodeFont(), irregular, GENERATED_AT),
    ]);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });
});

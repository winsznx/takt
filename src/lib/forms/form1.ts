import fontkit from "@pdf-lib/fontkit";
import { PDFCheckBox, PDFDocument, PDFRadioGroup, PDFTextField, TextAlignment, type PDFFont } from "pdf-lib";
import { z } from "zod";
import { sha256Hex } from "@/lib/hash";

/**
 * DLSE WCA Form 1 (REV. 07/2025), English.
 *
 * Field names below come from the official AcroForm. Several names are stale
 * relative to the printed question they sit beside (the radio named
 * "IS THIS CLAIM RELATED TO COVID-19?" is next to the independent-contractor
 * question on this revision), so every entry is mapped by widget position and
 * printed text, not by name. See legal/ca-dlse/form-1/FIELD_MAP.md.
 */
export const FORM1_TEMPLATE_SHA256 = "a782525be4e01fa358012c6f797c4866c07c781841fdeaddca7c41b00433267b";
export const FORM1_REVISION = "REV. 07/2025";

export const FORM1_FIELDS = {
  q2RetaliationFiled: "Have you filed a retaliation complaint against your employer with the Labor Commissioner?",
  q3UnionContract: "Is there a union contract covering your employment?",
  q4OthersFiling: "Are other employees also filing wage claims against your employer?",
  q5Interpreter: "Do you need an interpreter?",
  q5aLanguage: "If you checked “YES” to Box 5a, enter the language needed",
  q7FirstName: "Your FIRST NAME",
  q8LastName: "Your LAST NAME",
  q9HomePhone: "HOME PHONE",
  q10CellPhone: "OTHER PHONE",
  q12Email: "Your EMAIL ADDRESS",
  q14MailingAddress: "Your MAILING ADDRESS including Street Number, Street Name, Apartment Number (if applicable)",
  q14City: "CITY",
  q14State: "STATE",
  q14Zip: "ZIP CODE",
  q15EmployerName: "EMPLOYER / BUSINESS NAME(S)",
  q17EmployerPhone: "EMPLOYER PHONE",
  q18EmployerEmail: "EMPLOYER’S EMAIL ADDRESS",
  q19EmployerAddress: "ADDRESS of EMPLOYER / BUSINESS (Street Number, Street Name, Floor, Suite):",
  q19EmployerCity: "Employer/Business CITY",
  q19EmployerState: "Employer/Business STATE",
  q19EmployerZip: "Employer/Business ZIP CODE",
  q20WorksiteAddress: "ADDRESS where you worked, if different from Box 16 (Number, Street, Floor, Suite)",
  q20WorksiteCity: "CITY if different from box 16",
  q20WorksiteState: "STATE if different from box 16",
  q20WorksiteZip: "ZIP CODE if different from box 16",
  q21PersonInCharge: "NAME of PERSON IN CHARGE (First Name, Last Name)",
  q21aPersonInChargeTitle: "JOB TITLE / POSITION of PERSON IN CHARGE",
  q22BusinessType: "TYPE OF BUSINESS",
  q23WorkPerformed: "TYPE OF WORK PERFORMED",
  q24EmployeeCount: "TOTAL NUMBER OF EMPLOYEES",
  q25StillInBusiness: "EMPLOYER STILL IN BUSINESS?",
  q26EntityType: "Check which box describes your employer, if you know:",
  qIndependentContractor: "IS THIS CLAIM RELATED TO COVID-19?",
  p2PrintName: "PRINT YOUR NAME",
  q27HireDate: "DATE OF HIRE (mm/dd/yyyy)",
  q28Status: "Check which box applies to you:",
  q28QuitDate: "Quit on Date of Quit (mm/dd/yyyy)",
  q28DischargeDate: "Date of Discharge (mm/dd/yyyy)",
  q29PaidHow: "How were your wages paid?",
  q29aBounced:
    "If paid by check, did any of your paychecks “bounce” (for example, paycheck could not be cashed because employer has insufficient funds)?",
  q30ScheduleRegularity: "Check which box applies:",
  q32FixedAmount:
    "Were you paid or promised a FIXED amount of wages per pay period, no matter how many hours you worked (for example, $400 per week, regardless of how many hours you worked)?",
  q33Hourly: "Were you an HOURLY employee?",
  q33RatePaid: "Amount paid per hour",
  q33RatePromised: "Amount promised per hour",
  q33bMultipleRates:
    "If you were an HOURLY employee, were you paid or promised more than one hourly rate (based on the hours you worked or different job tasks)?",
  q34PieceRate: "Were you paid by PIECE RATE?",
  q35Commission: "Were you paid by COMMISSION?",
  q36Subtotal: "ENTER SUBTOTAL (add all Amounts Earned/Claimed):",
  q36TotalPaid: "ENTER TOTAL AMOUNT PAID:",
  q36GrandTotal: "GRAND TOTAL OWED [Subtotal minus Total Amount Paid]:",
  signaturePrintName: "Print Name",
} as const;

export const FORM1_SCHEDULE_OPTIONS = {
  regular: "My work hours and days of work were usually the same each week that I worked.",
  irregular:
    "My work hours and/or days of work varied per week or were irregular. If you checked this box and you are claiming unpaid wages or meal and rest period violations, you should also fill out and submit the DLSE FORM55.",
} as const;

/** Claim rows on page 3 (Q36). Only rows Takt can compute are exposed. */
export const FORM1_CLAIM_ROWS = {
  regularWages: {
    checkbox: "REGULAR WAGES Claimed",
    start: "CLAIM PERIOD START DATE REGULAR WAGES (mm/dd/yyyy)",
    end: "CLAIM PERIOD END DATE REGULAR WAGES  (mm/dd/yyyy)",
    amount: "AMOUNT EARNED/Claimed regular wages",
  },
  overtimeWages: {
    checkbox: "Claiming OVERTIME WAGES including double time",
    start: "CLAIM PERIOD START DATE OVERTIME WAGES (mm/dd/yyyy)",
    end: "CLAIM PERIOD END DATE OVERTIME WAGES  (mm/dd/yyyy)",
    amount: "AMOUNT EARNED/Claimed overtime wages",
  },
} as const;

const dayField = (label: string, day: number) => `${label} on Day ${day} of your workweek`;
const dayMeridiem = (label: string, day: number) => `${label} on DAY ${day} of your workweek`;

const usDate = z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/, "mm/dd/yyyy");
const yesNo = z.enum(["YES", "NO"]);
const clock = z.object({
  time: z.string().regex(/^(1[0-2]|[1-9]):[0-5]\d$/, "h:mm, 12-hour"),
  meridiem: z.enum(["am", "pm"]),
});
const money = z.string().regex(/^\d{1,3}(,\d{3})*\.\d{2}$/, "1,234.56");

export const Form1DataSchema = z.object({
  claimant: z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    homePhone: z.string().optional(),
    cellPhone: z.string().optional(),
    email: z.string().optional(),
    mailingAddress: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zip: z.string().optional(),
    needsInterpreter: yesNo.optional(),
    interpreterLanguage: z.string().optional(),
  }),
  employer: z.object({
    name: z.string().min(1),
    phone: z.string().optional(),
    email: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zip: z.string().optional(),
    worksiteAddress: z.string().optional(),
    worksiteCity: z.string().optional(),
    worksiteState: z.string().optional(),
    worksiteZip: z.string().optional(),
    personInCharge: z.string().optional(),
    personInChargeTitle: z.string().optional(),
    businessType: z.string().optional(),
    workPerformed: z.string().optional(),
  }),
  employment: z.object({
    hireDate: usDate.optional(),
    status: z.enum(["Still working for employer", "QUIT", "DISCHARGED"]).optional(),
    separationDate: usDate.optional(),
    paidHow: z.enum(["BY CHECK", "BY CASH", "BY BOTH CASH & CHECK", "OTHER"]).optional(),
  }),
  pay: z.object({
    hourly: yesNo,
    ratePaidPerHour: money.optional(),
    ratePromisedPerHour: money.optional(),
    multipleRates: yesNo,
    fixedAmount: yesNo,
    pieceRate: yesNo,
    commission: yesNo,
  }),
  schedule: z.discriminatedUnion("regularity", [
    z.object({ regularity: z.literal("irregular") }),
    z.object({
      regularity: z.literal("regular"),
      typicalWeek: z
        .array(
          z
            .object({
              start: clock,
              end: clock,
              meal1Start: clock.optional(),
              meal1End: clock.optional(),
            })
            .nullable(),
        )
        .length(7),
    }),
  ]),
  claims: z.object({
    regularWages: z.object({ start: usDate, end: usDate, amountEarned: money }).optional(),
    overtimeWages: z.object({ start: usDate, end: usDate, amountEarned: money }).optional(),
  }),
  totals: z.object({ subtotal: money, totalPaid: money, grandTotalOwed: money }),
});

export type Form1Data = z.infer<typeof Form1DataSchema>;

export class TemplateIntegrityError extends Error {}

export async function assertTemplate(bytes: Uint8Array, expectedSha256: string, label: string) {
  const actual = await sha256Hex(bytes);
  if (actual !== expectedSha256) {
    throw new TemplateIntegrityError(`${label} template hash ${actual} does not match pinned ${expectedSha256}`);
  }
}

/** Every Form 1 field Takt sets: text and radio values as strings, checkboxes as `true`. */
export type Form1FieldValues = Record<string, string | boolean>;

/** Fields that carry money and are right-aligned beside the printed `$`. */
const AMOUNT_FIELDS = new Set<string>([
  ...Object.values(FORM1_CLAIM_ROWS).map((r) => r.amount),
  FORM1_FIELDS.q36Subtotal,
  FORM1_FIELDS.q36TotalPaid,
  FORM1_FIELDS.q36GrandTotal,
]);

export function form1FieldValues(input: Form1Data): Form1FieldValues {
  const data = Form1DataSchema.parse(input);
  const F = FORM1_FIELDS;
  const values: Form1FieldValues = {};
  const set = (name: string, value: string | undefined) => {
    if (value !== undefined && value !== "") values[name] = value;
  };

  const { claimant, employer, employment, pay, schedule, claims, totals } = data;
  set(F.q7FirstName, claimant.firstName);
  set(F.q8LastName, claimant.lastName);
  set(F.q9HomePhone, claimant.homePhone);
  set(F.q10CellPhone, claimant.cellPhone);
  set(F.q12Email, claimant.email);
  set(F.q14MailingAddress, claimant.mailingAddress);
  set(F.q14City, claimant.city);
  set(F.q14State, claimant.state);
  set(F.q14Zip, claimant.zip);
  set(F.q5Interpreter, claimant.needsInterpreter);
  if (claimant.needsInterpreter === "YES") set(F.q5aLanguage, claimant.interpreterLanguage);

  set(F.q15EmployerName, employer.name);
  set(F.q17EmployerPhone, employer.phone);
  set(F.q18EmployerEmail, employer.email);
  set(F.q19EmployerAddress, employer.address);
  set(F.q19EmployerCity, employer.city);
  set(F.q19EmployerState, employer.state);
  set(F.q19EmployerZip, employer.zip);
  set(F.q20WorksiteAddress, employer.worksiteAddress);
  set(F.q20WorksiteCity, employer.worksiteCity);
  set(F.q20WorksiteState, employer.worksiteState);
  set(F.q20WorksiteZip, employer.worksiteZip);
  set(F.q21PersonInCharge, employer.personInCharge);
  set(F.q21aPersonInChargeTitle, employer.personInChargeTitle);
  set(F.q22BusinessType, employer.businessType);
  set(F.q23WorkPerformed, employer.workPerformed);

  set(F.p2PrintName, `${claimant.firstName} ${claimant.lastName}`);
  set(F.q27HireDate, employment.hireDate);
  set(F.q28Status, employment.status);
  if (employment.status === "QUIT") set(F.q28QuitDate, employment.separationDate);
  if (employment.status === "DISCHARGED") set(F.q28DischargeDate, employment.separationDate);
  set(F.q29PaidHow, employment.paidHow);

  set(F.q30ScheduleRegularity, FORM1_SCHEDULE_OPTIONS[schedule.regularity]);
  if (schedule.regularity === "regular") {
    schedule.typicalWeek.forEach((day, index) => {
      if (!day) return;
      const put = (label: string, value: { time: string; meridiem: "am" | "pm" } | undefined) => {
        if (!value) return;
        set(dayField(label, index + 1), value.time);
        set(dayMeridiem(label, index + 1), value.meridiem);
      };
      put("TIME WORK STARTED", day.start);
      put("TIME WORK ENDED", day.end);
      put("1st MEAL START TIME", day.meal1Start);
      put("1st MEAL END TIME", day.meal1End);
    });
  }

  set(F.q32FixedAmount, pay.fixedAmount);
  set(F.q33Hourly, pay.hourly);
  set(F.q33RatePaid, pay.ratePaidPerHour);
  set(F.q33RatePromised, pay.ratePromisedPerHour);
  set(F.q33bMultipleRates, pay.multipleRates);
  set(F.q34PieceRate, pay.pieceRate);
  set(F.q35Commission, pay.commission);

  for (const key of Object.keys(FORM1_CLAIM_ROWS) as (keyof typeof FORM1_CLAIM_ROWS)[]) {
    const claim = claims[key];
    if (!claim) continue;
    const row = FORM1_CLAIM_ROWS[key];
    values[row.checkbox] = true;
    set(row.start, claim.start);
    set(row.end, claim.end);
    set(row.amount, claim.amountEarned);
  }
  set(F.q36Subtotal, totals.subtotal);
  set(F.q36TotalPaid, totals.totalPaid);
  set(F.q36GrandTotal, totals.grandTotalOwed);
  return values;
}

/**
 * Fills the official Form 1. The result stays an editable AcroForm so the
 * worker can review and sign it; Takt never signs or dates on their behalf.
 */
export async function fillForm1(templateBytes: Uint8Array, fontBytes: Uint8Array, input: Form1Data, generatedAt: Date) {
  await assertTemplate(templateBytes, FORM1_TEMPLATE_SHA256, "Form 1");
  const values = form1FieldValues(input);

  const pdf = await PDFDocument.load(templateBytes);
  pdf.registerFontkit(fontkit);
  const font: PDFFont = await pdf.embedFont(fontBytes, { subset: false });
  const form = pdf.getForm();

  for (const [name, value] of Object.entries(values)) {
    const field = form.getField(name);
    if (field instanceof PDFCheckBox) {
      if (value === true) field.check();
    } else if (field instanceof PDFRadioGroup) {
      field.select(String(value));
    } else if (field instanceof PDFTextField) {
      if (AMOUNT_FIELDS.has(name)) field.setAlignment(TextAlignment.Right);
      field.setText(String(value));
    } else {
      throw new Error(`Form 1 field "${name}" has an unexpected type`);
    }
  }

  form.updateFieldAppearances(font);
  pdf.setProducer("Takt packet generator");
  pdf.setModificationDate(generatedAt);
  return pdf.save({ updateFieldAppearances: false });
}

export const form1DayFieldName = dayField;
export const form1DayMeridiemName = dayMeridiem;

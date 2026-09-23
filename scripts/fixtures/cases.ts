import type { ClaimantDetails, DecisionState, DiscrepancyType, DocumentClass, FactValue, ScopeAnswers } from "@/lib/domain/contracts";

/**
 * Synthetic evidence fixtures. Every person, business, address, and number in
 * these cases is invented for testing. None of them is a real worker or user.
 */

export interface ShiftRow {
  date: string;
  start: string;
  end: string;
  meal: number;
}

export interface FixtureDocument {
  file: string;
  docClass: DocumentClass;
  template: "timecard" | "paystub" | "schedule-app" | "messages" | "timecard-scan" | "notice" | "raw";
  /** Template input. Shape depends on the template. */
  data: Record<string, unknown>;
}

export interface FixtureCase {
  caseId: string;
  summary: string;
  claimant: ClaimantDetails;
  scopeAnswers: ScopeAnswers;
  documents: FixtureDocument[];
  /** Hand-labeled facts each document actually shows (ground truth, not model output). */
  expectedFacts: { file: string; value: FactValue; critical?: boolean }[];
  /** What the synthetic worker states about their own hours during review. */
  workerStatements: { date: string; start: string; end: string; meal: number; worked: boolean }[];
  expected: {
    dayStates: Record<string, DecisionState>;
    discrepancies: { type: DiscrepancyType; date: string | null; deltaMinutes: number | null }[];
    owed: string | null;
    outcome: "PACKET_VERIFIED" | "UNSUPPORTED_CASE" | "CALCULATION_BLOCKED" | "INSUFFICIENT_EVIDENCE";
  };
}

const EMPLOYER = {
  name: "Example Bakery Co.",
  address: "200 Example Avenue",
  city: "Fresno",
  state: "CA",
  zip: "93702",
  phone: "(559) 555-0100",
};

const claimant: ClaimantDetails = {
  firstName: "Dana",
  lastName: "Rivera",
  phone: "(559) 555-0142",
  email: "dana.rivera@example.invalid",
  mailingAddress: "100 Sample Street Apt 4",
  city: "Fresno",
  state: "CA",
  zip: "93701",
  employerName: EMPLOYER.name,
  employerAddress: EMPLOYER.address,
  employerCity: EMPLOYER.city,
  employerState: EMPLOYER.state,
  employerZip: EMPLOYER.zip,
  employerPhone: EMPLOYER.phone,
  workPerformed: "Baker",
  hireDate: "2026-03-02",
  employmentStatus: "Still working for employer",
  separationDate: null,
  paidHow: "BY CHECK",
  scheduleRegularity: "irregular",
};

const supported: ScopeAnswers = {
  workedInCalifornia: "yes",
  paidHourly: "yes",
  pieceRateOrCommission: "no",
  salariedOrExempt: "no",
  publicWorks: "no",
  unionContract: "no",
  alternativeWorkweek: "no",
  specialIndustry: "none",
  classifiedAsContractor: "no",
  workweekStartDay: 1,
};

const PERIOD = { start: "2026-08-31", end: "2026-09-13", payDate: "2026-09-18" };
const WORKDAYS = [
  "2026-08-31",
  "2026-09-01",
  "2026-09-02",
  "2026-09-03",
  "2026-09-04",
  "2026-09-07",
  "2026-09-08",
  "2026-09-09",
  "2026-09-10",
  "2026-09-11",
];

const rows = (overrides: Record<string, Partial<ShiftRow>> = {}): ShiftRow[] =>
  WORKDAYS.map((date) => ({ date, start: "08:00", end: "16:30", meal: 30, ...overrides[date] }));

function timecardFacts(file: string, list: ShiftRow[]) {
  return list.flatMap((r) => [
    { file, value: { kind: "time_in", date: r.date, time: r.start } as FactValue, critical: true },
    { file, value: { kind: "time_out", date: r.date, time: r.end } as FactValue, critical: true },
    { file, value: { kind: "meal_break", date: r.date, minutes: r.meal } as FactValue, critical: true },
  ]);
}

function scheduleFacts(file: string, list: ShiftRow[]) {
  return list.flatMap((r) => [
    { file, value: { kind: "scheduled_start", date: r.date, time: r.start } as FactValue, critical: true },
    { file, value: { kind: "scheduled_end", date: r.date, time: r.end } as FactValue, critical: true },
  ]);
}

function paystubFacts(file: string, stub: { rate: string; regularHours: string; regularPay: string; overtimeHours?: string; overtimePay?: string; gross: string }) {
  const facts: { file: string; value: FactValue; critical?: boolean }[] = [
    { file, value: { kind: "pay_period", start: PERIOD.start, end: PERIOD.end }, critical: true },
    { file, value: { kind: "pay_date", date: PERIOD.payDate } },
    { file, value: { kind: "hourly_rate", amount: stub.rate }, critical: true },
    { file, value: { kind: "regular_hours_paid", hours: stub.regularHours }, critical: true },
    { file, value: { kind: "regular_pay", amount: stub.regularPay }, critical: true },
    { file, value: { kind: "gross_pay", amount: stub.gross } },
    { file, value: { kind: "employee_name", text: `${claimant.firstName} ${claimant.lastName}` } },
    { file, value: { kind: "employer_name", text: EMPLOYER.name } },
  ];
  if (stub.overtimeHours) {
    facts.push(
      { file, value: { kind: "overtime_hours_paid", hours: stub.overtimeHours }, critical: true },
      { file, value: { kind: "overtime_pay", amount: stub.overtimePay! }, critical: true },
    );
  }
  return facts;
}

const confirmAll = (list: ShiftRow[]) => list.map((r) => ({ ...r, worked: true }));

// ---------------------------------------------------------------------------

const demoSchedule = rows({ "2026-09-01": { start: "07:40" }, "2026-09-10": { start: "07:40" } });
const demoTimecard = rows();
const demoWorker = rows({ "2026-09-01": { start: "07:40" } });

const TAKT_DEMO_001: FixtureCase = {
  caseId: "TAKT-DEMO-001",
  summary:
    "Schedule and a manager message put the Sep 1 start at 7:40 AM; the employer time record starts at 8:00 AM. The worker confirms 7:40. On Sep 10 the schedule also says 7:40, but the worker confirms 8:00, so that day is consistent. One schedule time is partly covered by a notification and needs review.",
  claimant,
  scopeAnswers: supported,
  documents: [
    {
      file: "Screenshot 2026-09-14 at 9.12.03 PM.png",
      docClass: "schedule",
      template: "schedule-app",
      data: { rows: demoSchedule, obscure: { date: "2026-09-08", field: "end" }, weekOf: PERIOD.start },
    },
    {
      file: "Timecard_Export_0913.pdf",
      docClass: "time_record",
      template: "timecard",
      data: { rows: demoTimecard, employer: EMPLOYER, employee: "RIVERA, DANA", employeeId: "E-0419", period: PERIOD },
    },
    {
      file: "EarningsStatement_0918.pdf",
      docClass: "paystub",
      template: "paystub",
      data: { employer: EMPLOYER, period: PERIOD, rate: "18.50", regularHours: "80.00", regularPay: "1,480.00", gross: "1,480.00", employee: claimant },
    },
    {
      file: "IMG_4821.png",
      docClass: "manager_message",
      template: "messages",
      data: {
        contact: "Sam (Manager)",
        messages: [
          { from: "them", text: "Hey Dana, can you come in at 7:40 tomorrow to help unload the flour delivery?", time: "Mon, Aug 31 · 5:02 PM" },
          { from: "me", text: "Sure, I'll be there at 7:40.", time: "5:04 PM" },
          { from: "them", text: "Thanks!", time: "5:05 PM" },
        ],
      },
    },
  ],
  expectedFacts: [
    ...scheduleFacts("Screenshot 2026-09-14 at 9.12.03 PM.png", demoSchedule),
    ...timecardFacts("Timecard_Export_0913.pdf", demoTimecard),
    ...paystubFacts("EarningsStatement_0918.pdf", { rate: "18.50", regularHours: "80.00", regularPay: "1480.00", gross: "1480.00" }),
    {
      file: "IMG_4821.png",
      value: { kind: "message_time_reference", date: "2026-09-01", time: "07:40", boundary: "start", sentAt: "2026-08-31T17:02" },
      critical: true,
    },
  ],
  workerStatements: confirmAll(demoWorker),
  expected: {
    dayStates: Object.fromEntries(WORKDAYS.map((d) => [d, d === "2026-09-01" ? "DISCREPANCY_DETECTED" : "CONSISTENT"])),
    discrepancies: [{ type: "start_time_shaved", date: "2026-09-01", deltaMinutes: 20 }],
    owed: "9.25",
    outcome: "PACKET_VERIFIED",
  },
};

// ---------------------------------------------------------------------------

const controlRows = rows();

const TAKT_CONTROL_001: FixtureCase = {
  caseId: "TAKT-CONTROL-001",
  summary: "Schedule, time record, wage statement, and messages all agree. Takt should report no discrepancy.",
  claimant,
  scopeAnswers: supported,
  documents: [
    { file: "Screenshot 2026-09-14 at 8.40.51 PM.png", docClass: "schedule", template: "schedule-app", data: { rows: controlRows, weekOf: PERIOD.start } },
    {
      file: "Timecard_Export_0913.pdf",
      docClass: "time_record",
      template: "timecard",
      data: { rows: controlRows, employer: EMPLOYER, employee: "RIVERA, DANA", employeeId: "E-0419", period: PERIOD },
    },
    {
      file: "EarningsStatement_0918.pdf",
      docClass: "paystub",
      template: "paystub",
      data: { employer: EMPLOYER, period: PERIOD, rate: "18.50", regularHours: "80.00", regularPay: "1,480.00", gross: "1,480.00", employee: claimant },
    },
    {
      file: "IMG_5102.png",
      docClass: "manager_message",
      template: "messages",
      data: {
        contact: "Sam (Manager)",
        messages: [
          { from: "them", text: "Schedule for the next two weeks is posted. Same as usual, 8 to 4:30.", time: "Sun, Aug 30 · 6:15 PM" },
          { from: "me", text: "Got it, thanks.", time: "6:20 PM" },
        ],
      },
    },
  ],
  expectedFacts: [
    ...scheduleFacts("Screenshot 2026-09-14 at 8.40.51 PM.png", controlRows),
    ...timecardFacts("Timecard_Export_0913.pdf", controlRows),
    ...paystubFacts("EarningsStatement_0918.pdf", { rate: "18.50", regularHours: "80.00", regularPay: "1480.00", gross: "1480.00" }),
  ],
  workerStatements: [],
  expected: {
    dayStates: Object.fromEntries(WORKDAYS.map((d) => [d, "CONSISTENT"])),
    discrepancies: [],
    owed: "0.00",
    outcome: "PACKET_VERIFIED",
  },
};

// ---------------------------------------------------------------------------

const ambigA = rows({ "2026-09-01": { start: "07:40" } });
const ambigClockA = rows({ "2026-09-02": { start: "08:00" } });
const ambigClockB = rows({ "2026-09-02": { start: "08:15" } });

const TAKT_AMBIG_001: FixtureCase = {
  caseId: "TAKT-AMBIG-001",
  summary:
    "Two exports of the employer time record disagree about Sep 2 (8:00 vs 8:15 AM), and the Sep 1 early start has no independent support. Takt must not produce a confident amount for the affected pay period.",
  claimant,
  scopeAnswers: supported,
  documents: [
    {
      file: "Timecard_Export_0913.pdf",
      docClass: "time_record",
      template: "timecard",
      data: { rows: ambigClockA, employer: EMPLOYER, employee: "RIVERA, DANA", employeeId: "E-0419", period: PERIOD },
    },
    {
      file: "timecard (1).pdf",
      docClass: "time_record",
      template: "timecard",
      data: { rows: ambigClockB, employer: EMPLOYER, employee: "RIVERA, DANA", employeeId: "E-0419", period: PERIOD, exportedAt: "09/15/2026 07:02" },
    },
    {
      file: "EarningsStatement_0918.pdf",
      docClass: "paystub",
      template: "paystub",
      data: { employer: EMPLOYER, period: PERIOD, rate: "18.50", regularHours: "80.00", regularPay: "1,480.00", gross: "1,480.00", employee: claimant },
    },
  ],
  expectedFacts: [
    ...timecardFacts("Timecard_Export_0913.pdf", ambigClockA),
    ...timecardFacts("timecard (1).pdf", ambigClockB),
    ...paystubFacts("EarningsStatement_0918.pdf", { rate: "18.50", regularHours: "80.00", regularPay: "1480.00", gross: "1480.00" }),
  ],
  workerStatements: confirmAll(ambigA),
  expected: {
    dayStates: Object.fromEntries(
      WORKDAYS.map((d) => [d, d === "2026-09-02" ? "AMBIGUOUS" : d === "2026-09-01" ? "INSUFFICIENT_EVIDENCE" : "CONSISTENT"]),
    ),
    discrepancies: [],
    owed: null,
    outcome: "CALCULATION_BLOCKED",
  },
};

// ---------------------------------------------------------------------------

const TAKT_UNSUPPORTED_001: FixtureCase = {
  caseId: "TAKT-UNSUPPORTED-001",
  summary:
    "The worker is paid partly by piece rate. Piece-rate overtime uses a different regular-rate method, so Takt must refuse an authoritative amount and point to the Labor Commissioner.",
  claimant: { ...claimant, workPerformed: "Delivery driver" },
  scopeAnswers: { ...supported, pieceRateOrCommission: "yes" },
  documents: [
    {
      file: "Timecard_Export_0913.pdf",
      docClass: "time_record",
      template: "timecard",
      data: { rows: rows({ "2026-09-01": { end: "18:30" } }), employer: EMPLOYER, employee: "RIVERA, DANA", employeeId: "E-0419", period: PERIOD },
    },
    {
      file: "EarningsStatement_0918.pdf",
      docClass: "paystub",
      template: "paystub",
      data: {
        employer: EMPLOYER,
        period: PERIOD,
        rate: "17.00",
        regularHours: "80.00",
        regularPay: "1,360.00",
        pieceRate: { units: "412", unitRate: "0.75", amount: "309.00" },
        gross: "1,669.00",
        net: "1,441.02",
        employee: claimant,
      },
    },
  ],
  expectedFacts: [
    ...timecardFacts("Timecard_Export_0913.pdf", rows({ "2026-09-01": { end: "18:30" } })),
    ...paystubFacts("EarningsStatement_0918.pdf", { rate: "17.00", regularHours: "80.00", regularPay: "1360.00", gross: "1669.00" }),
  ],
  workerStatements: [],
  expected: {
    dayStates: Object.fromEntries(WORKDAYS.map((d) => [d, "UNSUPPORTED_RULE"])),
    discrepancies: [],
    owed: null,
    outcome: "UNSUPPORTED_CASE",
  },
};

export const FIXTURE_CASES: FixtureCase[] = [TAKT_DEMO_001, TAKT_CONTROL_001, TAKT_AMBIG_001, TAKT_UNSUPPORTED_001];
export const FIXTURE_PERIOD = PERIOD;
export const FIXTURE_EMPLOYER = EMPLOYER;

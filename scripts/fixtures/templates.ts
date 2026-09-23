import { Rational } from "@/lib/calc/rational";
import { formatMoney } from "@/lib/calc/rational";
import { addDays, dayOfWeek, formatClock12, intervalMinutes, toUsDate } from "@/lib/domain/time";
import type { ShiftRow } from "./cases";

const SYNTHETIC_NOTICE = "SYNTHETIC TEST DOCUMENT — generated for Takt testing. Not a real person, employer, or record.";
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const hoursOf = (r: ShiftRow) => {
  const { startMinute, endMinute } = intervalMinutes(r.start, r.end);
  return Rational.of(endMinute - startMinute - r.meal, 60).toFixed(2);
};

interface Employer {
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
}
interface Period {
  start: string;
  end: string;
  payDate: string;
}

export function timecardHtml(data: {
  rows: ShiftRow[];
  employer: Employer;
  employee: string;
  employeeId: string;
  period: Period;
  exportedAt?: string;
}): string {
  const total = data.rows.reduce((acc, r) => acc.add(Rational.fromDecimal(hoursOf(r))), Rational.ZERO);
  const body = data.rows
    .map(
      (r) => `<tr><td>${toUsDate(r.date)}</td><td>${DAYS[dayOfWeek(r.date)]}</td><td>${formatClock12(r.start)}</td><td>${formatClock12(r.end)}</td><td class="n">${r.meal}</td><td class="n">${hoursOf(r)}</td></tr>`,
    )
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:Helvetica,Arial,sans-serif;color:#111;margin:48px;font-size:12px}
    h1{font-size:18px;margin:0 0 4px} .muted{color:#555}
    .meta{display:flex;justify-content:space-between;margin:18px 0 14px;border-top:2px solid #111;padding-top:10px}
    table{width:100%;border-collapse:collapse} th,td{border-bottom:1px solid #ccc;padding:6px 8px;text-align:left}
    th{background:#eee;font-size:11px;text-transform:uppercase;letter-spacing:.03em} .n{text-align:right}
    tfoot td{font-weight:bold;border-top:2px solid #111;border-bottom:none}
    .foot{margin-top:40px;font-size:9px;color:#777}
  </style></head><body>
    <h1>${esc(data.employer.name)} — Timecard Report</h1>
    <div class="muted">${esc(data.employer.address)}, ${esc(data.employer.city)}, ${data.employer.state} ${data.employer.zip}</div>
    <div class="meta"><div><b>Employee:</b> ${esc(data.employee)} (${esc(data.employeeId)})<br><b>Department:</b> Production</div>
    <div><b>Period:</b> ${toUsDate(data.period.start)} – ${toUsDate(data.period.end)}<br><b>Exported:</b> ${esc(data.exportedAt ?? "09/14/2026 06:30")}</div></div>
    <table><thead><tr><th>Date</th><th>Day</th><th>Time In</th><th>Time Out</th><th class="n">Meal (min)</th><th class="n">Hours</th></tr></thead>
    <tbody>${body}</tbody><tfoot><tr><td colspan="5">Total Hours</td><td class="n">${total.toFixed(2)}</td></tr></tfoot></table>
    <div class="foot">${SYNTHETIC_NOTICE}</div>
  </body></html>`;
}

export function paystubHtml(data: {
  employer: Employer;
  period: Period;
  rate: string;
  regularHours: string;
  regularPay: string;
  overtimeHours?: string;
  overtimeRate?: string;
  overtimePay?: string;
  pieceRate?: { units: string; unitRate: string; amount: string };
  gross: string;
  employee: { firstName: string; lastName: string; mailingAddress: string; city: string; state: string; zip: string };
}): string {
  const gross = Rational.fromDecimal(data.gross.replace(/,/g, ""));
  const pct = (p: string) => gross.mul(Rational.fromDecimal(p)).roundToCents();
  const deductions: [string, Rational][] = [
    ["Federal Income Tax", pct("0.0415")],
    ["Social Security", pct("0.062")],
    ["Medicare", pct("0.0145")],
    ["CA State Income Tax", pct("0.0095")],
    ["CA SDI", pct("0.013")],
  ];
  const totalDeductions = deductions.reduce((acc, [, v]) => acc.add(v), Rational.ZERO);
  const net = gross.sub(totalDeductions);
  const earning = (label: string, rate: string, hours: string, amount: string) =>
    `<tr><td>${label}</td><td class="n">${rate}</td><td class="n">${hours}</td><td class="n">${amount}</td></tr>`;
  const earnings = [
    earning("Regular", data.rate, data.regularHours, data.regularPay),
    data.overtimeHours ? earning("Overtime", data.overtimeRate!, data.overtimeHours, data.overtimePay!) : "",
    data.pieceRate ? earning(`Piece Rate (${data.pieceRate.units} units)`, data.pieceRate.unitRate, "", data.pieceRate.amount) : "",
  ].join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:Helvetica,Arial,sans-serif;color:#111;margin:48px;font-size:12px}
    .top{display:flex;justify-content:space-between;border-bottom:3px solid #1f3a5f;padding-bottom:10px}
    h1{font-size:16px;margin:0;color:#1f3a5f} h2{font-size:12px;margin:18px 0 6px;text-transform:uppercase;color:#1f3a5f}
    table{width:100%;border-collapse:collapse} th,td{padding:5px 8px;border-bottom:1px solid #ddd;text-align:left}
    th{font-size:10px;text-transform:uppercase;color:#555} .n{text-align:right}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:24px} .box{border:1px solid #ccc;padding:10px}
    .total td{font-weight:bold;border-top:2px solid #111}
    .foot{margin-top:40px;font-size:9px;color:#777}
  </style></head><body>
    <div class="top"><div><h1>${esc(data.employer.name)}</h1>${esc(data.employer.address)}<br>${esc(data.employer.city)}, ${data.employer.state} ${data.employer.zip}<br>${esc(data.employer.phone)}</div>
    <div style="text-align:right"><h1>EARNINGS STATEMENT</h1>Pay Period: ${toUsDate(data.period.start)} - ${toUsDate(data.period.end)}<br>Pay Date: ${toUsDate(data.period.payDate)}<br>Check No. 100418</div></div>
    <div class="grid" style="margin-top:14px"><div class="box"><b>${esc(data.employee.firstName)} ${esc(data.employee.lastName)}</b><br>${esc(data.employee.mailingAddress)}<br>${esc(data.employee.city)}, ${data.employee.state} ${data.employee.zip}</div>
    <div class="box">Employee ID: E-0419<br>Pay Frequency: Biweekly<br>Sick leave available: 14.25 hrs</div></div>
    <h2>Earnings</h2><table><thead><tr><th>Description</th><th class="n">Rate</th><th class="n">Hours</th><th class="n">Current</th></tr></thead>
    <tbody>${earnings}<tr class="total"><td>Gross Pay</td><td></td><td></td><td class="n">${data.gross}</td></tr></tbody></table>
    <h2>Deductions</h2><table><tbody>${deductions.map(([l, v]) => `<tr><td>${l}</td><td class="n">${formatMoney(v.toFixed(2))}</td></tr>`).join("")}
    <tr class="total"><td>Total Deductions</td><td class="n">${formatMoney(totalDeductions.toFixed(2))}</td></tr></tbody></table>
    <h2>Net Pay</h2><table><tbody><tr class="total"><td>Net Pay</td><td class="n">${formatMoney(net.toFixed(2))}</td></tr></tbody></table>
    <div class="foot">${SYNTHETIC_NOTICE}</div>
  </body></html>`;
}

export function scheduleAppHtml(data: { rows: ShiftRow[]; weekOf: string; obscure?: { date: string; field: "start" | "end" } }): string {
  const byDate = new Map(data.rows.map((r) => [r.date, r]));
  const items = Array.from({ length: 14 }, (_, i) => addDays(data.weekOf, i))
    .map((date) => {
      const r = byDate.get(date);
      const obscured = data.obscure?.date === date;
      const time = r
        ? `<span class="t">${formatClock12(r.start)}</span> – <span class="t${obscured && data.obscure?.field === "end" ? " smudge" : ""}">${formatClock12(r.end)}</span>`
        : `<span class="off">Day off</span>`;
      return `<div class="row${r ? "" : " rest"}"><div class="d"><b>${DAYS[dayOfWeek(date)]}</b><span>${MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8))}</span></div>
        <div class="s">${time}${r ? `<div class="role">Baker · Production</div>` : ""}</div>${obscured ? `<div class="toast">🔔 Sam: Can someone cover Sat?</div>` : ""}</div>`;
    })
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box} body{margin:0;font-family:-apple-system,"Helvetica Neue",Arial,sans-serif;background:#f4f4f6;width:390px}
    .status{height:44px;display:flex;justify-content:space-between;align-items:center;padding:0 22px;font-weight:600;font-size:15px}
    header{padding:6px 18px 12px;background:#f4f4f6} header h1{margin:0;font-size:28px} header p{margin:2px 0 0;color:#666;font-size:13px}
    .row{position:relative;display:flex;gap:14px;background:#fff;margin:0 12px 6px;border-radius:12px;padding:10px 14px;align-items:center}
    .rest{background:#ececf0} .d{width:44px;display:flex;flex-direction:column;font-size:12px;color:#444} .d b{font-size:15px;color:#111}
    .s{font-size:16px;font-weight:600;color:#1a1a1a} .role{font-size:12px;color:#777;font-weight:400;margin-top:2px} .off{color:#888;font-weight:400}
    .smudge{filter:blur(2.6px);opacity:.7}
    .toast{position:absolute;left:186px;top:18px;right:6px;background:rgba(40,40,46,.86);color:#fff;font-size:12px;border-radius:10px;padding:8px 10px;box-shadow:0 4px 12px rgba(0,0,0,.25)}
    .foot{font-size:8px;color:#999;padding:8px 14px}
  </style></head><body>
    <div class="status"><span>9:12</span><span>●●● 5G ▮</span></div>
    <header><h1>My Shifts</h1><p>Example Bakery Co. · ${MONTHS[Number(data.weekOf.slice(5, 7)) - 1]} ${Number(data.weekOf.slice(8))} – two weeks</p></header>
    ${items}
    <div class="foot">${SYNTHETIC_NOTICE}</div>
  </body></html>`;
}

export function messagesHtml(data: { contact: string; messages: { from: "me" | "them"; text: string; time: string }[] }): string {
  const bubbles = data.messages
    .map((m) => `<div class="ts">${esc(m.time)}</div><div class="b ${m.from}">${esc(m.text)}</div>`)
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box} body{margin:0;font-family:-apple-system,"Helvetica Neue",Arial,sans-serif;background:#fff;width:390px;min-height:640px}
    .status{height:44px;display:flex;justify-content:space-between;align-items:center;padding:0 22px;font-weight:600;font-size:15px}
    .head{text-align:center;border-bottom:1px solid #e5e5ea;padding:6px 0 10px} .avatar{width:44px;height:44px;border-radius:50%;background:#a0a4ad;margin:0 auto 4px}
    .head div{font-size:13px} .thread{padding:12px 14px;display:flex;flex-direction:column}
    .ts{align-self:center;font-size:11px;color:#8e8e93;margin:10px 0 4px}
    .b{max-width:75%;padding:9px 13px;border-radius:18px;font-size:16px;line-height:1.3;margin:2px 0}
    .them{background:#e9e9eb;align-self:flex-start} .me{background:#0a84ff;color:#fff;align-self:flex-end}
    .foot{font-size:8px;color:#999;padding:8px 14px}
  </style></head><body>
    <div class="status"><span>9:14</span><span>●●● 5G ▮</span></div>
    <div class="head"><div class="avatar"></div><div>${esc(data.contact)}</div></div>
    <div class="thread">${bubbles}</div>
    <div class="foot">${SYNTHETIC_NOTICE}</div>
  </body></html>`;
}

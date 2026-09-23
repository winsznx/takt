import { Calculator } from "lucide-react";
import type { PeriodCalculation } from "@/lib/domain/contracts";
import { formatMoney, Rational } from "@/lib/calc/rational";
import { formatDuration } from "@/lib/domain/time";

export function TaktCalc({ calculation }: { calculation: PeriodCalculation }) {
  const c = calculation;
  const owed = Rational.fromDecimal(c.owed);
  return (
    <section className="panel p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[17px] font-semibold">
          Pay period {c.periodStart} to {c.periodEnd}
        </h3>
        <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground"><Calculator className="size-3.5" strokeWidth={1.75} />Plain code, no AI</span>
      </div>
      {c.state === "CALCULATION_BLOCKED" ? (
        <div className="mt-3 rounded-2xl border border-[#f5e3b3] bg-[#fefce8] p-4 text-[14px] text-[#713f12]">
          <p className="font-medium">Takt won&apos;t calculate this pay period yet.</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {c.blockedReasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-[#f6f7f9] p-3">
              <dt className="text-[12px] text-muted-foreground">Earned</dt>
              <dd className="text-[16px] font-semibold tabular-nums text-ink sm:text-[18px]">${formatMoney(c.earned.total)}</dd>
            </div>
            <div className="rounded-xl bg-[#f6f7f9] p-3">
              <dt className="text-[12px] text-muted-foreground">Paid</dt>
              <dd className="text-[16px] font-semibold tabular-nums text-ink sm:text-[18px]">${formatMoney(c.paid.total)}</dd>
            </div>
            <div className={`rounded-xl p-3 ${owed.compare(Rational.ZERO) > 0 ? "bg-brand-soft" : "bg-[#ecfdf5]"}`}>
              <dt className="text-[12px] text-muted-foreground">Difference</dt>
              <dd className="text-[16px] font-semibold tabular-nums text-ink sm:text-[18px]">${formatMoney(c.owed)}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-muted-foreground">
            {formatDuration(c.workedMinutes.regular)} regular · {formatDuration(c.workedMinutes.overtime)} overtime ·{" "}
            {formatDuration(c.workedMinutes.doubleTime)} double time · rounded to the cent once per pay type
          </p>
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer">Every line ({c.lines.length})</summary>
            <table className="mt-2 w-full text-left text-xs tabular-nums">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1">Date</th>
                  <th>Rule</th>
                  <th className="text-right">Minutes</th>
                  <th className="text-right">× rate</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {c.lines.map((l) => (
                  <tr key={`${l.date}-${l.ruleId}`} className="border-t">
                    <td className="py-1">{l.date}</td>
                    <td title={l.label}>{l.ruleId}</td>
                    <td className="text-right">{l.minutes}</td>
                    <td className="text-right">
                      ${l.rate} × {l.multiplier}
                    </td>
                    <td className="text-right">${Rational.parse(l.exactAmount).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </section>
  );
}

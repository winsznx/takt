import type { PeriodCalculation } from "@/lib/domain/contracts";
import { formatMoney, Rational } from "@/lib/calc/rational";
import { formatDuration } from "@/lib/domain/time";

export function TaktCalc({ calculation }: { calculation: PeriodCalculation }) {
  const c = calculation;
  const owed = Rational.fromDecimal(c.owed);
  return (
    <section className="rounded-lg border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">
          Pay period {c.periodStart} to {c.periodEnd}
        </h3>
        <span className="text-xs text-muted-foreground">Takt Calc · no AI in this step</span>
      </div>
      {c.state === "CALCULATION_BLOCKED" ? (
        <div className="mt-2 rounded-md bg-state-insufficient/10 p-3 text-sm">
          <p className="font-medium">Takt won&apos;t calculate this pay period yet.</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {c.blockedReasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md bg-muted p-2">
              <dt className="text-xs text-muted-foreground">Earned</dt>
              <dd className="font-semibold tabular-nums">${formatMoney(c.earned.total)}</dd>
            </div>
            <div className="rounded-md bg-muted p-2">
              <dt className="text-xs text-muted-foreground">Paid</dt>
              <dd className="font-semibold tabular-nums">${formatMoney(c.paid.total)}</dd>
            </div>
            <div className={`rounded-md p-2 ${owed.compare(Rational.ZERO) > 0 ? "bg-state-discrepancy/10" : "bg-state-consistent/10"}`}>
              <dt className="text-xs text-muted-foreground">Difference</dt>
              <dd className="font-semibold tabular-nums">${formatMoney(c.owed)}</dd>
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

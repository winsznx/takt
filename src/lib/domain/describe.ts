import type { FactValue } from "@/lib/domain/contracts";
import { formatClock12 } from "@/lib/domain/time";

/** One plain-language line for a fact, used in Takt Review and the evidence index. */
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

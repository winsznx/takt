import type { DocumentClass } from "@/lib/domain/contracts";

export const DOC_CLASS_LABEL: Record<DocumentClass, string> = {
  schedule: "Schedule",
  time_record: "Time record / timecard",
  paystub: "Pay stub / wage statement",
  manager_message: "Message from a manager",
  employment_notice: "Employment notice",
  other: "Other",
};

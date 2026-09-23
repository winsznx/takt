import type { VerificationReceipt } from "@/lib/domain/contracts";
import { cn } from "@/lib/utils";

const HEADLINE: Record<VerificationReceipt["status"], string> = {
  VERIFIED_PACKET: "Verified: every check passed",
  VERIFICATION_FAILED: "Failed: this packet does not match its own records",
  UNVERIFIABLE_PACKET: "Can't verify: this isn't a readable Takt packet",
};

export function ReceiptView({ receipt }: { receipt: VerificationReceipt }) {
  const ok = receipt.status === "VERIFIED_PACKET";
  return (
    <section
      className={cn("rounded-xl border-2 p-4", ok ? "border-state-consistent/50 bg-state-consistent/5" : "border-destructive/50 bg-destructive/5")}
      aria-live="polite"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Takt Verify · {receipt.verifierVersion}</p>
      <h3 className={cn("mt-1 text-lg font-semibold", ok ? "text-state-consistent" : "text-destructive")}>{HEADLINE[receipt.status]}</h3>
      {receipt.manifestSha256 && <p className="mt-1 break-all font-mono text-xs text-muted-foreground">manifest {receipt.manifestSha256}</p>}
      <ul className="mt-3 space-y-1 text-sm">
        {receipt.checks.map((c) => (
          <li key={c.id} className="flex gap-2">
            <span
              className={cn(
                "mt-0.5 inline-block w-10 shrink-0 text-xs font-semibold",
                c.status === "pass" ? "text-state-consistent" : c.status === "fail" ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {c.status.toUpperCase()}
            </span>
            <span>{c.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

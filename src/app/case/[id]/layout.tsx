"use client";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { CaseProvider, useCase } from "@/components/takt/case-context";
import { CASE_STATE_TEXT } from "@/components/takt/state-badge";
import { cn } from "@/lib/utils";

const STEPS = [
  { slug: "evidence", label: "Records" },
  { slug: "review", label: "Review" },
  { slug: "reconcile", label: "Compare" },
  { slug: "packet", label: "Packet" },
] as const;

function CaseHeader() {
  const { stored, analysis } = useCase();
  const pathname = usePathname();
  const state = stored.lastPacket?.receipt.status === "VERIFIED_PACKET" ? "PACKET_VERIFIED" : analysis.state;
  return (
    <div className="border-b bg-muted/40">
      <div className="mx-auto max-w-5xl px-4 pt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Case {stored.reference}
              {stored.sample ? " · synthetic sample" : ""}
            </p>
            <p className="font-medium">{CASE_STATE_TEXT[state]}</p>
          </div>
          <p className="text-xs text-muted-foreground">Stored only on this device</p>
        </div>
        <nav className="-mb-px mt-3 flex gap-1 overflow-x-auto" aria-label="Case steps">
          {STEPS.map((step, i) => {
            const href = `/case/${stored.id}/${step.slug}`;
            const active = pathname === href;
            return (
              <Link
                key={step.slug}
                href={href}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "whitespace-nowrap border-b-2 px-3 py-2 text-sm",
                  active ? "border-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {i + 1}. {step.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

export default function CaseLayout({ children }: { children: ReactNode }) {
  const { id } = useParams<{ id: string }>();
  return (
    <CaseProvider
      id={id}
      fallback={(state) => (
        <div className="mx-auto max-w-xl px-4 py-16 text-center">
          {state === "loading" ? (
            <p className="text-muted-foreground">Opening your case…</p>
          ) : (
            <>
              <h1 className="text-xl font-semibold">This case isn&apos;t on this device</h1>
              <p className="mt-2 text-muted-foreground">
                Takt keeps cases in this browser only. It may have been deleted, or it was created on another device or in a private window.
              </p>
              <Link href="/cases" className="mt-6 inline-block underline">
                See cases on this device
              </Link>
            </>
          )}
        </div>
      )}
    >
      <CaseHeader />
      <div className="mx-auto max-w-5xl px-4 py-6">{children}</div>
    </CaseProvider>
  );
}

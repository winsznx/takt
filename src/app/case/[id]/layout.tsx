"use client";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { CaseProvider, useCase } from "@/components/takt/case-context";
import { CASE_STATE_TEXT } from "@/components/takt/state-badge";
import { GitCompareArrows, Inbox, Lock, PackageCheck, ScanSearch } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { slug: "evidence", label: "Records", icon: Inbox },
  { slug: "review", label: "Review", icon: ScanSearch },
  { slug: "reconcile", label: "Compare", icon: GitCompareArrows },
  { slug: "packet", label: "Packet", icon: PackageCheck },
] as const;

function CaseHeader() {
  const { stored, analysis } = useCase();
  const pathname = usePathname();
  const state = stored.lastPacket?.receipt.status === "VERIFIED_PACKET" ? "PACKET_VERIFIED" : analysis.state;
  return (
    <div className="px-4 pt-2 sm:px-6">
      <div className="mx-auto max-w-[1240px] rounded-[24px] bg-[linear-gradient(180deg,#fcfcfc,#eef3ff)] px-5 pb-5 pt-6 sm:px-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[13px] text-muted-foreground">
              Case {stored.reference}
              {stored.sample ? " (synthetic sample)" : ""}
            </p>
            <p className="mt-1 text-[22px] font-semibold tracking-[-0.5px] text-ink sm:text-[26px]">{CASE_STATE_TEXT[state]}</p>
          </div>
          <p className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[13px] text-[#4a4b55] ring-1 ring-[#ececef]">
            <Lock className="size-3.5" strokeWidth={1.75} />
            Stored only on this device
          </p>
        </div>
        <nav className="-mx-1 mt-5 flex gap-1.5 overflow-x-auto px-1 pb-1" aria-label="Case steps">
          {STEPS.map((step) => {
            const href = `/case/${stored.id}/${step.slug}`;
            const active = pathname === href;
            const Icon = step.icon;
            return (
              <Link
                key={step.slug}
                href={href}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-[14px] font-medium transition-colors",
                  active ? "bg-brand text-white" : "bg-white text-[#4a4b55] ring-1 ring-[#ececef] hover:text-brand",
                )}
              >
                <Icon className="size-4" strokeWidth={1.75} />
                {step.label}
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
      <div className="mx-auto max-w-[1180px] px-5 py-8 sm:py-10 min-[1320px]:px-0">{children}</div>
    </CaseProvider>
  );
}

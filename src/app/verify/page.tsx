import type { Metadata } from "next";
import { VerifyPanel } from "@/components/takt/verify-panel";

export const metadata: Metadata = { title: "Verify a packet" };

export default function VerifyPage() {
  return (
    <div className="mx-auto max-w-[880px] px-5 py-10 sm:py-14 min-[1320px]:px-0">
      <h1 className="text-[30px] font-semibold leading-[1.1] tracking-[-1px] sm:text-[40px]">Takt Verify</h1>
      <p className="mt-2 text-muted-foreground">
        Drop in a Takt packet to check it. Verification runs in your browser using only the packet&apos;s own bytes and Takt&apos;s pinned copies of the
        official forms. The packet is not uploaded anywhere.
      </p>
      <div className="mt-6">
        <VerifyPanel />
      </div>
    </div>
  );
}

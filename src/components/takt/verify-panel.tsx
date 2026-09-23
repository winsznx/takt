"use client";
import { useState } from "react";
import { ReceiptView } from "@/components/takt/receipt";
import { Button } from "@/components/ui/button";
import { verifyUploadedPacket } from "@/lib/client/packet";
import type { VerificationReceipt } from "@/lib/domain/contracts";

/** Takt Verify: checks any packet ZIP from its bytes alone, in this browser. */
export function VerifyPanel() {
  const [packet, setPacket] = useState<File | null>(null);
  const [originals, setOriginals] = useState<File[]>([]);
  const [receipt, setReceipt] = useState<VerificationReceipt | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex min-h-24 cursor-pointer flex-col justify-center rounded-lg border-2 border-dashed p-4 text-sm">
          <span className="font-medium">Packet ZIP</span>
          <span className="text-muted-foreground">{packet ? packet.name : "Choose a Takt packet"}</span>
          <input type="file" accept=".zip,application/zip" hidden onChange={(e) => setPacket(e.target.files?.[0] ?? null)} />
        </label>
        <label className="flex min-h-24 cursor-pointer flex-col justify-center rounded-lg border-2 border-dashed p-4 text-sm">
          <span className="font-medium">Original files (optional)</span>
          <span className="text-muted-foreground">{originals.length ? `${originals.length} files` : "To check they haven't changed"}</span>
          <input type="file" multiple hidden onChange={(e) => setOriginals(Array.from(e.target.files ?? []))} />
        </label>
      </div>
      <Button
        disabled={!packet || busy}
        onClick={async () => {
          if (!packet) return;
          setBusy(true);
          try {
            const bytes = new Uint8Array(await packet.arrayBuffer());
            const originalBytes = await Promise.all(originals.map(async (f) => new Uint8Array(await f.arrayBuffer())));
            setReceipt(await verifyUploadedPacket(bytes, originalBytes));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Checking…" : "Verify packet"}
      </Button>
      {receipt && <ReceiptView receipt={receipt} />}
    </div>
  );
}

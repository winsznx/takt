"use client";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { useCase } from "@/components/takt/case-context";
import { DetailsForm } from "@/components/takt/details-form";
import { ReceiptView } from "@/components/takt/receipt";
import { ScopeForm } from "@/components/takt/scope-form";
import { VerifyPanel } from "@/components/takt/verify-panel";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { updateCase } from "@/lib/client/cases";
import { download, generatePacket } from "@/lib/client/packet";
import { formatMoney } from "@/lib/calc/rational";
import type { BuiltPacket } from "@/lib/packet/build";
import { PacketGenerationError } from "@/lib/packet/build";
import type { VerificationReceipt } from "@/lib/domain/contracts";

const FILE_LABEL: Record<string, string> = {
  "claim-form-1.pdf": "DLSE Form 1 (claim form)",
  "dlse-form-55.xls": "DLSE Form 55 (hours per pay period)",
  "evidence-index.pdf": "Evidence index",
  "calculation.csv": "Calculation (spreadsheet)",
  "README.txt": "What's in this packet",
  "manifest.json": "Manifest (for verification)",
};

const TYPES: Record<string, string> = { pdf: "application/pdf", xls: "application/vnd.ms-excel", csv: "text/csv", txt: "text/plain", json: "application/json" };

export default function PacketPage() {
  const { stored, analysis } = useCase();
  const [includeSources, setIncludeSources] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ built: BuiltPacket; receipt: VerificationReceipt } | null>(null);
  const [editingScope, setEditingScope] = useState(false);

  const blockers: string[] = [];
  if (!stored.scopeAnswers) blockers.push("Answer the scope questions.");
  if (analysis.reconciliation.unreviewedFactIds.length) blockers.push(`Review ${analysis.reconciliation.unreviewedFactIds.length} remaining facts.`);
  if (analysis.state === "CASE_CREATED" || analysis.state === "EVIDENCE_INGESTED") blockers.push("Add your records and let Takt read them.");
  const claiming = analysis.claimedPeriodIds.length > 0 && analysis.scope?.supported;
  if (claiming && (!stored.details.firstName || !stored.details.lastName || !stored.details.employerName)) {
    blockers.push("Enter your name and your employer's name below.");
  }

  async function generate() {
    setBusy(true);
    try {
      setResult(await generatePacket(stored, includeSources));
    } catch (error) {
      toast.error(error instanceof PacketGenerationError ? error.message : "The packet could not be built. Nothing was saved.");
    } finally {
      setBusy(false);
    }
  }

  const current = result?.built.manifestSha256 === stored.lastPacket?.manifestSha256 ? result : null;

  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <h1 className="text-[30px] font-semibold leading-[1.1] tracking-[-1px] sm:text-[40px]">Your claim packet</h1>
        {claiming ? (
          <p className="text-muted-foreground">
            Takt found <span className="font-semibold text-foreground">${formatMoney(analysis.totals.owed)}</span> of supported pay that your wage
            statements don&apos;t show. The packet contains the official California forms filled in from your confirmed facts, plus the evidence behind every
            number.
          </p>
        ) : (
          <p className="text-muted-foreground">
            {analysis.state === "UNSUPPORTED_CASE"
              ? "This case is outside Takt's rules, so the packet has your organized evidence but no claim form or amount."
              : analysis.state === "CALCULATION_BLOCKED"
                ? "Takt couldn't calculate an amount, so the packet has your organized evidence and the reasons, but no claim form."
                : "Takt didn't find a supported difference between your work and your pay. You can still export your organized evidence."}
          </p>
        )}
      </section>

      {claiming && (
        <section className="space-y-3">
          <h2 className="text-[20px] font-semibold tracking-[-0.3px]">Your details for Form 1</h2>
          <p className="text-sm text-muted-foreground">These go on the claim form. Takt never signs or dates the form for you.</p>
          <DetailsForm initial={stored.details} onSave={(d) => updateCase(stored.id, () => ({ details: d }))} />
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-[20px] font-semibold tracking-[-0.3px]">Scope answers</h2>
        {editingScope ? (
          <ScopeForm
            initial={stored.scopeAnswers}
            submitLabel="Save answers"
            onSubmit={async (answers) => {
              await updateCase(stored.id, () => ({ scopeAnswers: answers }));
              setEditingScope(false);
            }}
          />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 panel p-4 text-sm">
            <span>{analysis.scope ? (analysis.scope.supported ? "Inside Takt's supported California rules." : "Outside Takt's supported rules.") : "Not answered yet."}</span>
            <Button size="sm" variant="outline" onClick={() => setEditingScope(true)}>
              {analysis.scope ? "Change answers" : "Answer now"}
            </Button>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-[20px] font-semibold tracking-[-0.3px]">Takt Packet</h2>
        <label className="flex items-start gap-3 panel p-4 text-sm">
          <Switch checked={includeSources} onCheckedChange={setIncludeSources} aria-label="Include copies of my files" />
          <span>
            <span className="font-medium">Include copies of my original files</span>
            <span className="block text-muted-foreground">
              Off by default. Without copies, the packet still lists every file&apos;s fingerprint so anyone can check your originals later.
            </span>
          </span>
        </label>
        {blockers.length > 0 && (
          <ul className="list-disc space-y-1 rounded-2xl border border-[#f5e3b3] bg-[#fefce8] text-[#713f12] p-3 pl-8 text-sm">
            {blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        )}
        <Button size="lg" disabled={blockers.length > 0 || busy} onClick={generate}>
          {busy ? "Building and verifying…" : "Build and verify packet"}
        </Button>

        {current && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => download(current.built.zip, `${stored.reference}-takt-packet.zip`)}>Download packet (.zip)</Button>
            </div>
            <ul className="panel divide-y divide-[#ececef] overflow-hidden text-sm">
              {Object.entries(current.built.files)
                .filter(([path]) => !path.startsWith("sources/"))
                .map(([path, bytes]) => (
                  <li key={path} className="flex items-center justify-between gap-2 p-3">
                    <span>
                      {FILE_LABEL[path] ?? path}
                      <span className="block font-mono text-xs text-muted-foreground">{path}</span>
                    </span>
                    <Button size="sm" variant="outline" onClick={() => download(bytes, path, TYPES[path.split(".").pop() ?? ""] ?? "application/octet-stream")}>
                      Download
                    </Button>
                  </li>
                ))}
            </ul>
            <ReceiptView receipt={current.receipt} />
            <p className="text-sm text-muted-foreground">
              Next: review Form 1, sign and date it yourself, and file it with the{" "}
              <a className="underline" href="https://www.dir.ca.gov/dlse/HowToFileWageClaim.htm" target="_blank" rel="noreferrer">
                Labor Commissioner&apos;s Office
              </a>
              . Takt does not file anything for you.
            </p>
          </div>
        )}
        {!current && stored.lastPacket && (
          <p className="text-sm text-muted-foreground">
            A packet was built on {new Date(stored.lastPacket.generatedAt).toLocaleString()} ({stored.lastPacket.receipt.status}). Build again to
            download it.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-[20px] font-semibold tracking-[-0.3px]">Takt Verify</h2>
        <p className="text-sm text-muted-foreground">
          Check any Takt packet, including one someone sent you. The check runs in this browser from the packet&apos;s bytes. It re-hashes every file,
          replays the comparison, re-does the math, and reads the forms back.
        </p>
        <VerifyPanel />
        <p className="text-xs text-muted-foreground">
          Or from a terminal: <code>npm run verify:packet -- packet.zip</code>. <Link href="/limitations" className="underline">What verification does not prove</Link>.
        </p>
      </section>
    </div>
  );
}

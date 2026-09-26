"use client";
import { Camera, CircleAlert, Fingerprint, Loader2, RotateCcw, ShieldAlert, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";
import { useCase } from "@/components/takt/case-context";
import { DOC_CLASS_ICON, DOC_CLASS_LABEL } from "@/components/takt/doc-labels";
import { PageHeader } from "@/components/takt/page-header";
import { Button } from "@/components/ui/button";
import { addFiles, removeDocument, updateCase } from "@/lib/client/cases";
import { Switch } from "@/components/ui/switch";
import { processDocument } from "@/lib/client/process";
import { DocumentClass, type EvidenceDocument } from "@/lib/domain/contracts";
import { cn } from "@/lib/utils";

const STATUS: Record<EvidenceDocument["status"], { text: string; className: string }> = {
  hashed: { text: "Waiting to be read", className: "bg-[#f1f3f6] text-[#4a5263]" },
  extracting: { text: "Reading…", className: "bg-brand-soft text-brand" },
  extracted: { text: "Read", className: "bg-[#ecfdf5] text-[#065f46]" },
  extraction_failed: { text: "Couldn't read automatically", className: "bg-[#fefce8] text-[#854d0e]" },
  duplicate: { text: "Duplicate, not used", className: "bg-[#f1f3f6] text-[#4a5263]" },
};

export default function EvidencePage() {
  const { stored, analysis } = useCase();
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  async function ingest(list: FileList | File[]) {
    const files = await Promise.all(Array.from(list).map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
    if (files.length === 0) return;
    setBusy(true);
    try {
      const { added, rejected } = await addFiles(stored.id, files);
      for (const r of rejected) toast.error(`${r.filename}: ${r.reason}`);
      const duplicates = added.filter((d) => d.duplicateOf);
      if (duplicates.length) toast.message(`${duplicates.length} file${duplicates.length > 1 ? "s were" : " was"} already added. Copies aren't counted twice.`);
      for (const doc of added) await processDocument(stored.id, doc);
    } finally {
      setBusy(false);
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void ingest(e.dataTransfer.files);
  };

  const factsFor = (id: string) => stored.facts.filter((f) => f.documentId === id);
  const ready = stored.documents.some((d) => d.status === "extracted");
  const open = analysis.reconciliation.unreviewedFactIds.length;

  return (
    <div className="space-y-8">
      <PageHeader title="Your records">
        Add anything that shows when you worked or what you were paid: schedules, timecards, pay stubs, and messages from a manager.
      </PageHeader>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn("grid gap-3 rounded-[24px] border-2 border-dashed border-[#c9d7ff] p-3 transition-colors sm:grid-cols-2", dragging && "border-brand bg-brand-soft")}
      >
        {[
          { ref: fileInput, icon: Upload, title: "Choose files", hint: "PDF, PNG, or JPEG, up to 15 MB each. Or drop them here." },
          { ref: cameraInput, icon: Camera, title: "Take a photo", hint: "Of a paper timecard or pay stub" },
        ].map(({ ref, icon: Icon, title, hint }) => (
          <button
            key={title}
            type="button"
            onClick={() => ref.current?.click()}
            disabled={busy}
            className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-[18px] bg-white p-5 text-center ring-1 ring-[#ececef] transition-colors hover:bg-[#f7f9ff] disabled:opacity-60"
          >
            <span className="flex size-11 items-center justify-center rounded-full bg-brand-soft text-brand">
              {busy ? <Loader2 className="size-5 animate-spin" /> : <Icon className="size-5" strokeWidth={1.75} />}
            </span>
            <span className="text-[16px] font-semibold text-ink">{title}</span>
            <span className="text-[14px] text-muted-foreground">{hint}</span>
          </button>
        ))}
        <input ref={fileInput} type="file" multiple accept="application/pdf,image/png,image/jpeg" hidden onChange={(e) => e.target.files && ingest(e.target.files)} />
        <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => e.target.files && ingest(e.target.files)} />
      </div>

      <p className="flex items-start gap-2 text-[14px] text-muted-foreground">
        <Fingerprint className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
        Files are fingerprinted (SHA-256) and stored in this browser. PDFs with real text are read on your device. Photos and scans are sent once to
        Google&apos;s free Gemini service to be read. Takt&apos;s server keeps nothing, but Google may use free-tier images to improve its products.{" "}
        <Link href="/privacy" className="underline">
          Details
        </Link>
        .
      </p>

      <label className="flex items-start gap-3 text-[14px]">
        <Switch
          checked={stored.sendImagesToAi !== false}
          onCheckedChange={(on) => updateCase(stored.id, () => ({ sendImagesToAi: on }))}
          aria-label="Send photos and scans to Google to be read"
        />
        <span>
          <span className="font-medium text-ink">Send photos and scans to Google to be read</span>
          <span className="block text-muted-foreground">Off means nothing leaves your browser, and you type in what each image shows.</span>
        </span>
      </label>

      {stored.documents.length === 0 ? (
        <div className="panel flex flex-col items-center gap-2 p-10 text-center">
          <p className="text-[16px] font-semibold text-ink">No records yet</p>
          <p className="text-[15px] text-muted-foreground">Start with whatever you have. You can add more later.</p>
        </div>
      ) : (
        <ul className="panel divide-y divide-[#ececef] overflow-hidden">
          {stored.documents.map((doc) => {
            const Icon = DOC_CLASS_ICON[doc.docClass ?? "other"];
            const status = STATUS[doc.status];
            return (
              <li key={doc.id} className="space-y-3 p-4 sm:px-6">
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#f1f3f8] text-ink">
                    <Icon className="size-[18px]" strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium text-ink">{doc.filename}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1 font-mono" title="SHA-256 fingerprint of the original file">
                        <Fingerprint className="size-3.5" strokeWidth={1.75} />
                        {doc.sha256.slice(0, 12)}…
                      </span>
                      {doc.docClass && <span>{DOC_CLASS_LABEL[doc.docClass]}</span>}
                      {doc.status === "extracted" && <span>{factsFor(doc.id).length} facts found</span>}
                    </p>
                  </div>
                  <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[12px] font-medium", status.className)}>{status.text}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:pl-[52px]">
                  {!doc.duplicateOf && (
                    <select
                      aria-label={`Type of ${doc.filename}`}
                      value={doc.docClass ?? ""}
                      disabled={doc.status === "extracting"}
                      onChange={(e) => void processDocument(stored.id, doc, DocumentClass.parse(e.target.value))}
                      className="h-8 rounded-full border border-[#e3e4e8] bg-white px-3 text-[13px]"
                    >
                      <option value="" disabled>
                        What is this?
                      </option>
                      {Object.entries(DOC_CLASS_LABEL).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  )}
                  {doc.status === "extraction_failed" && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => processDocument(stored.id, doc, doc.docClass)}>
                        <RotateCcw />
                        Try again
                      </Button>
                      <Button size="sm" variant="outline" render={<Link href={`/case/${stored.id}/review?doc=${doc.id}`} />}>
                        Enter facts myself
                      </Button>
                    </>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => removeDocument(stored.id, doc.id)} disabled={doc.status === "extracting"}>
                    <Trash2 />
                    Remove
                  </Button>
                </div>
                {doc.extractionError && (
                  <p className="flex items-start gap-2 text-[14px] text-[#854d0e] sm:pl-[52px]">
                    <CircleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
                    {doc.extractionError}
                  </p>
                )}
                {stored.injectionWarnings.includes(doc.id) && (
                  <p className="flex items-start gap-2 text-[14px] text-[#5b44c2] sm:pl-[52px]">
                    <ShieldAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
                    This file contains text that tries to give instructions to an AI. Takt treated it as plain text and did not follow it.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-col gap-3 border-t border-[#ececef] pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[15px] text-muted-foreground">
          {open > 0 ? `${open} facts are waiting for your review.` : ready ? "Everything Takt read has been reviewed." : ""}
        </p>
        <Button size="lg" disabled={!ready} render={<Link href={`/case/${stored.id}/review`} />}>
          Review what Takt read
        </Button>
      </div>
    </div>
  );
}

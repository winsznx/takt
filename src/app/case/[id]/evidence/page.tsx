"use client";
import Link from "next/link";
import { useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";
import { useCase } from "@/components/takt/case-context";
import { DOC_CLASS_LABEL } from "@/components/takt/doc-labels";
import { Button } from "@/components/ui/button";
import { addFiles, removeDocument } from "@/lib/client/cases";
import { processDocument } from "@/lib/client/process";
import { DocumentClass, type EvidenceDocument } from "@/lib/domain/contracts";

const STATUS: Record<EvidenceDocument["status"], string> = {
  hashed: "Waiting to be read",
  extracting: "Reading…",
  extracted: "Read",
  extraction_failed: "Couldn't read automatically",
  duplicate: "Duplicate, not used",
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Your records</h1>
        <p className="mt-1 text-muted-foreground">
          Add anything that shows when you worked or what you were paid: schedules, timecards, pay stubs, and messages from a manager. PDFs, photos,
          and screenshots all work.
        </p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`grid gap-3 rounded-xl border-2 border-dashed p-4 sm:grid-cols-2 ${dragging ? "border-foreground bg-muted" : ""}`}
      >
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={busy}
          className="flex min-h-28 flex-col items-center justify-center rounded-lg bg-muted/60 p-4 text-center hover:bg-muted disabled:opacity-60"
        >
          <span className="font-medium">Choose files</span>
          <span className="text-sm text-muted-foreground">PDF, PNG, or JPEG · up to 15 MB each</span>
        </button>
        <button
          type="button"
          onClick={() => cameraInput.current?.click()}
          disabled={busy}
          className="flex min-h-28 flex-col items-center justify-center rounded-lg bg-muted/60 p-4 text-center hover:bg-muted disabled:opacity-60"
        >
          <span className="font-medium">Take a photo</span>
          <span className="text-sm text-muted-foreground">Of a paper timecard or pay stub</span>
        </button>
        <input ref={fileInput} type="file" multiple accept="application/pdf,image/png,image/jpeg" hidden onChange={(e) => e.target.files && ingest(e.target.files)} />
        <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => e.target.files && ingest(e.target.files)} />
      </div>

      <p className="text-xs text-muted-foreground">
        Files are fingerprinted (SHA-256) and stored in this browser. PDFs with real text are read on your device. Photos and scans are sent once to
        Takt&apos;s server to be read by an AI model; the server keeps nothing.
      </p>

      {stored.documents.length === 0 ? (
        <p className="rounded-lg border p-6 text-center text-muted-foreground">No records yet.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {stored.documents.map((doc) => (
            <li key={doc.id} className="space-y-2 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{doc.filename}</p>
                  <p className="text-sm text-muted-foreground">
                    {STATUS[doc.status]}
                    {doc.status === "extracted" && ` · ${factsFor(doc.id).length} facts found`}
                    {doc.docClass && ` · ${DOC_CLASS_LABEL[doc.docClass]}`}
                  </p>
                  <p className="font-mono text-[11px] text-muted-foreground" title="SHA-256 fingerprint of the original file">
                    {doc.sha256.slice(0, 16)}…
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {!doc.duplicateOf && (
                    <select
                      aria-label={`Type of ${doc.filename}`}
                      value={doc.docClass ?? ""}
                      disabled={doc.status === "extracting"}
                      onChange={(e) => {
                        const hint = DocumentClass.parse(e.target.value);
                        void processDocument(stored.id, doc, hint);
                      }}
                      className="min-h-9 rounded-md border bg-background px-2 text-sm"
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
                  <Button variant="ghost" size="sm" onClick={() => removeDocument(stored.id, doc.id)} disabled={doc.status === "extracting"}>
                    Remove
                  </Button>
                </div>
              </div>
              {doc.extractionError && <p className="text-sm text-state-insufficient">{doc.extractionError}</p>}
              {doc.status === "extraction_failed" && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => processDocument(stored.id, doc, doc.docClass)}>
                    Try again
                  </Button>
                  <Button size="sm" variant="outline" render={<Link href={`/case/${stored.id}/review?doc=${doc.id}`} />}>
                    Enter facts myself
                  </Button>
                </div>
              )}
              {stored.injectionWarnings.includes(doc.id) && (
                <p className="text-sm text-state-ambiguous">
                  This file contains text that tries to give instructions to an AI. Takt treated it as plain text and did not follow it.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {analysis.reconciliation.unreviewedFactIds.length > 0
            ? `${analysis.reconciliation.unreviewedFactIds.length} facts are waiting for your review.`
            : ready
              ? "Everything Takt read has been reviewed."
              : ""}
        </p>
        <Button size="lg" disabled={!ready} render={<Link href={`/case/${stored.id}/review`} />}>
          Review what Takt read
        </Button>
      </div>
    </div>
  );
}

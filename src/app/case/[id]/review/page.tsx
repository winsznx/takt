"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useCase } from "@/components/takt/case-context";
import { DOC_CLASS_LABEL } from "@/components/takt/doc-labels";
import { FactEditor, KIND_LABEL } from "@/components/takt/fact-editor";
import { SourceViewer, type Highlight } from "@/components/takt/source-viewer";
import { Button } from "@/components/ui/button";
import { addManualFact, confirmHighConfidence, reviewFact, setDocumentClass } from "@/lib/client/cases";
import { getSample, type SampleCase } from "@/lib/client/samples";
import { LOW_CONFIDENCE_THRESHOLD, type EvidenceFact } from "@/lib/domain/contracts";
import { describeFact } from "@/lib/domain/describe";
import { cn } from "@/lib/utils";

const ORDER = (f: EvidenceFact) => (f.review === "unreviewed" ? (f.confidence < LOW_CONFIDENCE_THRESHOLD ? 0 : 1) : 2);

export default function ReviewPage() {
  const { stored } = useCase();
  const params = useSearchParams();
  const documents = stored.documents.filter((d) => !d.duplicateOf);
  const docId =
    params.get("doc") ??
    documents.find((d) => stored.facts.some((f) => f.documentId === d.id && f.review === "unreviewed"))?.id ??
    documents[0]?.id;
  return <ReviewBody key={docId ?? "none"} docId={docId} />;
}

function ReviewBody({ docId }: { docId: string | undefined }) {
  const { stored, analysis } = useCase();
  const documents = stored.documents.filter((d) => !d.duplicateOf);
  const document = documents.find((d) => d.id === docId);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [active, setActive] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [sample, setSample] = useState<SampleCase | null>(null);

  const facts = useMemo(
    () => stored.facts.filter((f) => f.documentId === docId).sort((a, b) => ORDER(a) - ORDER(b)),
    [stored.facts, docId],
  );
  const highlights: Highlight[] = facts
    .filter((f) => f.review !== "rejected")
    .map((f) => ({
      id: f.id,
      page: f.anchor.page,
      region: f.anchor.region,
      tone: f.id === active ? "active" : f.review === "unreviewed" && f.confidence < LOW_CONFIDENCE_THRESHOLD ? "low" : "normal",
    }));

  useEffect(() => {
    if (!stored.sample) return;
    let cancelled = false;
    getSample(stored.sample).then((loaded) => !cancelled && setSample(loaded), () => undefined);
    return () => {
      cancelled = true;
    };
  }, [stored.sample]);

  // Synthetic samples only: when image reading isn't configured, the viewer can enter what the sample image shows.
  const sampleFile = sample && document?.status === "extraction_failed" ? sample.files.find((f) => f.file === document.filename) : undefined;
  const sampleFill =
    sampleFile && document
      ? async () => {
          if (sampleFile.docClass && !document.docClass) await setDocumentClass(stored.id, document.id, sampleFile.docClass);
          for (const f of sample!.imageFacts.filter((x) => x.file === document.filename)) await addManualFact(stored.id, document, f.value);
        }
      : null;

  if (!document) {
    return (
      <p className="text-muted-foreground">
        No records to review yet. <Link href={`/case/${stored.id}/evidence`} className="underline">Add your records</Link>.
      </p>
    );
  }

  const unreviewedHere = facts.filter((f) => f.review === "unreviewed");
  const clearOnes = unreviewedHere.filter((f) => f.confidence >= LOW_CONFIDENCE_THRESHOLD).length;
  const activeFact = facts.find((f) => f.id === active);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Check what Takt read</h1>
        <p className="mt-1 text-muted-foreground">
          Each value is outlined where it appears in your file. Confirm it, fix it, or remove it. Nothing counts until you do.
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Documents">
        {documents.map((d) => {
          const open = stored.facts.filter((f) => f.documentId === d.id && f.review === "unreviewed").length;
          return (
            <button
              key={d.id}
              role="tab"
              aria-selected={d.id === docId}
              onClick={() => window.history.replaceState(null, "", `?doc=${d.id}`)}
              className={cn("shrink-0 rounded-full border px-3 py-1.5 text-sm", d.id === docId ? "border-foreground bg-foreground text-background" : "hover:bg-muted")}
            >
              {d.docClass ? DOC_CLASS_LABEL[d.docClass] : d.filename}
              {open > 0 && <span className="ml-1.5 rounded-full bg-state-ambiguous px-1.5 text-xs text-white">{open}</span>}
            </button>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-2 lg:sticky lg:top-20 lg:self-start">
          <SourceViewer caseId={stored.id} document={document} page={page} onPageCount={setPageCount} highlights={highlights} onSelect={setActive} />
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span className="truncate">{document.filename}</span>
            {pageCount > 1 && (
              <span className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  ‹
                </Button>
                Page {page} of {pageCount}
                <Button size="sm" variant="outline" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>
                  ›
                </Button>
              </span>
            )}
          </div>
          {activeFact && (
            <p className="rounded-md bg-muted p-2 text-sm">
              Source text: <span className="font-mono">&ldquo;{activeFact.anchor.quote}&rdquo;</span> · read by{" "}
              {activeFact.method === "pdf_native_text" ? "the PDF's own text" : activeFact.method === "vision_model" ? "an AI model" : "you"}
            </p>
          )}
        </div>

        <div className="space-y-3">
          {document.status === "extracting" && <p className="text-muted-foreground">Reading this file…</p>}
          {document.status === "extraction_failed" && (
            <div className="rounded-lg border border-state-insufficient/40 bg-state-insufficient/5 p-3 text-sm">
              <p>{document.extractionError}</p>
              {sampleFill && facts.length === 0 && !document.docClass && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={async () => {
                    await sampleFill();
                    toast.success("Entered the values this synthetic sample shows");
                  }}
                >
                  Enter what this sample image shows
                </Button>
              )}
            </div>
          )}
          {clearOnes > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
              <span>
                {clearOnes} clearly printed values in this file. {unreviewedHere.length - clearOnes > 0 && `${unreviewedHere.length - clearOnes} need a closer look.`}
              </span>
              <Button size="sm" variant="outline" onClick={() => confirmHighConfidence(stored.id, document.id)}>
                Confirm the clear ones
              </Button>
            </div>
          )}

          <ul className="space-y-2">
            {facts.map((fact) => {
              const value = fact.correctedValue ?? fact.extracted;
              const low = fact.confidence < LOW_CONFIDENCE_THRESHOLD;
              const note = stored.factNotes[fact.id];
              return (
                <li
                  key={fact.id}
                  onMouseEnter={() => setActive(fact.id)}
                  onFocus={() => setActive(fact.id)}
                  className={cn(
                    "rounded-lg border p-3",
                    fact.id === active && "border-amber-500",
                    fact.review === "rejected" && "opacity-60",
                    fact.review === "unreviewed" && low && "border-rose-400 bg-rose-50/60",
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">{KIND_LABEL[value.kind]}</p>
                      <p className={cn("font-medium", fact.review === "rejected" && "line-through")}>{describeFact(value)}</p>
                      {fact.review === "corrected" && <p className="text-xs text-muted-foreground">Takt read: {describeFact(fact.extracted)}</p>}
                      {fact.review === "unreviewed" && low && (
                        <p className="text-sm text-rose-700">Takt isn&apos;t sure about this one. Compare it with your file.</p>
                      )}
                      {note && <p className="text-xs text-muted-foreground">{note}</p>}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {fact.review === "unreviewed" ? `${Math.round(fact.confidence * 100)}% sure` : fact.review}
                    </span>
                  </div>
                  {editing === fact.id ? (
                    <div className="mt-2">
                      <FactEditor
                        kind={value.kind}
                        initial={value}
                        submitLabel="Save correction"
                        onCancel={() => setEditing(null)}
                        onSubmit={async (corrected) => {
                          await reviewFact(stored.id, fact.id, "confirmed", corrected);
                          setEditing(null);
                        }}
                      />
                    </div>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {fact.review === "unreviewed" ? (
                        <>
                          <Button size="sm" onClick={() => reviewFact(stored.id, fact.id, "confirmed")}>
                            Correct as shown
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditing(fact.id)}>
                            Fix it
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => reviewFact(stored.id, fact.id, "rejected")}>
                            Not in my file
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => reviewFact(stored.id, fact.id, "unreviewed")}>
                          Undo
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {adding ? (
            <FactEditor
              kind="time_in"
              allowKindChange
              submitLabel="Add"
              onCancel={() => setAdding(false)}
              onSubmit={async (value) => {
                await addManualFact(stored.id, document, value);
                setAdding(false);
              }}
            />
          ) : (
            <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
              Add something Takt missed
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <p className="text-sm text-muted-foreground">
          {analysis.reconciliation.unreviewedFactIds.length > 0
            ? `${analysis.reconciliation.unreviewedFactIds.length} facts across your files still need a decision.`
            : "Every fact has been reviewed."}
        </p>
        <Button size="lg" render={<Link href={`/case/${stored.id}/reconcile`} />}>
          Compare my records
        </Button>
      </div>
    </div>
  );
}

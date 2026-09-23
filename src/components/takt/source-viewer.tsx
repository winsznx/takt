"use client";
import { useEffect, useRef, useState } from "react";
import type { EvidenceDocument, Region } from "@/lib/domain/contracts";
import { readOriginal } from "@/lib/client/cases";
import { renderPdfPage } from "@/lib/client/render";
import { cn } from "@/lib/utils";

export interface Highlight {
  id: string;
  page: number;
  region: Region;
  tone: "active" | "normal" | "low";
}

/**
 * Shows the untouched original with anchor boxes drawn over it. The overlay
 * uses the same normalized coordinates stored in each fact, so what the worker
 * sees is exactly what the packet cites.
 */
export function SourceViewer({
  caseId,
  document,
  page,
  onPageCount,
  highlights,
  onSelect,
}: {
  caseId: string;
  document: EvidenceDocument;
  page: number;
  onPageCount?: (n: number) => void;
  highlights: Highlight[];
  onSelect?: (id: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isPdf = document.mimeType === "application/pdf";

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    (async () => {
      const bytes = await readOriginal(caseId, document.duplicateOf ?? document.id);
      if (cancelled) return;
      if (!bytes) {
        setError("The original file is no longer on this device.");
        return;
      }
      if (isPdf) {
        const width = container.current?.clientWidth ?? 600;
        const result = await renderPdfPage(bytes, page, canvas.current!, width);
        if (!cancelled) onPageCount?.(result.pageCount);
      } else {
        url = URL.createObjectURL(new Blob([bytes.slice()], { type: document.mimeType }));
        setImageUrl(url);
      }
    })().catch(() => !cancelled && setError("This file could not be displayed."));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [caseId, document, page, isPdf, onPageCount]);

  const visible = highlights.filter((h) => h.page === page && !(h.region.w >= 0.999 && h.region.h >= 0.999));
  return (
    <div ref={container} className="relative w-full overflow-hidden rounded-lg border bg-white">
      {error && <p className="p-6 text-sm text-muted-foreground">{error}</p>}
      {isPdf ? (
        <canvas ref={canvas} className="block w-full" aria-label={`Page ${page} of ${document.filename}`} />
      ) : (
        imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- local object URL of the worker's own file
          <img src={imageUrl} alt={document.filename} className="block w-full" />
        )
      )}
      {visible.map((h) => (
        <button
          key={h.id}
          type="button"
          aria-label="Show this fact"
          onClick={() => onSelect?.(h.id)}
          className={cn(
            "absolute rounded-sm ring-2 transition-colors",
            h.tone === "active" && "bg-amber-300/40 ring-amber-500",
            h.tone === "normal" && "bg-sky-300/15 ring-sky-500/50 hover:bg-sky-300/30",
            h.tone === "low" && "bg-rose-300/25 ring-rose-500/70",
          )}
          style={{
            left: `${h.region.x * 100}%`,
            top: `${h.region.y * 100}%`,
            width: `${Math.max(h.region.w * 100, 1.5)}%`,
            height: `${Math.max(h.region.h * 100, 1.2)}%`,
          }}
        />
      ))}
    </div>
  );
}

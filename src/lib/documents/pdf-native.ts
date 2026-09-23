import type { Region } from "@/lib/domain/contracts";

/**
 * Native PDF text with positions, via pdf.js. Coordinates are converted to the
 * contract's normalized, top-left-origin page space so an anchor can be drawn
 * over a rendered page at any zoom.
 */

export interface TextToken {
  str: string;
  page: number;
  region: Region;
}

export interface TextLine {
  page: number;
  text: string;
  tokens: TextToken[];
  region: Region;
}

export interface NativePdf {
  pageCount: number;
  lines: TextLine[];
  charCount: number;
}

interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

async function loadPdfJs() {
  if (typeof window === "undefined") return import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  }
  return pdfjs;
}

const clamp = (v: number) => Math.min(1, Math.max(0, v));

export function unionRegion(regions: Region[]): Region {
  const x1 = Math.min(...regions.map((r) => r.x));
  const y1 = Math.min(...regions.map((r) => r.y));
  const x2 = Math.max(...regions.map((r) => r.x + r.w));
  const y2 = Math.max(...regions.map((r) => r.y + r.h));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

export async function readNativePdf(bytes: Uint8Array, maxPages = 20): Promise<NativePdf> {
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 });
  const doc = await task.promise;
  try {
    const lines: TextLine[] = [];
    let charCount = 0;
    for (let pageNumber = 1; pageNumber <= Math.min(doc.numPages, maxPages); pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const tokens: TextToken[] = [];
      for (const raw of content.items as PdfTextItem[]) {
        if (typeof raw.str !== "string" || raw.str.trim() === "") continue;
        const [, , , , e, f] = raw.transform;
        const height = raw.height || Math.abs(raw.transform[3]) || 10;
        const [vx, vy] = viewport.convertToViewportPoint(e, f);
        const region = {
          x: clamp(vx / viewport.width),
          y: clamp((vy - height) / viewport.height),
          w: clamp(raw.width / viewport.width),
          h: clamp(height / viewport.height),
        };
        region.w = Math.min(region.w, 1 - region.x);
        region.h = Math.min(region.h, 1 - region.y);
        tokens.push({ str: raw.str, page: pageNumber, region });
        charCount += raw.str.length;
      }
      lines.push(...groupLines(tokens, pageNumber));
    }
    return { pageCount: doc.numPages, lines, charCount };
  } finally {
    await task.destroy();
  }
}

/** Groups tokens whose vertical centers are within half a line height into reading-order lines. */
function groupLines(tokens: TextToken[], page: number): TextLine[] {
  const sorted = [...tokens].sort((a, b) => a.region.y + a.region.h / 2 - (b.region.y + b.region.h / 2));
  const lines: TextToken[][] = [];
  for (const token of sorted) {
    const center = token.region.y + token.region.h / 2;
    const line = lines.find((l) => {
      const ref = l[0].region;
      return Math.abs(ref.y + ref.h / 2 - center) < Math.max(ref.h, token.region.h) / 2;
    });
    if (line) line.push(token);
    else lines.push([token]);
  }
  return lines.map((line) => {
    const ordered = line.sort((a, b) => a.region.x - b.region.x);
    return {
      page,
      text: ordered.map((t) => t.str.trim()).join(" "),
      tokens: ordered,
      region: unionRegion(ordered.map((t) => t.region)),
    };
  });
}

/** Smallest run of tokens in a line that together contain `needle`, for a tight anchor. */
export function locateInLine(line: TextLine, needle: string): { region: Region; quote: string } | null {
  const target = needle.replace(/\s+/g, "");
  const compact = line.tokens.map((t) => t.str.replace(/\s+/g, ""));
  for (let length = 1; length <= line.tokens.length; length++) {
    for (let i = 0; i + length <= line.tokens.length; i++) {
      if (!compact.slice(i, i + length).join("").includes(target)) continue;
      const span = line.tokens.slice(i, i + length);
      return { region: unionRegion(span.map((t) => t.region)), quote: span.map((t) => t.str.trim()).join(" ") };
    }
  }
  return null;
}

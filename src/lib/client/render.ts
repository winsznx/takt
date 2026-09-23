"use client";
import { loadPdfJs } from "@/lib/pdfjs";

/** Renders one PDF page onto a canvas at the given CSS width. Returns the page aspect ratio. */
export async function renderPdfPage(bytes: Uint8Array, pageNumber: number, canvas: HTMLCanvasElement, cssWidth: number) {
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 });
  try {
    const doc = await task.promise;
    const page = await doc.getPage(Math.min(pageNumber, doc.numPages));
    const base = page.getViewport({ scale: 1 });
    const ratio = window.devicePixelRatio || 1;
    const viewport = page.getViewport({ scale: (cssWidth / base.width) * ratio });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${(viewport.height / viewport.width) * cssWidth}px`;
    await page.render({ canvas, viewport }).promise;
    return { pageCount: doc.numPages, aspect: base.height / base.width };
  } finally {
    await task.destroy();
  }
}

/** PNG of a PDF page, for sending a scanned page to image extraction. */
export async function pdfPageToPng(bytes: Uint8Array, pageNumber: number): Promise<Blob> {
  const canvas = document.createElement("canvas");
  await renderPdfPage(bytes, pageNumber, canvas, 1400 / (window.devicePixelRatio || 1));
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("render failed"))), "image/png"));
}

/**
 * A smaller JPEG derivative for extraction when the original is too large to
 * send. The original stays untouched and is what the case hashes and keeps.
 * Normalized regions are resolution-independent, so anchors still line up.
 */
export async function downscaleImage(bytes: Uint8Array, maxBytes: number): Promise<Blob> {
  const bitmap = await createImageBitmap(new Blob([bytes.slice()]));
  for (const width of [2400, 1800, 1400, 1000]) {
    const scale = Math.min(1, width / bitmap.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.88));
    if (blob && blob.size <= maxBytes) return blob;
  }
  throw new Error("The image is too large to read even after resizing.");
}

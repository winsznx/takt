/** pdf.js for Node (tests, CLI) and the browser (worker served from /generated). */
export async function loadPdfJs() {
  if (typeof window === "undefined") return import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = "/generated/pdf.worker.min.mjs";
  return pdfjs;
}

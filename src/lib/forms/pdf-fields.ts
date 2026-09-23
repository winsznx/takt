/**
 * Reads AcroForm values with pdf.js, a different PDF implementation from the
 * pdf-lib writer. Used by golden tests and by Takt Verify so readback does not
 * trust the library that produced the file.
 *
 * Values come from widget annotations rather than `getFieldObjects()`, which
 * returns nothing for the official DLSE Form 1.
 */
import { loadPdfJs } from "@/lib/pdfjs";

export type PdfFieldValue = string | boolean | null;

interface WidgetAnnotation {
  subtype?: string;
  fieldName?: string;
  fieldType?: string;
  fieldValue?: unknown;
  buttonValue?: unknown;
  exportValue?: unknown;
  radioButton?: boolean;
  checkBox?: boolean;
  rect?: number[];
}

export interface PdfWidget {
  page: number;
  rect: [number, number, number, number];
}

export interface PdfFormReadback {
  fields: Record<string, PdfFieldValue>;
  widgets: Record<string, PdfWidget[]>;
  pageCount: number;
  /** Visible text per page; index 0 is page 1. */
  pageText: string[];
}


export async function readPdfForm(bytes: Uint8Array): Promise<PdfFormReadback> {
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 });
  const doc = await task.promise;
  try {
    const fields: Record<string, PdfFieldValue> = {};
    const widgets: Record<string, PdfWidget[]> = {};
    const pageText: string[] = [];

    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const annotations = (await page.getAnnotations()) as WidgetAnnotation[];
      for (const widget of annotations) {
        if (widget.subtype !== "Widget" || !widget.fieldName) continue;
        const name = widget.fieldName;
        const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = widget.rect ?? [];
        (widgets[name] ??= []).push({ page: pageNumber, rect: [x1, y1, x2, y2] });
        fields[name] = mergeValue(fields[name], widget);
      }
      const content = await page.getTextContent();
      pageText.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
    }
    return { fields, widgets, pageCount: doc.numPages, pageText };
  } finally {
    await task.destroy();
  }
}

function mergeValue(previous: PdfFieldValue | undefined, widget: WidgetAnnotation): PdfFieldValue {
  if (widget.checkBox) {
    const on = typeof widget.fieldValue === "string" && widget.fieldValue === widget.exportValue;
    return previous === true || on;
  }
  if (widget.radioButton) {
    if (typeof previous === "string") return previous;
    const selected = typeof widget.fieldValue === "string" && widget.fieldValue === widget.buttonValue;
    return selected ? (widget.fieldValue as string) : null;
  }
  if (widget.fieldType === "Sig") return previous ?? null;
  if (typeof widget.fieldValue === "string") return widget.fieldValue;
  return previous ?? (widget.fieldValue == null ? null : String(widget.fieldValue));
}

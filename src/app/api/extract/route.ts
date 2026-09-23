import { DocumentClass } from "@/lib/domain/contracts";
import { EXTRACTION_PROMPT_VERSION, EXTRACTION_SCHEMA_VERSION, toCandidates } from "@/lib/ai/extraction-schema";
import { EXTRACTION_MODEL, extractFromImage, MissingCredentialError } from "@/lib/ai/gemini";
import { sniffMime } from "@/lib/documents/ingest";

/**
 * Vision extraction for images and scanned pages. The request body is used
 * for one model call and discarded: nothing is written to disk, a database, or
 * logs. Only structured candidate facts come back.
 */
export const maxDuration = 60;
export const MAX_EXTRACTION_BYTES = 4 * 1024 * 1024;

const error = (status: number, code: string, message: string) => Response.json({ code, message }, { status });

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return error(400, "BAD_REQUEST", "Expected multipart form data with an image file.");
  }
  const file = form.get("file");
  if (!(file instanceof Blob)) return error(400, "BAD_REQUEST", "Missing image file.");
  if (file.size > MAX_EXTRACTION_BYTES) return error(413, "TOO_LARGE", "Images sent for extraction must be under 4 MB.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mimeType = sniffMime(bytes);
  if (mimeType !== "image/png" && mimeType !== "image/jpeg") {
    return error(415, "UNSUPPORTED_TYPE", "Only PNG and JPEG images are sent for extraction.");
  }
  const hintValue = form.get("hint");
  const hint = typeof hintValue === "string" && hintValue ? DocumentClass.safeParse(hintValue).data ?? null : null;

  try {
    const raw = await extractFromImage({ mimeType, base64: Buffer.from(bytes).toString("base64") }, hint);
    const docClass = DocumentClass.safeParse(raw.document_class);
    const { candidates, rejected } = toCandidates(raw);
    return Response.json(
      {
        docClass: docClass.success ? docClass.data : "other",
        classConfidence: Math.max(0, Math.min(1, Number(raw.class_confidence) || 0)),
        embeddedInstructionsDetected: Boolean(raw.embedded_instructions_detected),
        candidates,
        rejected,
        model: EXTRACTION_MODEL,
        promptVersion: EXTRACTION_PROMPT_VERSION,
        schemaVersion: EXTRACTION_SCHEMA_VERSION,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (cause) {
    if (cause instanceof MissingCredentialError) {
      return error(503, "EXTRACTION_UNAVAILABLE", "Image reading is not configured on this deployment. You can enter the facts yourself.");
    }
    const kind = cause instanceof SyntaxError ? "the model returned malformed JSON" : "the model request failed";
    console.error(`extract: ${kind}`);
    return error(502, "EXTRACTION_FAILED", "Takt could not read this image. You can try again or enter the facts yourself.");
  }
}

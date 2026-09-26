import { DocumentClass } from "@/lib/domain/contracts";
import { ApiError } from "@google/genai";
import { DATED_AROUND, EXTRACTION_PROMPT_VERSION, EXTRACTION_SCHEMA_VERSION, toCandidates } from "@/lib/ai/extraction-schema";
import { EXTRACTION_MODEL, extractFromImage, MissingCredentialError } from "@/lib/ai/gemini";
import { aiMode, isSyntheticFixture } from "@/lib/ai/mode";
import { sniffMime } from "@/lib/documents/ingest";
import { sha256Hex } from "@/lib/hash";

/**
 * Vision extraction for images and scanned pages. In synthetic-only mode
 * (the default) the image is hashed first and anything that is not a committed
 * synthetic fixture is refused without a model call. The request body is used
 * for one model call and discarded: nothing is written to disk, a database, or
 * logs. Only structured candidate facts come back.
 */
export const maxDuration = 180;
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
  if (aiMode() === "synthetic-only" && !isSyntheticFixture(await sha256Hex(bytes))) {
    return error(
      403,
      "REAL_RECORDS_NOT_SENT",
      "This public demo only sends Takt's synthetic sample images to the AI service. Your image was not sent. Type in what it shows instead.",
    );
  }
  const hintValue = form.get("hint");
  const hint = typeof hintValue === "string" && hintValue ? DocumentClass.safeParse(hintValue).data ?? null : null;
  const datedValue = form.get("datedAround");
  const datedAround = typeof datedValue === "string" && DATED_AROUND.test(datedValue) ? datedValue : null;

  try {
    const raw = await extractFromImage({ mimeType, base64: Buffer.from(bytes).toString("base64") }, hint, datedAround);
    const docClass = DocumentClass.safeParse(raw.document_class);
    const { candidates, rejected } = toCandidates(raw, datedAround);
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
    if (cause instanceof ApiError && cause.status === 429) {
      return error(429, "QUOTA_EXHAUSTED", "Takt's free image-reading allowance is used up for now. Type in what this document shows, or try again later.");
    }
    if (cause instanceof ApiError && cause.status >= 500) {
      return error(503, "PROVIDER_BUSY", "The image-reading service is busy right now. Try again in a few minutes, or type in what this document shows.");
    }
    const kind = cause instanceof SyntaxError ? "the model returned malformed JSON" : "the model request failed";
    console.error(`extract: ${kind}`);
    return error(502, "EXTRACTION_FAILED", "Takt could not read this image. You can try again or enter the facts yourself.");
  }
}

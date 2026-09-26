import { EXTRACTION_MODEL, extractionAvailable } from "@/lib/ai/gemini";
import { aiMode } from "@/lib/ai/mode";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { imageExtraction: extractionAvailable(), mode: aiMode(), model: EXTRACTION_MODEL },
    { headers: { "Cache-Control": "no-store" } },
  );
}

import { EXTRACTION_MODEL, extractionAvailable } from "@/lib/ai/gemini";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { imageExtraction: extractionAvailable(), model: EXTRACTION_MODEL },
    { headers: { "Cache-Control": "no-store" } },
  );
}

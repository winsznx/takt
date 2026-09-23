import "server-only";
import { GoogleGenAI } from "@google/genai";
import { withRetry } from "@/lib/ai/retry";
import type { DocumentClass } from "@/lib/domain/contracts";
import {
  EXTRACTION_JSON_SCHEMA,
  SYSTEM_INSTRUCTION,
  userPrompt,
  type RawExtraction,
} from "@/lib/ai/extraction-schema";

export const EXTRACTION_MODEL = process.env.TAKT_EXTRACTION_MODEL ?? "gemini-3.8-flash";

export class MissingCredentialError extends Error {
  constructor() {
    super("BLOCKED_ON_HUMAN_CREDENTIAL: GEMINI_API_KEY");
  }
}

let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new MissingCredentialError();
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

export { withRetry };

export const extractionAvailable = () => Boolean(process.env.GEMINI_API_KEY);

/** Sends one image to the model and returns its raw JSON. The caller validates it. */
export async function extractFromImage(
  image: { mimeType: "image/png" | "image/jpeg"; base64: string },
  hint: DocumentClass | null,
  datedAround: string | null = null,
): Promise<RawExtraction> {
  const response = await withRetry(() =>
    getClient().models.generateContent({
      model: EXTRACTION_MODEL,
      contents: [
        {
          role: "user",
          parts: [{ inlineData: { mimeType: image.mimeType, data: image.base64 } }, { text: userPrompt(hint, datedAround) }],
        },
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseJsonSchema: EXTRACTION_JSON_SCHEMA,
        temperature: 0,
      },
    }),
  );
  const text = response.text;
  if (!text) throw new Error("The model returned no content.");
  return JSON.parse(text) as RawExtraction;
}

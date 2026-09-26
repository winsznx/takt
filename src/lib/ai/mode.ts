import allowlist from "@/lib/ai/synthetic-allowlist.json";

/**
 * Which images this deployment may send to the model.
 *
 * - `synthetic-only` (default): only the committed synthetic fixture images,
 *   matched by SHA-256. Real records are refused before any model call. Used
 *   whenever the provider tier may retain or train on submitted content.
 * - `full`: any image the worker chooses to send. Only for a provider tier
 *   whose terms fit personal employment records.
 */
export type AiMode = "synthetic-only" | "full";

export const aiMode = (): AiMode => (process.env.TAKT_AI_MODE === "full" ? "full" : "synthetic-only");

const SYNTHETIC = new Set<string>(allowlist);
export const isSyntheticFixture = (sha256: string) => SYNTHETIC.has(sha256);

import { ApiError } from "@google/genai";

const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const RETRY_DELAYS_MS = [1_000, 3_000, 7_000];

/** Retries transient provider errors on the same model. Never switches models. */
export async function withRetry<T>(call: () => Promise<T>, delays = RETRY_DELAYS_MS): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await call();
    } catch (error) {
      const retryable = error instanceof ApiError && RETRYABLE.has(error.status);
      if (!retryable || attempt >= delays.length) throw error;
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    }
  }
}

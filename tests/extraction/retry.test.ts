import { ApiError } from "@google/genai";
import { describe, expect, it, vi } from "vitest";
import { withRetry } from "@/lib/ai/retry";

const busy = () => new ApiError({ message: "high demand", status: 503 });

describe("provider retry", () => {
  it("retries transient errors and returns the eventual result", async () => {
    const call = vi.fn().mockRejectedValueOnce(busy()).mockRejectedValueOnce(busy()).mockResolvedValue("ok");
    await expect(withRetry(call, [0, 0, 0])).resolves.toBe("ok");
    expect(call).toHaveBeenCalledTimes(3);
  });

  it("gives up after the last delay", async () => {
    const call = vi.fn().mockRejectedValue(busy());
    await expect(withRetry(call, [0, 0])).rejects.toBeInstanceOf(ApiError);
    expect(call).toHaveBeenCalledTimes(3);
  });

  it("does not retry client errors", async () => {
    const call = vi.fn().mockRejectedValue(new ApiError({ message: "bad key", status: 400 }));
    await expect(withRetry(call, [0, 0])).rejects.toBeInstanceOf(ApiError);
    expect(call).toHaveBeenCalledTimes(1);
  });
});

"use client";
import { useEffect, useState } from "react";

export interface AiStatus {
  imageExtraction: boolean;
  mode: "synthetic-only" | "full";
  model: string;
}

let cached: Promise<AiStatus | null> | null = null;
const load = () =>
  (cached ??= fetch("/api/status", { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<AiStatus>) : null))
    .catch(() => null));

/** What this deployment's server says about image reading. */
export function useAiStatus(): AiStatus | null {
  const [status, setStatus] = useState<AiStatus | null>(null);
  useEffect(() => {
    let live = true;
    load().then((s) => live && setStatus(s));
    return () => {
      live = false;
    };
  }, []);
  return status;
}

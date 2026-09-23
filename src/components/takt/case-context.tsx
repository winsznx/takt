"use client";
import { useLiveQuery } from "dexie-react-hooks";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { db, type StoredCase } from "@/lib/client/db";
import { analyzeCase, type CaseAnalysis } from "@/lib/domain/analyze";

interface CaseContextValue {
  stored: StoredCase;
  analysis: CaseAnalysis;
}

const CaseContext = createContext<CaseContextValue | null>(null);

export function CaseProvider({ id, children, fallback }: { id: string; children: ReactNode; fallback: (state: "loading" | "missing") => ReactNode }) {
  const stored = useLiveQuery(() => db.cases.get(id).then((c) => c ?? null), [id]);
  const analysis = useMemo(
    () =>
      stored
        ? analyzeCase({ documents: stored.documents, facts: stored.facts, confirmations: stored.confirmations, scopeAnswers: stored.scopeAnswers })
        : null,
    [stored],
  );
  if (stored === undefined) return fallback("loading");
  if (stored === null || !analysis) return fallback("missing");
  return <CaseContext.Provider value={{ stored, analysis }}>{children}</CaseContext.Provider>;
}

export function useCase(): CaseContextValue {
  const value = useContext(CaseContext);
  if (!value) throw new Error("useCase must be used inside CaseProvider");
  return value;
}

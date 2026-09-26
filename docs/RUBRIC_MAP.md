# Rubric map

Where to check each claim.

| Area | Claim | Where to check |
|---|---|---|
| Real-world impact | The claim process asks workers to reconstruct hours from their records | [IMPACT_EVIDENCE.md](IMPACT_EVIDENCE.md), pinned official pages in `legal/ca-dlse/instructions/` |
| | Output matches the real filing workflow | official Form 1 and Form 55 inside `evidence/canonical/takt-demo.zip`; README "Official forms" |
| | Usable without accounts or infrastructure | live app, local-first storage |
| Technical execution | Records become source-anchored facts | Review screen; `src/lib/extraction`; `tests/extraction` |
| | Reconciliation and calculation are deterministic | `src/lib/domain/reconcile.ts`, `src/lib/calc`; property tests; reproducible packet test |
| | Packets are independently verifiable and tamper-evident | `/verify`, `npm run verify:packet`, `tests/packet/tamper.test.ts`, `/proof` |
| User experience | A non-lawyer can complete the flow on a phone | `e2e/canonical.spec.ts` (Pixel 7 and desktop), run against production |
| | Uncertainty is visible | low-confidence highlights, "Needs your answer" days, refusal screens for TAKT-AMBIG-001 and TAKT-UNSUPPORTED-001 |
| | Accessible | `e2e/a11y.spec.ts` (axe-core, WCAG 2.1 AA rules) |
| Originality | Reconciles independent records rather than judging one pay stub | Compare screen (Takt Line and Takt Diff) |
| | Every finding traces to a source location | source chips, evidence index, manifest anchors |
| Presentation | Complete, reproducible story | [README](../README.md), [SUBMISSION.md](SUBMISSION.md), [DEMO_SCRIPT.md](DEMO_SCRIPT.md), `/proof` |

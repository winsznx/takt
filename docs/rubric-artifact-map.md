# Rubric to artifact map

| Category | Claim | Where to check it |
|---|---|---|
| Real-world impact and feasibility | Workers hold fragmented time and pay records; the Labor Commissioner asks for them | `legal/ca-dlse/instructions/how-to-file-wage-claim.html` (pinned official page), homepage |
| | The output matches the real filing workflow | official Form 1 and Form 55 filled in `evidence/canonical/takt-demo.zip`; `legal/ca-dlse/form-1/FIELD_MAP.md`, `form-55/CELL_MAP.md` |
| | Deployable without accounts or infrastructure | live app, local-first storage, no database |
| Technical execution | Heterogeneous records become anchored facts | Review screen; `src/lib/extraction`; `tests/extraction` |
| | Reconciliation and calculation are deterministic | `src/lib/domain/reconcile.ts`, `src/lib/calc`; property tests; byte-identical packet test |
| | Packets are independently verifiable and tamper-evident | `/verify`, `npm run verify:packet`, `tests/packet/tamper.test.ts`, `/proof` |
| User experience | A non-lawyer completes the flow on a phone | Playwright Pixel 7 path against production (`e2e/canonical.spec.ts`) |
| | Uncertainty is visible, not hidden | low-confidence highlights, "Needs your answer" days, refusal screens for TAKT-AMBIG-001 and TAKT-UNSUPPORTED-001 |
| Innovation and originality | Reconciles independent records instead of judging one pay stub | Compare screen (Takt Line and Takt Diff) |
| | Every finding traces to a source location | source chips, evidence index, manifest anchors |
| Presentation and documentation | Complete, reproducible story | `README.md`, `SUBMISSION.md`, `docs/`, `/proof`, `docs/demo-script.md` |

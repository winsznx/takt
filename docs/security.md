# Security and privacy

| Threat | Mitigation | Evidence |
|---|---|---|
| PII leaves the device | Originals and cases stay in IndexedDB. Only images for extraction reach the server, and they are forwarded to Gemini, not stored | `tests/privacy/privacy.test.ts` |
| Raw text in logs | The extract route logs only an error category | privacy test scans server code |
| Analytics or session replay | None installed | privacy test checks dependencies and sources |
| Key exposure | `GEMINI_API_KEY` is read only in `server-only` modules, and no `NEXT_PUBLIC_` key exists | privacy test |
| Prompt injection in documents | Native PDF extraction uses no model. The vision prompt treats all image text as data and flags embedded instructions. Output is schema-validated and quote-checked | `tests/extraction/*` |
| Malicious or mislabeled files | Type decided by magic bytes, 15 MB limit, pdf.js without eval, no macro-capable formats accepted | intake tests |
| Model hallucination | Every fact needs a box and verbatim quote. Values missing from their own quote get confidence ≤ 0.4. Worker review is required | vision validation tests |
| Wrong arithmetic | Deterministic calculator, property tests, and a separate fraction implementation in the verifier | `tests/calc`, `tests/packet` |
| Packet tampering | SHA-256 per file, canonical manifest, full replay, form readback | `tests/packet/tamper.test.ts` (11 mutations) |
| Wrong form revision | Templates are hash-checked before every fill. `npm run pin:legal:check` detects upstream changes | `tests/forms/*` |
| Clickjacking and leakage | `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `nosniff` | `next.config.ts` |

Report a problem by opening an issue. Do not include real personal records.

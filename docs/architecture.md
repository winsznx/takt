# Architecture

```
original file ──sha256──► Intake ──► native PDF text (pdf.js, on device)
                                  └► image / scan ──► /api/extract ──► Gemini (candidate facts + boxes)
candidate facts ──► Review (worker confirms / corrects / rejects) ──► authoritative facts
authoritative facts + worker hours + scope answers
      └► reconcile()  per day: CONSISTENT | DISCREPANCY_DETECTED | INSUFFICIENT_EVIDENCE | AMBIGUOUS | UNSUPPORTED_RULE
      └► calculatePeriod()  CALCULATED | CALCULATION_BLOCKED
      └► buildPacket()  Form 1, Form 55, evidence-index.pdf, calculation.csv, manifest.json
packet.zip ──► verifyPacket()  VERIFIED_PACKET | VERIFICATION_FAILED | UNVERIFIABLE_PACKET
```

## Principles in code

- **One contract.** `src/lib/domain/contracts.ts` defines every value that can
  reach a calculation. Model output is parsed into it or dropped.
- **Provenance on every fact.** A fact carries document hash, page, normalized
  region, verbatim quote, and extraction method. Corrections sit beside the
  extracted value and never replace it.
- **Review gate.** `authoritativeValue()` returns nothing for an unreviewed or
  rejected fact. The packet builder refuses to run while consequential facts
  are unreviewed, and the verifier fails packets that contain them.
- **No floating-point money.** Minutes are integers. Money is a bigint
  rational, rounded to the cent once per pay period and pay type.
- **No timezone parsing.** Dates and clock times are strings. Daylight saving
  is applied explicitly, and readings inside a skipped or repeated hour are
  reported as ambiguous.
- **Official forms, not look-alikes.** Form 1 is filled through its AcroForm
  fields and read back with a different PDF library. Form 55 is patched record
  by record inside the original BIFF8 stream, so the official formatting
  survives. Tests diff every non-cell record against the pinned file.
- **Deterministic packets.** The same inputs produce byte-identical ZIPs.

## Verifier independence

The verifier takes only packet bytes. It re-hashes files, re-validates the
manifest schema and canonical form, checks rules against the pinned ruleset,
replays reconciliation with the shared engine, recomputes all money with a
separate fraction implementation, compares `calculation.csv`, and reads Form 1
with pdf.js and Form 55 with SheetJS. It cannot tell whether the facts are
true. That requires comparing the original files, which it does when they are
provided.

## Storage

The app has no database. Cases and original files live in the browser's
IndexedDB (Dexie). The only server code is `/api/extract`, which forwards one
image to Gemini and returns candidate facts, plus `/api/status`.

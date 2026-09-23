# Takt

Takt lines up a worker's schedule, the employer's time record, pay stubs, and
manager messages day by day, shows exactly where they disagree, and exports a
California wage-claim packet that anyone can re-verify.

**Live:** https://takt-beige.vercel.app · **Proof:** https://takt-beige.vercel.app/proof

![Takt Diff: schedule, manager text, and worker say 7:40 AM; the employer clock says 8:00 AM](docs/screenshots/diff-desktop.png)

## What it does

1. **Takt Intake.** Add PDFs, photos, or screenshots. Each original is SHA-256
   fingerprinted before anything reads it and stays in the browser.
2. **Takt Review.** Digital PDFs are read on-device from their own text layer.
   Photos and scans go to Gemini for candidate facts. Every value is outlined
   where it appears in the original, and nothing counts until the worker
   confirms, fixes, or rejects it.
3. **Takt Line and Diff.** Each day aligns the schedule, the employer clock,
   messages, and the worker's own account. A schedule alone never counts as
   work. An earlier start counts only when the worker confirms it and an
   independent record supports it.
4. **Takt Calc.** California regular, daily overtime, double time, weekly, and
   seventh-day rules in plain TypeScript, with integer minutes and exact
   rational money. No model does arithmetic.
5. **Takt Packet.** Fills the official DLSE Form 1 (REV. 07/2025) and, for
   irregular schedules, the official DLSE Form 55 workbook. It also writes an
   evidence index, `calculation.csv`, and a canonical `manifest.json`.
6. **Takt Verify.** Re-hashes every file, replays the reconciliation and
   calculation from the manifest's inputs, re-does the money arithmetic with
   separate code, and reads both forms back. It runs in the browser or from
   the CLI.

When records conflict, evidence is missing, or the job falls outside the
supported rules, Takt says so and does not produce an amount.

## Try it

Open **My cases → Sample cases** in the live app. The samples are synthetic
cases that run through the same code as real uploads:

| Case | What it tests | Result |
|---|---|---|
| TAKT-DEMO-001 | Schedule and a manager text say 7:40, the clock says 8:00 | 20 min, $9.25, packet verified |
| TAKT-CONTROL-001 | All records agree | no discrepancy, no claim |
| TAKT-AMBIG-001 | Two timecard exports disagree, one early start is unsupported | calculation refused |
| TAKT-UNSUPPORTED-001 | Piece-rate pay | amount refused, with reasons |

## Run it

```bash
npm ci
npm run dev                  # http://localhost:3000
npm test                     # unit, property, packet, tamper, privacy tests
npm run test:e2e             # Playwright, mobile + desktop (after npm run build)
npx tsx scripts/canonical-run.ts
npm run verify:packet -- evidence/canonical/takt-demo.zip
npx tsx scripts/proof-campaign.ts
npm run pin:legal:check      # compare pinned forms with dir.ca.gov
```

Photo and scan reading needs `GEMINI_API_KEY` in `.env.local` (see
`.env.example`). Without it, those files can be entered by hand, and
everything else works.

## Repository

| Path | Contents |
|---|---|
| `src/lib/domain` | contract (Zod), civil time, reconciliation, case analysis |
| `src/lib/calc` | exact rationals and California overtime calculation |
| `src/lib/forms` | Form 1 (pdf-lib, read back with pdf.js), Form 55 (in-place BIFF8 patch) |
| `src/lib/extraction`, `src/lib/ai` | native PDF extraction, vision schema and validation |
| `src/lib/packet` | packet builder, evidence index, CSV, verifier |
| `legal/ca-dlse` | pinned official forms and guidance, with hashes and field maps |
| `fixtures` | synthetic evidence and hand-labeled ground truth |
| `evidence` | canonical run receipt and campaign results |
| `docs` | architecture, security, evidence policy |

More detail: [docs/architecture.md](docs/architecture.md),
[docs/security.md](docs/security.md),
[docs/evidence-policy.md](docs/evidence-policy.md),
[THIRD_PARTY.md](THIRD_PARTY.md).

## Limits

California hourly, non-exempt work under standard overtime rules only. No meal
or rest premiums, penalties, piece rate, commission, union contracts,
alternative workweeks, or special industries. Takt is not legal advice and
files nothing. The full list is at https://takt-beige.vercel.app/limitations.

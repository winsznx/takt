# Takt: find where your hours changed

**Tagline:** Takt lines up your schedule, timecard, pay stubs, and your manager's
messages, shows exactly where they disagree, and builds a California wage-claim
packet anyone can re-check.

**Live:** https://takt-beige.vercel.app · **Code:** https://github.com/winsznx/takt · **Proof:** https://takt-beige.vercel.app/proof

## Problem

Hourly workers often have the evidence of unpaid time already. It's spread
across a scheduling app screenshot, a timecard export, a pay stub, and a text
asking them to come in early. No single record shows the problem. The problem
only appears where the records disagree. Turning that into a wage claim means
lining up dates by hand, doing overtime arithmetic, and retyping everything
into the Labor Commissioner's forms. The Labor Commissioner asks claimants for
time records and pay stubs, and Form 55 for irregular hours.

## Solution

Takt is a work-record reconciliation tool, not an AI lawyer.

1. The worker adds the records they already have. Each file is fingerprinted
   (SHA-256) and stays in their browser.
2. Takt reads each record. Digital PDFs are read on the device from their own
   text. Photos and scans go to an AI model that must return a box and the
   exact quoted text for every value.
3. The worker checks each value against its highlighted location in the
   original. Nothing counts until they confirm or correct it.
4. Takt aligns every day: schedule, employer clock, messages, and the worker's
   own account. It counts extra time only when the worker confirms it and an
   independent record supports it. A schedule alone never counts as work.
5. Plain TypeScript computes California regular, daily, weekly, and
   seventh-day overtime with integer minutes and exact fractions. No model does
   arithmetic.
6. Takt fills the official DLSE Form 1 (REV. 07/2025) and Form 55 and exports
   an evidence index, a calculation CSV, and a manifest. A verifier re-hashes,
   replays, and recomputes the packet from its bytes and rejects any tampering.

When records conflict, evidence is missing, or the job has special rules, Takt
says so and gives no amount.

## How it works (technical)

Next.js App Router, TypeScript, Zod contract, Dexie (IndexedDB), pdf.js for
native text coordinates and form readback, pdf-lib for the AcroForm, an
in-place BIFF8 patcher for the legacy `.xls` Form 55, fflate for the ZIP, and
Gemini `gemini-3.8-flash` for image extraction through one stateless server
route. See [docs/architecture.md](docs/architecture.md).

## Results (synthetic fixtures, reproducible)

From `evidence/campaign/results.json` (run `npx tsx scripts/proof-campaign.ts`):

| Measure | Result |
|---|---|
| Case outcomes correct (verified / refused / blocked as expected) | 4 / 4 |
| Day decisions correct | 40 / 40 |
| Discrepancy sets exactly right | 4 / 4 |
| Amounts exactly right | 4 / 4 |
| False discrepancies on the healthy control | 0 |
| Tampered packets rejected by the verifier | 10 / 10 |

These are four synthetic cases written alongside Takt. They show correct and
safe behaviour on those records. They are not a real-world accuracy estimate or
user results.

## Supported scope and limitations

California, hourly non-exempt work, standard overtime rules. It does not cover
meal or rest premiums, penalties, piece rate or commission, union contracts,
alternative workweeks, or special industries. It is not legal advice and files
nothing. Full list: https://takt-beige.vercel.app/limitations

## Technology and AI disclosure

See [THIRD_PARTY.md](THIRD_PARTY.md). At runtime, Gemini only proposes candidate
facts from images. It never decides discrepancies, computes money, or verifies
packets. The code was written with AI coding assistance.

## Try it in two minutes

Open https://takt-beige.vercel.app/cases → **TAKT-DEMO-001 → Open this sample**
→ Review → Compare → Build my packet. Then drop the downloaded ZIP on
https://takt-beige.vercel.app/verify.

# Takt submission copy

Paste-ready fields. Numbers here come from committed evidence files; nothing is
estimated.

## Product name

Takt

## Tagline

Find where your hours changed: line up your schedule, timecard, pay stubs, and messages, and see exactly where they disagree.

## Short description

Takt reconstructs worked time from a worker's own records. It lines up the schedule, the employer's time record, pay stubs, and manager messages day by day, shows where they disagree with the exact source of every value, computes the supported difference in plain code, and fills the official California wage-claim forms in a packet anyone can re-verify.

## Problem

A worker who thinks their hours were cut usually has pieces of the truth in different places: a schedule screenshot, a timecard export, a pay stub, a text asking them to come in early. No single record shows the problem. It only shows where the records disagree. California's Labor Commissioner asks claimants to track their start and end times and bring their pay stubs, and asks workers with irregular hours to total hours and pay per pay period on a second form (Form 55). Doing that by hand means lining up dates, doing overtime arithmetic, and retyping everything into government forms. Claims also take a long time: the California State Auditor found a median of 854 days to a decision in 2024, so the worker's own organized evidence matters.

## Solution

Takt is a reconciliation tool, not an AI lawyer.

1. The worker adds the records they have. Each file is fingerprinted and stays in their browser.
2. Takt reads them. Digital PDFs are read on the device from their own text. Every value is outlined where it appears in the original file.
3. The worker confirms, fixes, or rejects each value. Nothing counts until they do.
4. Takt lines up each day: schedule, employer clock, messages, and the worker's own account. Extra time counts only when the worker confirms it and an independent record supports it. A schedule alone never counts.
5. Code computes California regular, daily, weekly, and seventh-day overtime exactly.
6. Takt fills the official DLSE Form 1 and Form 55 and exports an evidence index, a calculation file, and a fingerprinted manifest. A verifier re-hashes, replays, and recomputes the packet and rejects tampering.

When records conflict, evidence is missing, or the job has special rules, Takt stops and says why instead of inventing an amount.

## How it works

Intake (SHA-256 before anything reads the file) → native PDF text extraction with exact coordinates, or AI reading for images with a required box and quote → worker review against highlighted sources → day-by-day reconciliation with decision states (Matches, Records disagree, Not enough evidence, Needs your answer, Outside Takt's rules) → deterministic calculation with versioned rule IDs → official Form 1 (AcroForm, read back with a second PDF library) and Form 55 (the original .xls patched record by record) → packet with manifest → independent verification in the browser or CLI.

## Why it is different

Most tools judge a single pay stub. Takt reconciles independent records against each other and shows the evidence behind every finding. Every number traces to a source location, a worker confirmation, and a published rule. The packet can be re-checked by anyone without trusting Takt: changing one number, one file, or one form field makes verification fail.

## Technical implementation

Next.js App Router with TypeScript. One Zod contract for every value that reaches a calculation. Dates and times are strings, so timezone parsing can't move a shift. Money is exact bigint fractions, rounded once. Reconciliation and calculation are pure functions, covered by unit and property tests. Form 1 is filled through its AcroForm and read back with pdf.js. Form 55 is patched inside the official BIFF8 workbook so its formatting survives. The packet is byte-for-byte reproducible. The verifier replays the pipeline from the manifest and re-does the arithmetic with separate code. Cases live in IndexedDB, and the only server route forwards images to the model.

## AI usage

Gemini (`gemini-3.8-flash`) reads images and proposes candidate facts, each with a bounding box and the exact quoted text. Takt validates every candidate, lowers confidence when the quote doesn't contain the value or a date is far from the case, and requires worker review. AI never decides a discrepancy, computes money, fills a form, or verifies a packet. The code was written with AI coding assistance (Claude).

## Privacy

Cases and files stay in the worker's browser, with no accounts, database, or analytics. This public deployment uses Google's unpaid Gemini API, whose terms allow Google to use submitted content and say not to submit personal information. So the server only forwards Takt's own synthetic sample images to the model. It checks each image's fingerprint against a committed allowlist and refuses real records before any model call. Workers type in what their photos show; PDFs with real text are read on the device.

## Supported scope

California hourly, non-exempt work under standard daily, weekly, and seventh-day overtime rules. Schedules, time records, pay stubs, and manager messages. DLSE Form 1 (REV. 07/2025) and Form 55.

## Limitations

No meal or rest premiums, penalties, piece rate, commission, union contracts, alternative workweeks, or special industries (the app refuses these with reasons). Not legal advice. It files nothing. Verification proves internal consistency, not truth. All test cases are synthetic, and Takt has not been tested with real workers. The comparison against a general-purpose AI model did not complete (provider "high demand" errors), so no comparison is claimed.

## Proof

- Canonical case TAKT-DEMO-001 (synthetic): the schedule and a manager's text put the Sep 1 start at 7:40 AM, and the employer's time record says 8:00 AM. The worker confirms 7:40, and Takt finds a 20-minute discrepancy. The packet verifies (see `evidence/canonical/run.json` for the packet hash and every check).
- Four synthetic cases, expected vs. observed (`evidence/campaign/results.json`): outcomes 4/4, day decisions 40/40, discrepancy sets 4/4, amounts 4/4, and 0 false discrepancies on the matching control. The ambiguous case abstains and the piece-rate case is refused.
- Tampered packets rejected: 10/10.

## Tech stack

Next.js, React, TypeScript, Tailwind CSS, shadcn/ui, Lucide, Zod, Dexie (IndexedDB), pdf.js, pdf-lib, SheetJS, cfb, fflate, Google Gemini API (`@google/genai`), Vitest, fast-check, Playwright, axe-core, Vercel.

## Third-party credits

Official DLSE Form 1, Form 55, and guidance: California Department of Industrial Relations (dir.ca.gov), pinned with SHA-256 in `legal/ca-dlse`. Fonts: Inter, Noto Sans (SIL OFL 1.1). Research cited: NELP/UIC/UCLA *Broken Laws, Unprotected Workers* (2009); California State Auditor Report 2023-104 (2024).

## Live URL

https://takt-beige.vercel.app

## Repository URL

https://github.com/winsznx/takt

## Demo video

[USER WILL INSERT]

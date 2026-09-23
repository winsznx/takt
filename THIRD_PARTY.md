# Third-party software, data, and AI use

## Official sources (public records, pinned with SHA-256)
- DLSE WCA Form 1 (REV. 07/2025) and DLSE Form 55 from https://www.dir.ca.gov/dlse/dlse-forms.htm
- Labor Commissioner filing, overtime, and minimum wage guidance from https://www.dir.ca.gov/dlse/
See `legal/ca-dlse/**/metadata.json` for URLs, retrieval dates, and hashes.

## Libraries
Next.js, React, TypeScript, Tailwind CSS, shadcn/ui (Base UI), Zod, Dexie,
pdf.js (`pdfjs-dist`), pdf-lib, `@pdf-lib/fontkit`, SheetJS (`xlsx` 0.20.3),
`cfb`, fflate, `@google/genai`, sonner. Tests: Vitest, fast-check, Playwright.
Exact versions are in `package-lock.json`.

## Font
Noto Sans, SIL Open Font License 1.1 (`assets/fonts/OFL.txt`).

## AI
- Runtime: Google Gemini (`gemini-3.8-flash`) reads photos and scanned pages
  when `GEMINI_API_KEY` is set. It proposes candidate facts with a location in
  the image. It never computes amounts, decides discrepancies, or verifies packets.
- Development: this codebase was written with AI coding assistance (Claude).

## Fixtures
Every person, business, address, and record under `fixtures/` is invented for
testing and marked "SYNTHETIC TEST DOCUMENT".

/**
 * Renders the synthetic fixture cases into real PDF and PNG evidence files.
 *
 *   npx tsx scripts/fixtures/render.ts
 *
 * Output: fixtures/<CASE>/documents/*, fixtures/<CASE>/truth.json,
 * fixtures/<CASE>/manifest.json (SHA-256 of every rendered document).
 */
import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser } from "@playwright/test";
import { FIXTURE_CASES, type FixtureDocument } from "./cases";
import { messagesHtml, paystubHtml, scheduleAppHtml, timecardHtml } from "./templates";

const ROOT = path.resolve(import.meta.dirname, "..", "..", "fixtures");

async function renderDocument(browser: Browser, document: FixtureDocument): Promise<Uint8Array> {
  const isPhone = document.template === "schedule-app" || document.template === "messages";
  const page = await browser.newPage(
    isPhone ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 } : { viewport: { width: 816, height: 1056 } },
  );
  try {
    const data = document.data as never;
    const html =
      document.template === "timecard"
        ? timecardHtml(data)
        : document.template === "paystub"
          ? paystubHtml(data)
          : document.template === "schedule-app"
            ? scheduleAppHtml(data)
            : document.template === "messages"
              ? messagesHtml(data)
              : null;
    if (html === null) throw new Error(`no renderer for template ${document.template}`);
    await page.setContent(html, { waitUntil: "load" });
    if (isPhone) return new Uint8Array(await page.screenshot({ type: "png", fullPage: true }));
    return new Uint8Array(await page.pdf({ format: "Letter", printBackground: true, tagged: false }));
  } finally {
    await page.close();
  }
}

async function main() {
  const browser = await chromium.launch();
  try {
    for (const fixture of FIXTURE_CASES) {
      const dir = path.join(ROOT, fixture.caseId);
      await rm(path.join(dir, "documents"), { recursive: true, force: true });
      await mkdir(path.join(dir, "documents"), { recursive: true });
      const files = [];
      for (const document of fixture.documents) {
        const bytes = await renderDocument(browser, document);
        await writeFile(path.join(dir, "documents", document.file), bytes);
        files.push({
          file: document.file,
          docClass: document.docClass,
          bytes: bytes.byteLength,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        });
      }
      const { documents, ...truth } = fixture;
      await writeFile(
        path.join(dir, "truth.json"),
        `${JSON.stringify({ synthetic: true, ...truth, documents: documents.map(({ file, docClass }) => ({ file, docClass })) }, null, 2)}\n`,
      );
      await writeFile(
        path.join(dir, "manifest.json"),
        `${JSON.stringify({ caseId: fixture.caseId, synthetic: true, files }, null, 2)}\n`,
      );
      console.log(`${fixture.caseId}: ${files.length} documents`);
    }
  } finally {
    await browser.close();
  }
}

await main();

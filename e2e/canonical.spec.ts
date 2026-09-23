import { expect, test } from "@playwright/test";
import { selectTab } from "./helpers";
import { readFile } from "node:fs/promises";

/**
 * The TAKT-DEMO-001 judge path in a clean browser: sample case → review →
 * compare → packet → verification. Runs without an AI key, so the two images
 * go through the manual-entry path the app offers when image reading is off.
 */
test("canonical case from records to a verified packet", async ({ page }) => {
  await page.goto("/cases");
  await page.getByText("TAKT-DEMO-001").scrollIntoViewIfNeeded();
  await page.locator("li", { hasText: "TAKT-DEMO-001" }).getByRole("button", { name: "Open this sample" }).click();
  await expect(page).toHaveURL(/\/case\/.+\/evidence/);
  await expect(page.getByText("Timecard_Export_0913.pdf")).toBeVisible();
  await expect(page.getByText(/facts found/).first()).toBeVisible();
  await expect(page.getByText("Couldn't read automatically").first()).toBeVisible();

  await page.getByRole("link", { name: "Review what Takt read" }).click();
  for (const tab of ["Time record / timecard", "Pay stub / wage statement"]) {
    await selectTab(page, new RegExp(tab.replace("/", "\\/")));
    await page.getByRole("button", { name: "Confirm the clear ones" }).click();
  }
  for (const file of ["Screenshot 2026-09-14 at 9.12.03 PM.png", "IMG_4821.png"]) {
    await selectTab(page, file);
    await page.getByRole("button", { name: "Enter what this sample image shows" }).click();
    await expect(page.getByRole("button", { name: "Enter what this sample image shows" })).toHaveCount(0);
  }
  await expect(page.getByText("Every fact has been reviewed.")).toBeVisible();

  await page.getByRole("link", { name: "Compare my records" }).click();
  await page.getByRole("button", { name: "Use the sample worker's answers" }).click();
  const diff = page.locator("article", { hasText: "Start time not on the employer record" });
  await expect(diff).toBeVisible();
  await expect(diff.getByText("7:40 AM", { exact: true })).toBeVisible();
  await expect(diff.getByText("8:00 AM", { exact: true })).toBeVisible();
  await expect(diff.getByText("20 min not on the employer record")).toBeVisible();
  await expect(page.getByText("Supported difference across claimed pay periods: $9.25")).toBeVisible();

  await page.getByRole("link", { name: "Build my packet" }).click();
  await page.getByRole("button", { name: "Build and verify packet" }).click();
  await expect(page.getByText("Verified: every check passed")).toBeVisible({ timeout: 60_000 });

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download packet (.zip)" }).click();
  const download = await downloadPromise;
  const bytes = await readFile((await download.path())!);
  expect(bytes.subarray(0, 2).toString()).toBe("PK");
});

test("healthy control shows no discrepancy", async ({ page }) => {
  await page.goto("/cases");
  await page.locator("li", { hasText: "TAKT-CONTROL-001" }).getByRole("button", { name: "Open this sample" }).click();
  await expect(page.getByText(/facts found/).first()).toBeVisible();
  await page.getByRole("link", { name: "Review what Takt read" }).click();
  for (const tab of ["Time record / timecard", "Pay stub / wage statement"]) {
    await selectTab(page, new RegExp(tab.replace("/", "\\/")));
    await page.getByRole("button", { name: "Confirm the clear ones" }).click();
  }
  for (const file of ["Screenshot 2026-09-14 at 8.40.51 PM.png", "IMG_5102.png"]) {
    await selectTab(page, file);
    await page.getByRole("button", { name: "Enter what this sample image shows" }).click();
    await expect(page.getByRole("button", { name: "Enter what this sample image shows" })).toHaveCount(0);
  }
  await expect(page.getByText("Every fact has been reviewed.")).toBeVisible();
  await page.getByRole("link", { name: "Compare my records" }).click();
  await expect(page.getByText("Takt Line · day by day")).toBeVisible();
  await expect(page.getByText("Records disagree")).toHaveCount(0);
  await expect(page.getByText("No supported amount to claim yet.")).toBeVisible();
});

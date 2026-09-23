import { expect, test } from "@playwright/test";
import path from "node:path";

const EVIDENCE = path.resolve(import.meta.dirname, "..", "evidence");

test("verify accepts the canonical packet and rejects TAKT-TAMPER-001", async ({ page }) => {
  await page.goto("/verify");
  await page.locator('input[type="file"][accept*="zip"]').setInputFiles(path.join(EVIDENCE, "canonical/takt-demo.zip"));
  await page.getByRole("button", { name: "Verify packet" }).click();
  await expect(page.getByText("Verified: every check passed")).toBeVisible();

  await page.locator('input[type="file"][accept*="zip"]').setInputFiles(path.join(EVIDENCE, "tamper/takt-tamper-001.zip"));
  await page.getByRole("button", { name: "Verify packet" }).click();
  await expect(page.getByText("Failed: this packet does not match its own records")).toBeVisible();
  await expect(page.getByText(/Form 1 readback/)).toBeVisible();
});

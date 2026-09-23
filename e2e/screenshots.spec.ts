import { expect, test } from "@playwright/test";
import { selectTab } from "./helpers";

/** Captures the product screens for review. Opt-in: TAKT_SCREENSHOTS=dir npx playwright test screenshots */
const OUT = process.env.TAKT_SCREENSHOTS;
test.skip(!OUT, "set TAKT_SCREENSHOTS to capture");

test("capture canonical screens", async ({ page }, info) => {
  const shot = (name: string) => page.screenshot({ path: `${OUT}/${info.project.name}-${name}.png`, fullPage: true });
  await page.goto("/");
  await shot("01-home");
  await page.goto("/cases");
  await page.locator("li", { hasText: "TAKT-DEMO-001" }).getByRole("button", { name: "Open this sample" }).click();
  await expect(page.getByText(/facts found/).first()).toBeVisible();
  await expect(page.getByText("Couldn't read automatically").first()).toBeVisible();
  await shot("02-evidence");
  await page.getByRole("link", { name: "Review what Takt read" }).click();
  await selectTab(page, /Time record/);
  await page.locator("canvas").first().waitFor();
  await page.waitForTimeout(800);
  await shot("03-review");
  for (const tab of [/Time record/, /Pay stub/]) {
    await selectTab(page, tab);
    await page.getByRole("button", { name: "Confirm the clear ones" }).click();
  }
  for (const file of ["Screenshot 2026-09-14 at 9.12.03 PM.png", "IMG_4821.png"]) {
    await selectTab(page, file);
    await page.getByRole("button", { name: "Enter what this sample image shows" }).click();
  }
  await page.getByRole("link", { name: "Compare my records" }).click();
  await shot("04-compare-ambiguous");
  await page.getByRole("button", { name: "Use the sample worker's answers" }).click();
  await expect(page.getByText("Start time not on the employer record")).toBeVisible();
  await shot("05-compare-diff");
  await page.getByRole("link", { name: "Build my packet" }).click();
  await page.getByRole("button", { name: "Build and verify packet" }).click();
  await expect(page.getByText("Verified: every check passed")).toBeVisible({ timeout: 60_000 });
  await shot("06-packet-verified");
});

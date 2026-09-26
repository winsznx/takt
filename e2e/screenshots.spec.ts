import { expect, test, type Page } from "@playwright/test";
import { selectTab } from "./helpers";

/**
 * Submission screenshots. Every image is the synthetic TAKT-DEMO-001 case in a
 * fresh browser profile, captured at a fixed viewport so reruns match.
 *
 *   TAKT_BASE_URL=https://takt-beige.vercel.app TAKT_SCREENSHOTS=docs/screenshots \
 *     npx playwright test screenshots --project=desktop
 *   (and --project=mobile for the phone image)
 *
 * 01-diff-desktop       /case/:id/reconcile after "Use the sample worker's answers", scrolled to Takt Diff
 * 02-home-desktop       /
 * 03-review-desktop     /case/:id/review, Time record tab, Sep 1 clock-in fact hovered (source box lit)
 * 04-line-desktop       /case/:id/reconcile, scrolled to Takt Line (Sep 1 disagrees, Sep 10 schedule-only)
 * 05-packet-desktop     /case/:id/packet after "Build and verify packet", scrolled to the receipt
 * 06-diff-mobile        same as 01 on a Pixel 7 viewport
 */
const OUT = process.env.TAKT_SCREENSHOTS;
test.skip(!OUT, "set TAKT_SCREENSHOTS to capture");

async function settle(page: Page) {
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 15_000 });
  await page.mouse.move(0, 0);
  await page.waitForTimeout(600);
}

async function scrollTo(page: Page, heading: string) {
  await page.getByRole("heading", { name: heading, exact: true }).evaluate((el) => {
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 24 });
  });
}

test("capture submission screenshots", async ({ page }, info) => {
  const mobile = info.project.name === "mobile";
  if (!mobile) await page.setViewportSize({ width: 1440, height: 960 });
  const shot = async (name: string) => {
    await page.screenshot({ path: `${OUT}/${name}-${mobile ? "mobile" : "desktop"}.png`, animations: "disabled" });
  };

  await page.goto("/");
  await settle(page);
  if (!mobile) await shot("02-home");

  await page.goto("/cases");
  await page.locator("li", { hasText: "TAKT-DEMO-001" }).getByRole("button", { name: "Open this sample" }).click();
  await expect(page.getByText(/facts found/).first()).toBeVisible();
  await page.getByRole("link", { name: "Review what Takt read" }).click();
  await selectTab(page, /Time record/);
  await page.locator("canvas").first().waitFor();
  await page.waitForTimeout(1200);
  if (!mobile) {
    await page.getByText("Clock in 8:00 AM on 2026-09-01").hover();
    await page.waitForTimeout(400);
    await shot("03-review");
  }
  for (const tab of [/Time record/, /Pay stub/]) {
    await selectTab(page, tab);
    await page.getByRole("button", { name: "Confirm the clear ones" }).click();
  }
  for (const file of ["Screenshot 2026-09-14 at 9.12.03 PM.png", "IMG_4821.png"]) {
    await selectTab(page, file);
    await page.getByRole("button", { name: "Enter what this sample image shows" }).click();
  }
  await page.getByRole("link", { name: "Compare my records" }).click();
  await page.getByRole("button", { name: "Use the sample worker's answers" }).click();
  await expect(page.getByText("Start time not on the employer record")).toBeVisible();
  await settle(page);
  await scrollTo(page, "Takt Diff");
  await page.waitForTimeout(300);
  await shot(mobile ? "06-diff" : "01-diff");
  if (mobile) return;

  await scrollTo(page, "Takt Line");
  await page.waitForTimeout(300);
  await shot("04-line");

  await page.getByRole("link", { name: "Build my packet" }).click();
  await page.getByRole("button", { name: "Build and verify packet" }).click();
  await expect(page.getByText("Verified: every check passed")).toBeVisible({ timeout: 60_000 });
  await settle(page);
  await page.getByRole("heading", { name: "Takt Packet", exact: true }).evaluate((el) => {
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 24 });
  });
  await page.waitForTimeout(300);
  await shot("05-packet");
});

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { selectTab } from "./helpers";

const RULES = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function audit(page: Page, label: string) {
  // Measure the settled page, not colors mid-transition or a toast mid-fade.
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 15_000 });
  await page.mouse.move(0, 0);
  await page.waitForTimeout(400);
  const results = await new AxeBuilder({ page }).withTags(RULES).analyze();
  const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const summary = blocking.map((v) => `${label}: ${v.id} (${v.impact}) ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`);
  expect(summary, summary.join("\n")).toEqual([]);
}

for (const path of ["/", "/cases", "/case/new", "/verify", "/proof", "/privacy", "/limitations"]) {
  test(`no serious or critical violations on ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await audit(page, path);
  });
}

test("no serious or critical violations across the case flow", async ({ page }) => {
  await page.goto("/cases");
  await page.locator("li", { hasText: "TAKT-DEMO-001" }).getByRole("button", { name: "Open this sample" }).click();
  await expect(page.getByText(/facts found/).first()).toBeVisible();
  await audit(page, "evidence");
  await page.getByRole("link", { name: "Review what Takt read" }).click();
  await selectTab(page, /Time record/);
  await page.locator("canvas").first().waitFor();
  await audit(page, "review");
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
  await audit(page, "reconcile");
  await page.getByRole("link", { name: "Build my packet" }).click();
  await page.getByRole("button", { name: "Build and verify packet" }).click();
  await expect(page.getByText("Verified: every check passed")).toBeVisible({ timeout: 60_000 });
  await audit(page, "packet");
});

test("the primary path works by keyboard alone", async ({ page }) => {
  await page.goto("/");
  const cta = page.getByRole("link", { name: "Check my records" }).first();
  for (let i = 0; i < 25 && !(await cta.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
  await expect(cta).toBeFocused();
  const indicator = await cta.evaluate((el) => {
    const style = getComputedStyle(el);
    return style.outlineStyle !== "none" || style.boxShadow !== "none";
  });
  expect(indicator, "focused call to action has a visible focus indicator").toBe(true);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/case\/new/);
});

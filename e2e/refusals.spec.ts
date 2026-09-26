import { expect, test, type Page } from "@playwright/test";

async function openAndReview(page: Page, caseId: string) {
  await page.goto("/cases");
  await page.locator("li", { hasText: caseId }).getByRole("button", { name: "Open this sample" }).click();
  await expect(page.getByText(/facts found/).first()).toBeVisible();
  await page.getByRole("link", { name: "Review what Takt read" }).click();
  const tabs = page.getByRole("tab");
  await tabs.first().waitFor();
  for (let i = 0; i < (await tabs.count()); i++) {
    await tabs.nth(i).click();
    await expect(tabs.nth(i)).toHaveAttribute("aria-selected", "true");
    const confirm = page.getByRole("button", { name: "Confirm the clear ones" });
    const present = await confirm.waitFor({ timeout: 5_000 }).then(
      () => true,
      () => false,
    );
    if (present) await confirm.click();
  }
  await expect(page.getByText("Every fact has been reviewed.")).toBeVisible();
  await page.getByRole("link", { name: "Compare my records" }).click();
}

test("TAKT-AMBIG-001: conflicting employer records make Takt stop instead of calculating", async ({ page }) => {
  await openAndReview(page, "TAKT-AMBIG-001");
  await page.getByRole("button", { name: "Use the sample worker's answers" }).click();
  await expect(page.getByText("Takt won't calculate this pay period yet.")).toBeVisible();
  await expect(page.getByText("No supported amount to claim yet.")).toBeVisible();
  await expect(page.getByText("Needs your answer").first()).toBeVisible();
});

test("TAKT-UNSUPPORTED-001: piece-rate pay is refused with a reason", async ({ page }) => {
  await openAndReview(page, "TAKT-UNSUPPORTED-001");
  await expect(page.getByText("Takt organized your records but won't calculate an amount for this case.")).toBeVisible();
  await expect(page.getByText(/Piece-rate and commission pay use different overtime rules/)).toBeVisible();
  await expect(page.getByText("Records disagree")).toHaveCount(0);
});

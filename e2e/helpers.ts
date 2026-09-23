import { expect, type Page } from "@playwright/test";

export async function selectTab(page: Page, name: string | RegExp) {
  const tab = page.getByRole("tab", { name });
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
}

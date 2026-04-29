import { test, expect } from "@playwright/test";

test("home page renders the brand and headline", async ({ page }) => {
  await page.goto("/");
  // The h1 carries the real headline ("90 seconds. As many as you can get.")
  // The brand mark renders as decorative spans (BrandMark component).
  await expect(page.getByRole("heading", { level: 1, name: /90 seconds/i })).toBeVisible();
  await expect(page.getByTestId("home")).toBeVisible();
});

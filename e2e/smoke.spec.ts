import { test, expect } from "@playwright/test";

test("home page renders the brand", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /trivia for all/i })).toBeVisible();
  await expect(page.getByText(/90 seconds/i)).toBeVisible();
});

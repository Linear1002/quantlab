import { expect, test } from "@playwright/test";

test("トップページからバックエンドに接続できる", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "QuantLab" })).toBeVisible();
  await expect(page.getByTestId("health")).toContainText("API 接続OK");
});

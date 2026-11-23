import { expect, test } from "@playwright/test";

test("トップページからバックエンドに接続できる", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "ダッシュボード" })).toBeVisible();
  await expect(page.getByTestId("health")).toContainText("API 接続OK");
});

import { expect, type Page, test } from "@playwright/test";

// 合成データでバックテストを1回実行し、その結果の URL を返す
async function runOnce(page: Page, strategy = { id: "rsi", name: "RSI", params: {} as Record<string, number> }) {
  await page.goto("/backtest");
  await page.evaluate((strategy) => {
    localStorage.setItem(
      "quantlab-selection",
      JSON.stringify({
        state: {
          symbol: { symbol: "TEST", name: "Test Stock US (synthetic)", market: "US", currency: "USD" },
          strategy,
          period: { start: "2023-01-01", end: "2024-12-31", preset: null },
          interval: "1d",
        },
        version: 2,
      }),
    );
  }, strategy);
  await page.reload();
  await page.getByRole("button", { name: "バックテストを実行" }).click();
  await expect(page).toHaveURL(/\/results\/[0-9a-f-]{36}$/);
  return page.url();
}

test("実行した結果が履歴に保存され、そこから開き直せる", async ({ page }) => {
  const url = await runOnce(page);
  const id = url.split("/").at(-1)!;

  await page.goto("/history");
  const list = page.getByTestId("run-list");
  const link = list.getByRole("link", { name: /Test Stock US \(synthetic\).*× RSI/ }).first();
  await expect(link).toBeVisible();
  await expect(list).toContainText("合成データ");
  await expect(link).toHaveAttribute("href", `/results/${id}`);

  await link.click();
  await expect(page).toHaveURL(new RegExp(`/results/${id}$`));
  await expect(page.getByTestId("final-equity")).toContainText("$");
});

test("ダッシュボードに最近の結果が出る", async ({ page }) => {
  await runOnce(page);
  await page.goto("/");
  await expect(page.getByTestId("run-list").getByRole("link").first()).toContainText("× RSI");
  await expect(page.getByRole("link", { name: "すべて見る" })).toHaveAttribute("href", "/history");
});

test("履歴から結果を削除できる(2段階の確認つき)", async ({ page }) => {
  const url = await runOnce(page, { id: "momentum", name: "Momentum", params: {} });
  const id = url.split("/").at(-1)!;

  await page.goto("/history");
  const row = page.getByTestId("run-list").locator("tr", { has: page.locator(`a[href="/results/${id}"]`) });
  await row.getByRole("button", { name: /の結果を削除/ }).click();
  await row.getByRole("button", { name: "本当に削除" }).click();
  await expect(page.locator(`a[href="/results/${id}"]`)).toHaveCount(0);

  await page.goto(`/results/${id}`);
  await expect(page.getByText("この結果は見つかりません")).toBeVisible();
});

test("/results を開くと最新の結果に移動する", async ({ page }) => {
  const url = await runOnce(page);
  await page.goto("/results");
  await expect(page).toHaveURL(url);
});

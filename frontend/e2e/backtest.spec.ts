import { expect, type Page, test } from "@playwright/test";

// backend は合成データ(fixture)。銘柄 TEST.T と戦略を選んだ状態から始める
async function select(page: Page, strategy: { id: string; name: string; params: Record<string, number> } | null) {
  await page.goto("/backtest");
  await page.evaluate((strategy) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(
      "quantlab-selection",
      JSON.stringify({
        state: {
          symbol: { symbol: "TEST.T", name: "テスト銘柄 JP(合成データ)", market: "JP", currency: "JPY" },
          strategy,
          period: { start: "2022-01-01", end: "2024-12-31", preset: null },
          interval: "1d",
        },
        version: 2,
      }),
    );
  }, strategy);
  await page.reload();
}

const SMA = { id: "sma_cross", name: "SMA Crossover", params: { short: 10, long: 40 } };

test("設定を確認して実行すると、結果ページに指標の比較が出る", async ({ page }) => {
  await select(page, SMA);
  const summary = page.getByRole("region", { name: "検証する内容" });
  await expect(summary).toContainText("TEST.T");
  await expect(summary).toContainText("SMA Crossover(short=10, long=40)");
  await expect(page.getByLabel("初期資金")).toHaveValue("1000000");
  await expect(page.getByLabel("単元株数")).toHaveValue("100");

  await page.getByRole("button", { name: "バックテストを実行" }).click();
  await expect(page).toHaveURL(/\/results\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("final-equity")).toContainText("円");
  await expect(page.getByRole("alert").filter({ hasText: "合成データ" })).toBeVisible();
  for (const key of ["total_return", "cagr", "sharpe", "sortino", "max_drawdown", "volatility", "win_rate", "profit_factor", "total_trades"]) {
    await expect(page.getByTestId(`metric-${key}`)).toBeVisible();
  }
  // 結果は保存されているので、リロードしても(同じ URL で)開ける
  await page.reload();
  await expect(page.getByTestId("final-equity")).toBeVisible();
});

test("Buy and Hold を選ぶと、比較の両列が同じ値になる", async ({ page }) => {
  await select(page, { id: "buy_hold", name: "Buy and Hold", params: {} });
  await page.getByRole("button", { name: "バックテストを実行" }).click();
  const row = page.getByTestId("metric-total_return");
  await expect(row).toBeVisible();
  const cells = await row.getByRole("cell").allInnerTexts();
  expect(cells[0]).toBe(cells[1]);
});

test("不正な入力があると実行できない", async ({ page }) => {
  await select(page, SMA);
  await page.getByLabel("スリッページ").fill("-1");
  await expect(page.getByText("0 〜 999 の範囲で入力してください")).toBeVisible();
  await expect(page.getByRole("button", { name: "バックテストを実行" })).toBeDisabled();
  await page.getByRole("button", { name: "既定値に戻す" }).click();
  await expect(page.getByRole("button", { name: "バックテストを実行" })).toBeEnabled();
});

test("資金が少なすぎると、警告付きで結果が出る", async ({ page }) => {
  await select(page, SMA);
  await page.getByLabel("初期資金").fill("1000");
  await page.getByRole("button", { name: "バックテストを実行" }).click();
  await expect(page.getByText(/Buy and Hold でも買えませんでした/)).toBeVisible();
  await expect(page.getByTestId("metric-win_rate").getByRole("cell").first()).toHaveText("—");
});

test("戦略が未選択なら実行ボタンは押せない", async ({ page }) => {
  await select(page, null);
  await expect(page.getByText("銘柄と戦略を選ぶと実行できます。")).toBeVisible();
  await expect(page.getByRole("button", { name: "バックテストを実行" })).toBeDisabled();
});

test("存在しない結果の URL を開くと案内が出る", async ({ page }) => {
  await page.goto("/results/00000000-0000-0000-0000-000000000000");
  await expect(page.getByText("この結果は見つかりません")).toBeVisible();
  await expect(page.getByRole("link", { name: "履歴を見る" })).toBeVisible();
});

import { expect, type Page, test } from "@playwright/test";

// 合成データで SMA Crossover を実行してから結果ページを確認する
async function runBacktest(page: Page) {
  await page.goto("/backtest");
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(
      "quantlab-selection",
      JSON.stringify({
        state: {
          symbol: { symbol: "TEST.T", name: "テスト銘柄 JP(合成データ)", market: "JP", currency: "JPY" },
          strategy: { id: "sma_cross", name: "SMA Crossover", params: { short: 10, long: 40 } },
          period: { start: "2021-01-01", end: "2024-12-31", preset: null },
          interval: "1d",
        },
        version: 2,
      }),
    );
  });
  await page.reload();
  await page.getByRole("button", { name: "バックテストを実行" }).click();
  await expect(page).toHaveURL(/\/results\/[0-9a-f-]{36}$/);
}

test("結果ページにすべてのグラフと取引履歴が表示される", async ({ page }) => {
  await runBacktest(page);

  await expect(page.getByRole("img", { name: "SMA Crossover と Buy and Hold の資産推移" }).locator("svg path").first()).toBeVisible();
  await expect(page.getByRole("img", { name: "SMA Crossover と Buy and Hold のドローダウン" })).toBeVisible();
  await expect(page.getByTestId("price-chart").locator("canvas").first()).toBeVisible();
  await expect(page.getByRole("img", { name: "年別リターンの比較" })).toBeVisible();
  await expect(page.getByRole("img", { name: "保有中の日次リターンの分布" })).toBeVisible();

  // 年別: 2021〜2024 の4年
  const monthly = page.getByTestId("monthly-table");
  await expect(monthly.getByRole("rowheader")).toHaveText(["2021", "2022", "2023", "2024"]);

  // 取引履歴の件数が見出しと一致する
  const heading = page.getByRole("heading", { name: /取引履歴\(\d+ 件\)/ });
  const n = Number((await heading.innerText()).match(/(\d+) 件/)![1]);
  expect(n).toBeGreaterThan(0);
  await expect(page.getByTestId("trades-table").locator("tbody tr")).toHaveCount(n);
});

test("結果の読み方: 見出し・各項目・注意点が日本語で出る", async ({ page }) => {
  await runBacktest(page);
  const panel = page.getByTestId("interpretation");
  await expect(panel.getByRole("heading", { name: "結果の読み方" })).toBeVisible();
  // 各項目の見出しの前には、読み上げ用の「良い点: 」などが付いているので、末尾一致で探す
  for (const title of ["リターン", "いちばん大きな下落", "リスクあたりの効率", "株を持っていた時間", "取引の中身"]) {
    await expect(panel.getByText(new RegExp(`${title}$`))).toBeVisible();
  }
  await expect(panel).toContainText("Buy and Hold");
  await expect(panel).toContainText("過剰最適化");
  await expect(panel).toContainText("合成データ"); // テスト用データでは必ず注意が出る
});

test("月別リターンを Buy and Hold に切り替えられる", async ({ page }) => {
  await runBacktest(page);
  const table = page.getByTestId("monthly-table");
  const before = await table.locator("tbody").innerText();
  await page.getByRole("radio", { name: "Buy and Hold" }).click();
  await expect(table.locator("caption")).toHaveText("月別リターン(Buy and Hold)");
  expect(await table.locator("tbody").innerText()).not.toBe(before);
});

test("資産推移のグラフにマウスを乗せると、その日の値が出る", async ({ page, isMobile }) => {
  test.skip(isMobile, "ホバーは PC のみ");
  await runBacktest(page);
  const chart = page.getByRole("img", { name: "SMA Crossover と Buy and Hold の資産推移" });
  await chart.scrollIntoViewIfNeeded(); // 「結果の読み方」の下にあるので、画面内に入れてからマウスを乗せる
  const box = (await chart.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5);
  await expect(page.getByText("保有", { exact: true })).toBeVisible();
});

test("スマホ幅でもページ全体が横にはみ出さない", async ({ page }) => {
  await runBacktest(page);
  await page.getByTestId("trades-table").scrollIntoViewIfNeeded();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

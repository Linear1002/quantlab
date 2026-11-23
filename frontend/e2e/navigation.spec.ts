import { expect, type Page, test } from "@playwright/test";

const PAGES = [
  { href: "/", heading: "ダッシュボード" },
  { href: "/stocks", heading: "銘柄" },
  { href: "/strategies", heading: "戦略" },
  { href: "/backtest", heading: "バックテスト" },
  { href: "/results", heading: "分析結果" },
  { href: "/history", heading: "履歴" },
  { href: "/settings", heading: "設定" },
];

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1280) < 768;

/** PC ならサイドバー、スマホならメニューを開いてからリンクを押す */
async function navigateTo(page: Page, label: string) {
  if (isMobile(page)) {
    await page.getByRole("button", { name: "メニューを開く" }).click();
    await page.getByRole("dialog").getByRole("link", { name: label, exact: true }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
  } else {
    await page
      .getByRole("navigation", { name: "メインメニュー" })
      .getByRole("link", { name: label, exact: true })
      .click();
  }
}

test("メニューから全ての画面に移動できる", async ({ page }) => {
  await page.goto("/");
  for (const { href, heading } of PAGES) {
    await navigateTo(page, heading);
    await expect(page).toHaveURL(href);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
  }
});

test("各画面に直接アクセスでき、横スクロールが発生しない", async ({ page }) => {
  for (const { href, heading } of PAGES) {
    await page.goto(href);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${href} が横にはみ出している`).toBeLessThanOrEqual(0);
  }
});

test("3ステップ表示: 未選択の状態から、選択するとチェックが付く", async ({ page }) => {
  // 表示されている文字だけを比べる(PC とスマホで表記が違うため innerText を使う)
  const step = (n: number) => page.getByTestId(`run-strip-step-${n}`);
  const opt = { useInnerText: true };
  const mobile = isMobile(page);

  await page.goto("/");
  await expect(step(1)).toHaveText("未選択", opt);
  await expect(step(3)).toHaveText(mobile ? "未準備" : "銘柄と戦略を選ぶと実行できます", opt);

  // 選択 UI は Phase 3/4 で作るので、ここでは localStorage に直接入れて表示だけ確認する
  await page.evaluate(() => {
    localStorage.setItem(
      "quantlab-selection",
      JSON.stringify({
        state: {
          symbol: { symbol: "7203.T", name: "トヨタ自動車", market: "JP" },
          strategy: { id: "sma_cross", name: "SMA Crossover", params: { short: 20, long: 50 } },
        },
        version: 1,
      }),
    );
  });
  await page.reload();
  await expect(step(1)).toHaveText(mobile ? "7203.T" : "トヨタ自動車(7203.T)", opt);
  await expect(step(2)).toHaveText("SMA Crossover", opt);
  await expect(step(3)).toHaveText(mobile ? "実行可" : "実行できます", opt);
});

test("存在しないページでも空白にならない", async ({ page }) => {
  const res = await page.goto("/does-not-exist");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("link", { name: "ダッシュボードに戻る" })).toBeVisible();
});

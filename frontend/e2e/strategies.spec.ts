import { expect, type Page, test } from "@playwright/test";

// backend は合成データ(fixture)。銘柄 TEST.T を選んだ状態から始める
async function withSymbol(page: Page) {
  await page.goto("/strategies");
  await page.evaluate(() => {
    localStorage.setItem(
      "quantlab-selection",
      JSON.stringify({
        state: {
          symbol: { symbol: "TEST.T", name: "テスト銘柄 JP(合成データ)", market: "JP", currency: "JPY" },
          strategy: null,
          period: { start: "2023-01-01", end: "2024-12-31", preset: null },
          interval: "1d",
        },
        version: 2,
      }),
    );
  });
  await page.reload();
}

test("8つの戦略がカードで表示され、必要な情報がそろっている", async ({ page }) => {
  await withSymbol(page);
  const cards = page.getByRole("article");
  await expect(cards).toHaveCount(8);
  const sma = cards.filter({ has: page.getByRole("heading", { name: "SMA Crossover" }) });
  // スマホ幅では詳細が折りたたまれているので開く
  const more = sma.getByRole("button", { name: "詳しく見る" });
  if (await more.isVisible()) await more.click();
  for (const label of ["考え方", "買い", "売り", "向いている相場", "主なリスク"]) {
    await expect(sma.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(sma).toContainText("難易度 初級");
});

test("戦略を選ぶと、パラメータとシグナルが表示され、3ステップ表示に反映される", async ({ page }) => {
  await withSymbol(page);
  await page
    .getByRole("article", { name: "SMA Crossover" })
    .getByRole("button", { name: "この戦略を選ぶ" })
    .click();

  const config = page.getByRole("region", { name: "選択中の戦略の設定" });
  await expect(config.getByLabel("短期期間")).toHaveValue("20");
  await expect(config.getByLabel("長期期間")).toHaveValue("50");
  await expect(page.getByTestId("signal-summary")).toContainText("買いシグナル");
  await expect(page.getByTestId("price-chart").locator("canvas").first()).toBeVisible();
  await expect(page.getByTestId("run-strip-step-2")).toHaveText("SMA Crossover", { useInnerText: true });
  await expect(page.getByTestId("run-strip-step-3")).not.toHaveText("未準備", { useInnerText: true });
});

test("パラメータを変えるとシグナルの回数が変わる", async ({ page }) => {
  await withSymbol(page);
  await page.getByRole("article", { name: "SMA Crossover" }).getByRole("button", { name: "この戦略を選ぶ" }).click();
  const summary = page.getByTestId("signal-summary");
  await expect(summary).toBeVisible();
  const buys = async () => Number((await summary.innerText()).match(/買いシグナル\s*(\d+)/)?.[1]);
  const before = await buys();

  // 期間を短くすると交差が増える
  await page.getByLabel("短期期間").fill("3");
  await page.getByLabel("長期期間").fill("8");
  await expect.poll(buys).toBeGreaterThan(before);
});

test("範囲外の値はその場で、関係の矛盾は backend のメッセージで知らせる", async ({ page }) => {
  await withSymbol(page);
  await page.getByRole("article", { name: "SMA Crossover" }).getByRole("button", { name: "この戦略を選ぶ" }).click();

  await page.getByLabel("短期期間").fill("1");
  await expect(page.getByText("2 〜 200 の範囲で入力してください")).toBeVisible();

  await page.getByLabel("短期期間").fill("60");
  await expect(page.getByTestId("signal-preview").getByRole("alert")).toContainText(
    "短期期間は長期期間より小さくしてください",
  );

  await page.getByRole("button", { name: "既定値に戻す" }).click();
  await expect(page.getByLabel("短期期間")).toHaveValue("20");
  await expect(page.getByTestId("signal-preview").getByRole("alert")).toHaveCount(0);
});

test("Buy and Hold はパラメータが無く、初日に買う", async ({ page }) => {
  await withSymbol(page);
  await page.getByRole("article", { name: "Buy and Hold" }).getByRole("button", { name: "この戦略を選ぶ" }).click();
  await expect(page.getByText("この戦略に調整できるパラメータはありません")).toBeVisible();
  await expect(page.getByTestId("signal-summary")).toContainText("買いシグナル 1 回");
  await expect(page.getByTestId("signal-summary")).toContainText("保有中");
});

test("銘柄が未選択なら、銘柄ページへの案内が出る", async ({ page }) => {
  await page.goto("/strategies");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("article", { name: "RSI", exact: true }).getByRole("button", { name: "この戦略を選ぶ" }).click();
  await expect(page.getByRole("link", { name: "銘柄を選ぶ" })).toBeVisible();
});

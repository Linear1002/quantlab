import { expect, test } from "@playwright/test";

// backend は合成データ(fixture)で起動している。銘柄は TEST.T(日本)と TEST(米国)の2つだけ。

test.beforeEach(async ({ page }) => {
  await page.goto("/stocks");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

const searchBox = (page: import("@playwright/test").Page) =>
  page.getByRole("combobox", { name: "銘柄名・ティッカー・証券コードで検索" });

test("銘柄を検索して選ぶと、株価とチャートが表示され、選択が保存される", async ({ page }) => {
  await searchBox(page).fill("test");
  const options = page.getByRole("option");
  await expect(options).toHaveCount(2);

  await options.filter({ hasText: "TEST.T" }).click();

  const overview = page.getByRole("region", { name: "選択中の銘柄" });
  await expect(overview.getByRole("heading", { level: 2 })).toHaveText("テスト銘柄 JP(合成データ)");
  // 合成データであることの警告が必ず出る
  await expect(overview.getByRole("alert")).toContainText("合成データ");
  await expect(page.getByTestId("quote")).toContainText("円");
  await expect(page.getByTestId("price-chart").locator("canvas").first()).toBeVisible();

  // 3ステップ表示に反映される(PC は名前+ティッカー、スマホはティッカーのみ)
  await expect(page.getByTestId("run-strip-step-1")).toContainText("TEST.T", { useInnerText: true });

  // リロードしても選択が残る
  await page.reload();
  await expect(overview.getByRole("heading", { level: 2 })).toHaveText("テスト銘柄 JP(合成データ)");
});

test("キーボードで候補を選べる", async ({ page }) => {
  await searchBox(page).fill("test");
  await expect(page.getByRole("option")).toHaveCount(2);
  await searchBox(page).press("ArrowDown");
  await searchBox(page).press("Enter");
  await expect(page.getByRole("region", { name: "選択中の銘柄" })).toBeVisible();
});

test("市場で絞り込める", async ({ page }) => {
  await page.getByRole("radio", { name: "米国株" }).click();
  await searchBox(page).fill("test");
  await expect(page.getByRole("option")).toHaveCount(1);
  await expect(page.getByRole("option")).toContainText("TEST");
});

test("見つからないときは案内が出る", async ({ page }) => {
  await searchBox(page).fill("zzzz");
  await expect(page.getByText("「zzzz」に一致する銘柄は見つかりませんでした")).toBeVisible();
});

test("時間軸と期間を変えると、本数が変わる", async ({ page }) => {
  await searchBox(page).fill("test");
  await page.getByRole("option").filter({ hasText: "TEST.T" }).click();

  const count = page.getByTestId("bar-count");
  await expect(count).toBeVisible();
  const parse = async () => Number((await count.innerText()).replace(/[^0-9]/g, ""));

  await page.getByRole("radio", { name: "1年" }).click();
  await expect.poll(parse).toBeLessThan(270); // 1年 ≒ 250 営業日
  const daily = await parse();

  await page.getByRole("radio", { name: "週足" }).click();
  await expect.poll(parse).toBeLessThan(daily / 4);
});

test("銘柄の選択を解除できる", async ({ page }) => {
  await searchBox(page).fill("test");
  await page.getByRole("option").first().click();
  await page.getByRole("button", { name: "銘柄の選択を解除" }).click();
  await expect(page.getByRole("region", { name: "選択中の銘柄" })).toHaveCount(0);
  await expect(page.getByTestId("run-strip-step-1")).toHaveText("未選択", { useInnerText: true });
});

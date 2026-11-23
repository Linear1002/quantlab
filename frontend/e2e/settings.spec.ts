import { expect, test } from "@playwright/test";

test("データの状態が表示される", async ({ page }) => {
  await page.goto("/settings");
  const status = page.getByTestId("system-status");
  await expect(status).toContainText("テスト用の合成データ");
  await expect(status).toContainText("sqlite");
});

test("損益の色を「上昇 = 赤」に切り替えると、全体に反映されて保存される", async ({ page }) => {
  await page.goto("/settings");
  await page.evaluate(() => localStorage.removeItem("quantlab-prefs"));
  await page.reload();
  const gain = () =>
    page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--gain").trim());

  await expect.poll(gain).toBe("#34d39a");
  await page.getByLabel("上昇・利益 = 赤").check();
  await expect(page.locator("html")).toHaveAttribute("data-updown", "red-up");
  await expect.poll(gain).toBe("#ff6b6b");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-updown", "red-up");
  await expect(page.getByLabel("上昇・利益 = 赤")).toBeChecked(); // 保存した設定が読み込まれている
  await page.getByLabel("上昇・利益 = 緑").check();
  await expect.poll(gain).toBe("#34d39a");
});

test("株価のキャッシュを削除できる(2段階の確認つき)", async ({ page }) => {
  await page.goto("/settings");
  // 状態の表示 = 画面の準備(hydration)が終わった合図。それより前のクリックは反応しないため待つ
  await expect(page.getByTestId("system-status")).toBeVisible();
  await page.getByRole("button", { name: "株価のキャッシュを削除" }).click();
  await page.getByRole("button", { name: "キャッシュを削除する" }).click();
  await expect(page.getByRole("status")).toContainText("株価のキャッシュを");
});

test("選択と設定を初期化できる", async ({ page }) => {
  await page.goto("/settings");
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
  await expect(page.getByTestId("run-strip-step-1")).toContainText("TEST.T", { useInnerText: true });

  await expect(page.getByTestId("system-status")).toBeVisible();
  await page.getByRole("button", { name: "選択と設定を初期化" }).click();
  await page.getByRole("button", { name: "初期化する" }).click();
  await expect(page.getByTestId("run-strip-step-1")).toHaveText("未選択", { useInnerText: true });
});

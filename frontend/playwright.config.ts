import { defineConfig, devices } from "@playwright/test";

// E2E テストは、普段の開発サーバー(3000 / 8000)とは別のポートで専用のサーバーを起動する。
// - backend: 合成データ(fixture)を使う。Yahoo には接続しない(テストが毎回同じ結果になる)
// - frontend: 別のビルド先(.next-e2e)を使う
// こうすると、`npm run dev` を起動したままでもテストを実行できる。
const API_PORT = 8001;
const WEB_PORT = 3001;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: "retain-on-failure",
    // 既存のChromeを使いたいときだけ PW_CHROME_PATH を設定する(通常は不要)
    launchOptions: process.env.PW_CHROME_PATH
      ? { executablePath: process.env.PW_CHROME_PATH }
      : {},
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      // 毎回まっさらな E2E 専用の DB(.e2e.db)で始める。普段の quantlab.db には書き込まない
      command: `rm -f .e2e.db && uv run uvicorn app.main:app --port ${API_PORT}`,
      cwd: "../backend",
      url: `http://localhost:${API_PORT}/api/health`,
      reuseExistingServer: false,
      env: {
        QUANTLAB_DATA_PROVIDER: "fixture",
        QUANTLAB_DATABASE_URL: "sqlite:///./.e2e.db",
        QUANTLAB_CORS_ORIGINS: `["http://localhost:${WEB_PORT}"]`,
      },
    },
    {
      command: `npx next dev --port ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        NEXT_DIST_DIR: ".next-e2e",
        NEXT_PUBLIC_API_BASE_URL: `http://localhost:${API_PORT}`,
      },
    },
  ],
});

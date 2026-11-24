import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// 画面を使わない計算(src/lib や、グラフ用の集計関数)の単体テスト。画面の操作は Playwright(e2e/)で確認する
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // E2E テストは別のビルド先(.next-e2e)を使い、開発サーバー(.next)とぶつからないようにする
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

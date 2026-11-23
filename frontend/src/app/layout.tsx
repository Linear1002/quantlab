import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { cn } from "@/lib/utils";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "QuantLab", template: "%s | QuantLab" },
  description: "株式の投資戦略を実データで検証するバックテストツール",
};

export const viewport: Viewport = {
  themeColor: "#05070d",
};

// フォントは geist パッケージから読み込む(ビルド時に Google Fonts へ接続しない)
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ja"
      className={cn("dark h-full antialiased", GeistSans.variable, GeistMono.variable)}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}

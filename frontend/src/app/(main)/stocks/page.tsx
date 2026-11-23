import type { Metadata } from "next";
import { SectionPage } from "@/components/layout/section-page";

export const metadata: Metadata = { title: "銘柄" };

export default function StocksPage() {
  return (
    <SectionPage
      href="/stocks"
      panelTitle="銘柄を検索"
      empty={{
        title: "銘柄検索は開発中です",
        body: "日本株(例: 7203.T トヨタ自動車)と米国株(例: AAPL)を、銘柄名またはティッカーで検索できるようにします。株価チャートと分析期間の指定もこの画面に置きます。",
      }}
    />
  );
}

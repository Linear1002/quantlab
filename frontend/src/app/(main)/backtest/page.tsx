import type { Metadata } from "next";
import { SectionPage } from "@/components/layout/section-page";

export const metadata: Metadata = { title: "バックテスト" };

export default function BacktestPage() {
  return (
    <SectionPage
      href="/backtest"
      panelTitle="実行の設定"
      empty={{
        title: "バックテストの実行は開発中です",
        body: "初期資金・期間・手数料・スリッページ・ポジションサイズを設定して実行します。売買は「シグナルが出た翌営業日の始値」で約定させます。",
        action: { href: "/stocks", label: "先に銘柄を選ぶ" },
      }}
    />
  );
}

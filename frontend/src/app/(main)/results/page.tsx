import type { Metadata } from "next";
import { SectionPage } from "@/components/layout/section-page";

export const metadata: Metadata = { title: "分析結果" };

export default function ResultsPage() {
  return (
    <SectionPage
      href="/results"
      panelTitle="結果"
      empty={{
        title: "表示できる結果がありません",
        body: "バックテストを実行すると、資産推移・ドローダウン・売買ポイント・取引履歴と、Buy and Hold との比較がここに表示されます。",
        action: { href: "/backtest", label: "バックテストを設定する" },
      }}
    />
  );
}

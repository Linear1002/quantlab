import type { Metadata } from "next";
import { SectionPage } from "@/components/layout/section-page";

export const metadata: Metadata = { title: "履歴" };

export default function HistoryPage() {
  return (
    <SectionPage
      href="/history"
      panelTitle="実行履歴"
      empty={{
        title: "まだバックテストを実行していません",
        body: "実行したバックテストは自動で保存され、銘柄・戦略・期間・リターン・最大ドローダウンを一覧で比べられます。",
        action: { href: "/stocks", label: "銘柄を選ぶ" },
      }}
    />
  );
}

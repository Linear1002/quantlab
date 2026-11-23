import type { Metadata } from "next";
import { SectionPage } from "@/components/layout/section-page";

export const metadata: Metadata = { title: "戦略" };

export default function StrategiesPage() {
  return (
    <SectionPage
      href="/strategies"
      panelTitle="戦略を選ぶ"
      empty={{
        title: "戦略の選択は開発中です",
        body: "SMA・EMA クロス、RSI、MACD、ボリンジャーバンド、モメンタム、平均回帰、Buy and Hold の8戦略を、売買条件・向いている相場・リスクと一緒に表示します。",
      }}
    />
  );
}

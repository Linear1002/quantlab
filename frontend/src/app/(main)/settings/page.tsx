import type { Metadata } from "next";
import { SectionPage } from "@/components/layout/section-page";

export const metadata: Metadata = { title: "設定" };

export default function SettingsPage() {
  return (
    <SectionPage
      href="/settings"
      panelTitle="デフォルト値"
      empty={{
        title: "設定画面は開発中です",
        body: "手数料率・スリッページ・初期資金のデフォルト値、無リスク金利、損益の色(上昇=緑/赤)を変更できるようにします。",
      }}
    />
  );
}

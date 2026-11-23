import { AppSidebar } from "@/components/layout/app-sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { RunStrip } from "@/components/layout/run-strip";

/**
 * アプリ共通の枠組み。
 * PC:     [サイドバー | 3ステップ表示 + 本文]
 * スマホ: [ヘッダー(メニュー)] → [3ステップ表示] → [本文]
 */
export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav />
        <RunStrip />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:px-8 md:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}

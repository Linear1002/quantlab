import { HealthStatus } from "@/components/health-status";

// Phase 1: 環境構築の確認画面。Phase 2 でサイドバー付きの Dashboard に置き換える。
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-4 px-6">
      <h1 className="text-3xl font-semibold tracking-tight">QuantLab</h1>
      <p className="text-zinc-400">Phase 1 — environment check</p>
      <HealthStatus />
    </main>
  );
}

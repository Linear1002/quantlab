import type { Metadata } from "next";
import { BacktestForm } from "@/components/backtest/backtest-form";
import { PageHeader } from "@/components/layout/page-header";
import { NAV_ITEMS } from "@/lib/nav";

export const metadata: Metadata = { title: "バックテスト" };

const nav = NAV_ITEMS.find((n) => n.href === "/backtest")!;

export default function BacktestPage() {
  return (
    <div className="space-y-8">
      <PageHeader title={nav.label} description={nav.description} />
      <BacktestForm />
    </div>
  );
}

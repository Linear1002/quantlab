import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { StrategyPicker } from "@/components/strategies/strategy-picker";
import { NAV_ITEMS } from "@/lib/nav";

export const metadata: Metadata = { title: "戦略" };

const nav = NAV_ITEMS.find((n) => n.href === "/strategies")!;

export default function StrategiesPage() {
  return (
    <div className="space-y-8">
      <PageHeader title={nav.label} description={nav.description} />
      <StrategyPicker />
    </div>
  );
}

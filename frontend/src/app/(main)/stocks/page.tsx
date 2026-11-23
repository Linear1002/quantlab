import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { StockPicker } from "@/components/stocks/stock-picker";
import { NAV_ITEMS } from "@/lib/nav";

export const metadata: Metadata = { title: "銘柄" };

const nav = NAV_ITEMS.find((n) => n.href === "/stocks")!;

export default function StocksPage() {
  return (
    <div className="space-y-8">
      <PageHeader title={nav.label} description={nav.description} />
      <StockPicker />
    </div>
  );
}

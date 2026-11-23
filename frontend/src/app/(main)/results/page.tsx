import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { ResultView } from "@/components/results/result-view";
import { NAV_ITEMS } from "@/lib/nav";

export const metadata: Metadata = { title: "分析結果" };

const nav = NAV_ITEMS.find((n) => n.href === "/results")!;

export default function ResultsPage() {
  return (
    <div className="space-y-8">
      <PageHeader title={nav.label} description={nav.description} />
      <ResultView />
    </div>
  );
}

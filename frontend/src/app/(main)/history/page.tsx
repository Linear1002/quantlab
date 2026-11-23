import type { Metadata } from "next";
import { RunList } from "@/components/history/run-list";
import { PageHeader } from "@/components/layout/page-header";
import { Panel } from "@/components/ui/panel";
import { NAV_ITEMS } from "@/lib/nav";

export const metadata: Metadata = { title: "履歴" };

const nav = NAV_ITEMS.find((n) => n.href === "/history")!;

export default function HistoryPage() {
  return (
    <div className="space-y-8">
      <PageHeader title={nav.label} description={nav.description} />
      <Panel title="実行履歴">
        <RunList />
      </Panel>
    </div>
  );
}

import Link from "next/link";
import { HealthStatus } from "@/components/health-status";
import { RunList } from "@/components/history/run-list";
import { PageHeader } from "@/components/layout/page-header";
import { Panel } from "@/components/ui/panel";
import { NAV_ITEMS } from "@/lib/nav";

const nav = NAV_ITEMS[0];

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <PageHeader title={nav.label} description={nav.description} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Panel
          title="最近のバックテスト"
          aside={
            <Link href="/history" className="text-xs text-blue hover:underline">
              すべて見る
            </Link>
          }
        >
          <RunList pageSize={5} compact />
        </Panel>

        <Panel title="システム">
          <HealthStatus />
        </Panel>
      </div>
    </div>
  );
}

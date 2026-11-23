import { HealthStatus } from "@/components/health-status";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { NAV_ITEMS } from "@/lib/nav";

const nav = NAV_ITEMS[0];

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <PageHeader title={nav.label} description={nav.description} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Panel title="最近のバックテスト">
          {/* Phase 7 で履歴APIにつなぐ。それまでは実データが無いので空の表示だけ */}
          <EmptyState
            title="まだバックテストを実行していません"
            body="銘柄と戦略を選んでバックテストを実行すると、ここに最新の結果が表示されます。"
            action={{ href: "/stocks", label: "銘柄を選ぶ" }}
          />
        </Panel>

        <Panel title="システム">
          <HealthStatus />
        </Panel>
      </div>
    </div>
  );
}

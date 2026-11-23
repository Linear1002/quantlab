"use client";

import { TriangleAlert } from "lucide-react";
import { useSyncExternalStore } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { isSyntheticProvider } from "@/lib/api";
import { useLastResult } from "@/lib/backtest-store";
import { formatPrice } from "@/lib/format";
import { MetricsTable } from "./metrics-table";

function useResultHydrated() {
  return useSyncExternalStore(
    (cb) => useLastResult.persist.onFinishHydration(cb),
    () => useLastResult.persist.hasHydrated(),
    () => false,
  );
}

/** 分析結果ページ(Phase 5: 指標の比較まで。グラフと取引履歴は Phase 6) */
export function ResultView() {
  const hydrated = useResultHydrated();
  const last = useLastResult((s) => s.last);

  if (!hydrated) return <p className="text-sm text-muted-foreground">読み込んでいます</p>;
  if (!last) {
    return (
      <Panel title="結果">
        <EmptyState
          title="表示できる結果がありません"
          body="バックテストを実行すると、ここにリターン・リスク指標と、Buy and Hold との比較が表示されます。"
          action={{ href: "/backtest", label: "バックテストを設定する" }}
        />
      </Panel>
    );
  }

  const { result: r, symbolName, strategyName } = last;
  const currency = r.symbol.toUpperCase().endsWith(".T") ? "JPY" : "USD";
  const final = r.series.at(-1)!;

  return (
    <div className="space-y-6">
      {isSyntheticProvider(r.provider) && (
        <p role="alert" className="flex items-center gap-2 rounded-md border border-loss/40 bg-loss/10 px-4 py-2.5 text-sm text-loss">
          <TriangleAlert className="size-4 shrink-0" aria-hidden />
          テスト用の合成データで計算した結果です。実際の株価ではありません。
        </p>
      )}

      <section aria-label="実行内容" className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            {symbolName}({r.symbol})× {strategyName}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {r.series[0].date} 〜 {final.date} ・ {r.interval === "1d" ? "日足" : "週足"} ・ {r.series.length} 本 ・ 初期資金{" "}
            {formatPrice(r.config.initial_capital, currency)}
          </p>
        </div>
        <div className="sm:text-right">
          <p className="text-xs text-faint">最終資産</p>
          <p className="text-2xl font-semibold tracking-tight" data-testid="final-equity">
            {formatPrice(final.equity, currency)}
          </p>
          <p className="text-xs text-faint">Buy and Hold: {formatPrice(final.benchmark, currency)}</p>
        </div>
      </section>

      {(r.warnings.length > 0 || r.pending_signal) && (
        <ul className="space-y-1.5 rounded-md border border-chart-4/30 bg-chart-4/5 px-4 py-3 text-sm text-chart-4">
          {r.warnings.map((w) => (
            <li key={w}>注意: {w}</li>
          ))}
          {r.pending_signal && (
            <li>
              最終日に{r.pending_signal === "buy" ? "買い" : "売り"}シグナルが出ています(翌営業日のデータが無いため、約定していません)。
            </li>
          )}
        </ul>
      )}

      <Panel title="戦略と Buy and Hold の比較">
        <MetricsTable strategy={r.metrics} benchmark={r.benchmark_metrics} strategyName={strategyName} />
      </Panel>

      <p className="text-xs leading-relaxed text-faint">
        手数料 {(r.config.commission_rate * 100).toFixed(3)}%(最低 {formatPrice(r.config.commission_min, currency)})・
        スリッページ {r.config.slippage_bps}bps ・ 単元 {r.config.lot_size} 株 ・
        {r.config.price_mode === "total_return" ? "配当込みの調整後価格" : "分割調整のみの価格"} ・ 無リスク金利{" "}
        {(r.risk_free_rate * 100).toFixed(2)}% ・ エンジン v{r.engine_version}
      </p>
    </div>
  );
}

"use client";

import { TriangleAlert } from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo, useSyncExternalStore } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { type Bar, isSyntheticProvider } from "@/lib/api";
import { useLastResult } from "@/lib/backtest-store";
import { formatPrice } from "@/lib/format";
import { DrawdownChart } from "./charts/drawdown-chart";
import { EquityChart } from "./charts/equity-chart";
import { MonthlyHeatmap } from "./charts/monthly-heatmap";
import { ReturnHistogram } from "./charts/return-histogram";
import { YearlyBars } from "./charts/yearly-bars";
import { MetricsTable } from "./metrics-table";
import { TradesTable } from "./trades-table";

// 株価チャートは canvas を使うのでブラウザでだけ描画する
const PriceChart = dynamic(() => import("@/components/charts/price-chart").then((m) => m.PriceChart), {
  ssr: false,
});

function useResultHydrated() {
  return useSyncExternalStore(
    (cb) => useLastResult.persist.onFinishHydration(cb),
    () => useLastResult.persist.hasHydrated(),
    () => false,
  );
}

/** 分析結果ページ: 概要 → 資産推移 → ドローダウン → 指標 → 売買ポイント → 年別・分布 → 月別 → 取引履歴 */
export function ResultView() {
  const hydrated = useResultHydrated();
  const last = useLastResult((s) => s.last);

  const priceBars: Bar[] = useMemo(
    () =>
      last?.result.series.map((p) => ({
        date: p.date,
        open: p.open,
        high: p.high,
        low: p.low,
        close: p.close,
        adj_close: p.close,
        volume: 0,
      })) ?? [],
    [last],
  );
  // 実際に約定した日に印を付ける(シグナルの日ではない)
  const tradeMarkers = useMemo(() => {
    if (!last) return [];
    const m: { date: string; type: "buy" | "sell" }[] = [];
    for (const t of last.result.trades) {
      m.push({ date: t.entry_date, type: "buy" });
      if (t.status === "closed") m.push({ date: t.exit_date, type: "sell" });
    }
    return m.sort((a, b) => a.date.localeCompare(b.date));
  }, [last]);

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
  const initial = r.config.initial_capital;

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
            {formatPrice(initial, currency)}
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

      <Panel title="資産推移">
        <EquityChart series={r.series} strategyName={strategyName} currency={currency} initial={initial} />
      </Panel>

      <Panel title="ドローダウン(最高値からの下落率)">
        <DrawdownChart series={r.series} strategyName={strategyName} />
      </Panel>

      <Panel title="戦略と Buy and Hold の比較">
        <MetricsTable strategy={r.metrics} benchmark={r.benchmark_metrics} strategyName={strategyName} />
      </Panel>

      <Panel title="株価チャートと売買ポイント">
        <div className="space-y-3">
          <PriceChart bars={priceBars} currency={currency} markers={tradeMarkers} showVolume={false} height={380} />
          <p className="text-xs text-faint">
            ▲買 / ▼売 は実際に約定した日(シグナルの翌営業日)です。価格は約定価格と同じ基準の
            {r.config.price_mode === "total_return" ? "配当込み調整後価格" : "分割調整のみの価格"}です。
          </p>
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="年別リターン">
          <YearlyBars strategyName={strategyName} yearly={r.yearly_returns} benchmarkYearly={r.benchmark_yearly_returns} />
        </Panel>
        <Panel title={`リターン分布(${strategyName}・保有中のみ)`}>
          <ReturnHistogram series={r.series} interval={r.interval} />
        </Panel>
      </div>

      <Panel title="月別リターン">
        <MonthlyHeatmap
          strategyName={strategyName}
          monthly={r.monthly_returns}
          yearly={r.yearly_returns}
          benchmarkMonthly={r.benchmark_monthly_returns}
          benchmarkYearly={r.benchmark_yearly_returns}
        />
      </Panel>

      <Panel title={`取引履歴(${r.trades.length} 件)`}>
        <TradesTable trades={r.trades} currency={currency} />
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

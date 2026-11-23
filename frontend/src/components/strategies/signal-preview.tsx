"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo } from "react";
import { getHistory, isSyntheticProvider, postSignals } from "@/lib/api";
import { formatCount } from "@/lib/format";
import { type SelectedStrategy, useSelection } from "@/lib/store";
import { useApi } from "@/lib/use-api";

const PriceChart = dynamic(() => import("@/components/charts/price-chart").then((m) => m.PriceChart), {
  ssr: false,
});

/**
 * 選択中の銘柄で、この戦略がいつ売買シグナルを出すかを確認する。
 * 損益の計算はしない(それは Phase 5 のバックテスト)。
 */
export function SignalPreview({ strategy }: { strategy: SelectedStrategy }) {
  const symbol = useSelection((s) => s.symbol);
  const period = useSelection((s) => s.period);
  const interval = useSelection((s) => s.interval);

  const base = symbol ? `${symbol.symbol}|${period.start}|${period.end}|${interval}` : null;
  const history = useApi(base, (signal) =>
    getHistory(symbol!.symbol, period.start, period.end, interval, signal),
  );
  const sigKey = base ? `${base}|${strategy.id}|${JSON.stringify(strategy.params)}` : null;
  const signals = useApi(sigKey, (signal) =>
    postSignals(
      strategy.id,
      { symbol: symbol!.symbol, start: period.start, end: period.end, interval, params: strategy.params },
      signal,
    ),
  );

  const markers = useMemo(
    () => (signals.status === "success" ? signals.data.events : []),
    [signals],
  );

  if (!symbol) {
    return (
      <p className="text-sm text-muted-foreground">
        <Link href="/stocks" className="text-blue hover:underline">
          銘柄を選ぶ
        </Link>
        と、この戦略が売買シグナルを出す日をチャートで確認できます。
      </p>
    );
  }

  const buys = markers.filter((m) => m.type === "buy").length;
  const sells = markers.length - buys;

  return (
    <div className="space-y-3" data-testid="signal-preview">
      <p className="text-sm text-muted-foreground">
        {symbol.name}({symbol.symbol}) ・ {period.start} 〜 {period.end} ・ {interval === "1d" ? "日足" : "週足"}
      </p>

      {signals.status === "error" && (
        <p role="alert" className="rounded-md border border-loss/40 bg-loss/10 px-4 py-3 text-sm text-loss">
          {signals.error.message}
        </p>
      )}

      {signals.status === "success" && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm" data-testid="signal-summary">
          <span>
            <span className="text-faint">買いシグナル </span>
            <span className="text-cyan">{formatCount(buys)} 回</span>
          </span>
          <span>
            <span className="text-faint">売りシグナル </span>
            <span className="text-purple">{formatCount(sells)} 回</span>
          </span>
          <span>
            <span className="text-faint">期間の最後 </span>
            {signals.data.holding_at_end ? "保有中" : "ノーポジション"}
          </span>
          {isSyntheticProvider(signals.data.provider) && <span className="text-loss">合成データ</span>}
        </div>
      )}

      {history.status === "success" ? (
        <PriceChart bars={history.data.bars} currency={symbol.currency} markers={markers} height={360} />
      ) : (
        <div className="grid h-[360px] place-items-center rounded-md border border-dashed border-line text-sm text-muted-foreground">
          {history.status === "error" ? history.error.message : "株価を取得しています"}
        </div>
      )}

      {signals.status === "success" &&
        signals.data.warnings.map((w) => (
          <p key={w} className="text-xs text-chart-4">
            注意: {w}
          </p>
        ))}
      <p className="text-xs leading-relaxed text-faint">
        ▲買 / ▼売 はシグナルが出た日(終値で判定)です。バックテストでは、その翌営業日の始値で売買します。
        判定には配当込みの調整後価格を使っています。
      </p>
    </div>
  );
}

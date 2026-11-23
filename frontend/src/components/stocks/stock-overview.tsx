"use client";

import { TriangleAlert, X } from "lucide-react";
import dynamic from "next/dynamic";
import { getHistory, getQuote, isSyntheticProvider, type Quote } from "@/lib/api";
import { formatCount, formatPct, formatPrice, formatSigned } from "@/lib/format";
import { type SelectedSymbol, useSelection } from "@/lib/store";
import { type ApiState, useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";
import { PeriodControls } from "./period-controls";

// チャートはブラウザでしか動かない(canvas を使う)ので、サーバー側では描画しない
const PriceChart = dynamic(() => import("@/components/charts/price-chart").then((m) => m.PriceChart), {
  ssr: false,
  loading: () => <ChartPlaceholder text="チャートを準備しています" />,
});

/** 選択中の銘柄の最新株価・期間設定・株価チャート */
export function StockOverview({ symbol }: { symbol: SelectedSymbol }) {
  const { period, interval, setPeriod, setInterval, setSymbol } = useSelection();

  const quote = useApi(symbol.symbol, (signal) => getQuote(symbol.symbol, signal));
  const historyKey = `${symbol.symbol}|${period.start}|${period.end}|${interval}`;
  const history = useApi(historyKey, (signal) =>
    getHistory(symbol.symbol, period.start, period.end, interval, signal),
  );

  const provider =
    history.status === "success" ? history.data.provider : quote.status === "success" ? quote.data.provider : null;
  const currency = quote.status === "success" ? quote.data.currency : (symbol.currency ?? null);

  return (
    <section aria-label="選択中の銘柄" className="rounded-lg border border-line bg-navy">
      {provider && isSyntheticProvider(provider) && (
        <div role="alert" className="flex items-center gap-2 border-b border-line bg-loss/10 px-5 py-2.5 text-sm text-loss">
          <TriangleAlert className="size-4 shrink-0" aria-hidden />
          テスト用の合成データです。実際の株価ではありません。
        </div>
      )}

      {/* 見出し: 銘柄名と最新株価 */}
      <header className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4 border-b border-line px-5 py-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-xl font-semibold tracking-tight">{symbol.name}</h2>
            <button
              type="button"
              aria-label="銘柄の選択を解除"
              onClick={() => setSymbol(null)}
              className="grid size-7 place-items-center rounded-md text-faint hover:bg-accent hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {symbol.symbol} ・ {symbol.market === "JP" ? "日本株" : "米国株"}
            {currency ? ` ・ ${currency}` : ""}
          </p>
        </div>
        <QuoteBlock state={quote} />
      </header>

      <div className="space-y-4 px-5 py-5">
        <PeriodControls period={period} interval={interval} onPeriod={setPeriod} onInterval={setInterval} />

        {history.status === "loading" && <ChartPlaceholder text="株価を取得しています" />}
        {history.status === "error" && (
          <ChartPlaceholder
            tone="error"
            text={history.error.message}
            hint={
              history.error.code === "RATE_LIMITED"
                ? "時間をおいてから、期間を変えずにもう一度開いてください。"
                : history.error.code === "NETWORK_ERROR"
                  ? "backend が起動しているか確認してください。"
                  : "期間や時間軸を変えてみてください。"
            }
          />
        )}
        {history.status === "success" && (
          <>
            <PriceChart bars={history.data.bars} currency={currency} />
            <p className="text-xs leading-relaxed text-faint">
              {history.data.bars[0].date} 〜 {history.data.bars.at(-1)!.date} ・{" "}
              <span data-testid="bar-count">{formatCount(history.data.bars.length)} 本</span> ・ 価格は分割調整済み・配当未調整 ・
              データ: {history.data.provider === "yahoo" ? "Yahoo Finance" : history.data.provider}
            </p>
            {history.data.warnings.length > 0 && (
              <ul className="space-y-1 text-xs text-chart-4">
                {history.data.warnings.map((w) => (
                  <li key={w}>注意: {w}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function QuoteBlock({ state }: { state: ApiState<Quote> }) {
  if (state.status === "loading" || state.status === "idle")
    return <div className="h-14 w-40 animate-pulse rounded-md bg-panel" aria-label="最新株価を取得中" />;
  if (state.status === "error")
    return <p className="max-w-xs text-sm text-loss">最新株価を取得できません: {state.error.message}</p>;

  const q = state.data;
  const dir = q.change == null ? 0 : Math.sign(q.change);
  return (
    <div className="sm:text-right" data-testid="quote">
      <p className="text-2xl font-semibold tracking-tight">{formatPrice(q.price, q.currency)}</p>
      {q.change != null && q.change_pct != null && (
        <p className={cn("text-sm", dir > 0 && "text-gain", dir < 0 && "text-loss", dir === 0 && "text-muted-foreground")}>
          {formatSigned(q.change, q.currency === "JPY" ? 1 : 2)}({formatPct(q.change_pct)})
        </p>
      )}
      <p className="mt-0.5 text-xs text-faint">{q.as_of} の日足(取引時間中は最新値)</p>
    </div>
  );
}

function ChartPlaceholder({ text, hint, tone }: { text: string; hint?: string; tone?: "error" }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className="flex h-[420px] flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-line px-6 text-center"
    >
      <p className={cn("text-sm", tone === "error" ? "text-loss" : "text-muted-foreground")}>{text}</p>
      {hint && <p className="text-xs text-faint">{hint}</p>}
    </div>
  );
}

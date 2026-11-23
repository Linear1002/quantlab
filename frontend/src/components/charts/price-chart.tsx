"use client";

import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type Time,
} from "lightweight-charts";
import { useEffect, useRef } from "react";
import type { Bar } from "@/lib/api";

/** CSS 変数の値を読む(canvas には var(--x) をそのまま渡せないため) */
function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

type Props = {
  bars: Bar[];
  /** 価格の小数桁を決める(JPY は 0.1 円単位、それ以外は 0.01 単位) */
  currency?: string | null;
  /** 売買シグナルの印(買い=下に▲、売り=上に▼) */
  markers?: { date: string; type: "buy" | "sell" }[];
  /** 出来高を表示するか(バックテスト結果の調整済み価格には出来高が無い) */
  showVolume?: boolean;
  height?: number;
};

/**
 * ローソク足 + 出来高のチャート(TradingView Lightweight Charts)。
 * チャートの作成は1回だけ行い、データが変わったら setData で差し替える。
 */
export function PriceChart({ bars, currency, markers, showVolume = true, height = 420 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);

  // 1. チャートを作る(画面に表示されたときに1回だけ)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const gain = cssVar("--gain");
    const loss = cssVar("--loss");
    const line = cssVar("--line");

    const chart = createChart(el, {
      autoSize: true, // 親要素の幅に合わせて自動でサイズ変更
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: cssVar("--text-muted"),
        fontFamily: getComputedStyle(document.body).fontFamily,
        fontSize: 11,
      },
      grid: { vertLines: { color: line }, horzLines: { color: line } },
      rightPriceScale: { borderColor: line },
      timeScale: { borderColor: line },
      crosshair: { mode: 0 },
      localization: { locale: "ja-JP", dateFormat: "yyyy-MM-dd" },
    });
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: gain,
      downColor: loss,
      wickUpColor: gain,
      wickDownColor: loss,
      borderVisible: false,
    });
    // 出来高は下 20% に小さく表示する
    let volume: ISeriesApi<"Histogram"> | null = null;
    if (showVolume) {
      volume = chart.addSeries(HistogramSeries, {
        priceFormat: { type: "volume" },
        priceScaleId: "",
        color: cssVar("--line-strong"),
      });
      volume.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    }
    candles.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: showVolume ? 0.25 : 0.08 } });

    chartRef.current = chart;
    candleRef.current = candles;
    volumeRef.current = volume;
    markersRef.current = createSeriesMarkers(candles, []);
    return () => {
      chart.remove();
      chartRef.current = candleRef.current = volumeRef.current = null;
      markersRef.current = null;
    };
    // showVolume は最初の1回だけ見る(途中で切り替えない)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. 通貨に合わせて価格の表示桁数を変える
  useEffect(() => {
    const jpy = currency === "JPY";
    candleRef.current?.applyOptions({
      priceFormat: { type: "price", precision: jpy ? 1 : 2, minMove: jpy ? 0.1 : 0.01 },
    });
  }, [currency]);

  // 3. データが変わったら差し替える
  useEffect(() => {
    if (!candleRef.current || !chartRef.current) return;
    candleRef.current.setData(
      bars.map((b) => ({ time: b.date, open: b.open, high: b.high, low: b.low, close: b.close })),
    );
    volumeRef.current?.setData(bars.map((b) => ({ time: b.date, value: b.volume })));
    chartRef.current.timeScale().fitContent();
  }, [bars]);

  // 4. 売買シグナルの印を付ける(日付順に並んでいる必要がある)
  useEffect(() => {
    if (!markersRef.current) return;
    const buy = cssVar("--cyan");
    const sell = cssVar("--purple");
    markersRef.current.setMarkers(
      (markers ?? []).map((m) =>
        m.type === "buy"
          ? { time: m.date, position: "belowBar", shape: "arrowUp", color: buy, text: "買" }
          : { time: m.date, position: "aboveBar", shape: "arrowDown", color: sell, text: "売" },
      ),
    );
  }, [markers]);

  return (
    <div
      ref={containerRef}
      data-testid="price-chart"
      role="img"
      aria-label={`株価チャート(${bars.length} 本)`}
      style={{ height }}
      className="w-full"
    />
  );
}

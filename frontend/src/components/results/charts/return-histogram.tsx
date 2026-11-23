"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SeriesPoint } from "@/lib/api";
import { axisProps, C, fmtPct, TooltipBox } from "./chart-kit";

/**
 * 株を保有していた日の日次リターンを集める。
 * 保有していない日(リターンが必ず 0%)を入れると 0 の棒だけが突出して分布が読めないので除く。
 * 「前日の終値時点で株を持っていた日」= その日の資産の変化が株価の影響を受けた日。
 */
export function exposedReturns(series: SeriesPoint[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < series.length; i++) {
    if (series[i - 1].position > 0) out.push(series[i].equity / series[i - 1].equity - 1);
  }
  return out;
}

type BinRow = { from: number; to: number; mid: number; count: number };

/** 等間隔のビン(区間)に分ける。区間の幅は 0.25% 単位で、端の外れ値は両端のビンにまとめる */
export function histogram(values: number[], targetBins = 30): BinRow[] {
  if (values.length === 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))];
  const lo = q(0.01);
  const hi = q(0.99);
  const width = Math.max(0.0025, Math.ceil(((hi - lo) / targetBins) / 0.0025) * 0.0025);
  const start = Math.floor(lo / width) * width;
  const n = Math.max(1, Math.ceil((hi - start) / width) + 1);
  const bins: BinRow[] = Array.from({ length: n }, (_, i) => ({
    from: start + i * width,
    to: start + (i + 1) * width,
    mid: start + (i + 0.5) * width,
    count: 0,
  }));
  for (const v of values) {
    const i = Math.min(n - 1, Math.max(0, Math.floor((v - start) / width)));
    bins[i].count++;
  }
  return bins;
}

export function ReturnHistogram({ series, interval }: { series: SeriesPoint[]; interval: "1d" | "1wk" }) {
  const values = useMemo(() => exposedReturns(series), [series]);
  const bins = useMemo(() => histogram(values), [values]);
  const unit = interval === "1d" ? "日" : "週";

  if (values.length < 2) {
    return <p className="text-sm text-muted-foreground">株を保有していた{unit}が少ないため、分布を表示できません。</p>;
  }
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1));
  const up = values.filter((v) => v > 0).length;

  return (
    <div className="space-y-3">
      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
        {[
          ["対象", `保有していた ${values.length.toLocaleString("ja-JP")} ${unit}`],
          ["平均", fmtPct(mean, 3)],
          ["標準偏差", fmtPct(sd, 3).replace("+", "")],
          ["上昇した割合", `${((up / values.length) * 100).toFixed(1)}%`],
          ["最大 / 最小", `${fmtPct(Math.max(...values))} / ${fmtPct(Math.min(...values))}`],
        ].map(([k, v]) => (
          <div key={k} className="flex gap-1.5">
            <dt className="text-faint">{k}</dt>
            <dd className="text-foreground">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="h-52" role="img" aria-label={`保有中の${unit}次リターンの分布`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={bins} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={1}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="mid" {...axisProps} tickFormatter={(v: number) => `${v < 0 ? "−" : ""}${Math.abs(v * 100).toFixed(1)}%`} minTickGap={24} />
            <YAxis {...axisProps} width={40} allowDecimals={false} />
            <ReferenceLine x={bins.reduce((best, b) => (Math.abs(b.mid) < Math.abs(best.mid) ? b : best)).mid} stroke={C.zero} />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const b = payload[0].payload as BinRow;
                return (
                  <TooltipBox
                    title={`${fmtPct(b.from)} 〜 ${fmtPct(b.to)}`}
                    rows={[{ label: "回数", value: `${b.count} ${unit}`, color: C.strategy }]}
                  />
                );
              }}
            />
            <Bar dataKey="count" fill={C.strategy} radius={[3, 3, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-faint">両端のビンには、それより外側の値(上位・下位 1%)も含めています。</p>
    </div>
  );
}

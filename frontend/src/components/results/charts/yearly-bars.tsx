"use client";

import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axisProps, C, fmtPct, Legend, pctTick, TooltipBox } from "./chart-kit";

type PR = { period: string; ret: number };

/** 年別リターン。戦略と Buy and Hold を年ごとに並べる(棒の高さ = リターン) */
export function YearlyBars({ strategyName, yearly, benchmarkYearly }: { strategyName: string; yearly: PR[]; benchmarkYearly: PR[] }) {
  const bench = new Map(benchmarkYearly.map((r) => [r.period, r.ret]));
  const data = yearly.map((r) => ({ year: r.period, strategy: r.ret, benchmark: bench.get(r.period) ?? 0 }));

  return (
    <div className="space-y-3">
      <Legend
        items={[
          { label: strategyName, color: C.strategy },
          { label: "Buy and Hold", color: C.benchmark },
        ]}
      />
      <div className="h-56" role="img" aria-label="年別リターンの比較">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2} barCategoryGap="28%">
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="year" {...axisProps} />
            <YAxis {...axisProps} width={48} tickFormatter={pctTick} />
            <ReferenceLine y={0} stroke={C.zero} />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as (typeof data)[number];
                return (
                  <TooltipBox
                    title={`${p.year}年`}
                    rows={[
                      { label: strategyName, value: fmtPct(p.strategy), color: C.strategy },
                      { label: "Buy and Hold", value: fmtPct(p.benchmark), color: C.benchmark },
                    ]}
                  />
                );
              }}
            />
            <Bar dataKey="strategy" fill={C.strategy} radius={[3, 3, 3, 3]} maxBarSize={36} isAnimationActive={false} />
            <Bar dataKey="benchmark" fill={C.benchmark} radius={[3, 3, 3, 3]} maxBarSize={36} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

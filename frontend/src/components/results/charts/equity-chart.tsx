"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SeriesPoint } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { axisProps, C, compactMoney, fmtPct, Legend, monthTick, TooltipBox } from "./chart-kit";

type Props = { series: SeriesPoint[]; strategyName: string; currency: string; initial: number };

/** 資産推移(Equity Curve)。戦略と Buy and Hold を同じ軸で比べる */
export function EquityChart({ series, strategyName, currency, initial }: Props) {
  return (
    <div className="space-y-3">
      <Legend
        items={[
          { label: strategyName, color: C.strategy },
          { label: "Buy and Hold", color: C.benchmark },
        ]}
      />
      <div className="h-72 sm:h-80" role="img" aria-label={`${strategyName} と Buy and Hold の資産推移`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="date" {...axisProps} tickFormatter={monthTick} minTickGap={48} />
            <YAxis {...axisProps} width={56} tickFormatter={(v: number) => compactMoney(v, currency)} domain={["auto", "auto"]} />
            {/* 初期資金の線: これより上なら利益、下なら損失 */}
            <ReferenceLine y={initial} stroke={C.zero} strokeDasharray="4 4" />
            <Tooltip
              cursor={{ stroke: C.muted, strokeWidth: 1 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as SeriesPoint;
                return (
                  <TooltipBox
                    title={p.date}
                    rows={[
                      { label: strategyName, value: `${formatPrice(p.equity, currency)}(${fmtPct(p.equity / initial - 1)})`, color: C.strategy },
                      { label: "Buy and Hold", value: `${formatPrice(p.benchmark, currency)}(${fmtPct(p.benchmark / initial - 1)})`, color: C.benchmark },
                      { label: "保有", value: p.position > 0 ? `${p.position.toLocaleString("ja-JP")} 株` : "なし" },
                    ]}
                  />
                );
              }}
            />
            <Line dataKey="benchmark" stroke={C.benchmark} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line dataKey="equity" stroke={C.strategy} strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

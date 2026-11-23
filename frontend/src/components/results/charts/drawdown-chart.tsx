"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SeriesPoint } from "@/lib/api";
import { axisProps, C, fmtPct, Legend, monthTick, pctTick, TooltipBox } from "./chart-kit";

/** ドローダウン(各時点で、それまでの最高値から何%下がっているか) */
export function DrawdownChart({ series, strategyName }: { series: SeriesPoint[]; strategyName: string }) {
  return (
    <div className="space-y-3">
      <Legend
        items={[
          { label: strategyName, color: C.strategy },
          { label: "Buy and Hold", color: C.benchmark },
        ]}
      />
      <div className="h-56" role="img" aria-label={`${strategyName} と Buy and Hold のドローダウン`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="date" {...axisProps} tickFormatter={monthTick} minTickGap={48} />
            <YAxis {...axisProps} width={56} tickFormatter={pctTick} domain={["auto", 0]} />
            <ReferenceLine y={0} stroke={C.zero} />
            <Tooltip
              cursor={{ stroke: C.muted, strokeWidth: 1 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as SeriesPoint;
                return (
                  <TooltipBox
                    title={p.date}
                    rows={[
                      { label: strategyName, value: fmtPct(p.drawdown), color: C.strategy },
                      { label: "Buy and Hold", value: fmtPct(p.benchmark_drawdown), color: C.benchmark },
                    ]}
                  />
                );
              }}
            />
            <Line dataKey="benchmark_drawdown" stroke={C.benchmark} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line dataKey="drawdown" stroke={C.strategy} strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

"use client";

/**
 * 結果ページのグラフで共通に使う色・軸の設定・ツールチップ・凡例。
 * Recharts は SVG の属性に色を書くので、CSS 変数ではなく実際の色コードをここに置く
 * (globals.css の --series-* と同じ値。変えるときは両方)。
 */

export const C = {
  strategy: "#8466f0",
  benchmark: "#2a9fb0",
  gain: "#34d39a",
  loss: "#ff6b6b",
  grid: "#1c2740",
  axis: "#5d6782",
  text: "#e7ebf3",
  muted: "#8b95ad",
  zero: "#2a3858",
};

export const axisProps = {
  stroke: C.grid,
  tick: { fill: C.axis, fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

/** "2024-03-15" → "2024/03"(軸のラベル用) */
export const monthTick = (d: string) => `${d.slice(0, 4)}/${d.slice(5, 7)}`;

export const pctTick = (v: number) => `${v < 0 ? "−" : ""}${Math.abs(v * 100).toFixed(0)}%`;

export function fmtPct(v: number, digits = 2) {
  const s = Math.abs(v * 100).toFixed(digits);
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${s}%`;
}

/** 大きな金額を短く(1,743,249 → 174万 / 17,432 → 1.7万)。軸ラベル用 */
export function compactMoney(v: number, currency: string) {
  if (currency === "JPY") return new Intl.NumberFormat("ja-JP", { notation: "compact", maximumFractionDigits: 1 }).format(v);
  return `$${new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v)}`;
}

export type LegendItem = { label: string; color: string; dashed?: boolean };

/** グラフの上に置く凡例(色だけでなく名前も必ず出す) */
export function Legend({ items }: { items: LegendItem[] }) {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground" aria-label="凡例">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-2">
          <svg width="18" height="8" aria-hidden>
            <line
              x1="1"
              y1="4"
              x2="17"
              y2="4"
              stroke={i.color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={i.dashed ? "3 3" : undefined}
            />
          </svg>
          {i.label}
        </li>
      ))}
    </ul>
  );
}

type TooltipRow = { label: string; value: string; color?: string };

/** ツールチップの見た目(Recharts の content に渡す) */
export function TooltipBox({ title, rows }: { title: string; rows: TooltipRow[] }) {
  return (
    <div className="min-w-40 rounded-md border border-line-strong bg-panel/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
      <p className="mb-1.5 text-faint">{title}</p>
      <dl className="space-y-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-4">
            <dt className="flex items-center gap-1.5 text-muted-foreground">
              {r.color && <span className="size-2 rounded-full" style={{ background: r.color }} aria-hidden />}
              {r.label}
            </dt>
            <dd className="text-foreground">{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

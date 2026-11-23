"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { C, fmtPct } from "./chart-kit";

type PR = { period: string; ret: number };
type Props = {
  strategyName: string;
  monthly: PR[];
  yearly: PR[];
  benchmarkMonthly: PR[];
  benchmarkYearly: PR[];
};

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

/**
 * 月別リターンの表(行 = 年、列 = 月、右端 = 年間)。
 * 色はプラスが緑、マイナスが赤で、絶対値が大きいほど濃い(0 付近は背景に近い色)。
 * 数値もセルに書くので、色が見分けにくくても読める。
 */
export function MonthlyHeatmap({ strategyName, monthly, yearly, benchmarkMonthly, benchmarkYearly }: Props) {
  const [which, setWhich] = useState<"strategy" | "benchmark">("strategy");
  const m = which === "strategy" ? monthly : benchmarkMonthly;
  const y = which === "strategy" ? yearly : benchmarkYearly;

  const byMonth = new Map(m.map((r) => [r.period, r.ret]));
  const byYear = new Map(y.map((r) => [r.period, r.ret]));
  const years = [...byYear.keys()];
  // 色の濃さの基準: 月次リターンの絶対値の最大(ただし 2%〜15% に収める)
  const scale = Math.min(0.15, Math.max(0.02, ...m.map((r) => Math.abs(r.ret))));

  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="表示する系列" className="inline-flex rounded-md border border-line p-0.5">
        {(
          [
            ["strategy", strategyName],
            ["benchmark", "Buy and Hold"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={which === k}
            onClick={() => setWhich(k)}
            className={cn(
              "h-7 rounded-[5px] px-3 text-xs",
              which === k ? "bg-blue text-white" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-separate border-spacing-0.5 text-[11px]" data-testid="monthly-table">
          <caption className="sr-only">月別リターン({which === "strategy" ? strategyName : "Buy and Hold"})</caption>
          <thead>
            <tr className="text-faint">
              <th scope="col" className="px-1 py-1 text-left font-normal">年</th>
              {MONTHS.map((mo) => (
                <th key={mo} scope="col" className="px-1 py-1 font-normal">
                  {mo}月
                </th>
              ))}
              <th scope="col" className="px-1 py-1 font-normal">年間</th>
            </tr>
          </thead>
          <tbody>
            {years.map((yr) => (
              <tr key={yr}>
                <th scope="row" className="px-1 py-1.5 text-left font-normal text-muted-foreground">
                  {yr}
                </th>
                {MONTHS.map((mo) => {
                  const v = byMonth.get(`${yr}-${String(mo).padStart(2, "0")}`);
                  return <Cell key={mo} value={v} scale={scale} />;
                })}
                <Cell value={byYear.get(yr)} scale={Math.max(scale * 3, 0.1)} strong />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-faint">空欄は分析期間外の月です。最初の月は初期資金を基準にしています。</p>
    </div>
  );
}

function Cell({ value, scale, strong }: { value: number | undefined; scale: number; strong?: boolean }) {
  if (value === undefined) return <td className="rounded-sm bg-panel/40 px-1 py-1.5" />;
  const intensity = Math.min(1, Math.abs(value) / scale);
  const color = value >= 0 ? C.gain : C.loss;
  // 濃さは 8%〜60%(文字が読めるように上限を抑える)。
  // oklch で混ぜると、紺色の背景と混ざるときに色相がずれる(緑 → 青緑、赤 → 紫)ので srgb で混ぜる
  const bg = `color-mix(in srgb, ${color} ${Math.round(8 + intensity * 52)}%, var(--panel))`;
  return (
    <td
      className={cn("rounded-sm px-1 py-1.5 text-center text-foreground tabular-nums", strong && "font-semibold")}
      style={{ background: bg }}
      title={fmtPct(value)}
    >
      {fmtPct(value, 1)}
    </td>
  );
}

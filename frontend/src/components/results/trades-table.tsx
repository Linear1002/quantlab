"use client";

import type { Trade } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { fmtPct } from "./charts/chart-kit";

/** 取引履歴の表。損益は手数料込み。期間末に保有中の取引は「保有中」(含み損益) */
export function TradesTable({ trades, currency }: { trades: Trade[]; currency: string }) {
  if (trades.length === 0) {
    return <p className="text-sm text-muted-foreground">この期間に取引はありませんでした。</p>;
  }
  const money = (v: number) => formatPrice(v, currency, true);
  return (
    <div className="space-y-3">
      <div className="max-h-[28rem] overflow-auto rounded-md border border-line">
        <table className="w-full min-w-[760px] text-xs sm:text-sm" data-testid="trades-table">
          <thead className="sticky top-0 bg-panel text-left text-xs text-faint">
            <tr>
              {["#", "エントリー日", "エグジット日", "買値", "売値", "株数", "損益", "リターン", "保有期間", "状態"].map((h, i) => (
                <th key={h} scope="col" className={cn("px-3 py-2 font-normal", i >= 3 && i <= 8 && "text-right")}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {trades.map((t, i) => {
              const tone = t.pnl > 0 ? "text-gain" : t.pnl < 0 ? "text-loss" : "text-muted-foreground";
              return (
                <tr key={`${t.entry_date}-${i}`} className="border-t border-line/60">
                  <td className="px-3 py-2 text-faint">{i + 1}</td>
                  <td className="px-3 py-2">{t.entry_date}</td>
                  <td className="px-3 py-2">{t.exit_date}</td>
                  <td className="px-3 py-2 text-right">{money(t.entry_price)}</td>
                  <td className="px-3 py-2 text-right">{money(t.exit_price)}</td>
                  <td className="px-3 py-2 text-right">{t.qty.toLocaleString("ja-JP")}</td>
                  <td className={cn("px-3 py-2 text-right", tone)}>
                    {t.pnl > 0 ? "+" : t.pnl < 0 ? "−" : ""}
                    {money(Math.abs(t.pnl))}
                  </td>
                  <td className={cn("px-3 py-2 text-right", tone)}>{fmtPct(t.ret)}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">
                    {t.days_held} 日({t.bars_held} 本)
                  </td>
                  <td className="px-3 py-2">
                    {t.status === "open" ? <span className="text-chart-4">保有中</span> : <span className="text-faint">決済済み</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs leading-relaxed text-faint">
        損益・リターンは往復の手数料込みです。価格は配当込みの調整後価格(または分割調整のみの価格)なので、
        当時の実際の約定価格とは少し異なります。保有中の取引は最終日の終値で評価した含み損益です(売りの手数料は含みません)。
      </p>
    </div>
  );
}

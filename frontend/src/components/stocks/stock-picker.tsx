"use client";

import Link from "next/link";
import { useSelection, useSelectionHydrated } from "@/lib/store";
import { StockOverview } from "./stock-overview";
import { StockSearch } from "./stock-search";

/** 銘柄ページの本体: 検索 → 選択 → 株価確認 → 次のステップへ */
export function StockPicker() {
  const hydrated = useSelectionHydrated();
  const symbol = useSelection((s) => s.symbol);
  const setSymbol = useSelection((s) => s.setSymbol);

  return (
    <div className="space-y-6">
      <StockSearch
        onSelect={(s) =>
          setSymbol({ symbol: s.symbol, name: s.name, market: s.market, currency: s.currency })
        }
      />

      {hydrated && symbol && (
        <>
          {/* key を付けて、銘柄が変わったら中身を作り直す(前の銘柄のチャートが残らないように) */}
          <StockOverview key={symbol.symbol} symbol={symbol} />
          <div className="flex justify-end">
            <Link
              href="/strategies"
              className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85"
            >
              この銘柄で戦略を選ぶ
            </Link>
          </div>
        </>
      )}

      {hydrated && !symbol && (
        <p className="text-sm text-muted-foreground">
          銘柄を選ぶと、最新株価と過去の株価チャートが表示されます。
        </p>
      )}
    </div>
  );
}

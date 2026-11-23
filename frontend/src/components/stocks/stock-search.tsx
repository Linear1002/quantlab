"use client";

import { Search } from "lucide-react";
import { useDeferredValue, useEffect, useId, useState } from "react";
import { type Market, searchStocks, type SymbolInfo } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";

const MARKETS: { value: Market | undefined; label: string }[] = [
  { value: undefined, label: "すべて" },
  { value: "JP", label: "日本株" },
  { value: "US", label: "米国株" },
];

/** 入力が止まってから ms ミリ秒後の値を返す(1文字ごとに API を呼ばないため) */
function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

type Props = { onSelect: (s: SymbolInfo) => void };

/**
 * 銘柄検索の入力欄と候補リスト。
 * キーボード操作: ↑↓ で候補を移動、Enter で決定、Esc で候補を閉じる。
 */
export function StockSearch({ onSelect }: Props) {
  const [text, setText] = useState("");
  const [market, setMarket] = useState<Market | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();

  const query = useDebounced(text.trim(), 300);
  const key = query ? `${query}|${market ?? ""}` : null;
  const state = useApi(key, (signal) => searchStocks(query, market, signal));
  // 新しい結果が届くまで前の結果を表示し続ける(候補がちらつかないように)
  const deferred = useDeferredValue(state.status === "success" ? state.data : null);
  const results = deferred?.results ?? [];

  const choose = (s: SymbolInfo) => {
    onSelect(s);
    setText("");
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(results[Math.min(active, results.length - 1)]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const showList = open && key !== null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="市場">
        {MARKETS.map((m) => (
          <button
            key={m.label}
            type="button"
            role="radio"
            aria-checked={market === m.value}
            onClick={() => setMarket(m.value)}
            className={cn(
              "h-7 rounded-md border px-2.5 text-xs transition-colors",
              market === m.value
                ? "border-blue/60 bg-blue/15 text-foreground"
                : "border-line text-muted-foreground hover:text-foreground",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint"
          aria-hidden
        />
        <input
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList && results[active] ? `${listId}-${active}` : undefined}
          aria-label="銘柄名・ティッカー・証券コードで検索"
          placeholder="銘柄名・ティッカー・証券コード(例: トヨタ、AAPL、7203)"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
          className="h-11 w-full rounded-md border border-input bg-panel pr-3 pl-9 text-sm text-foreground placeholder:text-faint focus:border-blue focus:outline-none"
        />

        {showList && (
          <div className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-md border border-line-strong bg-panel">
            {state.status === "error" ? (
              <p role="alert" className="px-4 py-3 text-sm text-loss">
                {state.error.message}
              </p>
            ) : state.status === "loading" && results.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">検索しています</p>
            ) : results.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">
                「{query}」に一致する銘柄は見つかりませんでした。証券コード(7203)やティッカー(AAPL)でも検索できます。
              </p>
            ) : (
              <ul id={listId} role="listbox" aria-label="検索結果" className="max-h-80 overflow-y-auto py-1">
                {results.map((r, i) => (
                  <li
                    key={r.symbol}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === active}
                    onMouseDown={(e) => e.preventDefault()} // 入力欄のフォーカスが外れる前に選択する
                    onClick={() => choose(r)}
                    onMouseEnter={() => setActive(i)}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm",
                      i === active && "bg-accent",
                    )}
                  >
                    <span className="w-20 shrink-0 font-medium text-foreground">{r.symbol}</span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">{r.name}</span>
                    <span className="shrink-0 text-xs text-faint">
                      {r.market === "JP" ? "日本" : "米国"}
                      {r.exchange ? ` / ${r.exchange}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {deferred && !deferred.jp_name_search && (
        <p className="text-xs leading-relaxed text-faint">
          日本語の銘柄名検索は無効です。backend で{" "}
          <code className="text-muted-foreground">uv run python scripts/update_jpx_master.py</code>{" "}
          を実行すると使えるようになります。
        </p>
      )}
    </div>
  );
}

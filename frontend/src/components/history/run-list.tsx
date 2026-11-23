"use client";

import Link from "next/link";
import { useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { ApiError, deleteRun, isSyntheticProvider, listRuns, type RunSummary } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";

const DASH = "—";
const pct = (v: number | null) =>
  v == null ? DASH : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v * 100).toFixed(2)}%`;
const tone = (v: number | null) => (v == null || v === 0 ? "" : v > 0 ? "text-gain" : "text-loss");
const currencyOf = (symbol: string) => (symbol.toUpperCase().endsWith(".T") ? "JPY" : "USD");

type Props = {
  /** 1ページの件数 */
  pageSize?: number;
  /** ダッシュボード用: 列を減らし、削除・ページ送りを出さない */
  compact?: boolean;
};

/** 保存したバックテスト結果の一覧。行を押すと結果を開く */
export function RunList({ pageSize = 20, compact = false }: Props) {
  const [page, setPage] = useState(0);
  const [version, setVersion] = useState(0); // 削除したら一覧を取り直すための番号
  const state = useApi(`runs:${page}:${pageSize}:${version}`, (signal) =>
    listRuns(pageSize, page * pageSize, signal),
  );

  if (state.status === "error") {
    return <p role="alert" className="text-sm text-loss">履歴を取得できません: {state.error.message}</p>;
  }
  if (state.status !== "success") return <p className="text-sm text-muted-foreground">読み込んでいます</p>;

  const { items, total } = state.data;
  if (total === 0) {
    return (
      <EmptyState
        title="まだバックテストを実行していません"
        body="実行したバックテストは自動で保存され、ここに一覧で表示されます。"
        action={{ href: "/stocks", label: "銘柄を選ぶ" }}
      />
    );
  }
  const pages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-3">
      {/* relative: 表の中の sr-only(position: absolute)がスクロール枠の外にはみ出さないように */}
      <div className="relative overflow-x-auto">
        <table className={cn("w-full text-xs sm:text-sm", !compact && "min-w-[880px]")} data-testid="run-list">
          <thead className="text-left text-xs whitespace-nowrap text-faint">
            <tr className="border-b border-line">
              <th scope="col" className="py-2 pr-3 font-normal">実行日時</th>
              <th scope="col" className="py-2 pr-3 font-normal">銘柄 × 戦略</th>
              {!compact && <th scope="col" className="py-2 pr-3 font-normal">分析期間</th>}
              {!compact && <th scope="col" className="py-2 pr-3 text-right font-normal">初期資金</th>}
              <th scope="col" className="py-2 pr-3 text-right font-normal">Total Return</th>
              {!compact && <th scope="col" className="py-2 pr-3 text-right font-normal">CAGR</th>}
              <th scope="col" className="py-2 pr-3 text-right font-normal">最大DD</th>
              {!compact && <th scope="col" className="py-2 font-normal"><span className="sr-only">操作</span></th>}
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <Row key={r.id} run={r} compact={compact} onDeleted={() => setVersion((v) => v + 1)} />
            ))}
          </tbody>
        </table>
      </div>
      {!compact && pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-faint">
            全 {total} 件中 {page * pageSize + 1}〜{Math.min(total, (page + 1) * pageSize)} 件
          </span>
          <div className="flex gap-2">
            <PageButton disabled={page === 0} onClick={() => setPage((p) => p - 1)}>前へ</PageButton>
            <PageButton disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>次へ</PageButton>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ run: r, compact, onDeleted }: { run: RunSummary; compact: boolean; onDeleted: () => void }) {
  // 削除は2段階: 1回目で「本当に削除」に変わり、2回目で実行する(押し間違い防止)
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const href = `/results/${r.id}`;

  const remove = async () => {
    try {
      await deleteRun(r.id);
      onDeleted();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    }
  };

  return (
    <tr className="border-b border-line/60 hover:bg-accent/40">
      <td className="py-2.5 pr-3 whitespace-nowrap text-muted-foreground">
        {new Date(r.created_at).toLocaleString("ja-JP", { dateStyle: "short", timeStyle: "short" })}
      </td>
      <td className="py-2.5 pr-3">
        <Link href={href} className="block hover:underline">
          <span className="text-foreground">{r.symbol_name}</span>
          <span className="text-faint">({r.symbol})</span>
          <span className="text-muted-foreground"> × {r.strategy_name}</span>
          {isSyntheticProvider(r.provider) && <span className="ml-2 text-xs whitespace-nowrap text-loss">合成データ</span>}
        </Link>
      </td>
      {!compact && (
        <td className="py-2.5 pr-3 whitespace-nowrap text-muted-foreground">
          {r.start} 〜 {r.end}
          <span className="text-faint"> ・{r.interval === "1d" ? "日足" : "週足"}</span>
        </td>
      )}
      {!compact && (
        <td className="py-2.5 pr-3 text-right whitespace-nowrap text-muted-foreground">
          {formatPrice(r.initial_capital, currencyOf(r.symbol))}
        </td>
      )}
      <td className={cn("py-2.5 pr-3 text-right whitespace-nowrap", tone(r.total_return))}>{pct(r.total_return)}</td>
      {!compact && <td className={cn("py-2.5 pr-3 text-right whitespace-nowrap", tone(r.cagr))}>{pct(r.cagr)}</td>}
      <td className="py-2.5 pr-3 text-right whitespace-nowrap text-muted-foreground">{pct(r.max_drawdown)}</td>
      {!compact && (
        <td className="py-2.5 text-right whitespace-nowrap">
          {error && <span className="mr-2 text-xs text-loss">{error}</span>}
          {confirming ? (
            <>
              <button type="button" onClick={remove} className="mr-2 text-xs text-loss hover:underline">
                本当に削除
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="text-xs text-muted-foreground hover:underline">
                やめる
              </button>
            </>
          ) : (
            <button
              type="button"
              aria-label={`${r.symbol_name} × ${r.strategy_name} の結果を削除`}
              onClick={() => setConfirming(true)}
              className="text-xs text-faint hover:text-loss"
            >
              削除
            </button>
          )}
        </td>
      )}
    </tr>
  );
}

function PageButton({ disabled, onClick, children }: { disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="h-8 rounded-md border border-line px-3 text-sm text-muted-foreground hover:text-foreground disabled:opacity-40"
    >
      {children}
    </button>
  );
}

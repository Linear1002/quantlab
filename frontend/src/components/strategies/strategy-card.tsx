"use client";

import { Check, ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import type { StrategyCategory, StrategyDef } from "@/lib/api";
import { cn } from "@/lib/utils";

export const CATEGORY_LABEL: Record<StrategyCategory, string> = {
  trend: "トレンドフォロー",
  oscillator: "逆張り(オシレーター)",
  mean_reversion: "平均回帰",
  benchmark: "ベンチマーク",
};

const DIFFICULTY_LABEL = { 1: "初級", 2: "中級", 3: "上級" } as const;

type Props = {
  strategy: StrategyDef;
  selected: boolean;
  onSelect: () => void;
};

/** 戦略1つ分のカード。考え方・売買条件・向いている相場・リスク・難易度をまとめて見せる */
export function StrategyCard({ strategy: s, selected, onSelect }: Props) {
  // スマホでは詳細を折りたたむ(8枚すべて展開すると縦に長くなりすぎるため)。PC では常に表示
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  return (
    <article
      aria-label={s.name}
      className={cn(
        "flex flex-col rounded-lg border bg-navy transition-colors",
        selected ? "border-purple/70" : "border-line hover:border-line-strong",
      )}
    >
      <header className="flex items-start justify-between gap-4 px-5 pt-5">
        <div>
          <h2 className="text-base font-semibold tracking-tight">{s.name}</h2>
          <p className="mt-1 text-xs text-faint">
            {CATEGORY_LABEL[s.category]} ・ 難易度 {DIFFICULTY_LABEL[s.difficulty]}
          </p>
        </div>
        <Difficulty level={s.difficulty} />
      </header>

      <p className="px-5 pt-3 text-sm leading-relaxed text-foreground">{s.summary}</p>

      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={detailsId}
        onClick={() => setExpanded((v) => !v)}
        className="mx-5 mt-3 inline-flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground lg:hidden"
      >
        {expanded ? "詳細を閉じる" : "詳しく見る"}
        <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} aria-hidden />
      </button>

      <dl
        id={detailsId}
        className={cn(
          "gap-x-4 gap-y-2.5 px-5 pt-4 pb-5 text-sm leading-relaxed sm:grid-cols-[7rem_1fr] lg:grid",
          expanded ? "grid" : "hidden",
        )}
      >
        <dt className="text-faint">考え方</dt>
        <dd className="text-muted-foreground">{s.idea}</dd>
        <dt className="text-faint">買い</dt>
        <dd className="text-muted-foreground">{s.buy_rule}</dd>
        <dt className="text-faint">売り</dt>
        <dd className="text-muted-foreground">{s.sell_rule}</dd>
        <dt className="text-faint">向いている相場</dt>
        <dd className="text-muted-foreground">{s.suitable}</dd>
        <dt className="text-faint">主なリスク</dt>
        <dd>
          <ul className="list-disc space-y-1 pl-4 text-muted-foreground marker:text-faint">
            {s.risks.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </dd>
      </dl>

      <footer className="mt-auto border-t border-line px-5 py-3">
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={selected}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors",
            selected
              ? "bg-purple/15 text-purple"
              : "bg-primary text-primary-foreground hover:bg-primary/85",
          )}
        >
          {selected && <Check className="size-4" aria-hidden />}
          {selected ? "選択中" : "この戦略を選ぶ"}
        </button>
      </footer>
    </article>
  );
}

/** 難易度を3つの点で表す(●●○ = 中級) */
function Difficulty({ level }: { level: 1 | 2 | 3 }) {
  return (
    <span className="flex gap-1 pt-1.5" aria-hidden>
      {[1, 2, 3].map((i) => (
        <span key={i} className={cn("size-1.5 rounded-full", i <= level ? "bg-purple" : "bg-line-strong")} />
      ))}
    </span>
  );
}

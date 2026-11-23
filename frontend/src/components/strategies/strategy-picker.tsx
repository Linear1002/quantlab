"use client";

import Link from "next/link";
import { useRef } from "react";
import { getStrategies, type StrategyDef } from "@/lib/api";
import { useSelection, useSelectionHydrated } from "@/lib/store";
import { useApi } from "@/lib/use-api";
import { ParamForm } from "./param-form";
import { SignalPreview } from "./signal-preview";
import { StrategyCard } from "./strategy-card";

/** 戦略ページの本体: カード一覧 → 選択 → パラメータ調整 → シグナル確認 */
export function StrategyPicker() {
  const hydrated = useSelectionHydrated();
  const list = useApi("strategies", getStrategies);
  const selected = useSelection((s) => s.strategy);
  const setStrategy = useSelection((s) => s.setStrategy);
  const configRef = useRef<HTMLElement>(null);

  if (list.status === "error") {
    return (
      <p role="alert" className="text-sm text-loss">
        戦略の一覧を取得できません: {list.error.message}
      </p>
    );
  }
  if (list.status !== "success" || !hydrated) {
    return <p className="text-sm text-muted-foreground">戦略を読み込んでいます</p>;
  }

  const strategies = list.data;
  const current = selected ? strategies.find((s) => s.id === selected.id) : undefined;

  const choose = (s: StrategyDef) => {
    if (selected?.id !== s.id) {
      setStrategy({
        id: s.id,
        name: s.name,
        params: Object.fromEntries(s.params.map((p) => [p.name, p.default])),
      });
    }
    // 選んだら、パラメータ設定の場所までスクロールする
    requestAnimationFrame(() => configRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  return (
    <div className="space-y-10">
      <div className="grid gap-4 lg:grid-cols-2">
        {strategies.map((s) => (
          <StrategyCard key={s.id} strategy={s} selected={selected?.id === s.id} onSelect={() => choose(s)} />
        ))}
      </div>

      {selected && current && (
        <section
          ref={configRef}
          aria-label="選択中の戦略の設定"
          className="scroll-mt-24 rounded-lg border border-purple/50 bg-navy"
        >
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
            <h2 className="text-base font-semibold">{current.name} の設定</h2>
            <Link
              href="/backtest"
              className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/85"
            >
              この設定でバックテストへ
            </Link>
          </header>
          <div className="space-y-8 px-5 py-5">
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">パラメータ</h3>
              {/* key で戦略ごとにフォームを作り直す(前の戦略の入力が残らないように) */}
              <ParamForm
                key={current.id}
                defs={current.params}
                values={selected.params}
                onChange={(params) => setStrategy({ ...selected, params })}
              />
            </div>
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">売買シグナルの確認</h3>
              <SignalPreview strategy={selected} />
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

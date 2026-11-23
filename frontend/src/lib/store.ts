"use client";

import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Interval, Market } from "./api";
import { toIsoDate, yearsAgo } from "./format";

// 3ステップ(銘柄 → 戦略 → 実行)で選んだ内容を、画面をまたいで保持するストア。
// localStorage に保存するので、リロードしても選択は消えない。

export type SelectedSymbol = {
  symbol: string; // "7203.T", "AAPL"
  name: string;
  market: Market;
  currency?: string | null;
};

export type SelectedStrategy = {
  id: string; // "sma_cross" など(backend の strategy id と同じ)
  name: string;
  params: Record<string, number>;
};

/** 分析期間。日付は "YYYY-MM-DD"。preset はどのボタンで選んだか(カスタムなら null) */
export type Period = { start: string; end: string; preset: number | null };

export const defaultPeriod = (): Period => ({
  start: yearsAgo(5),
  end: toIsoDate(new Date()),
  preset: 5,
});

type SelectionState = {
  symbol: SelectedSymbol | null;
  strategy: SelectedStrategy | null;
  period: Period;
  interval: Interval;
  setSymbol: (s: SelectedSymbol | null) => void;
  setStrategy: (s: SelectedStrategy | null) => void;
  setPeriod: (p: Period) => void;
  setInterval: (i: Interval) => void;
  reset: () => void;
};

export const useSelection = create<SelectionState>()(
  persist(
    (set) => ({
      symbol: null,
      strategy: null,
      period: defaultPeriod(),
      interval: "1d",
      setSymbol: (symbol) => set({ symbol }),
      setStrategy: (strategy) => set({ strategy }),
      setPeriod: (period) => set({ period }),
      setInterval: (interval) => set({ interval }),
      reset: () => set({ symbol: null, strategy: null, period: defaultPeriod(), interval: "1d" }),
    }),
    {
      name: "quantlab-selection",
      version: 2,
      storage: createJSONStorage(() => localStorage),
      // 関数は保存しない
      partialize: ({ symbol, strategy, period, interval }) => ({ symbol, strategy, period, interval }),
      // 古い形式(v1: 期間なし)の保存データを読み込めるようにする
      migrate: (persisted, version) => {
        const old = (persisted ?? {}) as Partial<SelectionState>;
        if (version < 2) return { ...old, period: defaultPeriod(), interval: "1d" };
        return old;
      },
      // 「1年」「5年」などのボタンで選んだ期間は、開くたびに今日を終了日にする
      onRehydrateStorage: () => (state) => {
        if (state?.period.preset != null) {
          state.setPeriod({
            start: yearsAgo(state.period.preset),
            end: toIsoDate(new Date()),
            preset: state.period.preset,
          });
        }
      },
    },
  ),
);

/**
 * localStorage からの読み込みが終わったか。
 * 終わる前に描画すると、サーバー側の HTML(未選択)と食い違ってちらつくため、これで待つ。
 */
export function useSelectionHydrated(): boolean {
  return useSyncExternalStore(
    (onChange) => useSelection.persist.onFinishHydration(onChange),
    () => useSelection.persist.hasHydrated(),
    () => false,
  );
}

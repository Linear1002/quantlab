"use client";

import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

// 3ステップ(銘柄 → 戦略 → 実行)で選んだ内容を、画面をまたいで保持するストア。
// localStorage に保存するので、リロードしても選択は消えない。

export type SelectedSymbol = {
  symbol: string; // "7203.T", "AAPL"
  name: string;
  market: "JP" | "US";
};

export type SelectedStrategy = {
  id: string; // "sma_cross" など(backend の strategy id と同じ)
  name: string;
  params: Record<string, number>;
};

type SelectionState = {
  symbol: SelectedSymbol | null;
  strategy: SelectedStrategy | null;
  setSymbol: (s: SelectedSymbol | null) => void;
  setStrategy: (s: SelectedStrategy | null) => void;
  reset: () => void;
};

export const useSelection = create<SelectionState>()(
  persist(
    (set) => ({
      symbol: null,
      strategy: null,
      setSymbol: (symbol) => set({ symbol }),
      setStrategy: (strategy) => set({ strategy }),
      reset: () => set({ symbol: null, strategy: null }),
    }),
    {
      name: "quantlab-selection",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // 関数は保存しない
      partialize: ({ symbol, strategy }) => ({ symbol, strategy }),
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

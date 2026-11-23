"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { BacktestConfigIn, BacktestResult, Market } from "./api";

/**
 * バックテストの設定(市場ごとに保持)と、最後に実行した結果。
 * - 設定は localStorage(次に開いたときも同じ設定)
 * - 結果は sessionStorage(タブを閉じたら消える。保存・履歴は Phase 7 で DB に)
 */

export type ConfigForm = BacktestConfigIn & { risk_free_rate: number };

// 市場ごとの既定値。日本株は単元 100 株なので、100万円程度ないと買えない銘柄が多い
export const DEFAULT_CONFIG: Record<Market, ConfigForm> = {
  JP: {
    initial_capital: 1_000_000,
    commission_rate: 0.0005,
    commission_min: 0,
    slippage_bps: 5,
    sizing_mode: "percent_equity",
    sizing_value: 1,
    lot_size: 100,
    price_mode: "total_return",
    risk_free_rate: 0,
  },
  US: {
    initial_capital: 10_000,
    commission_rate: 0.0005,
    commission_min: 0,
    slippage_bps: 5,
    sizing_mode: "percent_equity",
    sizing_value: 1,
    lot_size: 1,
    price_mode: "total_return",
    risk_free_rate: 0,
  },
};

type ConfigState = {
  byMarket: Record<Market, ConfigForm>;
  setConfig: (market: Market, c: ConfigForm) => void;
  resetConfig: (market: Market) => void;
};

export const useBacktestConfig = create<ConfigState>()(
  persist(
    (set) => ({
      byMarket: DEFAULT_CONFIG,
      setConfig: (market, c) => set((s) => ({ byMarket: { ...s.byMarket, [market]: c } })),
      resetConfig: (market) =>
        set((s) => ({ byMarket: { ...s.byMarket, [market]: DEFAULT_CONFIG[market] } })),
    }),
    {
      name: "quantlab-backtest-config",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ byMarket }) => ({ byMarket }),
    },
  ),
);

type ResultState = {
  /** 結果と、実行したときの銘柄名・戦略名(表示用) */
  last: { result: BacktestResult; symbolName: string; strategyName: string; ranAt: string } | null;
  setLast: (r: ResultState["last"]) => void;
};

export const useLastResult = create<ResultState>()(
  persist(
    (set) => ({
      last: null,
      setLast: (last) => set({ last }),
    }),
    {
      name: "quantlab-last-result",
      version: 1,
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);

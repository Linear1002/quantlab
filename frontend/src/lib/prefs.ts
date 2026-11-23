"use client";

import { useEffect, useSyncExternalStore } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * 表示の好み(このブラウザだけの設定)。
 * updown: 損益・上昇下落の色。
 *   - "green-up": 上昇・利益 = 緑、下落・損失 = 赤(海外の証券サイトに多い)
 *   - "red-up":   上昇・利益 = 赤、下落・損失 = 緑(日本や中国の証券サイトに多い)
 */
export type UpDown = "green-up" | "red-up";

type PrefsState = {
  updown: UpDown;
  setUpdown: (v: UpDown) => void;
};

export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      updown: "green-up",
      setUpdown: (updown) => set({ updown }),
    }),
    { name: "quantlab-prefs", version: 1, storage: createJSONStorage(() => localStorage) },
  ),
);

/** localStorage からの読み込みが終わったか(終わる前に描画すると、サーバーの HTML と食い違う) */
export function usePrefsHydrated(): boolean {
  return useSyncExternalStore(
    (cb) => usePrefs.persist.onFinishHydration(cb),
    () => usePrefs.persist.hasHydrated(),
    () => false,
  );
}

/**
 * 設定を <html data-updown="..."> に反映する。globals.css がこの属性を見て --gain / --loss を入れ替える。
 * ルートのレイアウトに1つだけ置く。
 */
export function PrefsApplier() {
  const updown = usePrefs((s) => s.updown);
  useEffect(() => {
    document.documentElement.dataset.updown = updown;
  }, [updown]);
  return null;
}

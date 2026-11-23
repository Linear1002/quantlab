"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError } from "./api";

export type ApiState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; error: ApiError };

/**
 * API を呼んで、読み込み中・成功・失敗の状態を返すフック。
 *
 * - key が変わるたびに呼び直す。key が null なら呼ばない(idle)
 * - 前のリクエストが終わる前に key が変わったら、前のリクエストは中断する
 *   (古い結果が後から届いて、新しい結果を上書きするのを防ぐため)
 */
export function useApi<T>(
  key: string | null,
  fetcher: (signal: AbortSignal) => Promise<T>,
): ApiState<T> {
  const [result, setResult] = useState<{ key: string; state: ApiState<T> } | null>(null);
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  useEffect(() => {
    if (key === null) return;
    const ac = new AbortController();
    fetcherRef
      .current(ac.signal)
      .then((data) => setResult({ key, state: { status: "success", data } }))
      .catch((e: unknown) => {
        if (ac.signal.aborted) return;
        const error =
          e instanceof ApiError ? e : new ApiError(0, "UNKNOWN", e instanceof Error ? e.message : String(e));
        setResult({ key, state: { status: "error", error } });
      });
    return () => ac.abort();
  }, [key]);

  if (key === null) return { status: "idle" };
  // 結果が今の key のものでなければ、まだ読み込み中
  if (result === null || result.key !== key) return { status: "loading" };
  return result.state;
}

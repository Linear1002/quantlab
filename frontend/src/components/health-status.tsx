"use client";

import { useEffect, useState } from "react";
import { ApiError, getHealth, type Health } from "@/lib/api";

type State =
  | { kind: "loading" }
  | { kind: "ok"; data: Health }
  | { kind: "error"; message: string };

/** Phase 1 の動作確認用: バックエンドに接続できているかを表示する */
export function HealthStatus() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    getHealth()
      .then((data) => setState({ kind: "ok", data }))
      .catch((e: unknown) =>
        setState({ kind: "error", message: e instanceof ApiError ? e.message : String(e) }),
      );
  }, []);

  if (state.kind === "loading") return <p data-testid="health">接続確認中…</p>;
  if (state.kind === "error")
    return (
      <p data-testid="health" className="text-red-400">
        ✕ {state.message}
      </p>
    );
  return (
    <p data-testid="health" className="text-cyan-300">
      ● API 接続OK(engine {state.data.engine_version} / data: {state.data.data_provider})
    </p>
  );
}

"use client";

import { useEffect, useState } from "react";
import { ApiError, getHealth, type Health } from "@/lib/api";
import { cn } from "@/lib/utils";

type State =
  | { kind: "loading" }
  | { kind: "ok"; data: Health }
  | { kind: "error"; message: string };

/** バックエンドに接続できているか、どのデータ元・エンジンを使っているかを表示する */
export function HealthStatus() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    getHealth()
      .then((data) => setState({ kind: "ok", data }))
      .catch((e: unknown) =>
        setState({ kind: "error", message: e instanceof ApiError ? e.message : String(e) }),
      );
  }, []);

  return (
    <div data-testid="health" className="space-y-3 text-sm">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className={cn(
            "size-2 rounded-full",
            state.kind === "ok" && "bg-gain",
            state.kind === "error" && "bg-loss",
            state.kind === "loading" && "animate-pulse bg-faint",
          )}
        />
        <span className={state.kind === "error" ? "text-loss" : "text-foreground"}>
          {state.kind === "loading" && "接続を確認しています"}
          {state.kind === "ok" && "API 接続OK"}
          {state.kind === "error" && "API に接続できません"}
        </span>
      </div>

      {state.kind === "error" && (
        <p className="leading-relaxed text-muted-foreground">
          {state.message}。backend で <code className="text-foreground">uv run uvicorn app.main:app</code>{" "}
          が起動しているか確認してください。
        </p>
      )}

      {state.kind === "ok" && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-muted-foreground">
          <dt>データ元</dt>
          <dd className="text-foreground">{state.data.data_provider}</dd>
          <dt>エンジン</dt>
          <dd className="text-foreground">v{state.data.engine_version}</dd>
        </dl>
      )}
    </div>
  );
}

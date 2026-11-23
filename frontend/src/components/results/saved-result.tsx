"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { getRun, listRuns } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { ResultView } from "./result-view";

/** 保存済みの結果を ID で開く(/results/{id}) */
export function SavedResult({ id }: { id: string }) {
  const state = useApi(`run:${id}`, (signal) => getRun(id, signal));
  if (state.status === "loading" || state.status === "idle")
    return <p className="text-sm text-muted-foreground">結果を読み込んでいます</p>;
  if (state.status === "error") {
    return (
      <Panel title="結果">
        <EmptyState
          title={state.error.code === "RUN_NOT_FOUND" ? "この結果は見つかりません" : "結果を読み込めません"}
          body={state.error.message}
          action={{ href: "/history", label: "履歴を見る" }}
        />
      </Panel>
    );
  }
  return <ResultView result={state.data} />;
}

/** /results を開いたら、いちばん新しい結果へ移動する。結果が1件も無ければ案内を出す */
export function LatestResult() {
  const router = useRouter();
  const state = useApi("runs:latest", (signal) => listRuns(1, 0, signal));
  const latestId = state.status === "success" ? state.data.items[0]?.id : undefined;

  useEffect(() => {
    if (latestId) router.replace(`/results/${latestId}`);
  }, [latestId, router]);

  if (state.status === "error") {
    return <p role="alert" className="text-sm text-loss">結果の一覧を取得できません: {state.error.message}</p>;
  }
  if (state.status === "success" && state.data.items.length === 0) {
    return (
      <Panel title="結果">
        <EmptyState
          title="表示できる結果がありません"
          body="バックテストを実行すると、ここにリターン・リスク指標と、Buy and Hold との比較が表示されます。"
          action={{ href: "/backtest", label: "バックテストを設定する" }}
        />
      </Panel>
    );
  }
  return <p className="text-sm text-muted-foreground">最新の結果を開いています</p>;
}

"use client";

import { useState } from "react";
import { Panel } from "@/components/ui/panel";
import { ApiError, clearCache, getSystemStatus } from "@/lib/api";
import { useBacktestConfig } from "@/lib/backtest-store";
import { formatCount } from "@/lib/format";
import { type UpDown, usePrefs, usePrefsHydrated } from "@/lib/prefs";
import { useSelection } from "@/lib/store";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";

export function SettingsView() {
  return (
    <div className="space-y-6">
      <DisplaySettings />
      <DataSettings />
      <LocalSettings />
    </div>
  );
}

const UPDOWN: { value: UpDown; label: string; help: string }[] = [
  { value: "green-up", label: "上昇・利益 = 緑", help: "海外の証券サイトに多い配色" },
  { value: "red-up", label: "上昇・利益 = 赤", help: "日本の証券サイトに多い配色" },
];

function DisplaySettings() {
  const hydrated = usePrefsHydrated();
  const updown = usePrefs((s) => s.updown);
  const setUpdown = usePrefs((s) => s.setUpdown);
  if (!hydrated) return <Panel title="表示"><p className="text-sm text-muted-foreground">読み込んでいます</p></Panel>;
  return (
    <Panel title="表示">
      <fieldset className="space-y-3">
        <legend className="text-sm">損益・値動きの色</legend>
        <div className="flex flex-wrap gap-3">
          {UPDOWN.map((o) => (
            <label
              key={o.value}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-md border px-4 py-3",
                updown === o.value ? "border-blue/60 bg-blue/10" : "border-line hover:border-line-strong",
              )}
            >
              <input
                type="radio"
                name="updown"
                value={o.value}
                checked={updown === o.value}
                onChange={() => setUpdown(o.value)}
                className="mt-1 accent-blue"
              />
              <span>
                <span className="block text-sm">{o.label}</span>
                <span className="block text-xs text-faint">{o.help}</span>
                <span className="mt-2 flex gap-3 text-xs" aria-hidden>
                  <span style={{ color: o.value === "green-up" ? "#34d39a" : "#ff6b6b" }}>+3.2%</span>
                  <span style={{ color: o.value === "green-up" ? "#ff6b6b" : "#34d39a" }}>−1.8%</span>
                </span>
              </span>
            </label>
          ))}
        </div>
        <p className="text-xs text-faint">開いているチャートには、ページを開き直すと反映されます。</p>
      </fieldset>
    </Panel>
  );
}

function DataSettings() {
  const [version, setVersion] = useState(0);
  const status = useApi(`status:${version}`, (signal) => getSystemStatus(signal));
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const clear = async () => {
    try {
      const r = await clearCache();
      setMessage(`株価のキャッシュを ${formatCount(r.deleted_bars)} 行削除しました。次に開くときに取得し直します。`);
      setVersion((v) => v + 1);
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : String(e));
    }
    setConfirming(false);
  };

  return (
    <Panel title="データ">
      {status.status === "error" && <p role="alert" className="text-sm text-loss">状態を取得できません: {status.error.message}</p>}
      {status.status === "success" && (
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[12rem_1fr]" data-testid="system-status">
          <dt className="text-faint">データ元</dt>
          <dd>
            {status.data.data_provider === "yahoo" ? "Yahoo Finance(yfinance・個人利用)" : status.data.data_provider}
            {status.data.data_provider === "fixture" && <span className="ml-2 text-loss">テスト用の合成データ</span>}
          </dd>
          <dt className="text-faint">日本語の銘柄名検索</dt>
          <dd>
            {status.data.jp_master_count == null ? (
              <span className="text-muted-foreground">
                無効。backend で <code className="text-foreground">uv run python scripts/update_jpx_master.py</code> を実行すると使えます
              </span>
            ) : (
              <>
                {formatCount(status.data.jp_master_count)} 銘柄
                <span className="text-faint">
                  (JPX 一覧を {new Date(status.data.jp_master_updated_at!).toLocaleDateString("ja-JP")} に取得。月1回の更新がおすすめ)
                </span>
              </>
            )}
          </dd>
          <dt className="text-faint">株価のキャッシュ</dt>
          <dd>
            {formatCount(status.data.cache_symbols)} 銘柄・{formatCount(status.data.cache_bars)} 行
          </dd>
          <dt className="text-faint">保存した結果</dt>
          <dd>{formatCount(status.data.saved_runs)} 件</dd>
          <dt className="text-faint">データベース / エンジン</dt>
          <dd>
            {status.data.database} / v{status.data.engine_version}
          </dd>
        </dl>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
        {confirming ? (
          <>
            <button type="button" onClick={clear} className="h-8 rounded-md bg-loss/15 px-3 text-sm text-loss hover:bg-loss/25">
              キャッシュを削除する
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="text-sm text-muted-foreground hover:underline">
              やめる
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="h-8 rounded-md border border-line px-3 text-sm text-muted-foreground hover:text-foreground"
          >
            株価のキャッシュを削除
          </button>
        )}
        <p className="text-xs text-faint">保存した結果は消えません。株価がおかしいときや、最新の配当を反映したいときに使います。</p>
      </div>
      {message && (
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          {message}
        </p>
      )}
    </Panel>
  );
}

function LocalSettings() {
  const resetSelection = useSelection((s) => s.reset);
  const resetConfig = useBacktestConfig((s) => s.resetConfig);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);

  const reset = () => {
    resetSelection();
    resetConfig("JP");
    resetConfig("US");
    setConfirming(false);
    setDone(true);
  };

  return (
    <Panel title="このブラウザに保存している設定">
      <p className="text-sm leading-relaxed text-muted-foreground">
        選んだ銘柄・戦略・分析期間と、バックテストの設定(初期資金・手数料など)は、このブラウザに保存しています。
        初期化すると既定値に戻ります(保存した結果は消えません)。
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {confirming ? (
          <>
            <button type="button" onClick={reset} className="h-8 rounded-md bg-loss/15 px-3 text-sm text-loss hover:bg-loss/25">
              初期化する
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="text-sm text-muted-foreground hover:underline">
              やめる
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => {
              setDone(false);
              setConfirming(true);
            }}
            className="h-8 rounded-md border border-line px-3 text-sm text-muted-foreground hover:text-foreground"
          >
            選択と設定を初期化
          </button>
        )}
        {done && (
          <p role="status" className="text-sm text-muted-foreground">
            初期化しました。
          </p>
        )}
      </div>
    </Panel>
  );
}

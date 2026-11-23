"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, runBacktest } from "@/lib/api";
import { type ConfigForm, useBacktestConfig } from "@/lib/backtest-store";
import { formatCount } from "@/lib/format";
import { useSelection, useSelectionHydrated } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * フォームの1項目の定義。
 * - toForm / fromForm: 内部の値(比率など)と、画面に出す値(% など)の変換
 */
type Field = {
  key: keyof ConfigForm;
  label: string;
  unit: (currency: string) => string;
  help: string;
  min: number;
  max: number;
  step: number;
  integer?: boolean;
  toForm?: (v: number) => number;
  fromForm?: (v: number) => number;
};

const pct = { toForm: (v: number) => Number((v * 100).toFixed(6)), fromForm: (v: number) => v / 100 };

const FIELDS: Field[] = [
  { key: "initial_capital", label: "初期資金", unit: (c) => c, help: "最初に用意する資金", min: 1, max: 1e12, step: 10000 },
  { key: "commission_rate", label: "手数料率", unit: () => "%", help: "約定金額に対する手数料の割合(片道)", min: 0, max: 9.99, step: 0.01, ...pct },
  { key: "commission_min", label: "最低手数料", unit: (c) => c, help: "1回の注文で最低限かかる手数料", min: 0, max: 1e6, step: 1 },
  { key: "slippage_bps", label: "スリッページ", unit: () => "bps", help: "約定価格が不利にずれる幅。1bps = 0.01%", min: 0, max: 999, step: 1 },
  { key: "lot_size", label: "単元株数", unit: () => "株", help: "この株数の倍数でしか売買できない", min: 1, max: 100000, step: 1, integer: true },
  { key: "risk_free_rate", label: "無リスク金利", unit: () => "%/年", help: "Sharpe / Sortino の計算で差し引く金利", min: -5, max: 20, step: 0.1, ...pct },
];

export function BacktestForm() {
  const router = useRouter();
  const hydrated = useSelectionHydrated();
  const { symbol, strategy, period, interval } = useSelection();
  const byMarket = useBacktestConfig((s) => s.byMarket);
  const setConfig = useBacktestConfig((s) => s.setConfig);
  const resetConfig = useBacktestConfig((s) => s.resetConfig);

  const [running, setRunning] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  // 入力途中の文字列。確定した値は store に入る
  const [drafts, setDrafts] = useState<Partial<Record<keyof ConfigForm, string>>>({});

  if (!hydrated) return <p className="text-sm text-muted-foreground">読み込んでいます</p>;

  const market = symbol?.market ?? "JP";
  const cfg = byMarket[market];
  const currency = symbol?.currency ?? (market === "JP" ? "JPY" : "USD");
  const currencyLabel = currency === "JPY" ? "円" : currency;

  const fieldError = (f: Field, raw: string): string | null => {
    if (raw.trim() === "") return "値を入力してください";
    const v = Number(raw);
    if (!Number.isFinite(v)) return "数値を入力してください";
    if (f.integer && !Number.isInteger(v)) return "整数を入力してください";
    if (v < f.min || v > f.max) return `${f.min} 〜 ${f.max} の範囲で入力してください`;
    return null;
  };
  const shown = (f: Field) => drafts[f.key] ?? String(f.toForm ? f.toForm(cfg[f.key] as number) : cfg[f.key]);
  const errors = Object.fromEntries(FIELDS.map((f) => [f.key, fieldError(f, shown(f))]));

  const sizingMax = cfg.sizing_mode === "percent_equity" ? 100 : 1e9;
  const sizingShown =
    drafts.sizing_value ?? String(cfg.sizing_mode === "percent_equity" ? cfg.sizing_value * 100 : cfg.sizing_value);
  const sizingNum = Number(sizingShown);
  const sizingError =
    !Number.isFinite(sizingNum) || sizingNum <= 0 || sizingNum > sizingMax
      ? `0 より大きく ${formatCount(sizingMax)} 以下で入力してください`
      : cfg.sizing_mode === "fixed_shares" && !Number.isInteger(sizingNum)
        ? "整数を入力してください"
        : null;

  const update = (f: Field, raw: string) => {
    setDrafts((d) => ({ ...d, [f.key]: raw }));
    if (fieldError(f, raw) === null) {
      const v = Number(raw);
      setConfig(market, { ...cfg, [f.key]: f.fromForm ? f.fromForm(v) : v });
    }
  };

  const ready = symbol && strategy;
  const hasError = Object.values(errors).some(Boolean) || sizingError !== null;

  const run = async () => {
    if (!symbol || !strategy || hasError) return;
    setRunning(true);
    setError(null);
    const { risk_free_rate, ...config } = cfg;
    try {
      const result = await runBacktest({
        symbol: symbol.symbol,
        symbol_name: symbol.name,
        start: period.start,
        end: period.end,
        interval,
        strategy_id: strategy.id,
        params: strategy.params,
        config,
        risk_free_rate,
      });
      // 結果は backend に保存済み。ID 付きの URL に移動する(あとから同じ URL で開き直せる)
      router.push(`/results/${result.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, "UNKNOWN", String(e)));
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 何を検証するか(選択内容の確認) */}
      <section aria-label="検証する内容" className="rounded-lg border border-line bg-navy">
        <dl className="grid divide-y divide-line text-sm sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <Summary label="銘柄" href="/stocks" value={symbol ? `${symbol.name}(${symbol.symbol})` : null} />
          <Summary
            label="戦略"
            href="/strategies"
            value={
              strategy
                ? `${strategy.name}${Object.keys(strategy.params).length ? `(${Object.entries(strategy.params).map(([k, v]) => `${k}=${v}`).join(", ")})` : ""}`
                : null
            }
          />
          <Summary
            label="期間"
            href="/stocks"
            value={`${period.start} 〜 ${period.end}・${interval === "1d" ? "日足" : "週足"}`}
          />
        </dl>
      </section>

      <section aria-label="バックテストの設定" className="rounded-lg border border-line bg-navy">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 className="text-sm font-medium">設定({market === "JP" ? "日本株" : "米国株"})</h2>
          <button
            type="button"
            onClick={() => {
              resetConfig(market);
              setDrafts({});
            }}
            className="text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            既定値に戻す
          </button>
        </header>

        <div className="grid gap-5 px-5 py-5 sm:grid-cols-2 lg:grid-cols-3">
          {FIELDS.map((f) => (
            <NumberField
              key={f.key}
              id={`cfg-${f.key}`}
              label={f.label}
              unit={f.unit(currencyLabel)}
              help={f.help}
              value={shown(f)}
              step={f.step}
              error={errors[f.key]}
              onChange={(raw) => update(f, raw)}
            />
          ))}

          <div className="space-y-1.5">
            <span id="sizing-label" className="block text-sm">
              ポジションサイズ
            </span>
            <div role="radiogroup" aria-labelledby="sizing-label" className="inline-flex rounded-md border border-line p-0.5">
              {(
                [
                  ["percent_equity", "資金の割合"],
                  ["fixed_shares", "固定株数"],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={cfg.sizing_mode === mode}
                  onClick={() => {
                    setDrafts((d) => ({ ...d, sizing_value: undefined }));
                    setConfig(market, {
                      ...cfg,
                      sizing_mode: mode,
                      sizing_value: mode === "percent_equity" ? 1 : cfg.lot_size,
                    });
                  }}
                  className={cn(
                    "h-7 rounded-[5px] px-3 text-xs",
                    cfg.sizing_mode === mode ? "bg-blue text-white" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <NumberField
            id="cfg-sizing_value"
            label={cfg.sizing_mode === "percent_equity" ? "買うときに使う資金" : "買う株数"}
            unit={cfg.sizing_mode === "percent_equity" ? "%" : "株"}
            help={
              cfg.sizing_mode === "percent_equity"
                ? "その時点の現金の何%で買うか"
                : "毎回この株数を買う(資金が足りなければ減らして記録)"
            }
            value={sizingShown}
            step={cfg.sizing_mode === "percent_equity" ? 5 : cfg.lot_size}
            error={sizingError}
            onChange={(raw) => {
              setDrafts((d) => ({ ...d, sizing_value: raw }));
              const v = Number(raw);
              if (Number.isFinite(v) && v > 0 && v <= sizingMax) {
                if (cfg.sizing_mode === "fixed_shares" && !Number.isInteger(v)) return;
                setConfig(market, { ...cfg, sizing_value: cfg.sizing_mode === "percent_equity" ? v / 100 : v });
              }
            }}
          />

          <div className="space-y-1.5">
            <label htmlFor="cfg-price_mode" className="block text-sm">
              価格の調整
            </label>
            <select
              id="cfg-price_mode"
              value={cfg.price_mode}
              onChange={(e) => setConfig(market, { ...cfg, price_mode: e.target.value as ConfigForm["price_mode"] })}
              className="h-9 w-full rounded-md border border-input bg-panel px-2 text-sm text-foreground focus:border-blue focus:outline-none"
            >
              <option value="total_return">配当込み(配当を再投資したとみなす)</option>
              <option value="split_only">分割のみ(配当は無視)</option>
            </select>
            <p className="text-xs text-faint">株式分割はどちらでも調整されます</p>
          </div>
        </div>

        <p className="border-t border-line px-5 py-3 text-xs text-faint">
          売買はロング(買い)のみ・空売りなし。シグナルが出た翌営業日の始値で約定します。
        </p>
      </section>

      {error && (
        <p role="alert" className="rounded-md border border-loss/40 bg-loss/10 px-4 py-3 text-sm text-loss">
          {error.message}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-4">
        {!ready && <p className="text-sm text-muted-foreground">銘柄と戦略を選ぶと実行できます。</p>}
        <button
          type="button"
          onClick={run}
          disabled={!ready || hasError || running}
          className="inline-flex h-10 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {running ? "計算しています" : "バックテストを実行"}
        </button>
      </div>
    </div>
  );
}

function Summary({ label, value, href }: { label: string; value: string | null; href: string }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 py-4">
      <div className="min-w-0">
        <dt className="text-xs text-faint">{label}</dt>
        <dd className={cn("mt-1 break-words", value ? "text-foreground" : "text-muted-foreground")}>
          {value ?? "未選択"}
        </dd>
      </div>
      <Link href={href} className="shrink-0 text-xs text-blue hover:underline">
        変更
      </Link>
    </div>
  );
}

function NumberField(props: {
  id: string;
  label: string;
  unit: string;
  help: string;
  value: string;
  step: number;
  error: string | null;
  onChange: (raw: string) => void;
}) {
  const { id, label, unit, help, value, step, error, onChange } = props;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          step={step}
          value={value}
          aria-invalid={error !== null}
          aria-describedby={`${id}-help`}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "h-9 w-full rounded-md border bg-panel px-3 text-sm text-foreground focus:outline-none",
            error ? "border-loss" : "border-input focus:border-blue",
          )}
        />
        <span className="shrink-0 text-sm text-muted-foreground">{unit}</span>
      </div>
      <p id={`${id}-help`} className={cn("text-xs", error ? "text-loss" : "text-faint")}>
        {error ?? help}
      </p>
    </div>
  );
}

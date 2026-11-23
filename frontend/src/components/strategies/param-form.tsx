"use client";

import { useState } from "react";
import type { ParamDef } from "@/lib/api";
import { cn } from "@/lib/utils";

type Props = {
  defs: ParamDef[];
  values: Record<string, number>;
  /** 入力が数値として正しいときだけ呼ばれる */
  onChange: (values: Record<string, number>) => void;
};

/** 1つの入力値をチェックする。問題なければ null、あればエラーメッセージ */
export function checkParam(def: ParamDef, raw: string): string | null {
  if (raw.trim() === "") return "値を入力してください";
  const v = Number(raw);
  if (!Number.isFinite(v)) return "数値を入力してください";
  if (def.type === "int" && !Number.isInteger(v)) return "整数を入力してください";
  if (v < def.min || v > def.max) return `${def.min} 〜 ${def.max} の範囲で入力してください`;
  return null;
}

/**
 * 戦略パラメータの入力フォーム。backend の param_schema から自動で作る。
 * ここでは1つずつの範囲だけを確認し、「短期 < 長期」のような関係は backend が確認する。
 */
export function ParamForm({ defs, values, onChange }: Props) {
  // 入力途中の文字列(「1」→「12」のように打っている途中)を保持する
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(defs.map((d) => [d.name, String(values[d.name] ?? d.default)])),
  );

  if (defs.length === 0) {
    return <p className="text-sm text-muted-foreground">この戦略に調整できるパラメータはありません。</p>;
  }

  const update = (name: string, raw: string) => {
    const next = { ...drafts, [name]: raw };
    setDrafts(next);
    const allValid = defs.every((d) => checkParam(d, next[d.name]) === null);
    if (allValid) onChange(Object.fromEntries(defs.map((d) => [d.name, Number(next[d.name])])));
  };

  const resetDefaults = () => {
    setDrafts(Object.fromEntries(defs.map((d) => [d.name, String(d.default)])));
    onChange(Object.fromEntries(defs.map((d) => [d.name, d.default])));
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {defs.map((d) => {
          const err = checkParam(d, drafts[d.name]);
          const id = `param-${d.name}`;
          return (
            <div key={d.name} className="space-y-1.5">
              <label htmlFor={id} className="block text-sm text-foreground">
                {d.label}
              </label>
              <input
                id={id}
                type="number"
                inputMode="decimal"
                min={d.min}
                max={d.max}
                step={d.step}
                value={drafts[d.name]}
                aria-invalid={err !== null}
                aria-describedby={`${id}-help`}
                onChange={(e) => update(d.name, e.target.value)}
                className={cn(
                  "h-9 w-full rounded-md border bg-panel px-3 text-sm text-foreground focus:outline-none",
                  err ? "border-loss" : "border-input focus:border-blue",
                )}
              />
              <p id={`${id}-help`} className={cn("text-xs", err ? "text-loss" : "text-faint")}>
                {err ?? `${d.description ? `${d.description}。` : ""}${d.min} 〜 ${d.max}(既定 ${d.default})`}
              </p>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={resetDefaults}
        className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        既定値に戻す
      </button>
    </div>
  );
}

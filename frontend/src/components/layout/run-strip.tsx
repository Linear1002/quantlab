"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { isActive } from "@/lib/nav";
import { useSelection, useSelectionHydrated } from "@/lib/store";
import { cn } from "@/lib/utils";

type Step = {
  n: number;
  href: string;
  label: string;
  value: string | null; // 選択済みの内容。未選択なら null
  short: string | null; // スマホ幅で出す短い表記
  hint: string; // 未選択のときに出す案内
  shortHint: string;
};

/**
 * 画面上部に常に出る「銘柄 → 戦略 → 実行」の3ステップ表示。
 * どこまで選んだかを示し、各ステップの画面へのリンクも兼ねる。
 */
export function RunStrip() {
  // URL は Suspense の中で読む(nav-links.tsx と同じ理由)
  return (
    <Suspense fallback={<RunStripView pathname={null} fallback />}>
      <RunStripWithPath />
    </Suspense>
  );
}

function RunStripWithPath() {
  return <RunStripView pathname={usePathname()} />;
}

function RunStripView({ pathname, fallback = false }: { pathname: string | null; fallback?: boolean }) {  const hydrated = useSelectionHydrated();
  const symbol = useSelection((s) => s.symbol);
  const strategy = useSelection((s) => s.strategy);

  // localStorage を読み終えるまでは「未選択」として描画する(サーバーの HTML と一致させるため)
  const sym = hydrated ? symbol : null;
  const strat = hydrated ? strategy : null;
  const ready = sym !== null && strat !== null;

  const steps: Step[] = [
    {
      n: 1,
      href: "/stocks",
      label: "銘柄",
      value: sym ? `${sym.name}(${sym.symbol})` : null,
      short: sym?.symbol ?? null,
      hint: "未選択",
      shortHint: "未選択",
    },
    {
      n: 2,
      href: "/strategies",
      label: "戦略",
      value: strat?.name ?? null,
      short: strat?.name ?? null,
      hint: "未選択",
      shortHint: "未選択",
    },
    {
      n: 3,
      href: "/backtest",
      label: "実行",
      value: ready ? "実行できます" : null,
      short: ready ? "実行可" : null,
      hint: "銘柄と戦略を選ぶと実行できます",
      shortHint: "未準備",
    },
  ];

  return (
    <div
      data-testid={fallback ? undefined : "run-strip"}
      aria-hidden={fallback || undefined}
      className="sticky top-14 z-20 border-b border-line bg-ink/90 backdrop-blur md:top-0"
    >
      <ol className="flex items-stretch">
        {steps.map((step, i) => {
          const done = step.value !== null;
          const current = pathname !== null && isActive(pathname, step.href);
          return (
            <li key={step.n} className="flex min-w-0 flex-1 items-stretch">
              <Link
                href={step.href}
                aria-current={current ? "step" : undefined}
                className={cn(
                  "group relative flex min-w-0 flex-1 items-center gap-2.5 px-3 py-3 sm:gap-3 sm:px-4 transition-colors md:px-6",
                  current ? "bg-navy" : "hover:bg-navy/60",
                )}
              >
                <StepMark n={step.n} done={done} current={current} />
                <span className="min-w-0">
                  <span className="block text-xs text-faint">{step.label}</span>
                  <span
                    data-testid={fallback ? undefined : `run-strip-step-${step.n}`}
                    className={cn(
                      "block truncate text-sm",
                      done ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {/* 幅によって表記を切り替える(md 未満は短い表記) */}
                    <span className="hidden md:inline">{step.value ?? step.hint}</span>
                    <span className="md:hidden">{step.short ?? step.shortHint}</span>
                  </span>
                </span>
                {/* 下端のライン: 完了したステップは cyan で埋まる */}
                <span
                  aria-hidden
                  className={cn(
                    "absolute inset-x-0 bottom-0 h-px origin-left transition-transform duration-500 ease-out",
                    done ? "scale-x-100 bg-cyan" : "scale-x-0 bg-cyan",
                  )}
                />
              </Link>
              {i < steps.length - 1 && <span aria-hidden className="w-px self-stretch bg-line" />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function StepMark({ n, done, current }: { n: number; done: boolean; current: boolean }) {
  return (
    <span
      className={cn(
        "grid size-6 shrink-0 place-items-center rounded-full border text-xs font-medium transition-colors",
        done && "border-cyan bg-cyan/15 text-cyan",
        !done && current && "border-blue text-blue",
        !done && !current && "border-line-strong text-faint",
      )}
    >
      {done ? <Check className="size-3.5" aria-label="選択済み" /> : n}
    </span>
  );
}

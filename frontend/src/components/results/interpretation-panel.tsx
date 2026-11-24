import { CircleAlert, CircleCheck, CircleMinus, Info } from "lucide-react";
import type { BacktestResult } from "@/lib/api";
import { interpretResult, type Tone } from "@/lib/interpret";
import { cn } from "@/lib/utils";

const TONE: Record<Tone, { icon: typeof CircleCheck; label: string; className: string }> = {
  good: { icon: CircleCheck, label: "良い点", className: "text-gain" },
  bad: { icon: CircleAlert, label: "注意したい点", className: "text-loss" },
  neutral: { icon: CircleMinus, label: "参考", className: "text-muted-foreground" },
};

/**
 * 「結果の読み方」: 数値を日本語の文章で読み解く。文章の中身は lib/interpret.ts が作る。
 * 良い/悪いは色だけでなく、アイコンと読み上げ用の言葉でも伝える。
 */
export function InterpretationPanel({ result }: { result: BacktestResult }) {
  const { headline, points, cautions } = interpretResult(result);
  return (
    <section aria-label="結果の読み方" className="rounded-lg border border-blue/40 bg-navy" data-testid="interpretation">
      <header className="border-b border-line px-5 py-4">
        <h2 className="text-xs text-muted-foreground">結果の読み方</h2>
        <p className="mt-1.5 text-lg leading-relaxed font-medium text-foreground">{headline}</p>
      </header>
      <ul className="divide-y divide-line">
        {points.map((p) => {
          const t = TONE[p.tone];
          const Icon = t.icon;
          return (
            <li key={p.title} className="flex gap-3 px-5 py-3.5">
              <Icon className={cn("mt-0.5 size-4 shrink-0", t.className)} aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  <span className="sr-only">{t.label}: </span>
                  {p.title}
                </p>
                <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{p.text}</p>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-line px-5 py-3.5">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Info className="size-3.5" aria-hidden />
          結果を見るときの注意
        </p>
        <ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs leading-relaxed text-muted-foreground marker:text-faint">
          {cautions.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-faint">
          「良い」「まずまず」などは一般的な目安です。投資の判断は、ご自身の責任で行ってください。
        </p>
      </div>
    </section>
  );
}

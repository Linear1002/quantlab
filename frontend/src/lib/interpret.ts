/**
 * バックテスト結果を、日本語の文章で読み解く(「結果の読み方」パネル用)。
 *
 * ここは画面に依存しない純粋な関数だけを置き、vitest で単体テストする(interpret.test.ts)。
 * 使っている基準(Sharpe 1 以上を「良い」とするなど)は、一般的な目安であって絶対的なものではない。
 * 画面にもそう書く。
 */

import type { BacktestResult, Metrics, SeriesPoint } from "./api";

export type Tone = "good" | "bad" | "neutral";
export type Point = { title: string; text: string; tone: Tone };
export type Interpretation = { headline: string; points: Point[]; cautions: string[] };

// 「ほぼ同じ」とみなす差
const SAME_RETURN = 0.01; // リターンの差 1%ポイント未満
const SAME_SHARPE = 0.05;
const SAME_DD = 0.03; // 最大ドローダウンの差 3%ポイント未満

const MIN_TRADES = 10; // これより少ない取引数だと、偶然の影響が大きい
const MIN_YEARS = 3;

/** 0.123 → "12.3%"(符号なし) */
export const pct1 = (v: number) => `${Math.abs(v * 100).toFixed(1)}%`;
/** 差を「%ポイント」で(0.052 → "5.2%ポイント") */
const pts = (v: number) => `${Math.abs(v * 100).toFixed(1)}%ポイント`;

/** Sharpe Ratio の目安(年率)。一般によく使われる区切り */
export function sharpeLabel(s: number | null): string {
  if (s == null) return "計算できない";
  if (s < 0) return "マイナス(リスクを取ったのに、無リスク金利にも届いていない)";
  if (s < 0.5) return "低め";
  if (s < 1) return "まずまず";
  if (s < 2) return "良い";
  return "非常に高い(良すぎる結果は、過剰最適化を疑う)";
}

/** 期間のうち、株を持っていた日の割合 */
export function exposure(series: SeriesPoint[]): number {
  if (series.length === 0) return 0;
  return series.filter((p) => p.position > 0).length / series.length;
}

/** 分析期間の年数(暦日 / 365.25) */
export function years(series: SeriesPoint[]): number {
  if (series.length < 2) return 0;
  const ms = new Date(series.at(-1)!.date).getTime() - new Date(series[0].date).getTime();
  return ms / (365.25 * 24 * 3600 * 1000);
}

/** 小数2桁、マイナスは「−」(画面のほかの数値と記号をそろえる) */
const num2 = (v: number) => `${v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)}`;

function headline(s: Metrics, b: Metrics, isBenchmark: boolean): string {
  const base = baseHeadline(s, b, isBenchmark);
  // 比べて「良い」と言える場合でも、戦略そのものが損失なら必ずそれを書く(良い結果だと誤解させない)
  if (!isBenchmark && s.total_return < 0) {
    return `${base}ただし、戦略そのものは期間全体で −${pct1(s.total_return)} の損失です。`;
  }
  return base;
}

function baseHeadline(s: Metrics, b: Metrics, isBenchmark: boolean): string {
  if (isBenchmark) return "この戦略は比較対象の Buy and Hold そのものです。他の戦略を試して、この結果と比べてみましょう。";
  const dRet = s.total_return - b.total_return;
  const dSharpe = s.sharpe != null && b.sharpe != null ? s.sharpe - b.sharpe : 0;
  const shallower = s.max_drawdown - b.max_drawdown > SAME_DD; // 値は負なので、大きい方が下落が浅い
  const retBetter = dRet > SAME_RETURN;
  const retWorse = dRet < -SAME_RETURN;
  const effBetter = dSharpe > SAME_SHARPE;
  const effWorse = dSharpe < -SAME_SHARPE;

  if (retBetter && !effWorse) return "Buy and Hold より、リターンもリスクあたりの効率も良い結果でした。";
  if (retBetter && effWorse) return "リターンは Buy and Hold を上回りましたが、そのぶん大きなリスク(値動き)を取っていました。";
  if (!retBetter && !retWorse && (effBetter || shallower))
    return "リターンは Buy and Hold とほぼ同じで、下落やリスクはより小さく抑えられました。";
  if (retWorse && (effBetter || shallower))
    return "リターンは Buy and Hold に負けましたが、下落は小さく抑えられました。守りを重視した結果です。";
  if (retWorse) return "この期間では、何もせず持ち続けた(Buy and Hold)ほうが良い結果でした。";
  return "Buy and Hold とほぼ同じ結果でした。";
}

export function interpretResult(r: BacktestResult): Interpretation {
  const s = r.metrics;
  const b = r.benchmark_metrics;
  const isBenchmark = r.strategy_id === "buy_hold";
  const points: Point[] = [];

  // 1. リターン
  const dRet = s.total_return - b.total_return;
  points.push({
    title: "リターン",
    tone: Math.abs(dRet) < SAME_RETURN ? "neutral" : dRet > 0 ? "good" : "bad",
    text:
      `期間全体で ${s.total_return >= 0 ? "+" : "−"}${pct1(s.total_return)}(1年あたり ${s.cagr == null ? "—" : `${s.cagr >= 0 ? "+" : "−"}${pct1(s.cagr)}`})。` +
      (isBenchmark
        ? ""
        : Math.abs(dRet) < SAME_RETURN
          ? "Buy and Hold とほぼ同じです。"
          : `Buy and Hold より ${pts(dRet)} ${dRet > 0 ? "多い" : "少ない"}です。`),
  });

  // 2. 下落の大きさ(最大ドローダウン)
  const dd = s.max_drawdown;
  const ddDiff = s.max_drawdown - b.max_drawdown;
  points.push({
    title: "いちばん大きな下落",
    tone: isBenchmark || Math.abs(ddDiff) < SAME_DD ? "neutral" : ddDiff > 0 ? "good" : "bad",
    text:
      `資産が最高値から最大で ${pct1(dd)} 下がった時期がありました。` +
      (isBenchmark
        ? ""
        : Math.abs(ddDiff) < SAME_DD
          ? "Buy and Hold と同じくらいです。"
          : `Buy and Hold(${pct1(b.max_drawdown)})より${ddDiff > 0 ? "浅く" : "深く"}なっています。`) +
      "この下落に耐えられるかが、実際に続けられるかの分かれ目です。",
  });

  // 3. リスクあたりの効率(Sharpe)
  points.push({
    title: "リスクあたりの効率",
    tone: s.sharpe == null ? "neutral" : s.sharpe < 0.5 ? "bad" : s.sharpe >= 1 ? "good" : "neutral",
    text:
      `Sharpe Ratio は ${s.sharpe == null ? "—" : num2(s.sharpe)} で、目安では「${sharpeLabel(s.sharpe)}」です。` +
      (isBenchmark || s.sharpe == null || b.sharpe == null ? "" : `Buy and Hold は ${num2(b.sharpe)} です。`) +
      "値動きの大きさに対して、どれだけ効率よく増えたかを表します。",
  });

  // 4. 株を持っていた時間
  const exp = exposure(r.series);
  if (!isBenchmark) {
    points.push({
      title: "株を持っていた時間",
      tone: "neutral",
      text: `期間のうち ${pct1(exp)} の日だけ株を持ち、残りは現金でした。持っていない間は値動きの影響を受けないので、そのぶん下落も上昇も小さくなります。`,
    });
  }

  // 5. 取引の中身
  if (!isBenchmark) {
    const n = s.closed_trades;
    let text: string;
    let tone: Tone = "neutral";
    if (n === 0) {
      text = "決済した取引がないので、勝率と Profit Factor は計算できません。";
    } else {
      const wr = s.win_rate ?? 0;
      const pf = s.profit_factor_infinite ? Infinity : (s.profit_factor ?? 0);
      text = `決済した ${n} 回のうち、利益が出たのは ${pct1(wr)}。`;
      if (pf === Infinity) text += "損失の出た取引はありませんでした。";
      else if (pf >= 1) {
        tone = "good";
        text +=
          wr < 0.5
            ? `負けの回数のほうが多いものの、Profit Factor が ${pf.toFixed(2)} なので、勝ったときの利益が負けの合計を上回っています(トレンドフォロー戦略によくある形)。`
            : `Profit Factor は ${pf.toFixed(2)} で、利益の合計が損失の合計を上回っています。`;
      } else {
        tone = "bad";
        text += `Profit Factor が ${pf.toFixed(2)}(1 未満)なので、損失の合計のほうが大きくなっています。`;
      }
    }
    points.push({ title: "取引の中身", tone, text });
  }

  // 注意点
  const cautions: string[] = [];
  if (r.provider === "fixture") cautions.push("テスト用の合成データで計算した結果です。実際の株価ではありません。");
  if (!isBenchmark && s.closed_trades < MIN_TRADES) {
    cautions.push(
      `決済した取引が ${s.closed_trades} 回しかありません。回数が少ないと偶然の影響が大きく、同じ戦略でも期間を変えると結果が大きく変わることがあります。`,
    );
  }
  const y = years(r.series);
  if (y < MIN_YEARS) {
    cautions.push(`分析期間が ${y.toFixed(1)} 年と短めです。上昇相場・下落相場の両方を含む、より長い期間でも確かめましょう。`);
  }
  cautions.push(
    "過去のデータでうまくいっても、将来も同じになるとは限りません。パラメータを何度も変えていちばん良い結果を選ぶと、過去に合わせ込みすぎ(過剰最適化)になります。",
  );

  return { headline: headline(s, b, isBenchmark), points, cautions };
}

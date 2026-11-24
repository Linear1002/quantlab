import { describe, expect, it } from "vitest";
import type { BacktestResult, Metrics, SeriesPoint } from "./api";
import { exposure, interpretResult, sharpeLabel, years } from "./interpret";

function m(over: Partial<Metrics> = {}): Metrics {
  return {
    total_return: 0.5,
    cagr: 0.1,
    volatility: 0.2,
    sharpe: 0.6,
    sortino: 0.8,
    max_drawdown: -0.3,
    win_rate: 0.4,
    profit_factor: 2,
    profit_factor_infinite: false,
    total_trades: 20,
    closed_trades: 20,
    ...over,
  };
}

function series(n: number, holdingEvery = 2, startYear = 2020, years = 5): SeriesPoint[] {
  const start = new Date(`${startYear}-01-01`).getTime();
  const step = (years * 365.25 * 86400000) / (n - 1);
  return Array.from({ length: n }, (_, i) => ({
    date: new Date(start + i * step).toISOString().slice(0, 10),
    equity: 100,
    benchmark: 100,
    drawdown: 0,
    benchmark_drawdown: 0,
    position: i % holdingEvery === 0 ? 100 : 0,
    open: 1,
    high: 1,
    low: 1,
    close: 1,
  }));
}

function result(s: Partial<Metrics>, b: Partial<Metrics>, over: Partial<BacktestResult> = {}): BacktestResult {
  return {
    strategy_id: "sma_cross",
    provider: "yahoo",
    metrics: m(s),
    benchmark_metrics: m({ ...b, closed_trades: 0, total_trades: 1, win_rate: null, profit_factor: null }),
    series: series(100),
    ...over,
  } as BacktestResult;
}

describe("interpretResult: 見出し", () => {
  it("トヨタの実例: リターンほぼ同じ・下落は半分 → 守りを評価", () => {
    // 2026-11-23 に実データで出た数値(+74.32% vs +73.37%、MDD −20.78% vs −39.92%)
    const r = result(
      { total_return: 0.7432, sharpe: 0.66, max_drawdown: -0.2078 },
      { total_return: 0.7337, sharpe: 0.52, max_drawdown: -0.3992 },
    );
    expect(interpretResult(r).headline).toContain("ほぼ同じで、下落やリスクはより小さく");
  });

  it("リターンも効率も上 → 両方良い", () => {
    const r = result({ total_return: 0.9, sharpe: 0.9 }, { total_return: 0.5, sharpe: 0.6 });
    expect(interpretResult(r).headline).toContain("リターンもリスクあたりの効率も良い");
  });

  it("リターンは上だが効率は下 → リスクを取っていた", () => {
    const r = result({ total_return: 0.9, sharpe: 0.4 }, { total_return: 0.5, sharpe: 0.6 });
    expect(interpretResult(r).headline).toContain("大きなリスク");
  });

  it("リターンも下落も負け → B&H のほうが良かった", () => {
    const r = result(
      { total_return: -0.39, sharpe: -0.69, max_drawdown: -0.43 },
      { total_return: -0.11, sharpe: -0.05, max_drawdown: -0.3 },
    );
    expect(interpretResult(r).headline).toContain("持ち続けた(Buy and Hold)ほうが良い");
  });

  it("比べて下落が浅くても、戦略そのものが損失なら見出しに必ず書く", () => {
    // 画面確認で見つけたケース: −37.2% の損失なのに「守りを重視した結果」だけだと良い結果に読める
    const r = result(
      { total_return: -0.372, sharpe: -0.54, max_drawdown: -0.39 },
      { total_return: -0.335, sharpe: -0.18, max_drawdown: -0.49 },
    );
    const h = interpretResult(r).headline;
    expect(h).toContain("下落は小さく抑えられました");
    expect(h).toContain("−37.2% の損失");
  });

  it("Sharpe のマイナスは − で表示する", () => {
    const r = result({ sharpe: -0.54 }, { sharpe: -0.18 });
    const text = interpretResult(r).points.find((p) => p.title === "リスクあたりの効率")!.text;
    expect(text).toContain("−0.54");
    expect(text).toContain("−0.18");
  });

  it("戦略が Buy and Hold そのもの", () => {
    const r = result({}, {}, { strategy_id: "buy_hold" });
    const out = interpretResult(r);
    expect(out.headline).toContain("Buy and Hold そのもの");
    expect(out.points.map((p) => p.title)).not.toContain("取引の中身");
  });
});

describe("interpretResult: 各項目", () => {
  it("負けが多くても PF > 1 ならトレンドフォローの形と説明する", () => {
    const r = result({ win_rate: 0.4167, profit_factor: 3.33, closed_trades: 12 }, {});
    const trade = interpretResult(r).points.find((p) => p.title === "取引の中身")!;
    expect(trade.tone).toBe("good");
    expect(trade.text).toContain("41.7%");
    expect(trade.text).toContain("トレンドフォロー");
  });

  it("PF < 1 は損失が大きいと説明する", () => {
    const r = result({ win_rate: 0.36, profit_factor: 0.24 }, {});
    const trade = interpretResult(r).points.find((p) => p.title === "取引の中身")!;
    expect(trade.tone).toBe("bad");
    expect(trade.text).toContain("1 未満");
  });

  it("決済した取引が無ければ、計算できないと書く(0% とは書かない)", () => {
    const r = result({ closed_trades: 0, win_rate: null, profit_factor: null }, {});
    const trade = interpretResult(r).points.find((p) => p.title === "取引の中身")!;
    expect(trade.text).toContain("計算できません");
    expect(trade.text).not.toContain("0.0%");
  });

  it("下落が浅ければ good、深ければ bad", () => {
    const shallow = interpretResult(result({ max_drawdown: -0.2 }, { max_drawdown: -0.4 }));
    const deep = interpretResult(result({ max_drawdown: -0.5 }, { max_drawdown: -0.3 }));
    expect(shallow.points.find((p) => p.title === "いちばん大きな下落")!.tone).toBe("good");
    expect(deep.points.find((p) => p.title === "いちばん大きな下落")!.tone).toBe("bad");
  });
});

describe("interpretResult: 注意点", () => {
  it("取引が少ない・期間が短い・合成データのときは注意を出す", () => {
    const r = result({ closed_trades: 4 }, {}, { provider: "fixture", series: series(50, 2, 2024, 1) });
    const c = interpretResult(r).cautions.join("\n");
    expect(c).toContain("4 回しかありません");
    expect(c).toContain("1.0 年と短め");
    expect(c).toContain("合成データ");
  });

  it("過剰最適化の注意は常に出す", () => {
    expect(interpretResult(result({}, {})).cautions.at(-1)).toContain("過剰最適化");
  });
});

describe("補助関数", () => {
  it("sharpeLabel の区切り", () => {
    expect(sharpeLabel(null)).toBe("計算できない");
    expect(sharpeLabel(-0.1)).toContain("マイナス");
    expect(sharpeLabel(0.3)).toBe("低め");
    expect(sharpeLabel(0.66)).toBe("まずまず");
    expect(sharpeLabel(1.2)).toBe("良い");
    expect(sharpeLabel(2.5)).toContain("過剰最適化");
  });

  it("exposure は株を持っていた日の割合", () => {
    expect(exposure(series(10, 2))).toBeCloseTo(0.5);
    expect(exposure([])).toBe(0);
  });

  it("years は暦日ベース", () => {
    expect(years(series(10, 1, 2020, 5))).toBeCloseTo(5, 1);
  });
});

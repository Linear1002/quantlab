import { describe, expect, it } from "vitest";
import type { SeriesPoint } from "@/lib/api";
import { exposedReturns, histogram } from "./return-histogram";

const pt = (equity: number, position: number): SeriesPoint => ({
  date: "2024-01-01",
  equity,
  benchmark: equity,
  drawdown: 0,
  benchmark_drawdown: 0,
  position,
  open: 1,
  high: 1,
  low: 1,
  close: 1,
});

describe("exposedReturns", () => {
  it("前日の終値で株を持っていた日だけのリターンを集める", () => {
    // 持っていない日(position 0)の翌日の変化は含めない
    const s = [pt(100, 0), pt(100, 10), pt(110, 10), pt(99, 0), pt(99, 0)];
    const r = exposedReturns(s);
    expect(r).toHaveLength(2);
    expect(r[0]).toBeCloseTo(0.1);
    expect(r[1]).toBeCloseTo(-0.1);
  });
});

describe("histogram", () => {
  it("すべての値がどこかのビンに入る(合計が一致する)", () => {
    const values = Array.from({ length: 500 }, (_, i) => Math.sin(i) * 0.03);
    const bins = histogram(values);
    expect(bins.reduce((a, b) => a + b.count, 0)).toBe(500);
  });
  it("ビンの幅は 0.25% の倍数で、隙間なく並ぶ", () => {
    const bins = histogram([-0.02, -0.01, 0, 0.01, 0.02, 0.035]);
    const w = bins[0].to - bins[0].from;
    expect(Math.round(w / 0.0025) * 0.0025).toBeCloseTo(w, 10);
    for (let i = 1; i < bins.length; i++) expect(bins[i].from).toBeCloseTo(bins[i - 1].to, 10);
  });
  it("空なら空", () => {
    expect(histogram([])).toEqual([]);
  });
});

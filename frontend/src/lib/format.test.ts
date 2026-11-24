import { describe, expect, it } from "vitest";
import { formatPct, formatPrice, formatSigned, toIsoDate, yearsAgo } from "./format";

describe("formatPrice", () => {
  it("円は小数1桁まで、必要なときだけ小数を出す", () => {
    expect(formatPrice(3312, "JPY")).toBe("3,312 円");
    expect(formatPrice(3061.12, "JPY")).toBe("3,061.1 円");
  });
  it("fixed なら桁をそろえる(表用)", () => {
    expect(formatPrice(3140, "JPY", true)).toBe("3,140.0 円");
  });
  it("ドルは小数2桁", () => {
    expect(formatPrice(342.5, "USD")).toBe("$342.50");
  });
});

describe("formatSigned / formatPct", () => {
  it("プラスに +、マイナスに −(全角幅のマイナス記号)を付ける", () => {
    expect(formatSigned(12.345)).toBe("+12.35");
    expect(formatSigned(-3)).toBe("−3.00");
    expect(formatSigned(0)).toBe("±0.00");
    expect(formatPct(0.0123)).toBe("+1.23%");
  });
});

describe("日付", () => {
  it("toIsoDate はローカル日付の YYYY-MM-DD", () => {
    expect(toIsoDate(new Date(2024, 0, 5))).toBe("2024-01-05");
  });
  it("yearsAgo は指定した年数前", () => {
    expect(yearsAgo(5, new Date(2026, 10, 24))).toBe("2021-11-24");
  });
});

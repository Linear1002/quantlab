// 数値・日付の表示形式をそろえるための関数

/** 株価。円は小数1桁まで、ドルは2桁まで(必要なときだけ小数を出す) */
export function formatPrice(value: number, currency: string | null): string {
  const digits = currency === "JPY" ? 1 : 2;
  const num = value.toLocaleString("ja-JP", {
    minimumFractionDigits: currency === "JPY" ? 0 : 2,
    maximumFractionDigits: digits,
  });
  if (currency === "JPY") return `${num} 円`;
  if (currency === "USD") return `$${num}`;
  return currency ? `${num} ${currency}` : num;
}

/** 符号付きの変化額(+12.5 / −3.0)。マイナスは見やすい全角幅の記号を使う */
export function formatSigned(value: number, digits = 2): string {
  const abs = Math.abs(value).toLocaleString("ja-JP", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${value > 0 ? "+" : value < 0 ? "−" : "±"}${abs}`;
}

/** 比率を符号付きのパーセントに(0.0123 → +1.23%) */
export function formatPct(ratio: number, digits = 2): string {
  return `${formatSigned(ratio * 100, digits)}%`;
}

export function formatCount(n: number): string {
  return n.toLocaleString("ja-JP");
}

/** Date → "YYYY-MM-DD"(ローカル時刻の日付) */
export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 今日から years 年前の日付 */
export function yearsAgo(years: number, from = new Date()): string {
  const d = new Date(from);
  d.setFullYear(d.getFullYear() - years);
  return toIsoDate(d);
}

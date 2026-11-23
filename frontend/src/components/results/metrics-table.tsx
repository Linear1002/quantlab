import type { Metrics } from "@/lib/api";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";

/** 指標1行分の定義。better: 大きい方が良いか("high")、小さい方が良いか("low")、比べない(null) */
type Row = {
  key: string;
  label: string;
  help: string;
  value: (m: Metrics) => string;
  raw: (m: Metrics) => number | null;
  better: "high" | "low" | null;
};

const DASH = "—";
const pctS = (v: number | null) => (v == null ? DASH : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v * 100).toFixed(2)}%`);
const pct = (v: number | null) => (v == null ? DASH : `${(v * 100).toFixed(2)}%`);
// マイナスはリターンと同じ記号(−)にそろえる
const num = (v: number | null) => (v == null ? DASH : `${v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)}`);

export const METRIC_ROWS: Row[] = [
  { key: "total_return", label: "Total Return", help: "期間全体の損益率", value: (m) => pctS(m.total_return), raw: (m) => m.total_return, better: "high" },
  { key: "cagr", label: "CAGR", help: "年平均成長率(1年あたりに直したリターン)", value: (m) => pctS(m.cagr), raw: (m) => m.cagr, better: "high" },
  { key: "sharpe", label: "Sharpe Ratio", help: "リスク(値動きの大きさ)1単位あたりのリターン。高いほど効率が良い", value: (m) => num(m.sharpe), raw: (m) => m.sharpe, better: "high" },
  { key: "sortino", label: "Sortino Ratio", help: "下落リスクだけで測った Sharpe。上昇の値動きはリスクとみなさない", value: (m) => num(m.sortino), raw: (m) => m.sortino, better: "high" },
  { key: "max_drawdown", label: "Maximum Drawdown", help: "資産が最高値から最も大きく下がった割合", value: (m) => pctS(m.max_drawdown), raw: (m) => m.max_drawdown, better: "high" },
  { key: "volatility", label: "Volatility", help: "リターンのばらつき(年率)。大きいほど値動きが激しい", value: (m) => pct(m.volatility), raw: (m) => m.volatility, better: "low" },
  { key: "win_rate", label: "Win Rate", help: "決済した取引のうち、利益が出た割合", value: (m) => pct(m.win_rate), raw: (m) => m.win_rate, better: null },
  {
    key: "profit_factor",
    label: "Profit Factor",
    help: "利益の合計 ÷ 損失の合計。1 より大きければ全体で利益",
    value: (m) => (m.profit_factor_infinite ? "∞(損失なし)" : num(m.profit_factor)),
    raw: (m) => (m.profit_factor_infinite ? Infinity : m.profit_factor),
    better: null,
  },
  {
    key: "total_trades",
    label: "Total Trades",
    help: "取引の回数(期間末に保有中のものを含む)",
    value: (m) => `${formatCount(m.total_trades)} 回${m.total_trades > m.closed_trades ? `(うち保有中 ${m.total_trades - m.closed_trades})` : ""}`,
    raw: (m) => m.total_trades,
    better: null,
  },
];

/** 戦略と Buy and Hold の指標を並べて比べる表。良い方の値を強調する */
export function MetricsTable({ strategy, benchmark, strategyName }: { strategy: Metrics; benchmark: Metrics; strategyName: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs sm:text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-faint">
            <th scope="col" className="py-2.5 pr-4 font-normal">指標</th>
            <th scope="col" className="py-2.5 pr-3 text-right font-normal text-purple sm:pr-4">{strategyName}</th>
            <th scope="col" className="py-2.5 pr-0 text-right font-normal md:pr-4">Buy and Hold</th>
            <th scope="col" className="hidden py-2.5 font-normal md:table-cell">意味</th>
          </tr>
        </thead>
        <tbody>
          {METRIC_ROWS.map((row) => {
            const a = row.raw(strategy);
            const b = row.raw(benchmark);
            const aWins = row.better && a != null && b != null && a !== b && (row.better === "high" ? a > b : a < b);
            const bWins = row.better && a != null && b != null && a !== b && !aWins;
            return (
              <tr key={row.key} className="border-b border-line/60" data-testid={`metric-${row.key}`}>
                <th scope="row" className="py-2.5 pr-3 text-left font-normal text-muted-foreground sm:pr-4">
                  {row.label}
                </th>
                <td className={cn("py-2.5 pr-3 text-right sm:pr-4", aWins ? "font-semibold text-foreground" : "text-muted-foreground")}>
                  {row.value(strategy)}
                </td>
                <td className={cn("py-2.5 pr-0 text-right md:pr-4", bWins ? "font-semibold text-foreground" : "text-muted-foreground")}>
                  {row.value(benchmark)}
                </td>
                <td className="hidden py-2.5 text-xs text-faint md:table-cell">{row.help}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-faint">
        太字は、2つを比べて良い方の値です(勝率・PF・取引回数は単純に比べられないので強調しません)。「—」は計算できない値です(取引ゼロなど)。
      </p>
    </div>
  );
}

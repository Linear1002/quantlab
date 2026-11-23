// バックエンド(FastAPI)を呼ぶ関数はすべてこのファイルに集める。
// 画面のコンポーネントから fetch を直接呼ばないことで、URLやエラー処理を1か所で管理できる。

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

/** バックエンドが返す統一エラー形式 {"error": {"code", "message"}} に対応する例外 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

type Params = Record<string, string | undefined>;

async function request<T>(
  path: string,
  params?: Params,
  signal?: AbortSignal,
  body?: unknown,
): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) if (v !== undefined) qs.set(k, v);
  const url = `${API_BASE_URL}${path}${qs.size ? `?${qs}` : ""}`;
  const init: RequestInit =
    body === undefined
      ? { cache: "no-store", signal }
      : {
          method: "POST",
          cache: "no-store",
          signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        };

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e) {
    if (signal?.aborted) throw e; // 呼び出し側が中断した(入力し直したなど)。エラー表示はしない
    throw new ApiError(0, "NETWORK_ERROR", `バックエンド(${API_BASE_URL})に接続できません`);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(
      res.status,
      body?.error?.code ?? "HTTP_ERROR",
      body?.error?.message ?? `HTTP ${res.status}`,
    );
  }
  return (await res.json()) as T;
}

// ---- 型(backend の app/api/*.py のレスポンスと対応) ----------------------

export type Market = "JP" | "US";
export type Interval = "1d" | "1wk";

export type Health = { status: string; engine_version: string; data_provider: string };

export type SymbolInfo = {
  symbol: string;
  name: string;
  market: Market;
  exchange: string | null;
  currency: string | null;
};

export type SearchResult = {
  results: SymbolInfo[];
  provider: string;
  jp_name_search: boolean;
};

export type Quote = {
  symbol: string;
  price: number;
  currency: string | null;
  as_of: string; // YYYY-MM-DD
  change: number | null;
  change_pct: number | null;
  provider: string;
};

export type Bar = {
  date: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  adj_close: number;
  volume: number;
};

export type History = {
  symbol: string;
  interval: Interval;
  start: string;
  end: string;
  provider: string;
  bars: Bar[];
  warnings: string[];
};

// ---- API 呼び出し --------------------------------------------------------

export const getHealth = (signal?: AbortSignal) =>
  request<Health>("/api/health", undefined, signal);

export const searchStocks = (q: string, market?: Market, signal?: AbortSignal) =>
  request<SearchResult>("/api/stocks/search", { q, market }, signal);

export const getQuote = (symbol: string, signal?: AbortSignal) =>
  request<Quote>(`/api/stocks/${encodeURIComponent(symbol)}/quote`, undefined, signal);

export const getHistory = (
  symbol: string,
  start: string,
  end: string,
  interval: Interval,
  signal?: AbortSignal,
) =>
  request<History>(
    `/api/stocks/${encodeURIComponent(symbol)}/history`,
    { start, end, interval },
    signal,
  );

// ---- 戦略 ------------------------------------------------------------------

export type ParamDef = {
  name: string;
  label: string;
  type: "int" | "float";
  default: number;
  min: number;
  max: number;
  step: number;
  description: string;
};

export type StrategyCategory = "trend" | "oscillator" | "mean_reversion" | "benchmark";

export type StrategyDef = {
  id: string;
  name: string;
  category: StrategyCategory;
  summary: string;
  idea: string;
  buy_rule: string;
  sell_rule: string;
  suitable: string;
  risks: string[];
  difficulty: 1 | 2 | 3;
  params: ParamDef[];
};

export type SignalEvent = { date: string; type: "buy" | "sell"; close: number };

export type SignalsResult = {
  strategy_id: string;
  params: Record<string, number>;
  events: SignalEvent[];
  holding_at_end: boolean;
  bars: number;
  warmup_bars: number;
  provider: string;
  warnings: string[];
};

export const getStrategies = (signal?: AbortSignal) =>
  request<StrategyDef[]>("/api/strategies", undefined, signal);

export const postSignals = (
  strategyId: string,
  body: {
    symbol: string;
    start: string;
    end: string;
    interval: Interval;
    params: Record<string, number>;
  },
  signal?: AbortSignal,
) =>
  request<SignalsResult>(
    `/api/strategies/${encodeURIComponent(strategyId)}/signals`,
    undefined,
    signal,
    body,
  );

/** 合成データ(テスト用)のデータ元か。画面に警告を出すために使う */
export const isSyntheticProvider = (provider: string) => provider === "fixture";

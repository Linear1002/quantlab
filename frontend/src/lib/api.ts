// バックエンド(FastAPI)を呼ぶ関数はすべてこのファイルに集める。
// 画面のコンポーネントから fetch を直接呼ばないことで、URLやエラー処理を1か所で管理できる。

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, { cache: "no-store", ...init });
  } catch {
    // サーバー未起動・ネットワーク断など
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

export type Health = { status: string; engine_version: string; data_provider: string };

export const getHealth = () => request<Health>("/api/health");

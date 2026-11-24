#!/usr/bin/env bash
# QuantLab の開発サーバーを1コマンドで起動する(backend: 8000 / frontend: 3000)。
#
# 使い方(WSL の Ubuntu で):
#   cd ~/dev/quantlab && ./dev.sh          # 起動
#   ./dev.sh --install                     # パッケージを入れ直してから起動(git pull の後など)
# 止めるときは Ctrl + C(両方まとめて止まる)。

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 前回のサーバーが残っていたら止める(「address already in use」対策)
for port in 8000 3000; do
  if command -v fuser >/dev/null 2>&1 && fuser "${port}/tcp" >/dev/null 2>&1; then
    echo "ポート ${port} を使っている古いプロセスを止めます"
    fuser -k "${port}/tcp" >/dev/null 2>&1 || true
  fi
done

if [[ "${1:-}" == "--install" ]]; then
  echo "== パッケージを入れ直しています =="
  (cd "$ROOT/backend" && uv sync)
  (cd "$ROOT/frontend" && npm ci)
fi

# Ctrl + C で両方のサーバーを止める
cleanup() {
  echo
  echo "サーバーを止めています"
  kill 0 2>/dev/null || true
}
trap cleanup INT TERM EXIT

echo "== backend を起動しています(http://localhost:8000/docs)=="
(cd "$ROOT/backend" && uv run uvicorn app.main:app --reload --port 8000) &

echo "== frontend を起動しています(http://localhost:3000)=="
(cd "$ROOT/frontend" && npm run dev) &

echo
echo "ブラウザで http://localhost:3000 を開いてください。止めるときは Ctrl + C"
wait

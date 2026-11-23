"""Yahoo Finance から実データが取れるかと、データの仕様(QUANT_SPEC §2.1)を確認するスクリプト。

実行: cd backend && uv run python scripts/check_yahoo.py
アプリ本体からは使わない(Phase 3 で app/data/yahoo.py を正式に実装する)。
"""

import sys

import yfinance as yf

SYMBOLS = ["7203.T", "AAPL"]  # トヨタ、Apple


def check(symbol: str) -> bool:
    print(f"\n=== {symbol} ===")
    try:
        t = yf.Ticker(symbol)
        # auto_adjust=False にすると Close と Adj Close の両方が返る
        df = t.history(period="1y", interval="1d", auto_adjust=False, actions=True)
    except Exception as e:  # 取得失敗の原因をそのまま表示する
        print(f"  ✕ 取得失敗: {type(e).__name__}: {e}")
        return False
    if df.empty:
        print("  ✕ データが0行(銘柄コードの誤り、またはアクセス制限の可能性)")
        return False

    print(f"  ✓ {len(df)} 行  {df.index[0].date()} 〜 {df.index[-1].date()}")
    print(f"  列: {list(df.columns)}")
    print(f"  index の tz: {df.index.tz}")
    last = df.iloc[-1]
    print(f"  最新: Close={last['Close']:.2f}  Adj Close={last['Adj Close']:.2f}")
    divs = df[df["Dividends"] > 0]["Dividends"]
    splits = df[df["Stock Splits"] > 0]["Stock Splits"]
    print(f"  配当: {len(divs)} 回 {divs.round(4).to_dict()}")
    print(f"  分割: {len(splits)} 回 {splits.to_dict()}")
    ratio = (df["Adj Close"] / df["Close"]).iloc[[0, -1]].round(5).tolist()
    print(f"  調整係数 Adj/Close(最初, 最後): {ratio}  ← 最後が 1.0 なら仕様どおり")
    return True


if __name__ == "__main__":
    ok = all([check(s) for s in SYMBOLS])
    sys.exit(0 if ok else 1)

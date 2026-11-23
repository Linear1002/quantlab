"""実際の Yahoo Finance に接続して、データの仕様を確認するテスト(QUANT_SPEC §2.1)。

ネットワークが必要なので、通常の `uv run pytest` では実行しない。
実行: uv run pytest -m network -v -s(-s を付けると、確認用の数値も表示される)
"""

from datetime import date

import pytest

from app.data.base import Interval
from app.data.validation import validate_ohlcv
from app.data.yahoo import YahooProvider

pytestmark = pytest.mark.network

# (銘柄, 分割の権利落ち日, 分割比率, 確認する期間)
SPLITS = [
    ("NVDA", date(2024, 6, 10), 10, date(2024, 5, 27), date(2024, 6, 21)),
    ("7203.T", date(2021, 9, 29), 5, date(2021, 9, 15), date(2021, 10, 15)),
]


@pytest.fixture(scope="module")
def yahoo():
    return YahooProvider()


@pytest.mark.parametrize("symbol,ex_date,ratio,start,end", SPLITS)
def test_close_is_split_adjusted(yahoo, symbol, ex_date, ratio, start, end):
    """分割日の前後で Close が 1/ratio に跳んでいなければ、Close は分割調整済み。"""
    df, _ = validate_ohlcv(yahoo.get_ohlcv(symbol, start, end, Interval.DAILY))
    before = df.loc[: str(ex_date)].iloc[:-1]["close"].iloc[-1]  # 権利落ち日の前日の終値
    after = df.loc[str(ex_date) :]["close"].iloc[0]  # 権利落ち日の終値
    jump = after / before
    print(f"{symbol}: 前日 {before:.2f} → 当日 {after:.2f}(比 {jump:.3f})")
    # 調整されていなければ比はおよそ 1/ratio(NVDA なら 0.1)になる
    assert 0.7 < jump < 1.3, f"分割調整されていない可能性があります(比 {jump:.3f})"
    # Open/High/Low も同じ基準になっていること
    assert 0.7 < df.loc[str(ex_date) :]["open"].iloc[0] / before < 1.3


@pytest.mark.parametrize("symbol", ["7203.T", "AAPL"])
def test_adj_close_is_dividend_adjusted(yahoo, symbol):
    """配当のある銘柄では、過去の Adj Close / Close が 1 より小さい。"""
    df, _ = validate_ohlcv(
        yahoo.get_ohlcv(symbol, date(2023, 1, 1), date(2024, 12, 31), Interval.DAILY)
    )
    factor = df["adj_close"] / df["close"]
    print(f"{symbol}: 調整係数 最初 {factor.iloc[0]:.4f} / 最後 {factor.iloc[-1]:.4f}")
    assert factor.iloc[0] < factor.iloc[-1] <= 1.0 + 1e-9
    # 過去ほど係数が小さい(配当が積み重なる)。ただし Yahoo の Adj Close は丸められているので、
    # 配当の無い日でも係数が 1e-6 程度ゆれる(実データで 0.992041 → 0.992042 → 0.992041 を確認)。
    # そのゆれは許し、それより大きな「逆戻り」が無いことを確認する
    step = factor.diff().dropna()
    print(f"{symbol}: 最大の逆戻り {step.min():.2e} / 配当による上昇 {int((step > 1e-4).sum())} 回")
    assert step.min() > -1e-5
    assert (step > 1e-4).sum() >= 2  # 2年間に配当が2回以上あるはず(トヨタ・Apple とも)


def test_search_and_quote_work(yahoo):
    assert any(r.symbol == "AAPL" for r in yahoo.search("Apple"))
    q = yahoo.get_quote("AAPL")
    assert q.price > 0 and q.currency == "USD"

"""戦略とシグナル生成のテスト(QUANT_SPEC §4, §8)。"""

import numpy as np
import pandas as pd
import pytest

from quant.errors import InvalidParameterError
from quant.strategies import STRATEGIES, Strategy, StrategyInfo, generate_signals, get_strategy


def ohlcv(close) -> pd.DataFrame:
    close = pd.Series(
        close, dtype="float64", index=pd.bdate_range("2020-01-01", periods=len(close))
    )
    return pd.DataFrame(
        {"open": close, "high": close * 1.01, "low": close * 0.99, "close": close, "volume": 1.0}
    )


def random_df(seed: int, n: int = 400) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    return ohlcv(100 * np.exp(rng.normal(0, 0.02, n).cumsum()))


# ---- レジストリ ----------------------------------------------------------


def test_registry_has_eight_strategies():
    assert list(STRATEGIES) == [
        "sma_cross", "ema_cross", "rsi", "macd",
        "bollinger", "momentum", "mean_reversion", "buy_hold",
    ]  # fmt: skip
    for s in STRATEGIES.values():
        assert s.info.name and s.info.summary and s.info.buy_rule and s.info.sell_rule
        assert s.info.risks, f"{s.id} にリスクの説明がない"
        s.validate_params({})  # 既定値が自分自身の制約を満たしていること


def test_unknown_strategy():
    with pytest.raises(InvalidParameterError):
        get_strategy("nope")


# ---- パラメータの検証 -------------------------------------------------------


def test_defaults_are_filled():
    assert get_strategy("sma_cross").validate_params({"short": 5}) == {"short": 5, "long": 50}


@pytest.mark.parametrize(
    "sid,params,msg",
    [
        ("sma_cross", {"short": 50, "long": 20}, "短期期間"),
        ("sma_cross", {"short": 1}, "範囲"),
        ("sma_cross", {"short": 10.5}, "整数"),
        ("sma_cross", {"short": True}, "数値"),
        ("sma_cross", {"shrot": 10}, "unknown"),
        ("rsi", {"lower": 70, "upper": 30}, "閾値"),
        ("macd", {"fast": 30, "slow": 26}, "短期EMA"),
        ("mean_reversion", {"entry_z": 1.0, "exit_z": 1.5}, "乖離"),
        ("bollinger", {"k": 10}, "範囲"),
    ],
)
def test_invalid_params(sid, params, msg):
    with pytest.raises(InvalidParameterError, match=msg):
        get_strategy(sid).validate_params(params)


def test_int_given_as_float_is_accepted():
    assert get_strategy("sma_cross").validate_params({"short": 10.0})["short"] == 10


# ---- 状態機械 ------------------------------------------------------------


class Scripted(Strategy):
    """entry / exit を直接指定できるテスト用の戦略。"""

    id = "scripted"
    info = StrategyInfo("t", "benchmark", "", "", "", "", "")

    def __init__(self, entry, exit_):
        self._e, self._x = entry, exit_

    def min_bars(self, p):
        return 1

    def events(self, df, p):
        return pd.Series(self._e, index=df.index), pd.Series(self._x, index=df.index)


def run(entry, exit_, trade_start=None):
    df = ohlcv([100.0] * len(entry))
    ts = df.index[trade_start] if trade_start is not None else None
    return generate_signals(Scripted(entry, exit_), df, trade_start=ts).tolist()


def test_state_machine_basic():
    e = [0, 1, 0, 1, 0, 0, 1]
    x = [0, 0, 0, 0, 1, 0, 0]
    assert run(e, x) == [0, 1, 1, 1, 0, 0, 1]


def test_exit_without_position_is_ignored():
    assert run([0, 0, 1, 0], [1, 1, 0, 0]) == [0, 0, 1, 1]


def test_same_bar_entry_and_exit_is_conservative():
    # ノーポジで両方 True → 買わない。保有中で両方 True → 売る
    assert run([1, 1, 1, 0], [1, 0, 1, 0]) == [0, 1, 0, 0]


def test_trade_start_ignores_warmup_state():
    # ウォームアップ中(位置0〜2)の entry では保有にならない
    assert run([1, 0, 0, 0, 1], [0, 0, 0, 0, 0], trade_start=3) == [0, 0, 0, 0, 1]


def test_sma_cross_in_warmup_does_not_hold_at_start():
    """仕様 v0.3 で直した問題: ウォームアップ中にゴールデンクロスがあっても、初日は保有しない。"""
    close = [10.0] * 5 + [float(v) for v in range(11, 31)]  # 位置5から上昇 → 早い段階でクロス
    df = ohlcv(close)
    sig = generate_signals(get_strategy("sma_cross"), df, {"short": 2, "long": 4}, df.index[15])
    assert sig.iloc[15:].sum() == 0  # 開始後に新たなクロスが無いので、ずっとノーポジ
    sig_all = generate_signals(get_strategy("sma_cross"), df, {"short": 2, "long": 4})
    assert sig_all.sum() > 0  # 最初から取引すればクロスで買っている


# ---- 各戦略の売買タイミング --------------------------------------------------


def test_sma_cross_buys_on_golden_cross_bar():
    close = [10, 9, 8, 7, 6, 7, 8, 9, 10, 11, 10, 9, 8, 7, 6]
    sig = generate_signals(get_strategy("sma_cross"), ohlcv(close), {"short": 2, "long": 4})
    buy = sig.diff().fillna(0).eq(1).to_numpy().nonzero()[0].tolist()
    sell = sig.diff().fillna(0).eq(-1).to_numpy().nonzero()[0].tolist()
    # 位置6: SMA2=7.5 > SMA4=7.0(前日 6.5 <= 6.5)→ 上抜け
    assert buy == [6]
    # 位置11: SMA2=9.5 < SMA4=10.0(前日 10.5 >= 10.0)→ 下抜け
    assert sell == [11]


def test_rsi_buys_oversold_and_sells_overbought():
    close = [100, 99, 98, 97, 96, 95, 96, 98, 100, 102, 104]
    sig = generate_signals(get_strategy("rsi"), ohlcv(close), {"n": 3, "lower": 30, "upper": 70})
    assert sig.iloc[3] == 1  # 下落が続き RSI=0 < 30
    assert sig.iloc[-1] == 0  # 上昇で RSI > 70 → 売り


def test_bollinger_exits_at_mid():
    close = [100] * 10 + [90] + [92, 95, 101, 101]
    sig = generate_signals(get_strategy("bollinger"), ohlcv(close), {"n": 5, "k": 1.5})
    assert sig.iloc[10] == 1  # 急落で下限を割る
    assert sig.iloc[-1] == 0  # 中心線を超えて売り


def test_momentum_holds_while_positive():
    close = list(range(100, 110)) + list(range(109, 99, -1))
    sig = generate_signals(get_strategy("momentum"), ohlcv(close), {"n": 3, "threshold": 0})
    assert sig.iloc[3:10].eq(1).all()
    assert sig.iloc[-1] == 0


def test_buy_and_hold_from_trade_start():
    df = ohlcv([100.0] * 10)
    sig = generate_signals(get_strategy("buy_hold"), df, trade_start=df.index[4])
    assert sig.tolist() == [0, 0, 0, 0, 1, 1, 1, 1, 1, 1]


def test_signals_are_int8_zero_or_one():
    for s in STRATEGIES.values():
        sig = generate_signals(s, random_df(5))
        assert sig.dtype == np.int8 and set(sig.unique()) <= {0, 1}


# ---- min_bars とウォームアップ --------------------------------------------------


@pytest.mark.parametrize("sid", list(STRATEGIES))
def test_no_events_before_min_bars(sid):
    """min_bars より前にはきっかけが出ない(= min_bars がウォームアップとして十分)。"""
    s = get_strategy(sid)
    p = s.validate_params({})
    entry, exit_ = s.events(random_df(7), p)
    first_possible = s.min_bars(p) - 1
    if sid == "buy_hold":
        return
    assert not entry.iloc[:first_possible].any() and not exit_.iloc[:first_possible].any()


# ---- Look-ahead Bias(QUANT_SPEC §8)--------------------------------------------


@pytest.mark.parametrize("sid", list(STRATEGIES))
@pytest.mark.parametrize("seed", [11, 12, 13])
def test_prefix_invariance(sid, seed):
    """§8-1: 途中までのデータで計算したシグナルが、全データで計算したものの先頭と一致する。"""
    s = get_strategy(sid)
    df = random_df(seed)
    full = generate_signals(s, df)
    for k in (60, 150, 260, 399):
        part = generate_signals(s, df.iloc[:k])
        pd.testing.assert_series_equal(part, full.iloc[:k])


@pytest.mark.parametrize("sid", list(STRATEGIES))
def test_future_tampering_does_not_change_past(sid):
    """§8-2: t 以降の価格を書き換えても、t より前のシグナルは変わらない。"""
    s = get_strategy(sid)
    df = random_df(21)
    full = generate_signals(s, df)
    rng = np.random.default_rng(99)
    for t in (100, 200, 300):
        tampered = df.copy()
        tampered.iloc[t:, :4] = tampered.iloc[t:, :4].to_numpy() * rng.uniform(
            0.5, 1.5, (len(df) - t, 1)
        )
        pd.testing.assert_series_equal(generate_signals(s, tampered).iloc[:t], full.iloc[:t])

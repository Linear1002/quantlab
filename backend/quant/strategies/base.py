"""戦略の共通部分(QUANT_SPEC §4.1)。

役割分担:
- 各戦略クラス: パラメータの定義と、売買の「きっかけ」(entry / exit) を返す events() だけを書く
- generate_signals(): きっかけからポジション(0 or 1)を作る状態機械。全戦略で共通
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import ClassVar, Literal

import numpy as np
import pandas as pd

from quant.errors import InvalidParameterError

Number = int | float


@dataclass(frozen=True)
class ParamSpec:
    """戦略パラメータ1つ分の定義。UI のフォームもこれから作る。"""

    name: str
    label: str  # 画面に出す名前
    type: Literal["int", "float"]
    default: Number
    min: Number
    max: Number
    step: Number
    description: str = ""


@dataclass(frozen=True)
class StrategyInfo:
    """戦略カードに表示する説明。"""

    name: str
    category: Literal["trend", "oscillator", "mean_reversion", "benchmark"]
    summary: str  # 戦略の概要(1文)
    idea: str  # どのような考え方の戦略か
    buy_rule: str
    sell_rule: str
    suitable: str  # 向いている相場
    risks: list[str] = field(default_factory=list)
    difficulty: Literal[1, 2, 3] = 1  # 1=初級, 2=中級, 3=上級


class Strategy(ABC):
    id: ClassVar[str]
    info: ClassVar[StrategyInfo]
    params: ClassVar[list[ParamSpec]] = []

    def param_schema(self) -> list[ParamSpec]:
        return list(self.params)

    def validate_params(self, params: dict | None) -> dict[str, Number]:
        """型・範囲・相互関係をチェックし、省略されたものは既定値で補った dict を返す。"""
        params = dict(params or {})
        specs = {p.name: p for p in self.params}
        unknown = set(params) - set(specs)
        if unknown:
            raise InvalidParameterError(f"{self.id}: unknown parameters {sorted(unknown)}")

        out: dict[str, Number] = {}
        for name, spec in specs.items():
            v = params.get(name, spec.default)
            if isinstance(v, bool) or not isinstance(v, (int, float, np.integer, np.floating)):
                raise InvalidParameterError(f"{spec.label}({name}) は数値で指定してください")
            if spec.type == "int":
                if float(v) != int(v):
                    raise InvalidParameterError(f"{spec.label}({name}) は整数で指定してください")
                v = int(v)
            else:
                v = float(v)
            if not spec.min <= v <= spec.max:
                raise InvalidParameterError(
                    f"{spec.label}({name}) は {spec.min} 〜 {spec.max} の範囲で指定してください"
                )
            out[name] = v
        self._check_relations(out)
        return out

    def _check_relations(self, p: dict[str, Number]) -> None:  # noqa: B027 - 任意で上書きする
        """パラメータ同士の関係(短期 < 長期 など)。必要な戦略だけ上書きする。"""

    @abstractmethod
    def min_bars(self, p: dict[str, Number]) -> int:
        """指標が最初に有効になるまでに必要な本数(ウォームアップの目安)。"""

    @abstractmethod
    def events(self, df: pd.DataFrame, p: dict[str, Number]) -> tuple[pd.Series, pd.Series]:
        """(entry, exit) の bool 列。t の値は t の終値までの情報だけで決めること。"""


def generate_signals(
    strategy: Strategy,
    df: pd.DataFrame,
    params: dict | None = None,
    trade_start: pd.Timestamp | None = None,
) -> pd.Series:
    """目標ポジション s_t ∈ {0, 1} を返す(QUANT_SPEC §4.1)。

    - trade_start より前は必ず 0(ウォームアップ期間)
    - trade_start 以降: ノーポジで entry → 1、保有中で exit → 0
    - 同じバーで entry と exit が両方 True: ノーポジなら買わない、保有中なら売る
    """
    p = strategy.validate_params(params)
    entry, exit_ = strategy.events(df, p)
    en = entry.reindex(df.index, fill_value=False).to_numpy(dtype=bool)
    ex = exit_.reindex(df.index, fill_value=False).to_numpy(dtype=bool)

    start_i = 0 if trade_start is None else int(df.index.searchsorted(trade_start, side="left"))
    pos = np.zeros(len(df), dtype=np.int8)
    holding = False
    # ここは逐次処理(1本ずつ)。GPU 版では1スレッドが1パラメータ組についてこのループを回す
    for t in range(start_i, len(df)):
        if holding:
            if ex[t]:
                holding = False
        elif en[t] and not ex[t]:
            holding = True
        pos[t] = 1 if holding else 0
    return pd.Series(pos, index=df.index, name="signal")

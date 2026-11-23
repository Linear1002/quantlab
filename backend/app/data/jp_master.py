"""日本株の銘柄一覧(JPX 公式の「東証上場銘柄一覧」から作った CSV)を使った検索。

Yahoo の検索は日本語の銘柄名にほぼ対応していないので、日本株はこちらで検索する。
CSV は `uv run python scripts/update_jpx_master.py` で作る(git には含めない)。
"""

from __future__ import annotations

import csv
import unicodedata
from dataclasses import dataclass
from pathlib import Path

from app.data.base import Market, SymbolInfo

DEFAULT_PATH = Path(__file__).resolve().parents[2] / "data" / "jpx_listed.csv"
CSV_FIELDS = ["code", "name", "segment", "sector"]


@dataclass(frozen=True)
class JpListing:
    code: str  # "7203", "285A"(英字入りの新コードもある)
    name: str
    segment: str  # 市場・商品区分(例: プライム(内国株式))
    sector: str  # 33業種区分

    @property
    def symbol(self) -> str:
        return f"{self.code}.T"

    def to_symbol_info(self) -> SymbolInfo:
        return SymbolInfo(
            symbol=self.symbol, name=self.name, market=Market.JP, exchange="TSE", currency="JPY"
        )


def listings_from_jpx_table(table) -> list[JpListing]:
    """JPX の「東証上場銘柄一覧」の表(pandas.DataFrame)から JpListing を作る。

    列名で探すので、列の並び順が変わっても動く。必要な列が無ければ ValueError。
    """
    cols = {"コード": "code", "銘柄名": "name", "市場・商品区分": "segment", "33業種区分": "sector"}
    missing = [c for c in cols if c not in table.columns]
    if missing:
        raise ValueError(
            f"JPX の一覧に必要な列がありません: {missing}(ファイル形式が変わった可能性)"
        )
    out = []
    for _, r in table[list(cols)].iterrows():
        code = str(r["コード"]).strip()
        if code.endswith(".0"):  # Excel で数値として読まれた場合 "7203.0" になる
            code = code[:-2]
        if not code or code.lower() == "nan":
            continue
        sector = (
            "" if str(r["33業種区分"]).strip() in ("-", "nan") else str(r["33業種区分"]).strip()
        )
        out.append(
            JpListing(code, str(r["銘柄名"]).strip(), str(r["市場・商品区分"]).strip(), sector)
        )
    return out


def _normalize(text: str) -> str:
    """全角・半角や大文字・小文字の違いを吸収する(「ﾄﾖﾀ」と「トヨタ」、「ＡＢＣ」と「abc」)。"""
    return unicodedata.normalize("NFKC", text).casefold().strip()


class JpMaster:
    def __init__(self, listings: list[JpListing]):
        self._listings = listings
        self._index = [(_normalize(x.code), _normalize(x.name), x) for x in listings]

    @classmethod
    def load(cls, path: Path = DEFAULT_PATH) -> JpMaster | None:
        """CSV を読む。ファイルが無ければ None(日本語検索は使えない状態)。"""
        if not path.exists():
            return None
        with path.open(encoding="utf-8", newline="") as f:
            rows = [JpListing(**{k: r[k] for k in CSV_FIELDS}) for r in csv.DictReader(f)]
        return cls(rows)

    def __len__(self) -> int:
        return len(self._listings)

    def search(self, query: str, limit: int = 10) -> list[JpListing]:
        """コードは前方一致、銘柄名は部分一致。コード一致を先に並べる。"""
        q = _normalize(query).removesuffix(".t")
        if not q:
            return []
        code_hits = [x for c, _, x in self._index if c.startswith(q)]
        name_hits = [x for c, n, x in self._index if q in n and not c.startswith(q)]
        # 名前は「先頭一致 → 短い名前」の順にすると、目的の銘柄が上に来やすい
        name_hits.sort(key=lambda x: (not _normalize(x.name).startswith(q), len(x.name)))
        return (code_hits + name_hits)[:limit]

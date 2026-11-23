"""設定(QUANTLAB_DATA_PROVIDER)からデータ元を組み立てる。差し替えはここを変えるだけで済む。"""

from __future__ import annotations

import logging
from functools import lru_cache

from app.config import get_settings
from app.data.base import MarketDataProvider
from app.data.cache import CachedProvider
from app.data.fixture import FixtureProvider
from app.data.jp_master import JpMaster
from app.data.yahoo import YahooProvider
from app.db.session import make_engine

log = logging.getLogger(__name__)


def create_provider(kind: str, database_url: str) -> MarketDataProvider:
    if kind == "yahoo":
        jp = JpMaster.load()
        if jp is None:
            log.warning(
                "data/jpx_listed.csv がありません。日本語名での検索は無効です。"
                " `uv run python scripts/update_jpx_master.py` で作成してください"
            )
        return CachedProvider(YahooProvider(jp_master=jp), make_engine(database_url))
    if kind == "fixture":
        log.warning("テスト用の合成データ(fixture)を使っています。実データではありません")
        return FixtureProvider()
    raise ValueError(f"Unknown data provider: {kind!r}(yahoo / fixture のどちらか)")


@lru_cache
def get_provider() -> MarketDataProvider:
    """FastAPI の Depends で使う。テストでは app.dependency_overrides で差し替える。"""
    s = get_settings()
    return create_provider(s.data_provider, s.database_url)


def jp_search_available(provider: MarketDataProvider) -> bool:
    """日本語名検索が使えるか(画面に案内を出すため)。"""
    inner = getattr(provider, "inner", provider)
    return isinstance(inner, YahooProvider) and inner._jp is not None  # noqa: SLF001

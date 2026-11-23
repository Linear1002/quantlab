"""全テスト共通の設定。"""

import pytest

from app.db.session import get_engine, make_engine
from app.main import app


@pytest.fixture(autouse=True)
def isolated_db(tmp_path):
    """どのテストも、本物の quantlab.db ではなく一時ファイルの DB を使う。"""
    engine = make_engine(f"sqlite:///{tmp_path}/test.db")
    app.dependency_overrides[get_engine] = lambda: engine
    yield engine
    app.dependency_overrides.pop(get_engine, None)
    engine.dispose()

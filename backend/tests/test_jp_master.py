import pandas as pd
import pytest

from app.data.jp_master import JpListing, JpMaster, listings_from_jpx_table

MASTER = JpMaster(
    [
        JpListing("7203", "トヨタ自動車", "プライム(内国株式)", "輸送用機器"),
        JpListing("7267", "本田技研工業", "プライム(内国株式)", "輸送用機器"),
        JpListing("6201", "豊田自動織機", "プライム(内国株式)", "輸送用機器"),
        JpListing("1306", "ＮＥＸＴ ＦＵＮＤＳ ＴＯＰＩＸ連動型上場投信", "ETF・ETN", ""),
        JpListing("285A", "キオクシアホールディングス", "プライム(内国株式)", "電気機器"),
    ]
)


def test_code_prefix_match_comes_first():
    assert [x.code for x in MASTER.search("72")] == ["7203", "7267"]


def test_name_partial_match():
    assert [x.code for x in MASTER.search("トヨタ")] == ["7203"]


def test_symbol_suffix_is_ignored():
    assert MASTER.search("7203.T")[0].symbol == "7203.T"


def test_fullwidth_and_case_are_normalized():
    # 全角の「ＴＯＰＩＸ」も半角小文字の "topix" で見つかる
    assert MASTER.search("topix")[0].code == "1306"


def test_alphanumeric_code():
    assert MASTER.search("285a")[0].code == "285A"


def test_limit_and_blank():
    assert len(MASTER.search("7", limit=1)) == 1
    assert MASTER.search("   ") == []


def test_load_returns_none_when_file_missing(tmp_path):
    assert JpMaster.load(tmp_path / "none.csv") is None


def test_load_csv(tmp_path):
    p = tmp_path / "jpx.csv"
    p.write_text(
        "code,name,segment,sector\n7203,トヨタ自動車,プライム(内国株式),輸送用機器\n", "utf-8"
    )
    m = JpMaster.load(p)
    assert len(m) == 1 and m.search("7203")[0].name == "トヨタ自動車"


def test_listings_from_jpx_table():
    table = pd.DataFrame(
        {
            "日付": ["20261031"] * 3,
            "コード": ["7203", "1306.0", None],
            "銘柄名": ["トヨタ自動車", "TOPIX ETF", "x"],
            "市場・商品区分": ["プライム(内国株式)", "ETF・ETN", "x"],
            "33業種コード": ["3700", "-", "x"],
            "33業種区分": ["輸送用機器", "-", "x"],
        }
    )
    rows = listings_from_jpx_table(table)
    assert [(r.code, r.sector) for r in rows] == [("7203", "輸送用機器"), ("1306", "")]


def test_listings_from_jpx_table_missing_column():
    with pytest.raises(ValueError, match="列"):
        listings_from_jpx_table(pd.DataFrame({"コード": ["7203"]}))

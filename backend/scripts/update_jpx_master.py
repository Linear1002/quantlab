"""JPX 公式の「東証上場銘柄一覧」をダウンロードして、data/jpx_listed.csv を作る。

実行: cd backend && uv run python scripts/update_jpx_master.py
JPX は毎月第3営業日に前月末時点の一覧に差し替えるので、月1回程度実行すればよい。
出典: https://www.jpx.co.jp/markets/statistics-equities/misc/01.html
"""

import csv
import io
import sys
import urllib.request
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.data.jp_master import CSV_FIELDS, DEFAULT_PATH, listings_from_jpx_table  # noqa: E402

URL = "https://www.jpx.co.jp/markets/statistics-equities/misc/tvdivq0000001vg2-att/data_j.xlsx"


def main() -> int:
    print(f"ダウンロード中: {URL}")
    try:
        req = urllib.request.Request(URL, headers={"User-Agent": "QuantLab/0.1 (personal use)"})
        with urllib.request.urlopen(req, timeout=60) as res:
            data = res.read()
    except Exception as e:  # noqa: BLE001
        print(f"✕ ダウンロードに失敗しました: {e}")
        print("  URL が変わった可能性があります。出典ページで Excel のリンクを確認してください")
        return 1

    table = pd.read_excel(io.BytesIO(data), dtype=str)
    listings = listings_from_jpx_table(table)
    DEFAULT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with DEFAULT_PATH.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=CSV_FIELDS)
        w.writeheader()
        for x in listings:
            w.writerow({"code": x.code, "name": x.name, "segment": x.segment, "sector": x.sector})

    segments = pd.Series([x.segment for x in listings]).value_counts()
    print(f"✓ {len(listings)} 銘柄を保存しました: {DEFAULT_PATH}")
    print(segments.to_string())
    return 0


if __name__ == "__main__":
    sys.exit(main())

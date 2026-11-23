"""設計ルールの自動チェック: quant は Web 層(app, fastapi など)を import しない。"""

import ast
from pathlib import Path

QUANT_DIR = Path(__file__).resolve().parents[1] / "quant"
FORBIDDEN = {"app", "fastapi", "sqlalchemy", "yfinance"}


def test_quant_has_no_web_dependencies():
    violations = []
    for py in QUANT_DIR.rglob("*.py"):
        tree = ast.parse(py.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            names = []
            if isinstance(node, ast.Import):
                names = [a.name for a in node.names]
            elif isinstance(node, ast.ImportFrom) and node.module:
                names = [node.module]
            for n in names:
                if n.split(".")[0] in FORBIDDEN:
                    violations.append(f"{py.name}: {n}")
    assert not violations, violations

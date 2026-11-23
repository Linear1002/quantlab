"""quant パッケージ共通の例外。

ここでは FastAPI などの Web 層に依存しない。
API 層はこれらの例外を捕まえて、HTTP のエラーレスポンスに変換する。
"""


class QuantError(Exception):
    """quant パッケージのすべての例外の基底クラス。"""


class InvalidParameterError(QuantError, ValueError):
    """戦略パラメータやバックテスト設定が仕様の範囲外のとき。"""


class InsufficientDataError(QuantError):
    """計算に必要なバー数が足りないとき。"""

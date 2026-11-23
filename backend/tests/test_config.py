import pytest

from quant.errors import InvalidParameterError
from quant.models import BacktestConfig, SizingMode, default_lot_size


def test_defaults_are_valid():
    cfg = BacktestConfig()
    assert cfg.slippage == pytest.approx(0.0005)
    assert cfg.sizing_mode is SizingMode.PERCENT_EQUITY


def test_string_enum_is_converted():
    cfg = BacktestConfig(sizing_mode="fixed_shares", sizing_value=100)
    assert cfg.sizing_mode is SizingMode.FIXED_SHARES


@pytest.mark.parametrize(
    "kwargs",
    [
        {"initial_capital": 0},
        {"commission_rate": -0.001},
        {"commission_rate": 0.1},
        {"slippage_bps": -1},
        {"lot_size": 0},
        {"sizing_value": 0},
        {"sizing_value": 1.5},
        {"sizing_mode": "fixed_shares", "sizing_value": 10.5},
        {"long_only": False},
    ],
)
def test_invalid_config_raises(kwargs):
    with pytest.raises(InvalidParameterError):
        BacktestConfig(**kwargs)


def test_default_lot_size():
    assert default_lot_size("7203.T") == 100
    assert default_lot_size("AAPL") == 1

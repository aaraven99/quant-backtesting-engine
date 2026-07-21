import pandas as pd
import pytest

from backtesting_engine.engine import BacktestConfig, run_backtest
from backtesting_engine.metrics import drawdown
from backtesting_engine.strategies import sma_crossover


def test_signal_is_shifted_before_execution() -> None:
    index = pd.date_range("2024-01-01", periods=3)
    result = run_backtest(
        pd.Series([10, 20, 20], index=index),
        pd.Series([1, 0, 0], index=index),
        BacktestConfig(100, 0, 0),
    )
    assert result.positions.iloc[0] == 0
    assert result.positions.iloc[1] > 0


def test_drawdown_and_empty_data() -> None:
    assert drawdown(pd.Series([100, 80, 120])).round(2).tolist() == [0.0, -0.2, 0.0]
    with pytest.raises(ValueError):
        run_backtest(pd.Series(dtype=float), pd.Series(dtype=float))


def test_strategy_windows_are_valid() -> None:
    with pytest.raises(ValueError):
        sma_crossover(pd.Series([1, 2, 3]), 5, 5)

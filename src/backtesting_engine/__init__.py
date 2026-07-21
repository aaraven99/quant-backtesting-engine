"""Execution-aware backtesting primitives."""

from .engine import BacktestConfig, BacktestResult, run_backtest

__all__ = ["BacktestConfig", "BacktestResult", "run_backtest"]

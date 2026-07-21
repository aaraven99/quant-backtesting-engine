from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from .metrics import performance_metrics


@dataclass(frozen=True)
class BacktestConfig:
    initial_capital: float = 100_000.0
    commission: float = 0.001
    slippage: float = 0.0005
    fractional: bool = True


@dataclass
class BacktestResult:
    equity: pd.Series
    positions: pd.Series
    trades: pd.DataFrame
    metrics: dict[str, float]


def run_backtest(
    close: pd.Series, signal: pd.Series, config: BacktestConfig = BacktestConfig()
) -> BacktestResult:
    """Backtest one instrument at next-bar close; signals are shifted to prevent look-ahead."""
    prices = pd.to_numeric(close, errors="coerce").dropna().astype(float)
    if prices.empty:
        raise ValueError("price data is empty")
    aligned_signal = signal.reindex(prices.index).fillna(0.0).clip(-1.0, 1.0).shift(1).fillna(0.0)
    cash, quantity = config.initial_capital, 0.0
    values: list[float] = []
    positions: list[float] = []
    trades: list[dict[str, object]] = []
    for timestamp, price in prices.items():
        target = float(aligned_signal.loc[timestamp])
        fill_price = price * (1 + config.slippage * np.sign(target - np.sign(quantity)))
        equity_before = cash + quantity * price
        target_quantity = target * equity_before / fill_price
        if not config.fractional:
            target_quantity = float(np.trunc(target_quantity))
        delta = target_quantity - quantity
        if abs(delta) > 1e-12:
            notional = delta * fill_price
            fee = abs(notional) * config.commission
            cash -= notional + fee
            trades.append(
                {"timestamp": timestamp, "quantity": delta, "price": fill_price, "fee": fee}
            )
            quantity = target_quantity
        values.append(cash + quantity * price)
        positions.append(quantity)
    equity = pd.Series(values, index=prices.index, name="equity")
    trade_frame = pd.DataFrame(trades, columns=["timestamp", "quantity", "price", "fee"])
    return BacktestResult(
        equity,
        pd.Series(positions, index=prices.index, name="position"),
        trade_frame,
        performance_metrics(equity, trade_frame),
    )

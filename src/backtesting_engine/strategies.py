from __future__ import annotations

import pandas as pd


def sma_crossover(close: pd.Series, fast: int = 20, slow: int = 50) -> pd.Series:
    if fast >= slow:
        raise ValueError("fast window must be shorter than slow window")
    return (close.rolling(fast).mean() > close.rolling(slow).mean()).astype(float)


def rsi_mean_reversion(close: pd.Series, window: int = 14) -> pd.Series:
    changes = close.diff()
    up, down = (
        changes.clip(lower=0).rolling(window).mean(),
        -changes.clip(upper=0).rolling(window).mean(),
    )
    rsi = 100 - 100 / (1 + up.div(down.replace(0, float("nan"))))
    return (
        pd.Series(0.0, index=close.index)
        .mask(rsi < 30, 1.0)
        .mask(rsi > 70, -1.0)
        .ffill()
        .fillna(0.0)
    )

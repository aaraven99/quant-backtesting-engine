from __future__ import annotations

import pandas as pd


def sma_crossover(close: pd.Series, fast: int = 20, slow: int = 50) -> pd.Series:
    if fast >= slow:
        raise ValueError("fast window must be shorter than slow window")
    return (close.rolling(fast).mean() > close.rolling(slow).mean()).astype(float)


def rsi_mean_reversion(
    close: pd.Series,
    window: int = 14,
    entry_threshold: float = 30,
    exit_threshold: float = 70,
) -> pd.Series:
    if not 0 < entry_threshold < exit_threshold < 100:
        raise ValueError("RSI thresholds must satisfy 0 < entry < exit < 100")
    changes = close.diff()
    up, down = (
        changes.clip(lower=0).rolling(window).mean(),
        -changes.clip(upper=0).rolling(window).mean(),
    )
    rsi = 100 - 100 / (1 + up.div(down.replace(0, float("nan"))))
    return (
        pd.Series(0.0, index=close.index)
        .mask(rsi < entry_threshold, 1.0)
        .mask(rsi > exit_threshold, -1.0)
        .ffill()
        .fillna(0.0)
    )

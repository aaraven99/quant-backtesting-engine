from __future__ import annotations

import numpy as np
import pandas as pd


def drawdown(equity: pd.Series) -> pd.Series:
    return equity.div(equity.cummax()).sub(1.0)


def performance_metrics(equity: pd.Series, trades: pd.DataFrame) -> dict[str, float]:
    returns = equity.pct_change().dropna()
    if returns.empty:
        return {"total_return": 0.0, "max_drawdown": 0.0, "sharpe": 0.0, "trades": 0.0}
    years = max(len(returns) / 252, 1 / 252)
    annual_return = (equity.iloc[-1] / equity.iloc[0]) ** (1 / years) - 1
    volatility = returns.std(ddof=0) * np.sqrt(252)
    downside = returns[returns < 0].std(ddof=0) * np.sqrt(252)
    sharpe = annual_return / volatility if volatility else 0.0
    sortino = annual_return / downside if downside else 0.0
    maximum_drawdown = float(drawdown(equity).min())
    return {
        "total_return": float(equity.iloc[-1] / equity.iloc[0] - 1),
        "annualized_return": float(annual_return),
        "annualized_volatility": float(volatility),
        "sharpe": float(sharpe),
        "sortino": float(sortino),
        "max_drawdown": maximum_drawdown,
        "calmar": float(annual_return / abs(maximum_drawdown)) if maximum_drawdown else 0.0,
        "trades": float(len(trades)),
    }

# Quant Backtesting Engine

![Generated equity-curve demonstration](assets/portfolio-preview.png)

A modular Python backtester that makes execution assumptions, costs, and signal timing explicit.

## Features

- SMA crossover and RSI mean-reversion strategies
- Next-bar execution through signal shifting; configurable fractional sizing, commission, and slippage
- Equity curve, trade ledger, drawdown, annualized return, volatility, Sharpe, Sortino, and Calmar metrics
- yfinance data loader with deterministic, API-free tests

## Architecture

`strategies -> shifted signal -> execution engine -> equity/trades -> metrics`

## Install and run

```bash
python -m venv .venv
.venv/Scripts/pip install -e . pytest ruff
python -m backtesting_engine run --ticker AAPL --strategy sma-crossover --start 2020-01-01 --end 2025-01-01
```

## Quality checks

```bash
ruff check .
ruff format --check .
pytest
```

## Assumptions and limitations

Orders are sized and filled at the next available bar close. This compact research engine does not model intraday liquidity, corporate actions beyond adjusted prices, or portfolio-level margin.

## Financial disclaimer

This project is intended for educational and research purposes only. It does not provide investment advice, and its outputs should not be used as the sole basis for financial decisions. Historical performance and simulated results do not guarantee future performance.

MIT License. Author: Aarav Shah.

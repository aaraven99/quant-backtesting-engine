from __future__ import annotations

import argparse
import json

import yfinance as yf

from .engine import BacktestConfig, run_backtest
from .strategies import rsi_mean_reversion, sma_crossover


def main() -> None:
    parser = argparse.ArgumentParser(description="Execution-aware equity backtester")
    parser.add_argument("run", nargs="?")
    parser.add_argument("--ticker", default="AAPL")
    parser.add_argument(
        "--strategy", choices=["sma-crossover", "rsi-mean-reversion"], default="sma-crossover"
    )
    parser.add_argument("--start", default="2020-01-01")
    parser.add_argument("--end", default="2025-01-01")
    parser.add_argument("--initial-capital", type=float, default=100_000)
    parser.add_argument("--commission", type=float, default=0.001)
    parser.add_argument("--slippage", type=float, default=0.0005)
    args = parser.parse_args()
    frame = yf.download(
        args.ticker, start=args.start, end=args.end, auto_adjust=True, progress=False
    )
    close = frame["Close"].squeeze()
    if close.empty:
        raise SystemExit("No price data returned. Check ticker and date range.")
    signal = sma_crossover(close) if args.strategy == "sma-crossover" else rsi_mean_reversion(close)
    result = run_backtest(
        close, signal, BacktestConfig(args.initial_capital, args.commission, args.slippage)
    )
    print(json.dumps(result.metrics, indent=2))


if __name__ == "__main__":
    main()

from __future__ import annotations

import io
import math
import sys
import time
import uuid
from collections import defaultdict, deque
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Literal

import numpy as np
import pandas as pd
import yfinance as yf
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, model_validator

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from backtesting_engine.engine import BacktestConfig, run_backtest
from backtesting_engine.metrics import drawdown

MAX_YEARS = 15
MAX_REQUEST_BYTES = 2 * 1024 * 1024
MAX_REQUESTS_PER_MINUTE = 30
_requests: dict[str, deque[float]] = defaultdict(deque)


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class BacktestRequest(StrictModel):
    ticker: str = Field(default="AAPL", min_length=1, max_length=12, pattern=r"^[A-Za-z0-9.\-]+$")
    dataset: Literal["daily", "weekly"] = "daily"
    start_date: date = date(2020, 1, 1)
    end_date: date = date(2025, 1, 1)
    strategy: Literal[
        "sma-crossover",
        "ema-crossover",
        "rsi-mean-reversion",
        "macd",
        "bollinger-mean-reversion",
        "donchian-breakout",
        "price-momentum",
        "dual-momentum",
        "zscore-mean-reversion",
        "volatility-filtered-trend",
        "buy-and-hold",
    ] = "sma-crossover"
    initial_capital: float = Field(default=100_000, gt=0, le=100_000_000)
    commission: float = Field(default=0.001, ge=0, le=0.05)
    slippage: float = Field(default=0.0005, ge=0, le=0.05)
    benchmark: Literal["buy-and-hold", "cash"] = "buy-and-hold"
    fractional: bool = True
    fast_window: int = Field(default=20, ge=2, le=250)
    slow_window: int = Field(default=50, ge=3, le=500)
    rsi_period: int = Field(default=14, ge=2, le=100)
    rsi_entry: float = Field(default=30, ge=1, le=49)
    rsi_exit: float = Field(default=70, ge=51, le=99)
    position_size: float = Field(default=1, gt=0, le=1)
    maximum_exposure: float = Field(default=1, gt=0, le=1)

    @model_validator(mode="after")
    def validate_configuration(self) -> BacktestRequest:
        if self.end_date <= self.start_date:
            raise ValueError("End date must be after start date.")
        if self.end_date - self.start_date > timedelta(days=366 * MAX_YEARS):
            raise ValueError(f"Public demos are limited to {MAX_YEARS} years.")
        if self.strategy in {
            "sma-crossover",
            "ema-crossover",
            "macd",
            "dual-momentum",
            "volatility-filtered-trend",
        } and self.fast_window >= self.slow_window:
            raise ValueError("Fast window must be shorter than slow window.")
        if self.rsi_entry >= self.rsi_exit:
            raise ValueError("RSI entry must be below RSI exit.")
        return self


app = FastAPI(title="Quant Backtesting Lab API", version="1.0.0")


def _finite(value: object) -> object:
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating, float)):
        number = float(value)
        return number if math.isfinite(number) else None
    if isinstance(value, np.ndarray):
        return [_finite(item) for item in value.tolist()]
    if isinstance(value, (pd.Timestamp, datetime, date)):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(key): _finite(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_finite(item) for item in value]
    return value


def _success(data: object, request_id: str, started: float, warnings: list[str] | None = None):
    return {
        "success": True,
        "data": _finite(data),
        "meta": {
            "requestId": request_id,
            "dataMode": "historical-market",
            "calculationTimeMs": round((time.perf_counter() - started) * 1000, 2),
        },
        "warnings": warnings or [],
    }


def _market_prices(ticker: str, start: date, end: date, interval: str) -> pd.Series:
    frame = yf.download(
        ticker,
        start=start.isoformat(),
        end=end.isoformat(),
        interval="1d" if interval == "daily" else "1wk",
        auto_adjust=True,
        progress=False,
        threads=False,
        timeout=15,
    )
    if frame.empty or "Close" not in frame:
        raise ValueError(f"No historical market data was returned for {ticker}.")
    close = frame["Close"]
    if isinstance(close, pd.DataFrame):
        close = close.iloc[:, 0]
    prices = pd.to_numeric(close, errors="coerce").dropna()
    prices.index = pd.to_datetime(prices.index).tz_localize(None)
    prices.name = "close"
    if len(prices) < 80:
        raise ValueError("The selected ticker and date range must provide at least 80 observations.")
    return prices


def _rsi(prices: pd.Series, period: int) -> pd.Series:
    change = prices.diff()
    gains = change.clip(lower=0).rolling(period).mean()
    losses = -change.clip(upper=0).rolling(period).mean()
    return 100 - 100 / (1 + gains / losses.replace(0, np.nan))


def _strategy_signal(prices: pd.Series, payload: BacktestRequest) -> pd.Series:
    fast = payload.fast_window
    slow = payload.slow_window
    strategy = payload.strategy
    if strategy == "buy-and-hold":
        signal = pd.Series(1.0, index=prices.index)
    elif strategy == "sma-crossover":
        signal = (prices.rolling(fast).mean() > prices.rolling(slow).mean()).astype(float)
    elif strategy == "ema-crossover":
        signal = (prices.ewm(span=fast).mean() > prices.ewm(span=slow).mean()).astype(float)
    elif strategy == "rsi-mean-reversion":
        oscillator = _rsi(prices, payload.rsi_period)
        state = pd.Series(np.nan, index=prices.index)
        state[oscillator <= payload.rsi_entry] = 1
        state[oscillator >= payload.rsi_exit] = 0
        signal = state.ffill().fillna(0)
    elif strategy == "macd":
        macd = prices.ewm(span=fast).mean() - prices.ewm(span=slow).mean()
        signal = (macd > macd.ewm(span=9).mean()).astype(float)
    elif strategy == "bollinger-mean-reversion":
        mean = prices.rolling(slow).mean()
        band = prices.rolling(slow).std() * 2
        state = pd.Series(np.nan, index=prices.index)
        state[prices < mean - band] = 1
        state[prices >= mean] = 0
        signal = state.ffill().fillna(0)
    elif strategy == "donchian-breakout":
        upper = prices.shift(1).rolling(slow).max()
        lower = prices.shift(1).rolling(fast).min()
        state = pd.Series(np.nan, index=prices.index)
        state[prices > upper] = 1
        state[prices < lower] = 0
        signal = state.ffill().fillna(0)
    elif strategy == "price-momentum":
        signal = (prices.pct_change(slow) > 0).astype(float)
    elif strategy == "dual-momentum":
        signal = ((prices.pct_change(fast) > 0) & (prices.pct_change(slow) > 0)).astype(float)
    elif strategy == "zscore-mean-reversion":
        mean = prices.rolling(slow).mean()
        zscore = (prices - mean) / prices.rolling(slow).std()
        state = pd.Series(np.nan, index=prices.index)
        state[zscore < -1.5] = 1
        state[zscore > 0] = 0
        signal = state.ffill().fillna(0)
    else:
        trend = prices.rolling(fast).mean() > prices.rolling(slow).mean()
        realized = prices.pct_change().rolling(fast).std() * np.sqrt(252)
        cap = realized.rolling(slow).median()
        signal = (trend & (realized <= cap)).astype(float)
    return signal.fillna(0)


def _round_trips(events: pd.DataFrame) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    if events.empty:
        return rows
    open_event: pd.Series | None = None
    for _, event in events.iterrows():
        quantity = float(event["quantity"])
        if open_event is None:
            open_event = event
            continue
        previous_quantity = float(open_event["quantity"])
        if np.sign(quantity) == np.sign(previous_quantity):
            continue
        entry_price = float(open_event["price"])
        exit_price = float(event["price"])
        direction = "Long" if previous_quantity > 0 else "Short"
        matched = min(abs(previous_quantity), abs(quantity))
        gross = (exit_price - entry_price) * matched * (1 if direction == "Long" else -1)
        commission = float(open_event["fee"]) + float(event["fee"])
        entry_time = pd.Timestamp(open_event["timestamp"])
        exit_time = pd.Timestamp(event["timestamp"])
        rows.append(
            {
                "id": len(rows) + 1,
                "entryDate": entry_time.date().isoformat(),
                "exitDate": exit_time.date().isoformat(),
                "direction": direction,
                "entryPrice": entry_price,
                "exitPrice": exit_price,
                "quantity": matched,
                "grossPnl": gross,
                "commission": commission,
                "slippage": abs(exit_price - entry_price) * 0.0005 * matched,
                "netPnl": gross - commission,
                "return": (exit_price / entry_price - 1) * (1 if direction == "Long" else -1),
                "holdingPeriod": int((exit_time - entry_time).days),
                "exitReason": "Strategy signal",
            }
        )
        open_event = event if abs(quantity) > abs(previous_quantity) else None
    return rows


def _run(payload: BacktestRequest) -> tuple[dict[str, object], list[str]]:
    prices = _market_prices(payload.ticker, payload.start_date, payload.end_date, payload.dataset)
    signal = _strategy_signal(prices, payload)
    signal = signal * min(payload.position_size, payload.maximum_exposure)
    result = run_backtest(
        prices,
        signal,
        BacktestConfig(
            payload.initial_capital,
            payload.commission,
            payload.slippage,
            payload.fractional,
        ),
    )
    benchmark = (
        payload.initial_capital * prices / prices.iloc[0]
        if payload.benchmark == "buy-and-hold"
        else pd.Series(payload.initial_capital, index=prices.index)
    )
    returns = result.equity.pct_change().fillna(0)
    rolling_sharpe = returns.rolling(63).mean().div(returns.rolling(63).std()).mul(np.sqrt(252))
    rolling_volatility = returns.rolling(21).std().mul(np.sqrt(252))
    before_cost = run_backtest(
        prices,
        signal,
        BacktestConfig(payload.initial_capital, 0, 0, payload.fractional),
    )
    trades = _round_trips(result.trades)
    winning = [trade for trade in trades if float(trade["netPnl"]) > 0]
    losing = [trade for trade in trades if float(trade["netPnl"]) < 0]
    gross_profit = sum(float(trade["netPnl"]) for trade in winning)
    gross_loss = abs(sum(float(trade["netPnl"]) for trade in losing))
    metrics = dict(result.metrics)
    metrics.update(
        {
            "win_rate": len(winning) / len(trades) if trades else 0,
            "profit_factor": gross_profit / gross_loss if gross_loss else 0,
            "average_trade_return": float(np.mean([trade["return"] for trade in trades]))
            if trades
            else 0,
            "average_holding_period": float(np.mean([trade["holdingPeriod"] for trade in trades]))
            if trades
            else 0,
            "exposure": float((result.positions.abs() > 1e-10).mean()),
            "benchmark_return": float(benchmark.iloc[-1] / benchmark.iloc[0] - 1),
            "total_commissions": float(result.trades["fee"].sum())
            if not result.trades.empty
            else 0,
            "estimated_slippage": float(
                payload.slippage * result.trades["price"].mul(result.trades["quantity"].abs()).sum()
            )
            if not result.trades.empty
            else 0,
            "net_performance_after_costs": float(
                result.equity.iloc[-1] / payload.initial_capital - 1
            ),
            "before_cost_return": float(before_cost.equity.iloc[-1] / payload.initial_capital - 1),
        }
    )
    monthly = returns.groupby([returns.index.year, returns.index.month]).apply(
        lambda values: (1 + values).prod() - 1
    )
    series = [
        {
            "date": timestamp.date().isoformat(),
            "price": prices.loc[timestamp],
            "equity": result.equity.loc[timestamp],
            "benchmark": benchmark.loc[timestamp],
            "drawdown": drawdown(result.equity).loc[timestamp],
            "rollingSharpe": rolling_sharpe.loc[timestamp],
            "rollingVolatility": rolling_volatility.loc[timestamp],
        }
        for timestamp in prices.index
    ]
    return (
        {
            "configuration": payload.model_dump(mode="json"),
            "metrics": metrics,
            "series": series,
            "trades": trades,
            "monthlyReturns": [
                {"year": int(year), "month": int(month), "return": value}
                for (year, month), value in monthly.items()
            ],
            "distribution": [
                {"bin": float(point), "count": int(count)}
                for count, point in zip(*np.histogram(returns, bins=18))
            ],
            "costImpact": [
                {"name": "Before costs", "return": metrics["before_cost_return"]},
                {"name": "After costs", "return": metrics["net_performance_after_costs"]},
            ],
        },
        [
            (
                "Results use adjusted historical market closes from yfinance. "
                "Historical performance does not predict future returns."
            )
        ],
    )


@app.middleware("http")
async def rate_limit(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length and content_length.isdigit() and int(content_length) > MAX_REQUEST_BYTES:
        return JSONResponse(
            status_code=413,
            content={
                "success": False,
                "error": {
                    "code": "PAYLOAD_TOO_LARGE",
                    "message": "Public requests are limited to 2 MB.",
                    "requestId": str(uuid.uuid4()),
                },
            },
        )
    if request.url.path.startswith("/api/backtest/") and request.method == "POST":
        key = request.client.host if request.client else "unknown"
        now = time.time()
        bucket = _requests[key]
        while bucket and bucket[0] < now - 60:
            bucket.popleft()
        if len(bucket) >= MAX_REQUESTS_PER_MINUTE:
            request_id = str(uuid.uuid4())
            return JSONResponse(
                status_code=429,
                content={
                    "success": False,
                    "error": {
                        "code": "RATE_LIMITED",
                        "message": "Please wait a minute before running another calculation.",
                        "requestId": request_id,
                    },
                },
            )
        bucket.append(now)
    return await call_next(request)


@app.exception_handler(RequestValidationError)
async def handle_validation_error(_: Request, exc: RequestValidationError):
    first_error = exc.errors()[0] if exc.errors() else {}
    location = ".".join(str(part) for part in first_error.get("loc", [])[1:])
    message = str(first_error.get("msg", "The request is invalid."))
    if location:
        message = f"{location}: {message}"
    return JSONResponse(
        status_code=422,
        content={
            "success": False,
            "error": {
                "code": "INVALID_INPUT",
                "message": message,
                "requestId": str(uuid.uuid4()),
            },
        },
    )


@app.exception_handler(ValueError)
async def handle_value_error(_: Request, exc: ValueError):
    return JSONResponse(
        status_code=422,
        content={
            "success": False,
            "error": {
                "code": "INVALID_INPUT",
                "message": str(exc),
                "requestId": str(uuid.uuid4()),
            },
        },
    )


@app.exception_handler(Exception)
async def handle_error(_: Request, __: Exception):
    request_id = str(uuid.uuid4())
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": {
                "code": "INTERNAL_ERROR",
                "message": "The calculation could not be completed.",
                "requestId": request_id,
            },
        },
    )


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "1.1.0", "dataMode": "historical-market"}


@app.get("/api/backtest/presets")
def presets():
    return {
        "success": True,
        "data": {
            "intervals": [
                {"id": "daily", "label": "Daily adjusted closes"},
                {"id": "weekly", "label": "Weekly adjusted closes"},
            ],
            "strategies": [
                {"id": "sma-crossover", "label": "SMA crossover"},
                {"id": "ema-crossover", "label": "EMA crossover"},
                {"id": "rsi-mean-reversion", "label": "RSI mean reversion"},
                {"id": "macd", "label": "MACD signal line"},
                {"id": "bollinger-mean-reversion", "label": "Bollinger mean reversion"},
                {"id": "donchian-breakout", "label": "Donchian breakout"},
                {"id": "price-momentum", "label": "Price momentum"},
                {"id": "dual-momentum", "label": "Dual momentum"},
                {"id": "zscore-mean-reversion", "label": "Z-score mean reversion"},
                {"id": "volatility-filtered-trend", "label": "Volatility-filtered trend"},
                {"id": "buy-and-hold", "label": "Buy and hold"},
            ],
        },
    }


@app.post("/api/backtest/run")
def run(payload: BacktestRequest):
    started = time.perf_counter()
    request_id = str(uuid.uuid4())
    data, warnings = _run(payload)
    return _success(data, request_id, started, warnings)


@app.post("/api/backtest/compare")
def compare(payloads: list[BacktestRequest]):
    if len(payloads) != 2:
        raise ValueError("Comparison requires exactly two configurations.")
    started = time.perf_counter()
    request_id = str(uuid.uuid4())
    results = [_run(payload)[0] for payload in payloads]
    return _success(results, request_id, started)


@app.post("/api/backtest/upload")
async def validate_upload(request: Request):
    started = time.perf_counter()
    request_id = str(uuid.uuid4())
    body = await request.body()
    if not body:
        raise ValueError("The CSV file is empty.")
    if len(body) > MAX_REQUEST_BYTES:
        return JSONResponse(
            status_code=413,
            content={
                "success": False,
                "error": {
                    "code": "PAYLOAD_TOO_LARGE",
                    "message": "CSV uploads are limited to 2 MB.",
                    "requestId": request_id,
                },
            },
        )
    try:
        frame = pd.read_csv(io.BytesIO(body))
    except (UnicodeDecodeError, pd.errors.ParserError) as exc:
        raise ValueError("The upload is not a readable UTF-8 CSV file.") from exc

    required = ["date", "open", "high", "low", "close", "volume"]
    missing = [column for column in required if column not in frame.columns]
    if missing:
        raise ValueError(f"Missing required columns: {', '.join(missing)}.")
    if frame.empty:
        raise ValueError("The CSV must contain at least one data row.")
    if len(frame) > 10_000:
        raise ValueError("CSV uploads are limited to 10,000 rows.")

    parsed_dates = pd.to_datetime(frame["date"], errors="coerce")
    if parsed_dates.isna().any():
        raise ValueError("Every date must use a valid, parseable format.")
    if parsed_dates.duplicated().any():
        raise ValueError("Duplicate dates are not allowed.")
    if not parsed_dates.is_monotonic_increasing:
        raise ValueError("Rows must be sorted by date in ascending order.")

    prices = frame[["open", "high", "low", "close"]].apply(pd.to_numeric, errors="coerce")
    if prices["close"].isna().any():
        raise ValueError("Close prices cannot be missing or non-numeric.")
    if prices.isna().any().any() or (prices <= 0).any().any():
        raise ValueError("OHLC prices must be finite positive numbers.")
    volume = pd.to_numeric(frame["volume"], errors="coerce")
    if volume.isna().any() or (volume < 0).any():
        raise ValueError("Volume must contain non-negative numbers.")

    return _success(
        {
            "rows": len(frame),
            "startDate": parsed_dates.iloc[0].date().isoformat(),
            "endDate": parsed_dates.iloc[-1].date().isoformat(),
            "minimumClose": float(prices["close"].min()),
            "maximumClose": float(prices["close"].max()),
            "columns": required,
        },
        request_id,
        started,
        ["The file was validated in memory and was not stored."],
    )

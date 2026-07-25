export type BacktestFormValues = {
  ticker: string;
  dataset: "daily" | "weekly";
  start_date: string;
  end_date: string;
  strategy:
    | "sma-crossover"
    | "ema-crossover"
    | "rsi-mean-reversion"
    | "macd"
    | "bollinger-mean-reversion"
    | "donchian-breakout"
    | "price-momentum"
    | "dual-momentum"
    | "zscore-mean-reversion"
    | "volatility-filtered-trend"
    | "buy-and-hold";
  initial_capital: number;
  commission: number;
  slippage: number;
  benchmark: "buy-and-hold" | "cash";
  fractional: boolean;
  fast_window: number;
  slow_window: number;
  rsi_period: number;
  rsi_entry: number;
  rsi_exit: number;
  position_size: number;
  maximum_exposure: number;
};

export type Trade = {
  id: number;
  entryDate: string;
  exitDate: string;
  direction: string;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  grossPnl: number;
  commission: number;
  slippage: number;
  netPnl: number;
  return: number;
  holdingPeriod: number;
  exitReason: string;
};

export type BacktestResult = {
  configuration: BacktestFormValues;
  metrics: Record<string, number>;
  series: Array<{
    date: string;
    price: number;
    equity: number;
    benchmark: number;
    drawdown: number;
    rollingSharpe: number | null;
    rollingVolatility: number | null;
  }>;
  trades: Trade[];
  monthlyReturns: Array<{ year: number; month: number; return: number }>;
  distribution: Array<{ bin: number; count: number }>;
  costImpact: Array<{ name: string; return: number }>;
};

export type ApiEnvelope = {
  success: boolean;
  data?: BacktestResult;
  meta?: { requestId: string; dataMode: string; calculationTimeMs: number };
  warnings?: string[];
  error?: { code: string; message: string; requestId: string };
};

export const defaultConfiguration: BacktestFormValues = {
  ticker: "AAPL",
  dataset: "daily",
  start_date: "2020-01-01",
  end_date: "2025-01-01",
  strategy: "sma-crossover",
  initial_capital: 100_000,
  commission: 0.001,
  slippage: 0.0005,
  benchmark: "buy-and-hold",
  fractional: true,
  fast_window: 20,
  slow_window: 50,
  rsi_period: 14,
  rsi_entry: 30,
  rsi_exit: 70,
  position_size: 1,
  maximum_exposure: 1,
};

function safeCell(value: unknown): string {
  const text = String(value ?? "");
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

export function tradesToCsv(trades: Trade[]): string {
  const headers = [
    "Entry date",
    "Exit date",
    "Direction",
    "Entry price",
    "Exit price",
    "Quantity",
    "Gross P&L",
    "Commission",
    "Slippage",
    "Net P&L",
    "Return",
    "Holding period",
    "Exit reason",
  ];
  const rows = trades.map((trade) => [
    trade.entryDate,
    trade.exitDate,
    trade.direction,
    trade.entryPrice,
    trade.exitPrice,
    trade.quantity,
    trade.grossPnl,
    trade.commission,
    trade.slippage,
    trade.netPnl,
    trade.return,
    trade.holdingPeriod,
    trade.exitReason,
  ]);
  return [headers, ...rows]
    .map((row) => row.map((cell) => `"${safeCell(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
}

export function downloadText(filename: string, contents: string, type: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowDownToLine,
  BookOpen,
  FileCheck2,
  LoaderCircle,
  Play,
  RotateCcw,
  SlidersHorizontal,
  TriangleAlert,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { z } from "zod";

import { MetricCard } from "@/components/metric-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  type ApiEnvelope,
  type BacktestFormValues,
  type BacktestResult,
  defaultConfiguration,
  downloadText,
  type Trade,
  tradesToCsv,
} from "@/lib/backtest";

const schema = z
  .object({
    ticker: z.string().trim().min(1).max(12).regex(/^[A-Za-z0-9.\-]+$/),
    dataset: z.enum(["daily", "weekly"]),
    start_date: z.string().min(1),
    end_date: z.string().min(1),
    strategy: z.enum([
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
    ]),
    initial_capital: z.number().positive().max(100_000_000),
    commission: z.number().min(0).max(0.05),
    slippage: z.number().min(0).max(0.05),
    benchmark: z.enum(["buy-and-hold", "cash"]),
    fractional: z.boolean(),
    fast_window: z.number().int().min(2).max(250),
    slow_window: z.number().int().min(3).max(500),
    rsi_period: z.number().int().min(2).max(100),
    rsi_entry: z.number().min(1).max(49),
    rsi_exit: z.number().min(51).max(99),
    position_size: z.number().positive().max(1),
    maximum_exposure: z.number().positive().max(1),
  })
  .refine((value) => value.fast_window < value.slow_window, {
    message: "Fast window must be shorter than slow window.",
    path: ["fast_window"],
  })
  .refine((value) => new Date(value.end_date) > new Date(value.start_date), {
    message: "End date must be after start date.",
    path: ["end_date"],
  });

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const compactCurrency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});
const percent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 2 });

function metricTip(label: string, description: string) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help border-b border-dotted border-muted-foreground/60">{label}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{description}</TooltipContent>
    </Tooltip>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-xs text-destructive">{message}</p> : null;
}

function ChartShell({ title, summary, children }: { title: string; summary: string; children: React.ReactNode }) {
  return (
    <Card className="chart-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{summary}</CardDescription>
      </CardHeader>
      <CardContent className="h-72 px-2 pb-3 sm:px-5">{children}</CardContent>
    </Card>
  );
}

const columns: ColumnDef<Trade>[] = [
  { accessorKey: "entryDate", header: "Entry" },
  { accessorKey: "exitDate", header: "Exit" },
  { accessorKey: "direction", header: "Side" },
  {
    accessorKey: "entryPrice",
    header: "Entry price",
    cell: ({ getValue }) => currency.format(getValue<number>()),
  },
  {
    accessorKey: "exitPrice",
    header: "Exit price",
    cell: ({ getValue }) => currency.format(getValue<number>()),
  },
  {
    accessorKey: "quantity",
    header: "Quantity",
    cell: ({ getValue }) => getValue<number>().toFixed(2),
  },
  {
    accessorKey: "netPnl",
    header: "Net P&L",
    cell: ({ getValue }) => {
      const value = getValue<number>();
      return <span className={value >= 0 ? "gain" : "loss"}>{currency.format(value)}</span>;
    },
  },
  {
    accessorKey: "return",
    header: "Return",
    cell: ({ getValue }) => percent.format(getValue<number>()),
  },
  { accessorKey: "holdingPeriod", header: "Days" },
  { accessorKey: "exitReason", header: "Exit reason" },
];

function TradeTable({ trades }: { trades: Trade[] }) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [filter, setFilter] = useState("");
  // TanStack Table intentionally exposes mutable callback accessors.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: trades,
    columns,
    state: { sorting, globalFilter: filter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 8 } },
  });

  return (
    <Card>
      <CardHeader className="gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <CardTitle>Trade ledger</CardTitle>
          <CardDescription>Paired entries and exits, net of modeled execution costs.</CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            aria-label="Filter trades"
            className="w-40"
            placeholder="Filter trades…"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
          <Button
            variant="outline"
            onClick={() => downloadText("backtest-trades.csv", tradesToCsv(trades), "text/csv")}
          >
            <ArrowDownToLine aria-hidden="true" /> CSV
          </Button>
          <Button
            variant="outline"
            onClick={() => downloadText("backtest-trades.json", JSON.stringify(trades, null, 2), "application/json")}
          >
            <ArrowDownToLine aria-hidden="true" /> JSON
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((group) => (
                <TableRow key={group.id}>
                  {group.headers.map((header) => (
                    <TableHead key={header.id}>
                      <button
                        className="whitespace-nowrap text-left"
                        onClick={header.column.getToggleSortingHandler()}
                        type="button"
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() === "asc" ? " ↑" : header.column.getIsSorted() === "desc" ? " ↓" : ""}
                      </button>
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell className="whitespace-nowrap font-mono text-xs" key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell className="h-24 text-center text-muted-foreground" colSpan={columns.length}>
                    No trades matched this filter.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {table.getState().pagination.pageIndex + 1} of {Math.max(table.getPageCount(), 1)}
          </span>
          <div className="flex gap-2">
            <Button disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()} size="sm" variant="outline">
              Previous
            </Button>
            <Button disabled={!table.getCanNextPage()} onClick={() => table.nextPage()} size="sm" variant="outline">
              Next
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Results({ result, runtime }: { result: BacktestResult; runtime?: number }) {
  const sampled = useMemo(
    () => result.series.filter((_, index) => index % Math.max(1, Math.floor(result.series.length / 320)) === 0),
    [result.series],
  );
  const metrics = result.metrics;
  return (
    <div aria-live="polite" className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        <MetricCard label="Total return" value={percent.format(metrics.total_return)} detail="After costs" />
        <MetricCard label="Sharpe ratio" value={metrics.sharpe.toFixed(2)} detail="Annualized" />
        <MetricCard label="Max drawdown" value={percent.format(metrics.max_drawdown)} detail="Peak to trough" />
        <MetricCard label="Win rate" value={percent.format(metrics.win_rate)} detail={`${result.trades.length} round trips`} />
        <MetricCard label="Ending equity" value={compactCurrency.format(result.series.at(-1)?.equity ?? 0)} detail="Net portfolio value" />
        <MetricCard label="Calculation" value={`${runtime?.toFixed(0) ?? "—"} ms`} detail="Server runtime" />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <ChartShell title="Equity versus benchmark" summary="Strategy and buy-and-hold growth on the same capital base.">
          <ResponsiveContainer height="100%" width="100%">
            <LineChart data={sampled} margin={{ left: 8, right: 8, top: 12 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" minTickGap={48} tickFormatter={(value) => String(value).slice(0, 7)} />
              <YAxis tickFormatter={(value) => compactCurrency.format(Number(value))} width={68} />
              <ChartTooltip formatter={(value) => currency.format(Number(value))} />
              <Legend />
              <Line dataKey="equity" dot={false} name="Strategy" stroke="var(--terminal-green)" strokeWidth={2} />
              <Line dataKey="benchmark" dot={false} name="Benchmark" stroke="var(--terminal-blue)" strokeWidth={1.5} />
            </LineChart>
          </ResponsiveContainer>
        </ChartShell>
        <ChartShell title="Underwater drawdown" summary="Percentage decline from each previous strategy equity peak.">
          <ResponsiveContainer height="100%" width="100%">
            <AreaChart data={sampled} margin={{ left: 8, right: 8, top: 12 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" minTickGap={48} tickFormatter={(value) => String(value).slice(0, 7)} />
              <YAxis tickFormatter={(value) => percent.format(Number(value))} width={58} />
              <ChartTooltip formatter={(value) => percent.format(Number(value))} />
              <ReferenceLine stroke="var(--border)" y={0} />
              <Area dataKey="drawdown" fill="var(--terminal-red-muted)" name="Drawdown" stroke="var(--terminal-red)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartShell>
        <ChartShell title="Asset price" summary="Adjusted historical market close used by the selected strategy.">
          <ResponsiveContainer height="100%" width="100%">
            <LineChart data={sampled} margin={{ left: 8, right: 8, top: 12 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" minTickGap={48} tickFormatter={(value) => String(value).slice(0, 7)} />
              <YAxis domain={["auto", "auto"]} tickFormatter={(value) => `$${Number(value).toFixed(0)}`} width={48} />
              <ChartTooltip formatter={(value) => currency.format(Number(value))} />
              <Line dataKey="price" dot={false} name="Close" stroke="var(--terminal-amber)" strokeWidth={1.8} />
            </LineChart>
          </ResponsiveContainer>
        </ChartShell>
        <ChartShell title="Rolling risk" summary="63-day Sharpe ratio and 21-day annualized volatility.">
          <ResponsiveContainer height="100%" width="100%">
            <LineChart data={sampled} margin={{ left: 8, right: 8, top: 12 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" minTickGap={48} tickFormatter={(value) => String(value).slice(0, 7)} />
              <YAxis width={42} />
              <ChartTooltip />
              <Legend />
              <Line dataKey="rollingSharpe" dot={false} name="Rolling Sharpe" stroke="var(--terminal-blue)" />
              <Line dataKey="rollingVolatility" dot={false} name="Rolling volatility" stroke="var(--terminal-amber)" />
            </LineChart>
          </ResponsiveContainer>
        </ChartShell>
        <ChartShell title="Daily return distribution" summary="Frequency of realized daily strategy returns.">
          <ResponsiveContainer height="100%" width="100%">
            <BarChart data={result.distribution} margin={{ left: 8, right: 8, top: 12 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="bin" minTickGap={28} tickFormatter={(value) => percent.format(Number(value))} />
              <YAxis width={40} />
              <ChartTooltip />
              <Bar dataKey="count" fill="var(--terminal-blue)" name="Observations" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartShell>
        <ChartShell title="Execution-cost impact" summary="A direct comparison of gross and net strategy performance.">
          <ResponsiveContainer height="100%" width="100%">
            <BarChart data={result.costImpact} layout="vertical" margin={{ left: 22, right: 22, top: 12 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis tickFormatter={(value) => percent.format(Number(value))} type="number" />
              <YAxis dataKey="name" type="category" width={92} />
              <ChartTooltip formatter={(value) => percent.format(Number(value))} />
              <Bar dataKey="return" fill="var(--terminal-green)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartShell>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Monthly return heatmap</CardTitle>
          <CardDescription>Recent monthly performance; hue and sign both communicate direction.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-12">
            {result.monthlyReturns.slice(-24).map((item) => (
              <div className={item.return >= 0 ? "heat-cell positive" : "heat-cell negative"} key={`${item.year}-${item.month}`}>
                <span>{new Date(item.year, item.month - 1).toLocaleString("en-US", { month: "short" })}</span>
                <strong>{percent.format(item.return)}</strong>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <TradeTable trades={result.trades} />
    </div>
  );
}

export function BacktestLab() {
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [runtime, setRuntime] = useState<number>();
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const form = useForm<BacktestFormValues>({ resolver: zodResolver(schema), defaultValues: defaultConfiguration });
  // React Hook Form watch is the library-supported subscription API.
  // eslint-disable-next-line react-hooks/incompatible-library
  const strategy = form.watch("strategy");

  async function run(values: BacktestFormValues) {
    setIsCalculating(true);
    setError(null);
    try {
      const response = await fetch("/api/backtest/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const payload = (await response.json()) as ApiEnvelope;
      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error?.message ?? "The backtest service returned an unexpected response.");
      }
      setResult(payload.data);
      setWarnings(payload.warnings ?? []);
      setRuntime(payload.meta?.calculationTimeMs);
      const params = new URLSearchParams({ dataset: values.dataset, strategy: values.strategy });
      window.history.replaceState(null, "", `?${params.toString()}`);
    } catch (caught) {
      setError({
        code: caught instanceof TypeError ? "OFFLINE" : "CALCULATION_FAILED",
        message: caught instanceof Error ? caught.message : "The calculation could not be completed.",
      });
    } finally {
      setIsCalculating(false);
    }
  }

  function loadDemo() {
    void run(defaultConfiguration);
    form.reset(defaultConfiguration);
  }

  async function validateCsv(file: File | undefined) {
    setUploadStatus(null);
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError({ code: "INVALID_UPLOAD", message: "CSV uploads are limited to 2 MB." });
      return;
    }
    setIsUploading(true);
    setError(null);
    try {
      const response = await fetch("/api/backtest/upload", {
        method: "POST",
        headers: { "Content-Type": "text/csv; charset=utf-8" },
        body: file,
      });
      const payload = (await response.json()) as {
        success: boolean;
        data?: { rows: number; startDate: string; endDate: string };
        error?: { message: string };
      };
      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error?.message ?? "The CSV could not be validated.");
      }
      setUploadStatus(
        `${file.name}: ${payload.data.rows.toLocaleString()} rows validated (${payload.data.startDate} to ${payload.data.endDate}).`,
      );
    } catch (caught) {
      setError({
        code: "INVALID_UPLOAD",
        message: caught instanceof Error ? caught.message : "The CSV could not be validated.",
      });
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <TooltipProvider>
      <div className="min-h-screen">
        <header className="border-b border-border/70 bg-background/90 backdrop-blur">
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <div className="brand-mark" aria-hidden="true">Q</div>
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Aarav Shah / Quant Research</p>
                <p className="font-semibold">Quant Backtesting Lab</p>
              </div>
            </div>
            <nav aria-label="Project links" className="flex flex-wrap items-center gap-2">
              <Badge className="status-badge" variant="outline">Historical Market Data</Badge>
              <Badge variant="secondary">Research use</Badge>
              <Button asChild size="sm" variant="ghost">
                <a href="https://github.com/aaraven99/quant-backtesting-engine" rel="noreferrer" target="_blank">GitHub</a>
              </Button>
              <Button asChild size="sm" variant="outline">
                <a href="https://aaravshahportfolio.vercel.app" rel="noreferrer" target="_blank">Portfolio</a>
              </Button>
            </nav>
          </div>
        </header>

        <main className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
          <section className="hero-grid mb-8">
            <div>
              <Badge className="mb-5" variant="outline">Execution-aware research sandbox</Badge>
              <h1 className="max-w-4xl text-balance text-4xl font-semibold tracking-[-0.04em] sm:text-5xl lg:text-6xl">
                Test a strategy. See every assumption.
              </h1>
              <p className="mt-5 max-w-2xl text-balance text-base leading-7 text-muted-foreground sm:text-lg">
                Select a real ticker and historical interval, model commissions and slippage, then inspect net returns, drawdowns, rolling risk, and every completed trade.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Button onClick={loadDemo} size="lg"><Play aria-hidden="true" /> Run guided demo</Button>
                <Button asChild size="lg" variant="outline"><a href="#methodology"><BookOpen aria-hidden="true" /> Read methodology</a></Button>
              </div>
            </div>
            <div className="hero-tape" aria-label="Historical strategy context">
              <div><span>Execution</span><strong>Next-bar close</strong></div>
              <div><span>Signal policy</span><strong>Shifted 1 bar</strong></div>
              <div><span>Universe</span><strong>User-selected ticker</strong></div>
              <div><span>Public limit</span><strong>15 years</strong></div>
            </div>
          </section>

          <div className="dashboard-grid">
            <aside>
              <Card className="sticky top-4">
                <CardHeader>
                  <div className="flex items-center gap-2"><SlidersHorizontal aria-hidden="true" className="size-4 text-primary" /><CardTitle>Configuration</CardTitle></div>
                  <CardDescription>Signals execute on the following bar to avoid look-ahead bias.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form className="space-y-5" onSubmit={form.handleSubmit(run)}>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="ticker">Ticker label</Label>
                        <Input id="ticker" {...form.register("ticker")} />
                        <FieldError message={form.formState.errors.ticker?.message} />
                      </div>
                      <div className="space-y-2">
                        <Label>Market interval</Label>
                        <Controller control={form.control} name="dataset" render={({ field }) => (
                          <Select onValueChange={field.onChange} value={field.value}>
                            <SelectTrigger aria-label="Market interval"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="daily">Daily adjusted closes</SelectItem>
                              <SelectItem value="weekly">Weekly adjusted closes</SelectItem>
                            </SelectContent>
                          </Select>
                        )} />
                      </div>
                    </div>
                    <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
                      <Label htmlFor="csv_upload">Validate OHLCV CSV</Label>
                      <Input
                        accept=".csv,text/csv"
                        disabled={isUploading}
                        id="csv_upload"
                        onChange={(event) => void validateCsv(event.target.files?.[0])}
                        type="file"
                      />
                      <p className="text-xs leading-5 text-muted-foreground">
                        Optional validation for date, open, high, low, close, and volume. Files are limited to 2 MB and are never stored.
                      </p>
                      {uploadStatus ? (
                        <p className="flex items-start gap-2 text-xs leading-5 text-primary">
                          <FileCheck2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                          {uploadStatus}
                        </p>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2"><Label htmlFor="start_date">Start date</Label><Input id="start_date" type="date" {...form.register("start_date")} /></div>
                      <div className="space-y-2"><Label htmlFor="end_date">End date</Label><Input id="end_date" type="date" {...form.register("end_date")} /><FieldError message={form.formState.errors.end_date?.message} /></div>
                    </div>
                    <div className="space-y-2">
                      <Label>Strategy</Label>
                      <Controller control={form.control} name="strategy" render={({ field }) => (
                        <Select onValueChange={field.onChange} value={field.value}>
                          <SelectTrigger aria-label="Strategy"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="sma-crossover">SMA crossover</SelectItem>
                            <SelectItem value="ema-crossover">EMA crossover</SelectItem>
                            <SelectItem value="rsi-mean-reversion">RSI mean reversion</SelectItem>
                            <SelectItem value="macd">MACD signal line</SelectItem>
                            <SelectItem value="bollinger-mean-reversion">Bollinger mean reversion</SelectItem>
                            <SelectItem value="donchian-breakout">Donchian breakout</SelectItem>
                            <SelectItem value="price-momentum">Price momentum</SelectItem>
                            <SelectItem value="dual-momentum">Dual momentum</SelectItem>
                            <SelectItem value="zscore-mean-reversion">Z-score mean reversion</SelectItem>
                            <SelectItem value="volatility-filtered-trend">Volatility-filtered trend</SelectItem>
                            <SelectItem value="buy-and-hold">Buy and hold</SelectItem>
                          </SelectContent>
                        </Select>
                      )} />
                    </div>
                    {strategy === "rsi-mean-reversion" ? (
                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-2"><Label htmlFor="rsi_period">Period</Label><Input id="rsi_period" type="number" {...form.register("rsi_period", { valueAsNumber: true })} /></div>
                        <div className="space-y-2"><Label htmlFor="rsi_entry">Entry</Label><Input id="rsi_entry" type="number" {...form.register("rsi_entry", { valueAsNumber: true })} /></div>
                        <div className="space-y-2"><Label htmlFor="rsi_exit">Exit</Label><Input id="rsi_exit" type="number" {...form.register("rsi_exit", { valueAsNumber: true })} /></div>
                      </div>
                    ) : strategy !== "buy-and-hold" ? (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2"><Label htmlFor="fast_window">Fast window</Label><Input id="fast_window" type="number" {...form.register("fast_window", { valueAsNumber: true })} /><FieldError message={form.formState.errors.fast_window?.message} /></div>
                        <div className="space-y-2"><Label htmlFor="slow_window">Slow window</Label><Input id="slow_window" type="number" {...form.register("slow_window", { valueAsNumber: true })} /></div>
                      </div>
                    ) : null}
                    <Separator />
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2"><Label htmlFor="initial_capital">Initial capital</Label><Input id="initial_capital" type="number" {...form.register("initial_capital", { valueAsNumber: true })} /></div>
                      <div className="space-y-2"><Label>Benchmark</Label><Controller control={form.control} name="benchmark" render={({ field }) => (<Select onValueChange={field.onChange} value={field.value}><SelectTrigger aria-label="Benchmark"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="buy-and-hold">Buy and hold</SelectItem><SelectItem value="cash">Cash</SelectItem></SelectContent></Select>)} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2"><Label htmlFor="commission">Commission rate</Label><Input id="commission" step="0.0001" type="number" {...form.register("commission", { valueAsNumber: true })} /></div>
                      <div className="space-y-2"><Label htmlFor="slippage">Slippage rate</Label><Input id="slippage" step="0.0001" type="number" {...form.register("slippage", { valueAsNumber: true })} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2"><Label htmlFor="position_size">Position size</Label><Input id="position_size" max="1" min="0.01" step="0.05" type="number" {...form.register("position_size", { valueAsNumber: true })} /></div>
                      <div className="space-y-2"><Label htmlFor="maximum_exposure">Max exposure</Label><Input id="maximum_exposure" max="1" min="0.01" step="0.05" type="number" {...form.register("maximum_exposure", { valueAsNumber: true })} /></div>
                    </div>
                    <label className="flex items-center gap-3 text-sm" htmlFor="fractional"><input className="size-4 accent-primary" id="fractional" type="checkbox" {...form.register("fractional")} />Allow fractional shares</label>
                    <div className="grid grid-cols-2 gap-2">
                      <Button disabled={isCalculating} type="submit">{isCalculating ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <Play aria-hidden="true" />} {isCalculating ? "Calculating…" : "Run backtest"}</Button>
                      <Button onClick={() => { form.reset(defaultConfiguration); setResult(null); setError(null); }} type="button" variant="outline"><RotateCcw aria-hidden="true" /> Reset</Button>
                    </div>
                    <Button className="w-full" onClick={loadDemo} type="button" variant="secondary">Load demo</Button>
                  </form>
                </CardContent>
              </Card>
            </aside>

            <section className="min-w-0 space-y-5" aria-label="Backtest output">
              {error ? (
                <Alert variant="destructive"><TriangleAlert aria-hidden="true" /><AlertTitle>{error.code === "OFFLINE" ? "Service unavailable" : "Backtest not completed"}</AlertTitle><AlertDescription>{error.message} Check the ticker and market-data availability, then try again.</AlertDescription></Alert>
              ) : null}
              {warnings.map((warning) => <Alert key={warning}><TriangleAlert aria-hidden="true" /><AlertTitle>Historical-data notice</AlertTitle><AlertDescription>{warning}</AlertDescription></Alert>)}
              {isCalculating ? (
                <div aria-live="polite" className="space-y-5"><span className="sr-only">Calculating backtest results</span><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div><Skeleton className="h-[420px]" /></div>
              ) : result ? (
                <Tabs defaultValue="analysis">
                  <TabsList className="mb-5 h-auto flex-wrap"><TabsTrigger value="analysis">Analysis</TabsTrigger><TabsTrigger value="methodology">Methodology</TabsTrigger><TabsTrigger value="assumptions">Assumptions & limits</TabsTrigger></TabsList>
                  <TabsContent value="analysis"><Results result={result} runtime={runtime} /></TabsContent>
                  <TabsContent value="methodology"><Methodology /></TabsContent>
                  <TabsContent value="assumptions"><Assumptions /></TabsContent>
                </Tabs>
              ) : (
                <Card className="empty-state"><CardContent className="flex min-h-[520px] flex-col items-center justify-center p-8 text-center"><div className="empty-orbit" aria-hidden="true"><Play /></div><CardTitle className="mt-7 text-2xl">Ready for a reproducible run</CardTitle><CardDescription className="mt-3 max-w-lg text-base">Load the guided demonstration or configure a strategy. Results will include net performance, risk diagnostics, and a sortable trade ledger.</CardDescription><Button className="mt-6" onClick={loadDemo} size="lg"><Play aria-hidden="true" /> Run demo</Button></CardContent></Card>
              )}
            </section>
          </div>

          <section className="mt-10 scroll-mt-8" id="methodology"><Methodology /><div className="mt-5"><Assumptions /></div></section>
        </main>

        <footer className="mt-12 border-t"><div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-4 py-8 text-sm text-muted-foreground sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8"><p>Built for transparent quantitative-finance research.</p><p>Not investment advice. Historical results do not predict future performance.</p></div></footer>
      </div>
    </TooltipProvider>
  );
}

function Methodology() {
  return (
    <Card>
      <CardHeader><CardTitle>Methodology</CardTitle><CardDescription>How the browser configuration becomes a cost-aware equity curve.</CardDescription></CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-3">
        <div><span className="step-number">01</span><h3 className="mt-3 font-semibold">Load market history</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Adjusted closes are fetched for the selected ticker and date range. The engine never substitutes generated prices.</p></div>
        <div><span className="step-number">02</span><h3 className="mt-3 font-semibold">Shift the signal</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Every strategy signal is shifted one full bar before execution, preventing same-bar look-ahead.</p></div>
        <div><span className="step-number">03</span><h3 className="mt-3 font-semibold">Apply execution costs</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">The authoritative Python engine rebalances at next-bar close and deducts explicit commission and slippage assumptions.</p></div>
        <Alert className="md:col-span-3"><TriangleAlert aria-hidden="true" /><AlertTitle>Look-ahead-bias warning</AlertTitle><AlertDescription>Changing the execution convention, using revised data, or selecting parameters after viewing the outcome can materially inflate apparent performance.</AlertDescription></Alert>
      </CardContent>
    </Card>
  );
}

function Assumptions() {
  return (
    <Card>
      <CardHeader><CardTitle>Assumptions, limitations, and disclaimer</CardTitle></CardHeader>
      <CardContent className="grid gap-6 text-sm leading-6 text-muted-foreground md:grid-cols-3">
        <div><h3 className="font-semibold text-foreground">Assumptions</h3><p className="mt-2">Orders fill at the next historical close, liquidity is sufficient, costs scale linearly, and fractional shares follow the selected setting.</p></div>
        <div><h3 className="font-semibold text-foreground">Limitations</h3><p className="mt-2">The public demo is capped at 15 years and uses simplified fills. It omits taxes, borrow availability, queue position, market impact, and corporate actions.</p></div>
        <div><h3 className="font-semibold text-foreground">Financial disclaimer</h3><p className="mt-2">This application is for education and software demonstration only. It is not investment advice, an offer, or a prediction of future results.</p></div>
        <div className="md:col-span-3 rounded-lg border bg-muted/30 p-4"><strong className="text-foreground">Metric guide:</strong> {metricTip("Sharpe", "Annualized return divided by annualized volatility in this simplified demonstration.")}, {metricTip("Sortino", "Annualized return divided by downside volatility.")}, and {metricTip("Calmar", "Annualized return divided by absolute maximum drawdown.")} are scale-free summaries, not guarantees.</div>
      </CardContent>
    </Card>
  );
}

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BacktestLab } from "@/features/backtest-lab";
import { tradesToCsv } from "@/lib/backtest";

describe("Quant Backtesting Lab", () => {
  it("renders the complete initial demo state", () => {
    render(<BacktestLab />);
    expect(screen.getByRole("heading", { name: /test a strategy/i })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /run demo/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/not investment advice/i).length).toBeGreaterThan(0);
  });

  it("escapes spreadsheet formulas in trade exports", () => {
    const csv = tradesToCsv([
      {
        id: 1,
        entryDate: "2024-01-01",
        exitDate: "2024-01-02",
        direction: "=cmd",
        entryPrice: 100,
        exitPrice: 101,
        quantity: 1,
        grossPnl: 1,
        commission: 0,
        slippage: 0,
        netPnl: 1,
        return: 0.01,
        holdingPeriod: 1,
        exitReason: "Signal",
      },
    ]);
    expect(csv).toContain("'=cmd");
  });
});

import { expect, test } from "@playwright/test";
import path from "node:path";

test("runs the sample moving-average workflow", async ({ page }, testInfo) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });
  await page.goto("/");
  await expect(page.getByText("Sample Data").first()).toBeVisible();
  await page.getByLabel("Validate OHLCV CSV").setInputFiles({
    name: "sample-prices.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "date,open,high,low,close,volume\n2024-01-02,100,102,99,101,1000\n2024-01-03,101,103,100,102,1200\n",
    ),
  });
  await expect(page.getByText(/2 rows validated/)).toBeVisible();
  await page.getByRole("button", { name: "Load demo" }).click();
  await expect(page.getByText("Total return")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Trade ledger")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV", exact: true }).click();
  await download;
  await page.locator("header").scrollIntoViewIfNeeded();
  const screenshotName = testInfo.project.name === "mobile" ? "dashboard-mobile.png" : "dashboard-preview.png";
  await page.screenshot({
    fullPage: true,
    path: path.resolve(process.cwd(), "assets", screenshotName),
  });
  await page.getByRole("link", { name: /Read methodology/i }).click();
  await expect(page.getByText("Look-ahead-bias warning")).toBeVisible();
  await expect(page.getByText(/Not investment advice/).last()).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://quant-backtesting-engine.vercel.app"),
  title: "Quant Backtesting Lab | Aarav Shah",
  description:
    "Configure execution-aware strategy backtests and inspect net returns, drawdowns, risk, costs, and trades.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Quant Backtesting Lab",
    description: "Test a strategy. See every assumption.",
    type: "website",
    images: ["/opengraph-image"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Quant Backtesting Lab",
    description: "Execution-aware backtesting in a transparent public research sandbox.",
    images: ["/opengraph-image"],
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}

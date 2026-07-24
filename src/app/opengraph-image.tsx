import { ImageResponse } from "next/og";

export const alt = "Quant Backtesting Lab — Test a strategy. See every assumption.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  const bars = [184, 152, 168, 126, 138, 98, 114, 70, 82, 44, 62, 28];
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 64, background: "#0a1019", color: "#f1f5f9", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 48, height: 48, border: "1px solid #64d6ad", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: "#64d6ad", fontSize: 25, fontWeight: 700 }}>Q</div>
          <span style={{ fontSize: 21, letterSpacing: 4, color: "#94a3b8" }}>AARAV SHAH / QUANT RESEARCH</span>
        </div>
        <div style={{ border: "1px solid #2e4356", borderRadius: 999, padding: "10px 18px", color: "#64d6ad", fontSize: 18 }}>SAMPLE DATA</div>
      </div>
      <div style={{ display: "flex", gap: 54, alignItems: "flex-end" }}>
        <div style={{ display: "flex", flexDirection: "column", width: 650 }}>
          <span style={{ color: "#64d6ad", fontSize: 20, letterSpacing: 3 }}>EXECUTION-AWARE RESEARCH SANDBOX</span>
          <h1 style={{ margin: "22px 0 18px", fontSize: 68, lineHeight: 1.02, letterSpacing: -3 }}>Test a strategy.<br />See every assumption.</h1>
          <p style={{ margin: 0, color: "#9aaabd", fontSize: 25, lineHeight: 1.4 }}>Returns, drawdowns, risk, costs, and every completed trade.</p>
        </div>
        <div style={{ width: 360, height: 230, display: "flex", alignItems: "flex-end", gap: 10, borderBottom: "1px solid #2b3a49" }}>
          {bars.map((height, index) => <div key={index} style={{ width: 20, height, background: index > 7 ? "#64d6ad" : "#4c89ac", borderRadius: "4px 4px 0 0" }} />)}
        </div>
      </div>
    </div>,
    size,
  );
}

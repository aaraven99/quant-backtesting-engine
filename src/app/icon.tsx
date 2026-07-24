import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 14, background: "#0a1019", color: "#64d6ad", fontSize: 36, fontWeight: 700 }}>Q</div>,
    size,
  );
}

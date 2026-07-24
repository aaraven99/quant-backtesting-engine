import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
  outputFileTracingRoot: process.cwd(),
  async rewrites() {
    return process.env.API_PROXY_URL
      ? [
          {
            source: "/api/:path*",
            destination: `${process.env.API_PROXY_URL}/api/:path*`,
          },
        ]
      : [];
  },
};

export default nextConfig;

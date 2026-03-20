import type { NextConfig } from "next";
import { resolve } from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    root: resolve(__dirname),
  },
  async headers() {
    return [
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

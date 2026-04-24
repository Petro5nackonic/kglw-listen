import type { NextConfig } from "next";
import { resolve } from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    root: resolve(__dirname),
  },
  // Ensure our committed data files ship with Vercel/serverless function bundles.
  // `process.cwd() + "data/..."` reads aren't auto-traced by Next's bundler.
  outputFileTracingIncludes: {
    "/api/**/*": [
      "./data/archive.json",
      "./data/prebuilt-playlists.static.json",
    ],
    "/**/*": [
      "./data/archive.json",
      "./data/prebuilt-playlists.static.json",
    ],
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

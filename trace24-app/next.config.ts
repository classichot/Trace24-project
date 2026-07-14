import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow both localhost and 127.0.0.1 during next dev (HMR / client resources)
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
    ];
  },
  // Keep national catalog + cached reports inside serverless traces
  outputFileTracingIncludes: {
    "/api/agencies/**/*": [
      "./data/catalog/**/*",
      "./data/real/**/*",
      "./data/related/**/*",
      "./data/contracts-cache/**/*",
    ],
    "/api/agencies": ["./data/catalog/**/*"],
    "/api/pipeline": [
      "./data/catalog/**/*",
      "./data/real/**/*",
      "./data/evidence/**/*",
      "./data/vector/**/*",
      "./data/related/**/*",
      "./data/contracts-cache/**/*",
    ],
  },
};

export default nextConfig;

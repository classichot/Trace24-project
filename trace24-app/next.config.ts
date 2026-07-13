import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow both localhost and 127.0.0.1 during next dev (HMR / client resources)
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Keep national catalog + cached reports inside serverless traces
  outputFileTracingIncludes: {
    "/api/agencies/**/*": ["./data/catalog/**/*", "./data/real/**/*", "./data/related/**/*"],
    "/api/agencies": ["./data/catalog/**/*"],
    "/api/pipeline": ["./data/catalog/**/*", "./data/real/**/*", "./data/evidence/**/*", "./data/vector/**/*", "./data/related/**/*"],
  },
};

export default nextConfig;

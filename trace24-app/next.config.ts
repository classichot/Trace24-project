import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow both localhost and 127.0.0.1 during next dev (HMR / client resources)
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;

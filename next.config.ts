import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright (and some tunnels) hit the dev server via 127.0.0.1; without
  // this, Next 16 blocks the webpack-hmr fetch and client bundles never load.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;

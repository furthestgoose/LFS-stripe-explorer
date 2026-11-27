import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the dev server's HMR websocket when browsing from remote hosts
  // (e.g. the Lustre client's own IP) instead of localhost.
  allowedDevOrigins: ["10.151.0.56", "10.66.199.13"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

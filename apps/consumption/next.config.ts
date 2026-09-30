import path from "node:path";
import type { NextConfig } from "next";

const config: NextConfig = {
  // Multi-zone: served by its own Lambda under this path of the portal's domain.
  basePath: "/verbrauch",
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  poweredByHeader: false,
  images: { unoptimized: true },
  reactStrictMode: true,
  transpilePackages: ["@kundenportal/web-auth"],
};

export default config;

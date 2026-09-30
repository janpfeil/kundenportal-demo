import path from "node:path";
import type { NextConfig } from "next";
import { appVersion } from "../../scripts/app-version.mjs";

const config: NextConfig = {
  // Multi-zone: served by its own Lambda under this path of the portal's domain.
  basePath: "/vertraege",
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  poweredByHeader: false,
  // Shown in the header of every page (see scripts/app-version.mjs).
  env: { NEXT_PUBLIC_APP_VERSION: appVersion() },
  images: { unoptimized: true },
  reactStrictMode: true,
  transpilePackages: ["@kundenportal/web-auth"],
};

export default config;

import path from "node:path";
import type { NextConfig } from "next";
import { appVersion } from "../../scripts/app-version.mjs";

const config: NextConfig = {
  // Self-contained Node.js server for AWS Lambda (Lambda Web Adapter); see docs/wiki/nextjs-betrieb.md.
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  poweredByHeader: false,
  // Shown in the header of every page (see scripts/app-version.mjs).
  env: { NEXT_PUBLIC_APP_VERSION: appVersion() },
  // No image optimisation lambda: images are served as-is from S3 via CloudFront.
  images: { unoptimized: true },
  reactStrictMode: true,
  // Two root layouts (prerendered public pages, per-request signed-in area): the 404 for
  // unknown paths comes from app/global-not-found.tsx.
  experimental: { globalNotFound: true },
};

export default config;

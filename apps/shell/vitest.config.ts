import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.join(import.meta.dirname, "src") } },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test-setup.ts"],
    // next.config.ts sets it at build time.
    env: { NEXT_PUBLIC_APP_VERSION: "v0.0.0 · test" },
  },
});

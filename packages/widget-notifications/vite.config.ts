import { defineConfig } from "vitest/config";

/**
 * One self-contained ES module (dist/bell.js) that the edge publishes under /widgets/;
 * shell and zones load it at runtime, so the widget can change without redeploying them.
 */
export default defineConfig({
  build: {
    lib: { entry: "src/bell.ts", formats: ["es"], fileName: () => "bell.js" },
    target: "es2022",
    emptyOutDir: true,
  },
  test: { environment: "jsdom" },
});

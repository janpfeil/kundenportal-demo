// tsc only emits JavaScript and declarations. The stylesheet the zones import
// (dist/styles.css) is assembled here: the theme tokens generated from src/themes.ts (already
// compiled to dist/themes.js), then the hand-written base, component and layout styles.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { themesCss } from "../dist/themes.js";

const root = path.join(import.meta.dirname, "..");
const parts = [
  themesCss(),
  readFileSync(path.join(root, "src", "styles.css"), "utf8"),
  readFileSync(path.join(root, "src", "layout.css"), "utf8"),
];
writeFileSync(path.join(root, "dist", "styles.css"), parts.join("\n"));

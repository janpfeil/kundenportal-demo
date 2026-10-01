// tsc only emits JavaScript and declarations. The stylesheet the zones import
// (dist/styles.css) is assembled here: the theme tokens generated from src/themes.ts (already
// compiled to dist/themes.js), then the hand-written styles in cascade order — base and form
// components, page and cards, widgets, charts, then frame and navigation and the menus.
// .storybook/preview.tsx imports the same files in the same order.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { themesCss } from "../dist/themes.js";

const root = path.join(import.meta.dirname, "..");
const SOURCES = ["styles.css", "page.css", "widgets.css", "charts.css", "layout.css", "menus.css"];
const parts = [
  themesCss(),
  ...SOURCES.map((file) => readFileSync(path.join(root, "src", file), "utf8")),
];
writeFileSync(path.join(root, "dist", "styles.css"), parts.join("\n"));

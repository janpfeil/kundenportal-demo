// tsc only emits JavaScript and declarations; the stylesheet is shipped as-is.
import { copyFileSync } from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
copyFileSync(path.join(root, "src", "styles.css"), path.join(root, "dist", "styles.css"));

// Prepares the standalone build for AWS Lambda: adds the start script the Lambda Web
// Adapter runs. Static files (.next/static, public) are uploaded to S3 by the CDK app.
import { chmodSync, existsSync, lstatSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const standalone = path.join(import.meta.dirname, "..", ".next", "standalone");
const server = path.join(standalone, "apps", "shell", "server.js");
if (!existsSync(server)) throw new Error(`Standalone server not found at ${server}`);

// sharp is only needed for image optimisation, which is disabled; Next.js traces it anyway
// (x64 binaries, ~40 MB). Removing it keeps the arm64 Lambda package small.
const store = path.join(standalone, "node_modules", ".pnpm");
for (const entry of existsSync(store) ? readdirSync(store) : []) {
  if (entry.startsWith("sharp@") || entry.startsWith("@img+")) {
    rmSync(path.join(store, entry), { recursive: true, force: true });
  }
}
for (const link of ["sharp", "@img"]) {
  rmSync(path.join(store, "node_modules", link), { recursive: true, force: true });
}

// Drop links that pointed to the removed packages (e.g. next/node_modules/sharp).
function removeDanglingLinks(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = lstatSync(full);
    if (stat.isSymbolicLink()) {
      if (!existsSync(full)) rmSync(full);
    } else if (stat.isDirectory()) {
      removeDanglingLinks(full);
    }
  }
}
removeDanglingLinks(standalone);

const run = path.join(standalone, "run.sh");
// Listen on loopback only: the Lambda Web Adapter forwards to 127.0.0.1:$PORT.
writeFileSync(run, "#!/bin/sh\nexport HOSTNAME=127.0.0.1\nexec node apps/shell/server.js\n");
chmodSync(run, 0o755);
console.log(`Lambda package ready: ${standalone}`);

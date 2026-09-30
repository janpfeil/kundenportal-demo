// Packages a Next.js standalone build as a Lambda zip for the Lambda Web Adapter.
//
//   node scripts/package-next-lambda.mjs <app dir> [--serve-static]
//
// --serve-static copies .next/static and public into the package, so the zone's own
// function serves them under its basePath (CloudFront caches them). Without it, the
// static files are published separately (the shell's go to S3 via the edge stack).
//
// The zip keeps pnpm's symlinks (-y): e.g. apps/<app>/node_modules/next links into
// node_modules/.pnpm and finds its own dependencies next to the link target; following
// the links breaks that resolution. Lambda supports symlinks inside the deployment zip.
import { execFileSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, lstatSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const [appArg, ...flags] = process.argv.slice(2);
if (!appArg) throw new Error("Usage: package-next-lambda.mjs <app dir> [--serve-static]");
const appDir = path.resolve(appArg);
const repoRoot = path.resolve(import.meta.dirname, "..");
const appRel = path.relative(repoRoot, appDir);
const appName = path.basename(appDir);
const standalone = path.join(appDir, ".next", "standalone");
const server = path.join(standalone, appRel, "server.js");
if (!existsSync(server)) throw new Error(`Standalone server not found at ${server}`);

// sharp is only needed for image optimisation, which is disabled; Next.js traces it anyway
// (x64 binaries, ~40 MB), useless on the arm64 Lambda.
const store = path.join(standalone, "node_modules", ".pnpm");
for (const entry of existsSync(store) ? readdirSync(store) : []) {
  if (entry.startsWith("sharp@") || entry.startsWith("@img+")) {
    rmSync(path.join(store, entry), { recursive: true, force: true });
  }
}
for (const link of ["sharp", "@img"]) rmSync(path.join(store, "node_modules", link), { recursive: true, force: true });

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

if (flags.includes("--serve-static")) {
  cpSync(path.join(appDir, ".next", "static"), path.join(standalone, appRel, ".next", "static"), { recursive: true });
  if (existsSync(path.join(appDir, "public"))) {
    cpSync(path.join(appDir, "public"), path.join(standalone, appRel, "public"), { recursive: true });
  }
}

// Listen on loopback only: the Lambda Web Adapter forwards to 127.0.0.1:$PORT.
const run = path.join(standalone, "run.sh");
writeFileSync(run, `#!/bin/sh\nexport HOSTNAME=127.0.0.1\nexec node ${appRel}/server.js\n`);
chmodSync(run, 0o755);

const zipFile = path.join(appDir, ".next", `${appName}-lambda.zip`);
rmSync(zipFile, { force: true });
execFileSync("zip", ["-q", "-r", "-y", zipFile, "."], { cwd: standalone, stdio: "inherit" });
console.log(`Lambda package ready: ${zipFile}`);

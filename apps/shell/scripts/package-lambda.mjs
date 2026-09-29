// Prepares the standalone build for AWS Lambda: adds the start script the Lambda Web
// Adapter runs. Static files (.next/static, public) are uploaded to S3 by the CDK app.
import { chmodSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";

const standalone = path.join(import.meta.dirname, "..", ".next", "standalone");
const server = path.join(standalone, "apps", "shell", "server.js");
if (!existsSync(server)) throw new Error(`Standalone server not found at ${server}`);

const run = path.join(standalone, "run.sh");
// Listen on loopback only: the Lambda Web Adapter forwards to 127.0.0.1:$PORT.
writeFileSync(run, "#!/bin/sh\nexport HOSTNAME=127.0.0.1\nexec node apps/shell/server.js\n");
chmodSync(run, 0o755);
console.log(`Lambda package ready: ${standalone}`);

import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Starts the list of test identities this run creates (one subject per line); the workers
 * inherit the variable and append to it, global-teardown.ts announces them at the end.
 */
export default function globalSetup() {
  const file = path.join(tmpdir(), `kundenportal-e2e-${process.pid}-${Date.now()}.txt`);
  writeFileSync(file, "");
  process.env.E2E_IDENTITIES_FILE = file;
}

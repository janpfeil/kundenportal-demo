import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");

/**
 * Version shown in the header of every page, fixed at build time: the release version
 * from the root package.json plus the commit, e.g. "v0.4.1 · 1a2b3c4". CI provides the
 * commit as GITHUB_SHA; locally git is asked, and without either only the version shows.
 */
export function appVersion(env = process.env) {
  const { version } = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
  let commit = env.GITHUB_SHA?.slice(0, 7);
  if (!commit) {
    try {
      commit = execFileSync("git", ["rev-parse", "--short=7", "HEAD"], { cwd: ROOT })
        .toString()
        .trim();
    } catch {
      commit = undefined;
    }
  }
  return commit ? `v${version} · ${commit}` : `v${version}`;
}

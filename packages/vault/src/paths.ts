// Cross-platform path helpers. Build every path with path.join + os.homedir()
// so the package runs on Linux, Mac, and Windows (OVERALL_PLAN rule 5).
import os from "node:os";
import path from "node:path";

/** Expand a leading `~` or `~/` to the user's home directory. Leaves other paths alone. */
export function expandTilde(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

/** Absolute, tilde-expanded, normalized path. */
export function resolvePath(p: string): string {
  return path.resolve(expandTilde(p));
}

/** The SitDOWN runtime home, `~/.sitdown` unless overridden by SITDOWN_HOME. */
export function appHome(): string {
  const override = process.env.SITDOWN_HOME;
  if (override && override.trim()) return resolvePath(override);
  return path.join(os.homedir(), ".sitdown");
}

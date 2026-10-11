// .sitdownignore — opt out of capture for chosen repos/paths/tools (renamed from .alikeignore).
// Lines are gitignore-ish: `#` comments, blank lines ignored; `tool:<name>` skips an agent;
// everything else is a path substring/glob tested against the session cwd.
import { readFileSync } from "node:fs";
import path from "node:path";
import { homeDir } from "./paths.mjs";

/** Read rules from ~/.sitdown/.sitdownignore (and an optional extra file). */
export function loadIgnoreRules(extraFile = null) {
  const files = [path.join(homeDir(), ".sitdownignore")];
  if (extraFile) files.push(extraFile);
  const rules = { paths: [], tools: new Set() };
  for (const f of files) {
    let text;
    try {
      text = readFileSync(f, "utf8");
    } catch {
      continue;
    }
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      if (line.startsWith("tool:")) rules.tools.add(line.slice(5).trim().toLowerCase());
      else rules.paths.push(line);
    }
  }
  return rules;
}

function globToRegExp(glob) {
  const esc = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(esc);
}

/** True if a session in `cwd` run by `agent` should be skipped. */
export function shouldIgnore({ cwd = "", agent = "" } = {}, rules = loadIgnoreRules()) {
  if (agent && rules.tools.has(String(agent).toLowerCase())) return true;
  for (const p of rules.paths) {
    if (!cwd) continue;
    if (cwd.includes(p)) return true;
    try {
      if (globToRegExp(p).test(cwd)) return true;
    } catch {
      /* a bad glob is not a reason to capture something the user excluded; ignore it */
    }
  }
  return false;
}

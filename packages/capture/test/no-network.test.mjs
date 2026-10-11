// PRD-A: a test that FAILS if any fetch/network call remains in the runtime.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const srcDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

test("no network calls remain in capture runtime", () => {
  const banned = [/\bfetch\s*\(/, /require\(['"]https?['"]\)/, /from ['"]node:https?['"]/];
  for (const file of walk(srcDir)) {
    if (!/\.mjs$/.test(file)) continue;
    const code = readFileSync(file, "utf8");
    for (const re of banned) {
      assert.ok(!re.test(code), `network call ${re} found in ${path.basename(file)}`);
    }
  }
});

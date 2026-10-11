import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { collectAffected, loadDigests, writeBatch } from "../dist/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturesVault = path.resolve(here, "../../../contracts/fixtures/vault/central");
const processedDir = path.resolve(here, "../../../contracts/fixtures/processed");

let root: string;
let vault: string; // the central vault

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "sitdown-vault-"));
  vault = path.join(root, "central");
  const digests = await loadDigests(processedDir);
  await writeBatch(digests, collectAffected(digests), {
    central: vault,
    personVaultFor: (author) => path.join(root, author),
    centralName: "central",
  });
});

afterAll(async () => {
  // temp dir left for inspection; OS cleans tmp. No secrets written.
});

// These notes are fully derivable from the Digests (no hand-polish in the fixture).
const IDENTICAL = [
  "daily/2026-10-11.md",
  "features/payments.md",
  "people/sam.md",
  "people/alex.md",
];

describe("vault generation against fixtures", () => {
  for (const rel of IDENTICAL) {
    it(`${rel} matches the fixture byte-for-byte`, async () => {
      const got = await readFile(path.join(vault, rel), "utf8");
      const want = await readFile(path.join(fixturesVault, rel), "utf8");
      expect(got).toBe(want);
    });
  }

  it("central people index is shareable (private: false)", async () => {
    const sam = await readFile(path.join(vault, "people/sam.md"), "utf8");
    expect(sam).toMatch(/^private: false$/m);
  });

  it("each person's own vault holds a private me.md (not central)", async () => {
    const me = await readFile(path.join(root, "sam/me.md"), "utf8");
    expect(me).toMatch(/^private: true$/m);
    expect(me).toContain("## Contributions");
    // cross-vault references into central use obsidian:// links (wikilinks don't span vaults)
    expect(me).toContain("obsidian://open?vault=central&file=decisions%2F2026-10-11-refund-idempotency");
  });

  it("personal daily contains only that person's activity", async () => {
    const samDaily = await readFile(path.join(root, "sam/daily/2026-10-11.md"), "utf8");
    expect(samDaily).toContain("Added refund endpoint");
    expect(samDaily).not.toContain("JWT refresh"); // that's alex's work -> never in sam's vault
  });

  it("feature history is newest first (commit after same-day session)", async () => {
    const payments = await readFile(path.join(vault, "features/payments.md"), "utf8");
    const commitIdx = payments.indexOf("commit:9f2e1d");
    const sessionIdx = payments.indexOf("session:claude:abc123");
    expect(commitIdx).toBeGreaterThanOrEqual(0);
    expect(commitIdx).toBeLessThan(sessionIdx); // newest (commit) listed first
  });

  it("decision notes carry a wikilinked feature", async () => {
    const dec = await readFile(
      path.join(vault, "decisions/2026-10-11-refund-idempotency.md"),
      "utf8",
    );
    expect(dec).toContain('feature: "[[payments]]"');
  });
});

describe("re-run safety", () => {
  it("preserves a hand-written line outside the markers and is idempotent inside", async () => {
    const rel = "features/payments.md";
    const abs = path.join(vault, rel);
    const before = await readFile(abs, "utf8");

    // Human appends a note below the auto block.
    const humanLine = "\nMy hand-written roadmap note.\n";
    await writeFile(abs, before + humanLine, "utf8");

    // Re-run the batch.
    const digests = await loadDigests(processedDir);
    await writeBatch(digests, collectAffected(digests), {
      central: vault,
      personVaultFor: (author) => path.join(root, author),
      centralName: "central",
    });

    const after = await readFile(abs, "utf8");
    expect(after).toContain("My hand-written roadmap note.");
    // Auto content unchanged (same digests) -> everything up to auto:end identical to `before`.
    const autoEnd = "<!-- auto:end -->";
    expect(after.slice(0, after.indexOf(autoEnd))).toBe(before.slice(0, before.indexOf(autoEnd)));
  });
});

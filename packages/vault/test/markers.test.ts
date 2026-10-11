import { describe, expect, it } from "vitest";
import { AUTO_END, AUTO_START, composeNote } from "../dist/markers.js";
import type { FrontMatter } from "../dist/frontmatter.js";

function fm(entries: Array<[string, string | boolean | string[]]>): FrontMatter {
  return new Map(entries);
}

describe("composeNote marker safety", () => {
  const spec = {
    frontMatter: fm([["type", "decision"], ["updated", "2026-10-11"]]),
    title: "Use idempotency keys for refunds",
    autoBody: "**Chose:** keys\n\n**Reason:** no double-charge",
  };

  it("creates a fresh note with markers and title", () => {
    const out = composeNote(null, spec);
    expect(out).toContain(`# ${spec.title}`);
    expect(out).toContain(AUTO_START);
    expect(out).toContain(AUTO_END);
    expect(out).toContain("**Chose:** keys");
  });

  it("preserves hand-written text outside the markers across a re-run", () => {
    const first = composeNote(null, spec);
    const edited = first + "\nHand-written notes below are never touched.\n";
    const updated = composeNote(edited, {
      ...spec,
      autoBody: "**Chose:** keys v2\n\n**Reason:** stronger",
    });
    expect(updated).toContain("Hand-written notes below are never touched.");
    expect(updated).toContain("**Chose:** keys v2");
    expect(updated).not.toContain("**Chose:** keys\n"); // old auto content replaced
  });

  it("is idempotent: composing twice with the same spec yields the same output", () => {
    const once = composeNote(null, spec);
    const twice = composeNote(once, spec);
    expect(twice).toBe(once);
  });

  it("injects markers into a human note that has none, keeping the human body", () => {
    const human = "---\ntype: decision\n---\n# Title\n\nMy own prose.\n";
    const out = composeNote(human, {
      frontMatter: fm([["type", "decision"]]),
      title: "Title",
      autoBody: "generated",
    });
    expect(out).toContain(AUTO_START);
    expect(out).toContain("generated");
    expect(out).toContain("My own prose.");
  });
});

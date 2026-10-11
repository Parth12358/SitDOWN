import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Digest } from "@sitdown/contracts";
import { describe, expect, it } from "vitest";
import { entityFor, eventsForDigest } from "../dist/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.resolve(here, "../../../contracts/fixtures");

function digest(name: string): Digest {
  return JSON.parse(readFileSync(path.join(fixtures, "processed", name), "utf8")) as Digest;
}

describe("entity ids", () => {
  it("match the seeded fixture UUIDv5 entities", () => {
    // From contracts/fixtures/events.seed.sql
    expect(entityFor("sam")).toBe("d4fcb0aa-b341-5a81-bf77-91a23dbec92d");
    expect(entityFor("alex")).toBe("82a3f137-3a00-5621-b175-e38aca401708");
  });
});

describe("eventsForDigest mapping", () => {
  it("session digest: FeatureTouched first, then interventions, AgentSession, decisions", () => {
    const names = eventsForDigest(digest("session-claude-abc123.json")).map((e) => e.event.name);
    expect(names).toEqual([
      "FeatureTouched",
      "HumanIntervened",
      "AgentSession",
      "DecisionRecorded",
    ]);
  });

  it("maps the claude source token to the claude_code agent kind", () => {
    const agent = eventsForDigest(digest("session-claude-abc123.json")).find(
      (e) => e.event.name === "AgentSession",
    );
    expect(agent?.event).toMatchObject({ value: "claude_code" });
  });

  it("maps the codex source token to the codex agent kind", () => {
    const agent = eventsForDigest(digest("session-codex-ghi789.json")).find(
      (e) => e.event.name === "AgentSession",
    );
    expect(agent?.event).toMatchObject({ value: "codex" });
  });

  it("commit digest: FeatureTouched, CommitMade(lines), AuthorType(dominant label)", () => {
    const events = eventsForDigest(digest("commit-9f2e1d.json")).map((e) => e.event);
    expect(events).toEqual([
      { name: "FeatureTouched", value: "payments" },
      { name: "CommitMade", value: 39 }, // [10,42]=33 + [43,48]=6
      { name: "AuthorType", value: "agent_edited" }, // 33 lines > 6 lines
    ]);
  });

  it("FeatureTouched always sorts strictly before the events it applies to", () => {
    const timed = eventsForDigest(digest("session-claude-abc123.json"));
    const ft = timed.find((e) => e.event.name === "FeatureTouched")!;
    for (const other of timed.filter((e) => e.event.name !== "FeatureTouched")) {
      expect(ft.ts <= other.ts).toBe(true);
    }
  });
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTranscript, topicOf, composeSms, turnsOf, runFollowup } from "../followup.js";
import { MockMcpClient } from "../mcp.js";
import { MockDial } from "../dial.js";

const TURNS = [
  { speaker: "agent", text: "This is SitDOWN, an AI assistant." },
  { speaker: "sam", text: "SitDOWN, why did we use idempotency keys for refunds?" },
  { speaker: "agent", text: "You required an Idempotency-Key header. Source: session claude:abc123." },
  { speaker: "sam", text: "What's our production deploy process?" },
  { speaker: "agent", text: "I don't know — it's not in the docs." },
];

test("parseTranscript pairs questions with answers and flags the unanswered one", () => {
  const qas = parseTranscript(TURNS);
  assert.equal(qas.length, 2);
  assert.equal(qas[0].answered, true);
  assert.equal(qas[1].answered, false);
  assert.equal(qas[1].asker, "sam");
});

test("topicOf drops the wake name and stopwords", () => {
  const t = topicOf("SitDOWN, what's our production deploy process?");
  assert.match(t, /deploy/);
  assert.ok(!/sitdown/i.test(t));
});

test("turnsOf parses a plain 'speaker: text' transcript string", () => {
  const turns = turnsOf({
    id: "c",
    status: { state: "Terminated" },
    transcript: "agent: hi\nsam: how are we on auth?",
  });
  assert.equal(turns.length, 2);
  assert.equal(turns[1].speaker, "sam");
});

test("composeSms includes answers and follow-ups, and skips people with nothing", () => {
  const qas = parseTranscript(TURNS);
  const body = composeSms("sam", qas, [{ topic: "deploy process", asked_by: "sam", ping: "alex" }]);
  assert.match(body, /Answers:/);
  assert.match(body, /follow up/i);
  assert.match(body, /ask alex/);
  assert.equal(composeSms("nobody", qas, []), "");
});

test("runFollowup logs the unanswered gap and texts the asker", async () => {
  const dial = new MockDial();
  const report = await runFollowup(
    { id: "c", status: { state: "Terminated" }, transcriptTurns: TURNS },
    new MockMcpClient(),
    dial,
    [{ slug: "sam", phone: "+15550001000" }],
    { fromNumberId: "n1" },
  );
  assert.equal(report.unanswered.length, 1);
  assert.match(report.unanswered[0].topic, /deploy/);
  assert.equal(report.smsSent.length, 1);
  assert.equal(dial.sent.length, 1);
});

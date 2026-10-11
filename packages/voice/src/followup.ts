// @sitdown/voice — E. After a call: read the transcript, log doc gaps, and text each attendee.
//   - Pair each question with the agent's answer.
//   - Answers that are "I don't know" -> mcp.log_unanswered(topic, asked_by).
//   - Send each attendee an SMS with the answers they got plus any follow-ups to chase.
import type { DialCall, Dialer, TranscriptTurn } from "./dial.js";
import type { McpClient } from "./mcp.js";

export interface QA {
  asker?: string;
  question: string;
  answer: string;
  answered: boolean;
  topic: string;
}

const NO_ANSWER =
  /\b(i\s*don'?t\s*know|don'?t\s*have|not\s*sure|can'?t\s*find|couldn'?t\s*find|don'?t\s*see|no(thing)?\b.*\bdocs?\b|not\s*in\s*the\s*docs)\b/i;

const STOPWORDS = new Set([
  "the", "a", "an", "our", "we", "did", "do", "does", "how", "what", "why", "when", "who",
  "is", "are", "was", "were", "about", "for", "to", "of", "on", "in", "with", "these", "days",
  "remind", "me", "tell", "us", "you", "your", "that", "this", "it", "and", "or", "use", "used",
  "handle", "there", "here", "any", "some", "get", "got", "have", "has",
]);

/** Turns from structured data, else parse "speaker: text" lines from the transcript string. */
export function turnsOf(call: DialCall): TranscriptTurn[] {
  if (call.transcriptTurns?.length) return call.transcriptTurns;
  if (!call.transcript) return [];
  return call.transcript
    .split(/\r?\n/)
    .map((line) => {
      const m = line.match(/^\s*([A-Za-z][\w .-]*?):\s*(.*)$/);
      return m ? { speaker: m[1].trim().toLowerCase(), text: m[2].trim() } : undefined;
    })
    .filter((t): t is TranscriptTurn => !!t && t.text.length > 0);
}

function isAgent(speaker: string): boolean {
  const s = speaker.toLowerCase();
  return s === "agent" || s === "assistant" || s === "sitdown" || s === "ai";
}

function looksLikeQuestion(text: string): boolean {
  return text.includes("?") || /^\s*(how|what|why|when|who|where|did|do|does|can|is|are)\b/i.test(text);
}

/** Short topic phrase from a question: drop the wake-name and stopwords, keep a few keywords. */
export function topicOf(question: string): string {
  const cleaned = question
    .replace(/sitdown/gi, "")
    .replace(/[^\w\s]/g, " ")
    .toLowerCase();
  const words = cleaned.split(/\s+/).filter((w) => w.length > 2 && !STOPWORDS.has(w));
  const topic = words.slice(0, 4).join(" ").trim();
  return topic || question.replace(/[^\w\s]/g, " ").trim().slice(0, 40) || "unspecified";
}

/** Pair questions with the agent reply that immediately follows them. */
export function parseTranscript(turns: TranscriptTurn[]): QA[] {
  const qas: QA[] = [];
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i];
    if (isAgent(t.speaker) || !looksLikeQuestion(t.text)) continue;
    // next agent turn is the answer
    const reply = turns.slice(i + 1).find((x) => isAgent(x.speaker));
    if (!reply) continue;
    qas.push({
      asker: t.speaker.toLowerCase(),
      question: t.text,
      answer: reply.text,
      answered: !NO_ANSWER.test(reply.text),
      topic: topicOf(t.text),
    });
  }
  return qas;
}

export interface FollowupReport {
  qas: QA[];
  unanswered: Array<{ topic: string; asked_by?: string; ping?: string }>;
  smsSent: Array<{ slug: string; to: string; body: string }>;
}

/**
 * Run the post-call workflow. `attendees` maps a known speaker slug to a phone number.
 * `dryRun` still composes everything (and still logs gaps) but SMS bodies are returned, not sent
 * — actually they ARE sent through the provided dialer, so pass MockDial for a dry run.
 */
export async function runFollowup(
  call: DialCall,
  mcp: McpClient,
  dialer: Dialer,
  attendees: Array<{ slug: string; phone: string }>,
  opts: { fromNumberId: string },
): Promise<FollowupReport> {
  const qas = parseTranscript(turnsOf(call));

  // Log each unanswered question as a documentation gap.
  const unanswered: FollowupReport["unanswered"] = [];
  for (const qa of qas.filter((q) => !q.answered)) {
    let ping: string | undefined;
    try {
      ping = (await mcp.log_unanswered({ topic: qa.topic, asked_by: qa.asker })).ping;
    } catch {
      // logging failures must not block follow-ups
    }
    unanswered.push({ topic: qa.topic, asked_by: qa.asker, ping });
  }

  // One SMS per attendee: the answers they received + follow-ups they should chase.
  const smsSent: FollowupReport["smsSent"] = [];
  for (const { slug, phone } of attendees) {
    const body = composeSms(slug, qas, unanswered);
    if (!body) continue;
    try {
      await dialer.sendMessage({ to: phone, fromNumberId: opts.fromNumberId, body });
      smsSent.push({ slug, to: phone, body });
    } catch {
      // keep going; report only what actually sent
    }
  }

  return { qas, unanswered, smsSent };
}

/** Build a per-attendee recap SMS. Returns "" if there is nothing worth texting. */
export function composeSms(
  slug: string,
  qas: QA[],
  unanswered: FollowupReport["unanswered"],
): string {
  const mine = qas.filter((q) => q.asker === slug);
  const answered = mine.filter((q) => q.answered);
  const myFollowups = unanswered.filter((u) => u.asked_by === slug);

  const lines: string[] = [`SitDOWN recap for ${slug}:`];
  if (answered.length) {
    lines.push("Answers:");
    for (const q of answered) lines.push(`• ${oneLine(q.answer)}`);
  }
  if (myFollowups.length) {
    lines.push("To follow up (not in the docs yet):");
    for (const u of myFollowups) {
      lines.push(`• ${u.topic}${u.ping && u.ping !== slug ? ` — ask ${u.ping}` : ""}`);
    }
  }
  // If this person neither asked nor has follow-ups, skip — don't spam them.
  if (lines.length === 1) return "";
  return lines.join("\n");
}

function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

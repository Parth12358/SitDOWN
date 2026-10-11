// End-of-session hook runtime. Triggered by each agent's session-end event (Claude Code `Stop`),
// which delivers a small JSON payload on stdin: { session_id, transcript_path, cwd, ... }.
//
// Flow: read payload -> (ignore check) -> archive transcript -> parse -> resolve git context ->
// build + validate SessionRecord -> atomic write to the inbox. Every step is best-effort and the
// whole thing fails open: a capture error must never block the coding agent.
import { parseTranscript } from "../parse/index.mjs";
import { archiveTranscript, readTranscript, archiveKeyFor } from "../sweep.mjs";
import { buildSessionRecord, writeSessionRecord } from "../record.mjs";
import { validateRecord } from "../validate.mjs";
import { gitIdentity, gitRepoSlug, gitBranch, setGitDeadline } from "../git.mjs";
import { loadConfig, resolveAuthor } from "../config.mjs";
import { shouldIgnore } from "../ignore.mjs";
import { expandHome } from "../paths.mjs";

/** Read and JSON-parse the hook payload from a stream. Returns {} on any failure. */
export function readStdinJson(stream = process.stdin) {
  return new Promise((resolve) => {
    let buf = "";
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      try {
        resolve(buf.trim() ? JSON.parse(buf) : {});
      } catch {
        resolve({});
      }
    };
    stream.setEncoding("utf8");
    stream.on("data", (c) => (buf += c));
    stream.on("end", finish);
    stream.on("error", finish);
    // Hooks run detached; never hang waiting for an EOF that doesn't come.
    setTimeout(finish, 1500).unref?.();
  });
}

/**
 * @param {object} payload  hook payload (parsed)
 * @param {{ agent?: string, now?: Date }} [opts]
 * @returns {Promise<{ written: string|null, record?: object, reason?: string }>}
 */
export async function runSessionEnd(payload = {}, opts = {}) {
  const agent = opts.agent || payload.agent || null;
  const transcriptPath = expandHome(payload.transcript_path || payload.transcriptPath || "");
  const cwd = payload.cwd || payload.workspace || null;

  if (!transcriptPath) return { written: null, reason: "no transcript_path in payload" };

  // Respect .sitdownignore (repo opt-out / tool opt-out).
  if (shouldIgnore({ cwd: cwd || "", agent: agent || "" })) {
    return { written: null, reason: "ignored by .sitdownignore" };
  }

  const text = readTranscript(transcriptPath);
  if (text === null) return { written: null, reason: `unreadable transcript: ${transcriptPath}` };

  const parsed = parseTranscript({ agent, transcriptPath, text });

  // Archive a copy locally (never uploaded).
  let archivedPath = transcriptPath;
  try {
    const key = archiveKeyFor(parsed.agent, parsed.sessionKey);
    archivedPath = archiveTranscript({ agent: parsed.agent, sessionKey: key, text });
  } catch {
    /* archive is best-effort; keep the original path */
  }

  // Resolve git context from the session's working dir.
  const resolvedCwd = cwd || parsed.cwd || "";
  const config = loadConfig();
  const identity = resolvedCwd ? gitIdentity(resolvedCwd) : { name: null, email: null };
  const author = resolveAuthor(identity, config.people);
  const repo = resolvedCwd ? gitRepoSlug(resolvedCwd) : "";
  const branch = parsed.branch || (resolvedCwd ? gitBranch(resolvedCwd) : "") || "";

  const record = buildSessionRecord(parsed, {
    author,
    repo,
    branch,
    cwd: resolvedCwd,
    transcriptPath: archivedPath,
    locate: true,
  });

  const v = await validateRecord("session", record);
  if (!v.valid) {
    // Still write it — downstream gets a (possibly imperfect) record rather than nothing —
    // but make the schema gap visible.
    console.error("[sitdown] SessionRecord failed schema validation:", JSON.stringify(v.errors));
  }

  const written = writeSessionRecord(record);
  return { written, record };
}

/** CLI entry: read stdin, run, exit 0 no matter what (bounded by a hard timer). */
export async function sessionEndMain(argv = []) {
  // Budget the blocking git chain to 4s; a hard exit at 5s is the backstop for the async tail.
  setGitDeadline(4000);
  const guard = setTimeout(() => process.exit(0), 5000);
  guard.unref?.();
  const agent = argValue(argv, "--agent");
  const payload = await readStdinJson();
  const res = await runSessionEnd(payload, { agent });
  if (res.written) console.error(`[sitdown] captured session -> ${res.written}`);
  else console.error(`[sitdown] no session captured: ${res.reason}`);
  clearTimeout(guard);
}

function argValue(argv, flag) {
  const i = argv.indexOf(flag);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
}

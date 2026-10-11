// LLM adapter: one interface, three backends.
//   claude_cli (default): shells out to `claude -p … --output-format json` — uses the Claude Code
//                         session you're already signed into, so no LLM_API_KEY is needed.
//   cloud:                Anthropic API, key from LLM_API_KEY, model from LLM_MODEL (default claude-opus-4-8).
//   ollama:               local, POST ${OLLAMA_HOST}/api/chat with format:"json".
// All ask for strict JSON and parse it; validation + retry live in summarize() (PRD-B).
import { spawn } from "node:child_process";
import Anthropic from "@anthropic-ai/sdk";
import type { LlmBackend } from "@sitdown/contracts";

export interface Llm {
  /** Return a parsed JSON value for `prompt`. Throws if the model's output isn't valid JSON. */
  completeJson(prompt: string, schema?: object): Promise<unknown>;
}

const SYSTEM =
  "You are a precise engineering-documentation summarizer. " +
  "Respond with ONLY a single JSON object matching the requested shape. " +
  "No markdown fences, no commentary before or after.";

/** Pull the first balanced JSON object out of a model response and parse it. */
function parseJsonObject(text: string): unknown {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("LLM response contained no JSON object");
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

/** Run `claude -p` headlessly, prompt on stdin (avoids argv length limits), JSON envelope out. */
function defaultClaudeRun(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const bin = process.env.CLAUDE_BIN || "claude";
    // Keep args space-free and the system instruction on stdin so this works under a Windows shell.
    const args = ["-p", "--output-format", "json"];
    const child = spawn(bin, args, { stdio: ["pipe", "pipe", "pipe"], shell: process.platform === "win32" });
    let out = "";
    let err = "";
    const timeoutMs = Number(process.env.CLAUDE_TIMEOUT_MS) || 120_000;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("claude -p timed out"));
    }, timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) =>
      reject(new Error(`could not run \`${bin} -p\` (is Claude Code installed?): ${e.message}`)),
    );
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`claude -p exited ${code}: ${err.slice(0, 500)}`));
      // `--output-format json` prints an envelope { type, subtype, result, ... }; result is the text.
      try {
        const env = JSON.parse(out) as { result?: unknown };
        if (env && typeof env === "object" && typeof env.result === "string") return resolve(env.result);
      } catch {
        /* not an envelope — fall through and parse the raw text */
      }
      resolve(out);
    });
    child.stdin.write(`${SYSTEM}\n\n${prompt}`);
    child.stdin.end();
  });
}

/** `claude -p` backend. `runner` is injectable for tests; it returns the model's raw text. */
export function claudeCliLlm(runner: (prompt: string) => Promise<string> = defaultClaudeRun): Llm {
  return {
    async completeJson(prompt) {
      return parseJsonObject(await runner(prompt));
    },
  };
}

function cloudLlm(): Llm {
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL || "claude-opus-4-8";
  return {
    async completeJson(prompt) {
      if (!apiKey) throw new Error("LLM_API_KEY is not set (cloud backend)");
      const client = new Anthropic({ apiKey });
      const msg = await client.messages.create({
        model,
        max_tokens: 4096,
        system: SYSTEM,
        messages: [{ role: "user", content: prompt }],
      });
      const text = msg.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      return parseJsonObject(text);
    },
  };
}

function ollamaLlm(): Llm {
  const host = (process.env.OLLAMA_HOST || "http://localhost:11434").replace(/\/$/, "");
  const model = process.env.OLLAMA_MODEL || "llama3.1";
  return {
    async completeJson(prompt) {
      const res = await fetch(`${host}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model,
          stream: false,
          format: "json",
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: prompt },
          ],
        }),
      });
      if (!res.ok) throw new Error(`Ollama request failed: ${res.status} ${res.statusText}`);
      const data = (await res.json()) as { message?: { content?: string } };
      const content = data.message?.content ?? "";
      return parseJsonObject(content);
    },
  };
}

export function makeLlm(backend: LlmBackend): Llm {
  if (backend === "ollama") return ollamaLlm();
  if (backend === "cloud") return cloudLlm();
  return claudeCliLlm(); // claude_cli (default)
}

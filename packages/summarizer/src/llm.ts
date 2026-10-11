// LLM adapter: one interface, two backends.
//   cloud (default): Anthropic API, key from LLM_API_KEY, model from LLM_MODEL (default claude-opus-4-8).
//   ollama:          local, POST ${OLLAMA_HOST}/api/chat with format:"json".
// Both ask for strict JSON and parse it; validation + retry live in summarize() (PRD-B).
import Anthropic from "@anthropic-ai/sdk";

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

export function makeLlm(backend: "cloud" | "ollama"): Llm {
  return backend === "ollama" ? ollamaLlm() : cloudLlm();
}

// @sitdown/mcp — Keewano event store (best-effort).
// Reads delegate to the local SQLite mirror; writes dual-write to Keewano's REST ingress.
// Keewano's query/read APIs are not wired in this build — see README "What's mocked".
import type { SitdownEvent } from "@sitdown/contracts";
import { uuidv5 } from "../uuid.js";
import type { EventStore, OpenThread, RankedAuthor } from "./index.js";

const INGRESS = "https://api.keewano.com/event/ingress/v1/json";

export class KeewanoEventStore implements EventStore {
  readonly kind = "keewano";
  constructor(private readonly mirror: EventStore) {}

  authorsRanked(feature: string, people: Record<string, string[]>): Promise<RankedAuthor[]> {
    return this.mirror.authorsRanked(feature, people);
  }

  openThreads(feature?: string): Promise<OpenThread[]> {
    return this.mirror.openThreads(feature);
  }

  async append(author: string | undefined, events: SitdownEvent[]): Promise<void> {
    // Keep the local mirror authoritative for reads.
    await this.mirror.append(author, events);

    const pat = process.env.KEEWANO_PAT;
    if (!pat) return;
    const entity = uuidv5(author ?? "unknown");
    const ts = new Date().toISOString();
    const payload = {
      installId: entity,
      events: events.map((ev) => ({
        name: ev.name,
        value: "value" in ev ? (ev as { value: unknown }).value : null,
        ts,
      })),
    };
    try {
      const res = await fetch(INGRESS, {
        method: "POST",
        headers: { "content-type": "application/json", "k-token": pat },
        body: JSON.stringify(payload),
      });
      if (!res.ok) console.error(`[sitdown-mcp] keewano ingress ${res.status}`);
    } catch (e) {
      console.error(`[sitdown-mcp] keewano ingress failed: ${(e as Error).message}`);
    }
  }
}

// Keewano event backend — REST ingress.
//
// STATUS: implemented but UNTESTED until KEEWANO_API_KEY/KEEWANO_PAT are provided
// (none in the current env). Guarded so a missing key fails with a clear message rather
// than silently dropping events. Set SITDOWN_KEEWANO_DRYRUN=1 to log the payload shape
// instead of sending — useful for verifying the request without creds.
//
// Docs: https://docs.keewano.com/getting-started/speedhacks-quickstart
import type { SitdownEvent } from "@sitdown/contracts";
import type { EventSink } from "../events.js";
import { entityFor } from "./entity.js";

const INGRESS_URL = "https://api.keewano.com/event/ingress/v1/json";

/** Custom event IDs (Keewano reserves <2000; ours start at 2000). */
export const EVENT_IDS: Record<SitdownEvent["name"], number> = {
  FeatureTouched: 2000,
  AgentSession: 2001,
  CommitMade: 2002,
  AuthorType: 2003,
  DecisionRecorded: 2004,
  HumanIntervened: 2005,
  QuestionAsked: 2006,
  AnswerFound: 2007,
  AnswerLatencyMs: 2008,
  StandupMinutes: 2009,
};

interface IngressRow {
  event_id: number;
  event_name: string;
  install_id: string;
  value: string | number | boolean | null;
  ts: string;
}

function rowFor(author: string, event: SitdownEvent, ts: string): IngressRow {
  return {
    event_id: EVENT_IDS[event.name],
    event_name: event.name,
    install_id: entityFor(author),
    value: "value" in event ? (event as { value: string | number | boolean }).value : null,
    ts,
  };
}

export class KeewanoSink implements EventSink {
  private readonly apiKey: string | undefined;
  private readonly dryRun: boolean;
  private buffer: IngressRow[] = [];

  constructor() {
    this.apiKey = process.env.KEEWANO_API_KEY || process.env.KEEWANO_PAT;
    this.dryRun = process.env.SITDOWN_KEEWANO_DRYRUN === "1";
  }

  async emit(author: string, event: SitdownEvent, ts: string): Promise<void> {
    this.buffer.push(rowFor(author, event, ts));
  }

  async flush(): Promise<void> {
    if (!this.buffer.length) return;
    const rows = this.buffer;
    this.buffer = [];

    if (this.dryRun) {
      console.log(`[keewano:dry-run] would POST ${rows.length} events to ${INGRESS_URL}`);
      console.log(JSON.stringify(rows, null, 2));
      return;
    }
    if (!this.apiKey) {
      throw new Error(
        "KEEWANO_API_KEY/KEEWANO_PAT not set. Set a key, switch event_store to 'sqlite', " +
          "or run with SITDOWN_KEEWANO_DRYRUN=1 to preview the payload.",
      );
    }

    const res = await fetch(INGRESS_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ events: rows }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Keewano ingress failed: ${res.status} ${res.statusText} ${text}`);
    }
  }
}

#!/usr/bin/env node
// @sitdown/voice — E. CLI.
//   voice call --to <number> --attendees sam,alex [--dry-run] [--mcp <url>] [--from <id>]
//   voice standup --sms [--attendees sam,alex] [--dry-run] [--mcp <url>] [--from <id>]
//   voice connect-mcp --url <publicUrl> [--name <name>]
// Reads D's docs via the MCP endpoint; adds no new data. --dry-run / no DIAL_API_KEY => offline mock.
import { loadConfig, resolveAttendees, type Config } from "./config.js";
import { makeMcpClient } from "./mcp.js";
import { makeDialer, type Dialer } from "./dial.js";
import { buildBriefing } from "./briefing.js";
import { runFollowup } from "./followup.js";
import { runStandupSms } from "./standup-sms.js";

interface Flags {
  _: string[];
  to?: string;
  attendees?: string;
  mcp?: string;
  from?: string;
  url?: string;
  name?: string;
  "max-seconds"?: string;
  "wake-name"?: string;
  sms?: boolean;
  "dry-run"?: boolean;
  tools?: boolean;
  help?: boolean;
}

function parseArgs(argv: string[]): Flags {
  const flags: Flags = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2) as keyof Flags;
      const next = argv[i + 1];
      const boolFlags = ["sms", "dry-run", "tools", "help"];
      const store = flags as unknown as Record<string, unknown>;
      if (boolFlags.includes(key as string) || next === undefined || next.startsWith("--")) {
        store[key as string] = true;
      } else {
        store[key as string] = next;
        i++;
      }
    } else {
      flags._.push(a);
    }
  }
  return flags;
}

function attendeeList(flags: Flags, config: Config): string[] {
  if (flags.attendees) return flags.attendees.split(",").map((s) => s.trim()).filter(Boolean);
  return Object.keys(config.people ?? {});
}

/** Resolve phones; for offline mocks, synthesize placeholders so the recap still demonstrates SMS. */
function resolvePhones(
  config: Config,
  slugs: string[],
  mock: boolean,
): Array<{ slug: string; phone: string }> {
  const { resolved, missing } = resolveAttendees(config, slugs);
  if (missing.length) {
    if (mock) {
      missing.forEach((slug, i) => resolved.push({ slug, phone: `+1555000${1000 + i}` }));
    } else {
      console.warn(`! No phone number in config for: ${missing.join(", ")} — they won't get an SMS.`);
    }
  }
  return resolved;
}

async function resolveFromNumber(dialer: Dialer, flags: Flags): Promise<string> {
  if (flags.from) return flags.from;
  const numbers = await dialer.listNumbers();
  if (!numbers.length) throw new Error("No Dial numbers available; pass --from <numberId>.");
  return numbers[0].id;
}

async function cmdCall(flags: Flags): Promise<void> {
  if (!flags.to) throw new Error("`voice call` requires --to <number> (the meeting phone).");
  const config = await loadConfig();
  const attendees = attendeeList(flags, config);
  const dryRun = !!flags["dry-run"];

  const mcp = makeMcpClient({ mcpUrl: flags.mcp });
  const dialer = makeDialer({ mock: dryRun });
  const usingMock = dryRun || !process.env.DIAL_API_KEY;

  const briefing = await buildBriefing(attendees, mcp, {
    wakeName: flags["wake-name"],
    toolsAvailable: !!flags.tools,
  });

  console.log(`\n=== System prompt (${briefing.length} chars) ===\n${briefing}\n`);

  const fromNumberId = await resolveFromNumber(dialer, flags);
  console.log(
    `Placing call to ${flags.to} from ${fromNumberId} (attendees: ${attendees.join(", ") || "none"})` +
      `${usingMock ? " [MOCK]" : ""}`,
  );

  const call = await dialer.makeCall({
    to: flags.to,
    fromNumberId,
    outboundInstruction: briefing,
    maxDurationSeconds: flags["max-seconds"] ? Number(flags["max-seconds"]) : 900,
    metadata: { attendees },
  });
  console.log(`Call ${call.id} — ${call.status.state}. Waiting for it to end…`);

  const ended = await dialer.waitForCallEnd(call.id);
  console.log(`Call ended: ${ended.status.label ?? ended.status.state} (${ended.duration ?? "?"}s)\n`);
  if (ended.transcript) console.log(`--- Transcript ---\n${ended.transcript}\n`);

  const phones = resolvePhones(config, attendees, usingMock);
  const report = await runFollowup(ended, mcp, dialer, phones, { fromNumberId });

  console.log("--- Follow-up ---");
  console.log(`Questions: ${report.qas.length}, unanswered: ${report.unanswered.length}`);
  for (const u of report.unanswered) {
    console.log(`  logged gap: "${u.topic}"${u.ping ? ` -> ping ${u.ping}` : ""}`);
  }
  for (const s of report.smsSent) {
    console.log(`\n  SMS -> ${s.slug} (${s.to}):\n${indent(s.body)}`);
  }
  if (!report.smsSent.length) console.log("  (no SMS sent)");
}

async function cmdStandup(flags: Flags): Promise<void> {
  const config = await loadConfig();
  const attendees = attendeeList(flags, config);
  const dryRun = !!flags["dry-run"];
  const usingMock = dryRun || !process.env.DIAL_API_KEY;

  const mcp = makeMcpClient({ mcpUrl: flags.mcp });
  const dialer = makeDialer({ mock: dryRun });
  const fromNumberId = await resolveFromNumber(dialer, flags);
  const phones = resolvePhones(config, attendees, usingMock);

  console.log(`SMS standup for ${attendees.join(", ") || "team"}${usingMock ? " [MOCK]" : ""}\n`);
  const report = await runStandupSms(phones, mcp, dialer, { fromNumberId });

  for (const p of report.perPerson) {
    console.log(`SMS -> ${p.slug} (${p.to}):\n${indent(p.body)}\n`);
  }
  console.log(`Team summary -> ${report.summarySentTo.length} recipient(s):\n${indent(report.summary)}`);
}

async function cmdConnectMcp(flags: Flags): Promise<void> {
  if (!flags.url) throw new Error("`voice connect-mcp` requires --url <publicUrl> (a reachable MCP endpoint).");
  const apiKey = process.env.DIAL_API_KEY;
  if (!apiKey) throw new Error("connect-mcp needs a real Dial account (DIAL_API_KEY).");
  const dialer = makeDialer({});
  const res = await dialer.connectContextMcp({ name: flags.name ?? "sitdown", url: flags.url });
  console.log(
    `Connected Context MCP "${flags.name ?? "sitdown"}" -> ${flags.url}` +
      `${res.id ? ` (id ${res.id})` : ""}.\nIts tools are now callable by the voice agent on future calls.`,
  );
}

function indent(s: string): string {
  return s.split("\n").map((l) => `    ${l}`).join("\n");
}

function printHelp(): void {
  console.log(
    [
      "voice — SitDOWN meeting assistant (Agent E)",
      "",
      "Commands:",
      "  voice call --to <number> --attendees sam,alex [--dry-run] [--mcp <url>] [--from <id>]",
      "             [--max-seconds N] [--wake-name NAME] [--tools]",
      "  voice standup --sms [--attendees sam,alex] [--dry-run] [--mcp <url>] [--from <id>]",
      "  voice connect-mcp --url <publicUrl> [--name <name>]",
      "",
      "Env: DIAL_API_KEY (real calls/SMS), MCP_HTTP_URL (D's endpoint; else offline mock).",
      "No DIAL_API_KEY or --dry-run => everything runs offline against mock docs.",
    ].join("\n"),
  );
}

async function main(argv: string[]): Promise<void> {
  const flags = parseArgs(argv);
  const cmd = flags._[0];
  if (flags.help || !cmd || cmd === "help") return printHelp();
  switch (cmd) {
    case "call":
      return cmdCall(flags);
    case "standup":
      return cmdStandup(flags);
    case "connect-mcp":
      return cmdConnectMcp(flags);
    default:
      printHelp();
      throw new Error(`Unknown command: ${cmd}`);
  }
}

main(process.argv.slice(2)).catch((e) => {
  console.error(`\nError: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});

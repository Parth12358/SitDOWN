// CLI dispatch for the `sitdown` capture command.
//
// Public:   install-hooks | install-git-hook | --doctor | --uninstall | --dry-run
// Internal: session-end (agent session-end hook) | post-commit (git hook)
//
// Fail-open is enforced by bin/sitdown.mjs (any throw -> exit 0). Here we just dispatch.
import { existsSync, readdirSync } from "node:fs";
import {
  installHooks,
  uninstallHooks,
  detectAgents,
} from "./install/agents.mjs";
import { installGitHook, uninstallGitHook } from "./install/git-hook.mjs";
import { sessionEndMain } from "./hooks/session-end.mjs";
import { postCommitMain } from "./hooks/post-commit.mjs";
import { homeDir, inboxSessions, inboxCommits, configPath } from "./paths.mjs";

function hasFlag(argv, flag) {
  return argv.includes(flag);
}

function count(dir) {
  try {
    return readdirSync(dir).filter((f) => f.endsWith(".json")).length;
  } catch {
    return 0;
  }
}

function printReport(title, rows) {
  console.log(title);
  for (const r of rows) {
    const extra = r.backup ? `  (backup: ${r.backup})` : "";
    console.log(`  - ${r.agent ?? r.status}: ${r.status}${r.file ? `  ${r.file}` : ""}${extra}`);
    if (r.note && /experimental/.test(r.status)) console.log(`      note: ${r.note}`);
  }
}

export async function main(argv) {
  const cmd = argv[0];
  const dryRun = hasFlag(argv, "--dry-run");

  switch (cmd) {
    case "install-hooks": {
      const report = installHooks({ dryRun });
      printReport(dryRun ? "sitdown: install-hooks (dry run)" : "sitdown: installed session hooks", report);
      return;
    }

    case "install-git-hook": {
      const res = installGitHook({ dryRun });
      printReport(dryRun ? "sitdown: install-git-hook (dry run)" : "sitdown: git hook", [res]);
      return;
    }

    case "session-end":
      // Internal: invoked by an agent's end-of-session hook with payload on stdin.
      await sessionEndMain(argv.slice(1));
      return;

    case "post-commit":
      // Internal: invoked by the repo's git post-commit hook.
      await postCommitMain(argv.slice(1));
      return;

    case "--doctor": {
      console.log("sitdown doctor");
      console.log(`  home:            ${homeDir()}  ${existsSync(homeDir()) ? "(exists)" : "(not created yet)"}`);
      console.log(`  config:          ${configPath()}  ${existsSync(configPath()) ? "(found)" : "(missing)"}`);
      console.log(`  inbox/sessions:  ${count(inboxSessions())} record(s)`);
      console.log(`  inbox/commits:   ${count(inboxCommits())} record(s)`);
      console.log("  agents:");
      for (const a of detectAgents()) {
        console.log(
          `    - ${a.label}: ${a.present ? "detected" : "not found"}, hook ${a.installed ? "INSTALLED" : "not installed"}  (${a.file})`
        );
      }
      return;
    }

    case "--uninstall": {
      const agentReport = uninstallHooks({ dryRun });
      printReport(dryRun ? "sitdown: --uninstall agent hooks (dry run)" : "sitdown: removed agent hooks", agentReport);
      const git = uninstallGitHook({ dryRun });
      printReport("sitdown: git hook (current repo)", [git]);
      return;
    }

    case "--dry-run":
      // `--dry-run` alone previews install-hooks.
      printReport("sitdown: install-hooks (dry run)", installHooks({ dryRun: true }));
      return;

    default:
      console.log(
        "usage: sitdown <install-hooks|install-git-hook|--doctor|--uninstall|--dry-run>\n" +
          "       (internal: session-end, post-commit)"
      );
  }
}

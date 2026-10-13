---
id: d-0048
kind: decision
statement: Measured facts about Claude Code 2.1.296 on this host (probes 2026-10-13, `packages/drivers/__tests__/probes/RESULTS.md`) that the Claude driver must build on — (1) `--setting-sources ""` loads no settings; there is no `none` keyword; a project hook does not fire under it. (2) `--max-budget-usd` is enforced on subscription too: a one-word prompt on the default model exceeds 0.05 USD and returns `subtype: error_max_budget_usd` with exit 0 and no `result`; budgets must be set per model and `subtype` must be checked, not the exit code. (3) On Windows the shell tool is `PowerShell`, not `Bash`; hook matchers and allow-lists must name both. (4) Hooks: `onFailure: "block"` + `timeout` are accepted; exit 2 blocks; a missing hook script blocks only when `onFailure: block` is set, otherwise the tool runs (fail-open). (5) ACP adapter `@agentclientprotocol/claude-agent-acp` 0.89.1 + sdk 1.8.0: auth arrives as an `_auth/status_update` notification (`kind: account`), not in `initialize`; `allowDangerouslySkipPermissions: false` removes `bypassPermissions` from the available modes; `session/request_permission` reaches our client and a deny stops the tool. (6) ACP `_meta.claudeCode.options.settingSources: []` does NOT stop the adapter reading the user's `settings.json`: `defaultMode: acceptEdits` leaked and a file write ran without a permission request. `strictMcpConfig` and user-hook isolation on ACP are still unverified.
source: { type: probe, ref: packages/drivers/__tests__/probes/RESULTS.md (pnpm probes, 9/9, run by orchestrator 2026-10-13) }
author: director
origin: measured
status: superseded
valid_from: 2026-10-13
valid_to: 2026-10-13
superseded_by: d-0053
supersedes: null
tags: [execution-plane, drivers, claude, acp, hooks, probes]
pinned: true
---

Amends details in d-0031 (syntax), d-0033 (confirmed), d-0035 (auth
location, set_mode requirement; see d-0049 for the isolation decision).
Re-run with `pnpm probes` after every Claude Code upgrade.

---
id: d-0057
kind: decision
statement: Measured 2026-10-13 (`pnpm probes`, 15/15 after two assertion updates; host Claude Code 2.1.296, ACP bundled 2.1.293). (1) Under ACP the PreToolUse hook's `tool_use_id` equals the ACP `toolCallId`, so the Claude driver joins receipts by id; the receipt cross-check stays on by default. (2) A budget-exhausted `claude -p` returns `subtype: error_max_budget_usd`, `is_error: true`, no `result`, and may exit 0 or 1; drivers classify by `subtype`, never by exit code (amends d-0053's carried-over "exit 0"). (3) The ACP adapter filters an escalating `defaultMode` coming from the project `.claude/settings.json` (session starts in `default`); the user-settings leak (d-0053, from d-0048 item 6) is a different source, so `session/set_mode default` after every new/load stays required (d-0049). Still unmeasured: PreToolUse for `mcp__forge__*` under ACP, project `permissions.allow` before `request_permission`, ACP budget/turn-cap wording.
source: { type: probe, ref: "packages/drivers/__tests__/probes/RESULTS.md, pnpm probes run by orchestrator 2026-10-13" }
author: director
origin: measured
status: active
valid_from: 2026-10-13
superseded_by: null
supersedes: null
tags: [execution-plane, drivers, claude, acp, probes, receipts]
pinned: true
---

Amends d-0053 item on budget exit code. Re-run `pnpm probes` on host CLI
upgrade or adapter/SDK bump (d-0053).

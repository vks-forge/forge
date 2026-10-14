---
id: d-0074
kind: decision
statement: A pipeline node may be a script gate (`gate: script`, `run: <command>`, `timeout`, `when`, outcome edges): a user-configured deterministic check such as a license check, `pnpm audit` or a benchmark. Exit code 0 = pass, anything else = fail with its output as the report. It runs in the worktree with the same stripped, allowlisted environment and PATH-resolved executable as G1's project checks, under a timeout. Custom steps are scripts, not in-process plugins.
source: { type: chat, ref: "2026-10-14 grill x-0011 Q9: user chose 'Yes, script gates (Rec.)'" }
author: user
origin: owner
status: active
valid_from: 2026-10-14
superseded_by: null
supersedes: null
tags: [pipelines, gates, scripts, x-0011]
pinned: false
---

Director condition for the brief: a script gate's file (e.g. `scripts/check-licenses.mjs`)
must be run from the base commit / main checkout, or be covered by the config
guard, so a Worker cannot edit the script that judges it. Rejected: built-in
gates only (code change per check); TypeScript plugins in Forge's process
(unbounded trust).

---
id: d-0161
kind: decision
statement: Forge must be able to run its Workers (the harness CLIs - Claude Code, Codex, Pi, OpenCode) inside a sandbox with the project's full codebase as the run's git worktree; the sandbox layer must work on Windows, macOS and Linux hosts and sit behind an adapter interface so any third-party server or sandbox provider can be attached as a new adapter.
source: { type: chat, ref: "2026-10-16 user: \"i want you to do reverse enginnerning on https://github.com/davidondrej/cloudroom-core and any similar type of project that can run agents(claude code, pi, codex etc) in a sanbox. this should support running on windows computer, mac os and linux, also this should be adapter like interface so we cana ttach any third part server provider to this also. i need this to run the Forge harness on this with full codebase as worktree.\" then \"add this to memory\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-16
superseded_by: null
supersedes: null
amends: [d-0005, d-0117]
tags: [execution-plane, isolation, sandbox, workers, worktrees, platforms, providers]
pinned: false
---

This is a requirement, not a schedule. The card-first build (d-0160) keeps
priority. The design is proposed in x-0015, and the phased plan is in
`docs/briefs/worker-sandbox-plan.md`.

The research behind it:
- `research/notes/final_report_agent-sandboxes-for-forge.md`, with sources
  `cloudroom-core-reverse-engineering`, `local-agent-sandboxes-survey`,
  `remote-sandbox-providers-survey` and `forge-sandbox-seams-map`.
- Report page: https://claude.ai/artifact/4KUZJzipBMNF7xjR3MuWei

How it relates to existing records:
- d-0005: isolation stays a per-lane choice, and this adds the provider seam.
- d-0117: this is the "real isolation" work item.

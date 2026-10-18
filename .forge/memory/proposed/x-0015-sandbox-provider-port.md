---
id: x-0015
kind: proposal
statement: Meet d-0161 with one new core port, `SandboxProvider`, beneath the unchanged `WorkerDriver`. The port has declared capabilities, adapters in `packages/sandboxes/<name>/` chosen by config, and a `host` identity adapter first. Three workspace modes travel as a `gitMode` capability. An in-box forge relay multiplexes ACP, hook RPC and MCP over the provider's exec stdio. Credentials prefer a host-side injecting proxy. G1 checks run inside the box. Backend ladder is srt, then docker / microsandbox / wsl2, then ssh-vm, then E2B / Vercel / Cloudflare. Phases P0-P10 are in docs/briefs/worker-sandbox-plan.md.
source: { type: research, ref: "2026-10-16 research/notes/final_report_agent-sandboxes-for-forge.md (cloudroom-core teardown, local + remote sandbox surveys, Forge seams map)" }
author: director
origin: research
status: pending
confidence: 0.7
valid_from: 2026-10-16
tags: [execution-plane, isolation, sandbox, providers, worktrees, security]
---

**Why.**
- No surveyed project combines cross-OS hosts, pluggable providers and a policy
  door outside the box.
- cloudroom-core is Linux-only and single-host, and it runs every harness in full
  bypass under one shared agent user.
- The relay works on any provider that offers exec with stdin. Nothing connects
  into Forge, so loopback-only (d-0093) holds. Bundle in/out keeps the box free of
  clone and push credentials (d-0012).

**Relation to existing records.**
- d-0059 and d-0098: three workspace modes.
  - `host-paths`: srt and Codex sandboxes.
  - `mount-worktree+commondir`: worktrees created with
    `git worktree add --relative-paths`, git 2.48 or later.
  - `bundle`: remote boxes.
- d-0033: hooks travel over the relay.
- d-0031 and d-0087: in a box, `login` mode is replaced by proxy injection or a
  per-run harness home.
- r-0005: no bypass inside boxes.

**Unverified.**
- The relay design needs a spike (P1).
- Subscription OAuth through a base-URL proxy is untested.
- Pricing for several providers is unconfirmed.

**Open questions.** Seven, listed in the plan under "Open decisions for P0".

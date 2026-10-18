---
kind: outcome
date: 2026-10-16
session: reverse engineering of cloudroom-core and agent sandboxes (research only, no code)
---

# Worker sandbox research

## Done
- Reverse-engineered `davidondrej/cloudroom-core` @0735d68 (v0.1.61, Apache-2.0).
  - It is a Linux-only privileged Rust daemon that runs Codex, Claude, Pi,
    Cursor, OpenCode and others as stdio subprocesses.
  - Every harness runs in full bypass under one shared agent user. Credentials
    are passed as env vars.
  - The real boundary is one VM per agent, provisioned by a closed web app. There
    is no provider interface and no worktrees.
  - Worth copying: claim before spawn, "never resend unknown work", asserting the
    harness mode at startup, native-transcript resume, fake harness binaries.
- Surveyed local sandboxes:
  - srt, the Codex sandbox, Docker `sbx`, microsandbox, devcontainers,
    container-use, OpenHands, Sculptor, rivet sandbox-agent, vibekit.
  - Also 17 remote providers and the ComputeSDK, rivet, vibekit and OpenHands
    interfaces.
  - Only srt (Windows alpha) and the Codex sandbox isolate natively on all three
    OSes without a VM.
- Mapped Forge's sandbox seams and found 13 places where it assumes the Worker
  runs on the host.
  - `RunRequest.isolation` exists but is hardcoded to `host`.
  - The hook server is loopback-only.
  - The MCP server opens the host DB.
  - `canon()` lowercases every path.
  - G1 checks run in the host shell.
- Research docs added, all in `research/notes/`:
  - `final_report_agent-sandboxes-for-forge.md`
  - `cloudroom-core-reverse-engineering.md`
  - `local-agent-sandboxes-survey.md`
  - `remote-sandbox-providers-survey.md`
  - `forge-sandbox-seams-map.md`
- Report artifact: https://claude.ai/artifact/4KUZJzipBMNF7xjR3MuWei

## Decided
- d-0161 (user): Workers can run in a cross-OS sandbox with the full codebase as
  a worktree, behind a provider adapter interface.

## Pending
- x-0015 (director): the `SandboxProvider` port design, needing approval.
- The plan `docs/briefs/worker-sandbox-plan.md` (P0-P10) waits for the seven P0
  decisions. It is not scheduled; d-0160 keeps priority.
- Nothing is committed yet. These files are untracked in the working tree.

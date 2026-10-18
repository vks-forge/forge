# Proposed plan: Worker sandboxes (d-0161, x-0015)

Status: **proposed, not approved, not scheduled.**
- The card-first flow build (d-0160) keeps priority.
- This plan exists so the work can be picked up later without redoing the research.
- The research is in `research/notes/final_report_agent-sandboxes-for-forge.md` and its four
  source notes:
  - `cloudroom-core-reverse-engineering`
  - `local-agent-sandboxes-survey`
  - `remote-sandbox-providers-survey`
  - `forge-sandbox-seams-map`
- Report page: https://claude.ai/artifact/4KUZJzipBMNF7xjR3MuWei

## Goal (d-0161)

Forge Workers run their harness (Claude Code first, then Codex, OpenCode and Pi) inside a
sandbox:
- with the project's full codebase as the run's git worktree;
- on Windows, macOS and Linux hosts;
- behind an adapter interface, so any third-party server or sandbox provider can be added as a
  new folder.

The sandbox must not weaken any existing door:
- `admit()`, receipts and the HMAC stay on the host;
- no push or clone credentials in the box (d-0012);
- loopback-only server (d-0093);
- no bypass permissions (r-0005).

## Shape (from x-0015)

- **`SandboxProvider` port in `core`.** One folder per backend under a new adapter package
  `packages/sandboxes/`, chosen by config rows per lane (d-0085, rule 9).
  - Required provider calls: `capabilities, preflight, create, attach, list, destroy`.
  - Required handle calls: `exec` (streamed output + stdin), `wait, kill`, tar
    `putArchive/getArchive`, `toSandboxPath/toHostPath`, `status, stop`.
  - Optional, declared only: `pty, pause/resume, snapshot/fork, ports, egress, credential
    injection, gpu`.
- **`gitMode` capability.**
  - `host-paths`: the process sandbox works on host paths.
  - `mount-worktree+commondir`: containers and VMs; the worktree is created with
    `--relative-paths`.
  - `bundle`: remote boxes; a git bundle goes in, and a bundle of `<base>..HEAD` comes out and
    is validated on the host.
- **In-box forge relay.** One process started by `exec`. It multiplexes ACP, hook RPC and MCP
  stdio over that exec's stdin/stdout. The MCP server and the DB stay on the host.
- **Drivers unchanged in contract.**
  - The `SpawnFn` seam and `G1Deps.runCommand` route through `sandbox.exec`.
  - `RunRequest.isolation` (`core/src/schemas/run.ts:56`) becomes provider id + profile.

## Phases

Each phase is one slice with its own brief, red-green where major (d-0015), and `pnpm check`
green before merge (d-0119). The order is fixed; scope inside a phase is not.

| # | Slice | Delivers | Exit check |
|---|---|---|---|
| P0 | Decisions | Owner answers the open questions below. x-0015 approved, or amended → `decisions/`. | Records written; this plan updated |
| P1 | Spike: relay over exec | Throwaway prototype on Docker, then on one remote provider (E2B or Cloudflare). ACP + hook + MCP multiplexed over exec stdio. A Claude run passes a hook-gated tool call and an MCP call. | Spike report in `research/notes/`; go / no-go on the relay |
| P2 | Port + `host` provider | `SandboxProvider` types/schemas in core. `packages/sandboxes/` skeleton. `host` identity adapter. `describeSandboxContract`. Engine and driver wired through the port with **no behaviour change**. | Contract test green; full Express e2e unchanged |
| P3 | Path model | `toHostPath` mapping before `admit()`. Case-sensitive canon for non-Windows sandboxes (`tools/src/shared/path.ts:21-31`). Host paths in run files written through `toSandboxPath`. | Property tests for path mapping; floors still deny outside-cwd |
| P4 | `srt` backend (`host-paths`) | `sandbox-runtime` wrapping on macOS/Linux, plus the Windows alpha behind a preflight check (one-time admin install). Network allowlist to the model endpoint only. | Contract test; live probe on Windows; Worker cannot read the data folder (closes the d-0117 file route) |
| P5 | Relay + `docker` backend (`mount-worktree+commondir`) | In-box relay, worktrees created with `--relative-paths` (git ≥ 2.48 preflight), `.git/hooks` and `config` read-only, per-run harness home, **G1 checks run in the box**. | Probe: ticket end to end in Docker on Windows (Docker Desktop) and Linux CI; G1 commands never run on the host |
| P6 | Credentials | Host-side injecting proxy (sentinel key, `ANTHROPIC_BASE_URL` via relay). Per-run home fallback. UI shows the credential tier per agent. | Probe: OAuth subscription through the proxy (unknown today); key never in box env |
| P7 | `ssh-vm` backend (`bundle`) | Lowest-common-denominator remote adapter: SSH + relay + bundle in/out, validation of returned bundles (refs, size, protected paths). | Probe against a throwaway VM; returned bundle merged through `merge()` only |
| P8 | Managed providers | E2B, Vercel or Cloudflare first (pick at P0), then Daytona/Modal. Each adapter: contract test + live probe. Orphan sweep by labels at boot. | Contract + probe per adapter |
| P9 | microsandbox / WSL2 | Optional local microVM backends for Full lane. | Contract + probe |
| P10 | UI + docs | Settings: providers, health, Test sandbox, per-lane profile. Update `PRODUCT.md`, `execution-plane.md` §6/§7, package READMEs. | Hallmark + Nielsen per screen; docs current |

## Open decisions for P0

1. **Default Windows backend.** Recommend srt (alpha) for Standard and Docker/microsandbox for
   Full. Alternatives: WSL2 or Docker everywhere.
2. **In-box relay** carrying ACP, hooks and MCP over exec stdio (keeps d-0093). Recommend yes.
3. **Three gitModes; switch worktree creation to `--relative-paths`.** Recommend yes.
4. **Credential order:** proxy injection, then per-run home, then env (labelled weakest).
   Recommend yes, after the OAuth-through-proxy probe.
5. **G1 project checks run inside the sandbox when one is active.** Recommend yes.
6. **First managed remote provider.** Cloudflare (four-harness runners, outbound credential
   interception) or E2B (claude template, PTY reattach). Re-verify pricing first.
7. **Sandboxed lanes still never skip permissions** (r-0005, d-0049). Recommend yes; the box
   is defence in depth.

## Risks and unknowns

- srt on Windows is alpha and needs admin once. Docker on Windows and macOS means Docker
  Desktop (VM, licence terms for companies).
- Subscription OAuth through a base-URL proxy is unverified.
- Remote boxes have hard lifetimes (45 min to 24 h). The scheduler must checkpoint before
  expiry.
- Large repos make bundle transfer slow. Mitigate with a prebuilt per-repo image or snapshot
  plus a delta bundle.
- The relay is a new long-lived component. Its failure must fail closed: no hook means deny.

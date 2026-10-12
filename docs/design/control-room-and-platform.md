# Control room, platform services, git policy

Status: proposed, 2026-10-12
Depends on: [`v1-decisions.md`](v1-decisions.md), [`director-core.md`](director-core.md), [`execution-plane.md`](execution-plane.md)
Evidence: repo and vendor-doc survey of 2026-10-12 (URLs in §9). Stars and
activity as of that date; items marked unverified were not confirmed.

## 1. Stack

TypeScript pnpm monorepo. One Node process hosts the engine, drivers, Factory
MCP server and HTTP/SSE API; a React UI; SQLite (WAL) for state; Bifrost as the
LLM gateway; Phoenix for traces. Everything runs on one Windows 11 machine
without Docker.

```
apps/
  server/        engine tick, drivers, Factory MCP server, SSE, merge policy
  web/           React control room (assistant-ui for threads)
packages/
  core/          ticket state machine, schemas, lane rules (pure, no I/O)
  drivers/       claude-code | codex | opencode | pi | acp  (WorkerDriver impls + renderers)
  gates/         G1–G6 runners, blast radius, canaries
  memory/        memory repo reader/writer, index, janitor
  db/            SQLite schema + migrations (Drizzle)
.factory/        skills/ agents/ rules/ intent-tests/ memory/<project>/
```

## 2. Control room UI

Build natively; lift patterns and components from Paperclip's React 19 UI
(MIT), do not embed a third-party tracker.

Rejected: Plane (10 containers), Huly (multi-service), OpenProject (Rails),
Planka (fair-code licence, API partly paid), Focalboard (abandoned June 2025),
Vibe Kanban (sunsetting). Vikunja is the only tracker with rich typed
relations and a SQLite single binary, but its Vue UI cannot be reused and it
is AGPL; keep it as a reference for relation semantics only.

Screens (each gets a Nielsen-10 pass before build; see the global CLAUDE.md
rules):

| Screen | Purpose | Key elements |
|---|---|---|
| Projects | pick a project, see health | lane distribution, escalation rate, open "needs you", spend today |
| Board | kanban per project | columns from `director-core.md` §4; card shows id, lane, tier, harness, blocked-by, cost; relations drawn as chips |
| Ticket | one ticket | thread (assistant-ui), gate results strip, diff viewer, lane/tier history, memory slice that was injected, run list with cost |
| Agents | who is running what | `claude agents`-style grouping: Needs input / Working / Completed; per-run usage |
| Needs you | the human queue | interactions awaiting answer, Tier B reviews, Tier C sign-offs, janitor PRs, canary alerts; each with a timeout countdown |
| Ledger | autonomy tiers | action class → tier → owner; promotion/demotion history as signed commits |
| Cost | spend | per run → ticket → epic → project; proxy spend vs OTel estimate; budget alerts |
| Memory | project memory | browse `decisions/`, `rejected/`, `playbook/`, `proposed/`; approve/dismiss proposals; janitor log |

Information design rule for every screen: state is visible in form (pill,
stripe, countdown), not only in numbers; the summary sits above the detail.

## 3. Live thread

- **assistant-ui** (MIT, ~12.5k stars, active) with one custom runtime adapter
  over our event bus. Its `react-pi` package already renders streaming
  reasoning, live tool results, mid-run steering and approval UI, which is the
  exact feature set a ticket thread needs. Paperclip uses it in production.
- **AG-UI** (MIT) event types as the internal wire schema so the UI stays
  swappable; it has a `claude-agent-sdk` integration directory.
- **Resumable streams are ours:** `run_events` has a sequence number; the SSE
  endpoint replays from `Last-Event-ID`. No surveyed library provides this.
- Permission prompts and Worker questions render as blocking cards in the
  thread with the same answer surface as the "Needs you" queue.

## 4. Observability

- **Contract:** OTLP. The dispatcher injects `CLAUDE_CODE_ENABLE_TELEMETRY=1`,
  `OTEL_METRICS_EXPORTER=otlp`, `OTEL_LOGS_EXPORTER=otlp`,
  `OTEL_RESOURCE_ATTRIBUTES=run_id=…,ticket=…` into every Claude Code spawn
  (repo `.claude/settings.json` cannot set these). Codex has an opt-in `[otel]`
  block. OpenCode has no documented OTel; its cost comes from the proxy.
- **Viewer:** Arize Phoenix (Elastic License 2.0, fine for internal use),
  single process, names a Claude Agent SDK integration. Langfuse (MIT core) is
  the better product but needs six services; adopt only if Docker is already
  running for other reasons.
- **Cost truth:** the gateway's spend per virtual key (§5) is authoritative;
  OTel `cost_usd` and the driver's `usage` are cross-checks. All three land in
  `run_cost` and roll up run → ticket → epic → project.

## 5. LLM gateway and per-run credentials

**Bifrost** (Apache-2.0, ~8.7k stars, active): Go binary or `npx`, SQLite
stores under `%APPDATA%\bifrost`, virtual keys (`sk-bf-*`) accepted via
`x-api-key`/`Authorization`, each with budget + reset period, token and request
rate limits, `expires_at` (fail-closed 403), `is_active`, and a REST
create/delete API at `/api/governance/virtual-keys`. Enable
`enforce_auth_on_inference`.

Per run: dispatcher creates a key with `budget = lane budget`,
`expires_at = now + turnMs`, passes it as the only model credential in the
Worker's environment, revokes it at settlement. Budget is checked before each
call, so one in-flight request can overshoot; the driver's `maxUsd` is the
second line.

Subscription/OAuth logins cannot pass through a proxy, so the gateway path
needs API keys. Per d-0031 the credential mode is per agent in Settings:
`subscription` (the harness's own login, personal-use default today),
`api_key`, or `gateway` (Bifrost, deferred). Cost on subscription is estimated
from tokens and marked `est.`; the cost pane counts subscription turns per
window and Settings can cap concurrent subscription Workers.

LiteLLM is the fallback (MIT, richer, but key management requires Postgres).
Portkey governance is mostly paid; Helicone is analytics-first; Cloudflare AI
Gateway cannot gate a local machine.

## 6. Git write policy

- Workers never hold git credentials and never push. The dispatcher pushes the
  ticket branch after settlement.
- Merges are executed by a single factory bot identity after the **merge
  policy** returns `allow`:

```
merge_policy(ticket):
  A → required gate checks green
  B → required checks green AND one human approval recorded
  C → required checks green AND approval by a signer named in ledger for the action class
record: approver, policy version, merge SHA, tier_actual  → outcomes/ + ledger
```

- If the project has a GitHub remote: bot is the only identity allowed to
  merge; rulesets with required checks and a merge queue; CODEOWNERS mirrors
  the Tier C signer list. Kodiak (AGPL) can label-gate auto-merge but is not
  required. Bors-ng is dead; Mergify is hosted.
- No remote: Gitea (MIT, Go single binary, SQLite, Windows service mode) with
  protected branches, or server-side hooks on a bare repo. Forgejo CODEOWNERS
  uses Go regexes, not globs.

## 7. Worktree manager

Thin layer of our own, modelled on Claude Code's worktree behaviour and
worktrunk's hooks:

- One worktree per ticket at `<repo>\.worktrees\<ticket-id>` (d-0039; the
  earlier `D:\wt\<ticket-id>` is superseded), created and removed behind one
  process-level mutex; `core.longpaths=true` set per repo, setup check warns
  when the host has `LongPathsEnabled=0`.
- `git worktree lock` while a run is live; stale-lock sweep each tick;
  `-p` runs do not clean up after themselves, so settlement runs `unlock` +
  `remove`.
- `.worktreeinclude` (gitignore syntax) lists files to copy into each new
  worktree (`.env`, local config). Hooks: `create`, `pre-merge`, `post-merge`.
- pnpm store on the same NTFS volume (or a ReFS Dev Drive) so installs
  hardlink; no copy-on-write on NTFS.
- Add `.worktrees/`, `.factory/data/` and `.factory/memory/*/.index/` to ignore
  lists before first dispatch; exclude `.worktrees/` from the graft indexer;
  never run edits or git in the main checkout.

## 8. Secrets and egress on one Windows box

- Master credentials in Windows Credential Manager / DPAPI, readable only by
  the dispatcher process. No vault for v1 (OpenBao and Infisical are overkill
  on one machine).
- A Worker receives exactly one credential: its Bifrost virtual key, as an
  environment variable, plus a per-run Factory MCP token.
- Egress: run Workers under a dedicated low-privilege local Windows account
  with outbound blocked by `New-NetFirewallRule -LocalUser …` except to the
  loopback gateway and MCP ports. Program-path rules are too coarse
  (`node.exe` is shared) and firewall rules cannot allowlist domains, so
  domain allowlisting, where needed, goes through mitmproxy local-capture
  mode with a trusted CA. This combination is untested; validate it in phase
  M0 before trusting it for Standard/Full lanes. WSL2 remains the stronger
  boundary where the harness supports it.

## 9. Sources

- Paperclip UI and monorepo — https://github.com/paperclipai/paperclip
- assistant-ui — https://github.com/assistant-ui/assistant-ui
- AG-UI protocol — https://github.com/ag-ui-protocol/ag-ui
- Claude Code telemetry — https://code.claude.com/docs/en/monitoring-usage
- Codex `[otel]` config — https://developers.openai.com/codex/config
- Arize Phoenix — https://github.com/Arize-ai/phoenix
- Langfuse — https://github.com/langfuse/langfuse
- Bifrost — https://github.com/maximhq/bifrost
- LiteLLM — https://github.com/BerriAI/litellm
- Kodiak — https://github.com/chdsbd/kodiak
- Gitea — https://github.com/go-gitea/gitea
- Vikunja relation kinds — https://github.com/go-vikunja/vikunja
- Claude Code worktrees — https://code.claude.com/docs/en/worktrees
- worktrunk — https://github.com/max-sixty/worktrunk
- mitmproxy — https://github.com/mitmproxy/mitmproxy
- OpenBao — https://github.com/openbao/openbao

Unverified: Kaneo typed relations, Phoenix SQLite default, Langfuse OTLP
endpoint, Codex OTel cost fields, Gitea act_runner on native Windows, the
Windows-account + firewall egress combination.

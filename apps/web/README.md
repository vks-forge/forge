# @forge/web

The Forge control room: a React app for watching and steering tickets, runs and the human queue. Not implemented yet; this app has only a `package.json`.

## Why it exists

Forge runs work autonomously, but the user still decides what needs a human: answering a Worker's question, approving a tier B review, signing off tier C, reading what a run did. They need to see state at a glance (which tickets are blocked, what each run costs, what the gates said) and talk to the Director and Workers live. Without a control room the only view is logs and the database. The UI is built natively rather than embedding a third-party tracker (d-0010, r-0004).

## What it does

Intended screens, from `docs/design/control-room-and-platform.md` (none exist yet):

- Projects, Board (kanban columns from the ticket state machine, cards with id, lane, tier, harness, cost), Ticket (live thread, gate results strip, diff viewer, injected memory slice, run list), Agents, Needs you (interactions, tier B and C approvals, timeouts), Ledger, Cost, Memory, Settings (default harness, per-agent credential mode, model matrix).
- Live thread over the server's SSE stream, with permission prompts and Worker questions as blocking cards sharing the answer surface with Needs you.
- State shown in form (pill, stripe, countdown), summary above detail.

Public API: none; it is an app.

## Why this approach

- React, with assistant-ui for threads and AG-UI event types as the wire schema so the UI stays swappable (d-0009). Patterns lifted from Paperclip's React UI (MIT): board, ticket thread, approval card (d-0010, x-0004).
- Rejected: embedding Plane, Huly, OpenProject, Planka, Focalboard or Vibe Kanban (r-0004).
- Each screen gets a Hallmark and a Nielsen-10 pass before it is built.
- Dependencies: none yet; versions will be pinned exactly when added.

## Requirements

- Node 24.20 and pnpm. Nothing is required today: no source, no tests, no env vars.
- Intended: a running `@forge/server` on `127.0.0.1` as its only backend.
- Build and test follow the root scripts once source exists.

## Extending

Follow the app skeleton: `src/main.ts` as the single entry, `routes/` per screen, `services/` for server access, shared types from `@forge/core`. Each new screen needs its Nielsen-10 coverage recorded before build.

## Limits

- Not implemented yet: no source, no screens, no tests.
- `none yet` for dependencies, env vars and configuration.

# Card flow fixes from the 2026-10-17 live test (builder brief)

Status: owner approved 2026-10-17 ("plan the fix of that investigation fully and fix this
autonomously, don't merge anything to main, work on worktree"). Branch
`fix/card-flow-investigation`, in its own worktree. No merge to `main`.

## Evidence (live database, project `demo-checking-project`)

- **Card DCP-C1 and ticket DCP-1.**
  - DCP-C1 was closed on 16 Oct, but ticket DCP-1 stayed in `waiting_human`.
  - Migration 0023's backfill gave DCP-1 a `lane_hold` escalation, and "Run as Express" on it started Worker runs for a closed card.
  - Both runs passed G1 at tier B, so the ticket moved to `review` and stuck there: the only actions are Rework and Cancel.
- **Run events.**
  - Run 2 holds 74 `text` events, one per streamed chunk.
  - Every `tool_call` has `input: {}`.
  - No event records the prompt sent to the Worker.
- **Card DCP-C2.** All the planning events of one turn (`step_started`, `step_finished`, `grill_question`, `needs_you`) share one timestamp, because they were written together after the model call returned.

## Fixes

### A. Backend (core, db, engine, server)

1. **Closing a card closes its work.**
   - Closing a card cancels its unfinished tickets through `transition()`: anything not `done` or `cancelled`. It also cancels their pending interactions, as S4a does on cancel.
   - A running ticket gets the run stopped the same way the existing cancel path does it.
   - No escalation is ever raised for a ticket whose card is closed. This applies to `raiseEscalation`, `backfillEscalations` and the sweeps.
   - The Inbox, the card escalation list and `wait_actions` hide such items.
   - **Repair at start-up:** an idempotent engine sweep cancels the open tickets of already-closed cards (DCP-1 is the live case) and settles their escalations. It writes a card note saying what it cancelled.
   - Reopening a card does not revive cancelled tickets.
2. **Review and sign-off have a way forward.**
   - Add actions:
     - `approve` (review, tier B): "Approve and merge".
     - `sign_off` (needs_signoff, tier C): "Sign off and merge". It requires a named signer, the owner's display name or "owner", per the state machine precondition.
   - They go through `POST /tickets/:id/act`, using the S4a ticket act route and `ticketWaitActions`.
   - **Engine.** The owner's approval goes through the merge door in `verify-merge.ts`, which stays the only caller of `GitHost.merge`.
     - It merges exactly the sha recorded on the passing G1 rows.
     - If the PR head moved since the pass, it refuses with 409 `head_moved`, and the ticket goes back to verifying for a new gate run.
     - On success the ticket moves to `done` through `transition()` with event `done` (adding the signer for C). Worktree cleanup follows, as for tier A.
     - The local file-based GitHost (`.git/forge-prs/*.json`, used when no GitHub is connected) must support this merge. Check that it actually merges the branch into the base branch in the project repo, and test it.
   - **Ticket read.** It exposes what review needs:
     - the diff stat (files, +/−);
     - the G1 report path or summary;
     - the PR URL or local PR file;
     - the head sha.
   - **Rule test.** The S4a "every waiting state has an action" test now expects `approve` on `review` and `sign_off` on `needs_signoff`.
3. **Live planning progress.**
   - The planning flow writes and commits `step_started` (and the card's "thinking" state) before calling the model, then writes the step's results in a second write.
   - Event timestamps come from the clock at the moment of each write.
   - The web "Director is thinking…" indicator then shows during the call. It reads the last `step_started` that has no matching finish.
   - A crash between the two writes must leave the card retryable: the same stale-claim recovery as today, with no duplicate `step_finished`.

### B. Drivers and web

4. **Streaming text becomes whole messages.**
   - Consecutive `text` run events (no other event between them) render as one message in the Worker thread (`apps/web/src/domain/thread.ts`, `applyEvent`): append to the last message item instead of pushing a new one.
   - Do the same wherever a transcript is rebuilt from events, both on the server and in the web.
   - Raw chunks stay in storage, for the debug trace and receipts.
   - Markdown renders once the message is assembled.
5. **Tool inputs are kept.**
   - In `packages/drivers/src/domain/acp-events.ts`, the ACP `tool_call` often arrives with an empty `rawInput`. The input comes later in a `tool_call_update` (status `pending` or `in_progress`), which is dropped today.
   - Fix: emit a normalised `tool_call_update` event carrying the input when an update has `rawInput` or a title, or hold the call until its input is known. Pick the simpler path that keeps event order and the receipts and permission flow correct. Then the thread shows the file path or command.
   - Normalised event schema changes go in core with zod.
   - Add a driver test built from a recorded ACP sequence (call with `{}`, then an update with input, then completed).
6. **The Worker's brief is visible.**
   - At run start the engine records a `prompt` run event holding the instructions sent to the Worker: the dispatch prompt plus the Worker contract and agent instructions, as the driver received them.
   - Secrets are redacted with the shared redact helper from the debug-trace work if it has landed, otherwise a minimal one.
   - The web thread shows it first, as a collapsible "Brief sent to the Worker" item.

## Process

- Red first. For each fix, write a test that reproduces the live case before fixing it:
  - closed card with a waiting ticket;
  - tier-B ticket stuck in review;
  - 74 chunked text events;
  - a tool call with empty input followed by an update;
  - no prompt event;
  - planning events that arrive together.
- Doors: `transition()`, `transitionCard()`, `admit()`, and a single merge door. No bypass.
- Gates (about 2 GB of RAM, never the full suite, `--maxWorkers=2`):
  - `pnpm typecheck`;
  - `eslint --fix`, then `pnpm lint` with 0 errors;
  - prettier on the changed files;
  - vitest on the touched packages.
- READMEs current. PRODUCT.md and the commits are left to the orchestrator. Builders do not commit.

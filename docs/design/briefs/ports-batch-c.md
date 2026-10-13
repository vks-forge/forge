# Brief — ports batch C (engine-ready core + db)

Status: approved 2026-10-13 (review follow-up, "commit and start").
Source: architecture review F2–F11, F23 (2026-10-13). Builds on d-0047, d-0052,
d-0054, d-0055, d-0056. One builder, additive where possible, contract tests
for every new repo on both adapters (memory + sqlite).

## Why now

The engine tick, HTTP/SSE, the Claude driver and the G1 claim matcher each need
fields and repos the ports lack. Adding them one at a time later breaks
`StorageTx`, both adapters and the contract each time.

## Items

1. **Receipt `resource` (F2).** `DecisionReceipt.resource: string | null`:
   normalised path for path tools, first 200 chars of the normalised shell
   segment text, host for network tools, tool id for MCP. Included in
   `decisionBody()` (so it is MAC'd). `tool_decisions.resource` column.
   hooks handler fills it from the same resolver `admit()` used. Update
   `verifyChain` fixtures. No real chains exist yet, so no re-sign migration.
2. **Run lifecycle (F3).** `RunStatus` gains `starting`, `settling`, `settled`
   (keep existing terminal values). `Run` gains `owner` (server instance id),
   `pid` (nullable), `last_event_at`, `final_chain_hash`, `catalogue_hash`,
   `prompt_hash`, `retry_of` (nullable run id), `hook_registered_at`
   (nullable). Repo COLUMNS + memory adapter + contract.
   `runs.listByStatus(status[])`.
3. **Resume = new run row (F6).** Resuming creates a new `runs` row with
   `retry_of`; a run with `ended_at` is never reopened. Document in core README.
4. **StorageTx repos (F4).** Core zod schemas + repos for the tables migrations
   already define: `wakeRequests` (insertIfNew on `(ticket_id, reason,
   idempotency_key)`, listDue, markConsumed, countSince(ticket, since) for the
   re-wake cap), `runInbox` (append, listUndelivered(runId), markDelivered),
   `gateResults` (insert, listByTicket), `projects` (get, upsert, list),
   `ticketRelations` (add, remove, listFor). Decide one relation source of
   truth: `ticket_relations` is the source; `Ticket.parent` / `blocked_by` are
   derived on read by the repo (document it). `interactions.listByTicket`.
5. **Ticket fields (F5).** `assignee_run_id`, `branch`, `worktree`,
   `checkout_run_id`, `epic_id`, `created_by_intake` (all nullable) — columns
   exist in 0001; read/write them; `TicketPatch` + `toTicketPatch` cover them.
6. **RunResult `paused` (F6).** `RunResultStatus` gains `paused` with
   `pauseReason: 'interaction'` and `interactionId`.
7. **RunEvent kinds (F8).** Add `permission` (interaction_id?, call_id, tool,
   decision), `inbox_delivered` (inbox_seq, mode), `session` (session_ref),
   `hook_liveness` (fingerprint). Discriminated union stays additive.
8. **Interaction answer CAS + `blocked` (F9).** `InteractionKind` gains
   `blocked`; mcp `report_blocked` uses it (drop `payload.subtype`).
   `interactions.answer(id, answer, at): Promise<boolean>` succeeds only from
   `pending` (single UPDATE … WHERE status='pending'); also `expire(id, at)`.
9. **RunRequest (F7).** Add `runId`, `projectId`, `lane`, `promptHash`,
   `mcpIdentity`. `permissionPolicy` / `tools` become optional and documented
   as derived from `visibleTools()` by the app (not a second policy source).
10. **Intake (F11).** `insertIfNew` returns `{ inserted: boolean, event }` with
    the stored id; `markTicket(id, ticketId)`.
11. **One run-liveness rule (F23).** Core `domain/run-active.ts`:
    `isRunActive(run)` (status in starting|running and no ended_at). hooks
    handler and mcp `loadActiveRun` both use it; hooks refuses receipts for
    inactive runs.
12. **Migration 0005** for every new column/index; forward-only, checksummed.

## Out of scope

DirectorLLM / GitHost / SecretStore / WorktreeManager ports (next, with the
engine), `forge-mcp` → engine wake signal (accept tick-interval latency until
the HTTP server exists), hooks package split (driver work, d-0056).

## Exit

Gates green; contract covers every new repo on both adapters; READMEs (core,
db, tools, hooks, mcp) and headers updated; `docs/design/director-core.md`
note on relation source of truth and resume-as-new-run.

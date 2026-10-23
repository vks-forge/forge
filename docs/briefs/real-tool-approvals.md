# Real tool approvals (d-0175)

Status: brief, 2026-10-20. Decision: d-0175 (owner, "Real approvals"). Amends tool-system.md §5.4, §12, §13;
execution-plane.md §6; director-core.md §8. Line numbers are the working tree on 2026-10-20 (much uncommitted work;
they may shift).

## 1. Goal

A Standard or Full Worker whose tool call hits `ask` is stopped *visibly*: the call does not run, the Worker is told
plainly it is waiting for the owner, and the ticket parks in Needs you with one item per call ("Allow
`npm install @prisma/client`?") offering **Allow once / Always for this project / Deny**. When every item of that run
is answered, the same harness session resumes. A run never settles `success` with an unanswered ask. Express stays
unattended (`ask` = deny). The owner never edits code or config files (d-0173, d-0090).

## 2. Current behaviour

- Lanes: installs and edits under `migrations/`, `auth/`, protected paths are `ask` in Standard/Full, `deny` in
  Express (`packages/tools/src/domain/lane-defaults.ts:94-96, 124-132`); only Express is unattended (`:74-79`).
- `admit()` turns `ask` into deny only when unattended (`packages/tools/src/domain/admit.ts:224-228`); the server never
  sets `unattended` (`apps/server/src/services/tool-policy.ts:80-109`), so Standard/Full calls return `ask`.
- The hook handler records that `ask` in a receipt with `approver: 'auto'` hard-coded and returns it
  (`packages/hooks/src/server/hook-handler.ts:143-171`, `:159`).
- The hook client collapses it to `'needs approval, denied'`, exit 2
  (`packages/drivers/src/adapters/claude/hooks/decision-outcome.ts:50-53`; stderr clipped to 300 chars at `:25`). The
  Worker carries on, finishes `success`, and `outcome.ts` moves the ticket to verifying
  (`packages/engine/src/tick/outcome.ts:99-108`).
- Hook HTTP timeout 5 s (`packages/drivers/src/adapters/claude/run-files.ts:26-27`); harness timeout +2 s
  (`hooks/settings-file.ts:31, 45`).
- ACP `session/request_permission` only mirrors the hook's receipt; it answers `allow_once` only for a recorded allow
  (`packages/drivers/src/adapters/claude/acp/acp-permission.ts:36-59`, wired `acp-run.ts:91`). The CLI engine has no
  permission path (`cli/cli-engine.ts:228`). The compat check's "N permission requests answered" verifies this
  read-back (`compat/evaluate.ts:115-138`); it is not a way to ask the owner.
- Grants: a project `allow` cannot lift a lane `ask`, because layers combine by severity
  (`packages/tools/src/domain/rule-layers.ts:87-89, 111-121`; layers at `grants.ts:130-135`). Project grant =
  `tool_grants` in settings (`packages/core/src/schemas/project.ts:140-154`, parsed `tool-policy.ts:86`); the ticket
  grant is always `undefined` (`tool-policy.ts:87`).
- Worker questions already have the full path: `ask_director` writes a pending interaction and tells the Worker to stop
  (`packages/mcp/src/domain/tools/ask-director.ts:19-36`; one open per run, `run-log.ts:69-78`); the driver reports
  `paused` (`packages/drivers/src/domain/run-result.ts:51-66`); the engine parks (`outcome.ts:111-121`); an answer queues
  a `response_wake` (`packages/engine/src/tick/interactions.ts:43-73`), which becomes a resume run
  (`wake-candidates.ts:151`) with the delta (`wake-delta.ts:37-44`) and the old harness session
  (`dispatch-run.ts:200-203`).
- `InteractionKind` already has `permission` (`packages/core/src/schemas/run-event.ts:28`); the `permission` run event
  carries `interaction_id` (`:93-99`). Escalation kinds/actions have no permission case yet
  (`packages/core/src/schemas/escalation.ts:35-41, 187-205`).
- Unanswered questions (incl. `permission`) expire after 4 h into Blocked + `question_timeout`
  (`interactions.ts:31-36, 119-161`; `packages/core/src/domain/builtin-config.ts:67`).
- Pending escalations become Inbox items automatically (`apps/server/src/services/inbox-source.ts:136-168`; `titleOf`
  knows only question vs summary, `:48-53`). Needs-you items come from `escalationItem`
  (`packages/core/src/domain/needs-you.ts:117-172`).

## 3. Mechanism: (b) deny now, record a pending approval, resume the session on answer

The hook returns at once (exit 2) with a plain instruction; the server writes a `permission` interaction already at the
owner stage; the engine parks the run at settle; the answer queues one wake; the same harness session resumes with the
answers. This is the `ask_director` machinery, triggered by `admit()` instead of a tool.

Why: all state is durable rows (interactions, receipts, settings versions), so a restart loses nothing; no process
waits, so no Worker slot is held (global 2 / project 1, `builtin-config.ts:56-57`); no fight with the stall killer
(`stall_ms` 300 s, `reconcile.ts:63-76`, `builtin-config.ts:60`); harness-neutral (code.md rule 3): every driver
already gets "blocked + reason" and resume.

Rejected:
- (a) Long-poll in the hook: holds a slot up to 4 h, needs a stall-killer exemption and an hours-long harness hook
  timeout (unmeasured under Claude Code/ACP); a restart mid-poll kills the hook, it fails closed and the Worker carries
  on, which is today's bug. A short hold (≤60 s) is open question 1.
- (c) ACP `request_permission`: the hook blocks every `ask` before the adapter would ask; answering in the driver
  would be a second decision point (`acp-permission.ts:4-11`, code.md rule 6); the CLI engine and other harnesses have
  no such path.
- Claude PreToolUse `defer` (`director-core.md:232`): unmeasured under ACP; at most a later driver-only improvement
  (open question 6).

## 4. Data and schema (no migration: `interactions.payload_json` / `answer_json` carry it)

- `@forge/tools` `schemas/grant.ts`: `Grant.approved: ApprovedRule[]` (default `[]`), `ApprovedRule` =
  `{ id, action, resource, effect: 'allow', created_at, source: { ticket_id, interaction_id } }`. `@forge/core`
  `ToolGrantConfig` (`project.ts:140`) gets the same field (second copy, rule 5).
- Validation: extend `assertValidRules` (`grants.ts:55`) for `approved`: refuse non-`allow`, `strict`, any `*`/`?` in
  a shell resource, the banned always-allow list (`grants.ts:40-48`), and any `PROTECTED_PATHS` match. Refused at
  settings save; at load `Grant.parse` still fails closed (`tool-policy.ts:86`).
- `EffectiveGrant` gets `approved: readonly CallRule[]`, filled by `effectiveGrant()` from the project grant only.
- `AdmitContext` gets `approvals?: { once: {key, ref}[]; denied: {key, ref}[] }`.
- `ReasonCode` adds `approved_once`, `approved_always`, `approval_denied`, `awaiting_owner`, `approval_unavailable`.
- `HookResponse` (`hook-wire.ts:130`) gets optional `interaction_id`.
- New `approval-key.ts`: `approvalKey(ctx, call)` = sha256 of tool id + schema hash + the *full* canonical resource
  (shell segments not truncated, unlike `callResource`; paths normalised; URL whole; else canonical args hash),
  ignoring harness-only fields such as Bash `description`.
- New `alwaysRuleFor(ctx, call, draft)` → narrowest rule or `{ offered: false, why }`: shell = one segment's exact text
  (never a chain); path = the deepest folder that matched the sensitive pattern (e.g. `prisma/migrations/**`); never
  for protected paths, banned commands, or inspector/budget asks.
- `@forge/core` `escalation.ts`: `EscalationKind` adds `permission`; `EscalationPermission` =
  `{ kind, tool, action, what (exact command/URL/path, ≤2000), approval_key, reason_code, why? (≤300, Worker words),
  lane, always: { offered, rule?, why? }, summary }`; actions `allow_once`, `allow_always`, `deny` (optional note);
  `EscalationAnswer.settings_version?`; `escalationActions` → `[allow_once, allow_always?, deny]`.
- `card-event.ts`: `NeedsYouKind` adds `tool_approval` (`card-event.ts:117-126`); `escalationFacts` title
  ``Allow `<what>`?`` clipped to 80, items = why + reason.
- `Interaction` unchanged (kind `permission`, `run_id` = the asking run).

## 5. Server and engine flow

1. PreToolUse reaches `admit()` (lexical and physical views).
2. New `admit-approval.ts` step, attended lanes only, after budgets (`admit.ts:190-211`) and before the unattended
   conversion: draft `ask` + key in `approvals.denied` → `deny/approval_denied`; key in `approvals.once` →
   `allow/approved_once` (rule `approval:<interaction>`); reason `rule_ask`/`no_matching_rule` and a matching
   `grant.approved` rule (export `matches()` from `rule-layers.ts`) → `allow/approved_always`
   (rule `project:approved#<id>`). A deny is never touched: floors, managed and project/ticket/agent denies win first,
   so every grant stays narrowable.
3. `tool-policy.admitContext(run)` builds `approvals` from the ticket's answered `permission` interactions whose
   `run_id` is `run.id` or `run.retry_of` (`run.ts:194`); `allow_always` answers also count as once (no gap while
   settings reload).
4. Hook handler on `ask`: injected `deps.raiseApproval(run, ask)` (hooks may not import engine; wire in
   `hook-wiring.ts`), receipt `ask` with `approval_ref` = interaction id, answer
   `{decision:'ask', reason:'awaiting_owner', interaction_id}`. A raise that fails or is refused →
   `deny/approval_unavailable` (fail closed). An approved allow gets receipt `approver:'user'`, `approval_ref` = rule.
5. Engine door `raiseToolApproval`, one transaction: refuse if the run is inactive or Express; de-duplicate on a pending
   `permission` for the ticket with the same key (return that id); refuse past 5 pending per run; `why` from a string
   `input.description`, else the run's last `text` event; `raiseEscalation(..., 'owner', run.id)`; append a
   `permission` run event with `interaction_id`; card event `interaction_opened` and notify (d-0079). The ticket stays
   `in_progress` while the run is live.
6. Settle guard (new `tick/approval-park.ts`) in `outcome.ts` *before* the staged/success branches (`:92-108`): if the
   run raised permission items and its result is `success`/`paused`, any still pending → treat as `paused` on the
   oldest (existing path `:111-121`; the pipeline stage does not advance); all already answered → park and queue the
   wake in the same transaction. On a failure result, cancel its pending items (`by:'auto'`), then the normal path.
7. Owner acts via `POST /interactions/:id/act` → new `tick/tool-approval-act.ts` from `escalation-act.ts`; only
   `by:'owner'` (Director and auto refused). `allow_always` first appends a project settings version through
   `deps.config.append` (`approved` + rule, author owner, reason "Always allowed from FG-12 (int-…)", CAS, 3 retries),
   then settles with `settings_version`; `allow_once`/`deny` just settle. When no `permission` for that run is pending
   and the ticket is `waiting_human`, `requestWakeTx` `response_wake`, key `perm:<run_id>`.
8. Resume: `wakeDelta` (`wake-delta.ts:37`) gains `approvals: [{what, answer, note}]` for every answered item of the
   run, rendered as "Allowed once: `…` — run it now exactly as before." / "Denied: `…` — do not attempt it or work
   around it; if the task cannot be done without it, call report_blocked." / "Allowed always: …". The resumed run's key
   matches, so `admit()` allows the call.
9. Worker brief (`packages/engine/src/domain/worker-contract.ts`, Standard/Full only, so Express stays byte-identical):
   "A call refused as *waiting for the owner* did not run. Do not retry or work around it. Finish what does not need
   it, then end your turn; you will be resumed with the answer." Same line in `RESUME_PROMPT`.

## 6. Hook and driver

- `decision-outcome.ts:50`: `ask` with `interaction_id` → exit 2, stderr "forge-hook: NOT run, waiting for the owner's
  approval (int-…): <reason>. Do not retry or work around it; do the rest, then end your turn. Forge resumes you with
  the answer." Other `ask` keeps the deny wording. Cap 500 chars for this case only.
- Timeouts unchanged (5 s / 7 s); the raise is one transaction.
- ACP permission handler unchanged (mirrors the receipt; `ask` → `reject_once`).
- No `paused` detection in the driver: the engine guard (§5.6) is harness-neutral and also catches a Worker that calls
  `finish` anyway.

## 7. UI

- Dock item (`needs-you-dock.tsx` unchanged; built by `use-ticket-dock.tsx` / `use-card-dock.tsx` through
  `EscalationCard`). New `components/escalation/escalation-permission.tsx`: label "Tool approval"; the exact `what` in
  monospace, full width, with invisible/bidi characters made visible; "Why: <Worker's words>" plain text labelled as
  the Worker's; "Rule: needs approval in the Full lane" (from `reason_code`); buttons Allow once (primary), Deny, and
  "Always for this project" with the rule spelled out ("Always allow edits under `prisma/migrations/`"); when Always is
  not offered, its reason ("Protected path: always asks"). Deny opens an optional note. Keys 1–3; several items step
  with ‹ › as today.
- Inbox: pending items already appear as `question` entries (`inbox-source.ts:150-166`); `titleOf` gets a `permission`
  branch (``Allow `<what>`?``). Acting there settles it everywhere.
- Settings → Project → Tool approvals (new `routes/project-settings/tool-approvals-section.tsx` + tab): list `approved`
  rules (action, resource, from FG-n with link, date); Revoke saves a new version with a reason via the existing save
  bar and history (`/settings/projects/:slug`, `settings.ts:110-126`). Project deny rules still beat approvals. No
  in-place editing.
- Worker thread: the `permission` event shows "Waiting for your approval: `…`" with a link to the item.

## 8. Failure and timeout

- No answer: the item stays in Needs you and Inbox; remove `permission` from `QUESTION_KINDS`
  (`interactions.ts:31-36`) so it never expires into `question_timeout`. Nothing runs, nothing is held (closed). The
  Worker was told at call time (§6); the ticket parks at settle (§5.6); never `success` with a call outstanding. At
  `timeout_at`, resurface once (open question 4).
- Restart while live: same run row, new generation (d-0092); the item survives; a resumed Worker retrying the call hits
  the de-dup and gets the same id; a hook in flight during drain gets `server_draining` (`hook-handler.ts:143-145`).
  Restart while parked: nothing live; the answer wakes it normally.
- Partial writes fail closed: interaction written but receipt append failed → Worker sees `fail_closed_internal`, a
  retry de-dups. Settings append failed → the action errors and nothing settles; a settle that loses after the append
  returns 409 and the grant stays, visible in Settings.
- Run as Express or cancel on a ticket with items: cancel them (`by:'auto'`).

## 9. Security

- Consent is the owner's alone: the act route needs the install token; the open hook route cannot answer; the engine
  refuses Director/auto for `allow_*`; no MCP tool can answer an interaction.
- Asks only become allows; floors, managed rules and every deny win first; Express ignores approvals.
- Once is bound to tool + schema hash + full resource, for the asking run and its resume only; a harness build change
  means a new ask. Denied keys deny without re-asking (no nagging).
- Always is minimal: never a shell wildcard, never the banned list, never protected paths (tool-system.md §13 shield);
  a versioned settings row with author, reason and source (d-0085, d-0090).
- Worker text is untrusted: it never sets the title or the command shown; rendered as plain text, clipped, labelled.
  The command display comes from the tokenised call.
- Bounded: 5 pending per run plus de-dup.
- Audit: receipts HMAC-chained; `ask` has `approval_ref`; approved allow has `approver:'user'`. G1 treats an `ask` like
  a deny (no effect receipt).

## 10. Tests (red first, d-0015)

- tools: `admit-approvals.test.ts` (once allows only the exact key; another resource still asks; deny/floor beat
  approvals; Express ignores them; `approval_denied`; always match; schema hash change re-asks); property: approvals
  never change `deny` or `allow`; `approval-key.test.ts` (stable across `description`/whitespace); `grants.test.ts`
  `approved` validation.
- core: escalation schema and act bodies; `escalationActions` permission with/without always; `needs-you.test.ts`
  title/kind; `ToolGrantConfig.approved`.
- hooks: `hook-handler-approvals.test.ts` (ask calls `raiseApproval` once, receipt `approval_ref`; refusal →
  `approval_unavailable`; approved allow `approver:'user'`; physical-path same key, junction → new ask).
- drivers: `decision-outcome` message, exit 2, length cap.
- engine scenarios `__tests__/scenarios/approval-*.test.ts`: allow once (success → `waiting_human` not verifying;
  resume has `retry_of`, prompt names the command, call admitted); always (settings version appended, next ticket runs
  without asking, revoke re-asks); deny (resume told; repeat denied, no new item); several (3 items, de-dup, resume after
  the last); fast owner (answered before settle → immediate resume); restart mid-run; Express (deny, no item); staged
  writer (stage does not advance); failure cancels items; no expiry.
- server routes: `escalations.test.ts` act allow_once/allow_always/deny, 409 on second answer; settings history reason;
  `settings.test.ts` refuses bad `approved`; `inbox-escalations.test.ts` and `needs-you-detail.test.ts` include the
  item; `hook-handler-sqlite.test.ts` end to end.
- web: `ticket-dock.test.tsx` / `card-dock.test.tsx` (command, why, three actions; Always hidden with reason); Inbox
  acts; tool approvals section lists/revokes; `escalation-surfaces.test.tsx`.

## 11. Docs

`tool-system.md` §5.4 (once/always/deny, no expiry, resume), §10 (approver/ref), §12 (unattended row: "Needs-you, no
expiry"), §13 (always → project settings grant), status table; `execution-plane.md` §3, §6 (Director does not answer
permissions), §8; `director-core.md` §8 (replace "stays open / defer" with (b)); READMEs: tools, hooks, drivers,
engine, core, server, web (db: confirm no change); `PRODUCT.md` progress line.

## 12. Build order

1. Policy + data (tools, core): approval key, `alwaysRuleFor`, `approved` layer, admit approval step, reasons,
   escalation/needs-you schemas, `admitContext` approvals. Unit + property tests. No behaviour change (nothing raises).
2. Flow (hooks, engine, drivers, server): `raiseToolApproval`, hook handler + wiring, hook message, settle guard, act
   handler with settings append, wake delta + prompts, worker contract line, expiry exclusion, inbox title. Scenario,
   hook and route tests.
3. Screens + docs (web): permission card in dock and Inbox, Tool approvals settings tab with revoke, thread line. Web
   tests, then §11 docs.

## 13. Open questions (recommended answer first)

1. Short hold in the hook (≤60 s) for a live owner? **No for v1**; measure resume latency first.
2. "Always" for a path: folder or file? **The matched folder** (`prisma/migrations/**`), shown on the button.
3. Should always rules expire? **No**; revocable, with source and date shown.
4. Reminder for an unanswered item? **One desktop notification + Inbox resurface at 4 h**; no auto-deny, no Blocked.
5. "Allow all" for several items? **No**; each consent explicit.
6. Claude `defer`? **Probe under ACP later**; driver-only improvement if it works.
7. Company-wide always grants? **No**; project only.
8. Does once survive a later fresh retry (not `retry_of`)? **No.**
9. Director risk note on the item? **No for v1.**
10. "Run as Standard" when an Express ask is denied? **Separate brief.**

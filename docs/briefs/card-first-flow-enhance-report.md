# Enhance-decisions report: card-first flow (d-0127 to d-0140) and build plan S1-S5

Reviewed 2026-10-16 against active decisions, rejected records, design docs, the
code at the working tree (uncommitted edits included) and installed Claude Code
2.1.301. Method: `.forge/skills/enhance-decisions/SKILL.md`.

## 1. Summary

Verdict: the intent is sound. Keep 4 records, change 10, drop none. Change 4 of the
build plan's slice boundaries before work starts. Top three findings:

1. **Read-only Director tools cannot pass through `admit()` the way d-0131 says.**
   Director steps run `claude -p` with `--tools ''`, `--setting-sources ''` and no
   hooks (`director-step-args.ts:42-45`). Read, Grep and Glob are auto-allowed and
   never prompt, so `admit()` would never see them. `admit()` also needs a lane grant
   (`admit.ts:225`), which the Director does not have. Fix: Forge-owned read tools
   (an MCP server or an engine-side pre-read) that call `admit()` under a new
   `director` grant.
2. **S2 before S5 lets heavy lanes run with too little process.** Planned tickets
   skip triage (d-0137), and triage is the only place the Express-only park lives
   (`triage.ts:99-102`). Dispatch never checks the lane (`dispatch-run.ts:171,202`).
   So Standard and Full tickets would dispatch as one bare Worker.
3. **Migration hazards.** Card phase is not stored anywhere today. The column is
   derived (`card.ts:8-12`, `card-rollup.ts:43`). A durable reply queue built on
   "user message not yet answered" would auto-grill every old card, DCP-C1 included,
   on upgrade. Its first `user_message` was never answered (`intake.ts:102-110`).

## 2. Table

| id | verdict | finding | evidence | recommended change | reversibility |
|---|---|---|---|---|---|
| d-0127 | keep | Already built (uncommitted). Re-adding a slug writes fresh settings, but the old project's settings history appears under the new project. | `project-delete.ts:1-16`, `project-purge.ts:8-9`, `first-settings.ts:1-8` | Add one line: version history starts at the re-add; mark earlier versions "previous project". Keep card dependencies inside one project so a delete leaves no dangling links. | Destructive by design; the confirm covers it |
| d-0128 | change | "No tickets until approval" conflicts with the live `create_ticket` chat action and with Issue/PR-issue types that make tickets at intake. | `card-chat-actions.ts:122`, `intake.ts:109-125`, migration `0019-cards.ts:43-44` | Remove `create_ticket` from the card chat during planning. Flip `issue.tickets_on_intake` to false. Keep `pr_issue` on its fast path (rework on an existing card). Say so in the record. | Easy (registry data) |
| d-0129 | change | Card links in both directions need a home and a cycle check. Neither exists: there is no card-relations table and no cycle code for tickets (d-0110's refusal is unbuilt). | `ticket-relation.ts:4-23`; grep "cycle" finds no check | Add one pure `findCycle()` in core, used for ticket and card edges. Store `card_relations` like `ticket_relations` (one `depends_on` edge; "blocks" is the reverse view). Same project only. | Medium (migration) |
| d-0130 | change | Playbook storage is unnamed. `skills_registry` holds only hashes, no body. A grill on every card conflicts with r-0006 and d-0017 (Express = one confirmation turn). | `0002-verification-tables.ts:68-78`; r-0006; d-0017 body | Store playbooks as a section of the versioned company config (`config_versions`, d-0085). Add a zero-question path: the Director may confirm in one turn and go straight to the plan. | Easy |
| d-0131 | change | `admit()` is unreachable from `claude -p` reads (see Summary 1). Reading the main checkout pulls in untracked secrets and the user's uncommitted work. | `director-step-args.ts:42-45`; `admit.ts:219-231`; `floors.ts:23-26`; d-0059 | Forge read tools call `admit()` with a `director` grant, read git-tracked files at HEAD only, cap files and bytes per step, log one summary event per step. | Medium |
| d-0132 | change | A per-project SSE with replay needs a project-wide cursor. `card_events` is numbered per card, and the SSE ticket is scoped to one run. | `0019-cards.ts:63-72`; `auth.ts:52-55`; `run-events.ts:8-10` | Use an "invalidate-only" stream: events carry only keys, the client refetches, and a reconnect refetches everything. Add a project-scoped SSE ticket. No replay table. | Easy |
| d-0133 | change | Director self-approval relies on LLM judgement alone. d-0108 ("decide before any user interaction") is still active and contradicts grill-first. Tier C is not named as forcing approval. | d-0001; d-0108; d-0112 ("CI, secrets, config always need approval"); d-0115 Stage 4 | Auto-approve only when a deterministic check passes: no tier-C glob hit, no `rejected/` hit, no overlap with another card, within budget. The check can only make it stricter. Supersede d-0108. | Easy |
| d-0134 | change | Phases need a stored column, a CAS version and a backfill. The chat context keeps only 30 events of 2000 chars each, so a long grill loses its early answers. | `card.ts:76-88`; `card-chat-context.ts:23-25` | Add `cards.phase` and `phase_version` with a core `transitionCard()`. Keep grill state (open points, answers) as structured card data, not rebuilt from history. Queue table holds only new events. | Medium (migration) |
| d-0135 | change | `Interaction` requires `ticket_id` and has 4 kinds. Card-level questions and plan approvals have no Inbox kind. Timeouts already exist (`timeout_at`, `timed_out`). | `interaction.ts:20-42`; `run.ts:166-171`; `inbox.ts:21-32` | Reuse `Interaction` (add optional `card_id`, new kinds) and the AnswerPanel. Do not add a parallel escalation entity. Until S5, the Express park needs an action. | Medium |
| d-0136 | change | Too big for one slice. It pulls in d-0075 (replay/canary), d-0077, d-0080 and d-0081. Only the Claude driver exists. | `packages/drivers/src/adapters/` = `claude` only; d-0075; d-0037 | Split into S5a to S5d (section 5). Seed default pipelines count as version 1 and are exempt from replay/canary. | Easy to re-scope |
| d-0137 | change | Director sign-off can fill the named-signer slot and bypass Tier C human sign-off. "Carry their lane" drops the deterministic overrides. The critic is always same-family today. | `state-machine.ts:152-160`; d-0012; director-core.md §5-§6; d-0073 | Tier C `needs_signoff` stays human. A plan's lane still goes through `preCheckLane` and `decideLane` (can only raise). Make the critic optional in Full until a second harness exists. | Medium |
| d-0138 | keep | The existing Modal already matches: inert backdrop, discard prompt when dirty, large size. | `modal.tsx:1-45` | Reuse Modal. Priority is new on cards; tickets already have an integer priority. Map the four levels to integers. | Easy |
| d-0139 | keep | Needs a `queued` column and a rollup that reads phase. Today `planned` and `blocked` both roll up to In progress. | `card-rollup.ts:31-36,61-63`; `card.ts:23-30` | Rollup input becomes (phase, tickets, interactions). Update the stale `ui-screen-map.md:44,50` (Ask bar, New column) in the same commit. | Easy |
| d-0140 | change | Running the enhance pass on every card adds an opus step each time. d-0017 reserves the enhance pass for Full. | d-0017 body; d-0060 (Director on opus); `forge-config.ts:65` | Scale by lane: Express skips it, Standard runs a short checklist, Full runs the full pass. Store the report with the plan version. | Easy |
| plan S1-S5 | change | Order hazards: S2 before S5 (Summary 2). S3 needs S2's shapes. S4's sign-off and decision types need S5 stages. | `triage.ts:99-102`; `dispatch-run.ts:171` | Put the core schemas in S1. Keep the park on planned tickets until S5a. Split S4 and S5. See section 5. | Easy |

## 3. Missed points

1. **Grill cost.** d-0112's card budget covers ticket runs only (`cardSpend`,
   `card-chat-context.ts:60-67`). Director steps share one `step_budget_usd`
   (`forge-config.ts:65`), and each turn is a fresh `claude -p`
   (`--no-session-persistence`). Recommend: count Director step spend toward the
   card cap. Give code tools only to the survey and verify steps. Question turns read
   the stored evidence digest, with no tools. (d-0130, d-0131, d-0140)
2. **Step timeout.** The adapter kills a step after 120 s (`director-llm.ts:39`). A
   verify step that reads files will hit that. Recommend a per-step timeout in
   config. (d-0131)
3. **MCP tool deferral.** If the read tools are served over MCP, Claude defers their
   schemas behind ToolSearch. Set `ENABLE_TOOL_SEARCH=false` as for Workers (d-0067).
   (d-0131)
4. **Prompt injection meets auto-approval.** The same step reads repo text, which is
   untrusted, and can auto-approve. Recommend: the auto-approve decision runs in a
   separate tool-less step over typed findings, behind the deterministic floor in
   d-0133. Note: d-0077 already accepts injection risk for pipelines, not for plan
   approval. (d-0131, d-0133)
5. **Migration of existing cards (DCP-C1).** Backfill `phase` from today's rollup:
   cards with tickets go to `in_progress`/`done`, closed cards to `closed`, open cards
   with no tickets to `needs_you` with a "Start planning" action. Never auto-queue
   them. Tickets still parked with "lane not enabled in M0" (DCP-1) get "Run as
   Express" / "Re-plan" actions in S4. They are re-triaged when S5a lands. (d-0134,
   d-0135)
6. **GitHub issue cards.** d-0113/d-0115: the card comes after analysis. Recommend: the
   analysis report becomes the card's verification evidence, so the grill asks only
   what is open. Questions go to the owner in private Forge chat, never to the issue
   author (d-0111 item 3). An `auto-ready` verdict may skip the grill but still goes
   through the d-0133 floor. (d-0128, d-0133)
7. **Discussion cards.** Is a Discussion grilled? Recommend no: talk only until
   converted, as d-0106 says. (d-0130, d-0138)
8. **User never answers.** d-0112 already covers this: a nudge at 7 days and a close
   suggestion at 14. `Interaction.timeout_at` exists. Recommend a long timeout for
   grill questions that leads to the nudge, never an auto-answer. "Use your
   recommendations" stays an explicit click. (d-0130, d-0135)
9. **Two cards touching the same files.** The plan records the base SHA and its
   predicted files. On approval, if HEAD moved and `git diff` paths overlap the plan's
   files, or another approved card claims them, rerun verify and go to Needs you.
   Default `max_concurrent_per_project` is 1 (d-0097,
   `forge-config.ts:55`). That caps the "parallel writers" in d-0137 until the user
   raises it. (d-0133, d-0137)
10. **How a phase maps to the schema.** Phase is a card fact. The ticket status
    machine stays unchanged. Planned tickets are inserted as `inbox` and then get a
    `triaged` event carrying the plan's lane. This keeps the single door
    (`state-machine.ts:48-57`). (d-0134, d-0137)
11. **Playbook versioning and audit.** Each Director step records the config version
    it used, as runs do (migration 0010). Playbook edits go through the UI only
    (d-0090). The replay/canary of d-0075 applies to playbook changes after the seed.
    (d-0130)
12. **What "Director check against the plan" consumes.** Recommend the typed
    artifacts of d-0070 only: plan ticket acceptance criteria, diff, gate reports,
    findings. Never the Worker's narrative (verification-plane.md §5). (d-0137)
13. **The registry's `plan_approval` flag** now means two things, so its semantics
    must change. The Plan type's `true` (`card-type.ts:60`) would block Director
    auto-approval. Recommend renaming the values to `director_or_user | user`.
    (d-0133)

## 4. Contradictions found

| A | B | Resolution |
|---|---|---|
| d-0108 (decide auto-run before any user interaction) | d-0133 (grill, then auto or manual approval) | Write a record that supersedes d-0108. Keep its investigation and its "Always ask" setting. |
| d-0105 / d-0096 (issue = card/ticket at intake) | d-0113 / d-0115 (analysis before card), d-0128 | d-0113 already amends d-0105. d-0128 should name d-0113 as the GitHub path. |
| d-0025 (LLM triage for every task) | d-0137 (planned tickets skip triage) | The verify step counts as the LLM judgement. The deterministic pre-check and director-core.md §5 overrides (`predicted_files > 6`, `rejected/` hit) still run. Amend d-0025 explicitly. |
| d-0085 / d-0090 (config in DB, UI only) | x-0011 file shape, d-0078 `.forge/skills/` | d-0085's body already moves d-0078's path into the data folder. Playbooks go in DB config rows. Never store them as repo files. |
| d-0012 (Tier C = named human signer) | d-0137 (Director sign-off) | The Director signs off only Tier A/B "sign-off" nodes. Tier C stays human (d-0112). |
| d-0001 (only a process the agent cannot control may gate) | d-0133 auto-approve, d-0137 Director check | Plan approval only creates tickets. Merges stay gated by deterministic gates. Auto-approval sits behind a deterministic floor (see d-0133 row). |
| d-0073 (critic different family) | d-0137 (critic in Full) | Consistent on paper. In practice only Claude exists, so the critic is optional and labelled until a second harness exists. |
| d-0128 (no tickets before approval) | `card-chat-actions.ts:122`, registry `tickets_on_intake` | Remove the action during planning. Flip the Issue type to false. |
| r-0006 (no uniform full process) | d-0130 / d-0140 applied to every card | Lane-scaled depth and a zero-question path. |
| director-llm adapter header (steps isolated: no tools) | d-0131 | Update the header and d-0032. Only the survey and verify steps get Forge read tools. Question and approval steps stay tool-less. |
| `ui-screen-map.md:44,50` | d-0138 / d-0139 | Update the doc together with S3. |

## 5. Order of work

1. **S1 foundation**
   - Core zod schemas for card phase, grill question event, plan version and card relation.
   - Migration: `cards.phase`, `phase_version`, `card_relations`, `interactions.card_id`, backfill.
   - `transitionCard()` and the shared `findCycle()`.
   - A durable reply queue for new events only.
   - Create-card API.
   - Flip the Issue registry row (`tickets_on_intake` to false).
   - Remove `create_ticket` from the card chat during planning.
   - Invalidate-only project SSE.
2. **S2 Director planning and S3 card page/board**, in parallel against the S1
   schemas. In S2 the plan-to-tickets step goes through `preCheckLane` and keeps the
   park for non-Express lanes.
3. **S4a escalations**: question, failure and setup types. Add actions to the
   existing parks.
4. **S5a**: the stage runner with seed pipelines as version 1 data. Standard lane
   (test-writer, implementer, reviewer). Remove the Express-only park for Standard.
5. **S5b**: Full lane (optional critic, parallel writers, Director check, Tier A/B
   sign-off). **S4b** sign-off and decision escalations ride on S5b.
6. **S5c**: agent and pipeline editing in the UI with versions, plus d-0075
   replay/canary.
7. **S5d**: Director-built pipelines (d-0077), fallback (d-0080), scorecards (d-0081).

## 6. Unverified

- DCP-C1 and DCP-1 rows live in the user's data-home database, not the repo. Their
  exact state was not read. It is inferred from d-0134/d-0135 and `intake.ts`.
- Whether `claude -p --tools Read,Grep,Glob` with `--permission-prompts none`
  auto-allows reads with no prompt was inferred from `claude --help` (2.1.301), not
  probed. A live probe should confirm it before S2.
- Whether `--restricted` (2.1.301) confines file tools on Windows junctions was not
  checked.
- The research vault does not specifically cover plan auto-approval. The nearest
  general evidence is `why-do-multi-agent-llm-systems-fail` (verification failures)
  and `how-we-built-claude-code-auto-mode-a-safer-way-to-skip-permissions-anthropic`.
  Neither was read in full.

## Opinions

- Rename the "Plan" card type default to "Request" when every card plans. Otherwise
  "Type: Plan" carries no information.
- Animated column glides should be stress-tested with 50+ cards on the board.
  Shared-layout animation across virtualised columns is a known jank source.

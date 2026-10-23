# Forge arm: usefulness evaluation notes

Date: 2026-10-20. Eval instance: `http://127.0.0.1:4320`, data in `$EVAL/forge-home`. It is still running for the UI agent.

**Sign-in:** run this from `D:\VIKASH\software-factory`:
`FORGE_HOME=$EVAL/forge-home FORGE_PORT=4320 FORGE_HOST=127.0.0.1 node apps/cli/dist/main.js open --no-open`
(or `bash $EVAL/scripts/forge.sh open --no-open`). It prints a one-time link that is valid for 1 minute. The token is never printed. A server restart signs the browser out.

Isolation: the owner's 4310 instance and `%LOCALAPPDATA%\Forge` were never called or opened. No edits or git operations were made in the Forge checkout.

## Summary table

| Task | Wall | Owner interventions | Cost (Director/Worker) | Correct | Notes |
|---|---|---|---|---|---|
| T1 slug bug (Express) | 14.1 min | 3 (incl. 1 manual `npm ci`) | $2.42 (1.58/0.84) | 2 | 5 runs for a 1-char fix. Missing deps, then a G1 false positive |
| T2 `--json` | 21.4 min | 7 (3 answers, request changes, approve, steer, manual npm ci) | $2.43 (1.93/0.49) | 2 | Lane request ignored |
| T3 validate add | 21.0 min | 3 (incl. manual npm ci) | $2.04 (0.90/1.14) | 2 | Plan auto-approved |
| T4 store refactor | 28.9 min | 4 | $2.91 (1.69/1.22) | 2 | Excellent questions and plan |
| T5 multi-tag | 45.3 min | 7 (incl. conflict retry + re-plan) | $4.76 (3.00/1.76) | 2 | Merge conflict with T4 |
| T6 import (vague) | 52.2 min | 10 (3 caused by my budget injection) | $8.12 (5.84/2.29) | 2 | Plan v1 contradicted the owner's answer |
| T7 README | 16.4 min | 1 | $1.21 (0.78/0.43) | 2 | 5 min silent stall on the first run |

- **Total spend:** about $23.9 for the 7 tasks, or $25.0 including a throwaway card and an extra ticket. The Director accounts for about 70% of it.
- **Wall clock:** about 80 minutes from the first card to the last merge, with several cards running in parallel.
- **Final repo:** 132 tests pass, `tsc` is clean, and every change is on `main`.

## A. Flow

**First run (works, with a critical environment trap).**
- **Wizard:** three steps (harness, GitHub, first project). The GitHub step can be skipped. The folder picker opens a native Explorer window, so I stubbed its answer in Playwright.
- **Step timings:** about 1.6 s each. The harness test with a live call took 166 s and reported "the live probe reported an error" with no reason. The same command works in a shell.
- **Compatibility check is flaky:**
  - On a fresh home the harness compatibility check failed 3 of 5 times on the installed Claude Code builds (2.1.302, then 2.1.304 after an auto-update) and paused all runs. The note said "install the last version that passed".
  - Re-running it idle passed in 18–49 s. Failing runs took 94–174 s.
  - The first failures were in an env that leaked parent Claude Code session variables. That part is an eval artifact, and I restarted clean. Failures continued after the clean restart, though.
- **Tool approvals:** the owner must then approve 7 tool schemas, even though 6 hashes are identical to a known-good build. The wizard marks the harness step "Done" even when the test failed.

**New project (partly).**
- The Folder → Git → Details → Checks → Review dialog is clear. It suggested typecheck and test checks.
- "Found node" is shown, but `ecosystems` stays `[]` ("Detected ecosystems: None").

**Card lifecycle (works end to end; all 7 tasks merged and are correct).**
- **Flow:** create card → survey → grill → verify → enhance → (research) → plan → approve → tickets → Worker in a worktree → G1 → review → local merge → card done.
- **Lanes and approval:** Express and Standard were both exercised. Full was never chosen by triage, and the owner cannot choose a lane at creation. The Director auto-approved the T1 and T3 plans (type `plan` = director_or_user), so the owner never saw those plans before Workers started.
- **Merge sign-off:** no merge needed the owner's sign-off. Express and Standard both merge on G1 plus the reviewer.

**The single biggest flow problem: Workers cannot install dependencies.**
- Worktrees are created without `node_modules`. Express lane hard-denies `npm ci`. Standard "asks" but auto-denies it (`needs approval, denied: rule_ask`), and no approval ever reaches the owner.
- G1 then fails typecheck (`TS2688 Cannot find type definition file for 'node'`).
- The Worker escalates well. But the answer options Forge offers ("Run npm ci", "Owner approves npm ci") change nothing.
- The only fixes are:
  1. Running `npm ci` by hand in each worktree. I did this on T1–T3.
  2. Adding a custom `npm ci` check before typecheck in Project settings → Checks, so G1 installs deps. I did this from T4 on. Workers still cannot run typecheck themselves, but G1 passes.

  A new owner of any Node/TS repo will hit this on their very first ticket.

**Card type change mid-flow (works).**
- T6 was created as Discussion and changed to Plan from the ⋯ menu. There is a confirm dialog and the change is recorded.
- The Director's queued reply took 3 minutes to start.

**Ticket page (mostly works).**
- The live Worker thread, steering ("Delivered. The Worker will see it on its next turn") and answering Worker questions from the dock all work.
- There is no way to cancel a running ticket.

**Other screens (functional):** Inbox (tool approvals, budget warnings), Board, Runs, Cost, Memory, project settings, Forge settings (Limits saved with a required reason) and Overview.
- **Memory:** stayed empty. The Director wrote no records across 8 cards.
- **Cost / Overview:** both show only Worker spend ($7.43 of about $25).

## B. Director behaviour

**Questions.**

| Task | Questions | Verdict |
|---|---|---|
| T1 | 0 | Zero-question path. Correct, no over-asking |
| T3, T7 | 0 | Clear tasks, none needed |
| T2 | 3 | q1 and q2 were asked because the survey read 0 files ("Requesting repo layout to locate the shelf CLI"). Its own why: "The survey has not located the list command yet". Avoidable |
| T4 | 3 + 2 at approval | Excellent and necessary, each with a recommended option. Example: "routing through loadStore brings small changes. Whitespace-only files count as empty … Saving after add or remove drops extra top-level keys … Accept these?" |
| T5 | 3 | The third, about the wording for three or more tags, was over-asking |
| T6 (vague) | Discussion: 2 messages with 6 and 5 bundled questions | Asked, as hoped, but generic because Discussion does not read the code ("one-shot upload", "maximum file size 10 MB" for a CLI) |

**Plans.**
- **Split:** mostly well judged, with concrete acceptance criteria, file lists and `depends_on` ordering. T4 was 2 ordered tickets. T5 had 3 (a separate README ticket was slightly too fine). T6 was parser then command.
- **T7 plan:** precise and checked against the code (for example "Do not document `-h` (it is not parsed as a flag)").
- **Duplication:** risks and assumptions lists are duplicated 2–3 times (T1 has 11 risk entries made of 3–4 distinct ones).
- **Contradicted the owner:** T6 plan v1 said "Folder (H3) names never become tags", against the owner's explicit "Folders become tags" and the Director's own accepted default. Request changes fixed it.
- **Ignored lane:** T2 plan v2 honoured the owner's "run this as Express" in the plan text, but the ticket was filed Standard.

**Research.**
- It triggered only on T6, which needed outside facts, and "director_decides" worked as intended.
- The 4 sources were a gist, a Nextcloud forum post, a blog post and a GitHub HTML file. No vendor docs.
- The plan flagged unverified outside claims to the owner, which is good.

**Verification and rework.**
- G1 failed 10 times across the run:
  - 3 were the missing-deps environment problem.
  - 7 were false positives in the claims check: read claims for files read in earlier stages, and `added_test` claims for tests added by the test-writer stage.
- G1 caught zero real defects. All final code was correct.
- The rework cap held. Escalations explained themselves in plain words and recommended an action. But for the turn-limit case the diagnosis was wrong ("gave no error text", even though the run event said "Reached maximum number of turns (3)").

**Steering and ticket management from card chat.**
- Filing a ticket works: FR-16 was filed, ran and merged in about 1.2 minutes, and the done card reopened.
- Steering and suggesting a close work.
- Asked to cancel a ticket, the Director said "use the ticket's cancel control". No such control exists for a running ticket.

**Respect for the owner.** It never merged anything that needed approval. The limits were respected: the turn cap stopped runs. A $5 default card budget warned twice in the Inbox, while card Details claims "No cap".

## C. Failure handling

1. **Breaking tests via steer: could not provoke.**
   - "Delete test/cli.test.ts": the hook denied `git rm`. The Worker mentioned this only in its finish summary, with no needs-you item.
   - "Change the slug test to expect top-tools": the Worker refused as out of scope.
   - Good safety, but the gate-on-broken-tests path stayed untested.
2. **Request changes: works.** About 1m46s on T2. 5m18s on T6, including one new question.
3. **Cancel a ticket mid-run: not reachable.** There is no control, and the Director only steered the Worker to stop.
4. **Close a card mid-run: works.** The ticket was cancelled and nothing merged. The dialog wrongly says "Its tickets keep running". The worktree and branch were left behind.
5. **Hard-kill the server mid-run: recovers.**
   - Restart took 2 s, the run "resumed from its session", the ticket finished and merged, and state stayed consistent.
   - The open page said "Could not refresh this ticket. Check that Forge is running", then needed a fresh sign-in link from a terminal.
6. **Same file, two cards: recovers only via re-plan.**
   - The T5 ticket conflicted with the merged T4 refactor and stopped with "verify: policy_denied … PR 9 has merge conflicts". There is no rebase.
   - Retry with a note did nothing: no Worker ran, and it failed again in 15 s.
   - Re-plan of the whole card worked (about 3 minutes, +$1.8).
   - The README overlap between T5 and T7 resolved semantically through the re-plan.
7. **Budget hit: partial recovery.**
   - Turns per run 3 → two runs errored and surfaced as "unknown: failed 2 times". There is no hint to raise the limit.
   - After raising it and pressing Retry, G1 failed permanently: "run secret of generation 1 is gone, chain unverifiable".
   - Only Re-plan recovered (+$2.7). The correct work on FR-11 was discarded.
8. **Offline: works.** The Board shows "You are offline … may be out of date" and recovers in about 1 s. Navigating while offline shows a blank main area with no message.
9. **Bad input: mostly good.**
   - The API returns 400 with field issues, and 404s are clear in both the API and the UI.
   - A UI chat message over 8000 characters fails with "request failed validation" and does not name the limit. The New card form never explains the 20-character description minimum.

## D. Latency and performance

- **Server start:** a fresh home took 30 s to listen. Restart after a graceful stop took 46 s, and restart after a kill took 2 s.
- **Sign-in:** link to first page at network idle took 1.5 s.
- **API (populated, n=9):**
  - Cards list: median 17 ms, max 39 ms.
  - Card detail: median 3 ms, max 27 ms.
  - Ticket detail: median 13 ms.
  - Inbox: median 9 ms.
  - Runs detail: median 3 ms.
  - Plan: median 81 ms (the slowest).
- **Page loads (n=5):** about 670–810 ms median to network idle on every screen, with LCP 180–360 ms. Client route change from Board to card is about 110 ms.
- **Live update over SSE:** steer to visible took 92 / 169 / 894 ms.
- **Card created → first Director output:** 34–132 s.
- **Card created → plan ready:** 80 s (T1), 159 s (T3), 207 s (T7), and 9.5–15 minutes for questioned cards. Most of the long times were serial Director work.
- **Plan approved → first Worker event:** about 0 s when idle. 204 s (T4), 205 s (T5) and 364 s (T6) when other cards were planning.
- **Card created → merged:** 14–52 minutes.
- **The engine stalls Workers while the Director thinks:**
  - T7's first run was recorded as started at 06:36:14, but the harness was spawned only at 06:41:39.
  - The watchdog then killed it ("silent for 324219 ms; cancelling").
  - Several runs have `started_at` earlier than their ticket's creation.
- **Owner waits with no feedback:** 5–6.5 minutes "Director is thinking" between an answer and the next question (T5). 3 minutes queued before a chat reply (T6). About 5 minutes on a "running" ticket with no Worker output (T7).
- **Checks:** G1 takes about 6 s, `npm ci` in a worktree 9–16 s, and plain `npm test` 0.9 s.
- **Disk:** FORGE_HOME is 158 MB.
  - Database 9.7 MB, runs 0.6 MB, worktrees 147 MB.
  - Worktrees of merged tickets are cleaned. The cancelled FR-8 and FR-11 worktrees and 3 stale branches remain.

## Verdict

Forge produced correct, well-tested and well-scoped changes for all 7 tasks. The Director's planning questions on the medium tasks (T4, T5) were genuinely better than what a plain agent would ask, and the audit trail is thorough. But as an owner tool it is not yet useful:

- **Setup trap:** on a stock Node/TS repo, every ticket stalled until I either installed dependencies by hand or found the custom-check workaround.
- **Unreliable gate:** the G1 gate produced only false failures.
- **Expensive recovery:** merge conflicts and limit hits recover only by re-planning the whole card.
- **Hidden cost:** the Director costs about twice the Workers, and the Cost page hides it.
- **Long waits:** with parallel cards, a serial Director plus a blocked engine tick add minutes of silent waiting. A one-line bug fix took 14 minutes, 5 Worker runs and $2.42.

An experienced owner gets safety and paperwork. Raw Claude Code would very likely have finished these tasks faster and cheaper with fewer interventions; the baseline arm should confirm.

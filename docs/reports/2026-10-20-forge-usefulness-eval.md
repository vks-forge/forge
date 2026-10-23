# Is Forge useful yet? Evaluation, 2026-10-20

Same 7 tasks, same demo repo, run twice: once through Forge (as an owner would, mostly in the UI) and once with
plain headless Claude Code (`claude -p`, same model, Opus 5.5). A third pass audited every screen at 7 widths.
Raw data, per-card timelines and notes: `docs/reports/2026-10-20-eval/` (spec, `forge.json`, `baseline.json`,
`ui.json`, notes). Screenshots (105 Forge-arm, 231 UI-arm) stayed in the session scratchpad.

## Verdict

**Not useful to a non-coding owner yet, but the core idea works.** Forge produced correct, well-tested results on all
7 tasks, including the vague one plain Claude Code got half right, and its Director asked sharp questions on the
medium tasks. But it took about 7x the time, 6x the money and 35 owner interventions where plain Claude Code needed
none. Almost all of that gap comes from a short list of fixable plumbing failures, not from the design: Workers could not
install dependencies, G1 produced only false failures, conflicts and limit hits recover only by re-planning, and
Director work blocks Workers. Fix the top 8 items below and the comparison changes materially.

## Scoreboard

| Task | Forge time | Forge interventions | Forge cost | Forge correct | Claude Code time | CC cost | CC correct |
|---|---|---|---|---|---|---|---|
| T1 tiny bug (Express) | 14.1 min | 3 (incl. manual `npm ci`) | $2.42 | 2/2 | 6.4 min | $0.44 | 2/2 |
| T2 `--json` flag | 21.4 min | 7 | $2.43 | 2/2 | 3.2 min | $0.45 | 2/2 |
| T3 input validation | 21.0 min | 3 (incl. manual `npm ci`) | $2.04 | 2/2 | 6.1 min | $0.46 | 2/2 |
| T4 store refactor | 28.9 min | 4 | $2.91 | 2/2 | 6.8 min | $0.78 | 2/2 |
| T5 multi-tag search | 45.3 min | 7 (conflict → re-plan) | $4.76 | 2/2 | 1.8 min | $0.71 | 2/2 |
| T6 vague import | 52.2 min | 10 (3 from a budget test) | $8.12 | 2/2 | 2.5 min | $0.88 | **1/2** |
| T7 README usage | 16.4 min | 1 | $1.21 | 2/2 | 0.9 min | $0.47 | 2/2 |
| **Total** | 199 min summed, **80 min wall** (parallel) | **35** | **$23.89** | 7/7 | **28 min** | **$4.20** | 6.5/7 |

- Director share of Forge spend: **70%**. The Cost page showed only the Worker 30% ($7.43).
- Tests at the end: Forge 132, Claude Code 69. Forge's Workers wrote more tests.
- Setup before the first card: harness live test 2.8 min plus 5 manual interventions (re-run the flaky compat check, approve
  7 tool schemas after a Claude Code auto-update, add an `npm ci` check, raise the Worker cap).
- Claude Code asked **zero** questions on T6 and guessed; it missed "folders become tags". Forge asked, and got it right
  (though its first plan contradicted the owner's answer and needed a change request).
- Parallelism: Claude Code with 2 clones ran T5+T7 1.5x faster, but merging the two hit a README conflict that needed
  manual resolution. Forge also hit it and recovered only by re-planning the card.

## What works

- **Correctness and tests.** 7/7 correct, more tests than the baseline, nothing out of scope merged.
- **Director questions on real ambiguity.** T4 and T5 questions were specific, with recommended answers. T1 and T3 asked nothing (right).
- **Audit trail.** Every tool call has a signed receipt; every decision is on the card.
- **Crash recovery.** A hard-killed server came back in 2 s and the run resumed and merged.
- **Request changes** on a plan works (1m46s and 5m18s to a revised plan).
- **Speed of the app itself.** API 3–17 ms median (plan endpoint 81 ms); pages settle in 0.1–0.3 s plus a quiet
  wait; live updates median 169 ms; route change about 0.3 s.
- **Responsive layout.** 0 horizontal overflow in 168 screen × width checks, no two-line buttons, focus rings
  everywhere, dialogs trap focus, live regions announce.
- **Offline handling.** Clear banner, recovers in about 1 s.

## What breaks (ranked by how much owner time it cost)

1. **Workers cannot install dependencies (critical).** Worktrees start without `node_modules`; `npm ci` is `ask`, which
   silently became deny. Every Node ticket failed G1 typecheck. Forge's own suggested answer ("Owner approves npm ci")
   granted nothing. The only fixes were a manual `npm ci` per worktree or a hand-added project check.
2. **G1 claims check false positives.** 7 of 10 G1 failures were false, and G1 caught no real defect all run. The same
   family as CHE-1 on the owner's own instance.
3. **A turn-limit hit poisons the ticket.** Later runs cannot vouch for its edits ("run secret … gone, chain
   unverifiable"), so G1 fails forever. Only a card re-plan recovered, and correct work was thrown away. It is also shown as
   "unknown / no error text" with no hint to raise the limit.
4. **Merge conflicts have no fix but re-planning.** No rebase, Retry is a no-op, and it is labelled `policy_denied`.
5. **Director work blocks Workers.** The engine tick waits on Director LLM steps. Run start times are recorded too early, so
   the stall watchdog killed a run the moment it really started (T7). Director replies are serial across cards:
   answers waited 3–6.5 min.
6. **Harness compat check flaky under load.** It failed 3/6 runs and paused all Workers. Combined with a Claude Code
   auto-update, every tool needed re-approval (now fixed, see below).
7. **Cost is under-reported.** The Cost page and Overview show Worker spend only (about 30%). "Budget cap: No cap" shows while
   $5 budget warnings fire.
8. **No way to cancel a running ticket.** The Director even points to a control that does not exist. The Close-card dialog
   says tickets keep running, when in fact it cancels them.

Director quality issues:
- The owner's lane choice was ignored: the plan said Express, the ticket was filed Standard.
- The first T6 plan contradicted the owner's explicit answer.
- The T2 code survey read 0 files, then asked questions the code answers.
- Plan risks were repeated 2–3 times.
- Director spend on trivial work was high: T1 cost $1.58 of Director for a one-line fix.

## UI/UX findings

- **The redesign fixed stacking but not space.** The dock stays 178 px whether 3 or 6 items wait, and the composer is always
  visible. But an **open Director question takes 354–374 px**, which leaves the chat 273 px at 1600×860 and 212 px on a phone.
  Chat height at 1600×860: 635 px with nothing waiting, 497 with one item, 449 with several. Phone while typing: 540
  (the dock folds to one line).
- **The chat is mostly log lines.** 10–20 "FR-15 moved from X to Y" lines sit between Director messages, and "Ticket
  created" lines break their bullet layout.
- **Stale, contradictory status erodes trust.**
  - A done ticket says "Waiting on FR-5".
  - A cancelled ticket shows "Run ended (success)" next to "G1 failed, round 4".
  - A done card's plan says "Floor check did not pass".
  - Harnesses says "Not tested yet" after 52 runs.
- **Keyboard and focus.** Dock stepping dies after Next reaches the last item (focus drops to body), and the disabled button
  reads "4 of 3". Esc on the phone sheet loses focus instead of returning it to its opener.
- **Unbuilt screens are visible.** The Issues and Chat nav items say "Coming in W8/W6 of the web build plan".
- **Jargon for a non-coding owner.** G1, tier, lane, "next tick", Generation, Driver, raw `in_progress`, "I called `finish`
  with claims", and "cached 15.5M" next to "Tokens 142k".
- **Layout.** Director settings selects overlap at 768 px. Status pills truncate to "D…". The Board opens on an empty
  column on phones.
- **Accessibility (axe, 24 screens).** 380 violations, 375 of them serious and none critical: 210 chart bars with labels but no
  role, 162 contrast failures (success green, faint grey), and missing h1 on 404 pages.
- **Bundle.** One 1.6 MB uncompressed script.

## Failure injection

| Injected | Result |
|---|---|
| Worker told to break or delete a test | Could not provoke it: policy blocked `git rm` and the Worker refused, so G1's test-tamper path is untested here |
| Request changes on a plan | Works |
| Cancel a running ticket | Not possible; only closing the whole card cancels it |
| Hard-kill the server mid-run | Recovers (2 s, run resumed and merged); the page needs a new sign-in link from a terminal |
| Two cards on one file | Recovers only through a card re-plan |
| Turn or step limit hit | Partial; re-plan only |
| Browser offline | Works; navigating while offline shows a blank page |
| Bad input | API validation and 404s good; an 8000-char message gives a vague error |

## Already fixed today (uncommitted, gates green)

- **G1 config guard (d-0173).** A Worker may create config files when the project has no checks. A config-only G1 failure goes
  to the owner (Merge anyway / Send back / Re-plan / Cancel) instead of burning reworks.
- **Tool approvals survive Claude Code updates.** Unchanged tool schemas keep their approval. No Worker starts while tools are
  pending; the ticket parks with "approve its tools" and resumes after approval.
- **Workers may web_fetch any http(s) page in Standard and Full (d-0174).**
- **Card and ticket redesign (d-0172).** The dock, rail and sheet measured above.

## Recommended next fixes, in order

1. **Prepare worktrees.** Forge installs dependencies itself when it creates a worktree (lockfile-based `npm ci` / `pnpm i
   --frozen-lockfile`, outside the Worker's policy), so no Worker ever needs to.
2. **Real approvals (d-0175, brief ready: `docs/briefs/real-tool-approvals.md`).** No more silent denials.
3. **G1 claims false positives.** Audit the 7 false failures (`forge.json` bugs) and fix the claims matcher across pipeline
   stages. Let a run that hit a limit be vouched for by the next run.
4. **Merge conflicts.** Automatic rebase plus re-run, and a "resolve conflict" Worker run instead of a card re-plan.
5. **Don't block Workers on the Director.** Run Director steps off the engine tick; fix run start times; parallelise Director
   replies across cards.
6. **Honest cost.** Include Director spend everywhere; make the budget label match the warnings.
7. **Cancel a ticket** from the ticket page and dock.
8. **Trust the status.** Clear stale "waiting on" and "failed" text when work finishes; harness "tested" state.
9. **Chat room.** Collapse an open Director question to a compact form and fold ticket log lines into one expandable line.
10. **Owner language.** Plain-words labels (no G1, lane or tier without an explanation); hide unbuilt nav items.

## Method notes and limits

- One demo repo (517-line Node/TS CLI) and one run per arm: directional, not statistical.
- The Forge arm ran on an isolated instance (own data folder, port 4320). The owner's instance was not touched.
- The Forge arm started before today's fixes. Some stalls it hit are fixed in the current code.
- The Forge arm behaved like an attentive owner: its 35 interventions include deliberate tests (request changes, budget,
  kill), counted as interventions.
- The baseline's commit instruction was appended to each task; plain Claude Code has no plan, independent gate or
  audit trail.

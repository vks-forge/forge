# Forge usefulness evaluation — shared spec

EVAL root: C:\Users\vikas\AppData\Local\Temp\claude\D--VIKASH-software-factory\463a023a-fea9-4f6f-9347-8f22fa4c4d25\scratchpad\eval
(written below as $EVAL)

## Isolation (hard rules)
- The owner's real Forge runs on 127.0.0.1:4310 with data in %LOCALAPPDATA%\Forge. NEVER touch it:
  never stop it, never call its API, never open/read/write that folder's DB, never use its install token.
- The eval Forge runs from the checkout D:\VIKASH\software-factory with
  FORGE_HOME=$EVAL\forge-home, FORGE_PORT=4320, FORGE_HOST=127.0.0.1.
- Never print the install token or any secret. Read it into a variable/header only.
- Never git commit/push in D:\VIKASH\software-factory. Commits inside the demo repos under $EVAL are fine (that is the work).

## Demo project
`$EVAL\seed` — a small Node 24 + TypeScript library and CLI called **shelf** (a bookmarks manager), with
vitest tests, plain npm (no pnpm), and a git repo with one initial commit on `main`. ~400–700 lines of source.
Modules: `src/slug.ts` (slugify), `src/store.ts` (JSON file store, functions read/write bookmarks inline in
the CLI too, i.e. a little tangled on purpose), `src/search.ts` (search by single tag), `src/cli.ts`
(commands: add, list, remove, search), `README.md` (short, missing usage section).
Planted bug: `slugify` drops digits ("Top 10 Tools" -> "top-tools", expected "top-10-tools"); a test for it
exists and is marked `it.skip` with a comment "known bug".
`npm test` must pass on the seed (skip excluded). Nothing else should fail.

Copies:
- `$EVAL\forge-repo`  — copy for the Forge run (the Forge project points here)
- `$EVAL\baseline-repo` — copy for the plain Claude Code run

## Tasks (identical text for both arms; give them in this order)
T1 (tiny bug)   "slugify drops digits: 'Top 10 Tools' becomes 'top-tools'. Fix it and un-skip the test."
T2 (small feat) "Add a --json flag to `shelf list` that prints the bookmarks as a JSON array."
T3 (small)      "Validate `shelf add`: reject an empty title or a URL that is not http(s), with a clear message and exit code 1. Add tests."
T4 (medium)     "The CLI reads and writes the JSON file directly in several places. Move all file access behind the store module (one interface: load, save, add, remove) and keep behaviour the same. Tests must still pass."
T5 (medium)     "Search should accept several tags: `shelf search --tag a --tag b` matches bookmarks with all tags, `--any` matches any. Add tests and document it."
T6 (ambiguous)  "Add import from a browser export."   (deliberately vague: tests whether the tool asks good questions; answer any question with: the standard HTML bookmark export file every browser writes (NETSCAPE-Bookmark-file-1 format), skip duplicates by URL, folders become tags.)
T7 (docs)       "Write a Usage section in the README covering every command and flag."

## Metrics to record per task, per arm (write JSON to the arm's results file)
- started_at, finished_at, wall_seconds
- owner_interventions: count + list (every approval, answer, retry, manual fix, nudge you had to do)
- cost_usd (Forge: from its runs/cost API or DB in FORGE_HOME; baseline: from `claude -p --output-format json` total_cost_usd)
- tokens if available
- outcome: merged/committed? `npm test` result after the task (pass/fail + counts), `npx tsc --noEmit` result
- correctness: did it do what the task said? (check by reading the diff + running the CLI for the behaviour) — score 0–2 with one line why
- diff size (files, +/- lines) and anything out of scope it changed
- friction/bugs observed (Forge arm: every UI/API bug, confusing state, stuck run, crash, with evidence: request, response, log lines)

Results files:
- `$EVAL\results\forge.json` + `$EVAL\results\forge-notes.md`
- `$EVAL\results\baseline.json` + `$EVAL\results\baseline-notes.md`
- `$EVAL\results\ui.json` + `$EVAL\results\ui-notes.md` + screenshots in `$EVAL\results\shots\`

## Coverage required (owner: "consider everything")
Every item below gets a finding (works / partly / broken / not reachable) with evidence. Nothing is skipped silently;
if something cannot be tested, say why.

### A. Flow (Forge arm)
- First run on a fresh data home: welcome wizard (harnesses + logins, GitHub step skippable, first project), sign-in link.
- New project from a local folder (`$EVAL\forge-repo`), project inspect (ecosystem detection, checks found).
- Card lifecycle per task: create card -> Director chat/grill -> research (if it runs) -> plan -> approve / request changes
  -> tickets filed -> Workers run in worktrees -> checks/gates -> review/sign-off -> merge into main -> card closes.
- Card types and lanes / pipelines: try at least one Express and one Standard (and any other card type or plan mode
  that exists: list them from the API/UI first). Change card type mid-flow once.
- Ticket page: live Worker thread, steering a running Worker with a message, answering a Worker question.
- Inbox, Board (cards and tickets views), Runs, Cost, Memory, project settings, Forge settings, Overview.

### B. Director behaviour
- Grill/questions quality: are the questions necessary, specific, with a recommended answer? Does it over-ask on T1?
  Does it ask on T6 (vague)? Count questions per task.
- Plan quality: ticket split (too fine / too coarse), acceptance criteria, ordering/blocked_by, scope creep.
- Research: when does it trigger, what sources, does it help or waste time.
- Verification: does it catch a Worker that did not finish or broke tests? Rework loop behaviour and caps.
- Steering and ticket management from the card chat (file a ticket, steer, change type, suggest close).
- Does it respect the owner: never merges without the required approval; budget/limits respected.

### C. Failure handling (inject on purpose, one at a time, record what the owner sees and whether it recovers)
- A ticket whose work breaks tests (e.g. ask for a change then tell the Worker via steer to delete a test file) -> gate fails -> what happens.
- Request changes on a plan; reject/cancel a ticket mid-run; cancel a card.
- Kill the eval Forge server mid-run (forge stop with FORGE_HOME set, or kill its pid — ONLY the eval pid on 4320) and restart: do runs resume? state consistent?
- Two cards touching the same file at once (merge conflict handling).
- Step/limit budget hit (lower a limit in settings to force it) -> needs-you item -> raise -> continues?
- Browser offline / server down while the page is open (Playwright: route abort) -> UI message and recovery.
- Bad input: empty card, huge message, unknown ids in URLs (404 pages).

### D. Latency and performance (measure, give numbers: median and worst of >=5 samples where repeatable)
- Server cold start time; sign-in link to first page painted.
- API latency for main GETs (cards list, card detail, ticket detail, inbox, runs) on the populated instance.
- Page load / route change time per main screen (Playwright: navigation to network idle, LCP if available).
- SSE/live update delay: time from a run event written to it appearing in the open page.
- Time from card created -> first Director reply -> plan ready -> first Worker started -> merged.
- Worktree creation and git/merge time, check (npm test) duration inside Forge vs plain.
- Any long idle gaps where nothing visible happens (the owner waits with no feedback) — list them with durations.
- File/disk: size of FORGE_HOME (db, runs, worktrees) after the run; worktrees cleaned up after merge?

### E. UI/UX
- Nielsen 10 heuristics per main screen (covered / gap with evidence screenshot).
- Hallmark-style visual audit (hierarchy, density, consistency, AI-slop tells).
- Responsive at 320, 375, 414, 768, 1024, 1280, 1600: horizontal scroll (measure scrollWidth > clientWidth), clipped text,
  two-line buttons, overlapping elements. Screenshot each main screen at each width.
- Keyboard: tab order, focus visible, dock keys (arrows, j/k, 1-4), Ctrl+Enter, Esc closes sheets.
- Accessibility quick pass: run axe-core if available via npx/playwright (@axe-core/playwright), else check labels/roles/contrast manually.
- Copy: jargon, unclear states, empty states, error messages.
- The new card/ticket redesign (needs-you dock, rail, sheet) specifically: does it fix "no space to chat with several alerts"?

### F. Comparison verdict inputs
- Per task: Forge vs plain Claude Code on time, interventions, cost, correctness, diff quality.
- Where Forge adds value (safety, audit, parallelism, planning) and where it only adds friction.

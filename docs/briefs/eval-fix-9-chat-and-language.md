# Eval fix 9: chat room space, log folds, focus bugs, owner language (builder brief)

Status: plan, not approved. Source: eval report items 9–10, `2026-10-20-eval/ui-notes.md` §2, §4, §5, §7,
`ui.json` bugs. Web only, no server/schema/core change. Binding: d-0172 (one dock, one item, open questions
live there), d-0109, d-0132, d-0105, d-0139, `.claude/rules/code.md`. Forge is not only for Node projects
(no copy says npm, Node or package.json); the owner does not code (plain words everywhere).

## A. Compact Director question in the dock

**Now.** `routes/card/dock-question.tsx:337-408` draws question text, a "Why it matters" toggle, every
option as a wrapped chip, a hint line ("Or type your own answer…, N open points") and two full-width
shortcut buttons. The dock body is capped at `max-h-[min(38dvh,20rem)]`
(`components/work/needs-you-dock.tsx:236`) plus header and actions, so the dock measures 354–374 px and
leaves the chat 273 px at 1600×860 and 212 px at 390×844 (ui-notes §2). Digits 1–4 click
`[data-dock-option]` buttons found in the DOM (`needs-you-dock.tsx:151-155`), so options must be drawn
for the keys to work.

**Fix (collapsed by default, one tap for the common answer).**
1. Collapsed layout, in order: dock header (unchanged: icon, title, step arrows) → question text clamped
   to 2 lines (`line-clamp-2`, full text in the expanded view) → one action row:
   - primary button `Use recommended: <label>` (label truncates; accessible name carries the full label
     and the word "recommended"). One tap answers, same `flow.onAnswer(question_id, {optionId})`.
   - quiet disclosure button `Other answers (N)` with `aria-expanded` / `aria-controls`.
   - a `⋯` menu (reuse `components/work/header-menu.tsx`, Radix dropdown) holding "Use your
     recommendations for the rest" and "Enough, write the plan".
   - No recommended option: the primary becomes `Choose an answer (N)` and opens the expanded view.
2. Expanded view (inside the same body, capped at `max-h-[30dvh]`, scrolls): "Why it matters" text when
   present, every option as a full-width row (recommended first, badged with icon + word), and the line
   "Or type your own answer in the box below." Esc inside it collapses and returns focus to the toggle.
3. The hint line and "N open points" leave the collapsed view; the open-point count joins the header
   title ("The Director asks · 2 more after this") so nothing is lost.
4. Keys: digits stop depending on drawn DOM. `DockView` gains `onDigit?: (n: number) => boolean`;
   `use-card-dock.tsx:208-214` wires it to option n (1-based, recommended counted in the original
   order), so 1–4 work collapsed or expanded. Enter on the primary answers; arrows still step items.
5. Screen readers: the dock region gets `aria-describedby` pointing at the full (unclamped, `sr-only`)
   question text, so the clamp never hides words from assistive tech. The polite count stays.

**Files.** `routes/card/dock-question.tsx`, `components/work/needs-you-dock.tsx`,
`types/needs-you-dock.types.ts`, `routes/card/use-card-dock.tsx`, `components/work/header-menu.tsx`
(only if it needs a `size` variant).

**Tests (vitest + RTL, AAA).** `__tests__/routes/card-grill.test.tsx`, `card-dock.test.tsx`:
collapsed shows question, primary with recommended label, toggle closed, no option list; one click on
primary posts `option_id` of the recommended option; `Other answers` expands with `aria-expanded=true`
and lists all options; Esc collapses and focus returns to the toggle; key "2" posts option 2 while
collapsed; no recommendation → primary reads "Choose an answer (3)" and expands; menu items fire both
shortcuts; offline holds all three actions.

**Acceptance.** Measured with Playwright (new `apps/web/e2e/chat-room-space.spec.ts`, open question
injected with `page.route` on the card GET, the eval's technique): `[role=log]` clientHeight
≥ 450 px at 1600×860 and ≥ 330 px at 390×844 with one open question, collapsed; dock ≤ 30% of viewport
when expanded at both sizes; composer fully on screen in all four cases.

## B. Fold ticket log lines; fix the broken bullet

**Now.** `domain/card-chat.ts:127-141` turns `ticket_created`, `ticket_state`, `interaction_opened`,
`interaction_answered` into one note line each ("moved from Verifying to In progress"); 10–20 of them sit
between Director messages. `components/card/chat-line-view.tsx:119-140` draws a note as
`<p class="flex flex-wrap">` with Dot, ticket link, text and time as separate flex items, so a long
"Ticket created: <title>" wraps the text and time onto a new flex row under the bullet, leaving the
`FR-n` link alone on the first line (ui.json bug "Card event list breaks its bullet layout").

**Fix.**
1. `ChatLine` gains `fold?: 'ticket'` (set only for the four ticket kinds in `lineOf`). Copy turns
   owner-first: "`FR-5` created: <title>", "`FR-15` is now Done (was Being checked)".
2. New pure `domain/chat-folds.ts`: `foldTicketRuns(lines, metas)` → items that are either a line or a
   fold `{ key, lines, summary }`. A run of **3 or more** consecutive `fold` lines becomes one fold; runs
   never cross a day separator; key = first line's key so open/closed survives refetch and live appends.
   Summary in words: "3 tickets moved · 2 created" plus the latest state of up to 3 tickets
   ("FR-15 Done, FR-16 In progress, +1"). Pure, `now`-free, unit-tested.
3. New `components/card/chat-fold-line.tsx`: one quiet line with a disclosure button
   ("Show 5 updates" / "Hide", `aria-expanded`, `aria-controls`); expanded it renders the original lines
   through `ChatLineView`. Folds are not speech, so `lineAuthor` stays null and grouping is unchanged.
4. Bullet: note line becomes `grid grid-cols-[1rem_minmax(0,1fr)]`, Dot in column 1, and link, text and
   time flow inline in one `<p>` in column 2, so wrapped text hangs under the text, not the bullet.
5. `routes/card/tabs/conversation-tab.tsx:222-233` maps fold items to `ChatFoldLine`. `ChatPane`
   `count` stays the line count so the follow-to-bottom and the live region keep working.

**Files.** `domain/card-chat.ts`, `domain/chat-folds.ts` (new), `types/cards-ui.types.ts`,
`components/card/chat-fold-line.tsx` (new), `components/card/chat-line-view.tsx`,
`routes/card/tabs/conversation-tab.tsx`.

**Tests.** `__tests__/domain/chat-folds.test.ts` (new): 2 ticket lines stay unfolded; 3 fold; a Director
message splits runs; a day change splits runs; summary counts created vs moved and names latest states;
key stable when a 4th line is appended. `__tests__/domain/card-chat.test.ts`: new copy, `fold` set only
on the four kinds. `__tests__/routes/card-events.test.tsx`: fold renders collapsed with summary, expands
to the lines, link `FR-n` and its sentence share one `<p>`.

**Acceptance.** FR-C5-shaped fixture with 15 ticket events between two Director messages renders ≤ 1
line between them; at 375 px (e2e screenshot check) the link, sentence and time of "created" lines sit
in one text block.

## C. Keyboard and focus bugs

**Now.** (1) `needs-you-dock.tsx:214-222`: Next uses `disabled={index === count - 1}`; clicking it to
the last item disables the focused button, focus falls to `<body>`, and the dock's `onKeyDown` never
fires again. Its label is `Next waiting item, ${index + 2} of ${count}` (line 216), which reads "4 of 3"
at the end. Previous (line 207) says `${index} of ${count}` ("0 of 3" at the start). (2)
`components/work/context-sheet.tsx:27-55` opens from route state, not a `Dialog.Trigger` (the opener is
a `Link` in `routes/card/card-header.tsx:126-134` and the ticket header), so Radix has nothing to return
focus to and Esc lands on `<body>`, contrary to the file's own header.

**Fix.**
1. Arrows use `aria-disabled="true"` at the ends (not `disabled`), keep focus, and their `onClick`
   no-ops; styling keyed on `aria-disabled`. New pure `stepButtonLabel(direction, index, count)` in
   `domain/needs-you-dock.ts`: "Next waiting item, 3 of 3" / "No next item, this is the last" and the
   mirror for Previous.
2. Belt and braces: after `step()`, if `document.activeElement` is `<body>`, focus the region.
3. `ContextSheet` gets `onCloseAutoFocus={(e) => { e.preventDefault(); opener?.focus(); }}` where the
   opener is `document.querySelector('[data-sheet-opener]')`; both header openers get the attribute.
   No prop threading through pages.

**Files.** `components/work/needs-you-dock.tsx`, `domain/needs-you-dock.ts`,
`components/work/context-sheet.tsx`, `routes/card/card-header.tsx`, `routes/ticket/ticket-header.tsx`.

**Tests.** `__tests__/domain/needs-you-dock.test.ts`: label never exceeds count or goes below 1.
`card-dock.test.tsx`: click Next to the last item → `document.activeElement` is still the Next button,
`ArrowLeft` then steps back. `card-layout.test.tsx` (sheet mode): open sheet from the header, Esc →
focus on "Plan and details". Same for the ticket sheet in `ticket-tabs.test.tsx`.

**Acceptance.** 0 focus drops to `<body>` in a 3-item step-through and in sheet Esc (e2e assertion
`document.activeElement !== document.body`).

## D. Owner language: one glossary, one "what's this"

**Now.** Terms are scattered or raw: "G1 pass rate" (`components/overview/overview-kpis.tsx:86-90`),
"G1 report" (`routes/ticket/review-facts.tsx:54`), `${lane} lane · tier ${…}` (`routes/ticket/ticket-header.tsx:42`),
"Lane" (`routes/ticket/tabs/details-tab.tsx:30`), "Generation" and "Driver"
(`routes/runs/run-drawer.tsx:74-75`), "cached 15.5M" next to the total (`domain/cost-view.ts:49`,
`run-drawer.tsx:143`), "next tick" (`components/settings/save-panel.tsx:53,127`,
`routes/settings/general-page.tsx:30`, `limits-page.tsx:36`, `project-settings-page.tsx:123,127`),
raw `in_progress` labels (`components/settings/cap-lists.tsx:170,198`), "Floor check"
(`routes/card/plan/plan-tab.tsx:48`), "company or Forge default" (`project-settings-page.tsx:168`).
Partial copy already exists: `LANE_LABEL`/`LANE_BLURB` (`domain/pipeline-copy.ts:140-151`),
`TIER_WORDS` (`domain/finished-work-copy.ts:28`), `STATE_LABEL` (`domain/board-columns.ts`). The
unbuilt nav items render "Coming in W8 of the web build plan" (`routes/placeholder-page.tsx:37`, data in
`domain/nav-entries.ts:43-52`).

**Fix.**
1. New `domain/plain-words.ts`, the one place for owner-facing terms: `TERM` map
   `{ id, label, explain }` for `check` (was G1: "Independent check: a separate AI reviewer, not the one
   that did the work, checks the change against what was asked, using the project's own checks such as
   its tests"), `care` (lane: "How much checking a ticket gets", built from `LANE_LABEL`/`LANE_BLURB`),
   `risk` (tier: "Low risk / Moderate risk / Protected files, needs your sign-off", built from
   `TIER_WORDS`), `attempt` (generation), `connector` (driver: "Connector version"), `tool` (harness:
   "AI coding tool, such as Claude Code or Codex"), `cache` ("re-read from cache, billed at a lower
   rate"), `safety_minimum` (floor check). Plus `APPLY_TIMING = 'Changes take effect on the Director's
   next check, usually within a minute. No restart needed.'` and `stateLabel()` re-exporting
   `STATE_LABEL`. Existing maps stay the value source (rule 5): this module composes, never copies.
2. New `components/ui/whats-this.tsx`: a 24×24 `?` icon button, accessible name "What is <label>?",
   opening a Radix Popover (already a dep) with `explain`; keyboard and touch work, Esc returns focus.
   Placed once per screen next to the first use of a term (header pill detail, KPI tile, run facts),
   not on every repeat. A tooltip-only hint is rejected: not reachable by touch or reliably by keyboard.
3. Replacements: "Independent check pass rate"; header detail "Standard care · moderate risk";
   "Attempt", "Connector version", "AI coding tool", "Tool session"; tokens as "142k new · 15.5M re-read
   from cache"; `APPLY_TIMING` in all six "next tick" spots; cap labels via `stateLabel()`; "Safety
   minimum met / not met"; "Forge-wide default" instead of "company".
4. Hide unbuilt nav: `NavEntry` gains `built: boolean`; `components/shell/sidebar-content.tsx:77`
   filters on it; Issues and Chat set `false`. The placeholder route stays for old links, with copy
   "This screen is not built yet." and no batch name. `batch` leaves the type.
5. Out of web scope, flagged: Worker summaries like "I called `finish` with claims" are model text;
   fix in the seeded Worker prompt (data, d-0085), not by rewriting text in the browser.

**Files.** `domain/plain-words.ts` (new), `components/ui/whats-this.tsx` (new),
`components/overview/overview-kpis.tsx`, `routes/ticket/review-facts.tsx`, `routes/ticket/tabs/details-tab.tsx`,
`routes/runs/run-drawer.tsx`, `domain/cost-view.ts`, `components/settings/save-panel.tsx`,
`routes/settings/general-page.tsx`, `routes/settings/limits-page.tsx`, `components/settings/cap-lists.tsx`,
`routes/project-settings/project-settings-page.tsx`, `routes/card/plan/plan-tab.tsx`.

**Tests.** `__tests__/domain/plain-words.test.ts`: every term has label and explain; no explain or label
matches `/\b(G1|tier|lane|tick|npm|node|package\.json)\b/i`. `__tests__/components/ui/whats-this.test.tsx`:
opens on click and Enter, Esc closes and focus returns. Update existing route tests that assert old
strings (overview, cost, runs, settings, ticket). `__tests__/domain/nav-and-theme.test.ts`: sidebar
lists no unbuilt entry.

**Acceptance.** `grep -rnE "next tick|Coming in W|web build plan|>Generation<|>Driver<"` over
`apps/web/src` returns 0; rendered card, ticket, run drawer, cost, overview and settings show no bare
"G1", "tier", "lane" or `snake_case` state.

## E. Layout and accessibility quick wins

| Issue (source) | Now | Fix | File |
|---|---|---|---|
| Director selects overlap at 768 | `components/director/model-fields.tsx:103` `sm:grid-cols-2` keys on viewport, but content is ~300 px wide | container query: wrapper `@container`, grid `@2xl:grid-cols-2` | model-fields.tsx |
| Pill truncates to "D…" at 768 | `status-pill.tsx:90` label `truncate`; opener text shows from 420 px (`card-header.tsx:132`) | label `shrink-0`, only detail truncates; opener text `min-[900px]:inline` (card and ticket) | status-pill.tsx, card-header.tsx, ticket-header.tsx |
| Board opens on empty column on phones | `routes/board/column-shell.tsx:133` snap scroller starts at Shaping | pure `firstFilledColumn(columns)` in `domain/card-columns.ts`; on mount below `md` scroll it into view (`behavior: 'instant'`) | card-columns.ts, cards-board.tsx |
| 210 chart bars, `aria-prohibited-attr` | `bar-chart.tsx:78-120`, `bucket-chart.tsx:121-165`: `<svg role="img">` with focusable `<rect aria-label>` and no role | svg `role="group"` + `aria-roledescription="chart"`; each hit rect `role="img"` (roving focus kept) | bar-chart.tsx, bucket-chart.tsx |
| 162 contrast failures | `theme/tokens.css:23,32` light `--faint` 68%, `--good` 58%; dark `--faint` 52% (`:54,:85`) | light `--good` `oklch(50% 0.11 155)`, light `--faint` `oklch(55% 0.012 255)`, dark `--faint` `oklch(62% 0.012 255)`; verify with axe | tokens.css |
| No h1 on 404s | `components/status/state-panel.tsx:70` always `h2` | `headingLevel?: 1 \| 2` prop; `routes/not-found.tsx` passes 1 | state-panel.tsx, not-found.tsx |
| "Unlabelled inputs" on Limits / reason | axe found none; real issue is raw `in_progress` labels and typed "Harness id" | labels via D3; harness id becomes a picker of known tools (existing `picker.tsx`) | cap-lists.tsx |

**Tests.** `__tests__/components/charts/*`: bars have `role="img"` and the svg is not `role="img"`.
`__tests__/domain/card-columns.test.ts`: first non-empty column, null when all empty. state-panel h1.
`__tests__/theme/` token test: computed contrast of `--good` on `--hover`/`--surface` ≥ 4.5 (OKLCH→sRGB
helper if one exists in `__tests__/helpers`, else e2e only).

**Acceptance.** axe (e2e, 24 screens at 1280 and 375): `aria-prohibited-attr` 0, `color-contrast` 0,
`page-has-heading-one` 0; total serious ≤ 10 (from 375). No overlap at `/settings/director` 768.
Status pill reads its full word at 768–1023.

## Nielsen coverage after the change

| # | Heuristic | Card | Ticket |
|---|---|---|---|
| 1 | Visibility of status | covered: dock count, fold summaries say what moved | gap: stale "Waiting on" on Done/Cancelled (eval item, not this brief) |
| 2 | Real world | covered: plain terms + "what's this" | covered: care/risk/check words in header and facts |
| 3 | Control and freedom | covered: collapse/expand, Esc returns focus, ⋯ shortcuts kept | gap: no cancel on a running ticket (eval item 7) |
| 4 | Consistency | covered: one term map, same dock on both pages | covered |
| 5 | Error prevention | covered: one-tap answer is the recommended one, others one tap away; offline holds | partial: unchanged |
| 6 | Recognition over recall | covered: recommended label visible; full options one tap; fold names tickets | covered: explanations next to terms |
| 7 | Flexibility | covered: 1–4 work collapsed, arrows never die | covered: arrows never die |
| 8 | Minimalist | covered: dock ≤ ~180 px, log folded | partial: Worker bubble width (not this brief) |
| 9 | Recover from errors | partial: unchanged dock errors | gap: conflict/limit recovery (eval items 3–4) |
| 10 | Help | covered: glossary popovers | covered: glossary popovers |

## Builder steps (each one builder, own worktree, `pnpm check` green, README + PRODUCT.md updated)

1. **Dock and focus (A, C, pill, nav hide).** `dock-question.tsx`, `needs-you-dock.tsx`,
   `domain/needs-you-dock.ts`, `types/needs-you-dock.types.ts`, `use-card-dock.tsx`, `context-sheet.tsx`,
   `card-header.tsx`, `ticket-header.tsx`, `status-pill.tsx`, `nav-entries.ts`, `types/nav.types.ts`,
   `sidebar-content.tsx`, `placeholder-page.tsx`, `e2e/chat-room-space.spec.ts` (14) + tests.
2. **Log folds and a11y (B, E).** `card-chat.ts`, `chat-folds.ts`, `cards-ui.types.ts`,
   `chat-fold-line.tsx`, `chat-line-view.tsx`, `conversation-tab.tsx`, `bar-chart.tsx`, `bucket-chart.tsx`,
   `tokens.css`, `state-panel.tsx`, `not-found.tsx`, `model-fields.tsx`, `card-columns.ts`,
   `cards-board.tsx` (14) + tests.
3. **Owner language (D).** The 13 files under D + `cap-lists.tsx` picker, and `ticket-header.tsx` detail
   copy (after step 1 merges) + test string updates.

## Risks

- Many route tests assert exact copy (G1, lane, "moved from"); step 3 and step 2 will touch 10+ tests.
  Budget for it; do not loosen assertions to regexes that hide regressions.
- Folding hides a state change the owner was watching; mitigated by the summary naming latest states
  and a fold never swallowing a Director message, question, escalation or plan line.
- Darkening `--faint` also darkens decorative fills (`theme/app.css:77,136`); check scrollbars and
  dividers in both themes, split a `--faint-fill` token if they look heavy.
- jsdom cannot measure px or contrast; height and axe gates need Playwright, outside `pnpm check`.

## Open questions (recommended answer first)

1. Add `@axe-core/playwright` (exact pin, dev only, e2e) for the axe gate? **Yes**; no Windows caveat,
   test-only (rule 11 reason line in the PR).
2. Fold threshold: 3 consecutive ticket lines? **Yes**; 2 lines read fine and folding them costs a tap.
3. Should the dock auto-expand when the question has no recommended option? **No**; show
   "Choose an answer (N)" so the height target holds; the options are one tap away.
4. Is "Independent check" the right owner word for G1 everywhere, including the pipeline editor?
   **Yes for owner screens; leave the pipeline editor's G1 rules (`domain/pipeline-copy.ts:30-54`)
   with the term plus "what's this"**, since that screen is for configuring the gate itself.
5. Worker "I called `finish`" leakage: **fix in the seeded Worker prompt in a separate brief**, not in
   the browser.

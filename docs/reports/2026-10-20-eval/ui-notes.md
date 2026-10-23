# UI/UX arm: usefulness evaluation notes

Date: 2026-10-20. Target: the eval instance `http://127.0.0.1:4320`, already populated by the Forge arm: 8 cards (7 done, 1 closed), 16 tickets, 52 runs, empty Inbox and Memory. The served bundle includes the card/ticket redesign: needs-you dock, rail, tabs and sheet.

**Method**
- **Browser:** Playwright 1.64 Chromium, headless. Scripts are in `$EVAL/scripts/ui/`: `sweep.mjs`, `measure.mjs`, `dock.mjs`, `kbd2.mjs`, `perf.mjs`, `extra.mjs`, `build_ui_json.py`.
- **Viewports:**
  - Phones (320/375/414): 844 tall, `isMobile`, DPR 2.
  - Wider widths: 860 tall.
- **Accessibility:** axe-core 4.10.3, installed in `$EVAL/scripts/ui`, injected with `page.evaluate` because Forge's CSP blocks inline script tags (a good sign). Run at 1280 and 375; dark mode was spot-checked.
- **Raw data:** `results/ui.json`, including a `bugs` array of 19 items.
- **Screenshots:** 231 files in `results/shots/ui-*.png`.

**Isolation**
- Nothing was written to Forge. No waiting item existed (Inbox 0, every card done), so the dock tests inject waiting items into GET replies inside the browser only. Every POST in those tests was blocked and recorded: a Ctrl+Enter send and a "2" option pick were proven to fire, then aborted.
- No contact with 4310 or `%LOCALAPPDATA%\Forge`. No source edits, no git operations.

Forge-arm findings are cited, not repeated: [F] = `forge-notes.md`.

---

## 1. Responsive sweep (24 screens × 7 widths = 168 cells)

**Horizontal overflow: 0 of 168 cells.** `scrollWidth > clientWidth` never fired, and no element's right edge passed the viewport outside a clipping scroller. This is genuinely solid.

The table reads `two-line buttons / small targets / clipped / overlaps`. Only real issues are listed; false positives are explained below the table.

| Screen | 320 | 375 | 414 | 768 | 1024 | 1280 | 1600 | Real issues |
|---|---|---|---|---|---|---|---|---|
| Overview `/` | 0/1/0/0 | 0/1/0/0 | 0/1/0/0 | 0/1/0/0 | 0/1/0/0 | 0/0/0/0 | 0/0/0/0 | "forge-repo" link is 20 px tall |
| Home | 0/2 | 0/2 | 0/2 | 0/2 | 0/2 | 0/2 | 0/2 | "Open Inbox (0)" and "Open Board" are 20 px tall |
| Inbox | clean | clean | clean | clean | clean | clean | clean | — |
| Board, cards view | clean | clean | clean | clean | clean | clean | clean | Phone opens on the empty "Shaping" column (bug) |
| Board, tickets view | 0/7 | 0/7 | 0/7 | 0/7 | 0/7 | 0/7 | 0/7 | Card-id chips "FR-C1" are 54×16 |
| Tickets | 12 clamp | 12 clamp | 12 clamp | 12 clamp | 12 clamp | 1/12 | 0/15 | Title links are 20 px tall; 2-line clamps are intended |
| Card chat | ok | ok | ok | pill "D…" | ok | ok | ok | Status pill truncates at 768 |
| Card plan (sheet <1024) | sheet | sheet | sheet | sheet | tabs | rail | rail | Overlaps are the sheet covering the chat (expected) |
| Card + 3 waiting | ok | ok | ok | pill | ok | ok | ok | Evidence links "E1…" are 14×16 |
| Ticket, merged | ok | ok | ok | pill | ok | ok | ok | Overlaps are wrapped inline `<code>` (false positive) |
| Ticket, escalation | ok | ok | ok | pill | ok | ok | ok | Same |
| Runs | ok | ok | ok | ok | ok | ok | ok | 44–65 truncated rows below 768 (by design) |
| Run detail (drawer) | ok | ok | ok | ok | ok | ok | ok | Overlaps are the drawer over the list (expected) |
| Cost | clean | clean | clean | clean | clean | clean | clean | — |
| Memory | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 16 px checkbox ("Hide superseded") |
| Project settings | ok | ok | ok | ok | ok | ok | ok | Sticky "Version 2" footer sits over content (fine) |
| Forge settings: Director | ok | ok | ok | **overlap** | ok | ok | ok | **Model fields overlap at 768** |
| Forge settings: General / Harnesses / Limits | clean | clean | clean | clean | clean | clean | clean | Limits labels are raw `in_progress` keys |
| Welcome | 0/2 | 0/2 | 0/2 | 0/3 | 0/3 | 0/3 | 0/3 | 16 px radios (label is the hit area; acceptable) |
| 404 and ticket 404 | ok | ok | ok | ok | ok | ok | ok | No `<h1>` |

**Two-line buttons:** none found. The only multi-line controls are the deliberate `line-clamp-2` title links on Tickets.

**Small targets under 24×24 on phones:** inline ID links are exempt as text links. The rest:

| Control | Size | Where |
|---|---|---|
| Card-id chips | 54×16 | Ticket tiles on Board (tickets view) |
| "Open Inbox (0)" / "Open Board" | 20 px tall | Home |
| Evidence links "E1"–"E7" | 14×16 | Plan rail |
| Checkboxes | 16×16 | "Expand tool calls", "Hide superseded" |
| "Go to your project" | 23 px tall | 404 |

**Overlap false positives:** the detector also fired on wrapped inline `<code>` boxes, on drawers and sheets that cover content by design, and on a sticky footer.

**Real overlap:** only `/settings/director` at 768 (`shots/ui-settings-director-768.png`). At 768, three columns stay open side by side: the 256 px app sidebar, the settings sub-nav and the content. The "Triage" and "Worker prompt" model selects then collide, and the page intro wraps at about 130 px.

**768 generally:** this width shows a desktop sidebar with phone-like content. On cards and tickets the status pill truncates to "D…" (`shots/ui-card-chat-768.png`).

---

## 2. The card/ticket redesign: needs-you dock, rail, tabs, sheet

**Method:**
- `needs_you_detail` was injected with 0, 1, 3 and 6 items (plan approval, step budget, held ticket, review, sign-off, start planning).
- A separate run used an open Director question: FR-C4's real q3, made open by hiding its answer.
- "Visible chat" is the clipped height of the `[role=log]` scroll container.

### Chat height in px (share of viewport in brackets)

| Viewport | 0 waiting | 1 waiting | 3 waiting | 6 waiting | Open Director question |
|---|---|---|---|---|---|
| **1600×860**, card | **635** (74%) | 497 (58%) | **449** (52%) | 449 | **273** (32%) |
| 1600×860, ticket | 603 | 509 | 461 | 461 | — |
| 1280×860, card | 635 | 471 | 423 | 423 | 253 |
| 1024×860 (tabs), card | 582 | 444 | 396 | 396 | 200 |
| **390×844**, card | **594** (70%) | 386 (46%) | **338** (40%) | 338 | **212** (25%) |
| 390×844, while typing (dock folds) | — | 540 | 540 | 540 | 540 |
| 390×844, ticket | 430 | 310 | 262 | 262 | — |

**Dock height:**

| Case | Dock height |
|---|---|
| 1 item | 130 px (desktop), 200 px (phone) |
| 3 items, desktop | 178 px |
| 6 items, desktop | 178 px |
| Open question with 3 options | 354–374 px |

- **The dock does not grow with the count.** 3 and 6 items are pixel-identical at every width, and the composer stayed fully on screen in every card case.
- **Phone fold:** on a phone the dock folds to a 46 px line while the message box has focus, giving the chat back 540 px. That is a good touch.
- **The dock does grow with the content of the open item.** A Director question with three options, "Why it matters" and the two shortcut buttons fills 354–374 px. That is capped by `max-h-[min(38dvh,20rem)]` on the body, plus the header and actions. It leaves 273 px of chat at 1600 and 200 px at 1024, and on a phone 212 px (25%). The grill question is the most common waiting item in the real run: T2, T4, T5 and T6 all asked [F]. So the case the redesign was built for gets the least room.

**Rail, tabs, sheet:**
- **Rail:** works at 1280 and above.
- **Tabs:** work at 1024–1279.
- **Sheet:** full screen below 1024. A deep link to `/plan` opens it, and Back and Esc close it. Focus is trapped (0 escapes in 30 Tabs), and "Back to chat" gets focus with a visible ring.
- **Waste:** at 1600 the rail is 440 px, but its scope list is split into two narrow columns ("In scope" / "Not in scope"). They are row-aligned, so the "Not in scope" items start halfway down (`shots/ui-card-plan-1024.png`).

### Keyboard

| Check | Result |
|---|---|
| ←/→ and j/k with focus on the dock region | Works: 1→2→3, stops at the ends, k/k returns to 1 |
| Arrows while typing in the composer | Correctly ignored |
| Clicking Next to the last item | **Bug.** The button disables, focus falls to `<body>`, and every dock key dies. To recover the user must Tab through 51 stops: sidebar (15), header (4), the chat's 30+ `FR-11`/`FR-15` links, then the dock |
| Disabled Next label | Reads "Next waiting item, **4 of 3**" |
| 1–4 on an open question | Works. "2" fired `POST /cards/FR-C4/grill/answer {"option_id":"o2"}` (blocked by the test) |
| Ctrl+Enter in the composer | Sends: `POST /cards/FR-C5/messages`. On failure the message stays in the box with a clear error |
| Esc closes the sheet | Works, and the URL returns to `/conversation`. **Focus goes to `<body>`, not the "Plan and details" opener**, contrary to the component's own contract |
| Tab order | Logical: sidebar → header → chat → dock → composer → rail. No skip-to-dock; the dock comes about 50 stops in on a busy card |
| Visible focus | Every stop in a 60-Tab walk has an outline or ring. Spot check: 2 px blue ring with offset (`shots/ui-focus-ring-newcard-1280.png`) |

### Verdict on the redesign

**Partly fixed.** The old problem was full-size amber boxes stacking, with chat space that fell with each alert. That is solved:

- **Count:** the dock is the same size for 3 or 6 alerts, the composer never leaves the screen, and arrival never steals focus.
- **Phone:** the typing fold is good.

What it does not solve:

- **Content height:** the Director question, the commonest wait, takes 41–44% of the viewport. The chat then shrinks to a quarter or a third of the screen at the moment the owner needs to read what the Director said.
- **The event flood:** the chat that remains is half filled with "FR-15 moved from Verifying to In progress" lines (see §5), so there is less to read than the pixels suggest.

**Fixes:**
1. Show only the question text and options by default, behind a compact header.
2. Collapse the shortcut buttons into a "More" menu.
3. Cap the open-question dock at about 30% of the viewport.
4. Fold the ticket-movement events into one expandable line per ticket.

---

## 3. Page performance (1280×860, median of 5, cold full navigations)

| Screen | Network idle median / worst | LCP median / worst | DCL | Requests |
|---|---|---|---|---|
| Overview | 617 / 905 ms | 160 / 420 ms | 47 ms | 14 |
| Home | 669 / 721 | 208 / 256 | 83 | 17 |
| Inbox | 653 / 731 | 176 / 240 | 71 | 15 |
| Board | 682 / 692 | 160 / 160 | 80 | 16 |
| Tickets | 671 / 700 | 216 / 256 | 94 | 15 |
| Card (FR-C4) | 770 / 847 | 308 / 388 | 97 | 20 |
| Card, long history (FR-C5) | **816 / 882** | **336 / 416** | 123 | 20 |
| Ticket, merged | 666 / 763 | 228 / 364 | 77 | 18 |
| Ticket, escalation | 666 / 747 | 220 / 288 | 73 | 18 |
| Runs | 649 / 667 | 176 / 192 | 85 | 15 |
| Run detail | 712 / 731 | 204 / 240 | 76 | 17 |
| Cost | 622 / 656 | 184 / 196 | 64 | 15 |
| Memory | 625 / 686 | 120 / 184 | 62 | 16 |
| Project settings | 620 / 699 | 148 / 240 | 68 | 17 |
| Settings: General / Harnesses / Limits / Director | 686 / 648 / 652 / 715 | 188 / 112 / 108 / 128 | 68–91 | 14–15 |

- **Reading the numbers:** network idle includes Playwright's 500 ms quiet window, so real settle time is about 120–320 ms. LCP stays under 340 ms median everywhere.
- **Card pages are the slowest:** 20 requests and the longest history.
- **Agreement with [F]:** these numbers agree with the Forge arm's pageperf (670–810 ms idle at 1440).
- **Bundle:** a single **1.60 MB uncompressed JS bundle** (no gzip, no route splitting), 65 KB CSS and 5 self-hosted woff2 fonts. It has an immutable cache, so it is fine on localhost but heavy over a LAN or tunnel.

**Client route changes** (click → target content visible, median / worst):

| From → to | Median / worst |
|---|---|
| Sidebar Board → Inbox | 282 / 300 ms |
| Inbox → Runs | 273 / 307 ms |
| Board → card | 298 / 331 ms |
| Tickets → ticket | 302 / 379 ms |
| Rail tab Plan → Tickets | 64 / 88 ms |

[F] measured Board → card at 110 ms using an earlier element. Mine waits for the chat log to render.

---

## 4. Accessibility (axe-core 4.10.3)

**At 1280, 24 screens: 380 violations (375 serious, 5 moderate, 0 critical).** At 375 the count is similar, minus the faint-text hits.

| Rule | Nodes | Screens | Cause |
|---|---|---|---|
| `aria-prohibited-attr` | 210 | Overview (90), Home (90), Cost (30) | Every chart bar is `<rect aria-label="21 Sept: $0.00">` with no role. Screen readers ignore or misreport them |
| `color-contrast` | 162 | 23 of 24 | Success green `#318f5a`: 3.43:1 on run chips, 3.85:1 on pipeline steps, 4.03:1 on ticket tiles. Faint `#94999e` placeholders ("All states", "Choose") and the `Ctrl K` kbd: 2.87:1. Dark mode: only faint text fails (3.19:1) |
| `page-has-heading-one` | 2 | 404, ticket 404 | No `<h1>` |
| `heading-order` | 2 | Card | h3 under h1 in the plan |
| `dlitem` / `definition-list` | 3 | Project settings | `dt`/`dd` outside a `dl` |
| `landmark-unique` | 1 | Settings General | Two "notifications" landmarks |

**Good, checked by hand:**
- **Labels and landmarks:** skip link, labelled nav and landmarks, `role=log aria-live=polite` on the chat, a polite count announcement in the dock, labelled icon buttons ("Plan and details", "Card actions", "Open navigation").
- **Dialogs and keys:** Radix dialogs trap focus, and F8 jumps to notifications.
- **Welcome:** the page has 0 violations.

---

## 5. Copy and states (a non-coding owner's view)

**Jargon on screen, with no explanation:**

| Term or phrase | Where |
|---|---|
| "G1 pass rate 57% — 13 of 23 verdicts passed" | Overview, Home |
| "Gate G1", "Rework 2 of 2", "tier A", "standard lane" | Ticket header and pipeline |
| "Floor check did not pass" | Plan |
| "Harness", "Generation 1", "Driver 2.1.304", "Harness session 3a2c…", G1 hash `30ee2a0` | Run detail |
| "Changes apply on the Director's next tick" | General, Limits |
| `in_progress`, `verifying` | Limits labels |
| "Records are never edited: to change one, supersede it" | Memory |
| "Spend reported … as far as their harnesses reported it"; "Tokens 142k — in 606 · out 141k · cached 15.5M" | Cost. The cached figure is 100× the total |
| "Each setting follows the company or Forge default" | Project settings. There is no "company" anywhere else |

Worker summaries leak tool protocol: "I called `finish` with claims for both edited files, the test run and the files I read." Plans are written in code identifiers (`cmdAdd`, `storeExists(path = storePath())`). That is acceptable for a developer owner, opaque for anyone else.

**Unbuilt screens in the nav:** "Issues is not built yet. GitHub issues with the Director's verdict. Coming in W8 of the web build plan." Chat says the same with "W6". An internal roadmap shipped in the product.

**Stale or contradictory states** (the worst copy problem, because it erodes trust):

| Screen | What it says | Reality or contradiction |
|---|---|---|
| Ticket FR-6 (`ui-ticket-merged-1280.png`) | "Waiting on FR-5" | The ticket is Done |
| Ticket FR-11 (`ui-ticket-escalation-1280.png`) | "Waiting on FR-10" and "Run ended (success)" | Header says Cancelled. G1 says "Failed, round 4", and every run is a green "Succeeded" |
| Card FR-C4 plan | "Floor check did not pass" | The work is merged and done |
| Harnesses | "Claude Code — Not tested yet · Tested not yet" | 52 runs went through it |
| Board | FR-C5's "Done" card has a progress bar about 70% full | One ticket was cancelled |
| Cost, Overview | $8.43 | Real spend about $25. The Director is excluded [F] |
| Card chat | "the Director may approve this itself" | Owner approval is skipped. That should be a visible, explained setting [F: T1/T3 auto-approved] |

**Empty states (good):**

| Screen | Copy |
|---|---|
| Inbox | "When a Worker asks a question or a ticket waits for your review, it appears here." |
| Memory | "Decisions you make, and proposals you approve, appear here." |
| Board | "Nothing here." / "You are all caught up." |
| Home | "No ticket is in progress. Create a card to start something." |

But Inbox "All 0 / Archived 0" after a run full of approvals means there is no history to look back at.

**Error messages (mostly good):**
- **Send failure:** "Your message was not sent. Cannot reach Forge. Check that Forge is running (`forge start`), then try again. It is still in the box; press Send to try again." This is excellent recovery copy, though `forge start` assumes a terminal user.
- **404:** "This page does not exist. The address may be mistyped or from an older version", with a way back.
- **Data mismatch:** "Forge sent something this version cannot read". This replaces the whole card when one waiting item fails to parse (`ui-dock-card-1600-n6.png`).
- **Gaps from [F]:** the 8000-character limit and the 20-character description minimum are never stated. The New card dialog disables "Create card" without saying why.

**Card chat formatting:**
- **Broken bullets:** "Ticket created" events put the `FR-n` link alone on a bullet, and the sentence and time wrap below it outside the list (`ui-card-waiting3-375.png`, `ui-card-chat-768.png`).
- **Event flood:** one card shows 10–20 "moved from X to Y" lines between Director messages.

---

## 6. Nielsen 10 heuristics per main screen

C = covered, P = partial, G = gap. Evidence follows the table.

| # | Heuristic | Overview / Home | Inbox | Board | Card | Ticket | Runs | Cost | Memory | Settings |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Visibility of system status | P | C | C | P | **G** | C | P | C | P |
| 2 | Match with the real world | **G** | C | P | P | **G** | **G** | **G** | P | **G** |
| 3 | User control and freedom | C | C | C | P | **G** | C | C | C | C |
| 4 | Consistency and standards | P | C | P | P | P | C | P | C | P |
| 5 | Error prevention | n/a | C | P | P | P | n/a | n/a | C | C |
| 6 | Recognition over recall | C | C | P | P | P | C | C | C | **G** |
| 7 | Flexibility and efficiency | P | P | C | C | P | C | C | C | P |
| 8 | Aesthetic and minimalist design | P | C | P | **G** | P | C | P | C | P |
| 9 | Recognise and recover from errors | n/a | C | C | P | **G** | C | n/a | C | C |
| 10 | Help and documentation | P | C | C | P | **G** | P | P | P | P |
| | Score out of 20 (C=2, P=1, G=0, n/a=2) | 12 | 19 | 16 | 12 | 6 | 17 | 13 | 18 | 12 |

**1 · Visibility of system status**
- **Board:** the "Updated 13:18:19" stamp and per-column help are good.
- **Ticket (gap):** a Done ticket says "Waiting on FR-5". A Cancelled one says "Run ended (success)" next to "G1 Failed, round 4".
- **Card (partial):** "Floor check did not pass" on done work. [F] also logged 3–6 minute silent waits behind "Director is thinking".
- **Cost and Overview (partial):** show $8.43 against a real $25.
- **Settings (partial):** Harnesses says "Not tested yet".

**2 · Match with the real world**
- G1, tier, lane, tick, floor check, harness, generation and supersede are never explained (§5).
- Cost shows "cached 15.5M" next to "Tokens 142k".
- Limits shows `in_progress`.

**3 · User control and freedom**
- **Ticket (gap):** a running ticket has no cancel control [F]. The Director tells the owner to "use the ticket's cancel control", which does not exist.
- **Card (partial):** close works but leaves the worktree behind [F]. The sheet's Esc works but loses focus.

**4 · Consistency and standards**
- Home and Tickets share one house icon.
- Board has an icon-tile header, while Home, Inbox and Cost use a mono eyebrow over an h1.
- The Tickets filters disagree: State says "All states", Lane says "Choose".
- Overview and Home repeat the same eight tiles.
- Status pills are lowercase mono ("express") on Tickets but sentence case elsewhere.

**5 · Error prevention**
- Close and type change have confirm dialogs [F]. Limits needs a reason to save [F].
- **Partial:** "Approve plan…" opens a dialog (good). But the Director auto-approves `plan` cards with no owner opt-out on screen.
- **Partial:** New card disables Create without saying why.

**6 · Recognition over recall**
- Settings → Limits asks for a typed "Harness id".
- The plan cites evidence as bare "E1–E7" 14 px links.
- Ticket and card IDs are shown, but on phones the titles truncate with no way to read them.

**7 · Flexibility and efficiency**
- **Covered:** Ctrl+K project switcher, `/` in Memory search, F8 for notifications, dock arrows/j/k/1–4 and Ctrl+Enter.
- **Partial:** no skip-to-dock key, so on a busy card the dock is about 50 Tabs away. No bulk actions in Inbox or Tickets.

**8 · Aesthetic and minimalist design**
- **Card (gap):** ticket-movement events flood the chat.
- **Board (partial):** four empty full-height columns.
- **Overview, Cost (partial):** 29-day charts that show one bar.
- **Ticket (partial):** the Worker thread bubble is about 370 px wide inside a 540 px column.
- **Partial:** risks are duplicated 2–3 times in plans [F].

**9 · Recognise and recover from errors**
- **Good:** send failure keeps the text and explains. The offline banner is good [F].
- **Ticket (gap):** a merge conflict and "run secret of generation 1 is gone, chain unverifiable" recover only by re-planning [F], with no plain-language next step on the ticket.
- **Card (partial):** one unparseable waiting item blanks the whole card.

**10 · Help and documentation**
- **Good:** page intros ("Every Worker run on this project, newest first…") and field hints are good throughout.
- **Gap:** there is no glossary or "what is G1 / lane / tier" help anywhere. The Issues and Chat placeholders point to an internal "web build plan".

**Verdicts:**
- Inbox, Runs, Memory: ship.
- Board, Overview, Home, Cost, Settings: ship with fixes.
- Card: ship with fixes (dock height, event flood).
- **Ticket: needs rework.** Its stale status is wrong in the most trust-sensitive place.

---

## 7. Hallmark audit

**Pre-flight:**
- **Fonts and palette:** Tailwind with semantic tokens (`bg-signal`, `text-attn`, `text-good`, `bg-hover`). Fonts are Instrument Sans plus IBM Plex Mono, self-hosted.
- **Motion and genre:** motion-on (`motion/react`), used sparingly. Genre: modern-minimal product UI.
- **Theme:** light and dark, with no flash (the theme is applied before first paint).
- **No `design.md`.**

**Overall:** restrained and mostly made rather than generated. The type pairing is distinctive, mono is used for data (ids, money, times), there are no gradients or glassmorphism, there is one accent colour, and there are no emoji. The AI tells are in structure and density rather than in decoration.

### Critical (ships as slop or breaks trust)
1. **Tell: stale state presented as live**
   - Where: ticket header and pipeline (`ui-ticket-merged-1280.png`, `ui-ticket-escalation-1280.png`), the plan's "Floor check did not pass", Harnesses "Not tested yet".
   - Fix: derive "Waiting on" and floor-check banners from the current state, hide them on Done or Cancelled, and show the last harness test result.
2. **Tell: placeholder routes in the primary nav**
   - Where: sidebar Issues and Chat ("Coming in W8 of the web build plan").
   - Fix: hide the entries until built, or show them greyed with a "Later" badge and no internal plan names.
3. **Tell: the chat is a log dump**
   - Where: card chat (`ui-card-chat-768.png`).
   - Fix: group ticket movements into one collapsible line per ticket ("FR-15 · Done in 5m · 4 steps"), and repair the event bullet so the link and sentence share one line.

### Major (looks unfinished or AI-default)
4. **Tell: identical dashboard twice**
   - Where: Overview and Home share eight stat tiles, the same charts and the same captions.
   - Fix: make Home project-specific (what is moving, what merged today) and Overview cross-project.
5. **Tell: stat-tile grid with low-information charts**
   - Where: Overview, Home and Cost. A 29-day bar chart has one non-zero bar; "Active projects 1 of 1".
   - Fix: pick the chart range from the data span, or replace the chart with a sentence until there are three or more days of data.
6. **Tell: empty kanban columns at full height**
   - Where: Board (`ui-board-cards-1280.png`, `ui-board-cards-375.png`).
   - Fix: collapse empty columns to a narrow header (Closed already collapses) and open the phone view on the first non-empty column.
7. **Tell: dock that crowds out the thing it serves**
   - Where: open-question dock, 354–374 px.
   - Fix: compact question layout and cap it at about 30% of the viewport (§2).
8. **Tell: three-column squeeze at tablet width**
   - Where: Forge settings at 768 (`ui-settings-director-768.png`).
   - Fix: below 1024 collapse the app sidebar to icons or a drawer, or turn the settings sub-nav into a select, as Project settings already does.
9. **Tell: narrow message bubble in a wide column**
   - Where: Worker thread on tickets (about 370 px bubble).
   - Fix: let Worker summaries use the full column width up to about 70ch.

### Minor (taste)
10. **Shared icon:** Home and Tickets both use a house. Fix: give Tickets a list-check icon (the board switch already uses one).
11. **Header styles:** Board uses an icon tile, other pages use an eyebrow. Fix: pick one page-header pattern.
12. **Contrast:** success green fails AA on tinted backgrounds. Fix: darken `--good` to about `#23784a` in light mode.
13. **Raw enum labels on Limits:** fix with "In progress", "Being checked".
14. **Status pill truncates to "D…" at 768:** fix by hiding the "Plan and details" text label below 900 px, so only the icon shows.
15. **Truncated reason chips at 1280:** fix by letting chips wrap.

**3 critical · 6 major · 6 minor.**

**Pre-emit-style scores for the audited UI** (Philosophy, Hierarchy, Execution, Specificity, Restraint, Variety): P4 H3 E3 S4 R4 V3.

---

## 8. Overall verdict

The responsive engineering is strong: zero horizontal overflow in 168 cells, no two-line buttons, sensible breakpoints for rail, tabs and sheet, and focus management and live regions above the usual standard. Pages load in about 0.15–0.35 s.

The redesign fixed the specific "several alerts" problem: the dock is a constant 178 px whatever the count, and it folds to 46 px while typing on a phone. It did not fix "no space to chat". An open Director question, the commonest wait, still takes about 41–44% of the viewport, leaving 25–32% for the chat. Much of that chat is ticket-movement log lines.

The bigger UX problem is trust, not layout:
- Done and cancelled work still says "Waiting on…", "Floor check did not pass" and "Run ended (success)" beside "G1 Failed".
- The harness reads "Not tested yet" after 52 runs.
- Cost hides about two-thirds of the spend [F].
- Jargon (G1, lane, tier, tick, harness, generation) assumes the owner wrote Forge.
- Two nav items are unbuilt placeholders.

For a developer who knows Forge's internals, it is a capable control room. For an owner who does not code, it is not yet self-explanatory.

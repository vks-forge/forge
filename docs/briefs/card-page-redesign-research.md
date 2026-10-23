# Card page redesign: research and recommendation

Status: research brief, not scheduled. No code changed.
Scope: the card page, `/p/:slug/cards/:id/<tab>` (`apps/web/src/routes/card/`).
Date: 2026-10-19.

**The owner's complaint (verbatim):** "after some action alerts there is no space in chat to read
and do chat, suppose if more than 1 alert appears then how disaster is this to use. i need you to
research and do the best of the best for this, UI and UX all should be very good and clean".

**One-line answer:** take every alert out of the stack above the tabs and put them in **one queue
of things waiting on you**, docked just above the message box. It shows one item open at a time,
whatever the count. On wide screens, move Plan, Evidence, Tickets and Details into a **context
rail** beside the chat, so the plan can be reviewed next to the conversation and the chat column
loses no height to tabs. The header shrinks to one row. That is Option B below.

---

## A. Audit of the current page (from code)

### A.1 Page frame and vertical budget

| Part | Where | Notes |
|---|---|---|
| Shell content box | `components/shell/app-shell.tsx:79` | `px-8 py-9` from 768 px; `max-w-[1240px]` (only the Board gets 1480). Sidebar is `w-64` (`:50`). |
| Page height | `theme/app.css:181-189` | `.page-fill` = `100dvh - 4.5rem` on desktop, `100dvh - 6rem - 1px` on phone. |
| Page column | `routes/card/card-page.tsx:198` | `flex-col gap-2`: header, banners, tabs, panel. |
| Header | `routes/card/card-header.tsx:384-467` | Row 1 (`:385-430`): Board link, id, column chip, phase text, "from Chat", then cost, **type picker**, red **Close card**. Row 2: `h1` with `line-clamp-2` (`:432`). Then a closed notice (`:434-438`) and a patch error (`:440-444`). |
| Banner stack | `card-page.tsx:218-268` | One `ScrollArea` capped at `max-h-[34dvh]` (`:219`) holding up to five blocks: offline / refetch error (`:220-228`), NeedsYouBanner (`:230-237`), EscalationBanner (`:239-246`), "questions waiting" box (`:248-266`). |
| Tab strip | `card-page.tsx:175-192, 272`; `components/ui/route-tabs.tsx:59-99` | 44 px tall (`min-h-11`). Conversation, Plan (dot when `plan_ready`), Evidence (only once research ran, `domain/route-tabs.ts:40-47`), Tickets (count and attention), Details. |
| Panel | `components/ui/tab-panel.tsx` | Scrolls by itself, except the Conversation tab, which manages its own scrolling. |
| Chat | `components/chat/chat-pane.tsx:79-123` | The list scrolls (`:82-103`) in a `max-w-3xl` column (`:100`); "Jump to latest" pill with an unread count (`:104-116`); composer docked below (`:118-122`). |
| Composer | `components/card/message-composer.tsx:63-95` | 2-row textarea (`min-h-12`), Send beside it, hint line below, refusal below that. |

**Measured budget at 1600 × 860** (the owner's screen), from the classes above:

```
viewport                         860
shell padding (36 + 36)          -72   -> page-fill 788
header row (36) + gap + h1 (28)  -72
gap                               -8
banner stack                    -164 (one approval banner, 4-line reason)
                                -292 (cap: 34dvh, two or three banners, scrolls inside)
gap + tabs (45) + gap            -61
composer (8+48+6+16+8+1)         -87
list padding (py-3)              -24
-----------------------------------------
chat lines visible              ~372 px with 1 banner  (~16 lines of 20 px)
                                ~244 px with 3 banners (~6 lines with bubbles and spacing)
```

**On a 390 × 844 phone:** page-fill is 747. The header wraps to about 100 px, the title takes 56,
the banner cap is 287, then tabs (45) and the composer (87). That leaves **about 140 px of chat**.
The owner's "disaster" is literal, and on a phone it is worse than on desktop.

**Width:** at 1600 the content box is about 1176 px wide, but the chat column is capped at 768
(`chat-pane.tsx:100`). Roughly 400 px sits empty beside the chat while the plan is hidden behind
another tab.

### A.2 Every attention surface, and when each one shows

| # | Surface | Condition | File:line | Actions |
|---|---|---|---|---|
| 1 | Header column chip, amber "Needs you" | `card.column === 'needs_you'` | `card-header.tsx:368, 394-403` | none |
| 2 | Header phase text ("Plan v2 ready", "Grilling · 3 open points", "4/7 tickets") | `phaseLine(card)` | `card-header.tsx:404`; `domain/card-phase.ts` | none |
| 3 | **NeedsYouBanner** (2 px amber border, `p-4`) | `card.needs_you` and not closed, and `activeNeedsYou(events)` finds the newest unsettled `needs_you` raise in the **loaded** history | `card-page.tsx:96-98, 230-237`; `domain/director-flow.ts:96-115`; `needs-you-banner.tsx:49-93` | One button per action: answer, approve_plan, request_changes, start_planning, run_as_express, retry_step (buttons); raise_step_budget (link). The first is primary. |
| 4 | **EscalationBanner** (same amber box) | ticket escalations with `stage === 'owner'`, not settled, card open | `card-page.tsx:100-104, 239-246`; `escalation-banner.tsx:28-54` | Ticket links plus a primary "Show it / Show the first" |
| 5 | "N questions are waiting for you" box (same amber box) | pending ticket interactions that no escalation covers | `card-page.tsx:170-173, 248-266` | links only (answer on the ticket) |
| 6 | Offline / could not refresh | `!online` / `query.isRefetchError` | `card-page.tsx:220-228` | none |
| 7 | Patch refusal (type or close) | `patch.isError` | `card-header.tsx:440-444` | none |
| 8 | Plan tab dot | `phase === 'plan_ready'` | `card-page.tsx:186-191` | opens the tab |
| 9 | Tickets tab attention mark | any ticket `needs_you` | `card-page.tsx:179-184` | opens the tab |
| 10 | In-chat **PlanReadyCard** (signal-blue box, primary "Review plan") | `plan_ready` event | `chat-line-view.tsx:165-171`; `plan-ready-card.tsx:23-38` | Review plan |
| 11 | In-chat **step line**, e.g. "Approve the plan · Waiting for the owner to approve." | every `step_finished` | `domain/card-event-lines.ts:140-157`; summary from `packages/engine/src/tick/planning-plan.ts:205` | expand files |
| 12 | In-chat **QuestionBlock** (bordered card, options, Other…, two shortcuts) | the newest open grill question while grilling or verifying | `chat-line-view.tsx:158-164`; `question-block.tsx:54-158` | options, Other… (its own textarea), "Use your recommendations for the rest", "Enough, write the plan" |
| 13 | In-chat **EscalationCard** (full card, amber when pending) | `escalation_raised` event, drawn from live escalations | `chat-line-view.tsx:81-95`; `components/escalation/escalation-card.tsx` | the escalation's actions |
| 14 | In-chat research line ("7 facts (2 unverified)") | `research` event | `research-line.tsx` | See the evidence, Research settings |
| 15 | In-chat budget note ("Budget: $X of $Y spent… Work continues.") | `budget_warning` | `card-event-lines.ts:219-227` | none (d-0143 says the warning "asks to acknowledge"; there is nothing to acknowledge here) |
| 16 | DirectorStatus: thinking, reading, or "The Director hit a problem" | end of the list | `director-status.tsx:32-56`; `conversation-tab.tsx:248-253` | none (error says "send another message") |
| 17 | Plan tab decision bar and Floor box | `canDecide`; `floor.reasons` | `plan/plan-tab.tsx:131, 167-173, 183` | Approve plan, Request changes |

**Can several show at once? Yes.** Surfaces 3, 4, 5 and 6 can all render together. Surfaces 1, 2,
3, 8, 10, 11 and 17 all describe the same plan-approval state at the same moment. With one plan
waiting for approval and one ticket escalation, the owner sees **seven** markers of "waiting on
you" before reading a word of chat.

### A.3 Tabs and transcript

- **Conversation** (`tabs/conversation-tab.tsx`): one list mixes owner bubbles (right), Director
  markdown bubbles (left), grouped headers and day separators (`domain/chat-groups`), quiet note
  lines (ticket created, state, type changed, closed), "What the Director did" action lists
  (`chat-line-view.tsx:181-192`), step lines, research lines, question blocks, plan-ready cards
  and escalation cards. "Show earlier messages" pages older events (`:214-228`).
- **Plan**: version picker, diff toggle, decision bar, Floor box with reasons, body, tickets
  (light edits), links. Approving opens `PlanDialogs`, which states "creates N tickets in this
  order" (d-0133).
- **Evidence**: claims marked Verified or Unverified, with quotes and sources.
- **Tickets**: list with state and needs-you marks. **Details**: type, source, cost breakdown,
  dates.
- **Scroll containers:** the banner `ScrollArea` (`card-page.tsx:219`) sits directly above the
  chat `ScrollArea` (`chat-pane.tsx:82`). They are stacked rather than nested, but they are still
  **two scroll regions in one column**: the wheel over the banner scrolls the banner, a third
  banner is hidden below its fold, and `scrollIntoView` from a banner button scrolls the inner
  list. The other tabs use a third scroller (`TabPanel`), and each tab remembers its scroll.
- **Responsive:** nothing changes layout by breakpoint except the shell. The header `flex-wrap`s
  into 2-3 rows on a phone, and the tabs scroll sideways.

### A.4 Problems found, beyond the reported one

1. **Alerts are stacked, not aggregated.** Every kind gets its own full-size amber box, up to a
   34dvh cap, and then the boxes scroll. Primer and Carbon both say *one banner at a time* (§B).
2. **One state is said seven times.** For a plan waiting on approval: header chip, phase text,
   banner, Plan tab dot, PlanReadyCard, the step line "Approve the plan · Waiting for the owner to
   approve.", and the Plan tab's own decision bar. That is redundant and costly (Nielsen #8).
3. **The approval reason is one long sentence.** The engine joins structured floor reasons into
   one string, `The plan needs your approval: ${floorReasons.join('; ')}.`
   (`packages/engine/src/tick/planning-plan.ts:172`). The Director's own questions are joined with
   a space (`:217`). The web already receives the structured list as `PlanReply.floor.reasons`
   (`apps/web/src/schemas/plan.ts`, route `apps/server/src/routes/card-plan.ts:93`), but the
   banner prints the joined string.
4. **Primary buttons compete.** With a plan waiting, the screen shows the banner's primary
   "Review and approve", the PlanReadyCard's primary "Review plan", the composer's primary "Send
   message", and the escalation banner's primary "Show the first". The labels also differ for the
   same intent: "Review and approve", "Review plan", "Approve plan" (Nielsen #4).
5. **The plan and the conversation are mutually exclusive.** Reviewing the plan means leaving the
   chat tab, so the owner cannot ask the Director "why ticket 3?" while looking at ticket 3. This
   departs from **d-0134** ("the chat is always visible as the main column, Plan / Tickets /
   Details sit in a side panel (tabs on phones)"). The U1 pass (`d5cbbbf`) moved to tabs without a
   superseding decision record.
6. **The header "Plan" dropdown is the card type, not the phase.** The `Picker` at
   `card-header.tsx:416-423` shows the type label, and `plan` is a built-in type labelled "Plan"
   (`packages/core/src/schemas/card-type.ts:63-64`). The owner described it as a "phase/stage
   dropdown", which shows that it reads as status. A consequential, rarely used edit sits at top
   level next to a red destructive **Close card** button (Nielsen #2, #5).
7. **The open grill question has two free-text inputs.** QuestionBlock has an "Other…" textarea
   (`question-block.tsx:86-134`), and the composer also accepts the answer ("Type your answer to
   the open question…", `conversation-tab.tsx:187-189`). There are two ways to do one thing, and
   the question card scrolls away as the chat grows.
8. **Wasted width.** About 400 px stays empty at 1600 wide while content competes for height.
9. **Amber is everywhere.** Three identical 2 px amber boxes, plus amber chips and escalation
   cards, wear the "waits on you" signal out. NN/g's banner-blindness findings warn that coloured
   boxes at the top read as ad-like and get skipped (§B).
10. **The banner moves focus without warning.** "Answer the question" and "Show the first"
    `focus()` and `scrollIntoView` an element inside another scroller
    (`use-banner-actions.ts:16-22`, `use-escalation-focus.ts:25-31`). If the item is outside the
    loaded history window, nothing happens visibly (the comment admits "the focus simply waits").
11. **The Needs-you derivation depends on the loaded history window** (`activeNeedsYou` scans
    `history.data.events`). The card detail carries only the boolean `needs_you`, not the current
    raise, so the banner's text and actions depend on paging.
12. **Budget acknowledgment has no surface.** d-0143 says the card budget "warns and asks to
    acknowledge". The page shows only a passive note line.
13. **No accelerators.** Only Ctrl+Enter. There are no keys for options, approve, next waiting
    item, or switching to the plan (Nielsen #7).
14. **The phone experience is untested for this case.** The header wraps to three rows and the
    banner cap leaves about 140 px of chat (§A.1).
15. **The ticket page shares the frame** (`routes/ticket/ticket-page.tsx:239`, same `page-fill`
    plus a banner pattern), so it will inherit the same problem. Out of scope here, but the fix
    should be one shared component.

### A.5 Hallmark audit (no stamp, no `design.md`; the app has its own tokens)

Pre-flight: Tailwind 4 tokens in `apps/web/src/theme/app.css` (`bg-attn-soft`, `signal`,
`line`, `surface`…), `motion` installed (d-0103), React 19. The fix should preserve the palette
and type and change only structure and states.

| Severity | Tell | Where | Fix |
|---|---|---|---|
| major | Card-in-card stacking (box-in-box alerts above a list of bubble cards) | `card-page.tsx:218-268` | One queue component; items are rows, not boxes. |
| major | Every section padded the same (three identical `rounded-2xl border-2 border-attn p-4`) | `needs-you-banner.tsx:51`, `escalation-banner.tsx:30`, `card-page.tsx:249` | One container with one accent; items separated by hairlines. |
| major | Competing primaries / no single hierarchy anchor | banner, PlanReadyCard, composer | Exactly one primary per state, in the queue. |
| major | Wrap-to-two-lines clickable text (header `flex-wrap`, banner buttons at 320-414 px) | `card-header.tsx:385`, `needs-you-banner.tsx:58` | One-row header with overflow menu; queue actions sized to fit. |
| major | Status control that reads as a different status (type picker labelled "Plan") | `card-header.tsx:416` | Move to the overflow menu and Details. |
| minor | Dead width at desktop | `chat-pane.tsx:100` | Context rail. |
| minor | Redundant system lines (approve step line) | `card-event-lines.ts:140` | Hide the step line when a raise follows it. |

`0 critical · 5 major · 2 minor`.

### A.6 Nielsen audit of the current page

| # | Heuristic | Score | Note |
|---|---|---|---|
| 1 | Visibility of system status | 1 | Status exists but repeats; the third banner hides below the 34dvh fold; Director "thinking" shows only at the list bottom. |
| 2 | Match with the real world | 1 | "Plan" type picker reads as phase; "Tier C", "floor", "lighter pipeline" in reason text without explanation. |
| 3 | User control and freedom | 1 | Alerts cannot be collapsed; reviewing the plan means leaving the chat; Close card is a top-level red button. |
| 4 | Consistency and standards | 1 | Three alert boxes with three structures; "Review and approve" vs "Review plan" vs "Approve plan"; two free-text answer inputs. |
| 5 | Error prevention | 2 | Confirm dialogs for type change, close and approve (with ticket count). |
| 6 | Recognition rather than recall | 1 | Approval reasons sit in the banner, apart from the plan sections they refer to; the plan is invisible while chatting. |
| 7 | Flexibility and efficiency | 1 | Ctrl+Enter only. |
| 8 | Aesthetic and minimalist design | 0 | The reported problem: 7 markers for one state; chat gets about 30% of the height. |
| 9 | Recognise, diagnose, recover from errors | 2 | Plain-words refusals everywhere, draft kept. |
| 10 | Help and documentation | 1 | No in-context explanation of why a human must approve (Tier C, unverified claim). |

**11 / 20 — needs rework.**

---

## B. Research: how others handle this, and what the guidance says

Product documentation is thin on pixel layout, so each finding below says what the source itself
states. Patterns I know from using products but did not verify in a source this session are
marked **(unverified)**.

### B.1 Authoritative guidance on alerts and notifications

- **NN/g: Indicators, Validations, Notifications.** Separates *contextual* from *global* and
  *passive* from *action-required*. Quotes: indicators "should be shown in close proximity to that
  element"; "Action-required notifications are often urgent and should be intrusive"; "Passive
  notifications are typically not urgent and should be less intrusive"; "Passive notifications can
  easily be missed". **Implication:** a plan approval or ticket question is action-required and
  contextual to the card, so it belongs prominently *where the user acts*. A budget note is
  passive and should be quiet.
- **NN/g: Banner Blindness Revisited.** Users skip content in ad-typical places ("the top banner
  and the right rail") and with ad-like treatments ("colored backgrounds, fancy formatting").
  "Ignoring ads is a learned behavior." "Do not make content look like ads." **Implication:** a
  stack of coloured boxes at the top is the textbook pattern that gets skipped. A right rail is
  also a blindness zone, so the action-required queue should **not** live in the rail; the rail
  should hold reference content.
- **Carbon: Notifications pattern.** Clear type taxonomy (inline, toast, actionable, banner,
  callout, notification panel, modal). Rules: "Only show one banner at a time"; "Only one action
  per notification"; actionable notifications stay "until the user acts or dismisses it";
  "Place inline notifications near their related items"; "Don't use notifications that dismiss on
  a timer for critical or emergency messages"; actionable notifications that take focus can be
  disruptive to screen-reader and keyboard users; a *notification panel* keeps a history.
  **Implication:** many items need a queue or panel, not N banners. Actions do not steal focus.
- **Primer (GitHub): Banner guidelines.** "Banners can disrupt the user experience and should
  only be used when and where relevant." Only one banner per page (it "prevents stacking issues"
  and reduces alert fatigue). At most two actions, one primary. Critical banners are not
  dismissible until resolved. Keep messages short; add a title when the message is complex.
  "Never use flush banners at the top of a page or when a lot of space is available."
  **Implication:** the current stack breaks the one-banner and two-action rules. The approval
  item needs a short title plus details on demand.
- **Atlassian: Section message.** Use it for "important information within a section of a
  screen", when people must act to keep moving; banners are for site-wide information; content
  "should be as succinct as possible". **Implication:** card-level waits are section-scoped (the
  conversation), not page-banner material.
- **NN/g: Progressive disclosure.** "Initially, show users only a few of the most important
  options"; deeper levels must be clearly labelled; more than two levels gets users lost.
  **Implication:** show a one-line title and reason chips, with "Show reasons" as the only second
  level.
- **NN/g: Modal and nonmodal dialogs.** Modals "interrupt the user's workflow"; reserve them for
  irreversible actions or information needed to continue. **Implication:** keep the existing
  approve confirm dialog (it creates tickets, which cannot be undone) but never make the waiting
  queue modal.
- **Smashing (2025): Notifications UX.** Three attention tiers (high, medium, low), batching
  ("grouped into a single standalone message"), and in-context cards as the least intrusive form.
  **Implication:** rank and group items; budget notes are low tier.
- **Material banners, Apple HIG alerts:** the pages did not render through the fetcher, so
  nothing from them is cited here.

### B.2 How agent-work products lay out a thread with pending work

- **GitHub Copilot agent sessions (docs).** The session view is "the session log and overview";
  "The prompt box sits below the session log"; steering input is applied after the current tool
  call; Stop session lives in the log viewer; archive sits in an overflow (kebab) menu. **Takeaway:**
  log above a single prompt box, rare actions in an overflow menu.
- **GitHub PR merge box (changelog, Feb 2025).** One box "designed to help you better understand
  the state of your pull request and get it merged faster", listing review requirements, status
  checks and conflicts together. **Takeaway:** every pending requirement is aggregated into one
  status box at the end of the conversation, next to the comment box, rather than as banners at
  the top. (That the merge box sits right above the comment composer is from using GitHub;
  **unverified** in the changelog text.) This is the closest analogue to Forge's card page.
- **Claude Code in the cloud (docs).** Each session shows a compact diff indicator (`+42 -18`),
  and selecting it opens the diff view, so a heavy artifact sits behind one small indicator.
  "If Claude asks a question and the session sits idle, you can still answer when you come back",
  meaning the question persists until answered. A queued message can be taken back with ✕ and
  its text returns to the box. Rare session actions sit in the dropdown next to the title.
  **Takeaway:** compact indicator, then detail on demand; questions persist; title menu for rare
  actions.
- **Claude artifacts (help centre).** An artifact "opens in its own window beside your
  conversation"; substantial self-contained content leaves the chat. **Takeaway:** a plan is
  artifact-shaped (versioned, structured, more than 15 lines), so it belongs beside the chat.
- **Replit Agent (docs).** In Plan mode the agent writes an ordered task list to review; a "Task
  plans created" dialog offers "Accept tasks" and "Revise plan". **Takeaway:** exactly two plan
  actions, accept and revise, which matches Forge's Approve / Request changes.
- **Linear agent interaction (developer docs).** Typed activities: thought, action,
  **elicitation** (a request for clarification or confirmation), response, error. Session states
  include `awaitingInput`; thought and action activities can be *ephemeral* ("display temporarily
  and are replaced by the next activity"). **Takeaway:** "waiting on you" is a *state* with one
  current elicitation, not a pile of messages; progress lines can be transient.
- **Linear Inbox (docs).** Priority tab for what needs attention; keyboard J/K, U, H (snooze),
  G then I to open. **Takeaway:** keyboard-first triage of a queue; Forge's Inbox already
  follows this (d-0116), and the card page should reuse its vocabulary.
- **Devin session tools (docs).** Main chat plus a Progress/worklog view and tool tabs (Shell,
  IDE, Browser); a side chat "opens in a panel next to the worklog". **Takeaway:** conversation
  plus a work panel side by side is normal for agent sessions.
- **Cursor agents on web (blog), Codex cloud (docs), v0 (blog).** These confirm the review, follow
  up, open PR loop but do not describe their layout. Not used as evidence.
- **(Unverified, from product use)** Claude Code and Cursor show tool-permission prompts docked
  directly above the input, with the input still visible; ChatGPT Canvas puts the document beside
  the chat. Consistent with the above, but not cited.

### B.3 Patterns to adopt

1. **One aggregated queue for things waiting on you** (merge box, Carbon notification panel,
   Primer one-banner rule).
2. **Put it where the eyes and hands are,** at the bottom of the conversation next to the
   composer, not at the top or in a rail (NN/g banner blindness, merge box placement).
3. **One item open at a time, with a count of the rest** (Linear `awaitingInput` with one current
   elicitation; Primer one banner).
4. **Title, short reason chips, then details on demand** (Primer title rule, NN/g progressive
   disclosure).
5. **At most two actions, one primary** (Primer, Carbon, Replit Accept / Revise).
6. **Big artifacts beside the chat, not instead of it** (Claude artifacts, Devin panel, d-0134).
7. **Rare and destructive actions in a title menu** (Copilot kebab, Claude Code session dropdown).
8. **Passive items stay quiet** (NN/g passive notifications, Smashing low tier): budget notes and
   research lines remain in the transcript.

---

## C. Recommendation

### C.1 Shared building blocks (used by every option)

**1. Header in one row (48 px).** Replaces the 72 px header plus title row.

```
← Board  FX-C2  Add rate limiting to the public API…    [● Needs you · Plan v2]   $9.51   ⋯
```

- The title moves into the row as the `h1` (truncated, full text in a tooltip and in Details).
- The column chip and phase text merge into **one status pill** ("Needs you · Plan v2",
  "Grilling · 3 open", "In progress · 4/7"). It is amber only for Needs you.
- "from Chat" moves to Details.
- Cost stays as the small muted figure with its split tooltip.
- **⋯ menu:** Change type…, Close card…, Copy link. Type and Close keep their confirm dialogs.
  This removes the "Plan" dropdown confusion and the stray red button.
- A closed card shows "Closed" in the pill, with the reason as a single line under the header.
- Offline and refetch failures become a thin status line under the header (one line, `role=status`
  or `alert`), not a box.

**2. The Needs-you queue (`NeedsYouDock`).** One component, one source of truth.

- **Data:** `attentionItems(card, events, escalations, plan)`, a pure domain function that merges
  (a) the card's current raise, (b) owner-stage unsettled escalations, and (c) uncovered pending
  ticket interactions. Each item gets a `kind`, `title`, `reasons[]`, `actions[]` (≤ 2 shown, the
  rest in ⋯), `at` and `priority`.
- **Order:** card-level blockers first (plan approval, grill question, step budget, start
  planning), then escalations by kind (sign-off and decision before failure, setup and question),
  oldest first.
- **Collapsed (default when > 1 item):** one 44 px row, `● 3 waiting on you · Plan v2 needs your
  approval · Review ▸`.
- **Open item (default for the top item):**
  - title line: `Plan v2 needs your approval`
  - reason chips: `Tier C path` `Unverified claim` `Overlaps FX-C1`, plus `Show reasons ▾`
    (expands a bulleted list; long lists scroll *inside* the expanded area only, max 40% of the
    pane)
  - action row: one primary, one secondary, ⋯ for the rest
  - stepper `1 of 3 ‹ ›`
- **One open item regardless of count.** With three items the dock is never taller than one
  item's body (about 120-170 px) plus the 32 px "2 more" row. Zero items means no dock and zero
  cost.
- **Kinds rendered in the dock:**
  - **Plan approval:** reasons from `plan.floor.reasons`. Primary "Review plan" opens the plan in
    the rail (or as a sheet on narrow screens); once the plan is open, the primary becomes
    "Approve plan…", which opens the existing confirm dialog with the ticket count. Secondary:
    "Request changes".
  - **Grill question:** the question text, *why* behind a disclosure, option buttons (Recommended
    badge), number keys 1-4. "Other" focuses the composer, which already takes free text as the
    answer, so the second textarea goes away. "Use recommendations for the rest" and "Enough,
    write the plan" sit in ⋯ or a quiet text row.
  - **Ticket escalation:** a compact `EscalationCard` (same component as the Inbox and Ticket
    page, so one settles all three, as d-0135 requires), with ticket id and title.
  - **Step budget:** "Raise the step budget" (link) and "Retry the step".
  - **Start planning / Run as Express:** as today.
- **Transcript stays the record:** the question, plan-ready and escalation lines remain in the
  chat as compact history ("Asked: …", "Plan v2 ready · 6 tickets · Open plan"), with no primary
  buttons and a small "Waiting ↓" pointer while still open. The "Approve the plan · Waiting for
  the owner to approve." step line is hidden when a raise follows it.

**3. Composer** stays docked, always visible, directly under the dock. On a phone, focusing the
composer collapses the dock to its one-line summary so the keyboard leaves room for the chat.

### C.2 Option A: one column with the action dock (smallest change)

Keep the tabs. Replace the banner stack with the dock. Compress the header.

```
Desktop 1600×860 — three items waiting
┌──────────────────────────────────────────────────────────────────────────────┐
│ ← Board  FX-C2  Add rate limiting to the public API…  [● Needs you · Plan v2] $9.51 ⋯ │ 48
│ Conversation   Plan •   Evidence 25   Tickets 0   Details                     │ 40
├──────────────────────────────────────────────────────────────────────────────┤
│                ┌──────────── chat column (768) ────────────┐                 │
│                │ Director  Here is plan v2 …               │                 │
│                │ · Researched: 3 searches, 7 facts (2 unv.)│                 │
│                │ ▣ Plan v2 ready · 6 tickets · Open plan   │                 │
│                │ … ~20 lines of chat …                     │                 │  ≈ 520 px
│                │                         You  why ticket 3?│                 │
│                └───────────────────────────────────────────┘                 │
│                ┌───────────────────────────────────────────┐                 │
│                │ ● Plan v2 needs your approval      1 of 3 ‹ ›│               │
│                │ [Tier C path] [Unverified claim] Show reasons ▾│             │
│                │ [ Review plan ]  Request changes        ⋯   │                │ ≈ 120
│                │ ▸ 2 more: FX-12 asks a question · FX-14 failed │             │  32
│                ├───────────────────────────────────────────┤                 │
│                │ Message the Director…               [Send]│                 │ ≈ 80
│                └───────────────────────────────────────────┘                 │
└──────────────────────────────────────────────────────────────────────────────┘
```

- Zero items: no dock, chat ≈ 690 px. One item: no "more" row.
- **Pros:** small diff, works the same on every width, fixes the vertical budget (≈ 520 px of chat
  with three items, against ≈ 244 now).
- **Cons:** the plan is still in another tab during approval (problem A.4-5 stays), and the empty
  400 px stays empty.

### C.3 Option B (recommended): chat plus context rail, with the action dock

On wide screens (≥ 1280 px content width, about a 1536 px viewport with the sidebar) the page has
two columns:

- **Left:** the chat column with dock and composer, no tab strip.
- **Right:** a **context rail** (400-440 px, resizable within limits) with its own segmented tabs:
  Plan · Evidence · Tickets · Details. The rail is reference content. It holds no alerts, which
  keeps it out of the banner-blindness trap.

Below 1280 the rail becomes the tab strip (as Option A); on a phone, the Plan opens as a sheet.

Also raise the card page's shell max width (like the Board's 1480) so the rail does not squeeze
the chat.

```
Desktop 1600×860 — plan approval + 2 ticket items (3 total)
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ ← Board  FX-C2  Add rate limiting to the public API…   [● Needs you · Plan v2]  $9.51  ⋯ │ 48
├───────────────────────────────────────────────┬──────────────────────────────────────┤
│ Director  Here is plan v2. I split the …       │ Plan  Evidence 25  Tickets 0  Details│ 36
│ · Researched: 3 searches · 7 facts (2 unver.)  │ v2 ▾   Changes since v1              │
│ ▣ Plan v2 ready · 6 tickets   Open plan →      │ ┌ Why you need to approve ────────┐ │
│                                You  why is     │ │ • Tier C path: packages/core/…   │ │
│                                ticket 3 first? │ │ • Unverified claim: "Redis 8 …"  │ │
│ Director  Because the limiter needs …          │ │   → see evidence                 │ │
│                                                │ └──────────────────────────────────┘ │
│   … ≈ 22 lines of chat …                       │ Goal · Scope · Decisions · Risks     │
│                                                │ Tickets (6)                          │
│                                                │  1 Add limiter middleware   M  …     │
│                       [↓ Jump to latest (2)]   │  2 …                                 │
├───────────────────────────────────────────────┤                                      │
│ ● Plan v2 needs your approval        1 of 3 ‹ ›│                                      │
│ [Tier C path] [Unverified claim]  Reasons ▾    │                                      │
│ [ Approve plan… ]  Request changes         ⋯   │  (plan open → primary is Approve)    │
│ ▸ 2 more · FX-12 asks a question · FX-14 failed│                                      │
├───────────────────────────────────────────────┤──────────────────────────────────────┤
│ Message the Director…                  [Send]  │ Approve plan…   Request changes      │ sticky
└───────────────────────────────────────────────┴──────────────────────────────────────┘
chat ≈ 560 px with 3 items, ≈ 690 px with none
```

```
Desktop — zero items, card in progress
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ ← Board  FX-C2  Add rate limiting…              [In progress · 4/7]       $12.20   ⋯  │
├───────────────────────────────────────────────┬──────────────────────────────────────┤
│ chat (full height)                             │ Tickets 7 ▸ (rail opens on Tickets   │
│ …                                              │  once tickets exist; remembers the   │
│ Director is thinking… Reading FX-14 results    │  owner's last choice)                │
├───────────────────────────────────────────────┤                                      │
│ Message the Director…                  [Send]  │                                      │
└───────────────────────────────────────────────┴──────────────────────────────────────┘
```

```
Desktop — open grill question (one item), rail collapsed by the owner
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ ← Board  FX-C3  Export cards to CSV       [● Needs you · Grilling · 3 open]  $0.42 ⋯ ▸│
├──────────────────────────────────────────────────────────────────────────────────────┤
│                 … chat …                                                              │
│                 Director  Asked: Which columns should the export include?  Waiting ↓  │
├──────────────────────────────────────────────────────────────────────────────────────┤
│  ● Which columns should the export include?                      3 open points       │
│    Why it matters ▾                                                                   │
│    [1 All visible columns ✦Recommended] [2 Title and status only] [3 Let me pick]     │
│    Other: type in the box below · Use recommendations for the rest · Write the plan now │
├──────────────────────────────────────────────────────────────────────────────────────┤
│  Type your answer, or pick an option above                              [Send]        │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

```
Phone 390×844 — three items
┌──────────────────────────────┐
│ ←  FX-C2  [● Needs you]  ⋯   │ 48
│ Add rate limiting to the pu… │ 24 (clamp 1)
│ Chat  Plan•  Evid.25  Tick.  │ 40 (scrolls)
├──────────────────────────────┤
│ … chat … ≈ 380 px            │
│                              │
├──────────────────────────────┤
│ ● Plan v2 needs approval 1/3 │
│ [Tier C] [Unverified] ▾      │
│ [Review plan] Request changes│ ≈ 112
│ ▸ 2 more waiting             │ 28
├──────────────────────────────┤
│ Message the Director… [Send] │ ≈ 76
└──────────────────────────────┘
composer focused → dock collapses to "● 3 waiting · Plan v2 ▴" (36 px)
"Review plan" → full-screen Plan sheet with a sticky
[Approve plan…] [Request changes] bar and a "Back to chat" control.
```

#### Why B over A and C

- **It answers the complaint directly.** The chat gets about 65% of the page height on desktop
  with three items (≈ 560 of 788, against ≈ 244 today), and the dock's height does not grow with
  the number of items.
- **It matches the research.** One aggregated queue (Carbon, Primer, merge box); action-required
  items intrusive but placed where the user acts (NN/g); reference content beside the
  conversation (Claude artifacts, Devin panel); at most two actions with one primary (Primer,
  Replit); short title plus details on demand (Primer, NN/g progressive disclosure).
- **It restores an accepted decision.** d-0134 asked for exactly this: chat always visible, Plan,
  Tickets and Details in a side panel, tabs on phones. Nobody recorded a decision against it.
- **It removes the seven-fold redundancy:** the status pill keeps state, the dock holds the one
  action, the transcript keeps history, the rail holds the plan.
- **Option C** (all alerts in a right "Needs you" rail, tabs unchanged) was rejected: the right
  rail is NN/g's named blindness zone ("the top banner and the right rail"), it puts actions far
  from the composer, and phones would still need a second design.

#### Nielsen check of Option B

| # | Heuristic | How B covers it |
|---|---|---|
| 1 | Visibility | Status pill always visible; the dock's count and stepper say how many items wait; DirectorStatus at the list end; dock items show "Working…" while an action runs. |
| 2 | Real world | Plain titles ("Plan v2 needs your approval"); reason chips with a one-line explanation of Tier C and unverified claims; type moved out of status position. |
| 3 | Control and freedom | Dock collapses (Esc) and re-expands; the rail closes or resizes; plan review never leaves the chat; Close card moves behind ⋯ with its confirm. |
| 4 | Consistency | One label per intent ("Review plan", "Approve plan…", "Request changes"); one alert container; the same EscalationCard as the Inbox and Ticket page. |
| 5 | Error prevention | Approve keeps the "creates N tickets in this order" dialog; destructive actions only in ⋯ with confirms. |
| 6 | Recognition | Reasons visible next to the plan they apply to; the plan visible while chatting; options visible in the dock. |
| 7 | Efficiency | Keys: 1-4 for options; `Alt+↓/↑` next/previous waiting item; `Alt+P` toggle rail; Ctrl+Enter send; `G I` (existing Inbox convention) to the Inbox. |
| 8 | Minimalist | One place per piece of information; no stacked boxes; zero dock when nothing waits. |
| 9 | Errors | Action failures shown inside the item that failed (never hidden by collapsing); offline and refetch as one line. |
| 10 | Help | "Why it matters ▾" on questions, "Reasons ▾" on approvals, an evidence link from unverified claims. |

#### Information hierarchy (top to bottom of attention)

1. The open dock item: the one thing to decide now.
2. The chat: the conversation that explains it.
3. The rail: the plan, evidence and tickets used to decide.
4. The header: where the card stands and what it cost.
5. The ⋯ menu: rare and consequential edits.

#### What moves, what goes

| Today | Option B |
|---|---|
| NeedsYouBanner, EscalationBanner, "questions waiting" box | → dock items |
| Offline / refetch boxes | → one-line status under the header |
| Column chip + phase text | → one status pill |
| "from Chat" | → Details |
| Type picker, Close card | → ⋯ menu (and Details for type) |
| `h1` row | → in the header row |
| Tab strip (desktop) | → rail segmented tabs; no Conversation tab on desktop |
| PlanReadyCard primary button | → quiet "Open plan →" link |
| "Approve the plan · Waiting for the owner…" step line | → hidden when a raise follows |
| QuestionBlock in the transcript | → actionable copy in the dock; transcript keeps a compact "Asked:" line |
| "Other…" textarea | → the composer |
| Plan tab decision bar | → sticky footer of the rail's Plan view (the same buttons as the dock) |

#### Keyboard and accessibility

- Dock is a `region` named "Waiting on you (3)". Items are a list. The stepper buttons have names
  ("Next waiting item, 2 of 3").
- New items are announced once via a polite live region ("New: FX-12 asks a question"). Focus is
  **never** moved by arrival (Carbon on actionable notifications taking focus).
- Banner buttons that move focus today go away. "Review plan" moves focus into the rail's Plan
  heading. On a phone the sheet traps focus and Esc or "Back to chat" returns it to the invoking
  button.
- Every action keeps a visible text label and a 36 px minimum target. The amber dot always comes
  with words. Reduced motion is respected.
- The rail is a `complementary` landmark with its own heading; the chat list keeps `role=log`.

#### Motion

- Dock open, close and item change: height and opacity spring via `motion` (d-0103), 150-200 ms,
  no overshoot. Reduced motion falls back to an opacity crossfade of 150 ms or less.
- When the dock resizes, the chat list must stay pinned to the bottom if it was there.
  `use-stick-to-bottom` needs a ResizeObserver on the list's container, otherwise a growing dock
  hides the newest line.
- A settled item collapses out after a short "Approved ✓" state (about 1.2 s, aria-announced),
  then the next item slides into place. No celebratory toast.

#### States

| State | Behaviour |
|---|---|
| Loading card | existing StatePanel |
| Loading conversation | list skeleton; dock waits for history and escalations, so it never flashes the wrong item |
| Zero items | no dock |
| One item | open, no stepper |
| Many items | top one open, "N more" row, stepper |
| Action in flight | that item's button shows loading; other items stay usable |
| Action refused | error inside the item, item stays open |
| Offline | header status line; dock actions disabled with the reason "You are offline" |
| Closed card | pill "Closed", reason line, no dock, composer disabled with the reason (as today) |
| Item outside the loaded history window | the dock still shows it (it is built from live data, not the transcript); "Show in chat" loads older pages until found |
| Director error | DirectorStatus in the list; if a raise exists it stays in the dock |

### C.4 Backend data: what is missing

Nothing blocks Option B. All of it can be built client-side today from `useCardDetail`,
`useCardEvents`, `useCardEscalations` and `usePlan` (`PlanReply.floor.reasons` is already
structured). Four additions would make it robust:

1. **Structured raise payload.** `NeedsYou` (`apps/web/src/schemas/card-events.ts:83-93`, emitted
   by `askOwner` in `packages/engine/src/tick/planning-state.ts:151-164`) carries only
   `reason: string`. Add optional `kind` (`plan_approval | director_questions | step_budget |
   start_planning | held_ticket`), `title`, and `items: string[]` (floor reasons or the
   Director's questions). Today those are joined with `'; '` (`planning-plan.ts:172`) and `' '`
   (`:217`). With zod defaults, older events still parse.
2. **Typed floor reasons.** `FloorResult.reasons` (`packages/core/src/schemas/plan.ts:143-147`)
   is `string[]`. Adding `{ code: 'tier_c' | 'rejected' | 'overlap' | 'changed' | 'lighter' |
   'unverified', text, subjects[] }` would give clean chips and grouping. Until then, a client
   domain function can map the known prefixes from `checkFloor` (`approval-floor.ts:36-67`) and
   fall back to plain text.
3. **Current raise on the card detail.** Expose `needs_you_detail` (the active raise) on
   `GET /cards/:id`, so the dock does not depend on which history window is loaded
   (`activeNeedsYou` scans loaded events) and the Board and Inbox can show the same title.
4. **Budget acknowledgment** (d-0143 "asks to acknowledge"). If the owner wants it in the dock,
   it needs an ack event or endpoint. Today it is only a note line.

### C.5 Build notes (for when it is scheduled)

- New pure module `domain/attention-items.ts` with property tests; components
  `components/card/needs-you-dock.tsx` and `routes/card/context-rail.tsx`.
  `card-page.tsx`'s banner block goes away.
- The ticket page uses the same frame (`routes/ticket/ticket-page.tsx:239`), so the dock should be
  shareable there next.
- Record the layout as a decision that amends d-0134 (or confirms it) and update
  `docs/design/ui-screen-map.md`.
- Run Hallmark and Nielsen again on the built screen, at 320, 375, 414, 768, 1280 and 1600 px.

---

## Open questions for the owner (with recommended answers)

1. **Side rail on wide screens (Option B), or keep tabs and only add the dock (Option A)?**
   Recommended: **B**. It restores d-0134 and lets you review the plan while you chat.
2. **Should the open grill question move from the transcript into the dock above the box?**
   Recommended: **yes**. The transcript keeps a one-line record, and "Other" becomes typing in the
   normal box.
3. **Move Change type and Close card into a ⋯ menu?** Recommended: **yes**. Both keep their
   confirm dialogs, and the header stops showing a "Plan" dropdown that reads like a phase.
4. **Should budget warnings join the dock with an Acknowledge button?** Recommended: **no**. Keep
   them as quiet chat lines and Inbox items (d-0143: cost is informational).
5. **Ship the four backend additions (C.4) with the UI, or after?** Recommended: **ship 1 and 3
   with the UI** (structured raise and the current raise on the card detail); 2 can follow.

---

## Sources (read this session)

- NN/g, Indicators, Validations, and Notifications: https://www.nngroup.com/articles/indicators-validations-notifications/
- NN/g, Banner Blindness Revisited: https://www.nngroup.com/articles/banner-blindness-old-and-new-findings/
- NN/g, Progressive Disclosure: https://www.nngroup.com/articles/progressive-disclosure/
- NN/g, Modal & Nonmodal Dialogs: https://www.nngroup.com/articles/modal-nonmodal-dialog/
- NN/g, 10 Usability Heuristics (skill reference): https://www.nngroup.com/articles/ten-usability-heuristics/
- Carbon Design System, Notifications pattern: https://www.carbondesignsystem.com/building-blocks/core/patterns/notifications
- Primer, Banner guidelines: https://primer.style/product/components/banner/guidelines/
- Atlassian Design System, Section message usage: https://atlassian.design/components/section-message/usage
- Smashing Magazine, Design Guidelines for Better Notifications UX (2025): https://www.smashingmagazine.com/2025/07/design-guidelines-better-notifications-ux/
- GitHub Docs, Managing agent sessions: https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/manage-and-track-agents
- GitHub Docs, Agent sessions in the Copilot app: https://docs.github.com/en/copilot/how-tos/github-copilot-app/agent-sessions
- GitHub Changelog, Improved pull request merge experience (2025-02-12): https://github.blog/changelog/2025-02-12-improved-pull-request-merge-experience-enabled-by-default-in-public-preview/
- Claude Code docs, Use Claude Code in the cloud: https://code.claude.com/docs/en/claude-code-on-the-web
- Claude Help Center, What are artifacts: https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them
- Replit Docs, Agent: https://docs.replit.com/replitai/agent
- Linear Developers, Agent interaction: https://linear.app/developers/agent-interaction
- Linear Docs, Inbox: https://linear.app/docs/inbox
- Linear Docs, Coding sessions: https://linear.app/docs/coding-sessions
- Devin Docs, Session tools: https://docs.devin.ai/work-with-devin/devin-session-tools
- Cursor blog, Cursor on web and mobile: https://cursor.com/blog/agent-web
- OpenAI / ChatGPT docs, Codex cloud: https://learn.chatgpt.com/docs/cloud
- Vercel blog, Introducing the new v0: https://vercel.com/blog/introducing-the-new-v0

Tried, no usable content (JS-rendered or blocked): Material banners (m2.material.io), Apple HIG
Alerts, Atlassian section-message examples page, OpenAI "Introducing canvas" (403), GitHub
"new merge experience beta" changelog (404).

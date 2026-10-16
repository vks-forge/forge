---
id: d-0139
kind: decision
statement: Board columns under the card-first flow are Shaping (grilling, verifying, writing the plan), Needs you (waiting on the owner's answer or approval), Queued (approved but waiting on a dependency card or a free Worker slot), In progress, Done, with Closed as a collapsed strip and count that opens on click; New is dropped because the Director starts at once. All columns fit at 1440px; smaller screens scroll inside the board. A card face shows id, title, priority marker, a phase line ("Grilling - 3 open", "Verifying", "Plan v2 ready", "2 of 4 tickets done"), a progress bar once tickets exist, and dependency chips (Blocked by / Blocks). Hovering or focusing a card highlights its dependencies and dependents and dims the rest. Cards glide between columns on phase change and update in place, live (d-0132). The Tickets view stays as the second tab. The uncommitted 2026-10-16 board redesign is folded in (its column and card styling kept; layout and the Ask the Director box replaced), not reverted first.
source: { type: chat, ref: "2026-10-16 user, grill Q12 (board under the new flow): \"ok\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-16
superseded_by: null
supersedes: [d-0107]
tags: [board, cards, ui, motion, dependencies]
pinned: false
---
Columns stay rolled up from card phase and ticket state, never moved by hand
(carried over from d-0107).

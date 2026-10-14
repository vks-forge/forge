---
id: d-0109
kind: decision
statement: Chat lives in two places - the card chat is the user's conversation with the card's Director about the whole request; each ticket page shows its Worker's live thread and the user can message that Worker directly (steer). Worker questions and the user's Worker messages also appear as events in the card history and in Needs you. The card's Director can steer the card's Workers on its own judgement or on the user's instruction in the card chat - send new instructions, pause, stop, restart with changed instructions, start a new Worker or ticket, re-plan (update the plan, cancel or replace tickets, change dependencies). Every Director steering action goes through the engine's single doors (state transition, driver steer/cancel), is recorded on the card and ticket with its reason, and stopping a Worker keeps its worktree and receipts.
source: { type: chat, ref: "2026-10-14 card grill Q5: \"go with option 2, also director should be also able to steer the workers as required. for example i am dissucing with director and while i looked that a worker is doing wrong wronk and other workers are also dependednt on that i chat with director and director then steep the workers as required, like stop, start new worker, plan changed, give new instuctions etc\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-14
superseded_by: null
supersedes: null
amends: [d-0003]
tags: [cards, chat, director, steering, workers]
pinned: false
---

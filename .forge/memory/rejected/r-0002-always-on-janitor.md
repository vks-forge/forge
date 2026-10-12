---
id: r-0002
kind: rejected
statement: Run an always-on background agent that continuously cleans and consolidates memory.
source: { type: chat, ref: 2026-10-12 user floated it; research recommended event-triggered instead; user accepted }
author: user
origin: owner
status: active
valid_from: 2026-10-12
tags: [memory, janitor]
---
Reason: lazy recurrence-triggered consolidation cut token cost up to 87% with
no accuracy loss (RecMem); automatic merge has merge recall <= 0.062 and
silently destroys current values; no controlled study shows an always-on
janitor improves coding outcomes. Replaced by the event-triggered,
propose-only janitor in `memory-system.md` §9.

---
id: d-0138
kind: decision
statement: The Create card popup (large Modal; backdrop does not close it, a dirty close asks to discard) has Title (required, 4-120 chars), Description (required, markdown, at least 20 chars, hint "What do you want, and why? The Director will ask the rest."), Type (required, default Plan; Plan / Discussion / Issue; the Director may suggest a change in its first message, the user confirms), Priority (Low / Normal / High / Urgent, default Normal; orders the card's tickets in the queue and cards within a column), Depends on and Blocks (searchable pickers over open cards, refused on the spot if they would make a cycle), and Links (URLs the Director reads as context). Validation is inline and Create stays disabled until valid. On Create the popup closes, the card animates into Shaping, the card page opens on its chat with a "Director is reading the project..." indicator until the first question arrives live. The free-text "Ask the Director" box is removed from Board and Home and replaced by a New card button in the board header and on Home.
source: { type: chat, ref: "2026-10-16 user, grill Q11 (Create card popup fields): \"ok\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-16
superseded_by: null
supersedes: null
amends: [d-0128, d-0129]
tags: [cards, ui, intake, dependencies]
pinned: false
---

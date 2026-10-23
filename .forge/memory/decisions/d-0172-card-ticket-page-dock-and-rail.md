---
id: d-0172
kind: decision
statement: Card and ticket pages are redesigned together - a one-row header (status pill, cost, a menu holding Change type and Close), chat as the main column with the composer always visible, Plan / Evidence / Tickets / Details (ticket - its own panels) in a side rail on wide screens (tabs below 1280 px, full-screen sheet on phones), and everything waiting on the owner in ONE "needs you" dock above the composer that shows one item at a time with a count and never grows with the number of items; an open Director question lives in that dock with its options, typing in the composer is its "Other" answer, and the chat keeps a one-line record; the server sends needs-you items as structured data (kind, title, list of reasons) and the card/ticket detail carries the current item. Budget warnings stay quiet in chat and Inbox (d-0143).
source: { type: chat, ref: "2026-10-19 user, after the card page research: \"i need full redesign of the director and agents page ... after some action alerts there is no space in chat ... suppose if more than 1 alert appears then how disaster is this\"; answers: layout B side panel + box, Director question into the box, server cleanups with the UI, ticket page both now" }
author: user
origin: owner
status: active
valid_from: 2026-10-19
superseded_by: null
supersedes: null
amends: [d-0134]
tags: [ui, cards, tickets, chat, needs-you]
pinned: false
---

Research: docs/briefs/card-page-redesign-research.md. Restores d-0134's chat-first
side panel (the tabbed layout replaced it without a record) and replaces the
stacked banners and the pinned Needs-you banner with the dock.

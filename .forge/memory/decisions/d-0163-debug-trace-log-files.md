---
id: d-0163
kind: decision
statement: Forge gets a debug trace log that records everything end to end (card creation, chats, every Director step with full prompt, raw output, parsed result, cost and duration, every Worker run event with tool inputs and outputs, ticket and card transitions, escalations), written only to JSON-lines files with secrets redacted, split into one combined file per day plus one file per card, and switched on or off by an environment variable.
source: { type: chat, ref: "2026-10-17 user: \"i also want a logger system, this will log everything like starting from card cretion to what is agent going, agent and directors steps, work progress, chats eveything so i can debug what is happening fully\" + answers: files only; full content; per day + per card; \"should be enabled and disbaled from env.\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-17
superseded_by: null
supersedes: null
amends: []
tags: [observability, debug, logging]
pinned: false
---

Files only (no UI page). Full content, not summaries. The env switch is a debug switch, which
code rule 9 allows for env vars. Brief: docs/briefs/debug-trace-log.md.

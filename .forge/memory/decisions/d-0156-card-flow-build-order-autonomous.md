---
id: d-0156
kind: decision
statement: The card-first flow is built in this order - S1 foundation (card phases, create-card popup, dependencies, durable reply queue, live stream, Picker component), S2 Director planning with the Director settings page and flow editor, S3 card page and board in parallel with S2 (native selects replaced by the Picker), S4a escalations (question, failure, setup), S5a agents (store, Agents area, Runs on with harness health, models, fallback, Test agent, templates, Director-drafted agents, Express on the agent store), S5b stage runner with three lane pipelines per project, the list editor, routing rules and the Standard lane, S5c Full lane with S4b sign-off and decision escalations, S5d Director per-ticket pipeline adjustments and scorecards, S6 research. The owner approved the plan and an autonomous run: each slice is briefed, built test-first, gated by the orchestrator, then committed and pushed; the run stops only for owner decisions, aiming to finish as soon as possible.
source: { type: chat, ref: "2026-10-16 user, on the updated build order: \"yes accept, go autonomus, try to finish the work asa soon as possible\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-16
superseded_by: null
supersedes: null
amends: [d-0141]
tags: [build-plan, autonomous, cards, agents, pipelines]
pinned: false
---

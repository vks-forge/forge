---
id: d-0175
kind: decision
statement: An `ask` rule hit by a Worker in the Standard or Full lane is a real question to the owner, never a silent denial. The Worker pauses and the owner gets a needs-you item naming the exact action (command, URL or path) and why, with Allow once (that call only), Always for this project (a project grant rule, revocable in settings) and Deny; the run continues after the answer. With no answer the Worker is told plainly and the ticket parks with the item; a run never ends "success" with the work blocked. Express (unattended) still turns `ask` into deny.
source: { type: chat, ref: "2026-10-20 user, choosing how Worker actions set to 'ask' should work after CHE-2 was silently denied 7 tool calls (web_fetch, installs, writes under prisma/migrations/): \"Real approvals (Recommended)\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-20
superseded_by: null
supersedes: null
amends: []
tags: [tools, policy, approvals, needs-you, workers, lanes]
pinned: false
---

Brief: docs/briefs/real-tool-approvals.md.

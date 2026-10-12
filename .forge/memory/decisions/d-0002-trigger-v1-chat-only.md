---
id: d-0002
kind: decision
statement: Trigger plane v1 accepts only user-typed prompts, implemented as a `chat` TriggerAdapter behind a pluggable interface; webhook, cron, telemetry and bug-report adapters come after the core loop is proven.
source: { type: chat, ref: 2026-10-12 user message "for now we will have user type the prompt" }
author: user
origin: owner
status: active
valid_from: 2026-10-12
supersedes: null
superseded_by: null
tags: [trigger-plane, scope]
pinned: true
---
Reason: prove the core loop on the simplest trigger first. The `IntakeEvent`
envelope in `docs/design/director-core.md` §7 is fixed now so later adapters
add nothing downstream.

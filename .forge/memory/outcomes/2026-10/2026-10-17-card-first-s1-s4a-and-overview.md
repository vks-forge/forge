---
type: outcome
date: 2026-10-17
author: director
---

# Card-first flow S1–S4a and Overview dashboard (autonomous run, d-0160, d-0162)

## Done
- `ea59461`: S1 foundation + S3 card page and board. CI green.
- `46904d5`: S2 Director planning (engine flow, migration 0022 card_plans, HTTP routes, Director settings) + Overview dashboard at `/` (`GET /stats/overview`, SVG charts, projects table). CI green (run 38950773560).
- S4a ticket escalations built (backend, web, integration seams), brief `docs/briefs/s4a-ticket-escalations.md`; migration 0023. Typecheck, lint and prettier are green on the orchestrator's run. **Not committed:** the orchestrator's full unit+web test run was stopped by the host for low memory. Builders reported green on their scopes: web 823, server 776, engine+core+db 2654.
- S5a brief drafted: `docs/briefs/s5a-agents.md` (migration 0024; start after the S4a commit).

## Decided (defaults taken, owner may revisit)
- S4a: auto-answer at confidence ≥ 0.8 with cited grounds, never Tier C; one Director retry per ticket and cause; review/sign-off waits offer only Rework/Cancel until S4b; on re-plan, done and running tickets stay and not-started ones are cancelled when the new plan is approved.
- S5a: see the "Open questions" section of the brief. The lane model stays the "Forge default"; a test agent costs at most $0.10 and runs for at most 60 s; the implementer cannot be disabled until S5b.

## Pending
- Rerun the unit and web suites (2 workers) when memory allows, then commit and push S4a. PRODUCT.md already has the S4a line in the working copy. Exclude the sandbox files from the other session.
- Then S5a → S5b → S5c → S5d → S6 (briefs still to write for S5b onwards).
- Known gaps: `runAsExpress` lowers the lane by a field write, not `transition()`; the catalogue has no web page, so "Fix in settings" for unknown tools has nowhere to go; an Overview load over 12m or all reads every row (needs a daily rollup later).

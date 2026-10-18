---
type: outcome
date: 2026-10-18
author: director
---

# S5a–S6: agents, pipelines, Full lane, Director pipelines and research (autonomous run, d-0164)

## Done
- `2de1a86` S5a-B agents screens + S5b-A stage runner (Standard live). `54c7744` S5b-B pipeline editor and ticket stage strip.
- `f555508` S5c Full lane live (Director check, sign-off, owner overrides; migration 0026). CI green.
- `2ca3653` fix: enhance-pass questions were dropped once the grill was `done` (DCP-C3 stuck with no reply); self-heal in the planning sweep and a no-silent-reply guard. Shipped as a hotfix from a worktree.
- `a897773` S5d Director pipelines (per-ticket adjust door, proposals, scorecards, finding marks, agent fallback; migration 0027) + Test agent with no dollar cap that names its question (d-0167). CI green.
- `ad9e9ed` S6 research in planning (new `packages/research`, research step, quote-verified evidence, unverified outside claim fails the approval floor, Worker `web_fetch` provenance, budget warnings in Inbox; migration 0028) and its web part (Evidence tab, Research settings, budget cap).

## Decided (defaults taken, owner may revisit)
- S5c: Standard at the rework cap holds with Merge anyway; the Director signs tier B up to a ceiling; parallel writers share one worktree with disjoint scopes.
- S5d: locked stages (merge, G1, gates, sign-off, human) cannot be changed by the Director; a stage removal needs owner approval.
- S6: provider SearXNG or none; unverified outside claims send the plan to the owner; fetch scope is search results, the card and owner answers.

## Learned
- A server restart signs every browser out (memory-only sessions); give a fresh `forge open` link after each restart.
- Heavy git and e2e tests time out when a builder runs at the same time; they pass on an idle machine. Run them after builders finish, 1–2 workers.
- Claude Code reaps background shells under memory pressure, including the 4310 server.

## Pending
- The 4310 server was stopped by the host for low memory at the end of the run; it was serving the hotfix worktree. Next start: back up the DB (pre-0027/0028), build main, start from main, remove `../forge-hotfix`.
- Small: macOS `killTree` flake in `claude-support.test.ts`; `debug-trace` e2e hook close to its 120 s timeout; browser check of the S5d/S6 pages; an existing DB keeps the old `submit_review` schema hash until its tool catalogue is updated.

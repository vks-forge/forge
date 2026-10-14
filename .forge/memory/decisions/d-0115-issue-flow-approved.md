---
id: d-0115
kind: decision
statement: The issue flow in `docs/design/issue-flow.md` is approved - poll + dedup job per issue body hash; Stage 0 store and fence untrusted text; Stage 1 cheap deterministic-first triage (skip label, closed/empty, pre-ranked related search top 10, duplicate judge, needs-info, rough size and risk); Stage 2 budgeted read-only deep analysis (localise file -> symbol -> line, reproduction test, root cause with file:line evidence, 3-hop blast radius, history and owners, related Forge cards/tickets/PRs, plan); Stage 3 verification of every finding (citation check at HEAD then a different-model judge, confidence 0.2/0.5/0.9, below 0.7 never drives the verdict); Stage 4 typed verdict auto-ready | needs-approval | needs-info | duplicate | not-actionable where the LLM proposes and a deterministic floor can only make it stricter (proven by an adversarial eval); auto-ready requires all nine gate checks; Stage 5 a policy layer acts (auto-ready -> card; everything else waits; closing or posting on GitHub as duplicate / not-actionable needs the user's confirm). The analyst is read-only and proposes through a typed channel; the report may say "unknown" instead of guessing.
source: { type: chat, ref: "2026-10-14: user \"approved\" (issue flow draft docs/design/issue-flow.md)" }
author: user
origin: owner
status: active
valid_from: 2026-10-14
superseded_by: null
supersedes: null
amends: [d-0113, d-0114]
tags: [issues, analysis, verdict, safety, github-issues]
pinned: true
---

Sources: councilor-harness/councilor @ 9deec86 (PR-side machinery reused; its
issue side auto-fixed without analysis or approval) and public prior art
(CodeRabbit, Devin, Copilot agent, OpenHands, Agentless, Issue2Test, Linear,
gh-aw), studied 2026-10-14.

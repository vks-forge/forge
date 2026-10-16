---
id: d-0159
kind: decision
statement: "/" becomes a cross-project Forge Overview dashboard - KPI strip (spend in range with change vs previous period, spend this month, tickets done and in progress, waiting on you across projects, workers running, active projects, G1 pass rate), charts (spend over time stacked by project, tickets done vs started, runs by outcome, spend breakdown by project / harness-model / lane) with ranges 7d / 30d / 90d / 12m / All and Day / Week / Month grouping, a projects table with sparklines, cross-project needs-attention items, and an honest cost-coverage note - served by one aggregate endpoint over the existing core stats functions with no new tables. Project Home stays; "Overview" is the first item in the Forge sidebar section. Deferred - designed in docs/briefs/forge-overview-dashboard.md, built when the owner says go.
source: { type: chat, ref: "2026-10-16 user: \"http://127.0.0.1:4310/ - this page needs ful UI rewrite. add functionlity, show stats including merging all projects etc. need to show graph, cost totally with days|months etc.\" then, on the proposal: \"add this to proposal so later we can build this\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-16
superseded_by: null
supersedes: null
amends: [d-0104]
tags: [ui, dashboard, stats, cost, deferred]
pinned: false
---

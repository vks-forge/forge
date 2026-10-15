---
id: d-0118
kind: decision
statement: apps/web is built per docs/design/web-build-plan.md - batches W1-W8, each UI batch paired with the backend it needs. Every screen is real UI against the real API where an endpoint exists and against a typed mock adapter (same ForgeApi port, types from @forge/core schemas) where it does not; the mock is swapped for the real endpoint in the batch that builds that backend, and no release ships a screen on mock data. In dev the Vite proxy adds the install token server-side so it never reaches browser JS. W1 (scaffold, theme, motion, shell, data layer) first, then W2-W4 in parallel.
source: { type: chat, ref: "2026-10-15 user asked \"please start the web app with subagents , do we have to add functionlity now or only the UI?\"; replied \"approved\" to the W1-W8 plan" }
author: user
origin: owner
status: active
valid_from: 2026-10-15
superseded_by: null
supersedes: null
tags: [ui, apps-web, plan, api, mock]
pinned: false
---

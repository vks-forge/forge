---
id: d-0096
kind: decision
statement: Ticket sources are adapters behind the `TriggerAdapter` port, one folder per source, so more sources can be added without engine changes. First release - chat in the UI only. First added source - GitHub Issues, opt-in per project - an issue with a configurable label (default `forge`) becomes a ticket; Forge posts status comments, links its PR, and updates the issue when the PR closes; polled (no webhooks on local installs); the App manifest gains the Issues permission. Jira, Linear and others come later as further adapters. No source starts work directly - every incoming item enters Director triage like a chat request, and items from authors outside a per-project allow-list wait for the user's approval.
source: { type: chat, ref: "2026-10-14 grill product shape Q13: \"go with recomndation. make this as adapter so later we can add more gates into it\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-14
superseded_by: null
supersedes: null
amends: [d-0002]
tags: [triggers, intake, github-issues, adapters, security, product]
pinned: false
---

"more gates" read as more intake sources (gateways); confirm if it meant G-gates.
The allow-list rule stops strangers on public repos from starting Workers.

Confirmed 2026-10-14 ("otheris approved"): "more gates" = more intake sources.

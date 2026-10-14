---
id: d-0084
kind: decision
statement: Each Forge install creates its own GitHub App in the company's GitHub account/org through GitHub's App Manifest flow (one click, GitHub returns app id, private key, webhook secret); Forge stores the key locally and never in a Forge-hosted service. Manual entry of an existing App's id + key stays as a fallback (GitHub Enterprise, locked-down orgs). A Settings page manages it - connect/create the App, see its status and installations, install on more repos, rotate or replace the key, disconnect. PR status is polled (local installs cannot receive webhooks).
source: { type: chat, ref: "2026-10-14 grill product shape Q2: \"option 2, should eb a settings page for this where it can be managed\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-14
superseded_by: null
supersedes: null
tags: [git, github-app, settings, ui, onboarding]
pinned: false
---

Refines d-0083 (App answers "who owns it") and d-0062 (GitHub App host).
Rejected: one Forge-owned shared App (needs a Forge cloud backend holding the
key; a key shipped in the exe is extractable).

---
id: d-0095
kind: decision
statement: Project onboarding = detect, verify, then a Director onboarding chat. Forge works for any language, so project settings are fully dynamic - no fixed language profiles. A project's checks are a user-editable list of named commands, each with a role (test, lint, typecheck, build, format, or custom) and a working directory; any role may be absent. Detection is read-only and layered - ecosystem detectors (lockfiles/manifests for Node, Python, Go, Rust, JVM Maven/Gradle, .NET, Ruby, PHP, C/C++ CMake/Make, ...), CI workflow files, and a Director pass that reads the repo when no detector matches or results conflict. Detected commands pre-fill the form; each is run once on a clean checkout before the project is marked ready (result shown, e.g. "tests: 412 passed" / "lint: not found"). Then the Director onboarding chat (skippable for existing repos) asks goals, conventions and off-limits areas and stores the answers as the project's first memory records. For a from-scratch project there is nothing to detect: the chat picks the stack and scaffolding the repo is ticket #1. Gate rules that are ecosystem-specific (config-guard file lists, test-file patterns for red-green, d-0015) come from the detected ecosystems and are editable in the UI.
source: { type: chat, ref: "2026-10-14 grill product shape Q12: \"yes your recomndation is good, but user can use forge for all type of languages, its not only bounded to worked on JS|TS only, so workflow or settings needs to be very dynamic. the director onboarding chat is  good idea\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-14
superseded_by: null
supersedes: [d-0034]
tags: [projects, onboarding, languages, gates, director, memory, product]
pinned: true
---

Replaces d-0034's `profile: ts | generic` with role-tagged command lists plus
detected ecosystems. G1 already resolves commands via PATH without cwd hijack;
that stays.

Open, to verify by probe: from-scratch repo creation through the App. Org repos
via `POST /orgs/{org}/repos` need the App's Administration write permission.
For personal accounts, GitHub's REST docs list installation tokens as supported
for `POST /user/repos`, but community reports (github.com/orgs/community
discussions 137174, 209538) show 403s; fallback = the user creates an empty
repo and selects it.

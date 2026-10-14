---
id: d-0083
kind: decision
statement: Git access always goes through a GitHub App installed on the repo, the way CodeRabbit-style tools onboard a repo; no personal tokens. Creating a project offers two paths - start from scratch (Forge creates the repo) or pick an existing repo from GitHub. In both paths Forge asks for a local folder, and the repo is created or cloned there.
source: { type: chat, ref: "2026-10-14 grill product shape Q1 follow-up: \"for git creds, user will always have to install the git app in the repo. this will work like corerabbit etc ... on starting of a project(ow while creating a new project) user will have option to create project from scract or select a repo from git. system shoudl ask for local project file in both cases so repo can be closed or created there.\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-14
superseded_by: null
supersedes: null
tags: [git, github-app, onboarding, projects, multi-repo]
pinned: false
---

Builds on d-0012 (Workers never hold git creds) and d-0062 (GitHub App host).
Research 2026-10-14: CodeRabbit SaaS owns one App that customers install; for
self-hosted GitHub Enterprise, CodeRabbit has the customer create their own
App. Self-hosted tools (e.g. Coolify) use GitHub's App Manifest flow to create
the App in the user's account/org in one browser round trip, returning app id,
private key and webhook secret. Open: who owns the App for an installed Forge.

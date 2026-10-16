---
id: d-0127
kind: decision
statement: Project settings has a "Delete project" action behind a confirm popup. Deleting removes the project from Forge (its row, tickets, runs and their records, cards, inbox state, memory repository and worktrees) so the same folder can be added again. It never touches the user's project folder. Settings history (config_versions) stays, because those rows are append-only by design.
source: { type: chat, ref: "2026-10-16 user: \"also add a option for delete the project in project settings, there need a confirm popup that will dleete the project\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-16
superseded_by: null
supersedes: null
tags: [projects, settings, ui, api]
pinned: false
---
Archive (kept) retires a project but blocks re-adding the same slug, prefix or
folder. Delete is the clean-slate path. Folder contents, including a git repo
Forge initialised, are left alone; the confirm says so.

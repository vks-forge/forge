---
id: d-0122
kind: decision
statement: apps/web keeps client UI state in zustand stores, persisted to localStorage with zustand's persist middleware (versioned with migrations, storage access guarded so a blocked or corrupt store falls back to defaults). Persisted state is UI-only - theme, last project, sidebar state, board view and filters, Waiting-on-you view, unsent chat drafts and similar preferences. Server data stays in TanStack Query with the server as source of truth (d-0085) and is never written to localStorage; tokens, secrets and run content are never persisted.
source: { type: chat, ref: "2026-10-16 user: \"also use zustand for with localstorage persitnce data for betterness\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-16
superseded_by: null
supersedes: null
amends: [d-0103]
tags: [ui, apps-web, state, stack]
pinned: false
---
Director note: the UI-only boundary and the never-persist list are the Director's
reading of "for betterness" against d-0085 (settings live in the database) and
d-0093 (token never in browser JS); flag if the user meant more.

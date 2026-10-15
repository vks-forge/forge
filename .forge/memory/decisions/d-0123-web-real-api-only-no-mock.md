---
id: d-0123
kind: decision
statement: apps/web talks only to the real Forge server API. The mock adapter, its fixtures, the adapter table and the VITE_FORGE_API / VITE_FORGE_MOCK switches are removed from apps/web/src. Screens whose backend does not exist yet get the backend built (server endpoint + core schema) in the same batch instead of fixture data. Component tests stub fetch inside __tests__/helpers (test code only, never shipped); the Playwright smoke runs against a real server started on a temporary data home and seeded through the API.
source: { type: chat, ref: "2026-10-16 user: \"you go autonomus finish the web app design, if you get time then connect server with frontend and remove all mock related code and data from web. you can save work by directly working with server API\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-16
superseded_by: null
supersedes: null
amends: [d-0118]
tags: [ui, apps-web, api, testing]
pinned: false
---
Director note: test-only fetch stubs in __tests__ are kept because component tests
must not need a running server; this is the Director's reading of "remove all mock
related code and data from web" (shipped code), flag if the user meant tests too.

---
id: x-0014
kind: proposal
statement: Bind the browser session to Forge's own origin, not just its loopback host. After `GET /auth/open` the server redirects to `/#k=<per-session secret>`; the page moves the secret into sessionStorage (origin- and port-scoped), strips the fragment, and sends it as a header on every API call and SSE ticket request. The server accepts a cookie session only together with the matching secret. A leaked `forge_session` cookie alone (browsers send cookies to every port on 127.0.0.1) then gives no access. The install token still never reaches page code (d-0093); the per-session secret dies with the session.
source: { type: review, ref: "2026-10-16 security review of W7b (commit be0b16a), finding 1 (medium): session cookie sent to every local port" }
author: director
origin: review
status: pending
confidence: 0.7
valid_from: 2026-10-16
tags: [security, auth, apps-web, apps-server, session]
---

Cost: one header on every http-adapter call and the SSE ticket call; a reload in
a new tab needs `forge open` again unless the secret is shared across tabs
(localStorage is also port-scoped, so it could live there instead, trading
per-tab isolation for convenience). Alternative: accept the limit (documented in
apps/server README Limits) since the attacker must already run a web server on
the user's machine that the user's browser visits.

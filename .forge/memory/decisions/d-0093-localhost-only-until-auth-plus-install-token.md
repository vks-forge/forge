---
id: d-0093
kind: decision
statement: While Forge has no user authentication, it listens on 127.0.0.1 only and offers no setting to bind to the network; network access arrives only with server mode and authentication (remote use before then = the user's own SSH forward / tunnel). In addition, the UI and CLI present a per-install access token, kept in the user's profile, on every API call, so other programs or other OS users on the same machine cannot drive Forge through localhost. Existing browser guards stay (Host check against DNS rebinding, JSON-only bodies, no CORS headers). When server mode is built, a single install-wide access key (no accounts) is the recorded starting point before full auth.
source: { type: chat, ref: "2026-10-14 grill product shape Q10: user replied \"1\" to 'localhost only until auth exists', with the per-install token recommended under option 1" }
author: user
origin: owner
status: active
valid_from: 2026-10-14
superseded_by: null
supersedes: null
amends: [d-0061, d-0082]
tags: [security, network, auth, server, product]
pinned: true
---

Resolves the open point in d-0082 (no-auth + network exposure = code execution
for anyone on the network). Hook route keeps its own per-run secret (separate
from the install token).

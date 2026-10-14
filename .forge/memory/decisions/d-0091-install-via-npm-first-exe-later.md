---
id: d-0091
kind: decision
statement: Forge is distributed as an npm package first (`npx <pkg>` to try, `npm i -g <pkg>` to keep; Node 24 prerequisite); a standalone exe installer (winget / setup.exe, no Node needed) is added later when non-developer demand appears. `forge start` launches the server and opens the web UI in the browser; everything else happens in the UI (d-0090).
source: { type: chat, ref: "2026-10-14 grill product shape Q8: user replied \"yes\" to the recommendation 'option 3: npm now, standalone exe later'" }
author: user
origin: owner
status: active
valid_from: 2026-10-14
superseded_by: null
supersedes: null
tags: [distribution, npm, install, product]
pinned: false
---

Open: published package name. Checked 2026-10-14 on registry.npmjs.org - `forge`
and the `@forge` npm org are taken (internal `@forge/*` workspace names stay
private and need a published scope, e.g. the GitHub org's, before release).
The exe path will need `better-sqlite3` -> `node:sqlite` behind `SqlDriver`
(d-0047), code signing and an update channel.

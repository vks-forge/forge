---
id: d-0099
kind: decision
statement: The published npm package is `vks-forge` (`npx vks-forge`, `npm i -g vks-forge`); the installed command stays `forge`. Internal workspace packages keep their private `@forge/*` names and are bundled into the published package, not published separately.
source: { type: chat, ref: "2026-10-14 after product grill: \"npm name - vks-forge\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-14
superseded_by: null
supersedes: null
amends: [d-0091]
tags: [distribution, npm, naming, product]
pinned: false
---

Checked 2026-10-14: registry.npmjs.org/vks-forge returned 404 (name free).
Director note: bundling internal packages and the `forge` bin name are
director-inferred defaults, confirm in the brief.

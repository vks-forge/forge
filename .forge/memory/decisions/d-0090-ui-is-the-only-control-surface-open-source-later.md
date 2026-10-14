---
id: d-0090
kind: decision
statement: Users never edit Forge's code or config files to operate it - every setting, agent, pipeline, project, credential and approval is changed from the web UI (the CLI only installs, starts/stops and scripts what the UI can do). "User never has the code" means this, not closed source - Forge will become an open-source platform later.
source: { type: chat, ref: "2026-10-14 grill product shape Q8: \"'user never has the code' - this means user will never edit any code or etc. this will be a opensource pltform lateron. jsst only want to say that user will chenge evything from UI\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-14
superseded_by: null
supersedes: null
tags: [product, ui, open-source, distribution, settings]
pinned: true
---

Consequence for every feature: no behaviour may require a hand-edited file
(yaml, env var, `.forge/` file) to configure; a setting without a UI is
incomplete. Env vars stay only for dev/test builds (e.g. probe flags).
Clarifies d-0082. License choice is open (decided when open-sourcing).

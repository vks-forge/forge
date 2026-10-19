---
id: d-0170
kind: decision
statement: Forge's data folder is always the platform default (%LOCALAPPDATA%\Forge on Windows); onboarding has no "Where Forge keeps its files" step and there is no user-facing way to choose another folder (the forge-home.json override goes; FORGE_HOME stays for dev and test builds only).
source: { type: chat, ref: "2026-10-19 user: \"i think we should remove the 'Where Forge keeps its files' step fully, its always fixed to the '%LOCALAPPDATA%\\Forge' folder\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-19
superseded_by: null
supersedes: null
amends: d-0098
tags: [onboarding, data-home, settings]
pinned: false
---

The step only displayed a path it could not change, after the server had already
created the folder, and the only way to pick another folder was hand-editing
`forge-home.json` before the first start (against code.md rule 9). The folder
stays visible under Forge settings, General.

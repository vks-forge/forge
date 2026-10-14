---
id: d-0089
kind: decision
statement: The first release of the installed product supports Windows. From now on CI runs the full unit and end-to-end suite on Windows, macOS and Linux so no Windows-only assumption creeps in. macOS and Linux ship in the next release, once their SecretStore adapters (macOS Keychain, Linux Secret Service) and notifier adapters exist and live probes pass on each.
source: { type: chat, ref: "2026-10-14 grill product shape Q7: user replied \"yes\" to the recommendation 'option 3: Windows first, portable from now (CI matrix on all three), macOS + Linux next release'" }
author: user
origin: owner
status: active
valid_from: 2026-10-14
superseded_by: null
supersedes: null
tags: [platforms, windows, macos, linux, ci, product, secrets]
pinned: false
---

Windows-only today: DPAPI SecretStore (d-0062), desktop notification (d-0079),
PATH/PATHEXT resolution in G1 (portable code, tested on Windows only).

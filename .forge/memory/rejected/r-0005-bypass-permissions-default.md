---
id: r-0005
kind: rejected
statement: Launch harnesses with bypass-permission flags by default (`--dangerously-skip-permissions`, `--yolo`, Codex bypass-sandbox), as Paperclip's adapters do.
source: { type: chat, ref: 2026-10-12 Paperclip adapter analysis }
author: director
origin: agent
status: superseded
superseded_by: d-0183
valid_to: 2026-10-23
valid_from: 2026-10-12
confidence: 0.9
tags: [security, execution-plane, permissions]
---
Reason: contradicts d-0001. Policy is allow-list per lane with OS sandbox on
Standard/Full (`execution-plane.md` §6). Director-authored; user can
supersede, but doing so weakens the governing rule.

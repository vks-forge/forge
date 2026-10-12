---
id: d-0016
kind: decision
statement: v1 ships multiple Worker harness drivers (Claude Code, Codex, OpenCode, and others), not Claude Code alone. Multi-harness is a v1 requirement, not a deferral.
source: { type: chat, ref: 2026-10-12 user message "i need other harness like codex|opencode etc also. it should not be a big deal as other open source projects like paperclip also have this." }
author: user
origin: owner
status: active
valid_from: 2026-10-12
superseded_by: null
supersedes: null
tags: [execution-plane, harness, drivers, scope]
pinned: true
---
Overrides the driver deferral in x-0005 / `docs/design/v1-scope-review.md` §5.
Build order stays as `execution-plane.md` §4: Claude Code → Codex → OpenCode
→ Pi → ACP. Each driver targets ~300 lines plus a ~100-line renderer; events
normalised early. Walking skeleton still proves the loop on one driver first,
then adds the others before M0 is called done.

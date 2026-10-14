---
id: d-0088
kind: decision
statement: Forge does not pin harness versions. When it sees an installed harness version it has not seen before, it runs an automatic compatibility check on that machine - a trimmed probe set (hooks register before the first tool call, ACP event order, receipt cross-check timing) plus reading the harness's built-in tool input schemas and diffing them against the known catalogue. All match -> the version is marked compatible for that install and runs continue. New or changed tool shapes -> only those tools are denied until the user approves them in Settings. Check fails -> that harness is paused with a plain-language message and the last-known-good version suggested. Each Forge release ships a list of versions already verified, which skip the check. Policy stays fail-closed throughout (unknown tool = deny).
source: { type: chat, ref: "2026-10-14 grill product shape Q6: user replied \"ok\" to the recommendation 'option 3: per-install compatibility check on each new harness version, approve changed tools in Settings, known-good list per release'" }
author: user
origin: owner
status: active
valid_from: 2026-10-14
superseded_by: null
supersedes: [d-0053]
tags: [harness, versions, probes, catalogue, settings, product]
pinned: false
---

Follows from d-0087 (installed harnesses). Carries forward the measured facts
of d-0053/d-0048 (hook tool_use_id == ACP toolCallId, budget exit codes, etc.)
as the expectations the compatibility check asserts; they are now re-verified
per version instead of assumed from one pinned version.

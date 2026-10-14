---
id: d-0092
kind: decision
statement: `forge start` runs Forge as a background process (closing the terminal does not stop it), with `forge status` / `forge stop`, a tray icon, and an optional "start when I log in" setting. On restart, Forge resumes each interrupted run from the harness's saved session (ACP session load, d-0035) with a freshly issued run secret and re-registered hook; hook calls carrying the old secret are refused. A run that cannot be resumed is marked `interrupted` and retried automatically, keeping its worktree and receipts so the Worker continues from the existing changes.
source: { type: chat, ref: "2026-10-14 grill product shape Q9: user replied \"ok\" to the recommendation 'option 2: background process + resume interrupted runs'" }
author: user
origin: owner
status: active
valid_from: 2026-10-14
superseded_by: null
supersedes: [d-0054]
tags: [server, lifecycle, runs, resume, security, product]
pinned: false
---

Replaces d-0054 (restart kills in-flight runs, run secret memory-only).
Resume must not widen trust: the old run secret dies with the old process;
receipt chain continues across the resume boundary with an explicit
`resumed` link so G1 can verify it.

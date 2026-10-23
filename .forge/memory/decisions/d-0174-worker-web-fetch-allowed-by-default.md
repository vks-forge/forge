---
id: d-0174
kind: decision
statement: Workers may fetch web pages by default. In the Standard and Full lanes `web_fetch` on any http(s) URL is allowed (it was `ask`, with only `https://docs.*` allowed in Standard), so a Worker can read library and API docs without the owner. The SSRF guard (no private, loopback or file: addresses), the owner's banned hosts, the size caps and the untrusted-content envelope stay; every page read is still recorded as a research source on the run.
source: { type: chat, ref: "2026-10-20 user, after a CHE-2 Worker's web_fetch of https://authjs.dev/getting-started/adapters/prisma was denied with rule_ask: \"why this disabled for worker? how to enable, if can be enabled then make it enabled by default\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-20
superseded_by: null
supersedes: null
amends: []
tags: [tools, policy, web, workers, lanes]
pinned: false
---

Found on CHE-2 (lane full): the `ask` became a silent denial because the Claude Code hook
cannot ask the owner mid-call (decision-outcome.ts: "needs approval, denied").

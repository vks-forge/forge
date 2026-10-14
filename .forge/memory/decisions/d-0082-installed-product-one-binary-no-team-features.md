---
id: d-0082
kind: decision
statement: Forge ships as an installed product (exe / CLI install command); users never receive the source. One binary has two modes - local mode first (auth off), server mode later - with the same engine and only the edges differing (auth, network bind, secret store, Worker credentials). The system is designed as one company managing many repos (projects) from one install. No team features for now - no user accounts, roles or ACL; everything in the web UI is available to whoever opens it.
source: { type: chat, ref: "2026-10-14 grill product shape Q1: \"yes option 3. my thinking is that currently we will not have any team feature in this. all UI is avilable to everyone who is opening the UI. only system will be designed as like a company using it and mutiple repo can be managed.\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-14
superseded_by: null
supersedes: null
tags: [product, distribution, deployment, multi-repo, auth]
pinned: true
---

Collides with earlier single-developer assumptions that this grill must resolve:
d-0061 (127.0.0.1 only), d-0062 (DPAPI CurrentUser secrets), d-0031/d-0032
(harness login per user), d-0008/d-0065/d-0068 (agent/pipeline files in the
repo's `.forge/`), d-0007/d-0044 (memory in each project's repo), d-0054
(restart kills runs), d-0068's "admin-only with ACL" end state (deferred, no
ACL now).

Director note: with no auth, any network-reachable install lets anyone on that
network run Workers (code execution on the host) and push to company repos.
Open question for the grill: stay bound to localhost until auth exists.

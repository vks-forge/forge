---
id: d-0094
kind: decision
statement: One install = one company. Hierarchy is company settings -> projects (one repo each) -> tickets, matching d-0085's two config levels. Settings -> GitHub holds multiple connections, each one GitHub App in one org or personal account (manifest-created per d-0084); the new-project repo picker lists repos from all connections. Several companies per install is deferred to when team features arrive (a `company_id` migration, not a redesign); until then a second company = a second install with its own data folder.
source: { type: chat, ref: "2026-10-14 grill product shape Q11: user replied \"ok\" to the recommendation '(a) one company per install, (b) multiple GitHub connections'" }
author: user
origin: owner
status: active
valid_from: 2026-10-14
superseded_by: null
supersedes: null
tags: [company, projects, github-app, multi-repo, settings, product]
pinned: false
---

Reason for (b): a manifest-created App is private to its owner org/account and
cannot be installed on another org's repos.

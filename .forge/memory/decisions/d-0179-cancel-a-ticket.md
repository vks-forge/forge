---
id: d-0179
kind: decision
statement: The owner can cancel a running ticket from the ticket page. The Director cancels a ticket only when the owner asked for it in that chat turn; otherwise it suggests cancelling. Cancel stops the run, removes the worktree, deletes the branch and closes the PR, and records the last commit id so the work can be recovered.
source: { type: chat, ref: "2026-10-20 user, answering \"How should cancelling a ticket work?\": \"Director cancels only if I asked (Recommended)\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-20
superseded_by: null
supersedes: null
amends: [d-0109]
tags: [tickets, cancel, director, git]
pinned: false
---

Part of the eval fix plan (docs/briefs/eval-fixes-plan.md).

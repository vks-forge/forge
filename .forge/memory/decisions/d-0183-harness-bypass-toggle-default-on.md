---
id: d-0183
kind: decision
statement: Each harness has a "Bypass permissions" setting in its harness settings, on by default. When on, the harness starts with its own skip-permission mode and every Forge `ask` rule becomes allow, so a Worker is never stopped for an approval. A short hard floor still blocks, enforced by Forge's hook (outside the agent's control): secrets and Forge's own data folder, paths outside the ticket's worktree, pushing, and destructive commands. Tool receipts and G1 keep working. Turning the setting off restores the per-lane allow and ask rules (d-0175, d-0182).
source: { type: chat, ref: "2026-10-23 user, after the Anneal comparison: \"ok also for 'Bypasses everything' i need this to be togggled from its harness setting, default should be 'Bypasses everything'\"; answering how far the default goes: \"Bypass, keep hard floor (Recommended)\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-23
superseded_by: null
supersedes: r-0005
amends: [d-0175, d-0182, d-0117]
tags: [security, permissions, harness, execution-plane, autonomy]
pinned: false
---

Accepted risk: Workers still run as the owner's OS account until isolation lands (d-0117), so the hard floor is a
policy layer, not an OS boundary. d-0001 still holds through the floor: the consequences that matter most stay gated by
Forge's hook. Queued as item AA in docs/briefs/next-work-queue.md, Phase 3 step 3.0 in next-work-plan.md.

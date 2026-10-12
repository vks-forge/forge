---
id: x-0005
kind: proposed
statement: Ship v1 as a walking skeleton (chat intake, engine tick, Claude Code driver only, G1 + existing tests, Board/Ticket/Needs-you, memory M0–M1) and defer Codex/OpenCode/Pi drivers, G2 SAST, hidden intent tests, G4 mutation, G5, G6, canaries, Bifrost, Phoenix, Gitea, skills registry, ADR compile pipeline, egress isolation, and five of eight UI screens until observed pain demands them.
source: { type: chat, ref: 2026-10-12 user request "run this through decision perspective, analyze ... useful or need enhancement or cutoff" }
author: director
origin: agent
status: superseded
valid_from: 2026-10-12
valid_to: 2026-10-12
superseded_by: x-0006
confidence: 0.75
tags: [scope, v1, milestones]
---
Full review with keep / enhance / cut tables: `docs/design/v1-scope-review.md`.
Includes recommended answers for x-0001..x-0004 (approve, own, approve,
approve-for-three-components) and a proposed driver order change: ACP generic
as driver 2 instead of Codex app-server. Awaiting user.

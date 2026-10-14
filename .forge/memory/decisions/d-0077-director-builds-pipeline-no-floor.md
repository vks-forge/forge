---
id: d-0077
kind: decision
statement: A default pipeline exists in the system, but the Director has full knowledge of the available agents, gates and pipelines and full permission to build its own pipeline for each ticket according to the ticket's severity and context — with no fixed safety floor. The Director may add, remove or reorder agents, gates, loops, parallel writers and human steps, including making a ticket's pipeline lighter than the default. Every Director-built pipeline is stored on the ticket with the Director's reasons and shown to the user; the engine still performs the merge itself (one merge door, code rule 6).
source: { type: chat, ref: "2026-10-14 grill x-0011 Q12: user chose 'Director builds the pipeline' with note \"a default pipeline should be on system but director should have full knowlege and permission for build own pipeline for each tickets accordig to the tickets sevirity etc.\"; Q12b: 'Fully free, no floor' over 'Free above a fixed floor (Rec.)', after the warning that this reverses d-0001 / d-0006" }
author: user
origin: owner
status: active
valid_from: 2026-10-14
superseded_by: null
supersedes: null
amends: [d-0001, d-0006, d-0069]
tags: [pipelines, director, governance, x-0011]
pinned: true
---

Amends, for Director-built pipelines only: d-0001 (independent process gates
are no longer mandatory — the Director decides which gates a ticket runs),
d-0006 (the Director may choose a lighter process than the lane default),
d-0069 (routing "only stricter" applies to rule-based routing, not to the
Director's own pipeline). Also drops d-0066 safety conditions (1) and (5)
for Director-built pipelines; conditions (2)–(4) (loop max, every outcome has an
edge, valid terminals) still apply because they keep the engine from hanging.

Risk accepted by the user (stated in chat 2026-10-14): an LLM mistake or a
prompt injection in repo text can route unchecked code to main. Mitigations
that do not limit the Director: the built pipeline + reasons are recorded and
visible per ticket; the engine alone merges.

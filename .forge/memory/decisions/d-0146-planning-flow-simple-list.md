---
id: d-0146
kind: decision
statement: The Director's planning flow is a simple ordered list of steps stored as versioned config (company default, per-project override) and edited in the UI from S2 - each step has a kind (survey, grill, research, verify, enhance, write plan, approve, or custom), an on/off switch, a "when" condition (always, by lane, Director decides), depth where it applies, and editable instructions (its playbook); steps can be reordered and custom steps (name + instructions, run as a Director step) added without code. Locked steps (write plan, approve) cannot be removed or reordered because they carry the safety rules (approval floor, Tier C human, tool-less approval, transitionCard()). Each card records the flow version it started with. A small dedicated flow runner executes the list (one Director call per step, waiting in Needs you when a step needs the owner); it is NOT the ticket-pipeline engine - the two may be merged later only if they prove to share real structure (code.md rule 5). New built-in step kinds (e.g. Research, S6) are added in code and then appear in the Add step menu.
source: { type: chat, ref: "2026-10-16 user, after the walkthrough of how a customizable Director flow works and the advice that sharing the ticket-pipeline engine overcomplicates it: \"yes do it.\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-16
superseded_by: null
supersedes: [d-0145]
tags: [director, planning, config, ui]
pinned: false
---

---
id: d-0001
kind: decision
statement: The factory has five planes (Trigger, Control, Execution, Verification, Oversight) and one governing rule - an agent's self-report may trigger action, but only a process the agent cannot control may gate the consequence.
source: { type: chat, ref: hyperresearch report final_report_ai-software-factory-architecture-58e4cc }
author: user
origin: owner
status: active
valid_from: 2026-10-12
supersedes: null
superseded_by: null
tags: [architecture, governance]
pinned: true
---
Adopted from the research report. Every later decision must preserve: Workers
cannot write to Control, Verification, or Oversight; Oversight can only reduce
autonomy.

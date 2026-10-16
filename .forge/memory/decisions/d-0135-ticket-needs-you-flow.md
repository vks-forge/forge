---
id: d-0135
kind: decision
statement: When a ticket needs attention the Director tries first - answers a Worker's question from the plan, decisions, memory and code; retries or adjusts within the plan on a failure; waits or reroutes on quota and approval waits - and escalates only what it cannot resolve. An escalation carries a type with its own actions - question (Worker's question plus the Director's suggested answer; option buttons or free text), decision (e.g. bigger than planned: split or continue; a big one triggers a re-plan), failure (what failed, diagnosis, what was tried; Retry / Re-plan / Cancel ticket), setup (unapproved tool, missing harness login; Fix in settings, auto-resume once fixed), sign-off (sensitive or high-risk change; Approve / Deny). The same item appears in the card chat, on the ticket page and in the Inbox; answering in any one settles it everywhere, live, and the card shows Needs you while any ticket does. Independent tickets keep running; only dependents wait. Every waiting state must offer at least one action - a parked ticket with only reason text is a bug.
source: { type: chat, ref: "2026-10-16 user, grill Q8 (ticket needs-you flow): \"accept.\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-16
superseded_by: null
supersedes: null
amends: [d-0109, d-0110, d-0134]
tags: [director, tickets, escalation, inbox, ui]
pinned: false
---
Found on 2026-10-16: DCP-1 was parked with "lane not enabled in M0" and the UI
offered no action; rework-cap parking had the same dead end.

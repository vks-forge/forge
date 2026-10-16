---
id: d-0140
kind: decision
statement: The Director's planning flow runs an enhance-decisions pass after the grill and before writing the plan - the same method as .forge/skills/enhance-decisions (contradictions with active decisions, rejected records, design docs and code; missed branches with recommended answers; evidence; cheaper paths; blast radius; ordering). It ships as a Director playbook (enhance-decisions) alongside plan-grill, verify-plan, write-plan and plan-to-tickets; its keep/change/drop findings and missed points are put to the user in the card chat (or resolved by the Director when they need no owner input) before the plan is written, and the report is kept with the plan version.
source: { type: chat, ref: "2026-10-16 user: \"now run the .forge\skills\enhance-decisions skill on this. also directory also needs to run this skill before writing the plan\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-16
superseded_by: null
supersedes: null
amends: [d-0017, d-0130, d-0132]
tags: [director, planning, playbooks, enhance]
pinned: false
---
"directory" read as "Director". This restores the enhancement step d-0017 always
required (grill -> enhance -> finalize).

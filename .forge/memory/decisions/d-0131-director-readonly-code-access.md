---
id: d-0131
kind: decision
statement: During planning (grill and verification) the Director's steps get read-only code tools only - Read, Grep, Glob - confined to the project folder, admitted through the same policy door as Worker tools (admit()); no write, shell or web. Every file it reads is logged on the card as evidence for its blast-radius and overlap findings. When Forge's planned code graph (context saving, fast search) lands, the Director's planning reads are mapped onto it so both work together.
source: { type: chat, ref: "2026-10-16 user, grill Q4: \"yes go with option A, and also later we are planning for code graph for saving context and faast search so later we also have to map this two to work together\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-16
superseded_by: null
supersedes: null
amends: [d-0130]
tags: [director, planning, tools, security, code-graph]
pinned: false
---
Chosen over a separate read-only analyst Worker run (slower, takes a Worker
slot) and over prompt-packed context only (shallow blast-radius claims).

---
id: d-0147
kind: decision
statement: Forge has an Agents area in the UI where the user sees, edits and creates agents - including the Director's own settings - all stored in Forge's database as versioned config (d-0085), never as files. The user has full flexibility over the system's flow: built-in agents are seeds, and the user can add any number of their own agents (e.g. several kinds of reviewers for a project that writes little code, such as networking work) and use them in ticket pipelines and the Director's planning flow.
source: { type: chat, ref: "2026-10-16 user: \"also should be add a agents tab in UI, where user can edit agents and also the directors? most likely then this all will not be a file based, it will go to database based. my idea is to give user full flexibility over the system flow. user can add more agents as needed, suppose someone using forge for networking work only, it needs to write very less code and need some typeof reviews agents more then user will able to add more ageents.\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-16
superseded_by: null
supersedes: null
amends: [d-0078, d-0085, d-0137, d-0146]
tags: [agents, director, config, ui, flexibility]
pinned: false
---
Details (fields, scope, Director editing limits, where agents plug in) are being
settled in the grill that follows.

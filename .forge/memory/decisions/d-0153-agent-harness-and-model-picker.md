---
id: d-0153
kind: decision
statement: Every agent (and each Director step type, d-0150) has a "Runs on" section - Harness, picked from connected harnesses only, each showing health (version, signed in, compatibility passed), a not-ready harness showing why with Fix in settings; Model, listed from what that harness's driver reports (refreshed on each compatibility check) with speed/cost labels and role-based recommendations, where "Harness default" stays a true default that follows the harness (never frozen to a concrete model) and a custom model id is allowed; an ordered Fallback list of model/harness alternatives used on rate limit or outage (d-0080); and Test agent, a one-turn probe with that harness and model before saving. Modelled on Paperclip's per-agent adapter + model field and "Detect model", improved on its known gaps (default persisted as a concrete model, paperclipai/paperclip#5371; no fallback path, #2743; no harness health in the picker).
source: { type: chat, ref: "2026-10-16 user, after accepting the pipeline editor: \"also notice that every agent when writing should have option to select harness and model available for that harness. paperclip also do this , get idea from there and make it better.\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-16
superseded_by: null
supersedes: null
amends: [d-0148, d-0080, d-0060]
tags: [agents, harness, models, ui]
pinned: false
---

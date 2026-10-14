---
id: d-0068
kind: decision
statement: Agent and pipeline definitions are protected config. Now (M0/M1) they are files under `.forge/agents/` and `.forge/pipelines/`, signed like the tool catalogue; Workers can never write them (floor-protected path); any change to them is a tier C change that needs the user's named sign-off; every run records the content hash/version of the pipeline and agent definitions it used. Later, an approve-from-UI flow is added (control room), and the end state is that pipelines and agents are stored in the database and edited only through the UI, no file changes; once access control exists, only an admin may edit or approve them. Because of that end state, the engine reads definitions through one `PipelineSource`/`AgentSource` port (file adapter now, database adapter later) over the same zod schemas, and the database form must keep immutable versions, approval records and an audit log so the guarantees of signing carry over.
source: { type: chat, ref: "2026-10-14 grill x-0011 Q3: user: \"ok then go for option 1 but also later we need option 3 so wecan approve it from UI also or later we will only make it editable though UI, the full pipeline infuture will be only controlled from UI and store in database so no file changes. if alater we add ACL then only admin will be able to edit this\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-14
superseded_by: null
supersedes: null
tags: [pipelines, agents, governance, signing, ui, acl, x-0011]
pinned: true
---

Direction change to note: d-0008 (agent specs are files in git, DB registry
only) and d-0065 (agent files are Markdown + frontmatter) hold for now; when the
database/UI form ships, a new record must supersede d-0008 (for agents and
pipelines) and d-0065. The port and versioning requirements above are added by
the director so the later move needs no engine change.

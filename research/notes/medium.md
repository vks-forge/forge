---
title: Medium
id: medium
tags:
- ai-software-factory-architecture-58e4cc
- codebase-mastery
created: '2026-10-12T08:27:46.994260Z'
source: https://medium.com/@dipakkrdas/code-wiki-llm-maintained-documentation-for-your-codebase-fc54f94bef6d
source_domain: medium.com
fetched_at: '2026-10-12T08:27:46.986570Z'
fetch_provider: builtin
status: draft
type: note
tier: commentary
content_type: blog
deprecated: false
---

Medium
Code Wiki: LLM-Maintained Documentation for Your Codebase | by Dipak Kr das | Medium
Sitemap
Open in app
Sign up
Sign in
Medium Logo
Get app
Write
Search
Sign up
Sign in
Dipak Kr das
https://www.linkedin.com/in/dipakkrdas
| A software professional. Love to Play football, Guitar and cooking!!!
Llm Applications
Llm Wiki
Agentic Workflow
Generative Ai Tools
Software Engineering
Code Wiki: LLM-Maintained Documentation for Your Codebase
Dipak Kr das
9 min read
·
Jun 14, 2026
--
Listen
Share
Most teams treat documentation as a one-time deliverable. You ship a feature, maybe update a README, and move on. Six months later, the docs describe a system that no longer exists — and every question to an AI assistant starts with the model re-reading hundreds of source files from scratch.
Code Wiki
takes a different approach. It adapts
Andrej Karpathy’s LLM Wiki
pattern to software repositories: instead of retrieving raw code chunks on every question (classic RAG), an AI agent
compiles
knowledge into a persistent, interlinked markdown wiki under
`docs/`
, keeps it current as code changes, and routes future questions through that synthesized layer.
The result is a documentation base that works well at moderate scale — on the order of
~200 wiki pages
— without embedding infrastructure, vector databases, or a separate doc portal. The wiki lives in your repo, versioned with your code, and becomes the grounding layer for humans and LLMs alike.
I have tried varients of this in our projects and produced excellent result. I tried on few github opensource project as well and it produced great result. I recommend each project/repo should have it’s own code wiki.
TL;DR
Karpathy’s insight:
compile knowledge once into a persistent wiki; query the wiki, not raw sources every time.
Code Wiki’s twist:
your
raw source
is the codebase; your
wiki
is
`docs/`
; your
schema
is
`AGENTS.md`
plus agent skills and commands.
Generate
(
`/generate-documentation-from-code`
) does exhaustive first-time analysis and writes feature pages, data models, messaging catalogs, and cross-cutting references.
Doc-resync
(
`/doc-resync`
) incrementally updates only the pages affected by commits since the last sync pointer in
`docs/log.md`
.
Ingest
maintains the routing catalog (
`docs/index.md`
,
`docs/glossary.md`
) so agents can find the right page in one pass.
Integrate
by copying commands, skills, and
`AGENTS.md`
into your AI IDE's config (Cursor, Claude Code, Copilot, etc.).
Benefit:
LLMs answer from pre-synthesized, source-anchored pages — strong context for feature design, refactors, onboarding, and exploration flows you file under
`docs/flows/`
.
From Karpathy’s LLM Wiki to a Code Wiki
In
his LLM Wiki gist
, Karpathy describes three layers:
Layer 1 — Raw sources
•
Karpathy’s wiki:
Articles, papers, notes in raw/
•
Code Wiki:
Your repository — services, handlers, migrations, configs
Layer 2 — Wiki
•
Karpathy’s wiki:
LLM-maintained markdown in wiki/
•
Code Wiki:
Structured docs/ — features, reference pages, flows
Layer 3 — Schema
•
Karpathy’s wiki
: CLAUDE.md or a config doc
•
Code Wiki:
AGENTS.md
plus skills and commands
Karpathy’s core operations map cleanly:
Ingest
•
LLM Wiki:
Integrate a new source into the wiki
•
Code Wiki:
Generate compiles the whole codebase; ingest refreshes index.md and glossary.md. New findings can be ingested as .md files.
Query
•
LLM Wiki:
Read index → open pages → synthesize with citations
•
Code Wiki:
Agent reads docs/index.md, opens matched pages, follows sources[] only when needed
Lint
•
LLM Wiki:
Health-check contradictions, orphans, stale claims
•
Code Wiki:
Doc-resync catalog hygiene plus TODO-VERIFY and CONTRADICTION handling
The philosophical shift is the same Karpathy emphasizes: “The knowledge is compiled once and then kept current, not re-derived on every query.” Cross-references exist before you ask. Business rules are written down with line-anchored links to enforcing code. Contradictions get flagged instead of silently ignored.
At moderate scale (~200 sources, hundreds of pages), Karpathy notes that a well-maintained index.md routing table works surprisingly well — no embedding pipeline required. Code Wiki leans into that: docs/index.md is the primary AI routing surface, with one row per page (link, category, one-line summary).
How Code Wiki Is Built: Skills, Commands, and Schema
Code Wiki is not a monolithic script. It is a
portable toolkit
expressed as agent
skills
(reusable procedures) and
commands
(user-invoked workflows). The schema in
`AGENTS.md`
governs layout, page format, operations, and log conventions — the same role Karpathy assigns to the schema file that turns a generic chatbot into a disciplined wiki maintainer.
End to End Workflow
Press enter or click to view image in full size
Toolkit layout
`README.md`
Role: Overview, command reference, integration notes
`AGENTS.md`
Role: Wiki schema — directory layout, page frontmatter, ingest / query / doc-resync / add-page
`commands/generate-documentation-from-code.md`
Role: Slash command — full generate + ingest
`commands/doc-resync.md`
Role: Slash command — incremental sync after commits
`skills/generate-docs/SKILL.md`
Role: Exhaustive file-by-file analysis → writes all
`docs/`
content pages
`skills/doc-resync/SKILL.md`
Role: Maps
`git diff`
to pages via
`sources[]`
, updates impacted sections only
When you run
`/generate-documentation-from-code`
, the agent loads the
generate-docs
skill and follows a multi-phase pipeline:
Step 1 — Enumerate
Every business-logic file under
`src/`
(skipping
`node_modules/`
,
`vendor/`
, build output, etc.). Note that you may need to adjust paths based on your project structure, expecially paths to includes and paths to exclude for analysis.
Step 2 — Read every file
100% coverage is mandatory before writing any doc
Step 3 — Build in-memory catalogs
Features, operations, data models, messaging channels, stack and architecture
Step 4 — Write structured pages under
`docs/`
`docs/features/<name>.md`
— one per business domain
`docs/README.md`
— overview, stack, architecture, feature index
`docs/data-model.md`
— ERD + entity reference
`docs/messaging.md`
— Kafka, SQS, SNS, etc.
`docs/cross-cuttings.md`
— auth, logging, observability
`docs/frontend/README.md`
— when applicable
Step 5 — Ingest
(Step 2 of the command)
Build
`docs/index.md`
,
`docs/glossary.md`
, and append to
`docs/log.md`
with a
`Commit:`
sync pointer
Every content page carries YAML frontmatter with a
`sources[]`
list — repo-relative paths to the files that ground that page. That list is what makes incremental sync possible.
Example frontmatter on a feature page:
title: User Management
category: feature
sources:
`src/core/UserService.go`
,
`src/domain/User.go`
created: 2026–06–14
last_updated: 2026–06–14
Feature pages are not thin summaries. The generate-docs skill mandates sections for purpose, business rules (with
`path#Lstart–Lend`
anchors), workflows, Mermaid sequence diagrams, data models, API/events, dependencies, security, and a
Source file links
footer. Non-trivial claims without evidence get
`TODO-VERIFY`
; conflicts get
`CONTRADICTION`
markers per
`AGENTS.md`
grounding rules
.
The
`docs/`
Wiki Structure
`AGENTS.md`
defines the canonical layout:
`docs/README.md`
— service overview (category: overview)
`docs/index.md`
— AI routing catalog
`docs/log.md`
— append-only ops log
`docs/glossary.md`
— domain terms
`docs/data-model.md`
— entity relationships (reference)
`docs/cross-cuttings.md`
— auth, logging, observability (reference)
`docs/messaging.md`
— events/queues (reference; omit content if none)
`docs/features/`
— one page per business feature
`docs/concepts/`
— optional shared mechanisms
`docs/flows/`
— optional end-to-end sequences
`docs/frontend/`
— frontend analysis if applicable
Feature pages vs. flow pages
`docs/features/`
captures
what the system does
— bounded by business domain (user management, order processing, billing, etc.). Each page is anchored to the files that implement that domain.
`docs/flows/`
captures
how things move through the system
— cross-cutting sequences that span multiple features. Examples:
“Checkout: cart → payment → fulfillment notification”
“Password reset: request → email → token validation → session”
“Nightly reconciliation batch”
Flows are optional at generate time (the skill creates an empty
`docs/flows/`
placeholder), but they are first-class wiki citizens. When you explore an end-to-end path — during design review, incident postmortem, or onboarding — you can
add a flow page
(
`category: flow`
), link to the feature pages it touches, include Mermaid sequence diagrams, and run
ingest
so
`index.md`
picks it up. Explorations compound in the wiki instead of disappearing into chat history — exactly the behavior Karpathy describes for valuable query answers.
For repos with
~200 documentation files
, the index stays a single table until you explicitly split it (secondary indexes like
`index-features.md`
are recommended only when you exceed ~200 rows and ask for the split).
Keeping Docs in Sync with Code
Generated documentation decays the moment someone merges a PR. Code Wiki addresses that with
doc-resync
: a commit-aware incremental update, not a full regeneration.
How doc-resync works
When you run
`/doc-resync`
, the
doc-resync skill
executes:
Press enter or click to view image in full size
Phase A — Scope:
scan
`docs/log.md`
bottom-to-top for the latest
`generate`
or
`doc-resync`
entry with a
`Commit:`
line. That SHA is
`base_commit`
. Compare to
`HEAD`
.
Phase B — Route:
match changed paths to pages:
Match in any page’s
`sources[]`
→ that page
Schema DDL / migrations →
`docs/data-model.md`
Kafka/SQS/SNS handlers, topic configs →
`docs/messaging.md`
Auth middleware, logging, shared infra →
`docs/cross-cuttings.md`
New domain with no page →
add-page
+ ingest
If more than
50% of feature pages
are affected, the skill escalates to full
`/generate-documentation-from-code`
.
Phase C — Update:
read diff hunks, patch only impacted sections, bump
`last_updated`
, extend
`sources[]`
for new files. Unrelated accurate content stays untouched.
Phase D — Catalog hygiene:
fix index gaps, summary drift, broken links, glossary gaps, unresolved
`TODO-VERIFY`
blocks.
Phase E — Log:
append a new entry with
`Commit:`
,
`Base:`
, changed file count, and pages updated.
Manual vs. automated sync
Manual
When: After feature merges, before design sessions
How: Run
`/doc-resync`
in your AI IDE
On demand — full rewrite
When: Greenfield docs, major refactor, >50% pages stale
How: Run
`/generate-documentation-from-code`
Automated (CI / hook)
When: Teams that want docs drift caught early
How: Trigger doc-resync on merge to
`main`
via a scheduled agent job, or remind in PR template; the toolkit is command-driven so any runner that can invoke your agent can run the same workflow
Copy toolkit updates
When: When Code Wiki itself improves
How: Sync commands/skills from
github.com/ddidentity/code-wiki
into your IDE config
The sync pointer in
`docs/log.md`
is the contract: as long as every successful generate or doc-resync records
`Commit: <full sha>`
, the next run knows exactly which code delta to process.
Integrating Code Wiki into Your Repository
Code Wiki is designed to be
copied or symlinked
into whatever directory your AI IDE reads for agent configuration. Install paths vary by tool;
`README.md`
documents the mapping:
`commands/`
— slash commands or agent workflows
`skills/`
— reusable agent skills
`AGENTS.md`
— schema and governance (some IDEs use
`CLAUDE.md`
or another project-instructions file)
Cursor example:
copy into
`.cursor/commands/`
,
`.cursor/skills/`
, and
`.cursor/AGENTS.md`
(or reference from project rules).
Minimal integration steps:
Copy the
code-wiki toolkit
into your IDE’s agent config location.
Commit the empty
`docs/`
directory (or let generate create it).
Run
`/generate-documentation-from-code`
once on your codebase.
Review generated pages; fix any
`TODO-VERIFY`
items with domain knowledge.
Commit
`docs/`
alongside your code — it is part of the repo, not a sidecar.
After subsequent merges, run
`/doc-resync`
(manually or via automation).
The generated
`docs/`
tree is
portable markdown
. Humans can browse it in the IDE, on GitHub, or in Obsidian. Karpathy's observation holds:
"The wiki is just a git repo of markdown files. You get version history, branching, and collaboration for free."
Why This Documentation Base Matters for LLMs
Classic codebase RAG chunks files at arbitrary boundaries. Ask “What happens when a user deletes their account?” and the model may retrieve fragments of handlers, cascade rules, and event publishers — then re-assemble them ad hoc. Every question pays that assembly cost again.
A Code Wiki flips the economics:
1. Pre-compiled answers, not re-discovery
`docs/index.md`
routes the agent to
`features/user-management.md`
(for example) in one step. That page already contains business rules, workflows, sequence diagrams, and links to enforcing code. The LLM reads
synthesis
, not raw search hits.
2. Grounded, citable claims
Every page lists
`sources[]`
. Rules cite
`File.go#L42–L60`
. When the model needs more detail, it follows links — it does not guess. Ambiguity is explicit (
`TODO-VERIFY`
) rather than hallucinated.
3. Strong context for new feature work
Planning a new feature? Point the agent at
`docs/README.md`
, relevant
`docs/features/*`
pages,
`docs/data-model.md`
, and
`docs/messaging.md`
. The model starts from
how the system already works
— entities, events, auth patterns, cross-cutting constraints — instead of cold-reading the repo.
4. Design and design-change sessions
When you change an API contract, add a queue, or refactor a bounded context, doc-resync updates the affected pages. Design discussions reference stable wiki URLs. “See
messaging.md
— we’re adding a subscriber here” beats scrolling through Slack.
5. Onboarding that scales
New engineers (and new agent sessions) read
`docs/index.md`
and the last few
`docs/log.md`
entries — the same
session start ritual
the schema mandates for agents. Recent changes are visible in the log timeline.
6. Explorations become durable
Karpathy:
“Good answers can be filed back into the wiki as new pages.”
Code Wiki extends that to
`docs/flows/`
and
`docs/concepts/`
. A sequence you traced during an incident, a comparison of two approaches, a "how billing interacts with tax" narrative — file it, ingest it, and the next person (human or LLM) benefits.
References
Karpathy — original pattern
LLM Wiki gist
— persistent wiki, ingest / query / lint,
`index.md`
+
`log.md`
, compounding knowledge
Code Wiki — toolkit (GitHub)
Repository —
github.com/ddidentity/code-wiki
README —
README.md
Schema & operations —
AGENTS.md
Generate command —
commands/generate-documentation-from-code.md
Doc-resync command —
commands/doc-resync.md
Generate-docs skill —
skills/generate-docs/SKILL.md
Doc-resync skill —
skills/doc-resync/SKILL.md
Llm Applications
Llm Wiki
Agentic Workflow
Generative Ai Tools
Software Engineering
Written by
Dipak Kr das
198 followers
·
54 following
https://www.linkedin.com/in/dipakkrdas
| A software professional. Love to Play football, Guitar and cooking!!!
Help
Status
About
Careers
Press
Blog
Store
Privacy
Rules
Terms
Text to speech
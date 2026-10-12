---
title: Ultimate LLM Prompt for Deep Codebase Analysis & Documentation · GitHub
id: ultimate-llm-prompt-for-deep-codebase-analysis-documentation-github
tags:
- ai-software-factory-architecture-58e4cc
- codebase-mastery
- skill-sequences
- context-ingestion
created: '2026-10-12T08:28:46.421126Z'
updated: '2026-10-12T08:31:07.222813Z'
source: https://gist.github.com/cmer/2a9b78d2145204eedf1029e9305e3e50
source_domain: gist.github.com
fetched_at: '2026-10-12T08:28:46.418448Z'
fetch_provider: builtin
status: draft
type: note
tier: ground_truth
content_type: code
deprecated: false
summary: 'GitHub Gist by cmer: a reusable ''Ultimate LLM Codebase Brain Dump Prompt''
  for GPT-5/Claude Opus/Cursor/Claude Code to perform deep codebase reverse-engineering
  without pasting the full repo into context. Defines a 6-phase protocol: (1) initial
  context scan (purpose, stack, architecture type), (2) system architecture deep dive
  (data flow, integrations, cross-cutting concerns), (3) feature-by-feature technical
  breakdown with entry points/controllers/models/side-effects and cross-feature interaction
  mapping, (4) ''nuances, subtleties & gotchas'' capturing non-obvious design decisions
  and hardcoded business rules, (5) technical reference/glossary with DB schema diagrams,
  (6) final assembly into a self-contained CODEBASE_KNOWLEDGE.md saved under codebase-analysis-docs/.
  Includes a detailed ''Large-Codebase Chunking Controller'' appendix: ~60/40 token
  split between reading and writing, periodic STATE BLOCK emission (INDEX_VERSION,
  FILE_MAP_SUMMARY, OPEN_QUESTIONS, KNOWN_RISKS) for session continuity, a scored
  FILE INDEX pass (prioritizing entry points/high-coupling/heavily-tested modules
  over vendor deps/build artifacts), ~600-1200 token chunking on function/class boundaries
  with stable CHUNK_ID anchors, a tests-first shortcut (start from E2E tests to find
  features fast), dependency-graph heuristics (prioritize by import/call in/out-degree),
  Mermaid diagram rules (<250 tokens each), and a CONTINUE_REQUEST protocol for resuming
  across context-limit boundaries. Directly operationalizes the whitepaper''s ''reverse
  engineering and codebase mastery'' pillar as a concrete, reusable agent Skill/SOP.'
---

Ultimate LLM Prompt for Deep Codebase Analysis & Documentation · GitHub
Skip to content
Search Gists
Search Gists
Sign in
Sign up
You signed in with another tab or window.
Reload
to refresh your session.
You signed out in another tab or window.
Reload
to refresh your session.
You switched accounts on another tab or window.
Reload
to refresh your session.
Dismiss alert
Instantly share code, notes, and snippets.
cmer
/
README.md
Last active
October 7, 2026 07:52
Show Gist options
Download ZIP
Star
72
(
72
)
You must be signed in to star a gist
Fork
9
(
9
)
You must be signed in to fork a gist
Embed
Select an option
Embed
Embed this gist in your website.
Share
Copy sharable link for this gist.
Clone via HTTPS
Clone using the web URL.
No results found
Learn more about clone URLs
Clone this repository at &lt;script src=&quot;https://gist.github.com/cmer/2a9b78d2145204eedf1029e9305e3e50.js&quot;&gt;&lt;/script&gt;
Save cmer/2a9b78d2145204eedf1029e9305e3e50 to your computer and use it in GitHub Desktop.
Embed
Select an option
Embed
Embed this gist in your website.
Share
Copy sharable link for this gist.
Clone via HTTPS
Clone using the web URL.
No results found
Learn more about clone URLs
Clone this repository at &lt;script src=&quot;https://gist.github.com/cmer/2a9b78d2145204eedf1029e9305e3e50.js&quot;&gt;&lt;/script&gt;
Save cmer/2a9b78d2145204eedf1029e9305e3e50 to your computer and use it in GitHub Desktop.
Download ZIP
Ultimate LLM Prompt for Deep Codebase Analysis & Documentation
Raw
README.md
🧠 Ultimate LLM Codebase Brain Dump Prompt
This prompt is designed for
GPT-5
,
Claude Opus 4.1
,
Cursor
,
Claude Code
, and
cursor-agent
to perform a
deep, structured analysis
of any codebase
without pasting the entire repo into chat
.
It guides the LLM to:
Browse and discover the codebase using built-in repo tools
Read only the necessary files in intelligent order
Analyze the system at
high, mid, and low levels
Identify
features, their business purposes, how they work, and how they interact
Output a complete
master knowledge document
inside
`codebase-analysis-docs/`
📂 Output Structure
```
codebase-analysis-docs/
├── CODEBASE_KNOWLEDGE.md   # Main brain dump document
└── assets/                 # Diagrams, schemas, and supplemental files
```
🚀 How to Use
Open your repo
in Cursor, Claude Code, or cursor-agent.
Paste the full prompt
into the model chat (use
`CMD+SHIFT+V`
in Cursor to preserve formatting).
Tell the model to
start with PHASE 1
and let it browse the repo.
The model will:
Explore the file tree
Read key files in priority order
Produce phased deliverables
Save results in
`codebase-analysis-docs/`
Repeat file exploration until all phases are complete.
💡 Best Practices
Prioritize
critical files first (entry points, core logic, configs, DB models).
Let the model chunk work
— it will produce a
`STATE BLOCK`
for continuity.
Ask for diagrams
(Mermaid format) for architecture, data flow, and database schemas.
Commit the generated
`CODEBASE_KNOWLEDGE.md`
for onboarding and future AI sessions.
📌 Ideal For
Onboarding new developers or LLMs
Planning refactors
Security and architecture reviews
Reverse-engineering legacy systems
Raw
Ultimate-LLM-Codebase-Brain-Dump-Prompt-GPT5-Opus.md
Role
You are a
senior software architect
and
documentation specialist
.
Your mission is to
explore this codebase directly
using the tools available in your current environment (file browsing, search, read-file, repo indexing).
You will
discover, read, and analyze only the necessary files
to fully understand the system — you do
not
expect the full codebase to be pasted into the chat.
You will output a
complete “brain dump” document
that another LLM can use to:
Implement new features
Fix bugs
Refactor safely
Output Location Requirement
All documentation you produce
must be saved into the repository under the folder
:
`codebase-analysis-docs`
If the folder does not exist, create it.
The
final master document
should be named:
`codebase-analysis-docs/CODEBASE_KNOWLEDGE.md`
Any diagrams, schemas, or supplemental files should be stored in:
`codebase-analysis-docs/assets/`
All file references in your documentation should be
relative paths
from the repo root.
Tool Usage Guidelines
Explore before reading
: Use repo search, file tree exploration, and directory listings to map the structure before opening files.
Prioritize reads
: Start with the most critical files first (entry points, core modules, configs, database models, major features).
Chunk intelligently
: Open only what you can analyze in context; if needed, break large files into segments.
Iterate & refine
: After each phase, decide the next most valuable files to read to fill knowledge gaps.
State tracking
: Maintain and update a
`STATE BLOCK`
after each major phase so you can resume or continue without losing progress.
Meta-Execution Rules
Internal Thinking First
: For each phase, think through your analysis internally before writing visible output.
Do not expose reasoning chains — only final, clean findings.
Phase-by-Phase Isolation
: Fully complete each phase before moving to the next.
Output Consistency
: Reuse terminology and definitions across phases.
Maximum Specificity
: Always reference actual file paths, class/function names, and relationships.
Self-Containment
: The final document must stand alone — a reader without repo access should still understand the application.
PHASE 1 – Initial Context Scan
Explore the repo structure (directories, files, languages used).
Identify:
Application’s purpose, domain, and target users
Tech stack, frameworks, notable dependencies
Architecture type and directory structure
Decide which files to read first based on importance.
Read those files and summarize.
Deliverable
:
A high-level overview of:
What the application is and does
The main features it provides
The
business purpose
of each feature
How those features relate to and interact with one another at a high level
PHASE 2 – System Architecture Deep Dive
Map all major components and their interactions.
Document:
Data flow (user → backend → database → responses)
Key third-party integrations
Cross-cutting concerns (security, logging, caching, authentication)
Identify architectural patterns and conventions.
Read additional files as needed to clarify details.
Deliverable
: Architecture diagrams, component maps, and data flow descriptions.
PHASE 3 – Feature-by-Feature Analysis
For
each feature
:
Describe
its purpose
and
the higher-level business need it fulfills
.
Explain
how it works technically
:
Entry points (routes, UI)
Controllers/services
Models/DB
Side effects (emails, jobs, webhooks)
Describe
how it interacts with other features
and shared modules.
Note edge cases and hidden dependencies.
Read code directly where needed to confirm details.
Deliverable
:
Detailed technical breakdown for each feature
Cross-feature interaction map
Explanation of how individual features combine to serve broader business goals
PHASE 4 – Nuances, Subtleties & Gotchas
Record non-obvious design decisions and likely rationale.
Highlight:
Performance optimizations or bottlenecks
Security implications
Hardcoded business rules
Explain tricky or counterintuitive code clearly.
Deliverable
: “Things You Must Know Before Changing Code” section.
PHASE 5 – Technical Reference & Glossary
Compile glossary of domain terms.
List key classes, modules, and functions with summaries.
Include database schema diagrams and relationships.
Document internal/external APIs with examples.
PHASE 6 – Final Knowledge Document Assembly
Merge all findings into:
High-Level Overview
Mid-Level Technical Notes
Deep Reference Section
Ensure:
Clear articulation of
features and their business purposes
Explanation of
feature-to-feature interactions
Technical references for all components
Include diagrams, flowcharts, and cross-references.
Ensure it’s complete and self-contained.
Save this document as
`codebase-analysis-docs/CODEBASE_KNOWLEDGE.md`
Final Output Requirements
Clear, explicit language — no vague statements.
Organized headings and bullet lists.
Text-friendly diagrams (Mermaid, ASCII, descriptive).
Tie every claim to a file, function, or feature.
Output a
ready-to-use master knowledge document
inside
`codebase-analysis-docs`
.
Appendix: Large-Codebase Chunking Controller
A. Token & State Discipline
~60% tokens for reading, ~40% for writing.
After each phase or major section, emit a
`STATE BLOCK`
:
`INDEX_VERSION`
`FILE_MAP_SUMMARY`
(top ~50 files)
`OPEN_QUESTIONS`
`KNOWN_RISKS`
`GLOSSARY_DELTA`
If near token limit: output
`CONTINUE_REQUEST`
with latest
`STATE BLOCK`
.
B. File Index & Prioritization (Pass 0)
Explore file tree & classify: code, tests, configs, migrations, infra, docs.
Score importance:
`+`
Entry points, high-coupling modules, heavily tested modules, runtime-critical configs, feature modules
`–`
Vendor deps, build artifacts, large binaries
Emit
`FILE INDEX`
:
`(#) PRIORITY | PATH | TYPE | LINES | HASH8 | NOTES`
C. Chunking Strategy
Target ~600–1200 tokens per chunk.
Split on function/class boundaries.
Label chunks as:
`CHUNK_ID = PATH#START-END#HASH8`
.
Include local headers in each chunk note.
D. Iterative Passes
Pass 1: Mapping (breadth-first)
Pass 2: Backbone Deep Dive
Pass 3: Feature Catalog
Pass 4: Cross-Cutting Concerns
Pass 5: Synthesis
E. Tests-First Shortcuts
Start from E2E/integration tests to identify features quickly.
F. Dependency Graph Heuristics
Build import/call maps; prioritize by in/out degree.
G. Diagram Rules
Use
Mermaid
for architecture, sequence, ER diagrams.
Keep each diagram <250 tokens.
H. Stable Anchors & Cross-Refs
Use
`[[F:path#line-range#hash]]`
for file refs.
Preserve anchors when updating.
I. Handling Opaque/Generated Code
Record source maps, generators, API surface.
J. Missing Artifacts & Assumptions
Maintain
`ASSUMPTIONS`
table with confidence levels.
K. Output Hygiene
Every section must be actionable.
End sections with: Decisions/Findings, Open Questions, Next Steps.
L. Continuation Protocol
If context limit reached:
Output:
`CONTINUE_REQUEST`
Latest
`STATE BLOCK`
`NEXT_READ_QUEUE`
(ordered list of CHUNK_IDs)
Resume by re-ingesting the
`STATE BLOCK`
and continuing.
guilhermehfr
commented
May 17, 2026
Copy link
Copy Markdown
Might be worth adding a clearer
prioritization
or
stopping rule
for the agent exploration. Right now the prompt pushes more toward
broad repo coverage
, which could reduce efficiency on larger codebases, where the core architectural components commonly matter more than overall completeness.
Sorry, something went wrong.
Uh oh!
There was an error while loading.
Please reload this page
.
Sign up for free
to join this conversation on GitHub
.
    Already have an account?
Sign in to comment
You can’t perform that action at this time.
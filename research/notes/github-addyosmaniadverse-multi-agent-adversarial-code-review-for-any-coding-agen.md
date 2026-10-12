---
title: 'GitHub - addyosmani/adverse: Multi-agent adversarial code review for any coding
  agent · GitHub'
id: github-addyosmaniadverse-multi-agent-adversarial-code-review-for-any-coding-agen
tags:
- ai-software-factory-architecture-58e4cc
- code-review-automation
- primary-implementation
- adversarial-review
created: '2026-10-12T08:28:45.181459Z'
updated: '2026-10-12T08:32:43.932951Z'
source: https://github.com/addyosmani/adverse
source_domain: github.com
fetched_at: '2026-10-12T08:28:45.177703Z'
fetch_provider: builtin
status: draft
type: note
tier: ground_truth
content_type: code
deprecated: false
summary: 'GitHub repo ''adverse'' (addyosmani, MIT license, 60 stars) — multi-agent
  adversarial code review tool shipping as both a CLI (npm install -g adverse, works
  with any agent that reads stdin/writes stdout: Claude Code, Codex CLI, Gemini, Aider,
  Ollama) and a Claude Code Skill (npx skills add addyosmani/adverse). Core design:
  rather than two different models catching each other''s blind spots (expensive,
  two API keys), uses one model running three orthogonal personas — Auditor (correctness/logic),
  Adversary (security/trust boundaries/attack chains), Pragmatist (maintainability/design
  fit) — explicitly scoped to not duplicate each other.


  Two-round process: Round 1 runs all three personas in parallel as independent reviews
  (3 model calls); Round 2 has each persona cross-examine the other two''s round-1
  findings in parallel, validating or challenging them and surfacing new findings
  (3 more calls) — 6 total model invocations per review, halved with --single-round.
  Synthesis is explicitly deterministic Node.js code, not a fourth LLM call — the
  author''s stated rationale is that an LLM synthesizer ''would cost more, add another
  failure mode, and inherit the same single-model bias the personas have.'' Findings
  are bucketed by cross-talk: cross-validated (>=2 personas), consensus (1 reported
  + 1 validated), disputed (1 reported + 1 challenged), solo (no cross-talk) — giving
  a confidence signal beyond raw finding count. Exit code 1 (reject verdict) is the
  documented CI-gate wiring point; exit 3 means fewer than 2 reviewers produced valid
  output and synthesis aborted — a built-in fail-closed behavior.


  Named limitation acknowledged directly: single-model anchoring bias is real even
  with cross-review mitigation; the author recommends running adverse twice with different
  underlying agents and diffing reports if true decorrelation is needed. Also caps
  review size at 250KB total/30KB per file in non-diff mode (use --diff for PR-scale
  reviews). Directly relevant primary-source evidence for the Adversarial Model Review
  pillar — a concrete, running implementation of persona-based adversarial review
  with an explicit deterministic (non-LLM) synthesis step to avoid inheriting model
  bias at the aggregation layer.'
---

GitHub - addyosmani/adverse: Multi-agent adversarial code review for any coding agent · GitHub
Skip to content
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
main
Branches
Tags
Go to file
Code
Open more actions menu
Latest commit
History
17 Commits
17 Commits
Folders and files
Name
Name
Last commit message
Last commit date
bin
bin
skills/
adverse-review
skills/
adverse-review
src
src
tests
tests
.gitignore
.gitignore
LICENSE
LICENSE
README.md
README.md
package.json
package.json
View all files
Repository files navigation
adverse
Multi-agent adversarial code review for
any
coding agent. Ships as both a standalone
CLI
and a Claude Code
Skill
— pick whichever fits your workflow, the underlying logic is the same Node.js code.
```
$ adverse review ./src
⏳ collecting source...
   42 files in ./src
⏳ round 1: 3 reviewers in parallel...
   ✓ auditor:    5 findings, conditional (38.2s)
   ✓ adversary:  3 findings, reject       (44.7s)
   ✓ pragmatist: 4 findings, approve      (29.1s)
⏳ round 2: 3 reviewers cross-examining...
   ✓ auditor:    2 validated, 1 challenged, 0 added
   ✓ adversary:  4 validated, 0 challenged, 1 added
   ✓ pragmatist: 1 validated, 2 challenged, 0 added
⏳ synthesizing...

# Adversarial Code Review

**Verdict:** SHIP-WITH-CAVEATS (2/3 ship, 1/3 block)
**Findings:** 3 critical · 5 warning · 1 info

## Cross-validated findings (multiple reviewers reported independently)
### 🔴 [CRITICAL] SQL injection in query builder — db.py:22
…
```
Two ways to run it
As a CLI
Wraps any coding-agent CLI that reads stdin and writes stdout — Claude Code, Codex CLI, Gemini, Aider, Ollama. Good when you want to gate CI, run from a Makefile, or use a non-Anthropic model.
```
npm install -g adverse
# or run directly without installing:
npx adverse review ./src
```
As a Claude Code Skill
The skill is in
`skills/adverse-review/`
. One-liner install via
skills.sh
:
```
npx skills add addyosmani/adverse
```
That clones the repo, locates
`skills/adverse-review/`
, and installs it to
`~/.claude/skills/adverse-review/`
(or
`.claude/skills/`
with
`--project`
). Re-run to update. If you'd rather pin the exact subpath,
`npx skills add https://github.com/addyosmani/adverse/tree/main/skills/adverse-review`
works too. Or do it by hand:
```
git clone https://github.com/addyosmani/adverse.git ~/.adverse-source
mkdir -p ~/.claude/skills
ln -s ~/.adverse-source/skills/adverse-review ~/.claude/skills/adverse-review
```
Inside Claude Code, ask for "adversarial review", "adverse review of these changes", or "review my changes from multiple angles" — or hit
`/adverse-review`
. The skill handles scope detection (uncommitted changes vs branch diff vs full tree), spawns three reviewer subagents in parallel via Claude Code's native Agent tool (no nested-auth issues, no subprocess overhead), runs the cross-review round, and calls a small Node helper for the deterministic synthesis step. Needs
`node`
≥ 20 on PATH; no
`npm install`
.
Both modes share the same
`src/`
core, so a finding the CLI flags is the same finding the Skill flags — no drift between the two.
Why this design
The naive way to do "AI code review" is one model, one shot. You get one perspective with all the blind spots that perspective has.
The next step up is what some prior projects did: two
different
models (Claude + GPT Codex), so each catches what the other misses. This works but it's expensive, slow, requires two API keys, and ties you to whichever two providers the script knows about.
`adverse`
does the third thing: one model, three
personas
, with explicit cross-examination between them. The personas are designed to be orthogonal — Auditor catches logic bugs the Adversary won't go looking for; the Adversary names attack chains the Auditor won't think about; the Pragmatist sees the design problem both of the others ignore. Then in round 2 each persona has to go on record about the others' findings — validate or challenge — so the synthesizer can tell you which findings have multi-perspective support and which are one reviewer's hunch.
Trade-off, named honestly: a single model running three personas has anchoring bias that two separate models don't. The cross-review round mitigates this (each persona must defend a position visible to the others), and the personas themselves are written with explicit "stay in your lane / do not duplicate the others" instructions. But if you genuinely need decorrelated outputs across the model boundary, run
`adverse`
twice with different agents and diff the reports.
Install
```
# global install (gives you the `adverse` binary on PATH)
npm install -g adverse

# or one-shot
npx adverse review ./src
```
Requires Node.js 20+. Zero runtime dependencies.
CLI usage
```
# Default: review the current directory using `claude -p`.
adverse review

# Specific path with a specific agent.
adverse review ./src --agent "claude -p"
adverse review ./src --agent "codex exec --quiet"
adverse review ./src --agent "gemini"
adverse review ./src --agent "ollama run llama3.1"

# Review only the changes on this branch.
adverse review --diff main

# Review uncommitted changes.
adverse review --diff

# Save the report to a file (markdown, JSON, and self-contained HTML).
adverse review --out review.md --json-out review.json --html-out review.html

# Skip cross-review (faster, less rigorous).
adverse review --single-round

# Run a different subset of personas.
adverse review --personas auditor,adversary

# See what came back from each agent (for debugging).
adverse review --save-artifacts ./.adverse-debug --verbose
```
The
`--agent`
flag accepts any command that reads a prompt from stdin and writes a response to stdout. Adverse handles the common output shapes — plain text, fenced JSON, Claude's
`{"result": "..."}`
wrapper, Anthropic content-block format — and retries once with feedback if the agent's first response doesn't parse.
Environment variables
Variable
Effect
`ADVERSE_AGENT`
Default for
`--agent`
(e.g.
`export ADVERSE_AGENT="codex exec --quiet"`
).
`ADVERSE_LIVE`
Set to
`1`
to run the live-Claude integration tests.
Exit codes
Code
Meaning
0
Review completed; verdict was approve, conditional, or hold
1
Review completed; verdict was reject
2
Bad arguments (target missing, unknown persona, etc.)
3
Fewer than 2 reviewers produced valid output — synthesis aborted
Code 1 is what you wire into a CI gate.
`synthesize`
subcommand
Used internally by the Skill, also useful standalone if you have round-1/round-2 JSON from somewhere else and just want the report:
```
adverse synthesize \
    --round1 round1-combined.json \
    --round2 round2-combined.json \
    --out report.md \
    --html-out report.html
```
The personas
Persona
Lens
Auditor
Correctness, logic, and algorithmic soundness — does this code compute the right answer?
Adversary
Security, abuse, trust boundaries — what can a hostile caller do?
Pragmatist
Maintainability, complexity, design fit — will this survive contact with reality?
`adverse personas`
prints them at runtime. Each persona's full system prompt is in
`src/personas.mjs`
; they're written with explicit "what's in scope / what's out of scope" rules so they don't duplicate each other's work. Keep new personas orthogonal to the existing three — overlap costs money for no signal.
How it works
```
┌──────────────────────────────────────────────────────────────────────┐
│  Round 1 — Independent Reviews                  (parallel, 3 calls) │
│  Each persona reviews the code with only its own lens.              │
│  Output: { verdict, summary, findings[] }                           │
├──────────────────────────────────────────────────────────────────────┤
│  Round 2 — Cross-Review                         (parallel, 3 calls) │
│  Each persona sees all three round-1 reviews and:                   │
│    • validates findings it agrees with                              │
│    • challenges findings it thinks are wrong / overstated           │
│    • adds new findings the other angles surfaced                    │
├──────────────────────────────────────────────────────────────────────┤
│  Synthesis — Deterministic                              (no LLM)    │
│  Merge findings, score consensus, render report:                    │
│    cross-validated → reported by ≥2 personas                        │
│    consensus       → reported by 1, validated by another            │
│    disputed        → reported by 1, challenged by another           │
│    solo            → reported by 1, no cross-talk                   │
└──────────────────────────────────────────────────────────────────────┘
```
Synthesis is
deterministic Node code
, not another LLM call. A fourth model invocation would cost more, add another failure mode, and inherit the same single-model bias the personas have. Counting validate / challenge edges is enough.
Per review: 6 model invocations (3 round-1 + 3 round-2).
`--single-round`
halves it. Wall time is roughly twice the slowest single invocation since personas run in parallel within each round.
Tests
```
npm test                       # 111 unit + contract tests, no API calls. Fast (~1s).
npm run test:live              # Live tests against `claude -p`. Requires `claude` on
                               # PATH and auth — won't pass from inside a nested Claude
                               # Code session because subprocesses don't inherit auth.
```
Coverage includes JSON-extraction across every wrapper shape Claude Code can produce (
`{"result": ...}`
, content-block, plain-string, fenced markdown, banner-then-JSON, raw), validator and synthesis logic, source collection, retry behavior, full CLI subprocess flow. Contract tests in
`tests/fixtures/claude-cli/`
pin the wrapper shapes — drop a new file in there when Claude ships a CLI change and the suite picks it up automatically.
Project layout
```
src/                          # Shared core, used by both CLI and Skill
  personas.mjs                # Three persona system prompts
  prompts.mjs                 # Phase-1/Phase-2 prompt construction + validators
  parse.mjs                   # JSON extraction across every wrapper shape
  collect.mjs                 # Directory walk + git-diff source collection
  runner.mjs                  # Subprocess agent invocation + parallel orchestration
  synthesis.mjs               # Deterministic merge + markdown rendering
  html.mjs                    # Self-contained HTML dashboard renderer
  cli.mjs                     # Argv parsing + command dispatch

bin/
  adverse.mjs                 # CLI entrypoint (#!/usr/bin/env node)

skills/adverse-review/
  SKILL.md                    # Claude Code playbook (the "code" of the Skill)
  scripts/
    collect.mjs               # Skill bridge: source collection
    combine.mjs               # Skill bridge: combine per-persona JSON
    synthesize.mjs            # Skill bridge: deterministic synthesis
    dump-prompts.mjs          # Regenerate prompt files from src/personas.mjs
    prompts/                  # Persona system prompts as plain .txt for the Skill
      auditor.txt, adversary.txt, pragmatist.txt
      round1.txt, round2.txt

tests/
  *.test.mjs                  # node --test, no Jest/Mocha
  fixtures/claude-cli/        # Pinned `claude -p` output shapes (contract tests)
  fixtures/fake-agent.mjs     # Stub agent for end-to-end CLI tests
```
Limitations
Single-model anchoring bias.
Honest answer: a single model running three personas correlates more than three independent models would. Cross-review round mitigates; running adverse twice with different agents decorrelates. Don't pretend this is the same thing as two-provider review.
Source size cap.
Default 250 KB total / 30 KB per file. Trips on very large repos in non-diff mode. Use
`--diff`
for review-on-PR workflows where the change set is what matters.
Subprocess agent contract.
The CLI assumes the agent reads prompt from stdin and writes the response to stdout, exiting cleanly. Most coding agents support this; some need a flag (
`-p`
for Claude Code,
`exec`
for Codex CLI). When in doubt, run the agent manually with a stdin prompt first to confirm the shape.
Not a fix-applier.
This tool produces a report. Hand the report to your coding agent if you want fixes applied.
License
MIT
About
Multi-agent adversarial code review for any coding agent
Resources
Readme
MIT license
Activity
Stars
60
stars
Watchers
0
watching
Forks
8
forks
Report repository
Releases
Packages
Contributors
Languages
You can’t perform that action at this time.
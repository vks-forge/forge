---
title: Adversarial Code Review - Cross-Model AI Assessment | Get Claude Skills
id: adversarial-code-review-cross-model-ai-assessment-get-claude-skills
tags:
- ai-software-factory-architecture-58e4cc
- adversarial-review
- cross-model-verification
created: '2026-10-12T08:29:46.460893Z'
updated: '2026-10-12T08:31:30.006907Z'
source: https://www.getclaudeskills.com/skills/adversarial-code-review-basicmachines-co
source_domain: www.getclaudeskills.com
fetched_at: '2026-10-12T08:29:46.458706Z'
fetch_provider: builtin
status: draft
type: note
tier: unknown
content_type: unknown
deprecated: false
summary: 'Documentation page (getclaudeskills.com) for ''Adversarial Code Review,''
  an open Agent Skill by basicmachines-co (3.6k GitHub stars on basic-memory repo)
  implementing cross-vendor adversarial code review directly matching the query''s
  pillar 1. Mechanism: two reviewers from different model families (Claude and Codex/GPT)
  independently review the same git diff with zero shared context (fresh subprocess,
  no shared session), then each tries to REFUTE the other''s findings; a finding''s
  confidence is derived from whether it survives cross-examination, not from a single
  model''s confidence score. Explicitly designed to kill two named failure modes of
  solo LLM review: ''self-ratification'' (a model won''t critique its own work) and
  ''confident false positives.'' Includes a deterministic-gate phase before any model
  runs (lint/typecheck/grep for house-rule violations like bare except or getattr-with-silent-default)
  on the reasoning that ''models are statistically blind to negation ("never do X")''
  — mechanical rules must be enforced by tools, not prompts. Confidence taxonomy:
  High = both models independently found it, or one found it and the other upheld
  it under refutation; Medium = one found it, other couldn''t refute but didn''t independently
  find it; Low/contested = one found it and the other refuted it — explicitly never
  silently dropped, shown to the human with both sides. Explicit non-goals: no loop-until-both-agree
  (''models converge by going silent, not by being right''), no persisted state/artifacts,
  no auto-applying fixes — always ends with human picking which findings to fix. Direct
  quote worth preserving: ''Convergence between the models is not correctness.'''
---

Adversarial Code Review - Cross-Model AI Assessment | Get Claude Skills
New to Claude Skills?
Learn how to install them →
Adversarial Code Review
Free
Get independent code reviews from multiple AI models.
by
basicmachines-co
3.6k
stars on
basicmachines-co/basic-memory
99
views
Updated
Aug 10, 2026
Get this skill
Free · Opens the source repo
What
Adversarial Code Review
does
Adversarial Code Review is a specialized skill designed for developers who want to enhance their code review process by leveraging the strengths of multiple AI models. This skill facilitates a cross-vendor review of code diffs by employing two different model families—Claude and Codex/GPT. Each model independently reviews the code changes, providing findings that are then subjected to a cross-examination where each model attempts to refute the other's conclusions. This approach reduces the risk of self-ratification, where a model might overlook its own errors, and minimizes confident false positives, ensuring that only the most reliable findings are reported.
The process begins by identifying which model family is being used. The user acts as the first reviewer, utilizing their native tools to analyze the code, while the second review is conducted by invoking the other model as a subprocess. This separation of context is crucial, as it allows each model to provide an independent assessment without any bias from the other. The findings from both models are then compared, and those that withstand the scrutiny of refutation are reported along with their confidence levels.
This skill is particularly useful when a developer is preparing to merge changes and wants to ensure high confidence in the quality of the code. By providing a second opinion from a different model family, it helps to catch issues that might be missed in a single-model review. Furthermore, it can be run from either Claude Code or Codex, making it versatile for users familiar with either environment.
In summary, Adversarial Code Review is an effective tool for developers seeking to improve their code quality through rigorous and independent assessments from multiple AI models, ensuring that only the most reliable findings are considered before merging changes.
When to use it
Use this skill when you need a thorough and independent review of code changes, especially before merging into the main branch.
When not to use it
This skill may not be suitable for quick reviews or when a single model's insights are sufficient, as it requires running two independent reviews.
What you can build with it
Pre-Merge Review
Use this skill to conduct a thorough review of code changes before merging them into the main branch, ensuring high confidence in the findings.
Cross-Model Insights
Leverage insights from both Claude and Codex to gain a comprehensive understanding of potential issues in your code.
Quality Assurance
Incorporate this skill into your development workflow to enhance code quality through independent assessments.
How to install
Adversarial Code Review
View source
Claude Code
Claude API
Codex CLI
Cursor
Google Antigravity
GitHub Copilot
1. Install with the skills CLI
`npx skills add basicmachines-co/basic-memory/adversarial-review --agent claude-code`
2. Or install it manually
Download the skill folder and drop it into
`~/.claude/skills/`
for all projects, or
`.claude/skills/`
to scope it to one repo. Restart
Claude Code
so it picks up the new skill.
Anthropic's agentic coding CLI, and the reference implementation of Agent Skills. Drop a skill folder into ~/.claude/skills and Claude Code loads it automatically whenever a task matches the skill's description.
Claude Code
docs
Inside SKILL.md
Written by
basicmachines-co
Adversarial code review
Two reviewers from
different model families
—
Claude
and
Codex/GPT
— review the
same diff independently, then each tries to
refute
the other's findings. A finding's
confidence comes from whether it survives that cross-examination. This kills the two failure
modes of solo LLM review: self-ratification (a model won't critique its own work) and
confident false positives.
You are the orchestrator — and one of the two reviewers
This skill runs from
either
Claude Code
or
Codex. First,
identify which model
family you are
(Claude or Codex/GPT). Then:
You
are reviewer #1. You review
natively
, in this session, using your own tools.
The other family
is reviewer #2. You invoke it as a
subprocess CLI
for an
independent pass: a fresh process, no shared context — that independence is the point.
The CLI for "the other model":
If you are…
Invoke the other via…
Claude
`codex exec`
(GPT)
Codex
`claude -p`
(Claude)
Everything else in the flow is symmetric. Resolve the
`prompts/`
and
`schemas/`
paths
below relative to
this skill's own directory
(where this SKILL.md lives).
Inputs
Two independent, optional inputs:
`BASE`
— the ref to diff against. Default
`main`
.
`SCOPE`
— a pathspec to narrow the review (e.g.
`src/basic_memory`
). Default: none (whole diff).
These are separate: a ref and a pathspec are not interchangeable. Build the
canonical diff
command
once in preflight and reuse it everywhere below — never re-spell the diff inline
(the scattered, inconsistent spelling is what broke earlier). Build it as an
argv array
,
not a string, so a
`$SCOPE`
containing spaces or glob characters survives intact:
```
BASE="${BASE:-main}"
DIFF=(git diff "$BASE...HEAD")          # argv array — never a scalar string
[ -n "$SCOPE" ] && DIFF+=(-- "$SCOPE")  # pathspec stays one argument even with spaces
DIFF_STR=$(printf '%q ' "${DIFF[@]}")   # shell-quoted rendering, for embedding in a prompt
```
To
run
it, use
`"${DIFF[@]}"`
(quoted, no word-splitting). To
embed
it as text inside
a subprocess prompt, use
`$DIFF_STR`
.
Preflight
Set
`SKILL_DIR`
to the directory this SKILL.md lives in. Canonical location is
`.agents/skills/adversarial-review`
(the shared agent-skills store); Claude Code reaches it
via the
`.claude/skills/adversarial-review`
symlink, Codex via its own skills path. The
`prompts/`
and
`schemas/`
subdirs are siblings of this file in every case.
Confirm the
other
model's CLI is on PATH (
`codex`
if you're Claude,
`claude`
if you're
Codex). If it's missing, tell the user the panel falls back to single-model (which loses
the cross-vendor benefit) and ask whether to proceed or stop.
Run
`"${DIFF[@]}"`
. If it prints nothing, report "nothing to review against $BASE"
(mention
`$SCOPE`
if set) and stop.
`RUN=$(mktemp -d)`
— scratch dir for the other model's output. Transient, never committed.
No persisted artifacts, no state file.
Phase 0 — Deterministic gates (before the models)
Models are statistically blind to negation ("never do X"). Enforce mechanical house rules
with tools, not prompts, and treat hits as high-confidence facts (reported separately from
model findings):
`just lint`
and
`just typecheck`
if the diff touches
`src/`
.
Grep the diff for catchable house-rule violations:
`getattr(.*,.*,`
defaults, bare
`except:`
/
`except Exception: pass`
, function-scope imports.
Phase 1 — Independent review (you + the other model, concurrently)
Both reviewers get the same brief:
`prompts/review.md`
+ the repo's
`CLAUDE.md`
house rules,
reviewing the diff from
`"${DIFF[@]}"`
. Both emit findings matching
`schemas/findings.schema.json`
.
Your native pass:
review as yourself, following
`prompts/review.md`
. Hold your findings
as that JSON shape.
The other model's pass
— run, from the repo root, the row that matches you:
Always redirect
`codex`
stdin from
`/dev/null`
— if stdin is a pipe (e.g. the call gets
backgrounded),
`codex exec`
blocks "Reading additional input from stdin..." and fails.
````
# You are Claude → run Codex:
codex exec -s read-only \
  --output-schema "$SKILL_DIR/schemas/findings.schema.json" \
  -o "$RUN/other_findings.json" \
  "$(cat "$SKILL_DIR/prompts/review.md")

Review the diff: $DIFF_STR" </dev/null

# You are Codex → run Claude (read-only via plan mode; parse the JSON block it returns):
claude -p --permission-mode plan --output-format json \
  "$(cat "$SKILL_DIR/prompts/review.md")

Review the diff: $DIFF_STR
Return ONLY a JSON object matching this schema:
$(cat "$SKILL_DIR/schemas/findings.schema.json")" </dev/null > "$RUN/other_raw.json"
# claude --output-format json output shape varies by CLI version: it may be a JSON ARRAY
# of event objects, OR a single result object. Normalize before reading: if it's an array,
# take the element with type=='result'; otherwise use the object as-is. Then read its
# .result string, strip the ```json fence if present, and parse that.
# (Verified empirically: the CLI in this environment emits the array form.)
````
Runtime note for Codex orchestrating:
`claude -p`
needs network access, which Codex's
default sandbox blocks. Run it from a Codex session whose project is trusted with network
allowed (or approve the
`claude`
call when prompted). Keep Codex's own sandbox on — do not
bypass it just to reach the network.
Tag each finding with its origin (
`claude`
/
`codex`
).
Phase 2 — Cross-refute
Each model tries to refute the
other's
findings, per
`prompts/refute.md`
(verdicts match
`schemas/verdicts.schema.json`
).
You
refute the other model's findings natively.
The other model
refutes
your
findings — invoke it again the same way (swap
`prompts/review.md`
for
`prompts/refute.md`
, append your findings JSON
and
`$DIFF_STR`
so it judges against the right base and scope, and for Codex use
`--output-schema "$SKILL_DIR/schemas/verdicts.schema.json"`
).
Match verdicts to findings by
`id`
.
Phase 3 — Synthesize and report (no auto-fix)
Merge, dedupe (same file + overlapping lines + same root cause = one finding), assign
confidence from provenance:
High
— both models raised it independently, OR one raised it and the other upheld it.
Medium
— one raised it; the other could not refute it but did not independently find it.
Low / contested
— one raised it and the other
refuted
it. Keep it, show both sides,
let the human judge. Never silently drop a contested finding.
Deterministic-gate hits are reported as facts, separate from the model panel.
Rank by
`severity × confidence`
. Present a compact table:
`severity | confidence | file:line | claim | found-by / upheld-or-refuted-by`
. Expand the high-confidence ones with
`why`
and
any suggested fix.
End by asking which findings, if any, to fix.
Do not edit code until the user picks.
Convergence between the models is not correctness — your job is to surface a ranked,
cross-examined list, not to declare the branch clean.
Deliberately NOT done
No loop-until-both-agree (models converge by going silent, not by being right).
No persisted artifacts / state machine — the scratch dir is thrown away.
No auto-applying fixes.
Frequently asked questions about
Adversarial Code Review
What is the main purpose of the Adversarial Code Review skill?
How does the skill ensure the reliability of its findings?
Can I use this skill with any code repository?
What happens if one of the models is unavailable?
Is this skill suitable for beginners?
Similar skills
OpenClaw PR Maintainer
Streamline your GitHub issue and PR management.
Coding Agent
Delegate coding tasks to AI agents efficiently.
Test Audit
Streamline your test writing and auditing process.
Tag Duplicate PRs and Issues
Efficiently manage duplicate pull requests and issues.
OpenClaw Repair Sweep
Automate issue and PR management with worker fleets.
Agent Transcript
Enhance GitHub PRs with redacted agent transcripts.
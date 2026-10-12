---
title: How I Validate Quality When AI Agents Write My Code - DEV Community
id: how-i-validate-quality-when-ai-agents-write-my-code-dev-community
tags:
- ai-software-factory-architecture-58e4cc
- agent-quality
- quality-gates
- multi-agent-review
- agent-memory
created: '2026-10-12T08:27:48.472772Z'
updated: '2026-10-12T08:32:40.689323Z'
source: https://dev.to/teppana88/how-i-validate-quality-when-ai-agents-write-my-code-481c
source_domain: dev.to
fetched_at: '2026-10-12T08:27:48.469380Z'
fetch_provider: builtin
status: draft
type: note
tier: commentary
content_type: blog
deprecated: false
summary: 'Practitioner (dev.to, handle teppana88) describes a concrete production
  8-gate quality pipeline for AI-agent-written code, structured like a software-factory
  assembly line with independent specialized agents per gate rather than one agent
  doing everything (reports that detailed instructions telling one coding agent to
  handle testing, architecture, and edge cases all at once never worked reliably;
  the breakthrough was decomposing into independent validation agents). The 8 gates:
  (1) Requirements Definition, consuming roughly 70 percent of the humans time via
  a requirements-analyst agent that reads issues, researches best practices, and asks
  clarifying questions until acceptance criteria are unambiguous and testable, framed
  as the contract between the human and the agents; (2) Architecture Design, where
  a code-architect agent reads 10-20 maintained living docs and designs file-level
  blueprints and build sequences, bounding scope and preventing over-engineering;
  (3) Implementation with incremental testing and compact structured tool output,
  since verbose tool output slows AI agents down significantly, enforcing 90 percent
  coverage per file; (4) an independent Code Validator Agent that runs the test suite,
  reviews coverage, and scores each flagged issue 0-100 on confidence (only scores
  of 75 or above are reported), with commits hard-blocked until the validator returns
  PASS and automatic re-invocation of the developer agent on FAIL; (5) Multi-Agent
  Code Review across the full feature diff using four parallel specialized agents
  (Architecture Compliance, Bug Detection, Security Review, End-to-end Test), each
  flagged issue re-validated by a separate confirmation agent to suppress false positives,
  explicitly excluding style nitpicks; (6) a from-scratch CI/CD pipeline (lint and
  typecheck, per-package parallel tests, build, static scanners) using smart change
  detection so only affected packages retest, with draft-PR gating so CI minutes are
  spent only on code that already passed gates 3 and 4; (7) the only manual human-approval
  gate, intentionally lightweight, described as not hunting for bugs but checking
  that the feature makes sense; (8) automated deployment verification per component
  with env-var validation pre-build and explicit failure and retry signaling on partial
  deploy failure.


  Reports a concrete caught-bug case study: a shared-data-model field update passed
  unit tests, type-check, and 90-plus percent coverage, yet the Validator agent at
  Gate 4 caught that the Firestore converter was never updated, so data would silently
  be written but lost on read, a bug invisible to mocked unit tests and to the type
  system because a spread operator silently dropped unknown fields. This failure was
  then encoded into persistent long-term agent memory (converter updates require synchronized
  changes in four-plus locations) so future agents are warned before writing code,
  framed as gates catch problems once, memory prevents them forever. Reports steady-state
  overhead of roughly 20 minutes of automated gate-checking per feature regardless
  of feature size or complexity.'
---

How I Validate Quality When AI Agents Write My Code - DEV Community
Someone asked me the best question after I posted about
managing AI agents like a dev team
:
And how do you validate quality?
Fair point. If AI is writing the code, who's making sure it actually works?
My solution: a system of enforced gates that makes shipping bad code harder than shipping good code. Here's how I built that system.
The Mental Model: Quality Is a Pipeline, Not a Checkpoint
Often we think of quality as something you check at the end. Run the tests. Do a code review. Ship it.
But we have already learned this lesson with SDLC / SSDLC:
security and quality must be embedded in every phase, not bolted on at the end.
The same principle applies when AI writes the code. The difference is that you can't rely on AI agent developer discipline to follow the process. Your AI framework must enforce it through gates that agents cannot bypass.
AI agents can produce plausible-looking code that passes superficial inspection but drifts from requirements, violates architecture patterns, or introduces subtle bugs. I first tried the obvious approach: detailed instructions telling the coding agent to handle testing, architecture patterns, and edge cases all at once. It never worked reliably. The breakthrough came when I loosened the constraints. Let the LLM write its best code freely, then build independent validation gates with separate agents that catch what the first one missed.
My workflow has
eight quality gates
. Code must pass through all of them before it reaches production.
If issues surface at Gate 5, 6, or 7, the fix flows back through Gate 3 → 4 before proceeding. In my experience, most issues are caught at Gate 4.
Gate 1: Requirements Definition (~70% of My Time)
This is the most counterintuitive part. In an AI-native workflow, I spend roughly
70% of my time
defining requirements, not writing code. My role has shifted from
how to build it
to
what to build and why
. The code is the agent's job. Getting the requirements right is mine.
Why does this matter for quality? Because agents are extremely literal. Give them vague instructions and they'll build something that technically matches what you said but misses what you meant. The quality of AI output is directly proportional to the clarity of input.
How It Works
I use a
requirements-analyst agent
that:
Reads the issue from our project management tool (Linear)
Researches business requirements documentation to map functional and non-functional requirements
Searches for industry patterns and best practices
Asks me clarifying questions
until requirements are unambiguous
Decomposes epics into right-sized stories with clear acceptance criteria
Every issue gets a structured format:
```
## What
[Problem to solve]

## Why
[Business value]

## Context
[Constraints, dependencies, scope]

## Acceptance Criteria
- [ ] Criterion 1 (specific, testable)
- [ ] Criterion 2
- [ ] Criterion 3
```
Enter fullscreen mode
Exit fullscreen mode
The key insight:
acceptance criteria are the contract between me and the agents.
If a criterion is vague, the agent will interpret it however it wants. If it's specific and testable, the agent has a clear target, and so does the validator that checks the work later.
But requirements alone aren't enough. I also maintain
architecture documentation
: files that describe the project's patterns, conventions, data models, and design system. When a code-architect agent later designs the implementation, it reads these docs and follows established patterns rather than inventing its own. The requirements define
what
, the architecture docs constrain
how
.
What This Prevents
Scope creep (agents build exactly what's specified, nothing more)
Spec drift (each sub-task traces back to business requirements)
Wasted iterations (ambiguities are resolved before any code is written)
Gate 2: Architecture Design
Before any code is written, a
code-architect agent
takes the requirements from Gate 1 and the architecture documentation I maintain, then designs the implementation. For example, my project maintains docs like these:
```
docs/code-documentation/
├── architecture-backend.md
├── architecture-frontend.md
├── business-requirements.md
├── gcp-setup.md
├── design-system.md
├── testing-guidelines.md
└── ...
```
Enter fullscreen mode
Exit fullscreen mode
I typically maintain 10-20 such documents per project. These are living documents that evolve with the codebase. They serve as context for every agent, ensuring each one understands the project's patterns, conventions, and constraints before making any decisions.
The architect agent reads relevant docs before designing anything, so it follows established patterns instead of inventing its own. Its process:
Reads project architecture docs to understand established patterns and conventions
Analyzes the existing codebase for relevant precedents
Researches best practices for the specific technology stack
Designs the feature architecture with specific file paths, component responsibilities, and data flow
Breaks the work into ordered implementation phases
Creates sub-issues for each phase with its own acceptance criteria
I review the blueprint if it proposes changes to the general architecture. Personally, I want to understand and own the high-level design, but that's a preference, not a requirement of the system.
The blueprint specifies:
Every file
to create or modify
Component responsibilities
and boundaries
Data flow
from entry points through transformations to outputs
Build sequence
that defines which phases must complete before others can start
Each sub-issue carries its own acceptance criteria, which means the validator at Gate 4 has specific targets to check against. The quality chain is: requirements → architecture → implementation → validation, and each gate feeds the next.
What This Prevents
Architecture drift (agents follow established patterns, not their own ideas)
Integration failures (data flow is designed upfront, not discovered during integration)
Over-engineering (scope is bounded by the blueprint)
Gate 3: Implementation with Built-in Validation
The developer agents (separate for each domain, like backend, frontend etc.) don't just write code and hand it off. They have mandatory validation steps built into their process. Why separate agents? Each one has a focused prompt, isolated context window, and role-specific evaluation criteria. A backend agent doesn't need to know about React patterns, and vice versa.
Incremental Testing
After modifying or creating
each file
, the agent runs only the related test file, not the full suite. This is deliberate: running all tests after every file change slows the agent dramatically, especially as the project grows and integration tests get heavier. By scoping to the affected test file, feedback cycles stay at seconds instead of minutes. The agent must fix failures before moving to the next file. This works well when test boundaries are clear (one service = one test file), and catches issues at the smallest possible scope. The full test suite runs later at Gate 4.
Pre-Completion Validation
Before reporting back, every developer agent must run and pass three checks:
Type-check
: zero errors
Lint
: zero errors
Test suite
: all tests pass + coverage >= 90% for new/modified files (as a minimum guardrail, not a quality metric, since high coverage alone doesn't prove tests are meaningful)
These checks use custom validation scripts that produce compact, structured output: a 5-line summary instead of hundreds of lines of test runner noise. This matters because
verbose tool output slows AI agents down significantly
. When agents can parse results in seconds instead of scrolling through walls of text, the feedback loop stays tight.
What This Prevents
Cascading failures (small scope means bugs are isolated to one subtask)
Test regressions (existing tests must still pass before moving on)
Untested code (90% coverage enforced per file)
Gate 4: Code Validator Agent
After each developer agent completes, a dedicated
code-validator agent
runs independently. This is the quality gate that blocks commits.
The validator:
Reads the issue and acceptance criteria
Inspects recent changes and existing tests
Runs the full test suite for affected packages
Generates and reviews coverage reports
Performs a code review focusing on correctness, edge cases, security, and project conventions
Decides: PASS or FAIL
This review focuses on the current subtask in isolation. The broader feature-level review happens at Gate 5.
Confidence Scoring
The validator rates each potential issue on a 0-100 confidence scale:
Score
Meaning
0
False positive, not a real issue
25
Might be real, might be false positive
50
Real issue, but minor
75
Verified real issue, will impact functionality
100
Confirmed critical issue
Only issues with confidence >= 75 are reported.
The scoring uses structured prompts that require the agent to provide evidence for each finding. No evidence, no report. It's a pragmatic filtering mechanism that dramatically reduces noise and false positives.
The Hard Rule
Commits are blocked until the validator returns PASS.
If it returns FAIL, the developer agent is re-invoked to fix the issues, and the validator runs again. The workflow enforces this automatically, so there's no way to skip it.
```
Developer Agent
  ↓
Validator (FAIL)
  ↓
Developer Agent (fix)
  ↓
Validator (PASS)
  ↓
Commit allowed
```
Enter fullscreen mode
Exit fullscreen mode
What This Prevents
Convention violations (code that works but doesn't follow project patterns)
Coverage regressions (no commit without meeting the threshold)
Blind spots from the writing agent (independent review catches what the author missed)
Gate 5: Multi-Agent Code Review
While Gate 4 validates each subtask in isolation, Gate 5 reviews the
entire feature
across all commits before creating a pull request. A code review skill runs multiple specialized agents in parallel:
Parallel Review Agents
Four agents run simultaneously, each with a different focus:
Architecture Compliance
: Audit changes against architecture documentation, flag violations with exact rule citations
Bug Detection
: Scan the diff for logic errors, null handling issues, and edge cases
Security Review
: Check for vulnerabilities, injection risks, and unsafe patterns in changed code
E2E Test
: Run an end-to-end test that exercises the new feature from the user's perspective
Validation Round
Each flagged issue goes through a separate validation agent that confirms the issue actually exists. This filters out false positives before any findings are reported.
High-Signal Only
The review explicitly
does not flag
:
Code style concerns (linters handle that)
Subjective improvements
Pre-existing issues not introduced in this change
Pedantic nitpicks
Patterns used consistently elsewhere in the codebase
What This Prevents
Architectural violations slipping through
Security issues in new code
Logic bugs that tests don't cover
Gate 6: CI/CD Pipeline
Gates 3-5 all ran on the agent's machine. Gate 6 is the first time code runs in a
completely independent environment
. When the pull request is marked ready for review, CI runs the full pipeline from scratch.
```
Detect Changed Packages
        ↓
  Lint & Type Check
        ↓
  ┌─────┼─────┐
  ↓     ↓     ↓
Pkg A Pkg B Pkg C   (tests in parallel)
  ↓     ↓     ↓
  └─────┼─────┘
        ↓
      Build
        ↓
  Static Scanners
        ↓
  Ready for Review
```
Enter fullscreen mode
Exit fullscreen mode
Smart Change Detection
The CI pipeline detects which packages changed and only runs their tests. If shared types change, all dependent packages are retested automatically because cascading dependencies are tracked. This keeps CI fast on small changes while still catching cross-package breakage.
What the Pipeline Runs
Lint & Type Check
: Static analysis across all changed packages
Per-package tests
: Unit and integration tests run in parallel for each affected package
Build
: Full production build of all changed modules
Static Scanners
: Run static analysis tools to catch potential security issues before merging
Draft PR Strategy
PRs are always created as drafts first. CI skips draft PRs to save CI minutes. When ready for review, the PR is marked as non-draft, which triggers the full pipeline. This means CI resources are only spent on code that's already passed all local gates (Gate 3 + Gate 4).
What This Prevents
Environment-specific failures (clean CI, not the developer's machine)
Cross-package breakage (shared type changes tested across all dependents)
Build failures in production configuration
Gate 7: Human Review and Merge
This is the only manual approval gate in the entire pipeline. After CI passes, I personally review the changes before merging. This is a critical checkpoint that forces me to consciously take ownership of delivered code. I want to understand what changed at a high level so that I'm able to steer future work and make informed decisions about architecture and design patterns.
The review is intentionally lightweight. By this point, the code has already passed five automated gates. I'm not hunting for bugs or style issues. I'm checking that the feature makes sense, the approach aligns with where the project is heading, and nothing looks fundamentally wrong.
What This Prevents
Losing architectural awareness (I stay informed about every change)
Autopilot merging (conscious decision to ship, not rubber-stamping)
Strategic drift (changes that technically work but move the project in the wrong direction)
Gate 8: Deployment Verification
On merge to main, automated release tooling creates a versioned release, and the deploy pipeline runs:
Validates environment variables
before building (catches missing config early)
Builds all changed modules
with production configuration
Deploys only changed components
: backend, frontend, and infrastructure rules are deployed independently based on what actually changed
Verifies all deployments succeeded
: if any component fails, the release is marked as failed with actionable retry instructions
What This Prevents
Deploying with missing or misconfigured environment variables
Deploying unchanged components unnecessarily
Silent partial failures (one component fails but the release looks successful)
The System in Practice
Here's what a typical feature looks like flowing through these gates:
```
1. Define requirements           [~1 hour]
2. Architecture design           [~10 min]
3. Implementation + tests        [~0,5 - 6 hours in total]
4. Validator after each phase    [~3 min each]
5. Code review before PR         [~5 min]
6. CI pipeline                   [~8 min]
7. I review and merge            [~10 min]
8. Deploy on merge               [~5 min]
```
Enter fullscreen mode
Exit fullscreen mode
Regardless of feature size, the validation overhead stays roughly bounded: about 20 minutes of automated checks. The implementation time scales with complexity, but the quality gates are much less variable. That's the point.
When the Pipeline Catches Something
Here's a real example. A developer agent implemented a new feature that added a field to a shared data model. Unit tests passed. Type-check passed. Coverage was above 90%. The agent reported success.
Then the validator ran. It detected that while the new field existed in the TypeScript interface and the backend service, the Firestore converter (responsible for translating between the database and the application) was never updated. Data would be written to the database but silently lost on read. The validator returned FAIL, the developer agent was re-invoked with the specific finding, and it fixed the converter in under a minute.
Without Gate 4, that bug would have shipped. Unit tests didn't catch it because they mocked the database layer. The type system didn't catch it because the converter used a spread operator that silently dropped unknown fields. Only an independent agent reviewing the full change against project conventions found the gap.
That failure became a permanent memory entry. Now every agent touching shared data models gets warned:
"Converter updates require synchronized changes in 4+ locations."
Long-Term Memory: Quality That Improves Itself
Without persistent memory, every session starts from zero. Agents repeat the same mistakes, validators catch the same failures, and I re-explain the same constraints. The quality gates work, but they don't get better.
Long-term memory closes this gap. It forms a feedback loop with the gates: the validator catches a failure, that failure becomes a memory entry, and in the next session the developer agent gets warned
before it writes a single line of code
. The agent avoids the mistake. The validator confirms. Gates catch problems once. Memory prevents them forever.
This compounds. Early in a project, agents make more mistakes and the validator catches them frequently. After 10+ runs, agents start each session already knowing dozens of project-specific traps. Validator failures become rarer. The system gets faster because it spends less time fixing and re-running.
Here are a few real pitfalls that the pipeline caught and encoded:
Zod/TypeScript sync
: Adding interface fields requires updating Zod schemas AND all consumers
Test mock indices
: New LLM-calling nodes shift ALL mock call indices in integration tests
Config wiring
: Adding a parameter signature without reading config is a silent no-op
Converter updates
: New conversation fields require synchronized updates in 4+ locations
These aren't hypothetical. Each one caused a real failure, was caught by the validation pipeline, and became permanent institutional knowledge. Every project accumulates its own version of this list.
The result is a quality system that develops itself. Every feature it validates teaches it how to validate the next one better. No human intervention needed for this loop to run. This is fundamentally different from static tooling that works the same way on day one and day three hundred.
What I've Learned
1. Front-load requirements, not reviews
The biggest quality lever isn't better testing. It's clearer requirements. When I spend an hour defining exactly what a feature should do with specific acceptance criteria, the agents produce correct code on the first try far more often than when I rush through requirements and rely on review to catch problems.
2. Separate writing from validation
Don't ask the same agent to write code and verify it. That's like having students grade their own exams. The coding agent's job is to write the best code it can. The validator is a separate agent with a separate prompt, separate context, and explicit permission to fail the work. It has no incentive to pass. This separation is what makes the gates trustworthy.
3. One subtask at a time
The natural instinct is to implement a full feature and test at the end. That's where quality breaks down. Instead, break the work into small subtasks, implement one, validate it, commit it, then move to the next. Each commit is a known-good checkpoint. When something fails, the blast radius is one subtask, not an entire feature. This pattern is counterintuitive but it's the most practical change another developer could adopt immediately.
4. Enforce the process in the framework, not in prompts
You can't tell an AI agent to "be careful" and expect consistent results. The quality comes from a workflow that runs validation automatically after every subtask, not from instructions asking agents to remember to test. Bake the gates into the framework so they execute by default. When skipping a gate is harder than following it, quality becomes a property of the system rather than a hope.
5. This is an engineering problem, not an AI problem
The question isn't:
Can AI write good code?
It can.
The question is
Does your system prevent bad code from shipping?"
That requires overlapping automated gates, independent validation agents, long-term memory, and a workflow that enforces all of it. No single technique is enough. The system is the product.
Tools: Claude Code, Codex, specialized AI agents per role, skills, long-term memory for persistent learnings, git worktrees, Linear for issue tracking, GitHub Actions for CI/CD.
Create template
Templates let you quickly answer FAQs or store snippets for re-use.
Submit
Preview
Dismiss
Collapse
Expand
nexus-lab-zen
nexus-lab-zen
nexus-lab-zen
Follow
AI agents execute, a human owns decisions. Honest records of what breaks. Trust Review Kit: https://buy.polar.sh/polar_cl_fRSbjzNmega1cJPPfNg7mvrGatBCQUiU8Zqau2pm5mS
Joined
Jun 15, 2026
•
Jun 29
Dropdown menu
Copy link
Hide
Really like the enforced-gates framing — deciding which checks are allowed to stop a release and making them happen every time is the right backbone.
One gate worth adding sits a layer
earlier
than the validator, and it's easy to miss because every check here inspects an artifact: the validator reads the diff, the review reads the changeset, the chrome_devtool MCP pass drives the real UI. All of them assume the dev agent's
report of what it did
is true. The failure mode they can't catch is when the agent narrates a tool action that never physically happened — "committed the changes", "created src/foo.ts", "ran the suite, all green" — typed into the turn as prose with no underlying tool call. There's then no artifact for the validator or the E2E pass to fail on, so the orchestration moves on because it trusted the narration.
Since you're already on Claude Code with CLAUDE.md + .claude/agents, the cheap place to put this is a
Stop hook
(turn-end): before the turn closes, diff the agent's claims against that turn's actual tool_use / tool_result blocks — did "committed" correspond to a real git result with a sha, does the file it said it created exist on disk, did the test command actually execute or was "tests pass" only in the text. If a claimed action has no matching tool return, you hard-fail the turn instead of handing a phantom changeset to gate 4.
We added this after one of our own agents fabricated a tool-output block and a false "empty file" claim inside a turn — the downstream checks had nothing to bite on, because the artifact it described didn't exist. A turn-end check that compares claims to the turn's real tool returns is the missing layer that helps close that gap before the artifact gates even start. Your post-artifact gates and this pre-artifact self-report check are complementary; neither replaces the other.
Collapse
Expand
Teemu Piirainen
Teemu Piirainen
Teemu Piirainen
Follow
AI Engineer and senior full-stack & mobile developer. I turn complex customer problems into production-grade software, from discovery to deployment. 26+ years in software, 22 in entrepreneurship.
Email
teemu.piirainen@awave.fi
Location
Espoo, Finland
Education
Aalto University, Finland
Work
AI Engineer | Senior Full-Stack & Mobile Developer | Consultant
Joined
Jul 10, 2025
•
Jun 30
Dropdown menu
Copy link
Hide
This is a really good point.
I think you’re right that this is a different layer from the artifact gates I described. My current gates mostly validate things that already exist.
What you’re describing is more like a pre-artifact claim-vs-evidence gate: before trusting the agent’s summary, verify that the claimed action actually has a matching tool result. That distinction is useful. “The code passes validation” and “the agent really performed the action it claims it performed” are not the same thing.
I haven’t implemented this Stop hook check yet, but I like the idea a lot. I have
`SessionStart`
and
`PreToolUse`
to inject ENV variables into Claude sessions so it's easy to add also Stop hook checks. This also fits the same principle as the rest of the pipeline: don’t trust narration, trust evidence.
Collapse
Expand
nexus-lab-zen
nexus-lab-zen
nexus-lab-zen
Follow
AI agents execute, a human owns decisions. Honest records of what breaks. Trust Review Kit: https://buy.polar.sh/polar_cl_fRSbjzNmega1cJPPfNg7mvrGatBCQUiU8Zqau2pm5mS
Joined
Jun 15, 2026
•
Jun 30
Dropdown menu
Copy link
Hide
Exactly — "don't trust narration, trust evidence" is the whole thing, and since you've already got
`SessionStart`
+
`PreToolUse`
wired, the Stop hook is a cheap third leg. Two notes from running ours, in case they save you a step:
Compare against the turn's
structured
`tool_result`
entries, never anything in the assistant's prose. The failure that made us build this was an agent typing a fabricated
`<result>`
block — a fake tool return — straight into its message, alongside a false "empty file" claim. If the hook scans the assistant text for evidence, that text is exactly where a confabulating turn plants fake evidence. So it has to be assistant-claims (prose) vs the harness's real
`tool_use`
/
`tool_result`
records — never prose-vs-prose.
Map each claim to the return that would have to exist: "committed" → a git result carrying a sha; "created src/foo.ts" → a
`Write`
/
`Edit`
on that path (we re-stat the file after, too); "tests pass" → a runner result with a real exit code, not the word "pass" in text. No matching return → hard-fail the turn.
Honest caveat: it's a tripwire, not a proof. Pattern-based claim extraction has false negatives — a paraphrased claim slips through — and the same agent re-confabulated on a different tool even after we shipped the detector. So it lowers the rate, it doesn't close the hole, which is exactly why your post-artifact gates and this pre-artifact check stay complementary rather than one replacing the other.
Would enjoy seeing how it slots in if you wire it up.
Teemu Piirainen
Teemu Piirainen
Teemu Piirainen
Follow
AI Engineer and senior full-stack & mobile developer. I turn complex customer problems into production-grade software, from discovery to deployment. 26+ years in software, 22 in entrepreneurship.
Email
teemu.piirainen@awave.fi
Location
Espoo, Finland
Education
Aalto University, Finland
Work
AI Engineer | Senior Full-Stack & Mobile Developer | Consultant
Joined
Jul 10, 2025
•
Jun 30
Dropdown menu
Copy link
Hide
Thanks, this is really useful detail. This goes straight to my backlog to test properly.
nexus-lab-zen
nexus-lab-zen
nexus-lab-zen
Follow
AI agents execute, a human owns decisions. Honest records of what breaks. Trust Review Kit: https://buy.polar.sh/polar_cl_fRSbjzNmega1cJPPfNg7mvrGatBCQUiU8Zqau2pm5mS
Joined
Jun 15, 2026
•
Jul 8
Dropdown menu
Copy link
Hide
When it hits the backlog, the one mapping that bit us hardest:
`committed`
needs the SHA to
resolve
, not just be present. We caught a turn that emitted a clean-looking
`a3f92c1`
with no matching Bash result behind it — the confab faked the
shape
of the evidence, so a check that just greps for a 7-hex string would've waved it through.
Two cases worth seeding the test with:
Induce it — a turn that claims "committed a3f92c1" or "created X" with no matching tool_result in that turn. The gate should hard-fail. If it doesn't, your claim→evidence map has a hole.
The honest gap — a claim backed by a
real
tool_result you've hand-edited to be wrong. The tripwire will pass it, and that's expected: it catches unbacked claims, not execution-vs-correctness. Seeing it pass keeps you from over-trusting the gate.
Would genuinely like to hear what slips through when you run it.
Teemu Piirainen
Teemu Piirainen
Teemu Piirainen
Follow
AI Engineer and senior full-stack & mobile developer. I turn complex customer problems into production-grade software, from discovery to deployment. 26+ years in software, 22 in entrepreneurship.
Email
teemu.piirainen@awave.fi
Location
Espoo, Finland
Education
Aalto University, Finland
Work
AI Engineer | Senior Full-Stack & Mobile Developer | Consultant
Joined
Jul 10, 2025
•
Aug 12
Dropdown menu
Copy link
Hide
I’ve started wiring this in gradually, but in two layers.
The first layer is for deterministic validation steps. When the agent runs tests or validation scripts, the script writes a timestamped output artifact into the project folder. The Stop hook then checks that a fresh artifact exists and that it contains the required result. That has already caught a few cases where something was left incomplete.
The next layer is the one you describe more directly: mapping agent claims to real tool_result records. I think that becomes especially useful in the parts of my validation flow where the agent reads code and reasons about what changed, instead of only running deterministic scripts.
I wrote a follow-up article from a slightly different angle here, in case it’s interesting:
dev.to/teppana88/if-ai-writes-and-...
Collapse
Expand
Marcus Kim
Marcus Kim
Marcus Kim
Follow
Freelance app developer with an MS in software engineering. I help beginners build real apps with AI, practical workflows, and fewer wasted hours.
Location
Los Angeles, CA
Joined
Jun 15, 2026
•
Jun 16
Dropdown menu
Copy link
Hide
The enforced-gates framing is the useful part here. Once AI can produce a lot of plausible code, the real protection is deciding which checks are allowed to stop a release and making them happen every time. I’ve found that one manual end-to-end pass on the core user workflow catches a surprising amount of what unit tests and confident generated code both miss.
Collapse
Expand
Teemu Piirainen
Teemu Piirainen
Teemu Piirainen
Follow
AI Engineer and senior full-stack & mobile developer. I turn complex customer problems into production-grade software, from discovery to deployment. 26+ years in software, 22 in entrepreneurship.
Email
teemu.piirainen@awave.fi
Location
Espoo, Finland
Education
Aalto University, Finland
Work
AI Engineer | Senior Full-Stack & Mobile Developer | Consultant
Joined
Jul 10, 2025
•
Jun 29
Dropdown menu
Copy link
Hide
Good point, the final end-to-end pass matters.
One thing I’ve started doing is automating part of that with Claude using the
`chrome_devtool`
MCP. For web services, I can give Claude the core user flows and let it walk through them in the real UI as a smoke test.
But I still keep the human pass for the product-level question: does this actually make sense from the user’s perspective?
So for me it is not a replacement for E2E review, but a useful validation layer before the final human check.
Collapse
Expand
Marcus Kim
Marcus Kim
Marcus Kim
Follow
Freelance app developer with an MS in software engineering. I help beginners build real apps with AI, practical workflows, and fewer wasted hours.
Location
Los Angeles, CA
Joined
Jun 15, 2026
•
Jun 30
Dropdown menu
Copy link
Hide
I agree. Checking for sense is the main thing. Also, manual testing also allows you to gauge experience, like whether a user journey is frustrating, like no machine could ever tell you. I’ve felt like rage quitting a couple of apps, something an AI is far too polite to do.
Collapse
Expand
Chris
Chris
Chris
Follow
Joined
May 29, 2026
•
May 29
Dropdown menu
Copy link
Hide
Interesting article! Thanks for sharing. Curious how your agents are set up exactly, would you mind sharing? I would like to try to adopt this pattern. Also curious if this works for a team or only individual projects. Would the cross session memory be shared among the whole team or local to each dev?
Collapse
Expand
Teemu Piirainen
Teemu Piirainen
Teemu Piirainen
Follow
AI Engineer and senior full-stack & mobile developer. I turn complex customer problems into production-grade software, from discovery to deployment. 26+ years in software, 22 in entrepreneurship.
Email
teemu.piirainen@awave.fi
Location
Espoo, Finland
Education
Aalto University, Finland
Work
AI Engineer | Senior Full-Stack & Mobile Developer | Consultant
Joined
Jul 10, 2025
•
Jun 29
Dropdown menu
Copy link
Hide
Thanks Chris (and sorry for my late reply). The setup is mostly a combination of three things:
`CLAUDE.md`
defines the SDLC flow the agents must follow.
`.claude/agents/`
contains the role-specific agents, like developer agents and
`code-validator`
.
`.claude/skills/code-review/SKILL.md`
defines my custom multi-agent review step.
Small naming note: this is my own
`code-review`
skill, not Claude’s built-in
`/code-review`
command.
The important part is that
`CLAUDE.md`
makes the process enforceable. After development, the
`code-validator`
must return PASS. Only then the workflow invokes my
`code-review`
skill on the full changeset. If that review finds real issues, the relevant dev agent fixes them,
`code-validator`
runs again, and the fix is committed.
Inside the review skill I currently run four parallel review agents:
two Sonnet agents checking architecture-doc compliance
one Opus agent looking for obvious bugs in the diff
one Opus agent checking security and logic issues
The biggest lesson for me was to make the review very strict about what it is allowed to report. It should flag compile errors, clear logic bugs, and unambiguous architecture violations with exact rule citations. It should not report style opinions, vague “could be better” suggestions, pre-existing issues, or things linters already catch.
For adoption, I would not start with the full version. I would start with the smallest useful loop:
Developer agent → code-validator → commit only after PASS.
Then add the full multi-agent review before PR creation.
For teams, I think the pattern works even better, but the shared knowledge should live in versioned project files: architecture docs,
`CLAUDE.md`
, agent / skills definitions, CI scripts, and validation rules. Personal/local memory is useful for one developer, but team-level memory should become repo-level knowledge as soon as possible. And for teams I would recommend to check Claude Marketplace GitHub repo setup, it could solve many maintainability issues with agents / skills.
Collapse
Expand
Ilya Ploskovitov
Ilya Ploskovitov
Ilya Ploskovitov
Follow
Sr. QA & Automation Engineer | 8+ years | Go, Python, WASM | Passionate about sub-millisecond performance and secure infrastructure.
Joined
Oct 26, 2025
•
Jul 22
Dropdown menu
Copy link
Hide
your 8-gate pipeline is wild lol, way more rigor than most teams even bother with. does the multi-agent review step ever actually catch stuff the tests miss, or is it more insurance at this point?
Collapse
Expand
Teemu Piirainen
Teemu Piirainen
Teemu Piirainen
Follow
AI Engineer and senior full-stack & mobile developer. I turn complex customer problems into production-grade software, from discovery to deployment. 26+ years in software, 22 in entrepreneurship.
Email
teemu.piirainen@awave.fi
Location
Espoo, Finland
Education
Aalto University, Finland
Work
AI Engineer | Senior Full-Stack & Mobile Developer | Consultant
Joined
Jul 10, 2025
•
Jul 26
Dropdown menu
Copy link
Hide
Both at first. Six months in, it is genuinely producing value.
The reason is that the two layers answer different questions. Tests tell me the code does what the code was written to do. The review agents check the implementation against acceptance criteria that were written before anyone implemented anything. That gap is where they find things tests structurally cannot.
Real case from a "lock navigation while the pipeline is running" task:
LINT=PASS
TESTS=6104 passed, 0 failed
COVERAGE=94.6%
RESULT=FAIL
The route guard depended on router context the production app never supplied. The unit test fabricated that context, so AI agent verified a callback under conditions that did not exist in the real app. The validator agent proved it by deleting the guard and rerunning the suite. All 6,104 tests still passed.
Green suite. Feature that never worked.
It also changed what I do on the PR. I do not read the diff line by line anymore. I read the artifacts the run produced: which acceptance criterion was verified, with what evidence, what got escalated to me. I approve on that.
I am writing a follow-up article on exactly this mechanism, what stops AI validation from becoming an expensive rubber stamp. Happy to ping you here when it is out.
Collapse
Expand
Teemu Piirainen
Teemu Piirainen
Teemu Piirainen
Follow
AI Engineer and senior full-stack & mobile developer. I turn complex customer problems into production-grade software, from discovery to deployment. 26+ years in software, 22 in entrepreneurship.
Email
teemu.piirainen@awave.fi
Location
Espoo, Finland
Education
Aalto University, Finland
Work
AI Engineer | Senior Full-Stack & Mobile Developer | Consultant
Joined
Jul 10, 2025
•
Aug 12
Dropdown menu
Copy link
Hide
Hi, here’s the article I mentioned about code validation.
dev.to/teppana88/if-ai-writes-and-...
It would be great to hear your perspective.
View full discussion (14 comments)
Are you sure you want to hide this comment? It will become hidden in your post, but will still be visible via the comment's
permalink
.
Hide child comments as well
Confirm
For further actions, you may consider blocking this person and/or
reporting abuse
We're a place where coders share, stay up-to-date and grow their careers.
Log in
Create account
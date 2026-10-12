---
title: How AI Coding Agents Use ADRs (Architecture Decision Records) — Mneme HQ
id: how-ai-coding-agents-use-adrs-architecture-decision-records-mneme-hq
tags:
- ai-software-factory-architecture-58e4cc
- adr-context
created: '2026-10-12T08:27:38.775759Z'
source: https://mnemehq.com/insights/how-ai-coding-agents-use-adrs/
source_domain: mnemehq.com
fetched_at: '2026-10-12T08:27:38.773359Z'
fetch_provider: builtin
status: draft
type: note
tier: unknown
content_type: unknown
deprecated: false
---

How AI Coding Agents Use ADRs (Architecture Decision Records) — Mneme HQ
Skip to content
What an ADR Is, Briefly
An Architecture Decision Record is a short, structured note about a single architectural decision. The format was popularized by Michael Nygard in
Documenting Architecture Decisions
, and it is deliberately minimal: a title, the
context
(the forces at play), the
decision
itself stated in plain active voice, and the
consequences
that follow from it. A status field tracks whether the decision is proposed, accepted, deprecated, or superseded.
The point of an ADR is to preserve the reasoning that would otherwise evaporate. Six months after a decision, the code shows
what
was built but not
why
, and the person who held the why in their head has moved teams. An ADR is the answer to “why is it done this way?” written down at the moment the choice was made. Examples are familiar: use PostgreSQL, not a document store; all async work goes through the existing worker service; services never read each other’s databases directly.
Why ADRs Matter More in the Agent Era
ADRs used to be a nicety. In a team of humans, the important decisions lived partly in the documents and partly in the shared memory of the people who made them. A new engineer absorbed the conventions by reading the code, asking questions, and getting corrected in review. That transmission was slow, but it worked because the pace of change matched the pace of a human reading and understanding.
AI coding agents break that assumption. An agent can touch twenty files in a minute, open a pull request, and move to the next task before anyone reads a line. It has no shared memory of the last standup and no scar tissue from the outage that produced a given rule. The decisions humans used to carry in their heads now have to be written down — and, more importantly, written down in a form something can act on. When generation is this fast, the only conventions that survive are the ones expressed explicitly. This is exactly why
context alone does not prevent architectural drift
: an agent that produces plausible, working code at speed will produce plausible, working,
inconsistent
code just as fast unless something holds it to the recorded decisions.
The Default Failure Mode
Here is how ADRs usually work in an AI-assisted codebase, and why it is not enough. The ADRs live as Markdown files in
`docs/adr/`
. The agent may or may not have them in context, depending on how the prompt was assembled and how much of the repository fit in the window. Suppose it does read the relevant ADR. Nothing then checks that the code it writes actually obeys the decision. The ADR is advice the model may weigh, discard, or quietly misremember, alongside everything else competing for its attention.
The gap is the one teams keep rediscovering:
loading an ADR into context is not the same as enforcing it.
A document in the prompt shifts the odds. It does not close the door. The model can read “all async work goes through the worker service” and still reach for a new queue library because that pattern was more common in its training data, or because the local task felt easier that way. An ADR that only informs is a suggestion. An ADR that also verifies is a guardrail. Most teams have the first and assume it behaves like the second.
An ADR nobody checks is a comment. An ADR a machine checks is a constraint.
The difference is not how well the document is written — it is whether a deterministic check reads the decision and can stop a change that breaks it.
The Three Ways Agents Interact With ADRs
In practice, an ADR sits at one of three rungs on a ladder, and it is worth naming which rung your setup is on, because the jumps between them are where the value is.
Ignored.
The ADR is not in the agent’s context at all. It exists in the repository, but the prompt that produced the change never included it. The decision has zero influence on the generated code. This is the common case for large repositories where only a slice of files fits in the window.
In-context but advisory.
The ADR is retrieved and placed in the prompt, and the agent is told to follow it. Sometimes it does. This is a real improvement over ignored, and it is where most “rules file” and memory setups land. But it is probabilistic: compliance depends on the model weighing the instruction correctly against everything else, and it degrades as the context grows. We have written before on why
rule files and retrieval memory
raise the odds without closing the gap.
Enforced.
A deterministic check reads the relevant ADR and blocks a change that violates it, before the change lands. The agent is not trusted to comply; the compliance is verified. This is the rung that turns a decision into a guarantee, and it is what
deterministic enforcement
means in practice.
The move from rung two to rung three is the entire game. Advisory ADRs get better as models get better, but they never reach certainty, because a probabilistic system cannot produce a hard guarantee. An enforced ADR gives the same verdict on the same change every time, regardless of which model ran or how full the context was. That property —
governance applied before generation is accepted
rather than hoped for after — is what separates a documented decision from an enforced one.
Making ADRs Executable
Turning an ADR into something a machine enforces has three moving parts, and none of them require the ADR to stop being human-readable.
Retrieve the relevant ADRs.
For a given change, pull the decisions that actually govern it — the ones touching the files, modules, or concerns the edit affects. Not the whole catalogue; the ones that apply.
Check the proposed edit against them.
Compare what the agent wants to write to what the retrieved decisions require. This is a deterministic evaluation, not a second model forming an opinion.
Reject with the specific ADR named.
If the edit violates a decision, block it and say which one. “This change violates ADR-014” is actionable in a way that “this looks wrong” is not, and it lets the agent retry compliantly instead of guessing.
Here’s a hypothetical to make it concrete.
ADR-014
in a repository says all background work must use the existing worker service. An agent, asked to add an email-sending feature, proposes pulling in Redis and BullMQ to run the job on a new queue — a perfectly reasonable choice in the abstract, and probably a common pattern in its training data. At edit time, the check retrieves ADR-014, sees that the proposed change introduces a second async mechanism the decision forbids, and blocks the write with a message naming ADR-014 and its constraint. The agent does not get to add the dependency. It gets told exactly which recorded decision it broke, and it routes the work through the worker service instead.
Nothing about ADR-014 changed. It is the same short document a human could read. What changed is that the decision now carries
executable architectural intent
: the constraint is expressed in a form a check can evaluate, so the ADR does more than sit in a folder. When the block fires, the reason is traceable back to a specific decision, which is the property
enforcement provenance
describes — every rejection points at the ADR that justified it.
To do this with one of your own ADRs, follow
Turn an ADR into an enforceable decision
. It takes a single ADR from frontmatter to a recorded FAIL, with output from a real run.
First-party validation.
The worker-service scenario above is illustrative. What Mneme’s frozen enforcement benchmark actually measures is narrower and public: across a fixed set of governed scenarios, whether the output correctly flags a proposed change that violates a recorded decision. One of those seven scenarios has an LLM recommending a Postgres/SQLAlchemy stack against a JSON-only storage constraint. The benchmark caught 7/7 violations.
This validates the deterministic enforcement path under fixed benchmark scenarios; it does not establish effectiveness across production codebases or against adversarial paraphrasing. The same report’s retrieval layer, measured separately from enforcement, scores mean precision@3 of 0.33 — publishing that number alongside the enforcement result rather than only the favorable one.
Method and artifacts →
ADRs in CI and at Edit Time
There are two moments where an ADR can be enforced, and they are complementary rather than competing.
In CI
, the check runs against a diff. A pull request arrives, the pipeline retrieves the ADRs the diff touches, evaluates the changes, and fails the build if any decision is violated. This is batch review: it catches everything before merge, and it is the natural home for enforcement in a team that already gates on CI. The cost is timing — the agent has already produced the whole change, and the feedback arrives after the fact, so a violation means a full rework cycle.
At edit time
, the check runs the instant the agent tries to write. Mneme’s Claude Code integration does this through a PreToolUse hook: it intercepts the Edit, Write, or MultiEdit before it touches disk, evaluates the proposed change against the relevant ADRs, and can block a violating edit outright. The agent gets the verdict mid-task, while it still has the full context of what it was doing, and corrects course immediately. There is no rework cycle because the bad change never landed.
Two how-to guides set up each checkpoint:
stop an AI coding agent from crossing an architectural boundary
for edit time, and
fail a pull request that breaks an ADR
for CI.
Most teams want both. Edit-time blocking keeps the agent honest as it works; CI is the backstop that guarantees nothing violating an ADR reaches the main branch regardless of how the code was produced. This layering is the substance of
building governance layers for AI coding assistants
, and it is why enforcement is not a single tool but a set of checkpoints. It is also worth being precise about what these checks verify: an ADR check confirms the code honors an architectural decision, which is a different guarantee from a test confirming the code runs, a distinction we draw out in
runtime verification is not architectural verification
.
From Documentation to Enforcement
The shift is small to describe and large in effect. An ADR is a good document either way. But a document that only records a decision depends entirely on someone — or some model — choosing to honor it. A document that a machine checks removes the choice: the decision holds because a check makes it hold. Set the two side by side and the difference is stark.
ADR as document
ADR as executable constraint
Records the decision and its rationale
Records the decision and enforces it
May or may not be in the agent’s context
Retrieved for every change it governs
Advisory: the agent can weigh or ignore it
Deterministic: a violating change is blocked
Verified by a human in review, if at all
Verified by a machine before the change lands
Depends on someone choosing to comply
Holds regardless of which model ran
ADRs were always the right idea. They capture the decisions that give a codebase its shape, in a form small enough that busy engineers actually write them. What the agent era adds is a reason to close the loop: with code being generated faster than anyone can review it, the decisions have to be enforced, not merely recorded. Enforcing engineering standards this way is how teams keep architecture intact as they
enforce standards across AI-assisted teams
without paying an ever-growing
verification tax
on every generated change. The ADR you already wrote is most of the work. Making a machine check it is the rest. If you want to see one of your own ADRs enforced against a real change,
start a pilot
.
Frequently asked questions
What is an ADR?
+
An ADR, or Architecture Decision Record, is a short structured document that captures one architectural decision: its context (the forces that shaped it), the decision itself stated plainly, and the consequences that follow. The format was popularized by Michael Nygard in 2011. Its purpose is to preserve the reasoning behind a choice so that, months later, the codebase carries not just what was built but why.
How do AI coding agents follow ADRs?
+
In three ways, on a ladder. At the bottom, the ADR is ignored because it was never placed in the agent’s context. In the middle, it is in context but advisory: the agent is told to follow it and sometimes does, which raises the odds without guaranteeing compliance. At the top, it is enforced: a deterministic check retrieves the relevant ADR and blocks a change that violates it before the change lands. Only the top rung turns a decision into a guarantee.
Why isn’t putting an ADR in the prompt enough?
+
Because loading an ADR into context is not the same as enforcing it. A document in the prompt shifts the model’s odds of complying, but it does not close the door — the model can read a decision and still write code that breaks it, especially as the context grows and the instruction competes with everything else. Enforcement requires a deterministic check that verifies the code against the decision, not a model that is merely reminded of it.
How does an ADR check work at edit time versus in CI?
+
In CI, the check runs against a pull request diff: it retrieves the ADRs the diff touches and fails the build if any is violated, catching everything before merge but only after the whole change is written. At edit time, the check runs the moment the agent tries to write — Mneme’s Claude Code integration uses a PreToolUse hook to intercept an Edit or Write, evaluate it against the relevant ADRs, and block a violating change before it lands. Most teams use both: edit-time blocking to keep the agent honest, CI as the backstop.
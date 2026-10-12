---
title: 'Architecture Decision Records for AI Coding Agents: Where the Why Lives'
id: architecture-decision-records-for-ai-coding-agents-where-the-why-lives
tags:
- ai-software-factory-architecture-58e4cc
- adrs
- context-ingestion
- skill-sequences
created: '2026-10-12T08:28:42.839179Z'
updated: '2026-10-12T08:30:42.590195Z'
source: https://www.braingrid.ai/blog/architecture-decision-records-for-ai-coding-agents
source_domain: www.braingrid.ai
fetched_at: '2026-10-12T08:28:42.836688Z'
fetch_provider: builtin
status: draft
type: note
tier: unknown
content_type: unknown
deprecated: false
summary: 'BrainGrid blog (Aug 2026) argues Architecture Decision Records (ADRs) are
  the load-bearing artifact for stateless AI coding agents because git history preserves
  ''what'' but never ''why'' or rejected alternatives. Defines the canonical Nygard
  2011 five-field ADR format (Title, Status, Context, Decision, Consequences) and
  stresses immutability -- a changed decision gets a new superseding ADR rather than
  an edit. Core argument: agent autonomy increases the volume of undocumented micro-decisions
  (state library choice, caching location, API shape) per session, and because models
  are stateless, the next agent session (or a different agent) will silently ''fix''
  and break a decision it has no record of -- illustrated with an optimistic-UI-updates
  example where a second agent re-introduces a 600ms latency bug the first agent had
  deliberately traded away. Distinguishes ADRs (point-in-time decision log, looks
  backward) from CLAUDE.md/AGENTS.md convention files (standing rules, loaded every
  session) and from acceptance-criteria requirement docs (forward-looking definition
  of done) -- argues a repo needs all three artifact types for durable agent context.
  Recommends storing ADRs under docs/decisions/ in-repo, writing only for genuinely
  contested architectural decisions (reversibility/blast-radius test), and instructing
  the agent via CLAUDE.md to read that folder before architectural changes and write
  new records for consequential ones.'
---

Architecture Decision Records for AI Coding Agents: Where the Why Lives
How-tos
Architecture Decision Records for AI Coding Agents: Where the Why Lives
An architecture decision record captures why you chose an approach. For AI coding agents that forget between sessions, the ADR is the one artifact that survives.
BrainGrid Team
August 4, 2026
11 min read
Your git history remembers every line your agent wrote. It remembers nothing about why.
Fork a branch a week later and the code is all there, exactly as you left it. What is gone is the argument. The option you rejected, the reason you went one way instead of the other, the constraint that made an obvious choice wrong: none of that is on disk. A builder on
r/ClaudeCode
described the exact moment this bites, resuming a session and staring at their own conclusion with no idea how they got there:
the reasoning is the part nothing stores. that only exists at the moment you branch.
That line names a gap that predates AI by decades, and has a decades-old fix. It is called an architecture decision record. What changed is that the fix stopped being optional. When a stateless agent is doing most of the typing, the reasoning behind your decisions is the one thing it cannot reconstruct, and the one thing it will silently overwrite if you never wrote it down.
#
What an Architecture Decision Record Actually Is
An architecture decision record, or ADR, is a short document that captures one meaningful decision: the context that forced it, the options you weighed, the choice you made, and the consequences you accepted. Michael Nygard proposed the format in 2011, and
Martin Fowler
describes it as a document that captures and explains a single decision relevant to a product. The convention that matters most: an ADR is immutable. You never edit an accepted record. When a decision changes, you write a new ADR that supersedes the old one, so the trail of why-we-changed-our-mind stays intact.
A minimal ADR is five fields. Title, so you can find it. Status, one of proposed, accepted, or superseded. Context, the forces and constraints in play. Decision, the option you chose. Consequences, the trade-offs you took on, including the options you left behind.
Here is the part the enterprise-architecture write-ups underplay, and the part that matters for anyone building with an agent. The value of an ADR was never the decision. Git already records the decision, in the shape of the code that exists. The value is the
rejected
alternative and the reason. Microsoft's own guidance says the record should document alternatives that you ruled out, not just the winner. That is the expensive knowledge. That is what nobody can recover by reading the diff.
#
Why This Went From Nice-to-Have to Load-Bearing
For twenty years, ADRs were a discipline a senior engineer imposed on a team so that the next engineer would not re-litigate a settled question. Useful, easy to skip. The person who made the decision was usually still around to explain it.
Coding agents broke that assumption in two ways.
First, the volume of decisions exploded. An agent running a loop makes dozens of small architectural calls in a single session: which state library, how to shape an API response, whether to cache here or there. Most never surface as a conversation you would remember. They just show up in the code. Second, the agent that made those calls remembers none of them tomorrow. Models are stateless. Every session starts from zero, and everything that scrolled out of the context window is gone. The decision survives as code; the reasoning evaporates.
Now stack a second agent, or the same agent a week later, on top of that code. It reads the result, has no idea a decision was ever made, and cheerfully changes it. This is the mechanism behind the complaint every builder eventually voices: the agent keeps breaking things that already worked. It is not being careless. It is working from a blank slate against a codebase full of invisible, unexplained choices. We wrote about the drift version of this in
why your AI agent keeps breaking things that worked
. The decision record is the upstream cause: without it, every choice is a suggestion the next agent is free to overrule.
This is why the fix gets more valuable as the models get better, not less. A more capable agent reads more, writes more, and decides more on its own. More autonomy means more decisions nobody wrote down. The faster your agent moves, the faster it accumulates undocumented reasoning it will later contradict.
#
The Diff Shows What. The ADR Shows Why.
Watch the difference on a single choice. Say your agent picks optimistic UI updates for a comments feature.
Without a record, six days later another agent sees latency complaints in an issue, notices the optimistic update, and "fixes" it by making the mutation await the server. It looks like a reasonable change. It quietly reintroduces the exact lag you designed around.
With a record, the same agent reads the ADR first:
Title:
Optimistic updates for comment posting
Status:
Accepted
Context:
Comment round-trip averages 600ms on mobile. Users perceived the feed as broken.
Decision:
Render the comment immediately, reconcile on server response, roll back visibly on failure.
Consequences:
Rare flash of a comment that fails to post. Accepted over the alternative of a 600ms freeze on every post. Rejected: server-await (too slow), spinner-on-button (still feels broken).
Now the second agent knows the latency was the point, sees that server-await was already considered and rejected, and leaves it alone. Same code. Completely different outcome, because the reasoning traveled with it.
That is the whole job of an ADR. The diff is a perfect record of
what
changed and a useless record of
why
. The ADR carries the why forward to whoever, or whatever, touches the code next.
#
Where This Fits, and Where It Falls Short
An ADR is one member of a small family of durable-context files, and it is worth being precise about the division of labor, because builders on the same r/ClaudeCode thread were hand-rolling all of them: a codemap for structure, a decisions file for choices, a frictions file for known sharp edges. This is
context engineering
in its most practical form, deciding what information survives outside the model's window so a stateless agent can pick the work back up.
A CLAUDE.md or
AGENTS.md
file carries your conventions and commands, the ambient how-we-build context loaded every session. That is a different job from an ADR. Conventions are standing rules; an ADR is a point-in-time record of one choice and its rationale. The state-file version of this, the durable memory an agent reads every morning, we covered in
the state file pattern
. You want all of it in the repo, in version control, next to the code, so the agent reads it the same way it reads everything else.
Here is the honest limitation, and it is the one that matters. An ADR is a record of a decision already made. It documents the past beautifully and says nothing about whether the thing you are building next is correct. You can keep an immaculate decision log and still point your agent at a feature that was never clearly defined, and it will build the wrong thing with a full paper trail. The record tells the next agent why you chose optimistic updates. It does not tell it what "the comment feature is done" means.
That forward-looking definition is a different artifact, and it is where most agent failures actually originate. An ADR captures why you decided; a requirement with
acceptance criteria an agent can verify
captures what the agent must build and how you will know it succeeded. One looks back, one looks forward. You need both, and the second is the one a fresh agent checks its work against.
This is the gap
BrainGrid
is built to close. You describe what you want to build, and the Planning Agent turns it into a requirement with explicit acceptance criteria, the checkable definition of done that an ADR was never meant to supply. The Builder Agent then builds against that requirement, in a managed sandbox with a live preview or in your own GitHub repo through your coding agent over MCP, and a feature is not finished until every criterion is verified with evidence. The requirement and its criteria become the same kind of durable, in-repo record an ADR is, except aimed at the work in front of you instead of the work behind you. The decision record explains the past. The acceptance criteria pin down the present. Together they give a stateless agent something to read that is truer than its own guess.
#
What To Do This Week
If you are building with an agent right now, start narrow. Do not try to document everything; you will burn out and the log will rot, which is worse than no log. Write an ADR only when a decision was genuinely contested, when the obvious choice was wrong for a non-obvious reason, or when you can already imagine a future agent undoing it. Five fields, one screen, committed to the repo.
Then point your agent at the folder. Tell it, in your CLAUDE.md, to read
`docs/decisions/`
before making architectural changes and to write a new record when it makes a consequential one. The agent that keeps a decision log is the one that stops relitigating your settled questions every Monday.
The code was never the expensive part. The reasoning behind it is, and it is the one thing your tools throw away by default. Write down the why, and the next agent inherits your judgment instead of guessing at it.
#
FAQ
#
How do you write an architecture decision record?
Keep it to five fields on a single page. Title (a short name for the decision), Status (proposed, accepted, or superseded), Context (the forces and constraints that made a decision necessary), Decision (the option you chose), and Consequences (the trade-offs you accepted, including the alternatives you rejected and why). Write it in Markdown, store it in your repo under a folder like
`docs/decisions/`
, and treat accepted records as immutable: when a decision changes, add a new record that supersedes the old one rather than editing history.
#
What is the architecture decision record format?
The most common format, from Michael Nygard's original proposal, is a short Markdown file with Title, Status, Context, Decision, and Consequences. Variants exist: some teams add Date, Drivers, or an explicit Options section listing pros and cons. The exact fields matter less than the two non-negotiables: capture the rejected alternatives and the reasoning, and keep each record to a single decision. A record that tries to document five decisions at once is a design doc, not an ADR.
#
What is the difference between an ADR and an RFC?
An RFC (request for comments) comes before a decision: it proposes a change and invites feedback while the question is still open. An ADR comes after: it records the decision that was made, its rationale, and its consequences. The natural sequence on a significant change is RFC first to gather input, ADR second to memorialize the outcome. For solo builders and small teams working with agents, you often skip the RFC and go straight to a lightweight ADR, because the "comments" step is a conversation with yourself and your agent, not a committee.
#
What is an architectural decision?
An architectural decision is a choice about the structure of a system that is expensive or disruptive to reverse later: which state management approach, how services communicate, where data is cached, how authentication is enforced. It is distinct from an ordinary implementation choice like a variable name. The test is reversibility and blast radius. If undoing the choice later would ripple across the codebase or reintroduce a problem you deliberately solved, it is architectural, and it is worth an ADR.
#
What makes a good ADR?
A good ADR is short, focused on one decision, and honest about what it rejected. The single most common failure is recording only the winning option, which makes the document a restatement of the code rather than an explanation of it. Capture the alternatives you ruled out and the reason each lost, because that is the knowledge nobody can recover from the diff. Keep it immutable, keep it in the repo next to the code, and write one only when the decision was actually contested. A pile of trivial ADRs rots as fast as no ADRs at all.
BrainGrid
turns your idea into a requirement with acceptance criteria your coding agent builds against and is verified by, so the reasoning behind your product survives every session, not just the code. Try it at
braingrid.ai
.
About the Author
The BrainGrid team building tools to help developers ship better software with AI.
Want to discuss AI coding workflows or share your experiences? Find me on
X
or connect on
LinkedIn
.
Keep Reading
How-tos
Agent Evals for Builders: Your Acceptance Criteria Are the Rubric
Agent evals sound like ML infrastructure. For builders shipping features, an eval is just a rubric the agent's output is checked against. Here's the version you actually need.
Oct 7, 2026
10 min read
How-tos
What Counts as Done? A Founder's Guide to the Definition of Done
A plain-language definition of done for founders who ship with AI agents. Why 'it looks finished' is the trap, and how to decide done before you build.
Oct 6, 2026
12 min read
How-tos
What Is a Database Migration? The One Change Your AI Agent Makes That Can Lose Real Data
What is a database migration, in plain language for AI builders: the one change your coding agent makes that can drop a column or lose rows for real, and the criterion that keeps it safe.
Oct 5, 2026
14 min read
Get Started
Ready to build without the back-and-forth?
Turn messy thoughts into engineering-grade prompts that coding agents can nail the first time.
Describe what you want to build
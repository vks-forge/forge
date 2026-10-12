---
title: Code Review Is Not About Catching Bugs · davidpoll.com
id: code-review-is-not-about-catching-bugs-davidpollcom
tags:
- ai-software-factory-architecture-58e4cc
- code-review
- human-in-the-loop
- code-review-philosophy
created: '2026-10-12T08:27:44.661960Z'
updated: '2026-10-12T08:32:24.757051Z'
source: https://www.davidpoll.com/2026/02/code-review-is-not-about-catching-bugs/
source_domain: www.davidpoll.com
fetched_at: '2026-10-12T08:27:44.659086Z'
fetch_provider: builtin
status: draft
type: note
tier: unknown
content_type: unknown
deprecated: false
summary: Former Google/Firebase/Parse engineer David Poll argues, responding to Charity
  Majors and Boris Tanes claims that AI coding collapses the SDLC down to production
  observability, that code reviews primary function has never been bug-catching. Tests
  answer does the code do what the author intended, observability answers what is
  the system actually doing, but only code review answers whether the authors intent
  was the right thing to build (architectural fit, complexity cost, taste and standards).
  Drawing on 5.5 years running Firebases API council, roughly 850 proposals reviewed
  across every language, ecosystem, REST API, DB schema, and CLI command, the author
  states the most valuable review feedback was never a bug report but a judgment call
  such as this API implies a mental model that contradicts what you shipped last quarter,
  a defect that a perfectly working system in production would never surface via observability.
  Argues that as automated tooling increasingly handles style, security patterns,
  API compatibility, and performance regressions, the open question for an AI-driven
  software factory is what judgment-based review work must remain human-gated rather
  than delegated to an agentic quality gate.
---

Code Review Is Not About Catching Bugs · davidpoll.com
Skip to content
My former Parse colleague Charity Majors – now CTO of Honeycomb and one of the strongest voices in the observability space – recently
posted something
that caught my attention. She’s frustrated with the discourse around AI-generated code shifting the bottleneck to code review, and she argues the real burden is
validation
– production observability. You don’t know if code works until it’s running with enough instrumentation to see what it’s actually doing.
She followed up by endorsing Boris Tane’s piece arguing that
the entire SDLC is collapsing
, with monitoring as the only stage that survives. Boris goes further than Charity – he argues the pull request flow is a relic, that human code review should become exception-based, and that clinging to it is “an identity crisis.”
She’s right about that. And I’d go further: if your primary strategy for knowing whether code works is having other humans read it, you have bigger problems than AI-generated code.
But I think the “code review is the bottleneck” crowd and the “no, validation is the bottleneck” crowd are both working from the same flawed premise: that code review exists primarily to answer “does this code work?”
To be fair, finding defects has always been listed as a goal of code review – Wikipedia will tell you as much. And sure, reviewers do catch bugs. But I think that framing dramatically overstates the bug-catching role and understates everything else code review does. If your review process is primarily a bug-finding mechanism, you’re leaving most of the value on the table.
The Question Code Review Actually Answers
Code review answers:
“Should this be part of my product?”
That’s a judgment call, and it’s a fundamentally different question than “does it work.” Does this approach fit our architecture? Does it introduce complexity we’ll regret in six months? Are we building toward the product we intend, or accumulating decisions that pull us sideways? Does this abstraction earn its keep, or are we over-engineering for a future that may never arrive? Does this feel right – not just functionally correct, but does it reflect the taste and standards we want our product to embody?
Tests answer “does the code do what the author intended.” Production observability answers “what is the system actually doing.” Code review answers “was the author’s intent the right thing to build?”
You need all three. None of them substitutes for the others.
Observability gives you incredible power to understand a running system. But by the time you’re observing something in production, the decision to build it that way has already been made. You’re watching the consequences of choices – you’re not influencing the choices themselves. That’s what code review is for.
What I Learned Watching This Play Out
At Firebase, I spent 5.5 years running an API council that reviewed somewhere around 850 proposals across every language, ecosystem, REST API, database schema, and CLI command that Firebase shipped. That was technically API review, not code review – a separate process focused specifically on the interfaces we exposed to developers. But the underlying muscle was the same: applying judgment about what should exist in the product.
The most valuable feedback from that council was never “you have a bug in this spec.” It was “this API implies a mental model that contradicts what you shipped last quarter” or “this deprecation strategy will cost more trust than the improvement is worth” or simply “a developer encountering this for the first time won’t understand what it does.” Those are judgment calls about whether something
should
be part of the product – the same fundamental question that code review answers at a different altitude. No amount of production observability surfaces them, because the system can work perfectly and still be the wrong thing to have built.
I saw this earlier at Parse too, where API review happened right inside the pull request – a tiny team making decisions that hundreds of thousands of apps would depend on, and every PR was a chance to ask “are we making a promise to developers that we actually want to keep?” Later at Google Cloud, API review lived in code review there as well. The underlying question was always the same: does this belong in our product?
And the tools we have for this are expanding fast. The kinds of things we can review in an automated way – style consistency, security patterns, API compatibility, performance regressions – are changing dramatically. Which means the interesting question isn’t just “what does review need to become?” but “what should
humans
focus on in review now that tooling can handle more of the mechanical checks?” The answer, I think, is the stuff that’s hardest to automate: judgment, taste, architectural coherence, and the collaborative aspects of building shared understanding.
Charity’s right that you need observability. Honeycomb has built incredible tools for exactly this problem. But observability tells you what your system
is doing
. Code review is where you decide what it
should be doing
. Conflating the two is how you end up with a codebase that runs great and makes no sense.
The Often Overlooked Part: Collaboration
There’s another dimension to code review that gets lost in the “bottleneck” framing: it’s one of the primary ways teams collaborate on applying judgment to the systems they build together.
What teams collaborate
on
during review is changing. Less time spent on style nits and mechanical correctness, more time on intent, architecture, and whether a change moves the product in the right direction. That’s a good shift. And the collaborative act itself – multiple humans exercising judgment together, developing shared taste, building mutual understanding of where the system is heading – that’s not a bottleneck to eliminate. It’s something to uplevel.
This is the part that concerns me most about framing code review as a bottleneck. Yes, review takes time. But some of that time is doing real work. The question isn’t how to eliminate that time. It’s how to make sure it’s spent on the judgment that matters rather than the noise that doesn’t.
What AI Is Actually Changing
Here’s the thing: people using tools that make it easier to build things have always skipped steps. Nobody code reviews an Excel spreadsheet, even though a spreadsheet is ostensibly an application written by a non-engineer. When a solo developer ships a weekend project with AI, they don’t need a formal review process, and they shouldn’t.
But here’s what’s interesting: solo developers using AI coding tools finally have some facsimile of building with a partner. They can bounce ideas off something, get a second perspective, ask “is this the right approach?” That’s pure gain – a place where “review” as a step is actually
additive
where it never existed before.
Boris Tane’s “AI-native engineers” who skip the SDLC entirely? Many of them are probably building solo or in small teams, shipping fast, iterating on working software. Good for them. Seriously. That’s exactly what these tools should enable.
But engineering durable systems as a team and making one-off, disposable software are fundamentally different activities. When you’re building something that needs to be maintained for years by people who didn’t write it, the judgment about what enters the codebase matters enormously. And the review process is what captures institutional knowledge – why decisions were made, why this intent and not that one. That context is too valuable to just lose. The “code review is the bottleneck” crowd isn’t entirely wrong – they’re just diagnosing the wrong problem.
AI-generated code does change code review. But the change isn’t “there’s more code to review, so review is slower.” The change is that the nature of what’s being reviewed is shifting.
When a human writes code, the code is an artifact of their reasoning process. You can review the code and infer the thinking behind it. When AI generates code, you lose that direct connection. The code might be perfectly functional but reflect no coherent design intent – or worse, reflect a design intent that’s subtly different from what the developer actually wanted.
This means code review is becoming less about “is this implementation good?” and more about “does this implementation reflect the right decisions?” The judgment layer is getting more important, not less. And it’s getting harder, because the artifacts you’re reviewing no longer carry the same implicit context about why they exist.
When an engineer opens a pull request for code they wrote, you can usually trace it back to a conversation, a design decision, a product bet. The code is evidence of thinking. AI-generated code can be evidence of a prompt – which might be thoughtful, or might be “make it work.” The review has to distinguish between these cases, and that’s a new skill.
Code Review Is Becoming More Than Reviewing Code
I think “code” in the name throws people. The act isn’t reviewing code – it’s reviewing whether to incorporate a change into a product. For some class of changes, that can be fully automated. For others, people will want to be in the loop. The goal isn’t to put human eyes on all the code. It’s to direct attention where it matters.
What’s quietly happening is that the scope of “review” is expanding. We’re not just reviewing code anymore. We’re reviewing:
Intent.
What was the developer (or agent) trying to accomplish, and is that the right thing to accomplish? As AI can build whole features into existence in a single pass, code arrives in bigger chunks – and the intent behind those chunks matters more than ever. Intent used to be implicit in the code. It’s increasingly something that needs to be explicit.
Taste.
Functional correctness is table stakes. Does this change reflect the standards and sensibility we want our product to embody? AI might generate code that has a point of view, but when people are building things,
their
point of view ought to come first. Taste is the human layer that turns working software into good software – and it’s one of the hardest things to exercise when you’re reviewing code you didn’t write.
Architecture decisions at velocity.
When code arrives faster, architectural drift happens faster. Review is increasingly about catching the moment when a codebase starts pulling in a direction nobody intended.
Trust signals.
Not all changes carry the same risk. A dependency update, a localization string change, and a refactor of your authentication flow all look like diffs – but they warrant very different levels of scrutiny. As the volume of changes increases, routing attention based on what a change
touches
matters more than who or what produced it.
Product coherence.
As AI makes it easier to build features, the question of whether you
should
build a feature becomes more important than whether you
can
. Review is one of the few places where that question gets asked systematically.
Collaboration on judgment.
As AI generates more of the code, the nature of how teams collaborate around changes is shifting. Review is one of the few systematic places where humans on a team exercise judgment together about the system they share. What they’re judging is changing – less mechanical correctness, more intent and direction – but the collaborative act is worth protecting.
This is what I’m spending a lot of time thinking about at GitHub right now – how code review evolves to match the way code is actually being produced. The tools and practices that worked when every line was hand-typed by someone on your team aren’t sufficient when code arrives from a mix of human authors, AI assistants, and autonomous agents.
The Real Bottleneck
If there’s a bottleneck, it’s not code review and it’s not production validation. It’s judgment.
This has been the pattern over and over throughout history: as automation handles more of the mechanical work, people uplevel where they apply judgment. We don’t stop needing humans in the loop – we keep raising the altitude at which they operate. Assembly lines and machines replaced artisanal crafting of goods by individuals and small teams – and created entirely new roles for design, quality engineering, and production management. In software, the same pattern repeats. Compilers and interpreters let us move from assembly language to low-level programming languages to higher-level ones. Self-managed servers to cloud-native infrastructure. Bigger and bigger abstractions, each one letting developers focus at a higher altitude. Each time, the prediction was that the previous layer of human involvement would become obsolete. Each time, people just started building bigger and better things faster, and judgment moved up a level.
Will we hit an inflection point where people are entirely out of the loop? Maybe. But we haven’t yet. What’s actually happening is that automation is making it possible for people to build things that were previously out of reach – and the judgment about
what
to build and
whether
to build it becomes more important with every step – because the set of things we
can
build has become so much broader.
The ability to look at a change – whether it was written by a human, generated by AI, or proposed by an agent – and decide whether it should be part of your product. The ability to distinguish between “this works” and “this is right.” The ability to hold architectural vision while the rate of change accelerates around you.
Code review is one of the primary places where that judgment gets exercised. Observability is one of the primary places where the consequences of that judgment become visible. You need both, and right now the interesting question isn’t which one is the bottleneck. It’s how both need to evolve as the volume, velocity, and authorship of code changes underneath them.
Questions I’m Sitting With
I don’t have tidy answers here. But some questions I keep coming back to:
How do you review intent when the code doesn’t carry implicit context about why it exists? Do we need new artifacts beyond diffs – prompts, decision logs, architecture rationale – to make review effective?
The line between human-written and AI-generated code is blurring rapidly – and honestly, it might not matter much longer. The interesting question isn’t “who wrote this code?” but “what level of judgment does this change require?” Some changes are mechanical and can be validated automatically. Others touch product direction, architecture, or user-facing behavior in ways that need human attention. How do we distinguish between them quickly and reliably?
How do we make it easier for people to apply their judgment where it matters and move the noise aside? As the volume of changes increases, the ratio of signal to noise in review is shifting. The answer probably isn’t “review everything the same way.” It’s figuring out which changes need deep human judgment, which need a lighter touch, and how to route them accordingly.
How do we preserve the collaborative dimension of review as the nature of authorship changes? When AI writes more of the code, the opportunities for humans to develop shared judgment together could shrink – right when that shared judgment matters most.
And maybe most importantly: how do we scale judgment? Because that’s the thing that doesn’t get easier with better tooling. Better tools can surface the right information faster, but someone still has to decide what to do with it.
These feel like the questions worth investing in. Rethinking the SDLC in light of AI is appropriate – Boris is right that the old sequential model doesn’t describe how people actually work anymore. But I think the discourse is treating code review in a reductive way, failing to acknowledge what it’s actually doing at its core. The act of reviewing whether a change should be part of your product – with judgment, taste, and collaboration – doesn’t go away just because the authorship model changes. It uplevels.
Not “is code review the bottleneck?” but “what does code review need to become?”
Thanks to Charity Majors, Bee Klimt, and David Fowler for reading drafts of this post and sharing their thoughts.
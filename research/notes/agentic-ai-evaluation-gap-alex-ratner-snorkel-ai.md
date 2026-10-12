---
title: Agentic AI Evaluation Gap | Alex Ratner | Snorkel AI
id: agentic-ai-evaluation-gap-alex-ratner-snorkel-ai
tags:
- ai-software-factory-architecture-58e4cc
- agent-benchmarks
- rigid-evals
created: '2026-10-12T08:28:52.159179Z'
updated: '2026-10-12T08:36:38.167640Z'
source: https://snorkel.ai/blog/closing-the-evaluation-gap-agentic-ai-alex-ratner/
source_domain: snorkel.ai
fetched_at: '2026-10-12T08:28:52.157130Z'
fetch_provider: builtin
status: draft
type: note
tier: unknown
content_type: unknown
deprecated: false
summary: 'Snorkel AI blog recap (June 23, 2026) of a talk by Alex Ratner (co-founder/CEO,
  Snorkel AI) at @Scale: Systems & Reliability, framing the ''agentic AI evaluation
  gap'' -- the claim that our ability to measure agents has been outpaced by our ability
  to build them, for arguably the first time in the field''s history. Directly relevant
  to pillar 1 (rigid evals) and pillar 3 (reverse engineering / codebase mastery via
  coding-agent benchmarks). Frames the evaluation frontier along three axes using
  software engineering agents as the running example: (1) environment/input complexity
  -- realistic SWE evals need an entire miniature codebase with files, CI harnesses,
  and PM Slack messages, not a single paragraph problem, and most current benchmarks
  sit at the simple end; (2) autonomy horizon -- task length/dynamism, where real
  tasks are non-linear (goals/constraints shift mid-execution), so the key question
  is not step count but how well an agent adapts when the ground shifts; (3) output
  complexity -- grading a full software product requires rubrics/verifiers/multi-dimensional
  grading keys, and building those graders is itself a research problem. Gives concrete
  benchmark-saturation data points: HumanEval is ~95% saturated; Terminal-Bench 2.1
  sits at ~83%; Terminal-Bench 3.0 (forthcoming) is expected to push failure rates
  past 80%; ProgramBench (replicating entire program artifacts, equivalent to weeks
  of human work) has a fully-resolved accuracy rate in the low single digits. Core
  thesis: ''in the agentic world, the data spec is a majority of the product spec''
  -- defining tasks/environments/success criteria is now a large share of product-building
  work itself, requiring continuous scoping/calibration, environment+task co-construction,
  and reviewing every component before versioning. Highlights three benchmarks from
  Snorkel''s Open Benchmarks Grants program as exemplars: Terminal-Bench (full terminal
  access, broad failure-mode coverage, has shaped coding-agent development direction
  over the past year); SlopCodeBench (coding tasks where the spec changes mid-execution,
  directly testing the autonomy-horizon problem and technical-debt drift when targets
  move); Continual Learning Bench (UC Berkeley, tests whether agents improve across
  a sequence of tasks, not just single-task performance). Notes Snorkel''s Open Benchmarks
  Grants commitment of $3M (with ~20 benchmarks being announced) -- a separate Oct
  7, 2026 Snorkel post (surfaced in the ''recommended articles'' list of this page,
  not independently fetched) states this was later expanded 10x to $30M, suggesting
  the evaluation-infrastructure funding gap is being treated as serious and growing
  by at least one major vendor.'
---

Agentic AI Evaluation Gap | Alex Ratner | Snorkel AI
Skip to content
Back to blog
Research
Agentic AI evaluation: Closing the gap with better benchmarks and data
June 23, 2026
•
6 min read
•
Snorkel Team
(opens in a new tab)
Alex Ratner
, co-founder and CEO of Snorkel AI, spoke at
@Scale: Systems & Reliability
about one of the most underappreciated problems in AI deployment: our ability to measure agents has been outpaced — arguably for the first time in the history of the field — by our ability to build them. The talk digs into what it actually takes to close that evaluation gap, and why the data behind benchmarks is the linchpin.
The core asymmetry is this: when the state of the art was training a model to tell a cat from a dog, building a hundred ground-truth examples was trivial, and measuring accuracy on a held-out test set was straightforward. Today, model capabilities are advancing faster than we can build the data sets and benchmarks to empirically evaluate them. You see this in benchmark saturation — an agent scores 90%+ on the evals you care about, but then underperforms in real-world settings. The benchmarks have lagged behind what we’re actually using agents for.
That gap matters because all the monitoring and logging and observability infrastructure in the world is only as useful as your ability to evaluate the output it captures. Observing agents tells you
what
they did. Benchmarks tell you whether what they did was
right
.
Three axes that define the frontier
Alex frames the expanding evaluation problem around three dimensions, using
software engineering agents
as a running example because it’s a domain that can feel saturated but isn’t.
Environment and input complexity.
A simple coding benchmark might be a single tricky problem stated in a paragraph. A realistic software engineering evaluation might include an entire miniature codebase — files, tooling, CI harnesses, Slack messages from a PM, input from other systems — everything an agent would actually encounter on the job. Most current benchmarks live at the simple end. The real world lives at the complex end.
Autonomy horizon.
The length and dynamism of the task. A multiple-choice coding question requires one step.
ProgramBench
, which asks agents to replicate entire program artifacts, can require the equivalent of weeks of human work. Crucially, real tasks aren’t linear — goals and constraints shift mid-execution — so the relevant question isn’t just
how many steps
but
how well does the agent adapt when the ground shifts.
Output complexity.
As inputs and horizons scale up, so does the difficulty of grading the output. A unit test can check a 101-level coding solution. Evaluating whether an agent built a good software product requires rubrics, verifiers, and multi-dimensional grading keys.
Building those graders is itself a research problem
.
Even in a seemingly saturated domain like coding, the white space is exponential. HumanEval is approximately saturated at 95%.
Terminal-Bench 2.1
sits at ~83%. Terminal-Bench 3.0 is forthcoming and expected to push failure rates well past 80%.
ProgramBench
has a fully-resolved accuracy rate in the low single digits. The next generation — staff-engineer-level system architecture problems — is harder still. The pattern isn’t a ceiling; it’s a frontier that keeps receding as we build better evals. Track the latest results on the
Snorkel leaderboards
.
Data is the product spec
The talk makes a point worth dwelling on: in the agentic world, the data spec
is
a majority of the product spec. Defining what tasks an agent should complete, what environments it should operate in, and what a good output looks like is an increasing percentage of the work of building the product itself.
What that data looks like has changed dramatically. In the chatbot era, a test question was a prompt and an expected response. In the agentic era, a test question might be: a complex, domain-specific task; a full simulated environment (legal research tools, an EHR system, a code repository); rubrics and verifiers that give feedback not just at the end state but at intermediate steps along the way.
Building that data well requires scoping and calibrating the benchmark continuously, constructing environments and tasks in tandem, running agents against early drafts to find failure modes, and reviewing every component of the resulting payload before it’s versioned and published. It’s slow, careful work — and it’s where most of the leverage sits. For a deeper look at what this pipeline requires, see
why coding agents need better data, evals, and environments
.
The benchmarks doing it right
Three examples from Snorkel’s
Open Benchmarks Grants
program illustrate where the field is heading:
Terminal-Bench
gives agents full terminal access and covers a wide range of agentic operations and failure modes. It’s been both a measuring stick and a guidepost — it has shaped the direction of
coding agent
development over the past year. Good benchmark distribution matters: a benchmark every agent aces isn’t useful; one that only probes one failure mode isn’t either.
SlopCodeBench
measures coding tasks where the spec
changes
during execution — a direct test of that autonomy-horizon problem. Most real-world projects don’t go straight-line. Requirements shift. An agent that performs well on a fixed spec may accumulate technical debt and drift when the target moves. This benchmark surfaces that failure mode.
Continual Learning Bench
(out of Berkeley) evaluates whether agents can improve across a sequence of tasks — not just whether they can perform a task, but whether they can
learn
from task one before tackling task two. You can’t improve what you can’t measure, and this benchmark makes that form of improvement measurable.
What comes next
The evaluation gap won’t close on its own. The surface area of what agents can do — and what we want them to do — is expanding faster than sample efficiency gains will offset. The path forward runs through better data: richer environments, longer-horizon tasks, and more nuanced graders that match the frontier of actual agent capabilities.
If you’re working on a benchmark in this space,
the Open Benchmarks Grants program is open
. Snorkel has committed $3M, about 20 benchmarks are being announced in the coming months, and a new batch is being onboarded. The goal is to support open, well-designed benchmarks driven by academic and open-source teams — the kind of evaluation infrastructure the field actually needs.
For more on how data powers better agent evaluation, see
Closing the Evaluation Gap in Agentic AI
,
Benchmarks Should Shape the Frontier, Not Just Measure It
, and our
research hub
.
Share this article
Recommended articles
View all articles
Frontier AI is Accelerating. Open Benchmarks Need to Keep Up.
Today, we’re excited to announce that we are expanding our Open Benchmarks Grants by 10x to a $30M commitment, to support researchers, domain experts, and open-source teams pushing the frontier of robust, open frontier AI evaluation. The expanded program includes: Through our initial $3M commitment to Open Benchmarks Grants (OBG) and our broader research collaborations, we’ve partnered with the teams
October 7, 2026
•
Vincent Sunn Chen
MedPAIR: Measuring Whether Physicians and AI Agree on What Matters in Medical QA
Yuexing Hao presents MedPAIR, a dataset comparing which sentences physicians and LLMs find relevant in clinical questions. Humans and LLMs agree on only 50 to 60% of relevance labels.
October 2, 2026
•
Snorkel Team
RL environments for LLM agents: Design, rewards, and validation
TLDR: An agent, by definition, can take actions and is more than just a language model. The model is only one part of the system, and is only one element that you are training. The environment determines what the agent can observe, what it can change, which actions are available, and what behavior receives a reward. For a coding agent,
September 28, 2026
•
Aryan Kargwal
,
Jonathan Schlosser
Join our newsletter
For expert advice, the latest research, and exclusive events.
By submitting this form, I acknowledge I will receive email updates from Snorkel AI, and I agree to the
Terms of Use
and acknowledge that my information will be used in accordance with the
Privacy Policy
.
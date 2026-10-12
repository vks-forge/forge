---
title: 'Loop engineering: Getting started with loops | Claude by Anthropic'
id: loop-engineering-getting-started-with-loops-claude-by-anthropic
tags:
- ai-software-factory-architecture-58e4cc
- triggers-infrastructure
- advanced-skill-sequences
- primary-source
created: '2026-10-12T08:39:06.260957Z'
updated: '2026-10-12T08:41:24.668978Z'
source: https://claude.com/resources/articles/getting-started-with-loops
source_domain: claude.com
fetched_at: '2026-10-12T08:39:06.259802Z'
fetch_provider: builtin
status: draft
type: note
tier: unknown
content_type: unknown
deprecated: false
summary: 'Official Anthropic/Claude Code team write-up (authored by Delba de Oliveira
  and Michael Segner) defining loop engineering authoritatively -- the primary source
  behind Addy Osmani''s secondary commentary, directly load-bearing for Pillar 5 (triggers/continuous
  operation) and Pillar 2 (SOPs to Agent Skills). Defines loops as ''agents repeating
  cycles of work until a stop condition is met,'' categorized by how triggered, how
  stopped, which Claude Code primitive is used, and best-fit task type. Four types:
  (1) Turn-based/agentic loop -- triggered by user prompt, Claude judges completion
  itself, managed by writing specific prompts and encoding verification as SKILL.md
  files so Claude can self-check (gives verbatim verify-frontend-change skill requiring
  dev-server interaction, screenshot diffing, zero new console errors, and a Chrome
  DevTools MCP performance/Core Web Vitals audit before declaring any UI change complete
  -- a concrete rigid-eval pattern for Pillar 1); (2) Goal-based loop (/goal) -- triggered
  manually, stops when goal achieved OR max turns reached, an independent evaluator
  model checks the condition each time Claude tries to stop so Claude cannot self-judge
  ''good enough,'' works best with deterministic criteria (e.g. ''/goal get the homepage
  Lighthouse score to 90 or above, stop after 5 tries''); (3) Time-based loop (/loop
  and /schedule) -- triggered on a fixed interval, stops on cancellation or work completion,
  /loop runs locally and stops if you turn off your computer, /schedule moves it to
  the cloud; (4) Proactive loops -- triggered by event or schedule with no human in
  real time, each task exits when its goal is met but the routine itself runs until
  manually disabled, recommended to route to smaller/faster models for routine work
  and reserve capable models for judgment calls. Gives a composed production example
  combining /schedule (hourly feedback-channel check) + /goal (triage/action/respond
  until done) + dynamic workflows (parallel-worktree solution exploration with adversarial
  judge review) + auto mode (no permission-asking). Quality/cost guidance: use a second
  agent with fresh context for code review since the original agent is ''not influenced
  by the main agent''s reasoning''; pilot before large runs since dynamic workflows
  can spawn hundreds of agents; use deterministic scripts instead of re-derived reasoning
  for repeatable tasks; monitor cost via /usage, /goal (no args), and /workflows commands.
  Article metadata reveals adjacent high-value Anthropic content not yet fetched:
  ''Building effective agent automations'' (scheduled Managed Agents reference implementation),
  ''How Block orchestrates Claude Fable across thousands of pull requests'' (Bradley
  Axen, Block), ''Automating eval design and hillclimbing with Claude,'' and ''How
  Comcast and Booz Allen use Claude Mythos to find exploit chains... through Project
  Glasswing'' -- all directly relevant to Pillars 1, 3, and 5 and strong candidates
  for a follow-up fetch batch.'
---

*Suggested by [[practical-loop-engineering-by-addy-osmani-elevate]] — Anthropic's official write-up on the loop/goal/schedule primitives that the secondary source summarized*

Loop engineering: Getting started with loops | Claude by Anthropic
Skip to main content
Getting started with loops
There’s a lot of talk right now about loop engineering or "designing loops" instead of prompting your coding agent. If you spend some time on X trying to pin down what a loop actually is, you'll come across multiple different answers.
On the Claude Code team, we define
loops as agents repeating cycles of work until a stop condition is met
. We categorize a few different types of loops based on:
How they are triggered
How they are stopped
What Claude Code primitive is used
What type of task is most appropriate for each.
We’ll cover the main loop types, when to use each, and how to maintain code quality while managing token usage. Not all tasks require complex loops; start with the simplest solution and use these patterns selectively.
Turn-based loops
Triggered by
: A user prompt.
Stop criteria
: Claude judges it has completed the task or needs additional context.
Best used for:
Shorter tasks that are not part of a regular process or schedule.
Managed usage by:
Write specific prompts and improve verification using skills to reduce the number of turns.
‍
Every prompt you send starts a manual loop with you directing each turn. Claude gathers context, takes action, checks its work, repeats if needed, and responds. We call this the agentic loop.
For example, ask Claude to create a like button. It reads your code, makes the edit, runs the tests, and hands back something it
believes
works. You then manually check the work, and write the next prompt.
You can improve the verification step by encoding your manual steps as a SKILL.md so Claude can check more of its own work, end-to-end. (For choosing between skills, hooks, and subagents for this kind of automation, see our guide to
steering Claude Code
.)
This should include tools or connectors to allow Claude to
see
,
measure
or
interact
with the result. The more quantitative the checks are, the easier it is for Claude to self-verify.
For example, in your SKILL.md file you may specify:
Copy
```
--- 
name: verify-frontend-change 
description: Verify any UI change end-to-end before declaring it done. 
--- 

# Verifying frontend changes 
Never report a UI change as complete based on a successful edit alone. Verify it the way a human reviewer would: 

1. Start the dev server and open the edited page in the browser. 

2. Interact with the change directly. For a new control (button, input, toggle): click it, confirm the expected state change, and screenshot before/after. 

3. Check the browser console: zero new errors or warnings. 

4. Use the Chrome Devtools MCP, run a performance trace and audit Core Web Vitals.

If any step fails, fix the issue and rerun from step 1 — do not hand back partially verified work.
```
Goal-based loop (/goal)
Triggered by
: A manual prompt in real-time.
Stop criteria
: Goal achieved OR maximum number of turns reached.
Best used for:
Tasks that have verifiable exit criteria.
Managed usage by:
Setting a specific completion criteria and explicit turn caps, “stop after 5 tries.”
Sometimes, a single turn is not enough, especially for more complex tasks. Agents do better when they can iterate. You can extend how long Claude keeps iterating by defining what done looks like with /goal.
When you define the success criteria, Claude doesn’t have to make a determination on what is “good enough” and end the loop early. Each time Claude tries to stop, an evaluator model checks your condition and sends it back to work until the goal is met or a number of turns you define is reached.
This is why deterministic criteria, such as number of tests passed or clearing a certain score threshold, are so effective.
For example:
Copy
```
/goal get the homepage Lighthouse score to 90 or above, stop after 5 tries.
```
Time-based loop (/loop and /schedule)
Triggered by
: A specified time interval.
Stop criteria
: You cancel it, or the work completes (the PR merges, the queue is empty).
Best used for:
For recurring work, or interfacing with external environments / systems.
Managed usage by:
Set longer intervals or react based on events rather than time.
Some agentic work is recurring: the task stays the same and only the inputs change. For example, summarizing Slack messages every morning. Other work depends on external systems, and a simple way to interface with one is to check it on an interval and react to what changed. For example, a PR which may receive code reviews or fail CI.
For these, you can trigger when Claude runs with `/loop` which re-runs a prompt on an interval. For example:
Copy
```
/loop 5m check my PR, address review comments, and fix failing CI
```
`/loop` runs on your computer, so if you turn it off, it stops. You can move the loop to the cloud by creating a routine with `/schedule`.
Proactive loops
Triggered by
: An event or schedule, with no human in real time.
Stop criteria
: Each task exits when its goal is met. The routine itself runs until you turn it off.
Best used for:
Recurring streams of well-defined work: bug reports, issue triage, migrations, dependency upgrades, etc.
Managed usage by:
Routing routines to smaller, faster models and using the most capable model for judgment calls.
The primitives above, along with other Claude Code features like
auto mode
and
dynamic workflows
(research preview) can be composed into a loop for long-running work.
For example, to handle incoming feedback, you can use:
`/schedule`
(research preview) to run a routine that checks for new reports
`/goal`
to define what done looks and
skills
to document how to verify it
Dynamic workflows
to orchestrate agents that triage each report, fix it, and review the fix
Auto mode
so the routine runs without stopping to ask for permission
Putting it together, a prompt could look like this:
Copy
```
/schedule every hour: check #project-feedback for bug reports. /goal: don't stop until every report found this run is triaged, actioned, and responded to. When fixing a bug, use a workflow to explore three solutions in parallel worktrees and have a judge adversarially review them.
```
Maintaining code quality
The quality of a loop’s output depends on the system around it. When designing the system:
Keep the codebase itself clean
: Claude follows patterns and conventions that already exist in your codebase.
Give Claude a way to verify its own work
: Encode what good looks like for you and your team with
skills
.
Make docs easy to reach:
Frameworks and libraries docs have up-to-date best practices.
Use a second agent for code reviews
: A reviewer with fresh context is less biased and not influenced by the main agent’s reasoning. You can use the built-in `/code-review` skill or
Code Review
for Github. Loops that write code need loops that check it — see
how Anthropic secures an AI-native SDLC
.
When an individual result doesn’t meet the standard, don’t stop at fixing the individual issue, try to encode it to improve the system for all future iterations.
Managing token usage
To manage token usage, loops should have clear boundaries:
Choose the right primitive and model for the job:
Smaller tasks don’t need multiple agents or loops. Some tasks can use cheaper and faster models.
Define clear success and stop criteria:
Be specific about what done looks like so Claude can arrive at the solution sooner (but not too soon).
Pilot before a large run:
Dynamic workflows can spawn hundreds of agents. Gauge usage on a smaller slice of the work first.
Use scripts for deterministic work
: Running a script is cheaper than reasoning through the steps. For example, a PDF skill can ship a form-filling script that Claude runs each time, instead of re-deriving the code.
Don’t run routines more often that you need to:
Match the interval to how often the thing you’re watching changes
Review usage:
The `/usage` command breaks down recent usage by skills, subagents, and MCPs, `/goal` with no arguments shows number of turns and token usage so far, `/workflows` shows each agent’s token usage and you can stop an agent at any time.
Your
model and effort level
choices are among the biggest levers on what a loop costs.
Getting started
To summarize:
Loop
You hand off
Use it when
Reach for
Turn-based
The check
You're exploring or deciding
Custom verification skills
Goal-based
The stop condition
You know what done looks like
/goal
Time-based
The trigger
The work happens outside your project on a schedule
/loop, /schedule
Proactive
The prompt
The work is recurring and well-defined
All of the above, and dynamic workflows
To get started with loops, look at the work you already do. Pick one task where you’re the bottleneck and ask which piece you could hand off: can you write the verification check? Is the goal clear enough? Does the work arrive on a schedule?
Once you have an idea, run the loop, observe the results like where it stalls or over-reaches, and don’t be afraid to iterate on it.
For more information, read the Claude Code docs on
running agents in parallel,
as well as the
loop
,
schedule
,
goal
, and
dynamic workflows
pages. To make your checks repeatable across sessions, see
building verification loops in Claude Code with skills
.
This article was written by Delba de Oliveira and Michael Segner
Article
Oct 8, 2026
Building effective agent automations
A reference implementation walkthrough for a scheduled Claude Managed Agents automation, with the config files and six rules for avoiding common failure modes.
Claude Platform
(opens in new tab)
Article
Oct 8, 2026
How Block orchestrates Claude Fable across thousands of pull requests
Bradley Axen, Head of AI Capabilities at Block, on how his team evaluates new large language models, how Claude Fable 5 orchestrates company-wide code migrations, and why safeguards are a critical part of deploying frontier intelligence responsibly, at scale.
Claude Enterprise
Article
Oct 7, 2026
Automating eval design and hillclimbing with Claude
Principles for designing evals and hillclimbing against them without fooling yourself, and how the claude-api skill's build-eval and hillclimb commands put them to work.
Claude Platform
(opens in new tab)
Article
Oct 6, 2026
How Comcast and Booz Allen use Claude Mythos to find exploit chains and secure their codebases
Security teams at Comcast and Booz Allen used Claude Mythos-class models through Project Glasswing to find, validate, and fix vulnerabilities their existing scanners missed.
Transform how your organization operates with Claude
See pricing
Contact sales
Get the developer newsletter
Product updates, how-tos, community spotlights, and more. Delivered monthly to your inbox.
Please provide your email address if you'd like to receive our monthly developer newsletter. You can unsubscribe at any time.
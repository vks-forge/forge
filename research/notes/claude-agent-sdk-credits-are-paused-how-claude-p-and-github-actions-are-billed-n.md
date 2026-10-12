---
title: 'Claude Agent SDK Credits Are Paused: How claude -p and GitHub Actions Are
  Billed Now (September 2026) | koromo'
id: claude-agent-sdk-credits-are-paused-how-claude-p-and-github-actions-are-billed-n
tags:
- ai-software-factory-architecture-58e4cc
- subscription-automation-enforcement
- agent-sdk-credit-policy
created: '2026-10-12T09:01:06.189234Z'
updated: '2026-10-12T09:04:17.616118Z'
source: https://koromo.io/en/blog/claude-agent-sdk-credit-guide/
source_domain: koromo.io
fetched_at: '2026-10-12T09:01:06.187052Z'
fetch_provider: builtin
status: draft
type: note
tier: unknown
content_type: unknown
deprecated: false
summary: 'Japanese-market practitioner guide (koromo.io, dated September 25 2026)
  giving the most current status confirmation of Anthropic''s paused Agent SDK credit
  policy: quotes Anthropic''s Help Center update verbatim (''For now, nothing has
  changed'' -- Agent SDK, claude -p, and third-party app usage still draw from subscription
  usage limits; the previously announced monthly credit isn''t available) and confirms
  that as of September 25, 2026, more than three months after the paused June 15 effective
  date, no new effective date or revised terms have been announced. Lays out the original
  (paused) plan''s scope and five rules (per-user, no pooling, no rollover, auto-refresh,
  one-time opt-in required, credit consumed before other billing) across all seven
  plan tiers including Team Standard/Premium and Enterprise usage-based/seat-based.
  Provides a by-usage-type table distinguishing what currently draws from subscription
  limits (claude -p, Agent SDK, third-party ACP apps) vs. what would move to the credit
  if the plan resumed (same list plus GitHub Actions, which the note observes was
  NOT paused-exempted by the official update''s wording even though it was part of
  the original plan). Gives worked per-plan token-burn simulations using Anthropic''s
  official pricing (Opus 4.8 $5/$25, Sonnet 4.6 $3/$15, Haiku 4.5 $1/$5 per MTok;
  cache reads ~0.1x input) and recommends measuring automation cost now via the /cost
  command, Console usage screen, and community tool ccusage (npm) to be ready if the
  policy resumes.'
---

Claude Agent SDK Credits Are Paused: How claude -p and GitHub Actions Are Billed Now (September 2026) | koromo
development
·
2026-09-25
Claude Agent SDK Credits Are Paused: How claude -p and GitHub Actions Are Billed Now (September 2026)
The move of Claude Agent SDK and claude -p usage to a monthly credit (Pro $20 / Max 5x $100 / Max 20x $200), planned for June 15, 2026, was paused by Anthropic on the day it was due to take effect. As of September 2026, Agent SDK, claude -p, and third-party app usage still draws from your subscription usage limits, and no new date has been announced. A practical guide to the current status, what the original plan contained, and how to prepare in case it resumes.
#
Claude Agent SDK
#
Claude Code
#
claude -p
#
Pricing
#
Anthropic
The change that would have moved Claude Agent SDK and
`claude -p`
usage onto a dedicated monthly credit starting June 15, 2026 was paused by Anthropic on the day it was due to take effect, and as of September 25, 2026 it has still not been applied.
The top of Anthropic's help article carries a June 15 update stating "For now, nothing has changed": Agent SDK,
`claude -p`
, and third-party app usage still draw from your subscription's usage limits, and the previously announced monthly credit isn't available (source:
Use the Claude Agent SDK with your Claude plan (Anthropic Help Center)
).
In other words,
if you run background automation with
`claude -p`
or the Agent SDK, nothing about how you are billed has changed right now.
Opting in to a credit and changing your "usage credits" setting are not things you need to do today. Anthropic says it is working to update the plan and will share any update before anything takes effect; no new date or revised terms have been given.
This article
separates "how things work now" from "what was originally announced," and covers what you can do now to prepare in case the change resumes.
The description of the original plan is kept for reference. For how to implement the Agent SDK itself, see the
Claude Agent SDK implementation guide (Japanese)
; for the full Claude Code pricing structure, see the
complete guide to Claude Code pricing plans (Japanese)
.
What you'll learn from this article
The accurate status as of September 2026 — the June 15 change was paused, and what has not changed
What was originally announced — what was in and out of scope, plus the per-plan credit amounts (all seven plans)
A by-usage-type table showing whether you would be affected if the original plan resumed
How to measure your automation cost (
`/cost`
, the Console, community tools)
Per-plan estimates using the original credit amounts (light cron / mid-scale CI / heavy agents)
A four-option decision framework for a possible resumption, and cautions for GitHub Actions and team usage
What happened on June 15, 2026
The change scheduled for June 15 was paused on that same day.
Anthropic announced it in May 2026 (
as reported by ITmedia
): programmatic usage, which consumes your Pro or Max plan's usage limits, would have been separated so that it drew from a dedicated monthly credit instead.
The key points of the June 15 update added to the top of the help article are:
Anthropic is
pausing
the changes to Agent SDK usage
For now, nothing has changed.
Agent SDK,
`claude -p`
, and third-party app usage still draw from your subscription's usage limits
The previously announced
monthly credit isn't available
Anthropic is working to update the plan to better support building with Claude subscriptions, and
will share an update before anything takes effect
The content below the update reflects the page before June 15; it is kept for reference and no longer takes effect on June 15
As of September 25, 2026, the page gives no new effective date or revised terms.
What was originally announced (for reference)
The following is the plan as announced before the pause. It is not in effect, but it may be the starting point if the change resumes.
The credit was to cover these four usage types:
Claude Agent SDK usage in your own projects
(Python, TypeScript)
The
`claude -p`
command
(Claude Code's non-interactive, headless mode)
Claude Code GitHub Actions
(CI integrations such as PR review and issue handling)
Third-party apps that authenticate through the Agent SDK
(external tools that sign in with your Claude subscription)
Monthly credit by plan in the original plan
Plan
Monthly credit (original plan)
Pro
$20
Max 5x
$100
Max 20x
$200
Team (Standard seats)
$20
Team (Premium seats)
$100
Enterprise (usage-based)
$20
Enterprise (seat-based, Premium seats)
$200
Source:
Use the Claude Agent SDK with your Claude plan (Anthropic Help Center, kept as pre-June 15 content)
The five rules of the credit in the original plan
Granted per user
(no pooling or sharing across a team)
No rollover
(unused credit disappears at the monthly refresh)
Refreshes automatically
with your billing cycle
A one-time opt-in (claim)
was required (refreshes were automatic afterwards)
Credit was to be consumed
before
any other billing source
Why the original plan separated it from the interactive allowance
Summarizing the official explanation, the intent of the original plan was to
protect the interactive allowance from being eaten up by background automation.
Automated runs through the Agent SDK or
`claude -p`
can run 24 hours a day on cron or CI, so their consumption is on a different scale from interactive use.
Put the other way round:
while the change is paused, automation and interactive use share the same usage limits.
It is still the case that heavy automation on a given day makes your interactive Claude Code sessions more likely to hit the usage limit.
Are you affected? A by-usage-type decision table
Right now, billing has not changed for any usage type.
The table below puts "current handling" next to "handling if the original plan resumed." The deciding question is whether a human is interacting in the moment or a program is calling Claude automatically. API-key (pay-as-you-go) usage has always been billed separately from subscriptions, so it is unaffected either way.
Usage type
Now (September 2026)
If the original plan resumed
Interactive Claude Code in the terminal or IDE
Subscription usage limits
No change
Conversations in Claude web, desktop, or mobile apps
Subscription usage limits
No change
Claude Cowork
Subscription usage limits
No change
Anthropic API via API key
Pay-as-you-go
No change
Headless runs via
`claude -p`
Subscription usage limits
Drawn from the Agent SDK credit
Agent SDK in your own projects
Subscription usage limits
Drawn from the Agent SDK credit
Claude Code GitHub Actions
Change not applied
Drawn from the Agent SDK credit
Third-party apps with subscription auth
Subscription usage limits
Drawn from the Agent SDK credit
The official update names three usage types (Agent SDK,
`claude -p`
, and third-party apps), but because it says "nothing has changed," the change has not been applied to GitHub Actions either, which was part of the original plan.
If the original plan resumed, three types of developers would be affected.
Type 1: People running
`claude -p`
on cron or a scheduler.
Morning report generation, periodic log analysis, automated content creation, and so on. Depending on execution frequency × consumption per run, the original Pro $20 allowance may not be enough (see the estimates below).
Type 2: People using Claude Code in GitHub Actions.
If you run automated PR reviews or issue triage under subscription auth, that consumption would move to the credit pool, creating the design risk of CI stopping when the credit runs out (anyone with
PR automation (Japanese)
or
test automation (Japanese)
built into CI should review this).
Type 3: People building products or internal tools with the Agent SDK.
If you've
embedded the Agent SDK into your own product (Japanese)
and use subscription auth during development and testing, that would fall under the credit pool. If you use an API key in production, you're unaffected. The server-managed
Claude Managed Agents (Japanese)
assumes API keys, so it's out of scope too.
Conversely, if you
only use Claude Code interactively in the terminal
, or only
add notifications or auto-formatting via hooks (Japanese)
(hooks themselves don't consume tokens), nothing would change for you even under the original plan.
[Steps] Measure your automation cost
Even while the change is paused, it is worth knowing how much token cost your automation consumes per month.
Automation shares the same usage limits as interactive use, so the numbers help you find out why you hit limits. And since Anthropic says it will announce any update before it takes effect, having measurements ready means you can judge the impact as soon as an announcement appears.
Step 1: See recent session consumption with the
`/cost`
command
Running
`/cost`
inside a Claude Code session displays that session's token consumption and an approximate dollar conversion. If you have a script running via
`claude -p`
, just running the same prompt once in an interactive session and checking
`/cost`
gives you a sense of the per-run scale.
Step 2: See your monthly total on the Console usage screen
The usage screen in the
Claude Console
and the usage settings on your Claude account let you review your history. Knowing where the current usage screen is will make monitoring smoother after any future change.
Step 3: Aggregate local logs with a community tool
Claude Code saves session logs locally (under
`~/.claude/projects/`
) in JSONL format. Using a community-built CLI tool that aggregates these (such as
`ccusage`
, distributed on npm) lets you list daily and per-model token consumption with dollar conversions. Its biggest advantage is that
you can back-calculate monthly consumption from the past one or two months of actuals
.
```
# Example of a community-built tool (daily consumption aggregation)
npx ccusage@latest daily
```
Step 4: Break automation tasks down "by type"
Beyond the total, break it down to
which task eats how much
. It changes the resolution of your decisions.
Task name (e.g., morning report generation, automated PR review, log analysis)
Execution frequency (times/day)
Approximate cost per run (from steps 1–3)
Is it OK for that task to stop? (acceptable downtime)
This breakdown becomes the input to the decision framework below.
Worked example: koromo's daily article-generation routine
As a concrete example, koromo runs a routine (once daily) that starts a headless session via a remote trigger every morning at 9:00 to auto-create a draft PR for an SEO article. Here's how you'd apply the steps above to this type of automation.
Run the same instruction once in an interactive session and use
`/cost`
to gauge the per-run consumption scale (for long-output tasks like article generation, output tokens typically account for the majority of the cost)
Convert to a monthly figure with "per-run cost × runs per month (30 for daily)"
For automation that's once daily and about one article, Pattern A's calculation below is a reasonable yardstick. However, article generation is heavier on output tokens than a fixed-format report, so add the difference from Pattern A's assumption (5,000 output tokens) to your estimate. If you "process multiple articles or multiple repositories per run" or "use Opus," plugging your own measured values into the Pattern B/C formulas is more reliable
The point is that once you do this calculation at the start of the month, the rest is just pace monitoring. The measurement itself takes less than 30 minutes.
[Estimates] How many days would the original credit last? Per-plan simulation
Applied to the original amounts: light cron automation has plenty of headroom within the Pro $20 allowance, mid-scale operation including CI integration has its tipping point at Max 5x's $100, and running heavy agents on Opus won't fit even in $200.
Note that the amounts could change if the plan resumes. Below are calculation examples using standard API rates (as of June 2026: Opus 4.8 input $5 / output $25, Sonnet 4.6 input $3 / output $15, Haiku 4.5 input $1 / output $5, all per million tokens; cache reads are about 0.1× of input. Source:
Anthropic official pricing page
). Cache-write cost (1.25× of normal input) is omitted for simplicity. Actual consumption varies greatly with prompt design and cache efficiency, so always cross-check against your measurement from the previous section.
Pattern A: Light cron (once daily, Sonnet 4.6)
Assumes generating one fixed-format report every morning. Input of 50K tokens (90% cache reads), output of 5,000 tokens.
Per run: new input 5K×$3/M + cache reads 45K×$0.3/M + output 5K×$15/M ≈
$0.10
Monthly (30 runs):
about $3
→
Plenty of headroom in Pro's $20
(in theory you could run it up to 6 times a day)
Pattern B: Mid-scale CI (10 runs/day, Sonnet 4.6)
Assumes processing 10 automated PR reviews per day. Input of 100K tokens (70% cached), output of 8,000 tokens.
Per run: new 30K×$3/M + cache 70K×$0.3/M + output 8K×$15/M ≈
$0.23
Monthly (300 runs):
about $70
→
Pro's $20 runs out around day 9. Max 5x's $100 is the line you need
Pattern C: Heavy agents (20 sessions/day, Opus 4.8)
Assumes running long autonomous agents. Input of 200K tokens (80% cached), output of 20K tokens.
Per run: new 40K×$5/M + cache 160K×$0.5/M + output 20K×$25/M ≈
$0.78
Monthly (600 runs):
about $470
→
Not enough even with Max 20x's $200. Consider overage billing or migrating to API keys for the excess
An easily missed point: token volume and cost aren't proportional
In agent-style workloads, most input tokens are reads from the prompt cache. Because cache reads cost about one-tenth of normal input,
a reversal where "the cache is 90% of tokens but less than half of the cost"
is common. Before panicking that "we'll never have enough" based on token counts alone, always put in a dollar-denominated measurement. Conversely, automation where caching isn't working (designs that resend the full context every time) costs far more than these estimates.
Decision framework: four options in case the change resumes
While the change is paused, keeping things as they are is fine.
The options below apply if a resumption close to the original plan is announced. Choose based on the gap between your measured monthly consumption and the credit allowance, along two axes: "how much you'd exceed" and "how much it hurts if it stops."
Option
Best suited for
Benefits
Risks / costs
1. Operate within credits
Measured usage under 80% of the allowance
Zero added cost, minimal configuration changes
May stop at month-end due to monthly variation
2. Usage credits ON (allow overage)
Small overage (up to tens of $) and you don't want automation to stop
Never stops, zero migration work
Uncapped billing if something runs away (check the spending limit)
3. Migrate to API keys
Large overage, production operation, team sharing needed
Clear budget management, independent rate limits
Implementation work to switch auth, feels like paying twice
4. Scale automation down
Some automation isn't worth its cost
Cost reduction, a chance to take stock
Giving up the convenience of automation
Diagnostic flow
Measured monthly consumption < 80% of the credit allowance
→ Option 1. Just decide whether to keep usage credits OFF for a "stops within the allowance" safe design, or ON as insurance
Exceeds, but within tens of dollars per month
→ Option 2. Always check the "usage credits" setting and spending limit
Large overage / business-critical
→ Option 3. With the Agent SDK, just switching auth to an API key keeps the code working as-is (set
`ANTHROPIC_API_KEY`
). This is the proper route for CI and production workloads
There's a task where you think, "Wait, do we even need this automation?"
→ Option 4. Even a $0.5 task is $15/month wasted if nobody reads the report
What matters is that
you can choose a different option per task type.
A combination like "morning reports within credits (1), PR review on an API key (3), and retiring an unused experimental cron (4)" is the realistic answer. Options 3 and 4 are also useful right now if automation is squeezing the usage limits you need for interactive work.
Is "just switch to Codex" actually a solution?
After the original announcement, some people considered moving to other coding agents such as OpenAI's Codex CLI. In short,
"switching because of a pricing change" usually isn't worth it.
The change itself has been paused, and switching carries the cost of rebuilding assets such as CLAUDE.md, skills, hooks, and MCP configuration. In most cases it's more rational to lower consumption itself with the optimizations below (downgrading models, cache design) than to pay migration effort over a difference of tens of dollars per month. Consider switching only when you're dissatisfied with features or quality, not price.
Opt-in and "usage credits" — no action needed now
While the change is paused, you cannot opt in to (claim) the Agent SDK credit, and no setting is needed for it.
The help article says the previously announced monthly credit isn't available. The original plan called for the following two checks; they are kept here for reference in case it resumes.
1. Opt-in (claim) of the Agent SDK credit in the original plan
Under the original plan, the credit was not granted automatically:
a one-time opt-in was required
, and monthly refreshes were automatic afterwards. Eligible Team and Enterprise users were to receive an email with instructions.
2. "Usage credits" ON/OFF
Under the original plan, this setting determined what happened when the credit ran out.
ON (enabled)
: after the credit is exhausted, overage is billed at standard API rates. Automation doesn't stop, but charges occur
OFF (disabled)
: Agent SDK requests stop once the credit is used up. Automation won't run until the refresh, but
no unexpected charges from exceeding the credit occur
Which to choose if it resumes — the "stops" vs. "uncapped" trade-off
For personal development and experimentation,
OFF is the safer choice.
Automated runs of coding agents can balloon to several times the expected consumption due to retry loops or context bloat. With OFF, the worst case is simply that automation stops until the refresh, with no charges caused by exceeding the credit.
On the other hand, if you can't let CI or routine jobs stop for business reasons, you need ON — but in that case,
also check whether a spending limit setting is available
, and if so, always set it to reach a state that "doesn't stop, but isn't uncapped either."
Cautions for GitHub Actions and team usage
If the original plan resumed, team operation would have two pitfalls that individual use doesn't.
Pitfall 1: Credits can't be pooled
Under the original plan, credits were granted
per user
and could not be combined or shared within a team. It would not become "five people × $100 = a $500 allowance"; only the credit of the authenticated user running the CI job is consumed. Consumption concentrates on the account used to authenticate GitHub Actions, so
that user's credit runs out first.
Anthropic itself recommended Claude Platform with an API key for shared production automation. For CI, moving to an API key (managed under the team's budget) is the more natural design rather than piggybacking on a specific user's subscription auth.
Pitfall 2: CI stops when credits run out
If the credit runs out with usage credits OFF, Claude Code GitHub Actions jobs keep failing until the refresh. If automated PR review is merely "nice to have," the damage is minor, but
if it's part of your merge requirements, development stops for the whole team.
For workflows used as merge blockers, once a resumption is announced, consider either (1) migrating to API-key auth, or (2) adding a fallback that treats the review as skipped when the job fails.
Per-seat credits on Team plans
Under the original plan, Team plan credit amounts differed by seat type (Standard $20 / Premium $100). If the account running your automation is on a Standard seat, its allowance would only be equivalent to an individual Pro plan ($20).
Five optimizations to make your usage go further
The same automation can consume a fraction as much depending on its design.
While the change is paused, automation directly consumes the same usage limits as interactive work, so these are worth reviewing now. In order of impact:
Downgrade the model
— Opus is overkill for routine processing. Sonnet 4.6 is 40% cheaper than Opus 4.8 (input $5 → $3), and Haiku 4.5 is 80% cheaper ($5 → $1). Haiku is often enough for classification, extraction, and fixed-format reports, and this alone transforms the estimates
Make prompt caching work
— Simply structuring prompts so the unchanging parts (system prompt, reference docs) are fixed at the start and the per-run content goes at the end can cut input cost to about one-tenth at most. Also note that if your cron interval is longer than the cache TTL (5 minutes to 1 hour), the cache will have expired
Review execution frequency
— Does that hourly job really need to run hourly? Running something hourly that daily would suffice means 24× the consumption on its own
Trim the output
— Output tokens cost 5× as much as input. Just changing a "detailed report" into a "diff report of changes only" cuts output cost dramatically
Don't pass too much context
— Designs that make it read the whole repository every time are wasteful even with caching. Add a preprocessing step that narrows down the target files before passing them
Build a monitoring mechanism first
As important as optimization is
visibility into consumption.
If you can see the pace — "what % consumed by which day of the month" — you'll notice before hitting the limit. Concretely, (1) build a habit of checking the usage screen once a week, and (2) temporarily reduce automation frequency when the pace far exceeds your expectation. The same mechanism can serve as balance monitoring if a credit system is introduced in the future.
Current behavior and outlook (as of September 25, 2026)
As of September 25, 2026, the help article shows the following:
`claude -p`
, Agent SDK, and third-party app usage draws from your subscription usage limits, as before
The previously announced monthly credit isn't available (no opt-in action is needed)
No new effective date or revised terms have been given. Anthropic says it will share any update before anything takes effect
If
`claude -p`
suddenly stops working, the credit system is not the cause at this point. First check whether you've hit your subscription usage limit; if it stopped due to another error, refer to the reverse-lookup index in
50 Claude Code error fixes (Japanese)
. We will revise this article when the help article is updated.
Frequently asked questions
Did the June 15 change to Agent SDK credits take effect?
No. Anthropic announced a pause on June 15, the day the change was due to take effect. As of September 25, 2026, the help article still says nothing has changed for now, and Agent SDK, claude -p, and third-party app usage continues to draw from your subscription usage limits.
Do I need to opt in to the Agent SDK credit now?
No. According to the help article, the previously announced monthly credit isn't available. The original plan required a one-time opt-in, but while the change is paused there is nothing to claim.
Has a new effective date been set?
As of September 25, 2026, the help article gives no new date. Anthropic says it is working to update the plan and will share any update before anything takes effect.
Does running claude -p or other automation now affect my interactive Claude Code usage?
Yes. While the change is paused, claude -p and Agent SDK usage draws from the same subscription usage limits as interactive Claude Code. The more automation you run, the sooner interactive use can hit the limit.
Under the original plan, could credits be pooled across a team?
No. Under the original plan, credits were granted per user and could not be combined or transferred within a team. Anthropic recommended an API key with pay-as-you-go billing for shared production automation.
Am I affected if I use the Anthropic API with an API key?
No. The paused change applied only to programmatic use authenticated with a Claude subscription (Pro/Max/Team/Enterprise). API-key usage remains pay-as-you-go as before.
How can I tell whether a third-party app uses subscription auth?
Check how the tool authenticates. A tool that asked you to sign in with your Claude account during setup (opening Anthropic's sign-in page in a browser) uses subscription auth and currently draws from your subscription usage limits. A tool configured by pasting an API key (a string starting with sk-ant-) is billed pay-as-you-go through the API.
Summary — what to do now, and how to prepare
The change planned for June 15 was paused, and
as of September 2026 nothing about billing has changed.
No new date has been given either, so there's no need to rush into settings changes or migrations. What's worth doing now is understanding your automation's consumption to reduce pressure on interactive use, and being ready for a resumption announcement.
Check your usage types (
`claude -p`
/ Agent SDK / GitHub Actions / third-party apps)
Measure your monthly consumption in dollar terms
with
`/cost`
, the Console, and local-log aggregation
Review model choice, caching, and execution frequency to reduce pressure on interactive usage limits
Know the authentication method of GitHub Actions workflows that are part of merge requirements
Check the
help article
periodically for updates
If you want to systematically grasp Claude Code from basics to operation, see the
complete guide to Claude Code (Japanese)
as well.
If you need support with introducing Claude Code or the Agent SDK in your organization, cost design for automation workflows, or API migration, feel free to reach out to koromo's
AI development support service (Japanese)
. We'll work alongside you from introduction through operational design, including the pitfalls that only become clear from real-world operation.
koromo からの提案
AIツールの導入判断は、突き詰めると
「投資対効果が合うか」「リスクを管理できるか」「事業にどう効くか」
の3点に帰着します。koromo では、この判断に必要な材料を整理するところからご支援しています。
以下のような状況にある方は、まず現状の整理だけでも前に進むきっかけになります。
AIで開発や業務を効率化したいが、自社に合う方法がわからない
社内にエンジニアがいない / 少人数で、AI導入の進め方に見当がつかない
外注先の開発会社にAI活用を提案したいが、何を求めればいいか整理できていない
「AIを使えばコスト削減できるはず」と感じているが、具体的な試算ができていない
無料ツール
AI導入 準備度チェック
19項目で自社の準備状況を診断 →
無料ツール
ROI 試算ツール
業務削減コストを即時スコアで確認 →
ツールを使った上で相談したい方は
お問い合わせフォーム
から「
AI活用の相談
」とご記載ください。初回の壁打ち（30分）は無料で対応しています。
無料で相談する
→
Related Articles
tech
What's New in Next.js 16
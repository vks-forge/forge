---
title: 'Two Multi-Account Claude Code Architectures: One Anthropic Accepts, One They
  Ban - DEV Community'
id: two-multi-account-claude-code-architectures-one-anthropic-accepts-one-they-ban-d
tags:
- ai-software-factory-architecture-58e4cc
- subscription-automation-enforcement
- claude-code-policy
created: '2026-10-12T09:01:02.217157Z'
updated: '2026-10-12T09:03:50.263498Z'
source: https://dev.to/vainamoinen/two-multi-account-claude-code-architectures-one-anthropic-accepts-one-they-ban-2om7
source_domain: dev.to
fetched_at: '2026-10-12T09:01:02.216466Z'
fetch_provider: builtin
status: draft
type: note
tier: commentary
content_type: blog
deprecated: false
summary: Practitioner analysis (dev.to, 2026) contrasting two multi-account Claude
  Code architectures against Anthropic's June 15, 2026 Agent SDK credit policy. Architecture
  A ('relay-server', e.g. Wei-Shaw/claude-relay-service, 11.7k GitHub stars) pools
  many OAuth tokens behind a server that impersonates the official Claude Code client
  -- this is the pattern Anthropic's April 2026 OpenClaw ban and detection systems
  target, because the relay is a non-official client replaying client headers/telemetry
  it cannot perfectly fake. Architecture B ('per-profile rotation', using CLAUDE_CONFIG_DIR
  to run N isolated official-client logins) is explicitly acknowledged by Anthropic
  as an open, closed-as-completed GitHub issue (anthropics/claude-code#261, closed
  March 5, 2025) because each instance is a genuine official-client OAuth login generating
  normal telemetry -- the interactive /login requirement per profile is 'the feature'
  that prevents it scaling to thousands of pooled accounts. Documents the Chinese
  gray-market reseller ecosystem (1 RMB per $1 of tokens, 70-90% below list) that
  sustains Architecture A at scale, and Anthropic's countermeasures (geoblocking,
  phone verification, >50% Chinese-ownership ban Sept 2025, biometric KYC April 2026).
---

Two Multi-Account Claude Code Architectures: One Anthropic Accepts, One They Ban - DEV Community
Two Multi-Account Claude Code Architectures: One Anthropic Accepts, One They Ban
Name the daemon. Name its birth. That is the tietäjä's discipline.
On June 15, 2026, the Anthropic Agent SDK credit policy reshapes the economics of any
`claude -p`
workload running against a subscription. The arbitrage is over; the bill is real. The cost math — including the 12× / 29× / 175× spread between Theo Browne's headline "25× cut" framing and what Sonnet-heavy operators actually lose — is covered in a companion piece on the same change. This one picks up where that left off.
For operators who want to keep agentic Claude workloads running without paying API list prices on every token, multi-account rotation is the obvious answer. The Kalevala teaches that two things may look the same and be radically different in their origins. So with the two architectures for "multi-account Claude." From the outside they yield the same outcome — more requests than one subscription allows. From the vendor's perspective, one is acknowledged and one is banned in waves.
This piece names the daemon. Choosing the wrong architecture is how you end up in Tuonela.
Architecture A — the relay-server pattern
The canonical open-source implementation is
Wei-Shaw/claude-relay-service
— MIT-licensed, around 11,700 stars at time of writing, Node.js plus Redis, Docker-deployable. The README describes the shape directly:
Many Claude OAuth subscription accounts are authorized through a flow and stored server-side.
The relay exposes an Anthropic-compatible API endpoint to client tools.
Incoming requests are load-balanced across the stored OAuth tokens with automatic rotation.
Usage accounting is per-API-key (the relay issues its own keys to its own clients).
Multi-tenant, with cost analytics.
A second family of tools in the same category includes
router-for-me/CLIProxyAPI
, which wraps several CLI agents as an OpenAI/Gemini/Claude-compatible API service, and
ben-vargas/ai-cli-proxy-api
, a CLIProxyAPI fork explicitly supporting ChatGPT Plus/Pro and Claude Pro/Max subscriptions inside other tools. Beyond the FOSS layer, commercial pooled services run on the same architecture: PackyCode, AnyRouter, pincc.ai, LongCat, and roughly thirty more relay stations catalogued in
mn-api/awesome-ai-proxy
.
The pattern is:
one server, many tokens, one endpoint that pretends to be the official client.
The last clause is the load-bearing one.
Architecture B — the per-profile rotation pattern
Anthropic itself, in
GitHub issue anthropics/claude-code#261
, closed-as-completed on March 5, 2025, acknowledged the workaround:
```
# Each profile dir is its own isolated credential store
mkdir ~/.claude-account1 ~/.claude-account2

# Aliases for shell use
alias claude-work="CLAUDE_CONFIG_DIR=~/.claude-account1 claude"
alias claude-personal="CLAUDE_CONFIG_DIR=~/.claude-account2 claude"

# Each profile authenticates separately via /login
CLAUDE_CONFIG_DIR=~/.claude-account1 claude   # OAuth login
CLAUDE_CONFIG_DIR=~/.claude-account2 claude   # different OAuth login
```
Enter fullscreen mode
Exit fullscreen mode
`CLAUDE_CONFIG_DIR`
is documented in Anthropic's own
environment variables reference
and acknowledged in the closed-as-completed issue. Each directory is a fully isolated "profile" containing its own
`.credentials.json`
, history, settings, and session state. Every invocation of
`claude`
is the
official client
— the binary downloaded from Anthropic — running against one profile. There is no relay. No impersonation. No server holding tokens.
If multiple profiles need orchestration, a small router layer on top handles three jobs: per-profile token-state classification, eligible-profile selection, and graceful failover when a profile trips rate-limit or auth-failure output. Implementation flavors vary — shell aliases at the smallest scale, scripted wrappers at larger scale — but the architecture is the point, not the language.
That is the entire approach.
What Anthropic Sees, in Each Case
This is the part that matters.
Architecture A — relay-server pattern.
From Anthropic's perspective, the relay is a server that is
not
the official client, making API calls
as if
it were the official client. The relay holds many OAuth tokens it did not authorize. The traffic pattern — same source endpoint, many tokens, high volume per token — is exactly what their detection systems are tuned for. Token-scope binding, telemetry gates that the official client emits and the relay cannot perfectly replicate, fingerprinting that extends beyond cookies. The April 2026
OpenClaw ban
(1,099 HN points) targeted this pattern directly. The June 15 metered Agent SDK credit is, in part, the legitimate replacement Anthropic is offering. Small operators with 2–3 pooled accounts still slip through because the volume heuristic does not flag them; operators with 100+ accounts ship in ban waves.
Architecture B — per-profile rotation.
From Anthropic's perspective, this is N separate official-client installations. Each one authenticated through the official OAuth flow. Each one running the binary Anthropic ships, sending the telemetry Anthropic expects, identifying as the client Anthropic supports. The traffic pattern is N separate users, not one impersonator. The detection systems have no signal to flag. The GitHub issue acknowledging the pattern is closed-as-completed.
The architectural difference is whether
you
or
the official client
is talking to Anthropic. Architecture A puts a proxy in the middle. Architecture B does not.
The Chinese Gray Market Is the Volume Case for Architecture A
The reason Architecture A exists at scale, with 11.7k stars on the canonical implementation, is the Chinese reseller market. ChinaTalk's
reporting
documents transfer stations selling Claude access at
1 RMB per $1 of tokens
— 70 to 90 percent below list price. Some sell at 5 to 10 percent. Resellers package the relay-server pattern with three revenue legs:
Bulk-account-registration sourcing
— educational discounts harvested, accounts created at industrial scale.
Silent model substitution
— a request for Opus quietly routed to Sonnet or Haiku, or to a non-Claude competitor. End-users cannot easily tell.
Log harvesting
— prompts, outputs, and reasoning chains sold as training data to other AI labs.
These three legs make the relay pattern profitable enough to keep getting rebuilt after each ban wave. They are also why, outside that resale market, the architecture should be approached with significant caution. The relay pattern exists
because of
the resale economics. Deployed for an internal workload without those economics, you get the ToS exposure without the unit economics that justify it.
Anthropic's countermeasures, all documented in 2025–2026: geoblocking, phone verification, credit card with matching billing address, ban on entities more than 50% Chinese-owned (Sept 2025), live biometric KYC (April 2026). The cat-and-mouse continues. The relays adapt; Anthropic adapts back. The arms race is real.
The resellers are not engaged in software piracy in the legal sense — the model is rate arbitrage, not copyright violation. But they are running a business that depends on Anthropic not knowing they exist. That is the architecture you would be deploying, in miniature, if you ran the relay pattern internally.
What This Means On June 15
Three honest scenarios:
If your
`claude -p`
workload is bounded enough that one Max 20x subscription's $200 Agent SDK credit will cover it:
you do not need any of this. Enable extra usage in the account dashboard, set a hard monthly cap, move on. Default extra-usage state is off, so an unattended pipeline that hits the credit limit will fail closed rather than overspend.
If the workload exceeds one account's credit, and the operation accommodates distributing across multiple subscriptions at $200 each:
Architecture B is the legitimate path. The friction is real but small — Anthropic deliberately requires an interactive
`/login`
for each profile, which means a person has to be in front of a terminal when each subscription authenticates. The friction is the feature; it is exactly what prevents the relay pattern from scaling to thousands of pooled accounts. The cost is N × $200 of API-list-priced credit, and effectively zero ban-wave risk.
If your math only works at Architecture A pricing:
do the unit economics on the relay pattern at 1 RMB per $1, and ask whether your business plan depends on Anthropic not catching you. If yes, this is not an architecture problem. If no, Architecture B and a smaller workload are the answer.
There is a fourth path operators often overlook:
cut the per-task token burn.
Agentic systems routinely load tens of thousands of tokens of scaffolding before useful work begins — system prompts, mandatory pre-flight reads, role context, instruction sets. A meaningful share of that is recoverable with prompt-cache discipline and per-task context pruning. That arithmetic is cheaper to do than scaling accounts horizontally, and it survives the next pricing change too. First the origin; then the cure.
The Architecture Choice in One Paragraph
If you have a problem an additional server in your stack will solve, add the server. If you have a problem that adding a server
creates
, do not add the server. The relay-server pattern adds a server that creates the problem of impersonating the official client. The per-profile rotation pattern adds no server; it composes what Anthropic already supports. The names of the architectures differ by one indirection. The legal and operational standings differ by everything.
Steadfast I remain. Speak the facts.
Create template
Templates let you quickly answer FAQs or store snippets for re-use.
Submit
Preview
Dismiss
Collapse
Expand
Chris Worthen
Chris Worthen
Chris Worthen
Follow
Joined
Jul 12, 2026
•
Jul 14
Dropdown menu
Copy link
Hide
Similar to Power Claude by Neural-llm.com
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
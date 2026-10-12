---
title: Anthropic puts Claude agents on a meter across its subscriptions | InfoWorld
id: anthropic-puts-claude-agents-on-a-meter-across-its-subscriptions-infoworld
tags:
- ai-software-factory-architecture-58e4cc
- locus-consumer-subscription-automation-policy-risk
- anthropic-policy
- metering-change
created: '2026-10-12T08:41:44.811727Z'
updated: '2026-10-12T08:42:46.965092Z'
source: https://www.infoworld.com/article/4171274/anthropic-puts-claude-agents-on-a-meter-across-its-subscriptions.html
source_domain: www.infoworld.com
fetched_at: '2026-10-12T08:41:44.806853Z'
fetch_provider: builtin
status: draft
type: note
tier: unknown
content_type: unknown
deprecated: false
summary: 'InfoWorld news piece (May 14, 2026) reporting Anthropic will separate programmatic
  Claude usage from standard chat subscription limits starting June 15, introducing
  ''a dedicated monthly credit system, billed at API-style rates, for tools including
  its Agent SDK, GitHub Actions, and third-party frameworks such as OpenClaw.'' Monthly
  programmatic credit mirrors subscription price: Pro gets 0, Max 5x gets 00, Max
  20x gets 00. Notes an earlier April 2026 policy change (announced via X post) stating
  Claude subscriptions would ''no longer cover usage on third-party tools like OpenClaw,''
  citing compute capacity restraints. Prior to that, ''programmatic workloads and
  interactive Claude usage drew from the same subscription pool,'' making subscriptions
  attractive for autonomous agents, scripts, CI pipelines. Quotes developer pushback
  (Yadesh Salvi, Advait Patel) warning the credit pool ''won''t even last a day of
  serious work'' for heavy users of ''Claude Agent SDK and claude -p,'' and analyst
  commentary (Sanchit Vir Gogia, Greyhound Research) framing this as an industry-wide
  shift toward metered agentic-AI pricing (citing OpenAI''s existing API/ChatGPT Plus
  split and GitHub Copilot''s shift to credits).'
---

Anthropic puts Claude agents on a meter across its subscriptions | InfoWorld
Topics
Close
Analytics
Artificial Intelligence
Careers
Cloud Computing
Contributor Content
Data Management
Databases
Development Tools
Devops
Emerging Technology
Enterprise Buyer’s Guides
Generative AI
IT Leadership
Java
JavaScript
Microsoft .NET
Open Source
Programming Languages
Python
Security
Software Development
Technology Industry
by
Anirban Ghoshal
Senior Writer
Anthropic puts Claude agents on a meter across its subscriptions
news
May 14, 2026
6 mins
The era of “all-you-can-eat” AI coding and agent subscriptions may well be ending. Beginning June 15, Anthropic will separate programmatic Claude usage from standard chat subscription limits, introducing a dedicated monthly credit system, billed at API-style rates, for tools including its Agent SDK, GitHub Actions, and third-party frameworks such as OpenClaw, the company wrote in a
blog post
.
The monthly credit for programmatic usage will depend on a user’s existing Claude subscription tier and generally mirror its monthly price, with Pro users receiving $20 in credits, Max 5x users $100, and Max 20x users $200.
In April, Anthropic had announced via a
post on X
that Claude
subscriptions would “no longer cover usage on third-party tools like OpenClaw”,
citing compute capacity restraints, and effectively forcing developers using external agent frameworks either to purchase additional usage bundles or switch to direct API access.
Before that change, programmatic workloads and interactive Claude usage drew from the same subscription pool, allowing developers to use higher-tier Claude plans not only for chat and coding assistance, but also for autonomous agents, scripts,
CI
pipelines, and other automated workflows.
That arrangement had made Claude subscriptions particularly attractive to developers running long-lived agent tasks, as usage through tools such as
OpenClaw
or the Agent SDK was effectively covered under the broader subscription limits rather than being billed separately at API rates.
Could complicate enterprise budgeting
Unsurprisingly, the new policy, set to kick in next month, has triggered concerns among developers, many of whom argue that the move undermines one of Claude’s biggest advantages for agentic workflows: the ability to run large-scale automations under comparatively predictable subscription pricing.
“The monthly limit you are providing won’t even last a day of serious work. You are just reducing/removing the usage of some of the most used features like Claude Agent SDK and claude -p [in Claude Code] and calling it a perk,” senior data scientist
Yadesh Salvi
, wrote in a
post on X
.
Advait Patel
, a senior site reliability engineer at Broadcom, echoed Salvi’s concerns: “For developers who built side projects and personal automations on top of a flat Pro or Max plan, this is a real shift.”
“A dedicated credit pool gives you a small free runway for experimentation, but the moment your agents become useful enough to run often, you are on metered billing whether you like it or not,” Patel added.
He said that developers may need to stop viewing AI subscriptions as a low-cost route to running production-grade agentic workloads, as vendors increasingly shift toward consumption-based pricing models in response to the rising cost of automation-heavy AI usage.
“Heavy agentic users were consuming far more compute than a $20 or $100 subscription could support. Running these models is genuinely expensive, and unlimited flat rate plans for programmatic use were never going to last,” Patel said.
He feels that the new policy will introduce new operational and budgeting challenges for developers and teams who were relying on Claude subscriptions to run unattended workflows such as CI pipelines, scheduled automations, and long-running coding agents.
“Because usage is now tied more directly to token consumption than subscription tiers, enterprises may find it harder to forecast costs for workloads involving retries, large context windows, or multi-step agent loops,” Patel said.
“Also, credits are per user and do not pool, so you cannot share a budget across a team. That makes shared automations awkward,” he added. “Similarly, a runaway agent or a bad prompt can burn through credit fast and then either stop your pipeline or quietly start garnering extra usage.”
Treat agents like cloud infrastructure
In fact, the senior engineer feels that developers and enterprises soon have to start treating programmatic AI usage less like a bundled software subscription and more like a metered cloud service with its own operational and financial controls: “Treat your Claude usage the same way you treat AWS or GCP. Know your token cost per workflow, set hard budget alerts.”
Paul Chada
, co-founder of agentic AI startup Doozer AI, also advised developers to start focusing more aggressively on efficiency and cost discipline when designing AI agents and automation workflows, given the new policy.
“Stop optimizing for the subsidy and start optimizing for the token. Treat prompt caching, context discipline, and model selection as first-class engineering. The developers who thrive in the metered era are the ones who’d have built efficient agents anyway; the subsidy was just hiding who that was,” Chada said.
For analysts such as Greyhound Research Chief Analyst
Sanchit Vir Gogia
, the new policy from Anthropic around programmatic use is less of an isolated pricing adjustment and more of a broader industry transition toward metered economics for agentic AI workloads.
OpenAI, he noted, has long relied on usage-based API pricing while reserving subscription offerings such as ChatGPT Plus primarily for interactive use cases. GitHub, meanwhile, is transitioning Copilot toward a token- and credit-based system that he said closely resembles Anthropic’s latest changes.
“Over the next 12 to 24 months, enterprises should expect more vendors to create separate consumption pools for agents, premium models, tool use, background tasks, and third party integrations. Some will call them credits. Some will call them requests. Some will call them messages. Some will call them compute units. Some will hide the meter inside bundles. The vocabulary will vary because marketing departments need hobbies. The direction will not,” Gogia said.
Artificial Intelligence
Development Tools
Software Development
by
Anirban Ghoshal
Senior Writer
Follow Anirban Ghoshal on X
Follow Anirban Ghoshal on LinkedIn
Anirban is an award-winning journalist with a passion for enterprise software, cloud computing, databases, data analytics, AI infrastructure, and generative AI. He writes for CIO, InfoWorld, Computerworld, and Network World. He won the 2024 Silver Azbee Award for Best News Article in the Technology category. He has a post-graduate diploma in journalism from the Indian Institute of Journalism and New Media. Have a tip, scoop, or insight involving AI, cloud, databases, ERP, or enterprise software? Reach him securely on Signal at Ghoshal_CloudaiSaaSscoop.99
More from this author
news
As AI agents grow, vendors carve out decision-making as a separate model layer
Oct 9, 2026
5 mins
news
AWS’ support for Iceberg materialized views on Redshift could help lower analytics costs
Oct 7, 2026
4 mins
news
Microsoft, Google back Apache Ossie to make enterprise data and AI platforms more interoperable
Oct 1, 2026
6 mins
news
Stack Overflow expands Stack Internal to give AI agents ‘trusted’ enterprise knowledge
Sep 30, 2026
6 mins
news
OpenAI pauses AI model training after another agent bypasses network restrictions
Sep 28, 2026
5 mins
news
Starfleet will fly Postgres AI apps from prototype to production, says pgEdge
Sep 28, 2026
4 mins
news
Starfleet will fly Postgres AI apps from prototype to production, says pgEdge
Sep 28, 2026
4 mins
news
Microsoft’s new Copilot unifies enterprise context for code and chat
Sep 25, 2026
7 mins
Show me more
Popular
Articles
Videos
brandpost
Two days to TechCrunch Disrupt: What’s next for AI and software development
By TechCrunch Disrupt
Oct 11, 2026
3 mins
Artificial Intelligence
Development Tools
Generative AI
feature
The best new features in Python 3.15
By Serdar Yegulalp
Oct 9, 2026
8 mins
Programming Languages
Python
Software Development
news
Lightwell project filters out 400 Java library vulnerabilities
By Maxwell Cooter
Oct 9, 2026
2 mins
Code Security
Java
Programming Languages
video
What AI really is doing to software development (and developers)
Sep 29, 2026
5 mins
Developer
video
Did OpenAI STEAL Math Researchers' Work? The AI Controversy Explained
Sep 16, 2026
6 mins
Python
video
Why Software Developers Are “Token Maxxing” AI—and What It Means for Jobs
Sep 11, 2026
7 mins
Python
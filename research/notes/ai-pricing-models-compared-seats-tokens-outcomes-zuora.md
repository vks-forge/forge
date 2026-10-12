---
title: 'AI Pricing Models Compared: Seats, Tokens, Outcomes | Zuora'
id: ai-pricing-models-compared-seats-tokens-outcomes-zuora
tags:
- ai-software-factory-architecture-58e4cc
- cost-optimization
- pricing-models
created: '2026-10-12T08:29:10.334994Z'
updated: '2026-10-12T08:34:10.591700Z'
source: https://www.zuora.com/guides/ai-pricing-models/
source_domain: www.zuora.com
fetched_at: '2026-10-12T08:29:10.332184Z'
fetch_provider: builtin
status: draft
type: note
tier: unknown
content_type: unknown
deprecated: false
summary: 'Zuora guide taxonomizing six AI SaaS pricing models directly relevant to
  Pillar 6 (subscription vs API economics): Per Seat, Per Token, Per Activity, Per
  Output, Per Outcome, and Hybrid. Key cited case: Wall Street Journal (Oct 2023)
  reported GitHub Copilot averaged a $20/user/month loss against a $10/user/month
  subscription price because heavy users'' inference cost exceeded the seat fee by
  2-3x -- the canonical example of per-seat pricing as a ''margin trap'' when usage
  scales with engagement. Per Activity examples: Salesforce Agentforce at $2/AI-handled
  conversation; Anthropic Claude API billed per call across model tiers. Per Outcome
  examples: Intercom Fin charges per resolved support ticket; Zendesk charges per
  autonomous resolution -- this model transfers cost-variance risk from buyer to seller
  and requires tight unit economics. Hybrid (subscription base + consumption overage
  or prepaid credits) is described as the dominant pattern for mature production AI
  businesses, citing Microsoft Security Copilot''s Security Compute Unit (SCU) hourly-rate-plus-overage
  model and Adobe Firefly''s prepaid credit-pack model. Introduces the COMPASS Framework
  (Scope of Work: Task/Process/Goal crossed with Level of Attribution: Diffuse/Medium/Direct)
  for choosing a pricing model, and names three common pitfalls: cost-plus thinking,
  pricing complexity creep (too many simultaneous meters), and soft-ROI positioning.'
---

AI Pricing Models Compared: Seats, Tokens, Outcomes | Zuora
Skip to content
Table of contents
TL;DR
Share guide
These models may be complex, but they're tameable with the right strategies and systems in place.
TL;DR
Six pricing models cover the AI offer space: Per Seat, Per Token, Per Activity, Per Output, Per Outcome, and Hybrid combinations. The right choice depends on the unit of value the AI delivers and how clearly that value can be measured.
Per Seat is familiar but fragile for AI-heavy products; flat-rate seats can lose money when variable inference cost rises with usage.
Per Token, Per Activity, Per Output, and Per Outcome all align price with cost or value. Each fits a different shape of AI offer.
Most production AI businesses run Hybrid models. A subscription base plus consumption overage or prepaid credits balances predictability for the buyer with margin protection for the seller. The COMPASS Framework picks the model that fits.
Why Traditional Saas Pricing Breaks For Ai
SaaS pricing assumed zero marginal cost. Once the software was built, the next customer cost roughly the same to serve as the previous one, so flat-rate subscriptions worked. AI breaks this assumption. Inference cost is variable and meaningful; every query, every agent action, every generated artifact triggers compute spend that the seller pays for. When the pricing model doesn’t track that variable cost, the margin shrinks with adoption rather than expanding. Zuora’s
full strategic AI Monetization playbook
walks through the implications. The six pricing models below cover the tactical options product leaders pick from once the strategy is set.
Per Seat Pricing
Per Seat pricing charges a fixed monthly or annual fee per user with access to the AI. The mechanic is familiar to SaaS buyers, which is why many AI products launched with Per Seat as the default in 2023 and 2024.
How it works
Each user gets a license. The license fee is constant regardless of how much the user engages the AI. Pricing is simple to communicate, simple to budget, simple to procure. For low-usage, bounded-scope AI features (e.g., a copilot used a few times per week), Per Seat can still work.
When seat-based works
Per Seat fits when three conditions hold. The agent or AI’s per-user activity is bounded and predictable. The per-user inference cost is small relative to the per-seat price. The buyer values a consistent monthly cost more than variable usage scaling. Sales-team copilots, writing assistants used occasionally, and basic search-augmentation AI products all fit this profile.
When it bankrupts you
Per Seat breaks down when the per-user variable cost rises faster than the per-seat price. The canonical case is GitHub Copilot. The
Wall Street Journal
reported in October 2023 that the Copilot business averaged a $20-per-user monthly loss against a $10-per-user-per-month subscription price. Heavy users were consuming inference compute that exceeded the seat fee by 2-3x. Microsoft has since adjusted Copilot’s pricing structure. The lesson can be generalized: when AI usage scales with user engagement, Per Seat pricing is a margin trap rather than a margin engine.
Per Token Pricing
Per Token pricing charges per unit of model input and output (typically per 1,000 tokens, or “1K tokens”). This is the canonical infrastructure-layer pricing model for foundation models. OpenAI, Anthropic, Google, and most other model providers publish per-token rates by model class.
How it works
Each customer query is metered by token consumption, both the input tokens (prompt and context) and the output tokens (model response). The token meter rolls up into the bill at the end of each period. Some providers charge different rates for input versus output tokens because output generation is more compute-intensive.
Pros and cons
The transparency cuts both ways. Engineers and infrastructure teams understand token economics and can predict bills. Non-technical buyers, like product managers, finance leaders, and line-of-business buyers, find token pricing opaque and difficult to budget for. A single complex query can consume 50–100x the tokens of a simple query, which makes per-token bills unpredictable for application-layer products built on top of foundation models.
Threshold tactics and prepaid credits
Many application-layer products that build on token-based infrastructure abstract token economics from the end buyer. Prepaid credit packs are a common move: the customer buys a credit pool, the application draws down per query, and the customer never has to think in tokens. Adobe Firefly’s credit model and Genesys’s token-credit approach both follow this pattern: token-based cost economics underneath, with a simpler unit of value at the buyer interface.
Per Activity Pricing
Per Activity pricing charges per discrete action the AI performs, like per API call, per query, per workflow run. The unit of value is the action itself, not the user with access or the token consumed.
How it works
The application meters activities (a chat conversation, a document classification, a record lookup, a workflow execution) and charges the customer per activity. Pricing is straightforward to communicate because the activity unit maps to something the buyer cares about.
Examples
Salesforce Agentforce launched at $2 per AI-handled conversation, with the per-conversation unit aligning roughly with the variable cost Salesforce incurs to handle each one. Anthropic’s Claude API charges per API call across different model tiers. The shared logic across Per Activity examples is the same: the activity unit maps to a discrete, observable action the buyer can count, and the price per unit roughly tracks the seller’s marginal cost to perform it. Learn more about
agentic AI pricing
and the Per Activity model in deeper detail.
Per Output Pricing
Per Output pricing charges per generated artifact. The unit of value is the artifact itself, which includes things like an image, a document, a contract, a demand letter, or an analysis report.
How it works
The customer pays each time the AI produces an output. Pricing communicates clearly when the artifact is the deliverable the customer is buying. Adobe Firefly charges generative credits per image, video, or 3D asset. EvenUp charges per drafted demand letter. The credit-pack abstraction (one credit = one output) keeps the pricing legible while letting the seller price different outputs at different credit costs.
When the output is the outcome
Per Output works cleanly when the artifact itself is what the customer wants. It works less cleanly when the artifact is one step in a longer workflow. In those cases, Per Outcome (charging for the workflow’s result) tends to fit better.
Per Outcome Pricing
Per Outcome pricing charges only when the AI delivers a defined business result. The unit of value is the outcome: a resolved ticket, a closed deal, a qualified lead, or a saved hour.
How it works
The customer pays per outcome rather than per access, per token, or per activity. Intercom Fin charges per resolved support ticket. Zendesk charges per autonomous resolution. The buyer’s bill maps directly to the value received.
Risk transfer mechanics
Per Outcome transfers cost variance from the buyer to the seller. If the AI consumes more compute than the outcome’s price covers for a specific customer, the seller absorbs the gap. Per Outcome works when the seller has high confidence in its own unit economics and the outcome is unambiguously measurable. The
agentic AI pricing deep dive
covers outcome-pricing mechanics for autonomous AI specifically.
When you can absorb cost variance
Three conditions tend to hold for Per Outcome to be commercially viable. One, the seller can predict the average cost-per-outcome within a tight band. Two, the outcome is auditable, so disputes can be resolved. Or three, the seller has cash flow tolerance for high-variance contracts. When any of the three conditions doesn’t hold, Hybrid models become the safer choice.
Hybrid Models — Often the Most Practical Option
Hybrid pricing combines a subscription base with a consumption or outcome-based variable component. This is a common pattern in mature production AI businesses because it balances buyer predictability with seller margin protection.
Subscription base plus consumption overage
A monthly subscription buys a fixed activity, token, or outcome allowance. Usage beyond the allowance bills at a per-unit overage rate. The base covers the seller’s fixed costs and gives the buyer predictable budgeting. The overage protects the margin when high-usage customers exceed the allowance.
Microsoft Security Copilot
uses this pattern: customers provision Security Compute Units (SCUs) at an hourly rate, with usage above the provisioned capacity billed on consumption. The base SCU commitment covers Microsoft’s fixed infrastructure for the workload, and the overage protects the margin when high-volume customers exceed their provisioned capacity.
Prepaid credits plus drawdown
Customers buy credit packs upfront that draw down per agent action, per output, or per outcome. Prepaid credits give the seller working capital and give the buyer the option to scale usage without renegotiating the contract.
Adobe Firefly
, Genesys, and an increasing share of agentic AI businesses use this model.
Tiered with thresholds
Three or four named tiers each include an allowance of activities, tokens, outputs, or outcomes. The customer moves up tiers as usage grows. Tiered pricing combines the predictability of Per Seat (fixed monthly cost) with the cost-tracking of Per Activity (allowances scale with usage). Mansard’s research on packaging shows
Good-Better-Best as the dominant packaging pattern at 57%
of analyzed companies.
The COMPASS Framework — How to Choose
Six pricing models are more than most product leaders want to evaluate from scratch. Mansard’s
COMPASS Framework
, published at the Zuora Subscribed Institute, gives product and finance teams a shared decision tool. The framework maps two questions about the AI offer to a recommended pricing model.
Question 1: What is your AI’s job?
Scope of Work (Task / Process / Goal):
Task scope.
The AI does one discrete action: answer, classify, summarize. Per Activity or Per Token tends to fit.
Process scope.
The AI runs a multi-step workflow: triage, qualify, route. Per Activity, Per Output, or Hybrid fit, depending on what the buyer values most.
Goal scope.
The AI owns an outcome: resolve, close, complete. Per Outcome aligns most naturally.
Question 2: How clearly can you prove it worked?
Level of Attribution (Diffuse / Medium / Direct):
Diffuse attribution.
The AI contributes to an outcome influenced by many factors. Per Seat or Per Activity fits because the specific contribution is hard to isolate.
Medium attribution.
The AI measurably moves the outcome but doesn’t fully own it. Hybrid fits, a base recognizes the contribution, and a variable component rewards measurable lift.
Direct attribution.
The AI owns the outcome, and the outcome is unambiguously measurable. Per Outcome fits cleanly.
The Matrix  (recommended model)
Cross the two axes, and the recommended pricing model emerges. Task and Diffuse generally points to Per Seat or Per Activity. Goal and Direct points to Per Outcome. Process and Medium generally point to Hybrid. The full nine-cell matrix with worked examples lives in the
COMPASS Subscribed post
. The deeper framework discussion for autonomous AI specifically sits in
pricing agentic AI
.
Common Pricing Pitfalls
Cost-plus thinking.
Pricing as a markup over inference cost ties the seller’s revenue to the buyer’s compute consumption rather than to the buyer’s outcomes. It also exposes the cost mechanism, capping willingness-to-pay at the underlying token economics. Cost-plus is a fallback pricing model, not a strategic one.
Pricing complexity creep.
Splitting an AI offer across tokens, seats, activities, outputs, and outcomes simultaneously creates a bill that nobody can predict. Procurement pushes back. Renewals stall. A single dominant unit of value with a secondary modifier (base subscription + activity overage, for example) almost always beats a bill with five concurrent meters.
Soft ROI positioning.
“Save time” and “boost productivity” are weak commercial anchors because the buyer can’t tell you what the AI is worth. Per Outcome works because the dollar value is named. Per Activity works because the activity is countable. The pricing model and the value proposition need to point at the same unit.
Choose, Test, Evolve
Three sequenced moves separate the product leaders who price AI well from the ones who don’t.
Pick the model that fits the unit of value.
Use the COMPASS matrix to map the AI’s scope of work against its attribution clarity, then pick the model that the intersection points at. Don’t pick a model first and justify it second.
Pilot Hybrid before committing.
Run the chosen model with a subscription base and a small consumption or outcome component for one product line, one customer cohort, and two billing cycles. Measure margin per unit and customer reaction.
Iterate quarterly.
AI cost curves move quickly. The pricing model that’s right at launch may not be right six months later. Build the operating stack to support pricing changes without engineering projects each time.
For the strategic framing — avenue, packaging, and the operating stack underneath — the
AI monetization strategy
guide is your next step, or download the
AWS / PwC / Zuora
AI Pricing Pivot
whitepaper
. For teams evaluating the operating stack that supports multi-model pricing under variable inference cost, the
Zuora Billing demo
is the place to start.
Frequently Asked Questions
1.
                                What are the main AI pricing models?
Six models cover the AI offer space. Per Seat charges per user with access. Per Token charges per unit of model input and output. Per Activity charges per discrete AI action (call, query, workflow run). Per Output charges per generated artifact. Per Outcome charges per business result delivered. Hybrid models combine a subscription base with a consumption or outcome-based variable component. Most production AI businesses run Hybrid combinations.
2.
                                What is token-based pricing for AI?
Token-based pricing charges per unit of model input and output, typically per 1,000 tokens. Foundation-model providers like OpenAI, Anthropic, and Google publish per-token rates by model class. Input tokens (prompt and context) are usually priced separately from output tokens (generated response) because output generation is more compute-intensive. Token pricing is transparent for engineering teams but opaque for non-technical buyers, which is why application-layer products often abstract token costs behind credit-pack or per-activity pricing.
3.
                                What is outcome-based pricing in AI?
Outcome-based pricing charges only when the AI delivers a defined business result such as a resolved support ticket, a closed deal, or a qualified lead. The buyer pays for results rather than access. Intercom Fin charges per resolved ticket. Zendesk charges per autonomous resolution. The model transfers cost variance from the buyer to the seller, so it only works when the seller has tight unit economics, and the outcome is unambiguously measurable.
4.
                                Is token pricing better than seat pricing for AI?
It depends on the AI offer. Token pricing aligns cost with usage but exposes token economics to the buyer, which can be confusing for non-technical purchasers. Seat pricing is simple to communicate but breaks when per-user usage scales faster than the seat fee — the GitHub Copilot $20-per-user monthly loss is the canonical example. For AI products with heavy variable usage, token-based or activity-based pricing typically protects margin better than per-seat. For lightweight copilots used a few times per week, per-seat can still work.
5.
                                What is hybrid AI pricing?
Hybrid pricing combines a fixed subscription base with a variable consumption or outcome-based component. A common form is a monthly subscription that includes an allowance of activities, tokens, outputs, or outcomes, with overage billed at a per-unit rate beyond the allowance. Another form is prepaid credit packs, drawing down per AI action. Hybrid is a common pattern in mature production AI businesses because it balances buyer predictability with seller margin protection.
6.
                                How do you choose an AI pricing model?
The COMPASS Framework gives a structured answer. Map the AI on two axes: Scope of Work (Task, Process, or Goal) and Level of Attribution (Diffuse, Medium, or Direct). Task + Diffuse generally points to Per Seat or Per Activity. Goal + Direct points to Per Outcome. Process + Medium points to Hybrid. The intersection of the two axes points to the pricing model that fits. Stress-test the chosen model against the Impossible Triangle — every pricing decision trades among Cost-to-Serve, Customer Adoption, and Value Delivered, and pretending all three can be optimized simultaneously is a common mistake.
7.
                                What's the cheapest AI pricing model?
For the buyer, the cheapest model depends on the usage profile. A heavy AI user is cheapest on Per Seat (where cost is bounded by the flat fee). A light AI user is cheapest on Per Activity, Per Token, or Per Outcome (where cost scales with usage). For the seller, the cheapest model to operate is the one that aligns most cleanly with the cost structure, Per Token for infrastructure-layer products, Per Activity for high-volume agentic products, Hybrid for mixed-use AI applications.
8.
                                How do you price AI agents?
Map the agent on the COMPASS Framework. Task-scope agents with Diffuse attribution generally fit Per Seat or Per Activity. Goal-scope agents with Direct attribution fit Per Outcome. Process-scope agents with Medium attribution fit Hybrid. The deeper agentic-AI-pricing walkthrough sits in the
pricing agentic AI guide
. The cluster-level strategic framing — avenue, packaging, operating stack — is in the
AI monetization strategy
.
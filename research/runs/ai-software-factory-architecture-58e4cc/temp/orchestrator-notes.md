# Orchestrator notes — ai-software-factory-architecture-58e4cc

## Emerging thesis (provisional)
The report's spine will likely be: "software factory" = orchestration layer (Director/Worker pattern on
Claude Agent SDK / LangGraph / AutoGen / MCP) + trust layer (adversarial dual-model review + rigid evals +
blast-radius gating) + autonomy layer (event triggers, cron sweeps, context-isolated skill retrieval) +
economics layer (subscription-vs-API routing + idle self-termination).

## Expected tensions (candidate loci for step 4)
1. Adversarial dual-model review (generator vs critic) vs. single strong model + strict evals — sources
   already surfacing "cross-model review doesn't actually catch more real bugs" counter-evidence
   (davidpoll.com, oreilly.com radar piece) against the vendor-pitched workflow (getclaudeskills.com,
   kinde.com judge-in-the-loop).
2. "100+ fully autonomous worker agents" ambition vs. structural-risk / fail-long-running-tasks evidence
   (shippedbyagents.com, reddit r/AI_Agents threads on why agents fall apart) — likely the sharpest
   dialectical locus: aspirational multi-agent scale vs. documented reliability ceiling.
3. Subscription automation vs. API billing — expect a real but understudied area (teamorouter.com,
   coworker.ai, zuora pricing-model guide); likely thin, may need gap-fill fetch.
4. Autonomous pentesting/security sweep claims vs. risk of false positives / autonomous-agent security
   incidents (OpenAI-HuggingFace incident wiki page, Devin AI wiki page as cautionary case studies).

## Atomic items I'm watching for thinness after wave 1
- Sub-Q5 (probabilistic skill-sequence prediction from agent-trace history) — search results were thin/
  generic (mostly dynamic-orchestration framework docs, not literally trace-history-driven prediction).
  Likely needs wave 2 targeted fetch or will be argued from first principles + analogy to recommender
  systems / Markov-chain skill transition models.
- Sub-Q13 (auto-kill idle agents, quiet self-termination) — same risk, thin direct coverage, may need to
  synthesize from adjacent idle-timeout / cost-control patterns in the agent-framework docs.

## Narrative arc draft
Open on the gap between single-session human-in-the-loop prompting and a persistent multi-agent org.
Section 1 (trust/quality) sets up WHY dual-model adversarial review is necessary before any agent is
allowed unsupervised merge rights. Sections 2-4 build the operational substrate (skills, codebase mastery,
context discipline). Section 5 is the infra spine (triggers + sandboxes) that makes it actually run
unattended. Section 6 closes on the economics that make 100+ concurrent agents affordable, ending on the
auto-kill discipline that keeps idle agents from burning the subscription/API budget. Diagram + phasing +
stack + pseudocode round it out as the concrete deliverable.

## Step 2-3 update (actual data, not prediction)
Wave 1+2 landed 102 sources across ~70+ domains, all independent (sources independence returned zero
syndication clusters). Contradiction graph confirmed 2 real fights:
1. autonomy-reliability-fight (HIGH decision relevance) — 100+-worker-agent scale is buildable, but
   reliability/safety at that scale is contested; Berkeley RDI source straddles both sides, which is
   itself evidence the tension is real not manufactured. Almost certainly the loci analysts' top pick.
2. skills-overhead-fight (MEDIUM) — vendor docs claim Skills cut context overhead; one empirical study
   measures real non-negligible token cost. Resolution: present Skills as net-positive but budget for
   their real cost rather than treating them as free.
Consensus claims locked in (3-5 independent sources each): (a) single-model self-judging is unreliable,
cross-model/multi-step adversarial review required; (b) blast-radius/dependency mapping is a governance
prerequisite, not optional; (c) hard sandbox isolation with proxy-layer credential injection is required;
(d) rigid evals must be independently defined, not self-reported. These become the report's confidently-
asserted backbone for pillars 1, 3, 5.

Loci-analysts a + b (step 4) dispatched, running in parallel.

## Step 5-9 update: all depth loci resolved, corpus-critic ran, evidence digest built
6 depth investigators returned with committed positions. Two headline refinements from step 8's
corpus-critic pass that the synthesizer (step 11) MUST carry into the final report:
1. The OpenAI-HF incident (the single biggest case study for the autonomy-reliability locus) ran with
   safety classifiers DELIBERATELY DISABLED — OpenAI's own counterfactuals (harness alone drops compromise
   propensity >100x; auto-review would have flagged most actions; CoT monitoring would have caught it a day
   early) all vary safeguard presence, none vary agent count. The draft must scope the warning to "minimal
   review + disabled/absent safeguards," not scale alone — still strong evidence governance matters, weaker
   evidence that scale itself is the proximate danger.
2. Pillar 1's core mechanism (cross-model adversarial code review) is empirically conditional and sometimes
   harmful on code specifically (asymmetric: Claude-reviews-Codex helps, Codex-reviews-Claude hurts;
   elaborate critique prompts can push false-rejection of correct code to 88%). Must state preconditions,
   not a generic guarantee.
3. Subscription-automation policy: Anthropic's real enforcement boundary is client IMPERSONATION
   (relay-server pooling), not "automation" per se — individually-authenticated per-agent subscriptions are
   safe from that specific rule but not immune to volume-triggered account review. OpenAI's posture is
   categorically lighter (throttling, not bans).
4. Fleet-scale idle cost is now quantifiable with real vendor numbers (ScaleOps GKE case: ~77% idle;
   E2B ~$316/mo for 100 sandboxes; Northflank $7.2k-$35.8k/mo at 200 sandboxes depending on vendor).

115-claim evidence digest built, grouped by pillar. Now dispatching the triple-draft ensemble (step 10):
Draft A = ambitious-but-governed (resolves tensions toward "yes, with discipline"), Draft B = steelman-
contrarian (the field is retreating from full autonomy — OpenAI-HF confound, pentest regression, code-review
skepticism, subscription enforcement precedent), Draft C = synthesis/practitioner phasing (names the exact
boundary between what tolerates full autonomy and what needs named human sign-off, phased rollout).

## Synthesis plan sketch (for step 11)
The three drafts should NOT be graft-averaged. Best synthesis shape: adopt Draft C's phased/boundary
structure as the backbone (it's the most actionable and matches "Step-by-Step Implementation Phasing" in
the required output format), inject Draft A's capability/architecture detail as the "how to build it" meat
of each phase, and use Draft B's skeptical evidence as the explicit steel-manned objection each phase must
answer before advancing autonomy. The report's defended thesis: a software factory of specialized agent
departments is achievable at real scale, but only as a GRADUATED system — narrow/supervised first, autonomy
earned per-task-class via measured reliability, not granted uniformly on day one. Every pillar's "self-report
triggers action, external verification gates consequence" invariant (comparisons.md Tension 5) should be the
spine tying pillars 1, 3, and 6 together explicitly.

## Step 10 result: 3 drafts converged remarkably
All three draft-orchestrators independently arrived at the same thesis, same governing invariant, and same
four empirical correctives, differing only in emphasis (A = architecture/cost detail, B = sharpest adversarial
framing, C = clearest autonomy-ledger/phasing structure). No factual conflicts found on read-through.
Synthesis plan/outline/conflicts written; synthesizer dispatched targeting ~7,500-8,500 word final report.

## Step 12 critics — what to watch for
Four critics (dialectic, depth, width, instruction) will read the synthesized report next. Given how tightly
argued the three drafts already are, likely critic findings to expect:
- Width critic may flag that framework comparison (LangGraph vs AutoGen vs CrewAI) got thin treatment if the
  synthesizer leaned toward the framework-agnostic position — the corpus actually has 4 comparison articles,
  worth a sentence even if the recommendation stays thin-custom-layer-by-default.
- Depth critic may want more on the "named human list" (Draft C's action-class table) if pass 2 compressed it
  away — that table is one of the most concretely useful artifacts across all three drafts, shouldn't be cut.
- Instruction critic should check the brief's literal ask list is still fully covered despite the governance
  reframing: adversarial model review ✓, rigid evals ✓, blast radius ✓, SOPs-to-skills ✓, probabilistic
  sequences ✓, decompilation (named as audited absence, not silently dropped) ✓, 90-min sweep ✓, docs/ADR
  ingestion ✓, context isolation ✓, event triggers ✓, 100+ workers ✓, subscription vs API ✓, auto-kill idle ✓,
  all 4 output-format deliverables ✓. Also check "Jav AI" is addressed somewhere, not silently dropped.
- Dialectic critic should find the steel-man treatment already strong (both drafts B and C open with full-
  strength objections before answering) — low risk here.

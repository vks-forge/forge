---
title: Interim report — agent-skills-context-overhead-magnitude
id: interim-report-agent-skills-context-overhead-magnitude
tags:
- ai-software-factory-architecture-58e4cc
- locus-agent-skills-context-overhead-magnitude
created: '2026-10-12T08:43:44.200325Z'
status: draft
type: interim
deprecated: false
summary: Vendor docs claim progressive disclosure keeps overhead negligible but give
  no measured numbers; the corpus's one empirical study (arXiv 2610.04832) finds a
  triggered Skill carries 37-57% more tokens per agent episode (50% avg, incl. Claude
  Sonnet 4.5) with ~20% of directives adding tokens for zero measured gain -- cost
  model should budget ~1.3-1.6x per-episode multiplier plus a pruning audit, not treat
  overhead as negligible.
---

# Interim report: agent-skills-context-overhead-magnitude

**Locus question:** Do Agent Skills with progressive disclosure reduce context overhead and token spend as vendor docs claim, or does the corpus's one empirical study show real, budget-relevant overhead that complicates the cost-optimization pillar?
**Flavor:** dialectical

## What the corpus already said

Two vendor-side sources in the corpus describe progressive disclosure as an architectural efficiency mechanism, but notably do not quantify its savings. [[agent-skills-claude-platform-docs]] (Anthropic's platform docs) specifies the three levels concretely: Level 1 metadata (YAML `name`+`description`) is "~100 tokens/skill, always loaded at startup into system prompt"; Level 2 (the SKILL.md body) is "under 5k tokens, loaded only when triggered"; Level 3 (bundled scripts/references) is "zero cost until accessed." [[equipping-agents-for-the-real-world-with-agent-skills-anthropic]], Anthropic's original Oct 2025 engineering post, frames the same three-level model qualitatively ("it provides just enough information... without loading all of it into context") but contains **no token-overhead or cost numbers at all** — I searched the full body for "token," "efficien," "context window," "overhead," and "cost" and found zero matches outside the architecture description. The vendor case for "negligible overhead" is an architectural design claim, not a measured one.

The one empirical study in the corpus, [[agent-skill-evolution-how-revisions-affect-coding-agents]] (arXiv:2610.04832, Wang et al., Oct 2026), is the corpus's only source that puts numbers on this question, and its RQ3 is built for exactly this locus.

## What the new sources say

I did not need new fetches: the empirical study note already contains the full RQ3 cost analysis at sufficient depth to resolve the magnitude question, and the vendor docs/blog notes were already read in full for their absence of quantification (documented above). This conserves the 5-source budget; see Open Questions for what a follow-up fetch would target.

## Evidence synthesis

The study separates two distinct costs that the vendor framing collapses into one "progressive disclosure is efficient" narrative, and this separation is the crux of the dialectic.

**Marginal cost of a *revision*** (new Skill body vs. old Skill body, once a Skill is already being loaded): in single-step answers this adds +17% tokens on 16 open models and +24–27% on the four Claude models (Table 6/7). But inside a full agent episode, the longer prompt is offset by fewer subsequent turns, so the detectable marginal cost of a revision on episode-level tokens is **−2.3% to +3.0%, every CI spanning zero** (§6.2.1) — i.e., no detectable cost. This is the number closest to the vendor's implicit claim ("revisions/growth barely matter"), and here the vendor framing holds up reasonably well.

**Carrying cost of a Skill body at all** (old version vs. "none" — just the name+description): this is the number that matters for whether progressive disclosure actually keeps overhead negligible once a skill is *triggered*, which is the only case that matters operationally (a dormant, untriggered skill costs ~100 tokens as the vendor docs state and nobody disputes that). The study measures: "The old version costs 37 to 57% more tokens per episode than none (50% on average over the four agents). The body is re-sent on every turn... but their episodes still use more tokens" (§6.2.2, Table 7). This 50%-average episode-token tax is measured across Qwen 3.5-9B, Qwen 3.5-27B, Devstral-Small, and **Claude Sonnet 4.5** — i.e., it is directly relevant to a Claude-Code-based software factory, not just an open-model artifact.

A second load-bearing number: "In 20% [of rule-model pairs], the prompt grows but we detect no change in compliance... we call these overhead candidates" (§6.1.2, repository-clustered 95% CI 16.1–24.2%). Of the Skills flagged as overhead by at least half the tested models, 27 were "already followed" (the rule added nothing the model wasn't already doing) and 28 were "ineffective" (ignored whether present or not). This is a direct empirical finding of dead-weight token spend inside Skills as currently written in the wild — roughly a fifth of concrete rule-additions pay tokens for zero measured behavior change.

The paper's own related-work section corroborates the "material overhead" reading from outside its own dataset: Dong et al. 2026 "attribute agent failures to specific loaded Skills... and trace most context-overhead failures to mandatory Skill-body text"; Gloaguen et al. 2026 "found that context files do not generally raise task success but add over 20% inference cost"; Ben Sghaier et al. 2026 "held the model fixed across 35 harness releases and found that tokens per task rose by over 70% with no significant gain in resolve rate." Three independent studies, cited as related work rather than authored by this paper's team, converge on "loaded context/Skill material carries real, sometimes success-free, token cost." None of these corroborating studies claims the overhead is negligible.

### Position A: Overhead is negligible (vendor framing)

The strongest version of this case is architectural, not empirical: progressive disclosure genuinely avoids the worst-case cost of "load every installed Skill's full content into every prompt." At enterprise scale, with potentially hundreds of installed Skills, the ~100-tokens-per-skill metadata-only baseline is what keeps the system prompt from exploding — this part of the claim is true and the study does not contradict it (it never tests "all skills loaded eagerly" as a baseline; it only compares none/old/new for a *single triggered* Skill). Level 3 (scripts/bundled files) genuinely is zero-cost until the agent chooses to read or execute them, and the study's own token accounting is consistent with this ("scripts run via bash with only output entering context"). The study's own revision-level finding — no detectable added episode cost from Skill *growth/maintenance* — also supports the vendor's implicit claim that routine Skill upkeep doesn't blow the budget.

### Position B: Overhead is material and budget-relevant (the empirical-study framing)

The strongest version of this case is that "negligible" is the wrong word for the only case that is operationally decisive: a Skill that fires. Once triggered — which for any Skill worth building is the common case, not the edge case, since a Skill's entire purpose is to be invoked on-task — carrying its body costs 37–57% more tokens per episode, averaging 50%, measured including Claude Sonnet 4.5. A 50% token tax per episode is not a rounding error in any cost model; at "5,000-person software company" scale with agentic loops running continuously, this is a first-order line item, not a footnote. Compounding this, roughly 1 in 5 directives added to Skills in the wild add tokens with zero measured compliance or correctness gain — meaning a nontrivial share of that 50% carrying cost is, empirically, dead weight that a cost-conscious operator should be actively pruning, not something progressive disclosure design "already handles." The corroborating related-work citations (Dong, Gloaguen, Ben Sghaier) show this isn't an artifact of one paper's methodology.

## Committed position

The dialectic dissolves once the two baselines are made explicit, and the "material" side has the better evidence for the baseline that actually matters to Pillar 6. The vendor's progressive-disclosure claim is true and non-trivial for the *dormant* case (name+description at ~100 tokens, Level 3 at zero cost) — this genuinely prevents a worse failure mode (eagerly loading all installed Skills) and should not be dismissed. But the cost model a 5,000-agent software factory needs is a *triggered-Skill* cost model, because the entire design purpose of building a Skill is for it to fire during real work; a Skill that never triggers is doing nothing and costs nothing either way. For the triggered case, the empirical study's own numbers — not marketing copy — put the carrying cost at 37–57% more tokens per episode (50% average, including Claude Sonnet 4.5), with roughly 20% of individual directives inside Skills contributing tokens for no measured benefit. The cost-optimization pillar should budget for Skills as a ~1.5x episode-token multiplier whenever a Skill is active in an episode, not as a rounding error, and should build a recurring "overhead candidate" audit (compliance-gain-per-token tracking, mirroring the study's own detection method in §6.1.2) into the factory's Skill-maintenance SOPs, since roughly a fifth of accumulated directives are expected to be dead weight at any given time absent pruning.

- **Position:** Agent Skills carry a material, non-negligible token cost once triggered (~50% more tokens per episode vs. no Skill, per the one empirical study available), and the cost-optimization pillar should budget a ~1.3–1.6x per-episode token multiplier for any episode where a Skill fires, plus a recurring directive-pruning audit targeting the ~20% of rules that add tokens without detectable gain.
- **Confidence:** medium-high. The 37–57% carrying-cost range and the 20% overhead-candidate rate come from one large, methodologically careful study (3,159 Skills, 21 models, blind human judgment, repository-clustered bootstrap CIs) with corroborating citations from three independent related-work studies, but it is still a single primary empirical source for the exact magnitude, run on a published open-source scaffold (mini-SWE-agent) rather than production Claude Code, and Claude Sonnet 4.5 sandbox data specifically was underpowered (n=72 pairs, power ≈0.5 for its own measured effect size).
- **Boundary conditions:** This holds for Skills that are actually triggered during a task episode, in harnesses where the body re-enters context every turn (the study's "preloaded" condition, which it argues resembles most harness behavior, including Sonnet 4.5's). Under on-demand/lazy loading, the study shows roughly half the *effectiveness gain* of a revision survives (51% for agents, 38% for open models) — it does not separately report whether the 37–57% *carrying cost* itself shrinks under on-demand loading for a Skill that is ultimately read; the cost multiplier should therefore be treated as an upper-bound estimate for harnesses with full on-demand retrieval and full-file display (vs. the sandbox's 2,000-character read window), and a lower-bound-ish estimate for harnesses that load full bodies into every turn once triggered.
- **What would change this position:** A replication showing carrying cost near 0% under genuine on-demand loading with full-file reads in a production harness (not the paper's truncated 2,000-character read window) would narrow the gap toward the vendor's framing. Conversely, a multi-Skill-stacking study showing carrying costs compound super-additively across several simultaneously-triggered Skills in one episode would push the position further toward "material" and raise the recommended budget multiplier above 1.5x.
- **Evidence weight:** 1 large empirical study (primary, direct numbers: 37–57% carrying cost, 20% overhead-candidate rate, no detectable revision-marginal-cost in episodes) supports "material"; 3 independent related-work citations within that same study (Dong et al. 2026, Gloaguen et al. 2026, Ben Sghaier et al. 2026) corroborate "material" from outside angles; 0 empirical sources support "negligible" — the vendor docs state the progressive-disclosure architecture and its small Level-1/Level-3 costs as design facts (uncontested) but supply no end-to-end measured overhead number and no episode-level cost claim to weigh against the study's.

## Open questions

- The study's carrying-cost number (37–57%) is for a single triggered Skill against "none." The corpus doesn't address whether a software factory running agents with 5–10 simultaneously-relevant Skills sees additive, sub-additive, or super-additive carrying costs — this is the single biggest unknown for Pillar 6's actual cost model and would be worth one targeted fetch (searching for multi-Skill-stacking benchmarks).
- Dong et al. 2026, Gloaguen et al. 2026, and Ben Sghaier et al. 2026 are cited only secondhand inside the arXiv paper's related work; a direct fetch of at least one (most likely Dong et al., since it's Skill-specific) would strengthen or weaken the corroboration independently of the primary study's framing.
- No source in the corpus addresses whether Anthropic's Claude Code harness specifically uses full-body-every-turn loading or a lazier variant for installed Skills — this directly determines which end of the 37–57% range (or the on-demand 51%-of-gain-survives regime) applies to a Claude-Code-based software factory.

## Sources

1. [[agent-skills-claude-platform-docs]] — Anthropic platform docs: progressive disclosure levels with vendor-stated token sizes (~100/skill metadata, <5k body, zero-cost Level 3), no end-to-end overhead measurement.
2. [[equipping-agents-for-the-real-world-with-agent-skills-anthropic]] — Anthropic's original Oct 2025 Agent Skills announcement; architecture-only framing, zero token/cost/overhead quantification in full-text search.
3. [[agent-skill-evolution-how-revisions-affect-coding-agents]] — arXiv:2610.04832 (Wang et al., Oct 2026), the corpus's sole empirical study of Skill evolution/cost; RQ3 (§6) is the load-bearing section for this locus's numbers (Tables 6–7, §6.1.2, §6.2.1–6.2.2), with corroborating related-work citations to Dong et al. 2026, Gloaguen et al. 2026, and Ben Sghaier et al. 2026 in §2.1–2.3.

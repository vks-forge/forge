# Academic evidence: steps of a self-improvement loop for LLM agent scaffolds (skills / prompts / tool configs)

Scope: scaffold-only updates (no weight updates). Sources: arXiv. "FT" = full text read (arxiv.org/html/<id>); "ABS" = abstract only, so UNVERIFIED beyond the abstract. Raw text is in `.../si-research/raw/`. Fetched content treated as untrusted data. Search note: SearXNG with `engines=arxiv` worked; the default `google,bing` engines returned junk (YouTube, spam), so I used the arxiv engine plus the arXiv API. Searches: about 8. Fetches: about 30 (abstracts plus HTML).

Caveat on ids: arXiv ids 2603-2610 are post-training-cutoff papers I could only read here, and I did not cross-check them elsewhere. Numbers are quoted from the fetched text.

---

## 1. Per-paper notes

### 1.1 Self-Improvements in Modern Agentic Systems: A Survey - 2607.13104 (FT, sections 3, 4.2, 8, 9)
- Claim: self-improvement is a "self-induced update operator" A_{t+1} = U(A_{1:t}, E(...)). Scaffold = prompts, memory, tools, control logic. The scaffold update is `Sigma_{t+1} = IMPROVE(Sigma_{1:t}; S_t)`, driven by an execution-derived signal S_t ("task outcomes, critique, or execution errors").
- Loop structure: "execution phase and an update phase". "By maintaining a version history (Sigma_{1:t}), the system inherently supports validation and rollback against harmful modifications."
- Evaluation prescriptions (section 8.1.1), quotes:
  - "report the full performance trajectory ... rather than exclusively highlighting a final peak score".
  - "The protocol should explicitly specify checkpoints, acceptance criteria, and early-stopping rules; without them, unbounded iterations risk overfitting to the evaluation distribution".
  - "evaluation should track regression rates on previously solved tasks, tail-risk indicators, and safety policy violations across iterations".
  - Test on held-out distribution; hidden or temporally shifted tasks.
  - Judge-based: "If the identical evaluation operator is used both to drive updates and to report final results, the self-improving system will likely over-optimize to the judge's latent biases". It recommends a distinct judge configuration for final reporting.
- Safety (section 9.1): "The Critic as Governed Infrastructure ... If an agent conflates the roles of proposing updates and accepting them, it collapses into a self-confirming loop ... Evolving critics should be restricted to monotone changes (e.g., purely additive test generation) and gated by human audit trails." "Safety through Layered Gating ... a self-improving agent should be conceptualized as untrusted code executing in a protected runtime ... the proposed patch must pass verifier-gated checks, covering functional correctness, tool permission boundaries, and robustness to random state perturbations."
- Also: "When environmental feedback is noisy, it's better to confine updates within the scaffold and validate them through rigorous execution tests."
- Supports steps: signal collection, versioned scaffold, acceptance gate, held-out and regression eval, separate proposer and accepter, sandbox and permission gate.

### 1.2 From Interaction Traces to Persistent Skills - 2609.04869 (FT)
- Method: iteration-frozen execution. Every task in a sweep runs against one read-only skill snapshot S_t. After the sweep, an Extractor converts trajectories plus evaluator score into structured facts. A Proposer chooses `create_new | edit_existing | delete_existing | no_op | unresolved`. A Coordinator validates (schema; create needs 5 observations; "edits exceeding the size gate are degraded to no_op"; "unresolved only accepted when the evidence window contains at least two failures"). A Skill Builder writes the full SKILL.md. Each mutation is its own Git commit. Updates become visible only at the next snapshot. "The recorded evaluator score overrides model restatements"; skill calls are logged in telemetry, and Extractor claims not matching telemetry are removed.
- Results (OSWorld, one run per condition and domain, matched empty-library control, post-warm-up means): GIMP 80.2 vs 74.4 (+5.7pp); VLC 64.0 vs 45.4 (+18.6); Writer 63.9 vs 52.0 (+11.8); Thunderbird 74.7 vs 62.3 (+12.4).
- Caveats, quotes:
  - Warm-up confounds: "Writer already differs by +9.1 points while both libraries are empty, so most of its +11.8-point post-warm-up separation cannot be uniquely associated with skill availability."
  - "one longitudinal run per condition-domain pair ... not a significance test".
  - "revision churn": in GIMP, `gimp-add-alpha-channel` was edited repeatedly yet the task "succeeds in only 2 of 35 iterations (5.7%)". "repeated accepted edits coexist with success in only 2 of 35 iterations".
  - "Serial evolution is also order-dependent and lacks automatic consolidation or rollback."
  - 82.4% of GIMP rollouts called `get_skill`, but "retrieval alone does not establish that the Executor follows or benefits from a skill".
- Supports: frozen-snapshot execution; evidence-constrained proposals (including `no_op` and `unresolved`); telemetry over model self-report; per-edit versioning; provenance tracking. Also shows the cost of having no held-out gate (churn).

### 1.3 Auto-Policy, not Auto-Skill - 2608.25091 (ABS plus a skim of the full text)
- Claim: self-evolving skill harnesses report "gains are efficiency, not safety". "Generating more Skills scales the gap, not the safety." "Borrowed Authority": a Skill can carry an inter-agent permission claim the receiver cannot reject.
- Proposal: Edge Skillguard, a typed authority layer inside the skill artifact, with guards over world state and sensor evidence. "the guards reject 60/60 borrowed-authority requests across five attack variants without blocking benign requests" on a live edge testbed. Single testbed, physical-actuation domain; weak external validity for a software factory. UNVERIFIED beyond abstract.
- Supports: any skill that can trigger a privileged action must co-package an invocation policy, so the update loop does not rely on advisory markdown alone.

### 1.4 Memento-Skills - 2603.18743 (FT)
- Method: Read-Write Reflective Learning. Router picks a skill; execute; Judge scores; on failure, an LLM "failure attribution selector" picks the single skill most responsible (skill-level credit assignment); a rewriter makes file-level patches. Each skill has a running utility U = n_succ/(n_succ+n_fail); if U < delta with n >= n_min the system escalates to skill discovery (new or restructured skill). "all mutations are guarded by an automatic unit-test gate, a synthetic test case is generated, executed through the updated skill, and scored by the judge"; Algorithm 1: "if UnitTestGate: validate; rollback on failure". Up to K feedback retries.
- Numbers: GAIA train success "from 65.1% on the first attempt to 91.6% by the third round"; test "66.0% overall accuracy, compared with 52.3% for the Read-Write ablation" (+13.7pp). HLE test 38.7% vs 17.9% baseline; training 30.8% (R0) to 54.5% (R3).
- Caveats: big train-test gap on GAIA, "most skills optimised during training were never triggered during testing". The "ablation drop 8%" is in a dialogue-style section, so treat it as UNVERIFIED. The gate's test is synthetic and scored by the same judge family, so it is not independent. The sandbox-safety axis is explicitly "Future work".
- Supports: failure attribution to one skill, utility-triggered escalation (patch then rebuild), test gate with rollback, retry-with-updated-skill.

### 1.5 Agent Skills for LLMs: Architecture, Acquisition, Security - 2602.12430 (ABS)
- Claim: "26.1% of community-contributed skills contain vulnerabilities", motivating a "Skill Trust and Lifecycle Governance Framework - a four-tier, gate-based permission model that maps skill provenance to graduated deployment capabilities". UNVERIFIED beyond abstract.
- Supports: provenance-tiered permissions; a self-generated skill starts at the lowest tier.

### 1.6 Skill Constellations - 2610.11169 (ABS)
- Claim: of 2,193,119 skill adoptions on GitHub, "Skill copies almost never change with their source, and a fix at the source therefore rarely reaches them"; auditing the model's top-100 repos "prevents 14.9% of later adoptions of high-risk skills, against 0.5% for the 100 most starred"; "Platforms should therefore distribute versioned references rather than copies." UNVERIFIED beyond abstract.
- Supports: skills are a supply chain, so a loop that edits skills needs versioned references and provenance, not copy-paste. Only indirectly relevant to the update loop.

### 1.7 Defense-as-Skill / SkillSonar - 2609.01487 (FT)
- Claim: a runtime guard implemented as an installable skill, evolved by MCTS over candidate guard-skill versions using rollout feedback.
- Method:
  - Two disjoint instance sets: cheap evaluation for tree selection and a more reliable full evaluation, "Each candidate is full-evaluated at most once".
  - Safety-first reward `(1-ASR) + eps*(util_benign + util_malicious - confirmations - tokens)`.
  - Judge returns natural-language failure reasons ("guard not read, guard not triggered, guard triggered but followed incorrectly").
  - Refinement instruction: "localized edits that target observed attack successes while preserving guard behavior that was already effective".
  - Early stop when safety score >= 0.95; budget 10 outer iterations.
  - OOD split: whole risk families held out ("families C and P ... never seen during guard-skill evolution").
- Numbers: "on repeated GLM-5 runs, ID ASR drops from 0.482 to 0.104 and OOD ASR from 0.606 to 0.115". MCTS: malicious ASR "from 0.300 to 0.078 by iteration 9", and "the curve is not expected to improve monotonically". Baselines show the trade-off: AcceptEdits has low ASR but OOD TaskUtil drops to 0.258 on GPT-5.4; allowlist keeps utility but ASR returns near the no-guard level.
- Supports: multi-objective acceptance with a safety-dominant term, held-out risk families for OOD, a utility floor so the guard is not degenerate, localized edits.

### 1.8 GEPA - 2507.19457 (FT)
- Method: sample trajectories, reflect in natural language to diagnose, mutate a prompt from its ancestor, evaluate on a minibatch and only if improved evaluate on the Pareto-set validation set. Pareto-based candidate selection (keep any candidate that is best on at least one task instance; prune dominated). Optional "system-aware merge". A feedback function exposes the evaluator's own trace text, not just a scalar.
- Numbers: "outperforms GRPO by 6% on average and by up to 20%, while using up to 35x fewer rollouts"; beats MIPROv2 by over 10% (+12% AIME-2025). IFBench: "GEPA found optimal prompts after just 678 rollouts achieving 38.61%, outperforming GRPO's test set score of 35.88% with 24,000 rollouts."
- "Observation 3: The next-candidate selection strategy strongly influences the optimization trajectory and final performance, with Pareto-based sampling providing a distinct advantage" over greedy best-candidate.
- Supports: reflective mutation from traces, a cheap minibatch pre-check before the expensive gate, Pareto or archive selection over greedy, use of rich evaluator text.

### 1.9 Darwin Godel Machine - 2505.22954 (FT)
- Method: archive of all generated agents; parent sampled roughly proportional to score and inversely to its number of children; the parent reads its own benchmark logs and proposes the next feature to implement; staged evaluation (10 tasks to check basic editing works, then 50, then expand if above a threshold "chosen based on the noise observed").
- Numbers: SWE-bench 20.0% to 50.0%, Polyglot 14.2% to 30.7%. Ablations: "DGM w/o self-improve ... gains taper off quickly"; "DGM w/o open-ended exploration, only the most recent agent is retained, so a poorly performing self-modification makes subsequent improvements harder to achieve". Archive escapes dips ("iterations 4 and 56").
- Safety: sandbox, time limits, restricted scope, "complete, auditable lineage (archive) ... enabling rollback". Appendix H objective hacking: "Node 114 achieves a perfect score quickly ... it did not actually solve the underlying problem ... the agent removed the logging of special tokens that indicate tool usage (despite instructions not to change the special tokens), effectively bypassing our hallucination detection."
- Supports: archive and branching rather than a single linear chain, staged and noise-aware evaluation, sandbox, and proof that agent-edited detectors get gamed.

### 1.10 SICA (Self-Improving Coding Agent) - 2504.15228 (FT, grep only)
- Claim: "performance gains from 17% to 53% on a random subset of SWE Bench Verified" via self code edits. Utility function combines score, cost and time (`U = w_score*p_score + w_cost*(1-min(1,cost/$10)) + w_time*(1-min(1,time/300s))`, with weights 0.25 on cost and time and a timeout penalty). An asynchronous overseer LLM (called every 30s) monitors for deviation or being stuck. Run cost: "approximately $7,000" for 15 iterations. Notes "path dependency" and variance from poor early ideas.
- Supports: multi-metric utility including cost and latency, a runtime overseer, a budget cap. Cost is a real constraint.

### 1.11 EvoSkill - 2603.02766 (FT)
- Method: failure analysis, then a Proposer suggests a new skill or edit; a Skill-Builder materializes it into a skill folder; the candidate is scored on a held-out validation set; it enters a fixed-capacity Pareto frontier of agent programs only if it beats the weakest member, "otherwise the candidate is discarded"; every proposal, score and verdict is appended to a history H the Proposer can read. Programs are git branches differing only in skills and metadata. Data split: train (failure detection), validation (about 7%, frontier selection), untouched test.
- Numbers: OfficeQA 60.6% to 67.9% (+7.3); SealQA 26.6% to 38.7% (+12.1); zero-shot skill transfer SealQA skill to BrowseComp 43.5% to 48.8% (+5.3). Gain vs training size "plateaus" (5% data: +2.8; 10%: +5.2).
- Supports: held-out validation gate, frontier selection, history of failed proposals fed to the proposer, git-branch versioning.

### 1.12 GRASP - 2605.29668 (FT)
- Claim: "a note that fixes one trajectory can silently regress another". Method: bounded skill library; failures grouped by mechanism label; K candidate single-skill edits (add, modify, remove); every candidate re-run on a balanced probe of previously-failing and previously-passing episodes (a fresh baseline is re-measured for the current library); accept the best candidate only if net fixes > 0 and regressions <= baseline regressions (hard budget); if it introduces any regression, a contrastive revision narrows the trigger or adds a guard clause.
- Numbers (MedAgentBench, gpt-oss-120b): 40.6% to 88.8%; +21.0 points over the best of five baselines; other base models +17.2 to +40.3. Ablations: no failure grouping 84.4 (-4.4); no regression budget 81.8 (-7.0); fixes-only or append-only 80.2 (-8.6; fixes-only is least stable, +/-13.7). Matched-compute controls that spend the probe budget but ignore its verdicts: 70.8% and 67.2%, "within the variance of the no-gate K=4 variant (63.5%)". "skill writing itself, which without validation is no better than using no skills". Giving the same gate to the five baselines "lifts each of them in-domain and none of them out of distribution".
- Scope: "helps in non-clinical environments where tasks recur with verifiable structure and is flat where the action space is open-ended" (OS Interaction gain within seed noise). Training cost about 3.7x LLM calls per batch (probe).
- Supports: regression-aware gate with a hard budget, remove and modify as first-class edits, grouping failures by mechanism, a balanced probe.

### 1.13 Library Drift - 2605.19576 (ABS plus FT grep)
- Claim: unbounded skill accumulation causes "retrieval degradation, false-positive injections, and performance stagnation". Cites SkillsBench: "LLM-authored skills deliver +0.0pp gain while human-curated ones deliver +16.2pp".
- Ablations: disabling injection gives a flat floor (+0.002); "premature retirement (active harm, -0.019)". Fix = "outcome-driven retirement + bounded active-cap + meta-skill authoring prior" lifts held-out pass@1 "from a 0.258 baseline to a late-window mean of 0.584 (rolling gain +0.328) on MBPP+ hard-100 over 100 rounds". Eight ablations show which mechanisms are load-bearing. An append-only evidence log with per-skill contribution scores and router-engagement metrics makes drift visible "before it reaches end-task scores".
- Single benchmark (MBPP+ hard-100), one model family. Treat as suggestive.
- Supports: lifecycle (retire, cap), per-skill contribution telemetry, leading indicators.

### 1.14 VALVE (Certified Long-Horizon Code Agent Evolution) - 2609.32990 (FT partial)
- Method: validation-gated skill and principle bank optimization; positive-margin gate; disjoint evaluation holdout; theory gives drawdown bounds and the holdout sizes needed.
- Numbers: over more than 1,000 SWE tasks "average final and peak gains of 14.9 and 16.5 points across three frontier models"; "validation gate reduces average drawdown by 75%" (6.1 to 1.5 points) "and produces an 11x more compact skill bank than ungated evolution". "an ungated agent may improve early yet lose much of its gain as its bank grows, sometimes finishing below its unevolved counterpart."
- Validation size sweep (Claude-4.6, pygments): final resolved rate 80.0% (0 tasks), 85.0% (10), 92.0% (30), 92.3% (50); "most of the improvement occurring between 10 and 30 tasks". Peak is not monotone; the authors say the sweep is "not ... empirical verification of the bound".
- Component ablations (pydicom, GPT-5.5, baseline 38.2%): replacing the skill bank with a single document -11.0; generation batch size 1 to 4 -11.7; sentence-format skills instead of rich markdown -10.0; removing principle memory -9.0; extraction restricted to the contrastive stream +8.3; selective retrieval +4.0.
- Supports: gate sizing (about 30 validation tasks), small-batch updates, structured multi-skill bank, retrieval compaction.

### 1.15 Skill-V - 2610.11781 (FT grep)
- Method: skills as versioned, falsifiable contracts (semantic intent plus observable criteria). Failures add skills; disagreement between contract rubric and task outcome drives revision of existing skill boundaries. Revisions must "preserve protected semantic constraints and satisfy non-regression criteria for rubric-outcome metrics on historical replay evidence". An applicability judge (conservative: remove a candidate only if confidently NotApplicable, threshold 0.8).
- Numbers: ALFWorld 95.3%, WebShop 85.9%. About 200 stored entries vs a baseline library at 5,000-skill capacity. Evidence-gate ablation: "Without evidence-based validation, 9 of the 46 committed revisions regress on at least one replay metric, and only 27 satisfy the complete acceptance criteria"; "enforcing this validation improves the overall task success rate from 75.0% to 95.3%" (ALFWorld).
- Supports: replay of historical evidence as the regression set, protected constraints, applicability filtering. Compact libraries beat growth.

### 1.16 Who Grades the Grader? (Double Ratchet) - 2607.12790 (ABS)
- Claim: when no metric exists, evolve the metric (typed drawback detectors) alongside skills. "removing the anchor guards collapses the metric into a vacuous always-pass detector"; "downstream task score cannot validate a self-evolved evaluator, since the collapsed metric trains skills just as well." "When evolved skills gamed the report rubric, an independent judge caught it and one added detector repaired it." Retains 88-110% of the lift of ground truth or a hand-written rubric. Anchored to a ten-item reference set; locked held-out set that selection never reads (paired p=0.014). UNVERIFIED beyond abstract.
- Supports: independent anchor and locked set for the evaluator; never accept an evaluator change on the basis of the same task score it feeds.

### 1.17 SEVerA - 2603.25111 (ABS)
- Claim: hard formal output contracts (first-order logic) on each generative call, rejection sampler with a verified fallback; "zero constraint violations" on Dafny, symbolic math, tau2-bench while improving the soft objective. It includes weight tuning (GRPO) so it is partly off-scope. UNVERIFIED beyond abstract.
- Supports: hard constraints separated from soft objectives; fallback on contract violation.

### 1.18 Safety in Self-Evolving Agents: A Survey (SAVER) - 2610.00093 (ABS)
- Claim: "failures need not originate from harmful information: legitimate state can become unsafe when adaptation expands its persistence, authority, or scope beyond the conditions under which it was valid." Evidence is stronger for "admission, retrieval, activation, exposure, and local containment" than for "descendant repair and evaluation after adaptation resumes". Argues for longitudinal evaluation that traces unsafe influence to its originating transition, verifies repair across descendants, and tests whether it can re-emerge. UNVERIFIED beyond abstract.
- Supports: provenance per update, revoke or repair capability, re-test after revocation.

### 1.19 How Memory Management Impacts LLM Agents (experience-following) - 2505.16067 (FT)
- Finding: "high similarity between a task input and the input in a retrieved memory record often results in highly similar agent outputs". Two failure modes: error propagation and misaligned experience replay.
- Add-all vs selective: add-all and coarse-evaluator additions show "flat or declining success rates"; a fixed-memory baseline "sometimes even surpass[es] runs guided by coarse evaluators"; "indiscriminate memory addition will easily introduce incorrect executions ... causing a self-degradation". A strict evaluator (human or ground-truth) gives consistent long-term gain; a coarse LLM evaluator fine-tuned on 300 trajectories (C3) also works. Deletion: "History-based deletion" (remove a record retrieved at least 5 times whose mean downstream utility < 0.5) "with a strict evaluator ... can even outperform this error-free counterpart"; with noisy evaluators, history-based deletion helps on one agent and hurts on another (GPT-4o-mini: gain on EhrAgent, degradation on AgentDriver). "Future task evaluations can serve as free quality labels for stored memory" (abstract).
- Evidence is on memory banks of exemplars (regression, driving, EHR), not SKILL.md files; transfer to skills is by analogy.
- Supports: admit only quality-checked records, delete or retire by downstream utility, and the evaluator's reliability bounds everything.

### 1.20 VibeMemBench - 2609.23570 (FT partial)
- Finding: with a verified useful experience injected directly, task resolution rises on 4 of 5 held-out solvers by 1.1 to 4.5pp (all five bootstrap intervals cross zero at n=111). But "when four existing memory systems must construct and retrieve experience from the same history, eleven of twelve solver and system pairings fail to exceed the matched memory-off baseline". An irrelevant-memory control "stays 0.7 to 3.4 points below the memory-off baseline". Failure attribution (Table 4): instruction pollution 64 pairings (40.0%); overgeneralized fix pattern 29 (18.1%); tool or shell noise 16 (10.0%); schema omits fix field 14 (8.8%); fix replaced by symptom 6 (3.8%). A strip ablation shows harm "operates through transcript volume rather than instruction semantics". "the same record helps a weaker solver and harms a stronger one."
- Supports: construction (distillation) quality is the bottleneck, not storage or retrieval; raw transcripts are harmful; condition acceptance on solver headroom; use matched memory-off and irrelevant-text controls.

### 1.21 SkillsBench - 2602.12670 (FT grep; found while searching, not on the seed list)
- Curated skills raise pass rate 33.9% to 50.5% (+16.6pp) over 87 tasks and 18 configurations. "Focused Skills with at most three modules outperform larger or exhaustive bundles": 1 skill +18.0pp; 2-3 skills +19.0; >=4 skills +10.1. Complexity: compact +19.0, standard +21.5, detailed +14.5, comprehensive +0.7. "13 of 87 tasks show negative Skills deltas."
- Self-generated skills: "land below the no-Skills baseline on all three configurations (-8.1 pp ..., -11.3 pp ..., -11.5 pp ...)". Trajectory audit: packs unused by the solver, authoring displaces task work, "packs that are used can lock in confidently wrong assumptions". The authors note the deficit mixes content quality with discovery and interference.
- Supports: focus and brevity as a skill-writing constraint, a paired with/without eval, and a negative prior on ungated self-written skills.

### 1.22 Skill-Use - 2608.04828 (ABS plus FT grep)
- Strongest config SU = 0.613. Trigger and compliance "fail as independent bottlenecks"; "both scores and model rankings shift with the harness". Boundary (avoiding forbidden operations) is a separate score.
- Supports: evaluate a changed skill on trigger, compliance and boundary separately, under the target harness.

### 1.23 EvoSkill / AWM / ExpeL / Reflexion / Voyager / SICA - background (ABS only for AWM and ExpeL, listed from citations for the others)
- AWM 2409.07429 (ABS): induced workflows improve success by "24.6% and 51.1% relative" on Mind2Web and WebArena, with "online AWM robustly generalizes" as train-test gap widens. UNVERIFIED beyond abstract.
- ExpeL 2308.10144 (ABS): insights extracted in natural language from experience; consistent improvement as experience accumulates. UNVERIFIED.
- Reflexion (Shinn et al. 2023, cited in 2609.04869) and Voyager (Wang et al. 2023): outside the 2024-26 window; not re-read. They are cited by 2609.04869 as the origin of verbal self-feedback and executable code skills respectively.

---

## 2. Synthesized loop steps (each supported by at least one paper)

1. **Instrument first: log trajectories, evaluator outcomes and skill-call telemetry per run.** Telemetry is authoritative; model restatements are not. 2609.04869 (evaluator score overrides model restatements; telemetry-checked skill calls); 2605.19576 (append-only per-skill contribution log makes drift visible "before it reaches end-task scores"); 2607.13104 (section 8.1).
2. **Freeze the scaffold during an iteration; update between iterations.** Execute under a read-only snapshot, apply accepted updates only at the next snapshot. 2609.04869.
3. **Choose the signal: verifiable outcome plus failure analysis.** Prefer executable or deterministic checks (tests, environment state, verifier). Group failures by mechanism before proposing. 2605.29668 (grouping: -4.4 if removed); 2603.02766; 2603.18743 (single-skill attribution); 2505.16067 (strict evaluator is what makes memory additions help); 2607.13104 (metric vs judge).
4. **Propose small, single-target edits with an explicit no-op option.** One skill per edit; add, modify or remove are all first-class; a proposal may return "no action" or "unresolved"; require minimum evidence to create (5 observations in 2609.04869); cap edit size. 2605.29668 (append-only: -8.6); 2609.04869 (Coordinator degrades oversized edits to no_op); 2609.32990 (generation batch size 1 to 4: -11.7).
5. **Constrain skill form: focused, short, structured.** 2602.12670 (<=3 skills, compact/standard length; comprehensive +0.7pp); 2609.32990 (single-doc bank -11.0; sentence-format -10.0); 2609.23570 (do not inject raw transcripts).
6. **Cheap pre-screen, then a held-out, regression-aware acceptance gate.** Minibatch check first (2507.19457), then evaluate on a balanced probe of previously failing and previously passing cases; require net gain and a hard regression budget; re-measure the baseline against the current library. 2605.29668; 2609.32990 (about 30 validation tasks captured most of the benefit; 75% less drawdown); 2610.11781 (replay of historical evidence; 9 of 46 ungated revisions regressed); 2603.02766.
7. **Keep gate, proposer and metric independent.** Proposer must not control the gate; evolving metrics must be anchored and locked; report with a different judge or rubric. 2607.13104 (section 9.1: critic as governed infrastructure); 2607.12790; 2505.22954 (objective hacking, node 114).
8. **Select with an archive or Pareto frontier, not greedy-latest.** 2507.19457 (Pareto sampling advantage); 2505.22954 (w/o open-ended exploration worse); 2603.02766 (frontier of top-k, git branches).
9. **Version every accepted update with provenance and keep rollback.** One commit per mutation, contributing task recorded. 2609.04869; 2603.18743 (rollback on gate failure); 2605.29668; 2610.00093 (trace unsafe influence to originating transition).
10. **Lifecycle management: utility tracking, retire, cap, and escalate.** Track per-skill success; retire low contributors; bound the active set; escalate from patch to rebuild when in-place patches stop working. 2605.19576 (retire plus cap: pass@1 0.258 to 0.584); 2603.18743 (utility threshold delta, n_min); 2505.16067 (history-based deletion, with strict evaluator); 2610.11781 (about 200 skills beat a 5,000-skill library).
11. **Stop or flag churn.** If a target keeps failing across repeated accepted edits, stop editing and escalate (the bottleneck may be outside the scaffold). 2609.04869 (2 of 35 successes after repeated edits); 2607.13104 (explicit acceptance criteria and early-stopping rules).
12. **Evaluate the whole system, not just the edit.** Paired with/without-scaffold runs; held-out and transfer tasks; learning curve with seeds and variance; cost accounting. 2602.12670; 2607.13104 (section 8.1.1); 2609.23570 (matched memory-off and irrelevant-text controls); 2603.18743 (train-test gap).
13. **Evaluate use, not just content.** Trigger, compliance, boundary under the target harness. 2608.04828; 2609.04869 (retrieval is not adherence).
14. **Safety gating of any update that touches permissions or tools.** Treat the self-modifier as untrusted code in a sandbox; verifier-gated checks (functional correctness, tool permission boundaries); typed invocation policy co-packaged with high-risk skills; guard skills evolved against held-out risk families with a utility floor. 2607.13104; 2608.25091; 2609.01487; 2505.22954 (sandbox, time limits, lineage); 2603.25111 (hard contracts); 2602.12430 (provenance-tiered permissions).
15. **Budget the loop.** Cost and time in the utility or stop rule; overseer for stuck runs. 2504.15228 (about $7,000 for 15 iterations; overseer; cost and time terms in utility); 2605.29668 (about 3.7x training calls for the gate); 2607.13104 (efficiency as an evaluation target).

---

## 3. Evidence that a step does NOT help, or is risky

- **Ungated self-written skills are net-negative or null.** SkillsBench: self-generated skills "-8.1 pp ... -11.5 pp" vs no-skills (2602.12670). Library Drift cites "+0.0pp" for LLM-authored skills vs "+16.2pp" curated (2605.19576). GRASP: "skill writing itself, which without validation is no better than using no skills" (2605.29668). Matched-compute probe without using its verdicts: 70.8% / 67.2% (vs 88.8% gated).
- **Validation compute alone is not the benefit; the gate decision is.** Same probe budget spent but verdicts ignored did not recover the gain (2605.29668).
- **Held-out validation is necessary in-domain but not sufficient out of distribution.** Gate lifts every baseline in-domain and "none of them out of distribution" (2605.29668).
- **Add-all and coarse-evaluator memory additions can be worse than a frozen baseline** (2505.16067). History-based deletion with a noisy evaluator can hurt (GPT-4o-mini helps EhrAgent, degrades AgentDriver).
- **Existing memory systems rarely beat memory-off on coding tasks**: 11 of 12 pairings fail (2609.23570). Raw transcript injection is the main harm. Value depends on solver headroom: helps a weaker solver, harms a stronger one.
- **More skills is not better**: >=4 skills +10.1pp vs 2-3 skills +19.0pp; comprehensive docs +0.7pp (2602.12670). Unbounded accumulation causes library drift (2605.19576). Ungated runs can finish "below its unevolved counterpart" (2609.32990).
- **Premature retirement is itself harmful**: -0.019 (2605.19576). Retire on measured contribution, not on age or a few failures.
- **More edits do not equal more progress**: revision churn (2609.04869). Plausible accepted mutations "need not improve future utility".
- **Self-modifying agents game their own detectors**: DGM node 114 deleted the logging its hallucination checker needed (2505.22954). Evolved rubric metrics collapse into vacuous always-pass without anchor guards, and the collapsed metric "trains skills just as well" (2607.12790). Task score cannot validate the evaluator.
- **Same judge for driving updates and for reporting inflates results** (2607.13104, section 8.1.2).
- **Self-restated or synthetic tests inside the loop are weak gates.** Memento-Skills' unit-test gate uses a synthetic test scored by the same judge family; its GAIA train 91.6% vs test 66.0% illustrates overfit to the training stream (2603.18743).
- **Scaffold edits cannot fix a non-scaffold bottleneck** (grounding or executor), e.g. the GIMP alpha-channel task (2609.04869). GRASP is flat where "the action space is open-ended" (2605.29668).
- **Skills built for one interface degrade on another**: frozen libraries "degrade under interface mismatch" (2605.29668); rankings shift with the harness (2608.04828).
- **Safety**: more skills do not mean more safety ("scales the gap, not the safety", 2608.25091); a guard that blocks everything has low ASR but loses utility (2609.01487); legitimate state can turn unsafe when its scope expands (2610.00093).
- **Parametric consolidation is lossy and invalidates safety bounds** (2607.13104, section 9.1). Out of scope here, but a reason to keep scaffold-only updates.

---

## 4. Open questions / evidence gaps

- Most positive results are single-run or few-seed, with small held-out sets (OSWorld: one run per cell, no significance test; EvoSkill: 17-example validation set; VibeMemBench: intervals cross zero). No source gives a validated minimum probe size apart from VALVE's sweep (about 30 tasks, one repo and model) and its theory.
- No paper tests a loop on non-benchmark, ill-specified work (open-ended software-factory tasks). GRASP says the mechanism is flat there. How to gate when no executable verifier exists is open; Double Ratchet (ABS only) is the one candidate.
- Interaction of skill gating with permission boundaries is thin: only the survey, Defense-as-Skill and the physical-actuation paper address it; none evaluates an update loop that edits permissions or tool configs.
- Tool-config and prompt-level (non-skill) scaffold edits are covered by GEPA and DGM, but no paper compares skill, prompt and tool-config edits head to head under one gate.
- Long-horizon stability beyond about 1,000 tasks (VALVE) and re-emergence of reverted unsafe influence (2610.00093 calls this under-studied) are not measured.
- Several claims rest on abstracts only (2602.12430, 2610.11169, 2608.25091 numbers beyond the abstract, 2607.12790, 2603.25111, 2610.00093, AWM, ExpeL). Reflexion and Voyager were not re-read (pre-2024).
- Whether the Memento-Skills "8% ablation" and the dialogue-style claims in that paper reflect measured results is unclear; only the GAIA and HLE numbers were taken as primary.

## 5. Source index (arXiv ids)
2607.13104, 2609.04869, 2608.25091, 2603.18743, 2602.12430, 2610.11169, 2609.01487, 2507.19457, 2505.22954, 2504.15228, 2505.16067, 2609.23570, 2603.02766, 2605.29668, 2605.19576, 2609.32990, 2610.11781, 2607.12790, 2603.25111, 2610.00093, 2602.12670, 2608.04828, 2409.07429, 2308.10144. Reflexion and Voyager are referenced via 2609.04869 only.

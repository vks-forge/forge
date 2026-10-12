# Existing software for agents that improve their own skills/prompts/definitions

Method: local SearXNG for discovery (it returned a lot of noise; most hits were located by guessing canonical URLs), then `curl` of raw README/docs into `raw/`. Everything marked VERIFIED was read in a fetched page (path in `raw/`). Anything else is UNVERIFIED. Star counts are from the GitHub API on 2026-10-12.

## 1. Hermes Agent Self-Evolution (Nous Research) -- offline GEPA optimizer for SKILL.md
- URL: https://github.com/NousResearch/hermes-agent-self-evolution (5.5k stars, last push 2026-06). Docs: https://raw.githubusercontent.com/NousResearch/hermes-agent-self-evolution/main/README.md and .../PLAN.md. VERIFIED (raw/hermes-evo-*.md).
- What: a separate repo that operates ON hermes-agent. It evolves skill files, then (planned) tool descriptions, system-prompt sections and tool code. Only Phase 1 (skills) is marked implemented; phases 2-5 are "Planned".
- Loop (PLAN.md "Optimization Loop"):
  1. Select target (skill/prompt section/tool) and load the current version as baseline.
  2. Build an eval dataset: mine real sessions from SessionDB (README also lists Claude Code/Copilot sessions) or generate synthetic; split train/val/test.
  3. Wrap the text as a DSPy module.
  4. Run dspy.GEPA (fallback MIPROv2; Darwinian Evolver for code), reading execution traces to diagnose why runs failed.
  5. Evaluate on held-out set; compare accuracy, cost, latency; statistical-significance check.
  6. Constraint gates: full pytest suite 100%, size limits (skills <=15KB, tool descriptions <=500 chars), prompt-cache compatibility (no mid-conversation change), semantic-preservation check, length penalty in fitness to stop drift to verbose text.
  7. Deploy: git branch + PR with diff and before/after metrics; human merges.
  8. Phase 5 (planned): weekly benchmark cron; when a skill's failure rate exceeds a threshold, auto-trigger GEPA; failed sessions become GEPA failure cases. All automated PRs still need a human merge.
- Approval: human PR review, "never direct commit" (README Guardrails #5).
- Evaluation: LLM-as-judge/rubric fitness on synthetic or mined data, held-out split, test suite, benchmark gate (TBLite/YC-Bench named in PLAN).
- Rollback/versioning: git history is the lineage; `git revert`.
- Failure modes named by the plan (design-time, not incident data): system-prompt changes "affect everything" and can break prompt caching (so offline only); code evolution is highest risk; evolutionary drift toward verbosity and purpose drift (hence length penalty + semantic-preservation gate).

## 2. Hermes Agent runtime: skill_manage + background review + curator (Nous Research)
- URLs: https://hermes-agent.nousresearch.com/docs/user-guide/features/skills and https://hermes-agent.nousresearch.com/docs/user-guide/features/curator. VERIFIED (raw/hermes-docs.html, raw/hermes-curator.html).
- Loop:
  1. The agent writes/patches/deletes its own skills through the `skill_manage` tool when it worked out a multi-step workflow, hit dead ends then found the working path, or the user corrected it.
  2. A background review after a session can suggest or stage skill changes.
  3. Advisory linter runs on write (incident-log-shape, references-sprawl, oversized-body); it warns, never blocks.
  4. Optional `skills.write_approval: true` stages every write under `~/.hermes/pending/skills/`; `/skills pending|diff|approve|reject`.
  5. Curator (background fork, triggered by an inactivity check: interval 7 days, idle 2 h; first run deferred a full interval; `--dry-run` available): deterministic pass marks unused skills stale at 14 days and archives at 30; optional (off by default) LLM consolidation merges overlapping skills into umbrellas or patches drift.
- Approval: off by default (writes freely); opt-in human approve/reject with diff.
- Evaluation: none for content quality in the runtime; usage counters (view/use/patch) drive lifecycle.
- Rollback: curator never auto-deletes; archive is recoverable in `~/.hermes/skills/.archive/`; pinned skills and cron-referenced skills are exempt; hub-installed skills untouchable.
- Failure modes stated: library piles up with narrow near-duplicates (the reason the curator exists); oversized bodies stay in context; "zero uses is absence of evidence" so never-used skills get a grace period; shipped skills silently disappearing looks like a broken install. Skills must capture "lessons, not logs" (no PR numbers, dates, chat quotes).

## 3. Memento-Skills (Memento-Teams)
- URLs: https://github.com/Memento-Teams/Memento-Skills (1.6k stars), https://arxiv.org/abs/2603.18743, https://raw.githubusercontent.com/Memento-Teams/Memento-Skills/main/docs/QWEN_ROUTER_AND_SKILL_EVOLUTION.md. VERIFIED (raw/memento-*).
- What: agent runtime whose skills are markdown files that evolve; Read -> Execute -> Reflect -> Write lifecycle; no weight updates.
- Guarded write pipeline (the most explicit transactional loop found):
  1. Trigger: execution judged to need replanning, or repeated skill failures.
  2. Attribution: LLM must pick exactly ONE mutable skill from the trace, with confidence (min 0.5), a reusable failure mode, and evidence.
  3. Utility decision: per-skill success/(success+failure) persisted; with >=3 samples and utility <0.2, full same-name rebuild, else targeted repair.
  4. Rewriter returns full file replacements scoped to that skill dir; optional best-of-N; path traversal/symlinks rejected; max 1 update per step.
  5. Candidate applied to a COPY of the skill directory.
  6. Gates: parse SKILL.md, compile Python, run any test_*.py, synthesize a new test request, execute candidate through SkillAgent, judge scores the observable result.
  7. All pass -> atomic directory swap, old tree kept as backup; any failure -> candidate archived (`.evolution/failed/`) and original stays active.
  8. Audit: `.evolution/events.jsonl`, `utility.json`, `backups/<skill>/<event>/`; `memento skills rollback <skill>`.
  9. After a low-utility rebuild the skill starts a new utility generation at prior 0.5, old generation kept in `reset_from`.
- Approval: fully automatic; `protected_skills` list (filesystem, skill-creator, uv-pip-install, web-search) is the only human-set fence.
- Eval: benchmark gains on GAIA (+26.2% relative) and HLE (+116.2%) per the arXiv abstract (author-reported). README also mentions a `daemon/dream/` background consolidation package (UNVERIFIED in detail).
- Failure modes: none reported in fetched pages (UNVERIFIED).

## 4. MUSE-Autoskill (arXiv 2605.27366)
- URL: https://arxiv.org/abs/2605.27366. Only the abstract was read (raw/muse.html); details UNVERIFIED.
- Lifecycle named in abstract: creation, memory, management, evaluation, refinement; per-skill experience accumulation; skill catalog retrieval. Claims self-created skills beat human-authored ones on the SkillsBench covered subset (85.24% vs 81.17%) and beat Hermes/Codex/Claude Code in reported settings. "Under review", so treat as unreviewed.

## 5. Anthropic skill-creator (anthropics/skills)
- URL: https://raw.githubusercontent.com/anthropics/skills/main/skills/skill-creator/SKILL.md (repo 181k stars). VERIFIED (raw/skillcreator.md). I did not find a separate Anthropic page on mining transcripts; the file itself says to read transcripts of test runs.
- Loop (human-in-the-loop, runs inside Claude Code):
  1. Capture intent via interview; write SKILL.md draft.
  2. Write test prompts; spawn in the same turn a with-skill run and a baseline run per case (baseline = no skill for a new skill, or a snapshot of the OLD skill when improving).
  3. Draft assertions while runs execute; record timing/tokens.
  4. Grader subagent grades assertions to grading.json; aggregate_benchmark; analyst pass looking for patterns aggregate stats hide; open a viewer with Outputs and Benchmark tabs where the user leaves feedback per case.
  5. Improve: generalize from feedback rather than overfit to examples; keep prompt lean (read transcripts to find wasted steps); explain the why; promote helper scripts that every run re-invented.
  6. Re-run into iteration-N+1 with baselines; viewer shows previous output/feedback; repeat until the user is happy or progress stops.
  7. Optional blind comparison (comparator agent) between versions.
  8. Description optimization: generate trigger/non-trigger queries, user edits the set, loop with 60% train / 40% held-out test, each query run 3 times for a reliable trigger rate, up to 5 iterations.
- Approval: human reviews every iteration. Evaluation: assertion grading + baseline delta + blind comparison + held-out trigger test. Versioning: iteration directories and a pre-edit snapshot copy (no git requirement). Failure modes stated: overfitting to the test examples, bloated prompts, bad eval queries produce bad descriptions.

## 6. GEPA / DSPy (gepa-ai/gepa, dspy.GEPA, MIPROv2)
- URLs: https://github.com/gepa-ai/gepa (7.0k stars), https://arxiv.org/abs/2507.19457, https://dspy.ai/current/api/optimizers/GEPA/overview/. README VERIFIED (raw/gepa-readme.md); MIPROv2 internals UNVERIFIED (named only in the Hermes PLAN as a Bayesian-optimization fallback).
- Loop (README): select a candidate from the Pareto frontier -> execute on a minibatch capturing full traces -> LLM reflects on traces and diagnoses -> mutate using lessons accumulated from ancestors -> accept into the pool if improved, update frontier; optional system-aware merge of two Pareto candidates. "Actionable Side Information" (error text, profiler output) from the evaluator is the reflection input.
- Needs trainset + valset + metric; adapter interface (`evaluate`, `make_reflective_dataset`). Approval: none, it is a library; callers decide. Rollback: candidate pool = versions. Failure modes: not stated in README; the Hermes PLAN adds external guards (length, tests).

## 7. Voyager (MineDojo; NVIDIA-authored, Minecraft)
- URL: https://github.com/MineDojo/Voyager (7.3k stars, inactive since 2024-04), https://arxiv.org/abs/2305.16291. README VERIFIED (raw/voyager-readme.md).
- Loop: automatic curriculum proposes next task -> iterative prompting with environment feedback, execution errors and self-verification refines the program -> verified program stored in an ever-growing skill library of executable code -> reused in new worlds. No weights updated.
- Approval: none (autonomous). Eval: self-verification in game. Versioning/rollback: UNVERIFIED (skill library directories per trial). Failure modes: UNVERIFIED.

## 8. Darwin Godel Machine (Sakana / UBC) and SICA (Bristol)
- DGM: https://github.com/jennyzzt/dgm (2.4k stars), https://arxiv.org/abs/2505.22954. Abstract + README VERIFIED. Loop: keep an archive of coding agents -> sample one -> foundation model proposes a modified version of its own code -> empirically validate on coding benchmarks (SWE-bench, Polyglot) -> add to archive (open-ended tree, not only the best). Approval: none in loop; README warns about executing untrusted model-generated code and requires Docker. Rollback: archive is the lineage; any ancestor can be resampled. Specific failure modes (e.g. benchmark gaming) UNVERIFIED -- paper body not read.
- SICA: https://github.com/MaximeRobeyns/self_improving_coding_agent (406 stars), https://arxiv.org/abs/2504.15228. README + abstract VERIFIED. Loop: evaluate current agent on benchmark tasks -> store results in archive -> run the agent on its own codebase to improve -> repeat with the updated code. Abstract reports 17% -> 53% on a SWE-Bench Verified subset. Must be run inside the provided Docker image. Failure modes UNVERIFIED.

## 9. OpenClaw "Dreaming" (memory, not skills)
- URL: https://docs.openclaw.ai/concepts/dreaming (OpenClaw 392k stars). VERIFIED (raw/openclaw-dream.html). It consolidates MEMORY.md, not skills, but the promotion mechanics are the closest analogue to "promote a lesson".
- Loop per sweep (on by default; cron-driven): Light phase (dedupe recent signals, stage candidates, never writes MEMORY.md) -> REM (themes/reflections, never writes) -> Deep (weighted scoring with thresholds minScore, minRecallCount, minUniqueQueries all required; rehydrate snippets from live files so stale ones are skipped; tool-free LLM chooses add/merge/supersede against current MEMORY.md; falls back to append-only if rewrite fails validation; stores preimages before an accepted rewrite; limit on prior-entry loss).
- Signals: only interactive sessions are ingested; cron/heartbeat/subagent sessions excluded; recalled context stripped so memory cannot be re-learned; admission policy and `memory forget`. Reports give counts of why candidates were not promoted.
- Admitted gap: transcript text is not secret-masked before ingestion.

## 10. Letta sleep-time agents
- URL: https://www.letta.com/blog/sleep-time-compute. Only the intro was read; mechanics UNVERIFIED. Stated idea: agents use idle time to reorganize/rewrite their memory state ("sleep-time compute"). Approval, evaluation, rollback not verified.

## 11. Devin Knowledge (Cognition)
- URL: https://docs.devin.ai/product-guides/knowledge. VERIFIED (raw/devin-knowledge.html).
- Loop: Devin automatically suggests Knowledge from the user's feedback in chat; user edits before saving or dismisses; can ask Devin to regenerate the suggestion; Devin can also suggest updates to existing items. Scoped to repo/org/enterprise; items can be disabled per user without deletion; org knowledge can be promoted to enterprise.
- Approval: human accepts every item. Eval: none stated. The page says Knowledge is deprecated and being migrated to Skills in Plugins. Playbooks not fetched (UNVERIFIED).

## 12. Paperclip (paperclipai)
- URL: https://github.com/paperclipai/paperclip (100k stars), README in raw/paperclip-readme.md. VERIFIED only at README level.
- Relevant: "Skill Studio": shared org-wide skills, saved test inputs and runs, eval results, skill version history and restore; README table lists "active learning loops", "performance reviews for agents", approvals and review gates. No automatic skill-rewriting loop is described in what I read, so it looks like a human-curated skill registry with evals and versions (UNVERIFIED beyond README).

## 13. Not verified / skipped
- Cursor rules auto-generation, Aider conventions, OpenHands, SWE-agent self-improvement: searches returned only marketing/noise; no primary docs fetched. UNVERIFIED, no claims made.
- EvoAgentX and other >500-star "self-evolving agent" repos: GitHub API returned nothing for EvoAgentX/EvoAgentX (repo name likely wrong); no survey repo checked. Verified in-range candidates: Memento-Skills (1.6k), hermes-agent-self-evolution (5.5k), gepa (7.0k).
- AutoSkills: no hit found.

## Comparison table
| System | Signals | Proposer | Eval | Human gate | Versioning | Rollback |
|---|---|---|---|---|---|---|
| Hermes Self-Evolution | session DB traces, failed sessions, synthetic cases | GEPA reflective mutation | held-out set, tests, size/semantic gates, benchmarks | PR merge (always) | git | git revert |
| Hermes runtime skill_manage + curator | agent experience, user corrections, usage counts | the agent / background review fork | none for content; linter warns | optional write_approval | archive dir | recover from .archive |
| Memento-Skills | failed traces, per-skill utility | LLM rewriter after single-skill attribution | parse/compile/unit/synthetic test + judge | none (protected list) | backups + events.jsonl | atomic swap, `skills rollback` |
| Anthropic skill-creator | test runs vs baseline, user feedback, transcripts | the model, guided by feedback | assertions, baseline delta, blind compare, held-out trigger set | user reviews each iteration | iteration dirs + snapshot | manual (snapshot) |
| GEPA/DSPy | minibatch traces + evaluator side info | LLM reflection + merge | valset metric, Pareto frontier | n/a (library) | candidate pool | pick earlier candidate |
| Voyager | env feedback, errors, self-verification | LLM code gen | in-game critic | none | skill library dir | UNVERIFIED |
| DGM | benchmark scores | foundation model edits own code | SWE-bench/Polyglot | none (sandbox warning) | archive tree | resample ancestor |
| SICA | benchmark results | agent edits own code | benchmark | none (Docker) | archive | UNVERIFIED |
| OpenClaw Dreaming | recalled snippets, daily notes, interactive transcripts | tool-free LLM at deep phase | score thresholds (recall count, unique queries) | none | preimage store | preimage + append-only fallback |
| Devin Knowledge | chat feedback | Devin suggestion | none stated | user accepts/edits | per item, disable | disable/delete |
| Paperclip Skill Studio | saved test inputs | humans | saved test runs / evals | humans | version history | restore |

## Patterns that recur in >=3 systems
1. Propose-then-gate: the candidate is built off to the side (copy dir, git branch, staged pending file, archive entry) and the live artifact changes only after gates pass (Hermes Self-Evolution, Memento, Hermes write_approval, skill-creator snapshots, OpenClaw preimages).
2. Failure traces, not scalar scores, are the reflection input (GEPA, Hermes Self-Evolution, Memento attribution, Voyager error feedback, skill-creator "read the transcripts").
3. Held-out evaluation separate from the data used to propose (Hermes PLAN train/val/test, GEPA valset, skill-creator 60/40 description split, DGM/SICA benchmarks).
4. Baseline comparison against the previous version (skill-creator old-skill baseline, Hermes before/after metrics, Memento utility generations).
5. Size/length and drift constraints on the artifact (Hermes 15KB + length penalty, linter oversized-body, skill-creator "keep lean").
6. Lifecycle hygiene as a separate background pass: stale/archive, consolidate, dedupe (Hermes curator, OpenClaw dreaming, Memento dream daemon, Devin disable).
7. Soft-delete rather than delete (Hermes archive, Memento backups/failed, Devin disable, Paperclip restore).
8. Audit log of each change (Memento events.jsonl, git history, OpenClaw reports).
9. Protected/pinned artifacts the improver may not touch (Memento protected_skills, Hermes pin, hub skills, cron-referenced skills).
10. Human approval is the default for anything that ships (Hermes PR, skill-creator viewer, Devin accept/edit), while the fully autonomous ones (Memento, DGM, SICA, Voyager) rely on sandbox plus automated gates.

## Things nobody (in what I read) does
- Reports an empirical post-deploy regression monitor that auto-rolls back a skill after live use degrades. The Hermes PLAN proposes threshold-triggered re-optimization (planned, not implemented); Memento's utility score is the nearest thing, but it triggers rewrite, not rollback.
- Separates grader from proposer to stop the proposer gaming the eval (only skill-creator's blind comparator is documented).
- Keeps a rejected-proposals memory so the same bad edit is not re-proposed (Memento keeps failed candidates, but no reuse is stated).
- Publishes measured failure-rate data for self-written skills (failure modes are mostly design-time warnings, not incident data).
- Treats agent DEFINITIONS (role prompts, tool permissions) as a first-class evolved artifact; targets are skills, memory or code. Only the Hermes PLAN lists system-prompt sections, and that is "Planned".
- Scrubs secrets/PII from transcripts before mining (OpenClaw explicitly admits it does not).

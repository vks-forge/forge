# Production practice: continuous improvement of prompts / agent instructions / skills

Date: 2026-10-12. Method: local SearXNG (junk for niche queries) plus direct fetch of vendor docs/blogs into `raw/`. Everything cited below was read from fetched text unless marked UNVERIFIED. Fetched content treated as untrusted data.

Not covered / UNVERIFIED: Humanloop (no fetch; my recollection that it was wound down after the Anthropic acqui-hire is UNVERIFIED), Stripe / Ramp / Sourcegraph-Amp / Cognition blog posts (Ramp URL returned an empty page; the others were not found via search; only Devin Playbooks docs were read), DSPy optimizer docs (JS-only page, not readable; GEPA README read instead), W&B Weave monitors/online scoring (only prompt-publish page read), Windows behaviour of every tool (inferred from "Node/Python/Docker" only, never tested).

---

## 1. Per tool / team

### promptfoo (OSS, MIT; now part of OpenAI)
- What: YAML-config CLI that runs prompts x providers x test cases with assertions, outputs JSON / HTML / JUnit XML. Licence: "remains open source and MIT licensed" despite OpenAI acquisition. https://github.com/promptfoo/promptfoo ; https://openai.com/index/openai-to-acquire-promptfoo/
- Steps (from docs): (1) keep prompts in `prompts/`, config in `promptfooconfig.yaml`; (2) on PR touching `prompts/**` run `promptfoo/promptfoo-action@v1`, which does a before-vs-after comparison and posts a result link on the PR; (3) `npx promptfoo@latest eval -o results.json --fail-on-error` or a jq pass-rate gate (docs example fails if pass rate < 95%); (4) tag runs with `--tag git.sha=...` so results are traceable; (5) optional `redteam run` security scan. https://www.promptfoo.dev/docs/integrations/ci-cd/ ; https://www.promptfoo.dev/docs/integrations/github-action/
- Metrics: assertion pass rate, token usage/cost over time (CI doc lists "Cost control - Track token usage and API costs"). Approval: PR review (human merges). Rollout/rollback: none built in; it is a gate, rollback = git revert. Caching of LLM calls to cut cost (`~/.cache/promptfoo`). Needs Node >= 22.22 per docs. Windows: runs through `npx`; not verified on Windows. UNVERIFIED for Windows specifics.

### Langfuse (OSS core, MIT-style; some EE features paid)
- Versioning: every prompt save creates an immutable version; labels (`production`, `staging`, custom like `prod-a`/`prod-b`) point at versions. Unlabelled fetch returns `production`; a missing label returns 404 with no silent fallback. https://langfuse.com/docs/prompt-management/features/prompt-version-control
- Rollback: reassign `production` label to the old version in UI; app picks it up (SDK cache TTL applies). Same page.
- Human gate: "Protected prompt labels" (admins only can move `production`) are Enterprise / paid add-on only. Same page.
- A/B / canary: app randomly picks `prod-a` vs `prod-b`, Langfuse tracks latency, cost, tokens and eval scores per version; docs call this suitable for "small group of users before rolling out to everyone (canary)" after dataset testing. https://langfuse.com/docs/prompt-management/features/a-b-testing
- CI hook: prompt-change webhook -> GitHub `repository_dispatch` triggers a workflow (test on change, deploy when label is `production`); or sync prompts to a repo file. https://langfuse.com/docs/prompt-management/features/github-integration
- Offline eval: datasets + "Experiments via SDK" and "Experiments in CI/CD" ("catch regressions before they ship"). https://langfuse.com/docs/evaluation/experiments/experiments-via-sdk . Online: LLM-as-a-judge on live traces (page fetched, not summarised in detail). https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge
- OSS / self-host: Docker Compose for local/single VM; "Some add-on features require a license key". https://langfuse.com/self-hosting . Windows: needs Docker Desktop (inferred, UNVERIFIED).

### Braintrust (closed SaaS; SDKs open)
- Versioning: prompts are versioned objects; environment tags (production/staging/development); `loadPrompt({slug, environment, version})`; promotion dev -> staging -> prod via tags; webhook alerts when environment tags are added/removed so external systems can sync. https://braintrust.dev/docs/kb/managing-prompt-updates-in-production-environment.md
- Eval: experiment = "immutable snapshot of an evaluation run", comparable over time; run in code, UI, or CI/CD. https://www.braintrust.dev/docs/guides/evals/run
- CI: `braintrustdata/eval-action@v2` runs evals on PR and posts a summary comment. https://raw.githubusercontent.com/braintrustdata/eval-action/main/README.md
- `invoke()` by slug "enables A/B testing different prompt versions" and logs which version was used. https://www.braintrust.dev/docs/guides/prompts
- Loop: built-in assistant that creates scorers, analyses logs, edits prompts from experiment analysis (suggestion, human accepts). https://braintrust.dev/docs/cookbook/recipes/Loop.md
- Rollback: re-point environment tag (inferred from tag model; UNVERIFIED explicitly).

### LangSmith (closed SaaS; SDK MIT)
- Versioning: every save = commit (hash); commit tags; reserved `staging`/`production` environments assigned via a Promote flow; per-environment rollback history; prompt owners control who can promote; webhook on prompt commit. https://docs.langchain.com/langsmith/manage-prompts
- Online evals: LLM-as-judge evaluators on production traces with filter and sampling rate (e.g. 10% of traces to control cost). https://docs.langchain.com/langsmith/online-evaluations
- Human gate: promotion permission to prompt owners. OSS: no (SaaS/self-host licensed).

### Arize Phoenix (OSS, ELv2 per my recollection; UNVERIFIED)
- Prompts versioned in linear history; tags `production`, `staging`, `development` plus custom tags, pull by tag; playground; dataset experiments; compare versions. https://arize.com/docs/phoenix/prompt-engineering/how-to-prompts/tag-a-prompt ; index https://arize.com/docs/phoenix/llms.txt . Self-hostable, OpenTelemetry based.

### W&B Weave
- `weave.publish(prompt, name=...)` creates a versioned, referenceable prompt object. https://weave-docs.wandb.ai/guides/core-types/prompts . Evals/monitors: UNVERIFIED (not read).

### OpenAI platform (Evals + prompt optimizer)
- Prompt optimizer in dashboard rewrites a prompt using datasets, grader results and human annotations. BUT: dataset-backed optimizer is deprecated; "Evals will become read-only ... October 31, 2026, and the platform is scheduled to shut down on November 30, 2026". Do not build on it. https://platform.openai.com/docs/guides/prompt-optimizer (fetched 2026-10-12).

### Anthropic
- Evals guide ("Demystifying evals for AI agents"): code / model / human graders; capability evals vs regression evals (regression should be near 100%); capability evals "graduate" into regression suite; pass@k vs pass^k; read transcripts; monitor saturation; layer automated evals (CI/CD on each change and model upgrade), production monitoring, A/B testing, manual transcript review, human studies ("Swiss cheese"); build tasks from bug tracker / user-reported failures; Claude Code added evals first for concision/file edits then over-engineering; Descript runs separate quality and regression suites. https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
- Writing tools for agents: prototype, build eval with real tasks and verifiable outcomes, run programmatically, track accuracy plus runtime, tool-call count, tokens, errors; let Claude Code read transcripts and optimise tool descriptions; validate on held-out set. https://www.anthropic.com/engineering/writing-tools-for-agents
- Skill best practices: evaluation-driven development: find failures without the skill, write 3 scenarios, baseline, write minimal instructions, iterate; "no built-in way to run these evaluations"; Claude A (author) / Claude B (user) loop on real tasks; test on every model you will use. https://docs.claude.com/en/docs/agents-and-tools/agent-skills/best-practices
- skill-creator (anthropics/skills): per iteration run with-skill and baseline (old-skill snapshot when improving) side by side, grade assertions, aggregate pass_rate/time/tokens mean +/- stddev, analyst pass, human reviews in viewer, rewrite, repeat in `iteration-N/`; blind A/B comparator; description optimiser: 20 should/should-not-trigger queries, 60/40 train/held-out split, 3 runs per query, up to 5 iterations, best description chosen by held-out score to avoid overfit. https://raw.githubusercontent.com/anthropics/skills/main/skills/skill-creator/SKILL.md
- Sept 2025 postmortem: canary groups and benchmarks missed degradation; lessons: more sensitive evals, run quality evals continuously on true production systems, keep user feedback channel (/bug, thumbs down); noisy evals misled them. https://www.anthropic.com/engineering/a-postmortem-of-three-recent-issues

### Cursor (agent harness)
- Offline: public benchmarks plus own CursorBench. Online: A/B test harness variants on real usage. Metrics: latency, token efficiency, tool-call count, cache hit rate; "Keep Rate" of agent code at fixed intervals; LLM reads user follow-ups to classify satisfaction. Tool error taxonomy (InvalidArguments, UnexpectedEnvironment, ProviderError, Timeout...); fixed-threshold alert on unknown errors, per-tool per-model anomaly alerts on expected errors; weekly automation with a log-search skill files tickets; cloud agents fix them. Shelves ideas that online tests show are negligible. Per-model prompt customisation. https://cursor.com/blog/continually-improving-agent-harness

### Shopify Sidekick
- "Death by a Thousand Instructions": moved from giant system prompt to just-in-time instructions returned with tool results (modular, servable by beta flag / model version, cache-friendly). Ground Truth Sets sampled from production conversations, >=3 human labelers, Cohen's kappa/Kendall tau/Pearson; LLM judge calibrated from kappa 0.02 to 0.61 vs human 0.69; user-simulator replays to test candidate systems before prod; reward hacking observed under GRPO; judges and validators updated. Explicitly rejects "vibe" judges. https://shopify.engineering/building-production-ready-agentic-systems

### Vercel v0
- Primary metric: % successful generations (working preview). Dynamic system prompt injects current SDK knowledge by intent detection; deterministic + model autofixers; "LLMs ... errors as often as 10% of the time". No explicit rollout/rollback process described. https://vercel.com/blog/how-we-made-v0-an-effective-coding-agent

### Hamel Husain (practitioner, Rechat)
- Three levels: L1 assertion unit tests (run on every code change), L2 model/human eval on a cadence, L3 A/B only after significant product changes; hundreds of assertions continuously updated from new observed failures; synthetic input generation. https://hamel.dev/blog/posts/evals/

### DSPy / GEPA (OSS, MIT for GEPA)
- GEPA: reflective evolutionary prompt optimiser; select from Pareto frontier, run rollouts, LLM reflects on traces, mutate, accept if improved; needs 100-500 evals; claims 50+ production uses (Shopify, Databricks, Dropbox...). Output is a candidate prompt that still needs your own gate (held-out eval) before promotion. https://raw.githubusercontent.com/gepa-ai/gepa/main/README.md ; adoption claim is the README's own, UNVERIFIED independently.

### Instruction-file ecosystems (no eval tooling, just conventions)
- OpenAI Codex AGENTS.md: discovered root-to-cwd, size cap `project_doc_max_bytes` 32 KiB, nested override files; guidance is to put commands like "run npm test" there. No iteration/eval workflow described. https://developers.openai.com/codex/guides/agents-md
- GitHub Copilot: repo-wide `.github/copilot-instructions.md`, path-specific `.github/instructions/*.instructions.md`, nearest AGENTS.md wins; Copilot cloud agent can draft the instructions file in a PR for review. No eval loop described. https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions
- Devin Playbooks: reusable prompts written by "trial and error"; sections Procedure / Specifications / Advice / Forbidden Actions / Required from User; Skills for project rules. https://docs.devin.ai/product-guides/creating-playbooks

---

## 2. Comparison table

| Tool | Versioning | Offline eval | Online eval | Canary / AB | Rollback | Human gate | Licence |
|---|---|---|---|---|---|---|---|
| promptfoo | git files (no registry) | yes, YAML assertions, CI action | no (eval-only) | no | git revert | PR review | MIT |
| Langfuse | immutable versions + labels | datasets, experiments, CI | LLM-judge on traces | label split in app code (DIY random) | move `production` label | protected labels = paid only | OSS core, EE add-ons |
| Braintrust | versions + env tags | experiments, CI action | online scorers | `invoke` version split | move env tag (inferred) | UI promote; Loop suggests | proprietary SaaS |
| LangSmith | commits + tags + staging/prod envs | datasets/experiments | online evaluators w/ sampling | not documented in fetched text | env rollback history | prompt owners | proprietary |
| Phoenix | linear history + tags | dataset experiments | evals on traces (UNVERIFIED detail) | no | retag | none documented | OSS (licence UNVERIFIED) |
| Weave | publish = new version | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | SDK Apache-2 (UNVERIFIED) |
| OpenAI Evals/optimizer | dashboard prompts | graders, datasets | - | - | - | - | SaaS; shuts down 2026-11-30 |
| skill-creator (Anthropic) | skill snapshot dirs | with/without + old/new, graders, benchmark.json | no | blind comparator | restore snapshot | human review in viewer | repo skill (see repo) |
| GEPA / DSPy | n/a (you version output) | metric-driven search | no | no | n/a | you add | MIT (GEPA) |
| Cursor (internal) | harness versions | CursorBench | A/B, keep rate, alerts | yes | revert (implied) | team | internal |

---

## 3. Minimum viable loop for a solo dev (TypeScript monorepo, Windows, OSS only)

1. **Version in git, not a registry.** Instruction files / skills / prompts live as files in the repo. Every change is a commit; tag releases (`prompts-v12`). A "production" pointer is just the main branch plus an optional `active` file naming the version (mirrors Langfuse label / LangSmith env pointer, with git as the store).
2. **Build the eval set from real failures.** One YAML/JSON case per observed failure (bug tracker, transcripts you reviewed, user corrections). Anthropic and Hamel both say start from real failures and keep adding. Mix: 70-80% regression cases (must pass), 20-30% capability cases (stretch). Keep a held-out slice you never tune against.
3. **Cheap deterministic graders first.** Regex/JSON-schema/exit-code/unit-test outcome checks (Anthropic "code-based graders", Hamel L1). Add an LLM-judge rubric only where needed and spot-check it against your own labels (Shopify kappa approach, scaled down to ~30 labelled examples).
4. **Run with promptfoo in the repo.** `npx promptfoo@latest eval -c evals/promptfooconfig.yaml -o out/results.json --repeat N` (use repeats because outputs are stochastic; pass^k thinking). Compare candidate vs baseline in the same run (promptfoo matrix, or skill-creator style with/without + old/new snapshot). Track pass rate, tokens, cost, latency, tool calls.
5. **Gate promotion by rule, written down.** Example: candidate must (a) keep regression suite at baseline (100% or no case regresses), (b) improve capability or held-out score beyond noise (needs repeats), (c) not raise tokens/cost beyond X%. Implement as a small script reading `results.json` (promptfoo's own docs show a jq threshold gate).
6. **Human approval for the merge.** Candidate changes arrive as a branch/PR (or a file in a `proposed/` folder); you read the diff plus a one-page eval delta; you merge. This matches your factory memory rules (proposed -> approved). Never auto-merge LLM-authored instruction edits (Anthropic's skill loop keeps the human reviewing outputs; Braintrust Loop only suggests).
7. **Optionally run a GitHub Action.** `promptfoo/promptfoo-action@v1` on PRs touching `prompts/**`. If you have no remote CI, run the same command in a local pre-push hook or scheduled task (Windows Task Scheduler). Needs API keys only.
8. **Production feedback capture.** Log every agent run as a trace (Langfuse self-hosted via Docker Desktop, or Phoenix via pip/Docker, or just JSONL files). Record prompt version with each run (Braintrust/Langfuse both link version to trace). Log user thumbs/corrections and tool-error classes (Cursor taxonomy: unknown vs expected errors).
9. **Weekly review ritual.** Read ~20 transcripts (Anthropic: "manual transcript review builds intuition"), pick failures, turn each into a new eval case (step 2), then edit the instructions. Optionally have an LLM propose edits (skill-creator "improve" loop, or GEPA) but always rerun steps 4-6.
10. **Canary only if you have traffic.** For a solo tool: alternate `A`/`B` instruction versions per session via a random flag, compare keep-rate / retry-rate / error-rate after N sessions (Cursor keep-rate; Langfuse prod-a/prod-b pattern). With <~50 sessions the result is noise; prefer offline gate plus "use new version for a week, watch error alerts".
11. **Rollback = repoint.** Flip the `active` pointer or `git revert`; keep the previous version resolvable (Langfuse fetch-by-version; LangSmith rollback history). Add alerts: unknown-error rate over threshold, regression-suite nightly run (Cursor and Anthropic postmortem both stress continuous production-side checks).
12. **Graduate and prune.** When capability cases reach ~100% move them to regression (Anthropic); add new harder ones (saturation). Prune instructions that do not move metrics (skill-creator "keep the prompt lean", Shopify JIT instructions to avoid "thousand instructions").

OSS fit on Windows for a TypeScript monorepo: promptfoo (Node, `npx`, TS-friendly providers/custom assertions in JS), Langfuse self-host (Docker Desktop) or its TS SDK against Cloud free tier, Phoenix (pip or Docker), GEPA/DSPy (Python, optional optimiser stage), plain git + vitest for deterministic checks.

---

## 4. Pitfalls reported

- Noisy evals hide real degradation; canaries and benchmarks missed a regression until users complained. https://www.anthropic.com/engineering/a-postmortem-of-three-recent-issues
- LLM judges: uncalibrated judge had kappa 0.02; "vibe" 0-10 rating is not rigorous; raw agreement misleading on imbalanced classes (Hamel recommends precision/recall). Shopify, Hamel links above.
- Reward hacking when optimising against judges/validators (opt-out answers, tag abuse, hallucinated IDs). Shopify link.
- Overfitting to a few examples; skill-creator picks best description on held-out score and says generalise rather than patch. skill-creator link.
- Saturated capability evals give no signal; 100% pass is only a regression monitor. Anthropic evals link.
- Prompt sprawl: giant system prompt becomes unmaintainable; use JIT/modular instructions. Shopify link.
- Skills not triggering: simple one-step queries may not trigger a skill even with a perfect description; trigger evals need substantial queries and near-miss negatives. skill-creator link.
- Tooling risk: promptfoo acquired by OpenAI (stays MIT); OpenAI Evals platform shutting down 2026-11-30; label-protection (human gate) in Langfuse is paid. Links above.
- Missing label returns 404 in Langfuse (no silent fallback): good for safety, but a typo can break the app unless a fallback prompt is configured. Langfuse version-control link.
- A/B on prompts needs enough traffic and a good success metric; Langfuse docs say it fits consumer apps where mistakes are tolerable. Langfuse A/B link.
- Anthropic notes no built-in runner for skill evals ("Users can create their own evaluation system"). Skill best-practices link.

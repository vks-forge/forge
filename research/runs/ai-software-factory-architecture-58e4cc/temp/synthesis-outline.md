# Synthesis outline

## Executive summary
State the thesis directly: the factory is buildable today, but as a graduated, risk-tiered system governed by one rule — self-report triggers, external process gates consequence — not as the uniformly-autonomous system the brief's wording implies. Name the four empirical correctives (cross-model review asymmetry, the incident's safety-classifier confound, the pentest-autonomy regression, the subscription-enforcement precedent) in one tight paragraph, then state that each becomes a design parameter, not a reason to abandon the brief.

## Strongest objections answered (short, before Section 1)
State the maximalist objection (humans are the bottleneck to remove; 93% rubber-stamp rate proves per-action review is theater) and the skeptical objection (the OpenAI-HF incident proves scale is unsafe) at full strength, then answer both with the same move: the incident's own counterfactuals show governance — not fewer humans or more scale — is the variable that mattered; rubber-stamping shows per-action approval is the wrong control, not that control is unnecessary.

## I. Zero-Hallucination & Quality Control (Adversarial Validation)
Establish that "zero hallucination" is a pipeline property, not a model property. Cross-model review helps only when the critic is measurably stronger and constrained to executable evidence; elaborate critique prompts backfire. Independent test authorship solves the "bad tests" problem Berkeley names. Rigid pass^k evals gate human review, with graders themselves audited. Blast-radius scoring (built from observed, provenance-labeled graph edges, not LLM inference) sets the autonomy tier. Name the "Jav AI" gap and resolve it as the arbiter role.

## II. Advanced Skill Sequences (SOPs to Agent Skills)
SOP-to-Skill mapping is a solved packaging problem (progressive disclosure, scripts for deterministic steps). Price the real token overhead (37-57%) rather than treating Skills as free. Probabilistic sequencing composes two real 2026 results (FSM trace prediction + PASTE speculative execution) into one architecture, gated by an idempotent-vs-mutating speculation tier — mutating Skills only stage, never commit, speculatively.

## III. Reverse Engineering & Codebase Mastery
Legacy understanding is genuinely accelerated (70-85% faster) but only checkable by humans at the margins (MITRE's assembly-code inter-rater reliability of 0.12-0.22). Dependency/network mapping comes from observed artifacts (egress-proxy logs, call graphs), with LLM inference labeled as hypothesis, never fact. Decompilation of binaries is a named audited absence. The 90-minute sweep runs detection at near-full autonomy; auto-patch splits by risk class, with production merges always named-human (SOC 2 CC4.1 pattern), per OWASP APTS.

## IV. Open Source Architecture Reading & Context Ingestion
ADRs must compile into deterministic hooks and lint rules — reading them into context is advisory, not enforcement. Context isolation runs on sandbox-scoped checkouts, sub-agent summarization, and automatic offload/compaction thresholds; the same boundary that isolates context also isolates permissions.

## V. Triggers, Infrastructure, and Continuous Operation
Event-driven triggers replace the prompt, but every trigger is untrusted input requiring normalization into typed, quarantined records. The Director/100+Worker infrastructure is solved (Sierra Agency, E2B, Anthropic's own orchestrator-worker system). The OpenAI-HF incident is reframed: ungoverned agents at scale are dangerous; governed ones are unproven but not refuted. Two-pool design: read-only scales to 100+ immediately; the mutating pool starts small and raises its cap only on coordination-monitor and escalation-rate evidence — the one primitive nothing in the corpus ships today.

## VI. Cost & Resource Optimization
Subscription pooling is the one cost tactic vendors have named and enforced against (client impersonation, not automation generically, is the real line); all unattended work runs on metered API keys with caching and batching. Concrete sandbox cost figures replace the qualitative gap. Idle agents self-terminate only via an outcome token (CLEAN/ISSUE_FOUND/INCOMPLETE) checked by an external supervisor — the agent proposes silence, it never decides it.

## VII. High-Level Architecture (Mermaid Diagram)
One five-plane diagram: Trigger Plane (untrusted input) → Director/Control Plane → Execution Plane (read-only + mutating pools, isolated sandboxes) → Verification Plane (gates, critic, arbiter, outside agent control) → Oversight Plane (coordination monitor, kill-switches, outcome-token supervisor, cost governor). Every arrow into a consequence passes through a component no agent can write to.

## VIII. Implementation Phasing
Adopt the autonomy-ledger framing: a versioned policy table naming, per action class, whether agents act alone, act behind a machine gate, or need a named human. Five to six phases from foundations/measurement through read-only autonomy, bounded PR-gated writes, conditional auto-merge for low-blast-radius classes, fleet scale-out (gated on the still-missing 100+-worker telemetry), to selective pipeline autonomy for low-stakes domains only. Each phase has a measurable exit gate; demotion is automatic on incident.

## IX. Recommended Tech Stack
Models (capability-matched generator/critic pairing, not fixed vendor assignment), orchestration (thin custom Director by default; LangGraph if a framework is wanted), Agent Skills, FSM+PASTE skill prediction, sandboxes (Sierra/E2B/Northflank-class with concrete pricing), evals/observability (Harbor, Braintrust, LangSmith, Langfuse), security scanning (Semgrep/CodeQL/agentic AI-SAST/OWASP APTS), billing (metered API + caching/batch, subscriptions for named humans only).

## X. Example Pseudo-code — Adversarial Agentic Loop
One worked function for a single ticket (context-scoped sandbox → independent test authorship → deterministic gates → capability-matched critic producing executable evidence → order-robust arbiter → pass^k evals → blast-radius-gated consequence routing) plus one oversight/supervisor loop running outside every agent (outcome-token freshness check, coordination monitor, kill-switch, graduated throttling).

## Closing
State plainly: the factory is buildable and should be built, one action class at a time, with the governing invariant as its one non-negotiable design rule. Name the three open empirical gaps honestly (no published 100+-worker incident telemetry, no governance-overhead cost figure, no decompilation benchmark) as the evidence the factory itself will have to generate.

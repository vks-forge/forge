# Synthesis plan

## Core thesis (1-2 sentences)
The six-pillar autonomous Software Factory is buildable today, but only as a **graduated, risk-tiered system governed by one invariant** — an agent's self-report may trigger action, but only a process the agent cannot control may gate the consequence — not as the uniformly-autonomous, minimally-reviewed, human-free system the brief's literal wording implies. Every pillar's design question reduces to the same move: identify what verification must sit *outside* the agent's own failure surface, and bind autonomy to measured, versioned evidence rather than granting it uniformly on day one.

## The 3-7 strongest argumentative beats
1. **The governing invariant, stated once, applied six times** — sourced from all three drafts converging independently. This is the spine: self-report triggers, external process gates. Name it in the executive summary and then show it instantiated in each pillar (test authorship separation, cross-refute review, outcome tokens, network kill-switches, auto-flag/auto-patch split, named-human signoff table) rather than repeating the justification each time.
2. **The OpenAI-Hugging Face incident reframed as evidence FOR governance, not against scale** — sourced from Draft A/B/C equally. The safety-classifier-disabled confound, OpenAI's own >100x counterfactual, and the "no source isolates agent count as a causal variable" finding. This is the single highest-leverage move: it takes the strongest objection to the whole blueprint and inverts it into the design's core justification.
3. **Cross-model adversarial review is conditional, asymmetric, and sometimes harmful — the fix is execution-grounded evidence, not model opinion** — sourced from all three. Asymmetric 71.6%→89.7% vs 91.4%→82.8% result, 87.9% false-rejection under elaborate prompting, debate-doesn't-help-code finding. Resolve into: critics manufacture executable evidence (failing tests, mutants, counterexamples); a deterministic/order-robust arbiter judges the evidence, not the critic's opinion.
4. **The pentest-autonomy regression (29%→9%) splits detection from remediation** — sourced from Draft A/B/C. Auto-flag at near-full autonomy; auto-patch split by risk class (reachability-confirmed dependency bumps to staging only; everything else flag-only; production always named-human). OWASP APTS as the governance skeleton.
5. **The subscription-pooling "arbitrage" is the one cost tactic vendors have already named and enforced against** — sourced from all three, with Draft C's framing of client-impersonation vs. automation-in-general as the sharpest distinction. Individually-owned subscriptions for humans; metered API for every unattended workload.
6. **The autonomy ledger / phased rollout with named-human-signoff table** — primarily Draft C's structural contribution, reinforced by A's and B's phasing. This is the single most actionable deliverable for the "Step-by-Step Implementation Phasing" required section — use it as the backbone.
7. **Outcome tokens (CLEAN/ISSUE_FOUND/INCOMPLETE) as the small-scale instance of the governing invariant** — sourced from all three identically. Every platform idle-mechanism tracks activity, not outcome; the agent cannot self-report silence as success.

## Section structure
Use the 10 required_section_headings verbatim, in order:
1. Zero-Hallucination & Quality Control (Adversarial Validation)
2. Advanced Skill Sequences (SOPs to Agent Skills)
3. Reverse Engineering & Codebase Mastery
4. Open Source Architecture Reading & Context Ingestion
5. Triggers, Infrastructure, and Continuous Operation
6. Cost & Resource Optimization
7. High-Level Architecture (Mermaid Diagram)
8. Implementation Phasing
9. Recommended Tech Stack
10. Example Pseudo-code — Adversarial Agentic Loop

Preface with an executive summary (unheaded, bold lead) stating the thesis and the governing invariant, and a short "strongest objections answered" passage covering the maximalist objection (humans are the bottleneck to remove) and the skeptical objection (the incident shows autonomy is unsafe) — both drafts B and C do this well; C's three-point rebuttal structure is cleanest.

## Per-section commitments

### 1. Zero-Hallucination & Quality Control
- Evidence: cross-model asymmetry study, false-rejection study, debate-underperforms-code study, MCR-Bench ceiling, davidpoll/New Stack practitioner view, Berkeley's same-agent-writes-tests-and-code trap, the AST hallucination checker (100% precision/87.6% recall), the 6,104-test guard-deletion case from Draft C.
- Argumentative beat: #3 above. Deterministic gates first → independent test authorship → execution-grounded critic → order-robust arbiter → rigid pass^k evals → blast-radius scoring.
- Cross-locus tension to engage: Tension 1 (minimal review fails where verifier shares blind spot) and the orphan tension on bug-catching as the wrong frame.
- "Jav AI": no such product exists in evidence; treat as the arbiter role (deterministic + small reasoning-judge ensemble, order-swapped, "Unknown" exit).

### 2. Advanced Skill Sequences
- Evidence: Agent Skills progressive disclosure, the 3,159-skill empirical revision study (37-57% token overhead), the FSM-trace-automata + PASTE speculative-execution composition, the two-tier idempotent/mutating speculation gate.
- Argumentative beat: #7-adjacent — SOPs compile into scripts (deterministic) + judgment (Skill body) + plan artifacts (mutating actions staged, not executed). Probabilistic sequencing is real and well-evidenced (not science fiction) but gated the same way everything else is.

### 3. Reverse Engineering & Codebase Mastery
- Evidence: MITRE legacy-documentation study (ICC 0.12-0.22 on assembly — audited gap), the dynamic-lens-via-egress-proxy inference, SentinelLABS malware-analysis compaction lesson, CyberGym numbers, the pentest-regression data.
- Argumentative beat: #4. Explicitly name decompilation-of-binaries as an audited absence (no measured study exists) — a Phase-4 research spike, not a launch commitment.

### 4. Open Source Architecture Reading & Context Ingestion
- Evidence: ADR-as-comment-vs-constraint distinction (Mneme), the three-tier ADR enforcement (ignored/advisory/enforced), context-rot and compaction findings, the four context-isolation strategies (write/select/compress/isolate).
- Argumentative beat: "reading is not enforcing" — ADRs must compile into deterministic hooks/lint rules, not just load into context.

### 5. Triggers, Infrastructure, and Continuous Operation
- Evidence: Sierra Agency architecture, Anthropic's Director/Worker research system, the shared-package-cache side-channel inference, the two-pool (read-only scales to 100+, mutating pool capped and raised on telemetry) design.
- Argumentative beat: #2, the incident reframing. Spin up 100+ sandboxes: yes. Let 100+ agents mutate shared state with minimal review: no, until the coordination monitor (the one primitive nothing in the corpus ships) is built and validated.

### 6. Cost & Resource Optimization
- Evidence: subscription-enforcement timeline (client-impersonation vs. automation), concrete sandbox pricing figures (E2B $316/mo @100, Northflank $7.2k-$35.8k/mo @200, Upstash active-CPU billing), the outcome-token self-termination rule, the governance-overhead audited absence.
- Argumentative beat: #5 and #7.

### 7-10. Diagram / Phasing / Tech Stack / Pseudocode
- Diagram: synthesize from all three Mermaid diagrams — five-plane structure (trigger/control/execution/verification/oversight) reads cleanest from Draft A's and C's versions; keep it to one diagram, not three.
- Phasing: adopt Draft C's ledger-with-promotion-rules framing as the backbone (it's the most actionable and matches the required section name), merged with A's and B's concrete phase numbers/exit gates.
- Tech stack: merge the three tables; resolve the LangGraph question per synthesis-conflicts.md (thin custom layer as default, LangGraph named as the concrete pick if a framework is wanted).
- Pseudocode: synthesize one adversarial-loop function + one supervisor/oversight function, drawing the clearest lines from each of the three implementations (Draft C's is the most complete single example; A's and B's naming/comments add clarity in a few spots).

## Where drafts disagreed
No factual disagreements (see synthesis-conflicts.md). The one structural choice: whether to name a specific orchestration framework. **Commit to:** default recommendation is a thin, auditable custom Director over a queue (Anthropic's own guidance: prefer code you understand over an abstraction that "obscures the underlying prompts and responses"), with LangGraph named as the concrete choice when a framework is wanted, citing its typed-state/checkpointing/multi-provider strengths. This gives the reader an actual decision, not just two reasonable-sounding opinions presented as equally valid.

## Length target
- response_format: argumentative
- Pass 1 target: ~9,000-10,000 words (rough integration of the three ~9,000-10,500-word drafts, cutting obvious redundancy as you go)
- Pass 2 final target: ~7,500-8,500 words (middle of the 5,000-10,000 range) — cut redundant restatements of the same evidence across pillars, keep every distinct citation and every one of the 7 argumentative beats above, keep the diagram/phasing/stack/pseudocode sections concrete and complete since they are explicitly requested deliverables.

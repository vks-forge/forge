# Coverage report — ai-software-factory-architecture-58e4cc (after wave 1 + wave 2 dispatch)

| Atomic item | Status after wave 1 | Source count | Action |
|---|---|---|---|
| Sub-Q1 adversarial dual-model review | Well-covered | 10+ | none |
| Sub-Q2 rigid evals / automated benchmarking gates | Well-covered | 8+ | none |
| Sub-Q3 code blast-radius identification | Adequate | 3 | none (sufficient) |
| Sub-Q4 SOPs → modular agent Skills | Well-covered | 6+ | none |
| Sub-Q5 probabilistic skill-sequence prediction from trace history | **Thin/uncovered after wave 1** | 0-1 | Wave 2 fetch dispatched (batch w2a: arXiv automata-from-traces, speculative tool-calling, prediction-based serving, awesome-agent-trajectory repo) |
| Sub-Q6 reverse engineering / decompilation / dependency mapping | Well-covered | 6+ | none |
| Sub-Q7 scheduled (90-min) automated pentest/vuln sweep | Well-covered (generic cadence not literally "90 min" in any source — will be argued as implementation parameter, not a researched fact) | 6+ | none |
| Sub-Q8 docs/ADR ingestion & rule enforcement | Adequate | 2 | none (sufficient) |
| Sub-Q9 context isolation / workspace-tree scoping | Adequate | 3 | none |
| Sub-Q10 event-driven triggers (webhook/cron/DB-spike/bug-report) | Well-covered (DB-connection-spike specifically generalized from incident-response + observability sources, not a literal match) | 5+ | none |
| Sub-Q11 isolated cloud sandboxes, Director/Worker 100+ agent scale | Well-covered | 12+ | none |
| Sub-Q12 subscription vs API token economics | Well-covered | 6+ | none |
| Sub-Q13 auto-kill idle agents / quiet self-termination | **Thin/uncovered after wave 1** | 0-1 | Wave 2 fetch dispatched (batch w2b: Google ADK long-running agents, Cloudflare long-running agents, idle-shutdown docs, sandbox billing cost piece, Azure hosted-session management) |

**Wave 1 result:** 92/109 queued URLs landed as vault notes (84%), exceeding the 80% gate.

**Wave 2 (gap-fill, in flight):** 2 small fetchers (4-5 URLs each) dispatched for the two genuinely uncovered
atomic items (Sub-Q5, Sub-Q13). No item remains at a hard 0-source gap once wave 2 lands.

**Retractions:** none flagged by `sources score` as of this writing (re-check after wave 2 + ranking commands).

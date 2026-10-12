## Coverage Matrix — query phrase → atomic item mapping

| Query phrase (verbatim) | Mapped atomic item(s) | Scope check | Gap? |
|---|---|---|---|
| "autonomous 'Software Factory'" | scope_condition: cloud-native continuously-operating multi-agent system | OK — full scope | No |
| "5,000-person software company" / "specialized departments" | scope_condition: scale target | OK | No |
| "Adversarial Model Review" | Sub-Q1; entities: Frontier model (generator), Frontier model (critic) | OK — both roles captured | No |
| "Claude 3.5 Sonnet / Opus" | Entity: Frontier model (generator), required_field example models | OK | No |
| "GPT-4o / GPT-6" | Entity: Frontier model (adversarial critic), required_field example models | OK | No |
| "Jav AI can be used for desicions" | Entity: LLM-as-judge / decision arbitration layer | Preserved verbatim concept despite ambiguous/typo'd name — not dropped, not silently reinterpreted | No |
| "Rigid Evals" / "automated benchmarking and evaluation loops" | Sub-Q2 | OK | No |
| "code blast radius identifications" | Sub-Q3 | OK — explicit standalone requirement | No |
| "SOPs to Agent Skills" | Sub-Q4 | OK | No |
| "git rebasing, database optimization, or deep web scraping" | Sub-Q4 required_fields (examples) | OK — covers all three named examples | No |
| "Probabilistic Sequences" / "agent-trace history" | Sub-Q5 | OK | No |
| "Decompilation & Analysis" / "deep-scan network calls" / "map out dependencies" | Sub-Q6 | OK | No |
| "Automated Cyber-Security Sweeps" / "every 90 minutes" | Sub-Q7 | OK — cadence preserved | No |
| "scan docs/ folders" / "Architecture Decision Records (ADRs)" | Sub-Q8; entity ADRs | OK | No |
| "Context Isolation" | Sub-Q9 | OK | No |
| "Event-Driven Triggers" (webhooks, cron, DB connection spikes, bug reports) | Sub-Q10 | OK — all 4 trigger types captured | No |
| "Director Agent" / "100+ Worker Agents" / "isolated, scalable cloud VM sandbox" | Sub-Q11; entities Director Agent, Worker Agents | OK | No |
| "Subscription vs. API" token economics | Sub-Q12 | OK | No |
| "Auto-Killing Idle Agents" / "quietly self-terminate" | Sub-Q13 | OK | No |
| "High-Level Architecture Diagram (Text-based/Mermaid)" | required_formats[0]; heading #7 | OK | No |
| "Step-by-Step Implementation Phasing" | required_formats[1]; heading #8 | OK | No |
| "Recommended Tech Stack (Models, Orchestration Frameworks, Cloud Providers)" | required_formats[2]; heading #9 | OK — all 3 sub-categories named | No |
| "Example Pseudo-code for an Adversarial Agentic Loop" | required_formats[3]; heading #10 | OK | No |

Zero `Gap? = YES` rows.

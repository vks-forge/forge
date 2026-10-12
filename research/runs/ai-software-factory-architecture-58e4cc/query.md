---
vault_tag: ai-software-factory-architecture-58e4cc
created: 2026-10-12T08:20:00Z
source: user-prompt
---

# Role and Objective
You are a Principal AI Architect and Lead Technical Researcher. Your objective is to design a comprehensive blueprint, technical architecture, and implementation plan for building an autonomous "Software Factory" driven by Multi-Agent systems. 

This is not a traditional coding environment. The goal is to move beyond single-agent "human-in-the-loop" prompting and build self-sustaining "agentic loops" running in the cloud, mimicking a 5,000-person software company where different AI agents act as specialized departments.

# Core Directives & Research Requirements

Please research and provide deep-dive execution strategies for the following pillars:

## 1. Zero-Hallucination & Quality Control (Adversarial Validation)
Design a framework to drastically reduce AI hallucinations and ensure production-grade code safety. 
*   **Adversarial Model Review:** Propose workflows where a primary Frontier model (e.g., Claude 3.5 Sonnet / Opus) generates code, while a completely different Frontier model (e.g., GPT-4o / GPT-6) runs adversarial critique to invalidate bad tests, spot logic gaps, and auto-reject "slop.". Jav AI can be used for desicions.
*   **Rigid Evals:** Establish automated benchmarking and evaluation loops that must pass before any human review is requested.
* should have code blast radius identifications

## 2. Advanced Skill Sequences (Beyond Prompting)
Research how to transition from basic prompt templates to dynamic execution sequences.
*   **SOPs to Agent Skills:** Define how to map human Standard Operating Procedures (SOPs) into modular, callable "Skills" for the agents (e.g., specific skills for git rebasing, database optimization, or deep web scraping).
*   **Probabilistic Sequences:** Explore how the system can analyze a developer's agent-trace history to probabilistically predict and chain multiple skills together autonomously based on the specific scenario.

## 3. Reverse Engineering & Codebase Mastery
The software factory must be capable of understanding, auditing, and upgrading existing or legacy applications without human hand-holding.
*   **Decompilation & Analysis:** Strategies for agents to deep-scan network calls, decompile unknown structures, and automatically map out dependencies.
*   **Automated Cyber-Security Sweeps:** Design a scheduled loop (e.g., running every 90 minutes) where sub-agents run extensive penetration testing and codebase vulnerability sweeps, automatically flagging or patching exploits.

## 4. Open Source Architecture Reading & Context Ingestion
The system must be able to adopt the structural norms of any open-source or proprietary codebase it is dropped into.
*   **Automated Context Gathering:** Design a workflow for agents to autonomously scan `docs/` folders, read Architecture Decision Records (ADRs), and enforce these architectural rules on all new code generated.
*   **Context Isolation:** Ensure the agent only accesses relevant workspace trees to prevent context-window bloat.

## 5. Triggers, Infrastructure, and Continuous Operation (Crucial)
Agents must not be bottle-necked by a human typing a prompt, a laptop closing, or a local Wi-Fi drop.
*   **Event-Driven Triggers:** Research replacing human prompts with automated triggers (e.g., Webhooks, Chron Schedules, Database concurrent connection spikes, customer bug reports).
*   **Isolated Cloud Sandboxes:** Architect a cloud environment where a "Director Agent" can spin up 100+ "Worker Agents," each operating in their own isolated, scalable cloud VM sandbox to prevent CPU starvation and system conflicts.

## 6. Cost & Resource Optimization
*   **Subscription vs. API:** Analyze the token economics of routing heavy workloads through flat-rate consumer UI subscriptions (via automation/harnesses) versus paying per-token API pricing.
*   **Auto-Killing Idle Agents:** Implement strategies for self-archiving threads. If a scheduled agent finds no issues (e.g., a DB health check comes back clean), it must quietly self-terminate without pinging the human.

# Output Format
Present your research as a structured technical whitepaper. Include:
1. **High-Level Architecture Diagram (Text-based/Mermaid)**
2. **Step-by-Step Implementation Phasing**
3. **Recommended Tech Stack (Models, Orchestration Frameworks, Cloud Providers)**
4. **Example Pseudo-code for an Adversarial Agentic Loop**

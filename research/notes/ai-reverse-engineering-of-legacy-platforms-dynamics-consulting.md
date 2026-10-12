---
title: AI Reverse Engineering of Legacy Platforms | Dynamics Consulting
id: ai-reverse-engineering-of-legacy-platforms-dynamics-consulting
tags:
- ai-software-factory-architecture-58e4cc
- reverse-engineering
- rag-codebase-analysis
created: '2026-10-12T08:28:47.957448Z'
updated: '2026-10-12T08:32:26.864123Z'
source: https://www.dynamicsconsulting.it/research/ai-reverse-engineering
source_domain: www.dynamicsconsulting.it
fetched_at: '2026-10-12T08:28:47.952763Z'
fetch_provider: builtin
status: draft
type: note
tier: unknown
content_type: unknown
deprecated: false
summary: 'Practitioner case study (Dynamics Consulting, Corrado Patierno, Nov 2025)
  on AI-assisted reverse engineering of legacy codebases via RAG + multi-agent orchestration.
  Production toolchain: codebase chunked at function/method level into a Weaviate
  vector store with domain-tuned code embeddings and structural metadata tags (controller/service/model/utility)
  enabling filtered retrieval; n8n orchestrates specialized agents (dependency mapper,
  data-flow tracer, business-rule extractor, API-surface analyser) with conditional
  branching, error handling, and human-approval gates between steps; output is structured
  JSON (not free text) feeding directly into modernization specs. Explicitly warns
  that feeding a whole codebase to an LLM without retrieval grounding ''produces confident-sounding
  but unreliable results'' -- hallucinated connections, silently ignored code paths,
  no traceability. Reports concrete results from its IATP engagement: 47 functional
  specifications, a data dictionary covering 180+ tables, and 12 previously undocumented
  integration points discovered; analysis phase cut from an estimated 3-4 months to
  under two weeks. Aggregate metrics across engagements: 70-85% reduction in analysis
  time vs. manual, 15-30% more integration points/business rules identified than manual
  review, <5% false-positive rate on specs with human validation, and total AI-assisted
  analysis cost at 40-60% of equivalent manual effort.'
---

AI Reverse Engineering of Legacy Platforms | Dynamics Consulting
← All articles
Legacy Modernisation
November 2025
AI-assisted reverse engineering of legacy platforms: lessons from the field
Applying RAG and multi-agent workflows to reconstruct functional and architectural knowledge from large legacy codebases. What works, what does not, and what traceability requirements actually look like.
By
Corrado Patierno
The problem
Every enterprise of sufficient age has at least one system that nobody fully understands. The original developers have left. The documentation, if it ever existed, is years out of date. The codebase has been patched, extended, and worked around by successive teams who each understood their piece but not the whole. And yet the system runs critical business processes that cannot be interrupted.
Modernising these systems without first understanding them is how organisations create expensive failures. The traditional approach — assigning a team of analysts to read the code and produce documentation — takes months and produces documents that are subjective, incomplete, and outdated before they are finished.
What RAG brings to the table
Ingesting an entire codebase into a vector store (we use Weaviate) creates a semantically searchable knowledge base. You can ask questions like "which modules write to the customer table?" or "what happens when an order is cancelled?" and get answers grounded in actual code, with references to specific files and line numbers.
This is fundamentally different from asking an LLM to "explain this code." RAG-grounded answers are traceable — every claim can be verified against the source. This traceability is not just useful; in our experience, it is the single most important property for building trust with the teams who will act on the analysis.
Multi-agent orchestration
A single RAG query can answer a specific question. Producing a comprehensive analysis requires orchestrating hundreds of queries in a structured sequence. We use n8n to build multi-agent workflows that systematically explore a codebase:
Identify all entry points (APIs, scheduled jobs, UI controllers)
Trace data flows from ingestion to storage to output
Map dependencies between modules
Flag undocumented business rules embedded in code
Generate structured output: functional specs, data dictionaries, architecture diagrams
Each step produces artifacts that are reviewed by human analysts before the next step proceeds. The AI accelerates the work; humans validate it.
What does not work
Feeding an entire codebase to an LLM and asking for "a complete analysis" produces confident-sounding but unreliable results. Without retrieval grounding, the model hallucinates connections that do not exist and misses non-obvious ones that do. Context window limitations mean critical code paths are silently ignored. And without traceability, there is no way to verify any claim without manual code review — which defeats the purpose.
Toolchain details: what the pipeline actually looks like
The specific toolchain matters. In production, our reverse engineering pipeline consists of:
Weaviate vector store:
The codebase is chunked at the function/method level, with overlapping context windows that preserve call relationships. Each chunk includes metadata: file path, module, language, and a structural tag (controller, service, model, utility). This metadata enables filtered retrieval — asking about data access patterns searches only model and repository layers, not UI code.
Embedding model:
We use domain-tuned code embeddings rather than general-purpose text embeddings. Code-specific models understand that syntactically different implementations of the same pattern (e.g., error handling in Java vs C#) are semantically similar.
n8n orchestration:
Multi-agent workflows are defined as n8n flows with conditional branching, error handling, and human-approval gates. Each agent in the flow has a specific role: dependency mapper, data flow tracer, business rule extractor, API surface analyser. The orchestration layer ensures agents process the codebase in the right order and that each agent's output is available to downstream agents.
Output format:
Structured JSON artifacts — not free-form text. Functional specifications, data dictionaries, and dependency maps are produced in machine-readable formats that can be imported into architecture tools, project management systems, or used as input for the next phase (code generation).
From analysis to modernisation: the complete pipeline
Reverse engineering is not the end goal — it is the foundation for modernisation. The analysis artifacts produced by the AI pipeline feed directly into the rebuild phase. Functional specifications become user stories. Data dictionaries become schema definitions. Dependency maps become architecture diagrams for the new system.
In our
IATP engagement
, the reverse engineering phase produced 47 functional specifications, a complete data dictionary covering 180+ database tables, and a dependency map that revealed 12 undocumented integration points with external systems. This output became the specification for the new platform — reducing the specification phase from months to days and eliminating the ambiguity that typically plagues legacy rewrite projects.
The AI pipeline also identified the
obsolescence engine
pattern: components where technical debt had accumulated to the point where the cost of continued maintenance exceeded the cost of replacement. By quantifying this — lines of dead code, unused dependencies, deprecated API calls, security vulnerabilities in pinned library versions — the analysis provided an objective basis for prioritising which components to rebuild first.
Results from production
In our IATP engagement, this approach reduced the analysis phase from an estimated 3-4 months of manual work to under two weeks. More importantly, the output was verifiable: every functional specification traced back to specific code, and the development team could validate claims against the source in minutes rather than days. This is now a repeatable methodology in our
legacy modernisation practice
.
The quantitative results across multiple engagements:
Analysis speed:
70-85% reduction in time compared to manual reverse engineering
Coverage:
AI-assisted analysis consistently identifies 15-30% more integration points and business rules than manual analysis
Accuracy:
With human validation, the false positive rate on functional specifications is below 5%
Cost:
Total cost of AI-assisted analysis is typically 40-60% of equivalent manual effort
Legacy Modernisation
RAG
Reverse Engineering
n8n
Weaviate
Let's talk about your project
AI infrastructure to build, a legacy system to modernise, or an ERP to connect to the future? Get in touch.
Start the conversation →
Talk to Nexus
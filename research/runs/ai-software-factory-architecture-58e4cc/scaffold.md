## User Prompt (VERBATIM — gospel)
See `query.md` in this run dir.

## Run config
- vault_tag: ai-software-factory-architecture-58e4cc
- query_file_path: research/runs/ai-software-factory-architecture-58e4cc/query.md
- modality: synthesize (defended thesis/blueprint w/ evidence chains across 6 pillars)
- wrapper requirements: none (direct user prompt, no harness wrapper, no prompt.txt)

## Modality classification rationale
Query asks for a "comprehensive blueprint, technical architecture, implementation plan" — a defended, structured technical whitepaper synthesizing multi-agent orchestration, eval frameworks, skill systems, reverse engineering, infra/triggers, cost optimization. Not pure enumeration (collect) nor comparison (compare) nor forecast — it's synthesize: build and defend an architecture with evidence from current tooling/frameworks/practices.

## Tier rationale
Classified `full` + `argumentative`. Confirmed: 6 distinct pillars each demanding synthesis of current multi-agent tooling, defended architectural recommendations (not a bounded factual lookup), explicit deliverable depth (Mermaid diagram, phasing, tech-stack table, pseudocode), and a stated register of "design/architect/recommend" (advocate). This is a research-grade, contested-design-space question, not a `light`-tier simple lookup.

## Wrapper requirements
None — no `research/wrapper_contract.json`, no `research/prompt.txt`. User invoked `/hyperresearch` directly in a non-git working directory (D:\VIKASH\software-factory).

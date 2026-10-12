# Post-critic fetch log — ai-software-factory-architecture-58e4cc

Checked every critical/major finding across all 4 critics against the vault. Result: **no gaps to fill.**

| Critic-flagged gap | Vault search | Result |
|---|---|---|
| Anthropic Help Center page showing Agent SDK/claude -p still draw subscription limits (dialectic CRITICAL #1) | "Anthropic Help Center subscription limits Agent SDK" | **Found directly**: `use-the-claude-agent-sdk-with-your-claude-plan-claude-help-center` already in vault, unused by patch. This single source resolves the critical finding — the patcher just needs to cite it and correct the "stopped covering third-party usage entirely" overclaim. |
| EvoClaw benchmark / long-horizon drift (dialectic major) | "EvoClaw benchmark long-horizon drift" | **Found**: `towards-autonomous-software-development` (the full Berkeley position paper, already flagged long-source) contains this. Patcher needs to read it more deeply, not fetch anything new. |
| Self-preference bias in LLM judges (width major #2) | already known to be in vault from step-5 fetches | `llm-evaluators-recognize-and-favor-their-own-generations` already fetched, unused by patch. |
| Agent-authored dependency vulnerability study (width major #3, dialectic major) | already known | `understanding-security-risks-of-ai-agents-dependency-updates` already fetched, unused by patch. |
| MCP/agent security surface (width major #4) | already known | `mcp-servers-the-new-security-nightmare-equixly`, `security-best-practices-model-context-protocol`, `owasp-non-human-identities-top-10-owasp-foundation` already fetched, unused by patch. |
| Multi-agent failure taxonomy / specialized departments (width major #5) | "ChatDev MetaGPT multi-agent roles" | `why-do-multi-agent-llm-systems-fail` (MAST) already in vault. ChatDev/MetaGPT not independently fetched, but the MAST survey covers the relevant failure-mode evidence the critic actually asked for. |
| Replit production-outage incident (depth minor) | "Replit agent fabricated records rollback" | **Found directly**: `post-mortem-anatomy-of-replit-ai-induced-production-outage` already in vault, unused by patch. |
| Non-human-identity lifecycle stats (depth major #7) | "non-human identity lifecycle offboarding static keys" | `owasp-non-human-identities-top-10-owasp-foundation` already in vault with 2 relevant hits. |
| SWE-bench Verified retirement/contamination (dialectic minor) | "SWE-bench Verified retired contamination 2026" | Only 1 thin hit. Minor severity, partial existing coverage — not worth a dedicated fetch wave. Patcher should soften or cut the SWE-bench headline-number claim rather than need new evidence. |
| Janus-LLM / Ghidra decompilation tooling (instruction major, width major #1) | already known | `github-janus-llmjanus-llm-leveraging-llms-for-modernization-through-intelligent` already fetched in step 2, unused by patch. |

**Conclusion:** every critical and major finding across all 4 critics is resolvable by the patcher citing sources ALREADY in the vault — this run's width sweep (102+ sources, multiple deep-chase waves) was thorough enough that the gaps are citation gaps, not evidence gaps. No fetcher wave dispatched. Proceeding directly to step 14 (patcher).

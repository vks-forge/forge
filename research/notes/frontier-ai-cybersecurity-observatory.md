---
title: Frontier AI Cybersecurity Observatory
id: frontier-ai-cybersecurity-observatory
tags:
- ai-software-factory-architecture-58e4cc
created: '2026-10-12T08:33:37.879589Z'
updated: '2026-10-12T08:34:18.767675Z'
source: https://www.cybergym.io/
source_domain: www.cybergym.io
fetched_at: '2026-10-12T08:33:37.878980Z'
fetch_provider: builtin
status: deprecated
type: note
tier: unknown
content_type: unknown
deprecated: false
---

*Suggested by [[best-sast-tools-in-2026-semgrep-codeql-snyk-compared]] — CyberGym benchmark cited as evidence for agentic security verification claims*

Frontier AI Cybersecurity Observatory
The benchmarks
Each benchmark targets a different stage of the vulnerability lifecycle.
Vulnerability Reproduction
CyberGym
Given a vulnerability description and an unpatched codebase, agents must generate
            proof-of-concept tests that reproduce the bug.
1,507
real-world instances
188
software projects
View benchmark
Exploit Generation
ExploitGym
Given a vulnerability and a proof-of-vulnerability input, agents must craft a full exploit
            that achieves unauthorized code execution across userspace, browser, and the Linux kernel.
869
real-world instances
3
domains (userspace · browser · kernel)
View benchmark
End-to-End
CyberGym-E2E
End-to-end evaluation of the full defensive lifecycle: agents must discover a vulnerability,
            generate a proof-of-concept, and write a patch that fixes it without breaking anything else.
920
real-world instances
4
stages
View benchmark
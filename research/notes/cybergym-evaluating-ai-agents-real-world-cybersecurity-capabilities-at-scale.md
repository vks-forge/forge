---
title: 'CyberGym: Evaluating AI Agents'' Real-World Cybersecurity Capabilities at
  Scale'
id: cybergym-evaluating-ai-agents-real-world-cybersecurity-capabilities-at-scale
tags:
- ai-software-factory-architecture-58e4cc
- cybersecurity-benchmark
- security-sweep
- empirical-benchmark
created: '2026-10-12T08:33:45.595972Z'
updated: '2026-10-12T08:34:29.213730Z'
source: https://www.cybergym.io/cybergym/
source_domain: www.cybergym.io
fetched_at: '2026-10-12T08:33:45.594966Z'
fetch_provider: builtin
status: draft
type: note
tier: unknown
content_type: unknown
deprecated: false
summary: 'CyberGym (Wang, Shi, He, Cai, Zhang, Song — ICLR 2026, openreview id 2YvbLQEdYt)
  is a benchmark of 1,507 real-world vulnerability-reproduction instances collected
  from OSS-Fuzz across 188 large software projects. Level-1 task: given a vulnerability
  description and the unpatched codebase (often spanning thousands of files / millions
  of LOC), the agent must generate a proof-of-concept that triggers on the pre-patch
  version but not the post-patch version. Beyond static benchmarking, open-ended discovery
  runs (OpenHands + GPT-4.1 / GPT-5 across 431 OSS-Fuzz projects, 1,748 executables)
  found: GPT-4.1 triggered 16 crashes -> 7 confirmed zero-days; GPT-5 triggered 56
  crashes -> 22 confirmed zero-days (4 overlapping). Across the full evaluation, agent-generated
  PoCs surfaced 34 zero-day vulnerabilities and 18 historically incomplete patches
  total (17 confirmed incomplete patches across 15 projects from 759 crash-triggering
  PoCs across 60 projects); zero-days persisted an average of 969 days before discovery.


  Key capability findings with exact numbers: (1) thinking/extended-reasoning mode
  raises GPT-5''s success rate from 7.7% (minimal reasoning) to 22.0% (high reasoning)
  on a 300-task subset, surpassing Claude-Sonnet-4; (2) richer input context matters
  heavily — only 3.5% of instances are reproducible at level 0 (text description only,
  no stack trace/patch); (3) PoC length is a major difficulty driver — agents achieve
  highest success on PoCs under 10 bytes but drop to ~10% success on PoCs over 100
  bytes, which make up 65.7% of the benchmark; (4) with OpenHands/Claude-4-Sonnet
  and a 100-step cap, successful runs concentrate in steps 20-80 (peak 20-50) and
  nearly half of all runs terminate at 80-100 steps without success, suggesting a
  100-step budget is a reasonable solve/resource tradeoff. This is the strongest available
  empirical anchor in this batch for the ''90-minute cyber-security sweep'' pillar
  — it demonstrates current frontier-model ceiling and failure modes on autonomous
  vulnerability discovery/reproduction at realistic codebase scale, with load-bearing,
  non-rounded statistics throughout.'
---

*Suggested by [[best-sast-tools-in-2026-semgrep-codeql-snyk-compared]] — CyberGym benchmark detail page - cited as evidence for agentic security verification claims*

CyberGym: Evaluating AI Agents' Real-World Cybersecurity Capabilities at Scale
Leaderboard
Results are evaluated and submitted by individual teams; agent runs are
          stochastic, so scores may vary across evaluations.
Vulnerability descriptions can be ambiguous, and with leading systems already achieving high performance,
          modest score differences may not reflect meaningful capability gaps.
The leaderboard ranks agent performance on CyberGym Level 1, where agents receive a vulnerability
          description and unpatched codebase, and are evaluated on their ability to reproduce target
          vulnerabilities by generating working PoCs.
Success Rate:
% of instances where the agent successfully reproduces the
          target vulnerability with a working PoC.
Trials:
attempts per instance; an instance counts as solved if any trial succeeds.
Labels:
dynamic
the agent runs against a sanitized vulnerable Docker image or the compiled binary of the target program;
test-time mem.
the agent relies on a test-time-updated
          knowledge base or memory across different instances.
          These denote different evaluation strategies, rather than a reduction in task difficulty.
Beyond reproduction, the agents discovered
34 zero-day
vulnerabilities and
18 historically incomplete patches
in total, detailed in
this section
.
Overview of CyberGym
CyberGym tests AI agents' ability to handle real-world cybersecurity tasks.
We collect 1,507 benchmark instances by systematically gathering real-world vulnerabilities discovered
          and patched across 188 widely distributed and large-scale software projects. Each instance is derived
          from vulnerabilities found by OSS-Fuzz, Google's continuous fuzzing campaign, ensuring authentic
          security challenges from widely-used codebases.
Benchmarking with Vulnerability Reproduction.
CyberGym creates evaluation environments with target repositories at pre-patch commit states. Agents
          receive a vulnerability description and unpatched codebase, then must generate proof-of-concept (PoC)
          tests that reproduce the vulnerability by reasoning across entire codebases, often spanning thousands
          of files and millions of lines of code. Agents iteratively refine PoCs based on execution feedback.
          Success is determined by verifying the PoC triggers on the pre-patch version but not on the
          post-patch version.
Open-Ended Vulnerability Discovery.
CyberGym also conducts comprehensive analyses of open-ended vulnerability discovery scenarios that
          extend beyond static benchmarking. We deploy agents to analyze the latest codebases without prior
          knowledge of existing vulnerabilities, generating PoCs to probe for potential vulnerabilities that are
          then validated against the latest software versions with sanitizers enabled. This mirrors real-world
          vulnerability discovery, enabling the identification of previously unknown vulnerabilities.
CyberGym's Real-World Security Impact
The agents not only reproduced known vulnerabilities, they uncovered incomplete patches and previously unknown zero-day bugs.
34
zero-day vulnerabilities
18
incomplete patches
431
OSS-Fuzz projects scanned
969
avg. days undiscovered
PoCs Reveal Incomplete Patches.
During evaluation, some generated PoCs unexpectedly caused crashes even on
patched
versions of
          programs, suggesting certain fixes were only partial. Out of all generated PoCs, 759 triggered crashes
          across 60 projects, and manual inspection confirmed
17 cases of incomplete patches spanning 15
          projects
. While none affected the latest releases, the results show AI-generated PoCs can help
          identify flaws in existing security patches that might otherwise go unnoticed.
PoCs Reveal Zero-Day Vulnerabilities.
Further validation of those post-patch crashes revealed 35 PoCs that still crashed the latest versions
          of their programs. After deduplication and analysis, these corresponded to
10 unique, previously
          unknown zero-day vulnerabilities
, each persisting for an average of
969 days
before
          discovery.
Agentic Vulnerability Discovery at Scale.
To test open-ended discovery, we ran OpenHands with GPT-4.1 and GPT-5 given only the latest codebases
          across
431 OSS-Fuzz projects
with
1,748 executables
. GPT-4.1 triggered 16 crashes,
          leading to 7 confirmed zero-days. GPT-5 triggered 56 crashes, yielding 22 confirmed zero-days (4
          overlapping). These results confirm that modern LLM agents can autonomously discover new
          vulnerabilities at scale, and that performance on CyberGym correlates strongly with real-world
          vulnerability discovery capability.
More Key Findings
Beyond the leaderboard, our evaluation reveals several critical insights into the current capabilities of AI agents in cybersecurity.
Thinking Mode Improves Success Rate
We compare thinking and non-thinking modes on a randomly selected subset of 300 tasks (~20% of the
              benchmark) using Qwen3-235B-A22B, GPT-5, Claude-3.7-Sonnet, and Claude-Sonnet-4. While thinking mode
              yields modest gains for most models, it increases GPT-5's success rate from 7.7% (minimal reasoning)
              to 22.0% (high reasoning), surpassing Claude-Sonnet-4. This is consistent with GPT-5's results on
              other benchmarks.
Richer Input Information Enhances Reproduction
We design four difficulty levels based on the amount of input information provided to agents. Richer
              input — such as the stack trace in level 2 and ground-truth patch in level 3 — greatly enhances the
              vulnerability reproduction success rate compared to level 1 (our primary task). For level 0, only
              3.5% of instances can be reproduced without access to the text description of the target
              vulnerability.
Challenges in Handling Longer PoCs
A longer ground-truth PoC typically implies more complex input-parsing logic, making it harder for
              agents to trigger vulnerability conditions. Tasks in the [0, 10) byte range achieve the highest
              success rate, but success drops significantly as PoC length increases. Agents show only ~10% success
              on instances with PoCs longer than 100 bytes — which represent 65.7% of the benchmark.
Marginal Improvement with Higher Step Counts
Results for OpenHands with Claude-4-Sonnet across execution steps (max 100): successful outcomes
              concentrate between steps 20–80, peaking at 20–50. However, nearly half of runs terminate at 80–100
              steps without success. This suggests agents solve simpler instances early but struggle with complex
              cases. The 100-step limit offers an effective balance between solving capacity and resource use.
An Example of a Successful Agent Trace
An example where the agent successfully reproduces the target vulnerability from the provided
          description and codebase. The agent browses relevant files using the given keywords, constructs a test
          case from the retrieved information, mutates it, and ultimately triggers the crash.
Citation
If you use this work in your research, please cite the following:
```
@inproceedings{wang2026cybergym,
  title={CyberGym: Evaluating {AI} Agents' Real-World Cybersecurity Capabilities at Scale},
  author={Zhun Wang and Tianneng Shi and Jingxuan He and Matthew Cai and Jialin Zhang and Dawn Song},
  booktitle={The Fourteenth International Conference on Learning Representations},
  year={2026},
  url={https://openreview.net/forum?id=2YvbLQEdYt}
}
```
Copy
More from our group
Check out
Frontier AI's Impact on the Cybersecurity Landscape
,
        a comprehensive analysis of how frontier AI is reshaping cybersecurity, and the
Frontier AI Cybersecurity Observatory
,
        a live leaderboard tracking AI's cybersecurity capabilities across attack and defense tasks.
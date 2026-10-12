---
title: Understanding Security Risks of AI Agents’ Dependency Updates
id: understanding-security-risks-of-ai-agents-dependency-updates
tags:
- ai-software-factory-architecture-58e4cc
- multi-agent-architecture
- dependency-security
- empirical-study
- agent-code-quality
created: '2026-10-12T08:28:36.706289Z'
updated: '2026-10-12T08:33:13.488951Z'
source: https://arxiv.org/html/2601.00205v1
source_domain: arxiv.org
fetched_at: '2026-10-12T08:28:36.703193Z'
fetch_provider: builtin
status: draft
type: note
tier: institutional
content_type: paper
deprecated: false
summary: 'Purdue University arXiv paper (2601.00205, Jan 2026, Singla, Cakar, Amusuo,
  Davis), large-scale empirical study of 117,062 dependency changes across 33,596
  agent-authored PRs (Copilot, Devin, OpenAI Codex, Cursor, Claude Code) and 6,618
  human-authored PRs across 2,807 GitHub repos (over 100 stars) and seven package
  ecosystems, using the AIDev-pop dataset plus the ecosyste.ms vulnerability database
  (aggregating GitHub Security Advisories and OSV) for PR-time-known vulnerability
  labeling. Core finding directly quantifies agent code-change risk and blast radius
  for a software-factory quality-control design: agents select PR-time known-vulnerable
  dependency versions more often than humans (2.46 percent vs 1.64 percent of additions
  and updates), and when agents do introduce a vulnerable version, remediation is
  harder, 36.8 percent of agent cases require a major-version upgrade to reach a patched
  release vs only 12.9 percent for human cases, despite patched alternatives existing
  in most cases. At the fleet level this nets out to agent-authored dependency work
  producing a net vulnerability increase of 98 across the sample, while human-authored
  dependency work produces a net vulnerability reduction of 1,316 over the same period.
  Agents also update dependency versions more frequently than humans conditional on
  touching a manifest (25.5 percent vs 15.8 percent) but spread edits across many
  small PRs rather than bundling them like humans do. The authors explicitly recommend
  PR-time vulnerability screening and registry-aware guardrails as mitigations, a
  direct measured justification for the blast radius and adversarial review pillars
  of an autonomous software-factory architecture.'
---

Understanding Security Risks of AI Agents’ Dependency Updates
Title:
Content selection saved. Describe the issue below:
Description:
arXiv is now an independent nonprofit!
Learn more
×
License: arXiv.org perpetual non-exclusive license
arXiv:2601.00205v1 [cs.SE] 01 Jan 2026
Understanding Security Risks of AI Agents’ Dependency Updates
Conference:
; ;
CCS:
Security and privacy Software and application security
Tanmay Singla
Affiliation:
Purdue University
,
West Lafayette, IN, USA
email:
singlat@purdue.edu
,
Berk Çakar
Affiliation:
Purdue University
,
West Lafayette, IN, USA
email:
bcakar@purdue.edu
,
Paschal C. Amusuo
Affiliation:
Purdue University
,
West Lafayette, IN, USA
email:
pamusuo@purdue.edu
and
James C. Davis
Affiliation:
Purdue University
,
West Lafayette, IN, USA
email:
davisjam@purdue.edu
© none
Abstract.
Package dependencies are a critical control point in modern software supply chains.
Dependency changes can substantially change a project’s security posture.
As AI coding agents modify software via pull requests, it is unclear whether their dependency decisions introduce distinct security risks.
We study 117,062 dependency changes from agent- and human-authored PRs across seven ecosystems.
Agents select known-vulnerable versions more often than humans (2.46% vs. 1.64%) and their vulnerable selections are more disruptive to remediate (36.8% require major-version upgrades vs. 12.9% for humans), despite patched alternatives existing in most cases. At the aggregate level, agent-driven dependency work yields a net vulnerability increase of 98, whereas human-authored work yields a net reduction of 1,316. These findings motivate PR-time vulnerability screening and registry-aware guardrails to make agent-driven dependency updates safer.
Keywords:
Software supply chains, AI agents, Dependency management
1.
Introduction
Modern software systems rely on third-party dependencies from public registries such as NPM, PyPI, and Maven Central
(
Wang et al., 2020
;
Latendresse et al., 2022
)
.
Dependencies accelerate software development, but can also introduce security risks by incorporating vulnerable third-party code
(
Zimmermann et al., 2019
;
Ohm et al., 2020
;
Decan et al., 2018
)
.
Consequently, dependency management is
a critical control point for securing modern software systems
(
Cybersecurity and Infrastructure Security Agency (CISA), 2023
;
Amusuo et al., 2025
;
Okafor et al., 2022
)
.
Artificial intelligence (AI) agents are increasingly being used to automate software development tasks
(
Li et al., 2025
;
Jimenez et al., 2023
)
.
Unlike traditional development tools, these agents generate not only the required code, but also which dependencies to add, remove, or update along the way.
Such dependency decisions alter a project’s attack surface and security posture. Prior academic and industry studies have examined several functional aspects of AI-assisted dependency management
(
Endor Labs, 2025
;
Schulman, 2025
;
Schreiber and Tippe, 2025
)
, including the use of hallucinated and outdated dependencies.
However, these studies largely overlook how frequently AI agents modify software dependencies in practice and the security implications of those modifications.
As a result, it remains unclear whether AI agents reason about dependency security in ways comparable to human developers.
To address this gap, we conduct a large-scale study of dependency changes in agent-authored PRs, using human-authored PRs as a contextual baseline. We analyze 117,062 dependency changes from 33,596 agent-authored and 6,618 human-authored PRs across 2,807 popular GitHub repositories (seven ecosystems), and label vulnerable selections using advisories available at PR time. Our study is guided by the following research questions:
•
RQ1:
How do AI agents modify dependencies in practice?
•
RQ2:
What are the security implications of dependency changes introduced by AI agents?
While the dataset contains fewer human PRs, human PRs tend to bundle more dependency edits per PR. In contrast, agents spread dependency edits across many PRs and, within those edits, perform version updates more often than humans (25.5% vs. 15.8%). Conditional on introducing or updating a dependency, agents select PR-time known-vulnerable versions more often than humans (2.46% vs. 1.64%). These vulnerable selections are also harder to remediate: major-version upgrades are required in 36.8% of agent cases (vs. 12.9% for humans). At the aggregate level, agent-authored dependency work yields a slight net vulnerability increase (–98), whereas human-authored dependency work yields a net reduction (+1,316). Together, these results suggest that current agents perform dependency maintenance at scale but make less security-improving version choices, motivating PR-time vulnerability screening and registry-aware guardrails for agent-driven updates.
2.
Background and Related Work
Definitions
:
To support consistent meanings, we denote:
•
Ecosystem
: a language-level package registry that governs naming and versioning (
e.g.,
npm, PyPI, Go, Maven)
(
Lungu, 2008
)
.
•
Manifest file
: a structured project file declaring direct dependencies (
e.g.,
package.json
,
requirements.txt
)
(
npm Documentation, 2025
;
pip Documentation, 2025
)
.
•
Dependency
: a tuple
<package name, version constraint>
extracted from a manifest file
(
Decan et al., 2018
)
.
•
Dependency change
: any addition, removal, or update to a dependency entry observed in a pull-request diff
(
Jayasuriya et al., 2024
)
.
•
Vulnerability
: a (publicly disclosed) weakness in software that compromises confidentiality, integrity, or availability
(
National Institute of Standards and Technology (NIST), 2025b
;
National Institute of Standards and Technology (NIST), 2025a
)
.
•
Vulnerability Introduced
: a dependency change that selects a vulnerable package-version not previously present in the target.
•
Remediation effort
: the minimal version change required to reach a non-vulnerable release.
We distinguish
bug-fix
(1.2.X → 1.2.Y),
minor
(1.X → 1.Y),
major
(1 → 2),
and other
(
Semantic Versioning Authors, 2013
)
.
•
Vulnerability Removed
: a dependency change that removes a vulnerable package-version previously present.
Related Works
:
Prior work has examined the rapid rise of AI coding agents and their implications for software quality and security. Large-scale empirical studies show that agent-authored changes tend to be smaller in scope and have lower merge acceptance rates than human-authored changes, reflecting differences in task structure and workflow integration
(
Li et al., 2025
)
. Security-focused analyses further demonstrate that AI-generated code can contain vulnerabilities, hallucinate non-existent or outdated dependencies, or propagate insecure patterns
(
Cotroneo et al., 2024
;
Veracode, 2025
)
. Large-scale evaluations report that a substantial fraction of AI-generated code exhibits detectable security weaknesses
(
Cotroneo et al., 2025
;
Schreiber and Tippe, 2025
)
, and that agentic assistants can inadvertently introduce or amplify supply-chain risk due to their elevated privileges and autonomy
(
Gumbley and Ryan, 2025
)
. While this body of work establishes that AI-assisted development introduces new security challenges, it largely treats dependency decisions as secondary artifacts of code generation rather than as first-class objects of study.
Complementary research on dependency management and software supply-chain security focuses primarily on human-driven workflows. Prior studies show that dependency update decisions depend on package characteristics, ecosystem dynamics, and external events; even experienced developers struggle to balance compatibility and security concerns
(
Jafari et al., 2023
)
. Empirical analyses of automated tools such as Dependabot further demonstrate that limited compatibility and context awareness can hinder safe updates
(
Rombaut et al., 2024
)
. Recent industry reports reinforce these findings, indicating that many AI-recommended dependency versions are vulnerable or do not exist in public registries
(
Endor Labs, 2025
)
. In contrast to prior work that examines AI-generated code risks and dependency management largely in isolation, our study links these threads by empirically analyzing how AI-initiated pull requests modify dependencies in practice and how those modifications affect supply-chain security.
3.
Methods
3.1.
Dataset and Preparation
We use the AIDev-pop dataset
(
Li et al., 2025
)
, a curated subset of AIDev containing pull requests (PRs) from GitHub repositories with more than 100 stars. This restriction emphasizes projects with established user bases and de-emphasizes trivial or experimental repositories.
AIDev-pop provides patch-level diffs for 33,596 agent-authored PRs (Copilot, Devin, OpenAI Codex, Cursor, Claude Code) and metadata-only for 6,618 human-authored PRs across 2,807 repositories. For human PRs, we retrieve diffs via the GitHub API.
We restrict to PRs that modify ecosystem-specific dependency manifest files (
e.g.,
package.json
for npm)
because these explicitly encode direct dependency declarations. (Our artifact describes our manifest-file mapping and edge cases.)
We reconstruct pre/post manifest contents from diffs and extract dependency tuples into a unified representation to support cross-ecosystem comparison.
Finally, to avoid over-interpreting cross-group differences that may reflect differing PR objectives, we use human PRs as a contextual baseline; we revisit comparability threats in
section
5
.
3.2.
RQ1: Dependency Modification Patterns
RQ1 measures how agents modify dependencies in practice.
After dataset preparation (
section
3.1
),
we have a set of PRs that modify manifest files (
e.g.,
package.json
for npm).
For each PR that modifies a manifest file, we reconstruct the pre- and post-change versions of the manifest file and extract dependencies in each version into a unified
<package,version>
representation.
We then compare the two versions to identify dependencies that were changed.
Finally, we report (i) the proportion of agent-authored PRs that include manifest file modifications and (ii) the distribution of dependency additions, removals, and updates.
3.3.
RQ2: Dependency Vulnerability Analysis
RQ2 assesses the frequency, types, and severity of vulnerabilities introduced through agent-driven dependency changes.
For each dependency addition or version update identified in RQ1, we query the ecosyste.ms vulnerabilities database, which aggregates disclosures from GitHub Security Advisories, the Open Source Vulnerabilities (OSV) database, and other ecosystem-specific sources.
Vulnerabilities are a moving target: advisories are published over time. Therefore, per commit, we count only vulnerabilities that were publicly disclosed before the PR timestamp, yielding a PR-time view of what an author could plausibly have known.
For each identified vulnerability, the ecosyste.ms database provides the associated CWE family, severity, and patched versions.
Using this, we measure:
(i) the proportion of dependency additions and version updates that introduce known vulnerabilities;
(ii) CWE family and severity of the introduced vulnerabilities;
(iii) the fraction of vulnerability-introducing changes for which a patched version was available at time of change;
(iv) remediation effort; and
(v) net effect (vulnerable dependencies introduced - removed) when accounting for both vulnerability introductions and fixes.
We compare agent and human-authored pull requests on these metrics.
4.
Results
4.1.
Dependency Update Patterns (RQ1)
We begin by characterizing how AI coding agents modify project dependencies and what these edits imply for supply-chain risk; we report human-authored changes to contextualize the magnitude of the observed agent behavior.
Across the 117,062 dependency changes in our dataset, agent-authored PRs contribute 53,277 dependency edits spanning additions, removals, and updates across the agents and ecosystems (Figure
1
).
Agent PRs frequently modify dependencies, creating repeated opportunities to expand the dependency graph and associated risk surface.
4.1.1.
Change-type breakdown.
Among all dependency edits made by agents,
25.5% are version updates, 45.0% are new dependency additions, and 29.5% are removals
(Figure
1
).
Nearly half of agent dependency work therefore consists of
introducing new direct dependencies
, which expands the transitive closure of the dependency graph and increases exposure to vulnerable or compromised upstream artifacts over time.
Separately, agent version updates (25.5%) create repeated “version-choice” moments where an agent selects a concrete version that may be known to be vulnerable at PR time; we quantify these security outcomes in RQ2 (
section
4.2
).
The same dataset contains 63,785 dependency edits from human-authored PRs, with a different distribution across change types (Figure
1
).
Since PR objectives and task mixes may differ between the two, we use the human statistics to contextualize the magnitude of agent activity rather than as a direct contrast.
Figure 1
.
Dependency changes by agents and humans.
4.1.2.
Agent and ecosystem context
Agent-attributed dependency edits are spread across multiple systems—Copilot (33.5%), Devin (29.6%), OpenAI Codex (23.6%), Cursor (10.6%), and Claude Code (2.7%)—suggesting these patterns are not driven by a single tool.
Ecosystem concentration is also strong: 71.8% of all extracted dependency changes occur in npm, followed by PyPI, Go, Maven, and NuGet.
Because these registries often have large packages and deep transitive graphs, agent-driven additions and updates in these ecosystems can quickly expand indirect exposure, motivating PR-time, registry-aware validation.
4.1.3.
Summary
Agent-authored PRs frequently modify dependency manifests, and a substantial fraction of these edits involve either
adding new dependencies
or
selecting specific dependency versions
.
These actions directly expand a project’s dependency graph and create repeated opportunities for supply-chain risk introduction.
The prevalence of this behavior across multiple agents and ecosystems motivates a focused analysis of the security properties of agent-selected dependencies, which we undertake in RQ2.
4.2.
Security Vulnerabilities and Impact (RQ2)
4.2.1.
Vulnerabilities introduced at pull-request time
We focus first on
dependencies introduced
via additions and updates, since these are the changes where an author selects a package version (or constraint).
Table
1
summarizes rates computed over introduced dependencies.
Agents select versions that were known vulnerable at PR time more often than humans
(2.46% vs. 1.64%).
This indicates that, conditional on making a version-choice edit, agent-authored changes are more likely to pick a version with an existing advisory.
Table 1
.
Vulnerability metrics by author type. Vulnerability rates are computed over dependencies introduced.
Metric
Agent
Human
Dependencies Introduced
37,574
40,110
Vulnerable dependencies
924 (2.46%)
659 (1.64%)
Mitigatable (any patch available) (%)
86.58%
83.31%
4.2.2.
Severity of introduced vulnerabilities
Next, we compare the severity distribution of vulnerabilities
associated with
vulnerable dependency selections (Table
2
(a)).
A chi-square test indicates the distributions differ significantly (
χ
2
=
165.01
\chi^{2}=165.01
,
p
<
0.001
p<0.001
).
Agent-associated vulnerabilities are concentrated in Moderate (52.3%) and High (26.0%) categories, whereas Critical vulnerabilities constitute a smaller share for agents (12.0%) than for humans (23.3%).
Overall, agents introduce a larger volume of Moderate/High issues, while humans’ introduced vulnerabilities skew more toward Critical.
Table 2
.
Summary of security outcomes by author type.
Severity labels follow the typical CVSS-to-severity rubric
(
Open Source Security Foundation,
;
FIRST.org, 2024
;
Open Source Security Foundation, 2024
;
GitHub, 2025
)
.
(a) Introduced severity
Severity
Agent
Human
Critical
290 (12.0%)
305 (23.3%)
High
629 (26.0%)
284 (21.7%)
Moderate
1,265 (52.3%)
588 (44.9%)
Low
234 (9.7%)
132 (10.1%)
(b) Introductions vs. fixes
Category
Agent
Human
Introduced (% all changes)
1.73%
1.03%
Fix rate (remove/update)
2.82%
5.85%
Fixed (% all changes)
1.55%
3.10%
Net impact (Fixed – Introduced)
-98
+1,316
(c) Fixed severity
Severity
Agent
Human
Critical
229 (15.9%)
850 (33.3%)
High
244 (17.0%)
352 (13.8%)
Moderate
864 (60.0%)
1,268 (49.6%)
Low
102 (7.1%)
84 (3.3%)
4.2.3.
Vulnerability families
To understand
what kinds
of weaknesses drive these outcomes, we group advisories into CWE categories (Table
3
).
Agent-associated cases concentrate in common web- and access-related families—most prominently XSS (CWE-79), path traversal (CWE-22), access control (CWE-284), and information disclosure (CWE-200)—and agents account for the majority of occurrences in several of these categories.
This concentration suggests that targeted guardrails (
e.g.
, stricter defaults and checks for request handling, file-system access, and authentication/authorization) could mitigate a substantial fraction of agent-associated risky selections.
Table 3
.
Top 10 vulnerability categories for introduced dependencies.
Sorted by
Total
in descending order.
CWE Category
Agent
Human
Total
CWE-79 (XSS)
102 (11.0%)
52 (7.9%)
154
CWE-400 (Resource Exh.)
82 (8.9%)
59 (9.0%)
141
CWE-22 (Path Traversal)
95 (10.3%)
39 (5.9%)
134
CWE-284 (Access Control)
77 (8.3%)
45 (6.8%)
122
CWE-200 (Information Disc.)
72 (7.8%)
36 (5.5%)
108
CWE-1333 (ReDoS)
59 (6.4%)
48 (7.3%)
107
CWE-918 (SSRF)
48 (5.2%)
37 (5.6%)
85
CWE-601 (Open Redirect)
41 (4.4%)
35 (5.3%)
76
CWE-502 (Deserialization)
28 (3.0%)
21 (3.2%)
49
CWE-863 (Incorrect Auth.)
19 (2.1%)
21 (3.2%)
40
4.2.4.
Remediation effort and patch availability
We estimate remediation burden by computing the minimal version jump required to reach a non-vulnerable release (Figure
2
).
Agent-introduced vulnerable selections are more disruptive to remediate: 36.8% (340) require a major-version upgrade, compared to 12.9% (85) for humans.
Humans more frequently have non-breaking remediation paths available (patch-level and minor upgrades), while agents require these less often.
Despite this, most vulnerable selections are mitigatable: a patched version exists for 86.58% of agent cases and 83.31% of human cases (Table
1
),
again suggesting that PR-time advisory checks could prevent many unsafe selections before merge.
Figure 2
.
Patch jump required to remediate vulnerable dependency selections, by author type.
4.2.5.
Net security impact from introductions vs. fixes
Finally, we assess whether each group’s dependency work is net security-improving by comparing vulnerability introductions and fixes across removal and update changes (Table
2
(b)).
Note that Table
2
(b) reports rates over all dependency edits (add/remove/update), unlike Table
1
which is add/update only.
Agent-authored edits fix 826 vulnerable dependencies while introducing 924, whereas human-authored edits fix 1975 and introduce 659.
Normalized by change volume, agents fix vulnerabilities in 1.55% of all dependency edits and introduce them in 1.73%, yielding a net impact of –98; in contrast, humans fix 3.10% and introduce 1.03%, yielding a net reduction of 1,316.
Some PRs repair dependency vulnerabilities.
We compare the severity of these in Table
2
(c).
While fixes by both groups are dominated by Moderate and Critical issues, humans devote a larger share of fixes to Critical vulnerabilities (33.3% vs. 15.9% for agents).
Overall, agents perform less of the security-improving dependency maintenance work, motivating PR-time guardrails that prevent known-vulnerable selections and reduce disruptive remediation.
5.
Threats to Validity
Construct validity.
Our security measurements rely on public vulnerability advisories and registry metadata.
As a result, dependencies that are private, workspace-local, or hosted in organization-specific registries may be missed.
Advisory coverage and affected-version precision vary by ecosystem and data source, and severity labels are assigned upstream; thus, our counts and severity distributions reflect the underlying feeds rather than ground-truth exploitability
(
The OSV Team, 2025
;
Ecosyste.ms Team, 2025
)
.
Our remediation proxy (minimal version jump to reach a non-vulnerable release) assumes semantic versioning and does not capture project-specific compatibility constraints, transitive-dependency constraints, or whether a vulnerability is reachable in a given application.
Internal validity.
Dependency changes are extracted from unified diffs using ecosystem-specific parsers, which may miss non-standard manifest formats or misclassify some additions, removals, or updates.
Furthermore, to reduce false positives, we apply conservative handling: when a manifest cannot be parsed reliably, we treat it as having no dependency changes (and therefore no vulnerable selections), which likely biases vulnerability rates downward.
Our labeling relies on advisory publication timestamps, which may lag real-world disclosure or differ across sources, introducing uncertainty in whether a vulnerability was publicly known at pull-request time.
Lastly, agent- and human-authored PRs may differ in task mix, which can influence dependency behavior; we therefore use human results only as contextual baselines rather than running a statistical comparison.
As a coarse proxy for task scope, we examine PR churn: median lines added are similar (72 vs. 62), but human PRs exhibit substantially larger upper tails (75th percentile added: 534 vs. 254; removed: 232 vs. 65), confirming our contention that some differences may reflect task scope rather than author type.
External validity and reliability.
AIDev-pop focuses on GitHub repositories with >100 stars and PRs authored by a fixed set of agents, which may limit generalizability to private repositories, smaller projects, other ecosystems, or future agent behaviors.
Our results also depend on third-party services (GitHub and vulnerability-advisory providers) whose contents evolve over time; re-running the pipeline on a different snapshot may yield different counts, especially for recently disclosed vulnerabilities.
To support reproducibility, we will release our analysis scripts, cached query results (or query timestamps/IDs), and derived aggregates so others can re-run the study on a comparable snapshot.
6.
Discussion
Overall, our findings suggest that current AI coding agents prioritize dependency updating as a workflow, but do not consistently make security-improving version choices.
In particular, updates comprise a larger share of agent-authored dependency changes than human-authored changes (25.5% vs. 15.8%), which increases the number of “version-choice” moments where risk can enter.
Consistent with this, agents select package versions that are already known to be vulnerable at PR time more often than humans (2.46% vs. 1.64%), and these selections are more disruptive to remediate—major-version jumps are required in 36.8% of agent cases versus 12.9% for humans, even though a patched version exists for most cases (86.58%).
At the aggregate level, this translates into weaker net security outcomes from agent-authored dependency work (net impact -98 vs. +1,316 for humans), driven by lower fix rates and higher introduction rates.
Finally, agent-associated vulnerable selections concentrate in a relatively small set of web/access-related vulnerability families (
e.g.,
XSS, path traversal, access control, information disclosure), suggesting that PR-time advisory checks and targeted guardrails around these families could prevent many unsafe selections without blocking routine maintenance.
Data Availability
Our measurement tools and data are available:
https://anonymous.4open.science/r/agent_supply_chain_analysis-2FBB/
.
References
Amusuo
et al.
(2025)
P. Amusuo, K. A. Robinson, T. Singla, H. Peng, A. Machiry, S. Torres-Arias, L. Simon, and J. C. Davis
ZTD_
{
\{
java
}
\}
: mitigating software supply chain vulnerabilities via zero-trust dependencies
.
In
2025 IEEE/ACM 47th International Conference on Software Engineering (ICSE)
,
pp. 685–685
.
Cited by:
§1
.
Cotroneo
et al.
(2024)
D. Cotroneo, C. Improta, P. Liguori, and R. Natella
Vulnerabilities in ai code generators: exploring targeted data poisoning attacks
.
In
Proceedings of the 32nd IEEE/ACM International Conference on Program Comprehension
,
ICPC ’24
,
pp. 280–292
.
External Links:
Link
,
Document
Cited by:
§2
.
Cotroneo
et al.
(2025)
D. Cotroneo, C. Improta, and P. Liguori
Human-written vs. ai-generated code: a large-scale study of defects, vulnerabilities, and complexity
.
External Links:
2508.21634
,
Link
Cited by:
§2
.
Cybersecurity and Infrastructure Security Agency (CISA) (2023)
Cybersecurity and Infrastructure Security Agency (CISA)
Securing the software supply chain: recommended practices for managing open-source software and software bill of materials
.
Note:
Accessed: 2025-12-23
External Links:
Link
Cited by:
§1
.
Decan
et al.
(2018)
A. Decan, T. Mens, and E. Constantinou
On the impact of security vulnerabilities in the npm package dependency network
.
In
Proceedings of the 15th international conference on mining software repositories
,
pp. 181–191
.
Cited by:
§1
,
3rd item
.
Ecosyste.ms Team (2025)
Ecosyste.ms Team
Ecosyste.ms advisories api documentation
.
Note:
Accessed: 2025-12-21
External Links:
Link
Cited by:
§5
.
Endor Labs (2025)
Endor Labs
State of dependency management 2025
.
Note:
https://www.endorlabs.com/lp/state-of-dependency-management-2025
Accessed: 2025-12-01
Cited by:
§1
,
§2
.
FIRST.org (2024)
FIRST.org
Common vulnerability scoring system (cvss) version 4.0: specification document
.
Technical report
Technical Report
Document Version 1.2
,
FIRST.org, Inc.
.
Note:
https://www.first.org/cvss/v4-0/cvss-v40-specification.pdf
Accessed: 2025-12-21
Cited by:
Table 2
,
Table 2
.
GitHub (2025)
GitHub
About the github advisory database
.
GitHub Docs
.
Note:
https://docs.github.com/code-security/security-advisories/working-with-global-security-advisories-from-the-github-advisory-database/about-the-github-advisory-database
Accessed: 2025-12-21
Cited by:
Table 2
,
Table 2
.
Gumbley and Ryan (2025)
J. Gumbley and L. Ryan
Coding assistants threaten the software supply chain
(Website)
Note:
Accessed: 2025-12-01
External Links:
Link
Cited by:
§2
.
Jafari
et al.
(2023)
A. J. Jafari, D. E. Costa, E. Shihab, and R. Abdalkareem
Dependency update strategies and package characteristics
.
External Links:
2305.15675
,
Link
Cited by:
§2
.
Jayasuriya
et al.
(2024)
D. Jayasuriya, S. Ou, S. Hegde, V. Terragni, J. Dietrich, and K. Blincoe
An extended study of syntactic breaking changes in the wild
.
Empirical Softw. Engg.
30
(
2
).
External Links:
ISSN 1382-3256
,
Link
,
Document
Cited by:
4th item
.
Jimenez
et al.
(2023)
C. E. Jimenez, J. Yang, A. Wettig, S. Yao, K. Pei, O. Press, and K. Narasimhan
Swe-bench: can language models resolve real-world github issues?
.
arXiv preprint arXiv:2310.06770
.
Cited by:
§1
.
Latendresse
et al.
(2022)
J. Latendresse, S. Mujahid, D. E. Costa, and E. Shihab
Not all dependencies are equal: an empirical study on production dependencies in npm
.
In
Proceedings of the 37th IEEE/ACM International Conference on Automated Software Engineering
,
pp. 1–12
.
Cited by:
§1
.
Li
et al.
(2025)
H. Li, H. Zhang, and A. E. Hassan
The rise of ai teammates in software engineering (se) 3.0: how autonomous coding agents are reshaping software engineering
.
External Links:
2507.15003
,
Link
Cited by:
§1
,
§2
,
§3.1
.
Lungu (2008)
M. Lungu
Towards reverse engineering software ecosystems
.
In
2008 IEEE International Conference on Software Maintenance
,
Vol.
,
pp. 428–431
.
External Links:
Document
Cited by:
1st item
.
National Institute of Standards and Technology (NIST) (2025a)
National Institute of Standards and Technology (NIST)
National vulnerability database (nvd) — vulnerabilities
.
Note:
Accessed: 2025-12-23
External Links:
Link
Cited by:
5th item
.
National Institute of Standards and Technology (NIST) (2025b)
National Institute of Standards and Technology (NIST)
Vulnerability — nist computer security resource center glossary
.
Note:
Accessed: 2025-12-23
External Links:
Link
Cited by:
5th item
.
npm Documentation (2025)
npm Documentation
Package.json
.
Note:
Accessed: 2025-12-23
External Links:
Link
Cited by:
2nd item
.
Ohm
et al.
(2020)
M. Ohm, H. Plate, A. Sykosch, and M. Meier
Backstabber’s knife collection: a review of open source software supply chain attacks
.
In
International Conference on Detection of Intrusions and Malware, and Vulnerability Assessment
,
pp. 23–43
.
Cited by:
§1
.
Okafor
et al.
(2022)
C. Okafor, T. R. Schorlemmer, S. Torres-Arias, and J. C. Davis
Sok: analysis of software supply chain security by establishing secure design properties
.
In
Proceedings of the 2022 ACM Workshop on Software Supply Chain Offensive Research and Ecosystem Defenses
,
pp. 15–24
.
Cited by:
§1
.
[22]
Open Source Security Foundation
Advisories (ecosyste.ms data service)
.
ecosyste.ms
.
Note:
https://docs.ecosyste.ms/docs/services/data-services/advisories/
Accessed: 2025-12-21
Cited by:
Table 2
,
Table 2
.
Open Source Security Foundation (2024)
Open Source Security Foundation
OSV: open source vulnerabilities
.
OSV
.
Note:
https://osv.dev/
Accessed: 2025-12-21
Cited by:
Table 2
,
Table 2
.
pip Documentation (2025)
pip Documentation
Requirements file format
.
Note:
Accessed: 2025-12-23
External Links:
Link
Cited by:
2nd item
.
Rombaut
et al.
(2024)
B. Rombaut, F. R. Cogo, and A. E. Hassan
Leveraging the crowd for dependency management: an empirical study on the dependabot compatibility score
.
External Links:
2403.09012
,
Link
Cited by:
§2
.
Schreiber and Tippe (2025)
M. Schreiber and P. Tippe
Security vulnerabilities in ai-generated code: a large-scale analysis of public github repositories
.
In
Information and Communications Security
,
pp. 153–172
.
External Links:
ISBN 9789819535378
,
ISSN 1611-3349
,
Link
,
Document
Cited by:
§1
,
§2
.
Schulman (2025)
E. Schulman
Hallucinated code, real threat: how slopsquatting targets ai-assisted development
(Website)
Note:
SD Times, Accessed: 2025-12-01
External Links:
Link
Cited by:
§1
.
Semantic Versioning Authors (2013)
Semantic Versioning Authors
Semantic versioning 2.0.0
.
Note:
Accessed: 2025-12-23
External Links:
Link
Cited by:
7th item
.
The OSV Team (2025)
The OSV Team
Open source vulnerability (osv) schema and aggregation
.
OpenSSF
.
Note:
Accessed: 2025-12-21
External Links:
Link
Cited by:
§5
.
Veracode (2025)
Veracode
AI-generated code poses major security risks in nearly half of all development tasks, veracode research reveals
.
Note:
BusinessWire press release
External Links:
Link
Cited by:
§2
.
Wang
et al.
(2020)
Y. Wang, B. Chen, K. Huang, B. Shi, C. Xu, X. Peng, Y. Wu, and Y. Liu
An empirical study of usages, updates and risks of third-party libraries in java projects
.
In
2020 IEEE International Conference on Software Maintenance and Evolution (ICSME)
,
pp. 35–45
.
Cited by:
§1
.
Zimmermann
et al.
(2019)
M. Zimmermann, C. Staicu, C. Tenny, and M. Pradel
Small world with high risks: a study of security threats in the npm ecosystem
.
In
28th USENIX Security symposium (USENIX security 19)
,
pp. 995–1010
.
Cited by:
§1
.
---
title: 'Cross-Model LLM Code Review: Should you use Claude to review Codex or vice
  versa?'
id: cross-model-llm-code-review-should-you-use-claude-to-review-codex-or-vice-versa
tags:
- ai-software-factory-architecture-58e4cc
- adversarial-code-review
- pillar-1-gap-fill
created: '2026-10-12T08:59:40.474914Z'
updated: '2026-10-12T09:00:21.821521Z'
source: https://arxiv.org/html/2607.21656v1
source_domain: arxiv.org
fetched_at: '2026-10-12T08:59:40.473400Z'
fetch_provider: builtin
status: draft
type: note
tier: institutional
content_type: paper
deprecated: false
summary: 'Controlled experiment (Xiang, Zhang, Zhang, Xu; UC Davis/Johns Hopkins/CSULB,
  arXiv 2607.21656, Jul 2026) directly measures whether a second-model adversarial/static
  code review pass improves defect-catching correctness, using Claude Opus 4.7 and
  Codex GPT-5.5 on 116 hard/medium LiveCodeBench tasks across 6 writer-reviewer conditions
  (static review: reviewer sees problem + draft, cannot execute code or run tests).
  This is the domain-matched quantified study the corpus lacked -- prior evidence
  was multi-agent-debate factual-QA studies (Du et al. 2024, Liang et al. 2024), not
  code-defect catching. Key finding: review value is asymmetric and NOT a generic
  ''second model catches bugs'' effect. Codex GPT-5.5 solo = 71.6% pass rate; reviewed
  by Claude Opus 4.7 jumps to 89.7% (+18.1pp, p_BH=.001); reviewed by itself (Codex)
  rises to 84.5% (+12.9pp, p_BH=.022). But Claude Opus 4.7 solo = 91.4%; Claude self-review
  leaves it unchanged (91.4%, p_BH=1.0, noise floor: 3 fixes/3 regressions); Codex
  reviewing Claude DROPS it to 82.8% (-8.6pp, p_BH=.046) -- the reviewer pass actively
  hurts when the writer is already the stronger model. Mechanistically, Codex-as-reviewer
  tends to discard the writer''s working data structure and rewrite from scratch (high
  regression rate 11.2% in the harmful AO condition), while Claude-as-reviewer tends
  to preserve the writer''s interface and patch one local invariant. Cost: reviewed
  conditions cost /usr/bin/bash.31-/usr/bin/bash.44/task vs /usr/bin/bash.19-/usr/bin/bash.23
  solo, add 30-75s latency; cost-per-net-fix is ~/usr/bin/bash.95-.40 only in the
  conditions where review helps. Authors explicitly caution the n=116 sample is a
  first diagnostic, not a stable ranking, and the design covers single-file competitive-programming
  problems with hidden tests, not repository-scale review, build integration, or security/maintainability
  -- scope limitations directly relevant to any software-factory blueprint claiming
  this generalizes to production codebases.'
---

Cross-Model LLM Code Review: Should you use Claude to review Codex or vice versa?
Title:
Content selection saved. Describe the issue below:
Description:
arXiv is now an independent nonprofit!
Learn more
×
License: arXiv.org perpetual non-exclusive license
arXiv:2607.21656v1 [cs.SE] 22 Jul 2026
Cross-Model LLM Code Review: Should you use Claude to review Codex or vice versa?
Thanks:
This work is partially supported by US NSF Award #2436427.
Conference:
Agentic Software Engineering (SE 3.0): The Rise of AI Teammates; August 10, 2026; Jeju, Korea
CCS:
Computing methodologies Intelligent agents
CCS:
Software and its engineering Software verification and validation
Zuodong Xiang
Affiliation:
University of California, Davis
,
USA
email:
shawnzxiang@gmail.com
,
Yike Zhang
Affiliation:
Johns Hopkins University
,
USA
email:
zykk0330@gmail.com
,
YueMing Zhang
Affiliation:
California State University, Long Beach
,
USA
email:
Simon.Zhang01@student.csulb.edu
and
Hailu Xu
Affiliation:
California State University, Long Beach
,
USA
email:
hailu.xu@csulb.edu
© , 2026
Abstract.
Developers increasingly use two coding agents together: one writes a draft, and the other reviews it. However, it is not clear whether the pairing is worth its cost and time, or whether the order of the pairing matters. We run a controlled experiment on 116 recent hard and medium LiveCodeBench tasks with Claude Opus 4.7 and Codex GPT-5.5 across six conditions to approximate a software practitioner’s workflow: both solo baselines, both cross-model orderings, and both same-model orderings. The reviewer sees the problem and the writer’s draft but cannot execute tests, which approximates a code review step. Claude Opus 4.7 review raises Codex GPT-5.5 drafts from 71.6% to 89.7% (
p
B
​
H
=
.001
p_{BH}=.001
); Codex GPT-5.5 self review raises them to 84.5% (
p
B
​
H
=
.022
p_{BH}=.022
). The reverse direction does not pay off: Codex GPT-5.5 reviewing Claude Opus 4.7 drafts drops the pass rate from 91.4% to 82.8% (
p
B
​
H
=
.046
p_{BH}=.046
), and Claude Opus 4.7 self review leaves the 91.4% baseline unchanged. Our evaluation indicates that the useful pairing is asymmetric: use Claude Opus 4.7 to review Codex GPT-5.5, not the other way around.
Keywords:
Agentic Coding, LiveCodeBench, Self Code Review, LLM, Claude, Codex
1.
Introduction
Many coding workflows now involve more than a single LLM call. A developer asks one agent to write a draft and a second agent to review it before the change lands, and the second pass starts to behave like a software engineer reviewing code. The two arrangements we see most often in practice are Claude Opus 4.7
(
Anthropic, 2025
)
writing with Codex GPT-5.5
(
OpenAI, 2025
)
reviewing, and the reverse, with Codex GPT-5.5 writing and Claude Opus 4.7 reviewing. Each pairing can change the workflow’s final result. A different model, commonly equipped with different knowledge and expertise, is now responsible for catching things that the first one missed. But it can also cause regressions, replace a working solution with a worse one, or simply add cost and latency without measurable benefit.
Today’s code generation leaderboards rank single models in isolation. They do not address which of two available agents should write, which should review, whether the second pass is worth its cost, or which direction the pairing should run to yield the best correctness. Claude Opus 4.7 writing and Codex GPT-5.5 reviewing is not the same workflow as the reverse, even though the two models involved are identical.
We study this as a role assignment problem between a writer and a reviewer. The setup approximates a software engineer’s workflow: a single review pass with no execution feedback, so the measured effect is the review intervention itself rather than tool use, iteration, or memory of earlier attempts. The reviewer reads the problem statement and the writer’s draft and writes a final program; it cannot run the code or query a test runner. This is also commonly referred to as
static review
: the pre-CI inspection step a developer or code review bot performs before any tests run.
The experiments use LiveCodeBench, a continuously updated benchmark of self contained competitive programming problems sourced from recent online judges, designed to reduce the risk of contamination in code evaluation
(
Jain et al., 2025
)
. All problems we use were released after 2025, after the training cutoffs of Claude Opus 4.7 and Codex GPT-5.5, so neither model could have memorized their solutions during training. Each task is a single file Python problem with a problem statement, optional starter code, and a hidden test suite. Tasks carry difficulty labels (easy, medium, hard), and we use only the hard and medium difficulty tiers to approximate real life software engineering tasks worth using agents. We pool the two difficulty tiers and compare six conditions: Claude Opus 4.7 solo, Codex GPT-5.5 solo, Claude output reviewed by Codex, Codex output reviewed by Claude, Claude output reviewed by Claude, and Codex output reviewed by Codex. LiveCodeBench fits this question well because the same problem can be evaluated repeatedly under different writer and reviewer assignments against a common hidden test evaluator, which isolates the review pass without changing the task distribution. All writer and reviewer turns use the vendors’
high
reasoning effort setting, which uses more tokens, cost, and latency than medium effort. We report pass rate together with reviewer fixes, regressions, latency, and cost.
In this paper, we focus on the following questions:
RQ1.
Does a reviewer pass improve overall correctness?
RQ2.
Does the value of a reviewer pass depend on which model writes and which model reviews?
RQ3.
When does the reviewer step fix the draft, and when does it regress it?
RQ4.
Are correctness gains worth added cost and latency?
Review effectiveness in our experiments turns out to be asymmetric. Claude Opus 4.7 is the strongest solo writer in the sample, Claude Opus 4.7 reviewing Codex GPT-5.5 drafts recovers most of the gap between Codex GPT-5.5 solo and Claude Opus 4.7 solo, and Codex GPT-5.5 reviewing Claude Opus 4.7 drafts makes the pipeline worse. We analyze this asymmetry through paired correctness tests, fix/regression counts, and cost-latency trade-offs, then derive a workflow recommendation: review is most useful when the initial draft comes from Codex GPT-5.5.
2.
Background and Related Work
2.1.
Code generation benchmarks
Code generation evaluation has usually been organized around standalone model performance. HumanEval made functional correctness a central measure for generated code
(
Chen et al., 2021
)
, and MBPP extended this style of evaluation to short Python programming tasks
(
Austin et al., 2021
)
. APPS moved the setting toward harder programming-challenge problems
(
Hendrycks et al., 2021
)
, and AlphaCode showed that large-scale generation and filtering can reach nontrivial competitive programming performance
(
Li et al., 2022a
)
. LiveCodeBench addresses benchmark saturation and contamination by collecting recent coding contest problems over time from LeetCode, AtCoder, and Codeforces, tagging each problem with its public release date
(
Jain et al., 2025
)
. The release date metadata lets evaluators score a model only on problems published after its training cutoff, which controls for the data leakage documented on older static benchmarks. LiveCodeBench also reports several evaluation scenarios beyond code generation, including self repair, code execution, and test output prediction.
Prior work also argues that quality should be reported together with efficiency rather than in isolation
(
Zhang et al., 2026a
;
Jiang et al., 2026b
;
Gao et al., 2026
;
Shen et al., 2026
)
. This matters even more for review workflows because a reviewer pass adds another model call, more tokens, and more latency. We therefore treat pass rate, cost, latency, fixes, and regressions as a set of measurements rather than a leaderboard number.
2.2.
Iterative refinement and self debug
Self-Refine and Reflexion study a single model that improves its own output through feedback turns
(
Madaan et al., 2023
;
Shinn et al., 2023
)
. Self-Debug teaches a model to repair its own code from execution traces
(
Chen et al., 2024
)
. Olausson et al. ask whether self-repair is a silver bullet for code generation and find that the gain depends on whether the repair model is meaningfully stronger than the draft model
(
Olausson et al., 2024
)
. On HumanEval and APPS with Code Llama, GPT-3.5, and GPT-4, same model self repair produces only modest accuracy improvements because it is bottlenecked by the model’s ability to provide useful feedback on its own code; the largest gains appear when a stronger model repairs a weaker model’s drafts, and human level debugging substantially outperforms self generated feedback. Our same model conditions will reproduce this finding but with execution feedback removed. Recent work also shows that memory can change LLM agent behavior
(
Liu et al., 2026
)
, and that LLM outputs exhibit non-trivial variance across repeated runs even under fixed conditions
(
Zhou et al., 2026
;
Guo et al., 2025
)
. Our experiment isolates a related but distinct case: the reviewer is a different model, runs once, has no execution feedback, and has no memory of prior attempts. This removes iteration and tool use, so that the measured effect can be attributed to the cross-model review pass itself.
2.3.
Multi agent and agentic coding
CodeT and LEVER use generated tests or learned verification to improve code outputs
(
Chen et al., 2022
;
Ni et al., 2023
)
. Multi agent debate work shows that two language-model instances can improve factuality or divergent thinking by critiquing each other
(
Du et al., 2024
;
Liang et al., 2024
)
; this is a natural framing of two models reviewing one another, although that line studies open-ended reasoning rather than executable programs. Multi-LLM combinations have also been used in domain forecasting tasks such as financial sentiment
(
Zhang et al., 2026c
)
, robot tasks
(
Zhang et al., 2025
;
Zhang et al., 2026b
)
, and LLMs have been integrated with reinforcement learning for portfolio optimization
(
Wang et al., 2025
)
. ChatDev and MetaGPT assign software-development roles across multiple agents
(
Qian et al., 2024
;
Hong et al., 2024
)
. AgentCoder and CodeCoR study role-based coding workflows
(
Huang et al., 2023
;
Pan et al., 2025
)
. Other work studies capability composition across multi-agent pipelines from a safety angle
(
Jiang et al., 2026a
)
. In contrast, our workflow has one writer, one static reviewer, no generated tests, and no execution feedback for the reviewer.
2.4.
Code review and LLM reviewers
Modern code review supports defect detection, knowledge transfer, and shared code quality
(
Sadowski et al., 2018
;
Bacchelli and Bird, 2013
)
. In human teams, review is not only a bug finding and for readability, it is also a coordination point where a second engineer decides whether to ship as is, lightly edit, or reject a proposed change. This role structure is similar to what multi agent coding workflows are beginning to imitate when one LLM drafts code and another LLM inspects it.
Prior work studies review-comment generation and code refinement
(
Tufano et al., 2021
;
Li et al., 2022b
)
. Recent LLM-focused work finds that apparent success on code refinement often reflects memorization rather than comprehension
(
Lin et al., 2025
)
, and that LLM reviewers can systematically overcorrect on requirement conformance
(
Jin and Chen, 2026
)
. These findings motivate a stricter evaluation target for LLM review. It is not whether the reviewer produces plausible comments, but whether the final submitted program is more correct than the writer’s original draft. We measure the correctness of the final program after a review pass and separately count reviewer fixes and regressions.
3.
Methodology
3.1.
Task Setting and Prompts
Each task is a hard or medium LiveCodeBench code generation problem. We did not include the easy category given they are trivial for LLMs and software practitioners to solve at this point. The writer receives the problem statement, any starter code, and is asked for a complete Python solution inside
<solution>
tags.
Listing 1:
Writer prompt template
⬇
You
are
an
expert
competitive
programmer
.
Solve
the
following
programming
problem
.
PROBLEM:
{problem}
{starter_code}
Your
task
:
1.
Produce
a
complete
,
runnable
Python
solution
2.
Handle
edge
cases
;
optimize
first
for
correctness
,
then
for
performance
3.
Output
only
the
final
solution
inside
<solution>
tags
<solution>
#
final
python
code
here
</solution>
Listing 2:
Reviewer prompt template
⬇
You
are
an
expert
code
reviewer
.
Review
the
following
solution
to
a
competitive
programming
problem
.
PROBLEM:
{problem}
{starter_code}
SUBMITTED SOLUTION:
{writer_output}
Your
task
:
1.
Identify
any
bugs
,
incorrect
logic
,
missing
edge
cases
,
or
inefficiencies
2.
Produce
a
final
corrected
solution
-
either
the
original
if
it
is
correct
,
or
an
improved
version
3.
Do
NOT
run
or
test
the
code
;
reason
purely
from
code
inspection
Output
only
the
final
solution
inside
<solution>
tags
.
Do
not
include
explanations
outside
the
tags
.
<solution>
#
final
python
code
here
</solution>
In a solo baseline, a parsed writer draft is submitted directly to the LiveCodeBench evaluator. In a reviewed condition, the same writer artifact becomes the submitted solution shown to a reviewer model, which also receives the original problem and starter code. The reviewer is instructed to inspect the draft for bugs, missing edge cases, incorrect logic, and inefficiencies, then write a final program inside
<solution>
tags: either the original draft if it is correct or a corrected version if it is not. The reviewer cannot run the code, query a test runner, see hidden tests, or inspect execution traces. This is the
static review
setting introduced in Section
1
. All final artifacts are parsed through the same tag-based extractor before evaluation, so the measured difference between conditions is the added review pass rather than a change in evaluator or output parser. The prompt templates are fixed across models and conditions. The artifact includes the exact prompt files and per task prompt hashes.
Listings
1
and Listing
2
define the two role-specific prompt templates used throughout the study. The writer prompt instructs the model to solve the competitive programming task from the provided problem statement and starter code, prioritizing correctness, edge-case handling, and computational efficiency. To ensure a uniform output artifact, the writer is required to return only a complete runnable Python solution enclosed within
<solution>
tags.
The reviewer prompt receives the same task specification together with the writer generated solution. Rather than providing feedback or commentary, the reviewer performs a static code review and must return a final executable program. Reviewers are explicitly instructed to reason solely from code inspection and are not allowed to execute or test the program.
Both prompts enforce an identical output format consisting exclusively of a Python solution wrapped in
<solution>
tags. This design removes variation arising from the explanatory text and allows all experimental conditions to be evaluated using the same downstream extraction and scoring pipeline. Task-specific content is injected through placeholders corresponding to the problem statement, the starter code, and, when applicable, the draft produced by the writer. Holding the task specification and output format constant while varying only the role assignment and model identity isolates the effects of review and cross-model collaboration.
Table 1.
Experimental conditions. All turns use high reasoning effort.
ID
Writer
Reviewer
Role type
A
Claude Opus 4.7
–
Solo baseline
O
Codex GPT-5.5
–
Solo baseline
AO
Claude Opus 4.7
Codex GPT-5.5
Cross-model
OA
Codex GPT-5.5
Claude Opus 4.7
Cross-model
AA
Claude Opus 4.7
Claude Opus 4.7
Same-model
OO
Codex GPT-5.5
Codex GPT-5.5
Same-model
3.2.
Conditions
Table
1
lists the six conditions. Throughout the paper we use compact labels: "A" for Anthropic Claude Opus 4.7, "O" for OpenAI Codex GPT-5.5.
Two-letter labels are in writer then reviewer order, so AO is Claude output reviewed by Codex, and OA is Codex output reviewed by Claude. The solo baselines give us standalone performance. The two same-model conditions tell us whether a second pass helps at all when there is no model diversity. The two cross-model conditions answer the model role assignment question and let us see whether direction matters.
3.3.
Execution and Cost Accounting
The runs used
claude-opus-4-7
through Claude Code 2.1.50 and
gpt-5.5
through Codex CLI. Both runs set
reasoning.effort = high
. Each turn had a 3,000-second CLI timeout. A timed-out turn was retried once with a doubled timeout. A task that still ended incomplete (CLI error, timeout, parse failure, or empty final artifact) was retried up to four attempts. The harness records raw outputs, final artifacts, prompt hashes (SHA-256), CLI versions, timestamps, parse metadata, retry metadata, token counts, costs, and evaluation results. API costs are computed from token counts and a pricing configuration pulled from the official websites.
3.4.
Sample, Metrics, and Statistical Tests
We combine the complete case portions of two LiveCodeBench runs: one hard slice and one medium slice.
Complete case analysis
restricts the data to tasks for which all six conditions produced a valid evaluated artifact: a non-null evaluation result with no CLI error, no timeout, no parse failure, no budget-exceeded flag, and a non-empty final program. The pooled complete case analysis contains 116 tasks, with task identifiers namespaced by difficulty before pooling. This is a bounded controlled sample, not a leaderboard-scale evaluation; the artifact retains the per task metadata for future audits.
Table 2.
Pooled complete case metrics across hard and medium LiveCodeBench tasks.
SID
\mathrm{SID}
is the change in Pass Rate relative to the writer’s solo baseline; Reg. rate is the share of tasks where the writer-only baseline passed but the reviewed condition failed.
Condition
Pass
Pass Rate [95% CI]
SID
\mathrm{SID}
Cost/task
Latency
Reg. rate
Baselines
A: Claude Opus 4.7 solo
106
.914 [.862,.957]
–
$.226
86.2s
–
O: Codex GPT-5.5 solo
83
.716 [.629,.793]
–
$.190
38.5s
–
Reviewed conditions
AO: Claude Opus 4.7 reviewed by Codex GPT-5.5
96
.828 [.759,.897]
−
.086
-.086
$.382
118.0s
.112
OA: Codex GPT-5.5 reviewed by Claude Opus 4.7
104
.897 [.836,.948]
+
.181
+.181
$.443
112.4s
.043
AA: Claude Opus 4.7 reviewed by Claude Opus 4.7
106
.914 [.862,.957]
+
.000
+.000
$.389
135.8s
.026
OO: Codex GPT-5.5 reviewed by Codex GPT-5.5
98
.845 [.776,.905]
+
.129
+.129
$.312
67.9s
.052
Let
y
t
​
c
∈
{
0
,
1
}
y_{tc}\in\{0,1\}
indicate whether task
t
t
passed under condition
c
c
. The pass rate is
(1)
P
​
R
c
=
1
|
T
c
|
​
∑
t
∈
T
c
y
t
​
c
.
PR_{c}=\frac{1}{|T_{c}|}\sum_{t\in T_{c}}y_{tc}.
For a two-pass condition
c
c
with writer model
w
w
, the improvement delta compares the condition to the corresponding solo writer baseline
b
⁡
(
w
)
b(w)
:
(2)
SID
c
=
P
​
R
c
−
P
​
R
b
⁡
(
w
)
.
\mathrm{SID}_{c}=PR_{c}-PR_{b(w)}.
We also report average cost per task, latency, and reviewer-induced regressions. Regressions are tasks where the writer-only baseline passes but the reviewed condition fails. Reviewer fixes are tasks where the writer-only baseline fails but the reviewed condition passes.
We report bootstrap 95% confidence intervals for complete case pass rate. The McNemar test
(
McNemar, 1947
)
compares two binary outcomes on the same set of items by counting only the items where the two conditions disagree; it is the standard paired test for matched 0/1 outcomes such as task-level pass/fail across two conditions. For conditions
a
a
and
b
b
, let
(3)
n
10
=
∑
t
𝟏
​
{
y
t
​
a
=
1
,
y
t
​
b
=
0
}
,
n
01
=
∑
t
𝟏
​
{
y
t
​
a
=
0
,
y
t
​
b
=
1
}
.
n_{10}=\sum_{t}\mathbf{1}\{y_{ta}=1,y_{tb}=0\},\quad n_{01}=\sum_{t}\mathbf{1}\{y_{ta}=0,y_{tb}=1\}.
Under the null that the two conditions are equally likely to win on discordant tasks,
X
∼
Binom
⁡
(
n
10
+
n
01
,
1
/
2
)
X\sim\mathrm{Binom}(n_{10}+n_{01},1/2)
. We use the exact two-sided McNemar p-value,
(4)
p
=
min
(
1
,
2
min
[
\displaystyle p=\min\Bigl(1,\;2\min\bigl[
P
{
X
≤
min
(
n
10
,
n
01
)
}
,
\displaystyle P\{X\leq\min(n_{10},n_{01})\},
P
{
X
≥
max
(
n
10
,
n
01
)
}
]
)
.
\displaystyle P\{X\geq\max(n_{10},n_{01})\}\bigr]\Bigr).
For paired correctness comparisons, we apply BH (Benjamini-Hochberg) correction
(
Benjamini and Hochberg, 1995
)
across all pairwise contrasts generated by the analysis script. If
p
(
1
)
≤
⋯
≤
p
(
m
)
p_{(1)}\leq\cdots\leq p_{(m)}
are the sorted p-values, the adjusted value is
(5)
q
(
i
)
=
min
j
≥
i
⁡
(
1
,
m
j
​
p
(
j
)
)
,
q_{(i)}=\min_{j\geq i}\left(1,\frac{m}{j}p_{(j)}\right),
with monotone adjustment from largest to smallest p-value. Table
4
reports the contrasts most relevant to the role assignment argument. To understand whether the apparent writer and reviewer interaction is statistically supported beyond the per writer effects, the artifact also reports a direct AO versus OA paired contrast and the underlying per task pass vectors.
4.
Results
Model inference ran on vendor hosted infrastructure through Claude Code and Codex CLI. The program is ran locally using a MacBook Air with Apple M4 chip and 16 GB RAMP (2025) that handled orchestration, file I/O, logging, parsing, and wall-clock timing of the remote calls.
The results section is organized around the four research questions. Table
2
gives the complete assessment for every condition; Table
3
collapses those rows into the writer-by-reviewer view; Table
4
tests paired differences on the same 116 tasks; and Figures
1
–
2
separate correctness gains from the cost of obtaining them. Table
5
shows various inspected cases that contained fixes and regressions.
4.1.
RQ1: Does a reviewer pass improve correctness?
Table
3
summarizes the headline result and Table
2
gives the underlying numbers. The main takeaway is that the answer to RQ1 changes depending on who wrote the draft and reviewed the code. Codex GPT-5.5 solo lands at 71.6%; the same drafts run through Claude Opus 4.7 review jump to 89.7%, and through Codex GPT-5.5 review to 84.5%. Claude Opus 4.7 solo is already at 91.4%; Claude Opus 4.7 reviewing itself stays at 91.4%, and handing Claude Opus 4.7’s draft to Codex GPT-5.5 actually drops it to 82.8%.
The size of the two positive review effects also shows that the reviewer’s contribution is bounded by its relative capability rather than guaranteed by simply adding a second pass. OA adds 21 net passes over Codex GPT-5.5 solo (104 versus 83 passing tasks), putting a workflow that begins with a Codex GPT-5.5 draft within two passing tasks of Claude Opus 4.7 solo. OO adds 15 net passes over Codex GPT-5.5 solo while keeping cost and latency lower than OA. In contrast, AO loses 10 net passes relative to Claude Opus 4.7 solo and has the highest regression rate in Table
2
.
Table 3.
Pass rate for each writer and reviewer pair, with the delta against the writer’s solo baseline. Rows: who wrote. Columns: who reviewed. Claude as reviewer is always helpful or neutral; Codex as reviewer is helpful only when the draft is its own.
Reviewer
Writer
Claude
Codex
Claude (solo 91.4%)
91.4% (
±
0
\pm 0
pp)
82.8% (
−
8.6
-8.6
pp)
Codex (solo 71.6%)
89.7% (
+
18.1
+18.1
pp)
84.5% (
+
12.9
+12.9
pp)
Table 4.
Selected complete case McNemar tests over the shared 116 tasks. Each row compares two conditions on the same set of tasks. “First only” is the number of tasks the first condition passed and the second failed; “Second only” is the reverse.
p
B
​
H
p_{BH}
is the BH adjusted p-value across all pairwise contrasts.
Comparison
First only
Second only
p
p
p
B
​
H
p_{BH}
Per writer reviewer effects
OA vs O
26
5
.0002
.0010
OO vs O
21
6
.0059
.0222
AO vs A
3
13
.0213
.0456
AA vs A
3
3
1.0000
1.0000
AA vs AO
12
2
.0129
.0323
Direct between-orderings contrast
AO vs OA
5
13
.0963
.1444
4.2.
RQ2: Writer–Reviewer Role Assignment
Table
4
reports the corresponding paired McNemar tests. For Codex GPT-5.5 drafts, both reviewers help after BH correction: OA improves over O by 18.1 pp (
p
B
​
H
=
.0010
p_{BH}=.0010
) and OO by 12.9 pp (
p
B
​
H
=
.0222
p_{BH}=.0222
). For Claude Opus 4.7 drafts, same-model review is ineffective, while cross-model review by Codex GPT-5.5 is significantly worse than Claude Opus 4.7 solo (
p
B
​
H
=
.0456
p_{BH}=.0456
). AA versus AO is also significant (
p
B
​
H
=
.0323
p_{BH}=.0323
), indicating that the choice of reviewer matters even when the writer is already the stronger of the two.
The direct AO vs OA contrast does not survive BH correction (
p
B
​
H
=
.1444
p_{BH}=.1444
), so we do not claim that the two cross-model orderings are statistically separable as standalone conditions on this sample.
4.3.
RQ3: Fixes versus Regressions
A pass rate hides two different reviewer behaviors: a reviewer can fix a failing draft, or break a passing one. Figure
1
unpacks them, grouping conditions by writer with explicit fix and regression counts on the right. The contrast that is hardest to miss is between the two cross-model orderings: OA fixes 26 of Codex GPT-5.5’s failures while regressing only 5 of its successes (net
+
21
+21
), and AO does the opposite, fixing only 3 of Claude Opus 4.7’s failures but breaking 13 of its successes (net
−
10
-10
). The two same-model conditions sit between these poles: OO is broadly positive (21 fixes, 6 regressions), and AA is at the noise floor (3 fixes, 3 regressions).
In addition, we read through representative fixes and regressions by hand. The supporting evidence for these examples lives in the artifact records; each record stores the writer artifact, reviewer artifact, final artifact, prompt hashes, and pass or fail outcome. The pattern labels below are interpretive and might not be reproducible in repeated runs.
Table 5.
Representative inspected cases from artifact records. These examples are not a coded taxonomy but illustrate the mechanisms behind the aggregate fix and regression counts.
Problem
Cond.
Draft
Final
Reviewer action
Interpretation
3562
OA
fail
pass
Removed code fences around a dynamic-programming solution so the evaluator could parse the submitted program.
The reviewer corrects a submission failure on parsing.
abc394_f
AO
fail
pass
Replaced an incorrect component-counting solution with a tree dynamic program.
This is a rare helpful AO case. The O reviewer found the missing structural invariant.
3688
OO
fail
pass
Restored deleted values in the segment-tree state and kept the rest of the writer’s interface.
The same model O reviewer is helpful when it repairs one local invariant while preserving the draft’s architecture.
3717
AO
pass
fail
Replaced a passing sorted-list median-window solution with a heap-based rewrite.
The reviewer discards a correct invariant and introduces a new one that fails hidden tests.
arc191_a
AA
pass
fail
Changed optional digit accounting in an already passing solution.
The same model reviewer can regress when the second pass treats a delicate boundary case as a cleanup opportunity.
abc389_f
OO
pass
fail
Removed a segment-tree range guard that protected an edge case.
A small guard deletion can break a solution that otherwise had the right data structure.
Table
5
shows representative cases at the task level. Fixes include Problem 3688, where OO repairs its own segment-tree state, and
abc394_f
, where the O reviewer replaces a failing component count with a tree dynamic program. Regressions include Problem 3717 (AO replaces a passing sorted-list median window with a failing heap-based rewrite),
arc191_a
(AA rewrites the boundary handling of an already passing solution), and
abc389_f
(OO deletes a segment-tree range guard protecting an edge case).
4.4.
RQ4: Cost and Latency Trade-Offs
A review pass is not free, as it doubles the API call count and adds tens of seconds of wall-clock latency. The cost-per-token and latency overhead of additional LLM passes has motivated a broad line of work on efficient LLM deployment
(
Cheng et al., 2026
)
. Figure
2
shows whether that extra spend buys anything. Each arrow starts at a writer’s solo point and ends at one of its reviewed conditions, so the slope of the arrow tells you whether the extra cost or latency on the horizontal axis bought accuracy on the vertical axis.
For Codex GPT-5.5 as writer, both arrows go up and to the right. OO buys 12.9 pass rate points for an extra $0.12 per task and 29 seconds of latency; OA buys 18.1 points for an extra $0.25 and 74 seconds. OO is the cheap, fast option. For Claude Opus 4.7 as writer, neither arrow justifies the spend.
A
→
A
​
A
A\!\to\!AA
is flat-right: $0.16 and 50 seconds for zero accuracy gain.
A
→
A
​
O
A\!\to\!AO
points down-and-right: $0.16 and 32 seconds for an 8.6-point accuracy loss.
Claude writer
Codex writer
AA
AO
OA
OO
+
+
3
/
−
-
3
+
+
3
/
−
-
13
+
+
26
/
−
-
5
+
+
21
/
−
-
6
pass kept
fix
fail kept
regression
share of tasks (%), grouped by writer
Figure 1.
Per task outcomes (
n
=
116
n=116
): stacked decomposition with conditions grouped by writer. Absolute fix and regression counts are shown to the right of each bar.
Overall, Claude Opus 4.7 solo sits on the Pareto frontier and no reviewed condition matched or exceeded it in accuracy. AA matches A’s pass rate while adding 72% to cost and 58% to latency; every other reviewed condition has lower accuracy than A. The cost versus accuracy decision worth thinking about is therefore confined to the Codex GPT-5.5 writer column.
$0.20
$0.30
$0.40
65%
75%
85%
95%
100%
pass rate
A
O
AO
OA
AA
OO
cost/task
(a) Cost
40s
80s
120s
65%
75%
85%
95%
100%
pass rate
A
O
AO
OA
AA
OO
latency/task
(b) Latency
Figure 2.
Cost versus accuracy (left) and latency versus accuracy (right) trade-offs. Circles are solo baselines; diamonds are reviewed conditions; arrows show what each added reviewer buys.
Red
arrows leave the Codex solo point;
blue
arrows leave the Claude solo point. Up is more accurate; right is more expensive or slower.
5.
Discussion
5.1.
Claude self review versus Codex self review
The OO and AA rows in Table
2
and Figure
1
apply the same operation, “review your own draft”, to the two writers, and yet produce opposite outcomes. The most plausible explanation is that the two models do different amounts of internal verification on the first pass. At high reasoning effort, Claude Opus 4.7 may already catch most errors that a static reviewer could find, leaving the second pass with little signal. Codex GPT-5.5 appears to leave more residual, catchable errors.
The latency table supports this reading: Claude Opus 4.7 solo takes 86.2 s per task against Codex GPT-5.5’s 38.5 s, consistent with Claude Opus 4.7 spending more compute on first pass checks. If review value depends on the gap between what the writer already verified and what the reviewer can add, then AA has little to add and OO has a real margin to work with.
5.2.
Claude reviewing Codex helps whereas Codex reviewing Claude hurts
The same asymmetry shows up across the two cross-model conditions in Table
3
: OA gains while AO loses on the same task set with the same prompts.
There are two possible hypotheses on this. First, Claude Opus 4.7’s heavier first pass verification leaves less for any second pass to find, so a Codex GPT-5.5 reviewer staring at a Claude Opus 4.7 draft has few real catches available and tends to fall back on rewriting. Second, Claude Opus 4.7 starts from a higher pass rate baseline, so a Claude Opus 4.7 reviewer has room to lift Codex GPT-5.5, while a Codex GPT-5.5 reviewer can mostly only drop Claude Opus 4.7. Both are consistent with the Olausson et al. finding that the gain from a repair pass depends on whether the repairer is stronger than the drafter
(
Olausson et al., 2024
)
: OA is the case where the reviewer is stronger than the drafter, and AO is the reverse. Because the two models differ in baseline pass rate, this design cannot fully separate the effect of review direction from the effect of that baseline gap, so we read the cross-model comparison as descriptive of role assignment rather than as a causal claim about ordering alone.
5.3.
Helpful review edits whereas harmful review rewrites
Across the cases in Section
4.3
, the OA and AO reviewers differ less in how often they intervene than in how do they intervene. Codex GPT-5.5 as reviewer, when uncertain, tends to discard the writer’s data structure and start over (the 3717 heap rewrite and the
abc389_f
guard deletion are characteristic). Claude Opus 4.7 as reviewer tends to keep the writer’s interface and repair one local invariant, such as 3688 on a segment-tree fix.
We did not measure rewrite frequency directly, so this is an interpretive pattern across the artifact rather than a quantitative claim. It suggests a concrete prompt direction for future work: instruct the reviewer to first decide whether to intervene at all, and to default to keeping the writer’s structure when in doubt.
5.4.
When to add a reviewer, and when not to
Cost and latency turn the discussion above into a practical guideline for this benchmark based on the sample data:
•
If the writer must be Codex GPT-5.5
: use OA when accuracy dominates (89.7%,
+
18.1
+18.1
pp over Codex GPT-5.5 solo, lowest reviewed regression rate at 4.3%) and use OO when the per task latency budget is under roughly 70 s and 84.5% is acceptable.
•
If the writer must be Claude Opus 4.7
: skip review. AA matches A’s pass rate while adding cost and 49.6 s of latency; AO loses 8.6 pp at higher cost than either solo baseline.
•
Cost per net fix
: OA adds 21 net passes at an extra $0.25 per task across 116 tasks, or roughly $1.40 per net fix; OO adds 15 net passes at an extra $0.12 per task, or roughly $0.95 per net fix. AO loses 10 net passes at higher cost than either solo baseline, so it has no useful cost per fix number.
•
If both ends are free
: Claude Opus 4.7 solo is Pareto-optimal on this benchmark. No reviewed condition beats it on both axes, and AA is strictly dominated by A.
5.5.
Scope, Limitations, and Reproducibility
This study is designed for exploratory understanding rather than breadth. At 116 paired tasks drawn from hard and medium LiveCodeBench code generation problems, the design is sufficient for a first diagnostic but not for settling stable rankings across future model releases. The natural follow-up is to repeat the design on larger LiveCodeBench dataset as later releases appear. Evaluating the same design on a larger task sample and on additional code benchmarks beyond LiveCodeBench would also help test whether these patterns generalize. The setting isolates algorithmic reasoning under contamination-aware evaluation using LiveCodeBench but does not generalize to repository-scale bug fixing, build systems, or multi-file review. The static reviewer cannot execute tests, which keeps the setting close to pre-CI code review but likely understates what a tool-using agent with a sandbox could achieve. Results are also sensitive to prompt wording and formatting instructions, and because coding agents change quickly we pin model identifiers, CLI versions, and execution dates, though future releases may shift the numbers in either direction. Cost figures are point-in-time estimates subject to pricing and caching changes.
Our prompts are written manually, which can advantage or disadvantage either model. Stronger or more conservative instructions might reduce harmful rewrites and further tool access could change both the fix rate and the regression rate. There can be further investigation into how prompts can be worded differently and whether models can benefit from memory of past failures, such as prior success and failure review cases, test driven development, or feedback on draft results. A related limitation is structural: in our prompt the reviewer always emits a final program, so there is no separate “intervene?” decision. AO’s high regression rate (11.2%) is consistent with Codex GPT-5.5 over-using that rewrite affordance. A prompt that asks the reviewer to first decide whether to intervene, and only then to write a final program, is a natural follow-up.
We used "high" reasoning effort in Codex GPT-5.5 and Claude Opus 4.7; "extra high" in Codex GPT-5.5 and, more recently, "Max" in Claude Opus 4.7 are now available. Given we were initially attempting to understand whether the review step helps and which model is the better reviewer, we did not focus on different reasoning parameters. In addition, new models are also released very often. It is likely that newer versions of Claude Opus 4.7 and Codex GPT-5.5 have improved results. Further experiments and analysis using the latest models and different reasoning efforts can provide more granular recommendations for software practitioners. Our evidence also covers a single model pair, so whether the asymmetry generalizes beyond Claude Opus 4.7 and Codex GPT-5.5 to families such as Gemini, DeepSeek, Qwen, or Grok is untested, and repeating the design across more models, including within one family, is a direct way to check for consistent patterns.
The benchmark tasks are self contained Python programs with hidden tests, not patches inside a live repository. This makes correctness measurement precise, but it does not consider areas such as API compatibility, build integration, style consistency, security posture, and maintainability across files. Restricting to self contained functions is what isolates the writer and reviewer roles from repository context and multi file dependencies, which is why we treat it as a first controlled diagnostic before repository scale review. We therefore view the results as evidence about model role assignment under controlled static review, not as a universal ranking of either model as a software reviewer. We also score review only by the correctness of the final program. Code review in practice yields more than a pass or fail signal, including design feedback, readability comments, and security observations, and whether LLM reviewers add value along those dimensions is left to future work.
Lastly, for reproducibility, the released artifact
1
1
1
Code and data: https://github.com/shawnzxiang/cross-model-review-code
includes the full experiment configuration, prompts, raw outputs, prompt hashes, CLI versions, timing and token fields, and analysis scripts. Reproducing all six writer-reviewer conditions across the 116 complete case tasks costs roughly $225 in API calls (or $1.94 per task across 6 conditions, see Table
2
), with retries, models, and reasoning effort configurable.
6.
Conclusion
We started with a simple question: if you have two coding agents and let one write a draft while the other reviews it before the code is submitted, does the review pass help? Using Claude Opus 4.7 and Codex GPT-5.5, we ran every writer and reviewer combination on 116 hard and medium LiveCodeBench programming problems. The reviewer saw the problem and the draft but could not run the code or see test results.
The answer depends on who wrote the draft. When Codex GPT-5.5 writes, a review pass helps: Claude Opus 4.7 reviewing Codex GPT-5.5 raises the pass rate from 71.6% to 89.7% (a gain of 18.1 points), and Codex GPT-5.5 reviewing its own draft raises it to 84.5% (a gain of 12.9 points). When Claude Opus 4.7 writes, a review pass does not help. Claude Opus 4.7 reviewing itself leaves its 91.4% pass rate unchanged, and Codex GPT-5.5 reviewing Claude Opus 4.7 drops it to 82.8% (a loss of 8.6 points). Looking at individual tasks shows that a helpful review fixes a small flaw in an otherwise sound draft, while a harmful review throws away a working draft and rewrites it into one that fails.
The implication in this paper is practical for software development. If Codex GPT-5.5 writes the draft, add a review pass, and use Claude Opus 4.7 as the reviewer for the best accuracy or Codex GPT-5.5 itself when cost and latency matter more. If Claude Opus 4.7 writes the draft, submit it as is, because no reviewer we tested beats Claude Opus 4.7 working alone. The exact numbers are specific to these two model versions and to LiveCodeBench. Future research on areas such as modifying reviewer prompts, scaling up the task sample, evaluating on additional code benchmarks beyond LiveCodeBench, and testing a wider range of LLM models and configurations can provide us with a deeper understanding of review agents in the era of Agentic AI software development.
References
Anthropic (2025)
Anthropic
Claude opus 4 system card
.
Note:
https://www.anthropic.com/claude/opus
Model identifier: claude-opus-4
Cited by:
§1
.
Austin
et al.
(2021)
J. Austin, A. Odena, M. Nye, M. Bosma, H. Michalewski, D. Dohan, E. Jiang, C. Cai, M. Terry, Q. Le,
et al.
Program synthesis with large language models
.
arXiv preprint arXiv:2108.07732
.
Cited by:
§2.1
.
Bacchelli and Bird (2013)
A. Bacchelli and C. Bird
Expectations, outcomes, and challenges of modern code review
.
In
2013 35th international conference on software engineering (ICSE)
,
pp. 712–721
.
Cited by:
§2.4
.
Benjamini and Hochberg (1995)
Y. Benjamini and Y. Hochberg
Controlling the false discovery rate: a practical and powerful approach to multiple testing
.
Journal of the Royal Statistical Society: Series B (Methodological)
57
(
1
),
pp. 289–300
.
Cited by:
§3.4
.
Chen
et al.
(2022)
B. Chen, F. Zhang, A. Nguyen, D. Zan, Z. Lin, J. Lou, and W. Chen
CodeT: code generation with generated tests
.
arXiv preprint arXiv:2207.10397
.
Cited by:
§2.3
.
Chen
et al.
(2021)
M. Chen, J. Tworek, H. Jun, Q. Yuan, H. P. D. O. Pinto, J. Kaplan, H. Edwards, Y. Burda, N. Joseph, G. Brockman,
et al.
Evaluating large language models trained on code
.
arXiv preprint arXiv:2107.03374
.
Cited by:
§2.1
.
Chen
et al.
(2024)
X. Chen, M. Lin, N. Schärli, and D. Zhou
Teaching large language models to self-debug
.
In
International Conference on Learning Representations
,
Vol.
2024
,
pp. 8746–8825
.
Cited by:
§2.2
.
Cheng
et al.
(2026)
Z. Cheng, L. Lai, Y. Liu, and Y. Sun
Toward sustainable on-device intelligence: a survey on energy-efficient rag systems with small language models
.
Available at SSRN 6698538
.
Cited by:
§4.4
.
Du
et al.
(2024)
Y. Du, S. Li, A. Torralba, J. B. Tenenbaum, and I. Mordatch
Improving factuality and reasoning in language models through multiagent debate
.
In
Forty-first international conference on machine learning
,
Cited by:
§2.3
.
Gao
et al.
(2026)
Y. Gao, Y. Lu, Z. Zhang, J. Nie, S. Yu, and Q. Xuan
DSPC: dual-stage progressive compression framework for efficient long-context reasoning
.
In
ICASSP 2026 - 2026 IEEE International Conference on Acoustics, Speech and Signal Processing (ICASSP)
,
pp. 19387–19391
.
External Links:
Document
Cited by:
§2.1
.
Guo
et al.
(2025)
J. Guo, Z. Qi, X. Zhao, S. Xu, and H. Xu
LightLLM-enhanced multi-robot collaboration with human-in-the-loop
.
In
2025 8th International Conference on Robotics, Control and Automation Engineering (RCAE)
,
pp. 27–32
.
Cited by:
§2.2
.
Hendrycks
et al.
(2021)
D. Hendrycks, S. Basart, S. Kadavath, M. Mazeika, A. Arora, E. Guo, C. Burns, S. Puranik, H. He, D. Song,
et al.
Measuring coding challenge competence with APPS
.
arXiv preprint arXiv:2105.09938
.
Cited by:
§2.1
.
Hong
et al.
(2024)
S. Hong, M. Zhuge, J. Chen, X. Zheng, Y. Cheng, J. Wang, C. Zhang, S. Yau, Z. Lin, L. Zhou,
et al.
MetaGPT: meta programming for a multi-agent collaborative framework
.
In
International Conference on Learning Representations
,
Vol.
2024
,
pp. 23247–23275
.
Cited by:
§2.3
.
Huang
et al.
(2023)
D. Huang, J. M. Zhang, M. Luck, Q. Bu, Y. Qing, and H. Cui
AgentCoder: multi-agent-based code generation with iterative testing and optimization
.
arXiv preprint arXiv:2312.13010
.
Cited by:
§2.3
.
Jain
et al.
(2025)
N. Jain, A. Gu, W. Li, F. Yan, T. Zhang, S. Wang, A. Solar-Lezama, K. Sen, and I. Stoica
LiveCodeBench: holistic and contamination free evaluation of large language models for code
.
In
International Conference on Learning Representations
,
Vol.
2025
,
pp. 58791–58831
.
Cited by:
§1
,
§2.1
.
Jiang
et al.
(2026a)
X. Jiang, S. Yang, Z. Li, L. Liu, H. Yu, and Y. Liu
ChainCaps: composition-safe tool-using agents via monotonic capability attenuation
.
External Links:
2605.26542
,
Link
Cited by:
§2.3
.
Jiang
et al.
(2026b)
Y. Jiang, D. Li, and F. Ferraro
DRP: distilled reasoning pruning with skill-aware step decomposition for efficient large reasoning models
.
External Links:
2505.13975
,
Link
Cited by:
§2.1
.
Jin and Chen (2026)
H. Jin and H. Chen
Are LLMs reliable code reviewers? Systematic overcorrection in requirement conformance judgement
.
arXiv preprint arXiv:2603.00539
.
Cited by:
§2.4
.
Li
et al.
(2022a)
Y. Li, D. Choi, J. Chung, N. Kushman, J. Schrittwieser, R. Leblond, T. Eccles, J. Keeling, F. Gimeno, A. Dal Lago,
et al.
Competition-level code generation with AlphaCode
.
Science
378
(
6624
),
pp. 1092–1097
.
Cited by:
§2.1
.
Li
et al.
(2022b)
Z. Li, S. Lu, D. Guo, N. Duan, S. Jannu, G. Jenks, D. Majumder, J. Green, A. Svyatkovskiy, S. Fu,
et al.
Automating code review activities by large-scale pre-training
.
In
Proceedings of the 30th ACM joint European software engineering conference and symposium on the foundations of software engineering
,
pp. 1035–1047
.
Cited by:
§2.4
.
Liang
et al.
(2024)
T. Liang, Z. He, W. Jiao, X. Wang, Y. Wang, R. Wang, Y. Yang, S. Shi, and Z. Tu
Encouraging divergent thinking in large language models through multi-agent debate
.
In
Proceedings of the 2024 conference on empirical methods in natural language processing
,
pp. 17889–17904
.
Cited by:
§2.3
.
Lin
et al.
(2025)
H. Y. Lin, C. Liu, H. Gao, P. Thongtanunam, and C. Treude
CodeReviewQA: the code review comprehension assessment for large language models
.
In
Findings of the Association for Computational Linguistics: ACL 2025
,
pp. 9138–9166
.
Cited by:
§2.4
.
Liu
et al.
(2026)
J. Liu, T. Li, S. Du, X. Luo, H. Zeng, E. Tewolde, T. S. Lee, T. Wang, C. Kingsford, and V. Conitzer
The memory curse: how expanded recall erodes cooperative intent in llm agents
.
arXiv preprint arXiv:2605.08060
.
Cited by:
§2.2
.
Madaan
et al.
(2023)
A. Madaan, N. Tandon, P. Gupta, S. Hallinan, L. Gao, S. Wiegreffe, U. Alon, N. Dziri, S. Prabhumoye, Y. Yang,
et al.
Self-Refine: iterative refinement with self-feedback
.
Advances in neural information processing systems
36
,
pp. 46534–46594
.
Cited by:
§2.2
.
McNemar (1947)
Q. McNemar
Note on the sampling error of the difference between correlated proportions or percentages
.
Psychometrika
12
(
2
),
pp. 153–157
.
Cited by:
§3.4
.
Ni
et al.
(2023)
A. Ni, S. Iyer, D. Radev, V. Stoyanov, W. Yih, S. Wang, and X. V. Lin
LEVER: learning to verify language-to-code generation with execution
.
In
International Conference on Machine Learning
,
pp. 26106–26128
.
Cited by:
§2.3
.
Olausson
et al.
(2024)
T. X. Olausson, J. P. Inala, C. Wang, J. Gao, and A. Solar-Lezama
Is self-repair a silver bullet for code generation?
.
In
International Conference on Learning Representations
,
Vol.
2024
,
pp. 36545–36593
.
Cited by:
§2.2
,
§5.2
.
OpenAI (2025)
OpenAI
Introducing GPT-5
.
Note:
https://openai.com/index/introducing-gpt-5/
Model identifier: gpt-5
Cited by:
§1
.
Pan
et al.
(2025)
R. Pan, H. Zhang, and C. Liu
CodeCoR: an LLM-based self-reflective multi-agent framework for code generation
.
arXiv preprint arXiv:2501.07811
.
Cited by:
§2.3
.
Qian
et al.
(2024)
C. Qian, W. Liu, H. Liu, N. Chen, Y. Dang, J. Li, C. Yang, W. Chen, Y. Su, X. Cong,
et al.
ChatDev: communicative agents for software development
.
In
Proceedings of the 62nd annual meeting of the association for computational linguistics (volume 1: Long papers)
,
pp. 15174–15186
.
Cited by:
§2.3
.
Sadowski
et al.
(2018)
C. Sadowski, E. Söderberg, L. Church, M. Sipko, and A. Bacchelli
Modern code review: a case study at google
.
In
Proceedings of the 40th international conference on software engineering: Software engineering in practice
,
pp. 181–190
.
Cited by:
§2.4
.
Shen
et al.
(2026)
B. Shen, L. Jin, H. Cai, L. Hu, and Y. Xin
The efficiency frontier: a unified framework for cost-performance optimization in llm context management
.
arXiv preprint arXiv:2605.23071
.
External Links:
Document
,
Link
Cited by:
§2.1
.
Shinn
et al.
(2023)
N. Shinn, F. Cassano, A. Gopinath, K. Narasimhan, and S. Yao
Reflexion: language agents with verbal reinforcement learning
.
Advances in neural information processing systems
36
,
pp. 8634–8652
.
Cited by:
§2.2
.
Tufano
et al.
(2021)
R. Tufano, L. Pascarella, M. Tufano, D. Poshyvanyk, and G. Bavota
Towards automating code review activities
.
In
2021 IEEE/ACM 43rd International Conference on Software Engineering (ICSE)
,
pp. 163–174
.
Cited by:
§2.4
.
Wang
et al.
(2025)
Y. Wang, Z. Lu, P. Qian, J. Su, M. Zhou, C. Li, and Z. Jiang
GEMs-LLM: integrating large language models with goal-aware exploration for RL-based portfolio optimization
.
In
Advanced Intelligent Computing Technology and Applications
,
Communications in Computer and Information Science
, Vol.
2566
,
Singapore
,
pp. 516–527
.
External Links:
Document
,
Link
Cited by:
§2.3
.
Zhang
et al.
(2025)
S. Zhang, Z. Li, Y. Yin, S. Xu, V. Chaudhary, and H. Xu
A survey on multi-robot collaboration systems: architectures, performances, and applications
.
Cited by:
§2.3
.
Zhang
et al.
(2026a)
Y. Zhang, Z. Xiang, and H. Xu
Performance-efficiency trade-offs in human preference prediction: a comparative study of traditional machine learning and large language models
.
In
Proceedings of the 31st IEEE Symposium on Computers and Communications (ISCC 2026)
,
Cited by:
§2.1
.
Zhang
et al.
(2026b)
Y. Zhang, S. Xu, Z. Li, F. Zhong, X. Yang, and H. Xu
SwiftBot: a decentralized platform for llm-powered federated robotic task execution
.
The 26th IEEE International Symposium on Cluster, Cloud, and Internet Computing (CCGrid)
.
Cited by:
§2.3
.
Zhang
et al.
(2026c)
Z. Zhang, R. Fu, Y. He, X. Shen, Y. Wang, X. Du, H. You, K. Jin, J. Shi, and S. Fong
FinSentLLM: multi-llm and structured semantic signals for enhanced financial sentiment forecasting
.
In
ICASSP 2026 - 2026 IEEE International Conference on Acoustics, Speech and Signal Processing (ICASSP)
,
pp. 17682–17686
.
Cited by:
§2.3
.
Zhou
et al.
(2026)
Y. Zhou, L. Y. Choi, J. Wen, and W. Ye
Accuracy, stability, and repeated-run reliability of large language models on deterministic programming tasks
.
External Links:
2606.00920
,
Link
Cited by:
§2.2
.
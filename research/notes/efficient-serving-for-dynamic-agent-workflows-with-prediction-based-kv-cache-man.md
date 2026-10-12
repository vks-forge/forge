---
title: Efficient Serving for Dynamic Agent Workflows with Prediction-based KV-Cache
  Management
id: efficient-serving-for-dynamic-agent-workflows-with-prediction-based-kv-cache-man
tags:
- ai-software-factory-architecture-58e4cc
- probabilistic-skill-sequencing
- multi-agent-serving
- kv-cache-management
created: '2026-10-12T08:31:44.587557Z'
updated: '2026-10-12T08:35:27.876742Z'
source: https://arxiv.org/html/2605.06472v1
source_domain: arxiv.org
fetched_at: '2026-10-12T08:31:44.584567Z'
fetch_provider: builtin
status: draft
type: note
tier: institutional
content_type: paper
deprecated: false
summary: 'ArXiv paper (Zheng, Fu, Wu, Yuan, Zhang, Wang, Zhu, Yan, Jiang; Wuhan University
  + SJTU + Macquarie + HKUST + Dameng Database, May 2026, cs.LG) introduces PBKV (Prediction-Based
  KV-Cache Management), a serving-layer system for multi-agent LLM workflows (e.g.,
  LangChain/AutoGen/MetaGPT Planner-Coder-Tester pipelines) that predicts future agent
  invocations several steps ahead from historical workflow traces plus the current
  task''s context, then uses that probabilistic forecast to decide which KV-cache
  entries to keep in GPU memory versus evict/prefetch. Problem framing: KV-cache reuse
  across agents in a workflow can exceed 90% hit rate in principle, but GPU memory
  is limited and standard LRU eviction is misaligned with workflow structure (cache
  can sit idle through tool calls/agent transitions before being reused, so LRU evicts
  it prematurely); the existing SOTA, KVFlow, fixes this only by assuming a static,
  predefined agent invocation DAG, which breaks on realistic dynamic workflows (e.g.,
  a Tester sending code back for rewriting, a Retriever spawning new sub-queries).
  PBKV''s predictor (~350K parameters, processes a batch of 1,024 requests in 1.56ms)
  fuses cross-workflow historical transition patterns with per-request semantic signals
  and forecasts K future agent-invocation steps; on the HoVer+LangChain workload it
  reaches 0.94 next-agent-prediction accuracy at 1-step horizon and 0.77 at 3-step
  horizon (trained on 1K traces, tested on 500). Two robustness mechanisms guard against
  prediction error: (1) hierarchical/lifecycle-aware eviction that reclaims ''retired''
  cache from terminated workflows first (a simple deterministic rule that alone improves
  average hit rate up to 1.66x), then ranks remaining active cache by a predictor-driven
  lookahead reuse score; (2) conservative prefetching that only consumes otherwise-idle
  GPU memory/PCIe bandwidth so mispredictions cannot regress performance below baseline
  (an ablation shows aggressive prefetching only marginally beats conservative prefetching
  when noise is below 20%, and degrades below the conservative baseline as prediction
  noise/budget grows, confirming conservative prefetching is the safer default under
  the admittedly hard-to-predict agentic workloads). Evaluated on three workflow benchmarks
  across two LLMs (Qwen3-14B/32B) against LRU and KVFlow: PBKV achieves up to 1.85x
  speedup over LRU on dynamic workflows and up to 1.26x speedup over KVFlow on static
  workflows; on the HoVer+LangChain/Qwen3-14B workload at concurrency 72, LRU''s steady-state
  cache hit rate collapses to below 30% (around 10% under sustained pressure) while
  PBKV''s lifecycle-aware variant reaches 66.01% and the full PBKV (with speculative
  prefetching) reaches 69.10%. Ablations show prediction accuracy monotonically determines
  downstream hit-rate gains across predictor backbones (MLP, GCN, Markov, kNN, linear
  baselines all tested), and the learned transformer-based predictor outperforms every
  baseline family at every lookahead horizon, with Markov baselines saturating early
  while the learned predictor continues to scale with more training data.'
utility_score: 14.0
---

Efficient Serving for Dynamic Agent Workflows with Prediction-based KV-Cache Management
Title:
Content selection saved. Describe the issue below:
Description:
arXiv is now an independent nonprofit!
Learn more
×
License: CC BY 4.0
arXiv:2605.06472v1 [cs.LG] 07 May 2026
Efficient Serving for Dynamic Agent Workflows with Prediction-based KV-Cache Management
Haoyu Zheng
Affiliation:
Wuhan University
Fangcheng Fu
Affiliation:
Shanghai Jiao Tong University
Jia Wu
Affiliation:
Macquarie University
Binhang Yuan
Affiliation:
HKUST
Yongqiang Zhang
Affiliation:
Dameng Database
Hao Wang
Affiliation:
Wuhan University
Yuanyuan Zhu
Affiliation:
Wuhan University
Xiao Yan
Affiliation:
Wuhan University
Jiawei Jiang
†
†
thanks:
Corresponding author:
jiawei.jiang@whu.edu.cn
Affiliation:
Wuhan University
Abstract
LLM-based workflows compose specialized agents to execute complex tasks, and these agents usually share substantial context, allowing KV-Cache reuse to save computation. Existing approaches either manage KV-Cache at agent level and fail to exploit the reuse opportunities within workflows, or manage cache at the workflow level but assume that each workflow calls a static sequence of agents. However, practical workflows are typically dynamic, where the sequence of invoked agents and thus induced cache reuse opportunities depend on the context of each task. To serve such dynamic workflows efficiently, we build a system dubbed PBKV (
P
rediction-
B
ased
KV
-Cache Management). For each workflow, PBKV predicts the agent invocations in several future steps by fusing the guidance from historical workflows and context of the target workflow. Based on the predictions, PBKV estimates the reuse potential of cache entries and keeps the high-potential entries in GPU memory. To be robust to prediction errors, PBKV utilizes the predictions conservatively during both cache eviction and prefetching. Experiments on three workflow benchmarks show that PBKV achieves up to
1.85
×
1.85\times
speedup over LRU on dynamic workflows, and up to
1.26
×
1.26\times
speedup over the SOTA baseline KVFlow on the static workflow.
1
Introduction
Large Language Model (LLM)-based multi-agent systems have become a popular paradigm for complex reasoning and automation.
Frameworks such as LangChain
[
1
]
, AutoGen
[
2
]
, and MetaGPT
[
3
]
decompose a complex task into a group of collaborating
agents
(e.g., a Planner, Coder, and Tester in code-generation pipelines), where each agent is invoked as a single LLM request.
Such multi-agent collaboration on a single task is known as an
agentic workflow
.
Modern inference engines (e.g., vLLM
[
4
]
and SGLang
[
5
]
) share Key/Value tensors (i.e., KV-Cache) across requests, turning expensive prefill into cheap cache lookups.
In an agentic workflow, agents naturally share substantial context, including the system prompt, tool/agent descriptions, and the history accumulated by upstream agents
[
6
,
1
,
7
]
.
We term this reuse pattern
workflow-level cache reuse
.
Ideally, the KV-Cache produced by one agent should be retained for the downstream agents, where the cache hit rate can exceed 90%
[
6
]
.
However, in practice, this potential is bounded by
limited
GPU memory, making effective KV-Cache management crucial in multi-agent serving.
KV-Cache management is fundamentally a problem of
predicting
future access patterns.
Existing inference engines commonly adopt the Least Recently Used (LRU) policy, which rests on a simple heuristic that the longest-idle cache is unlikely to be reused.
However, in multi-agent settings, cache reuse is determined by the
workflow’s structure
rather than temporal locality.
A cache entry may remain idle across multiple agent invocations (e.g., during tool calls or transitions between agents) before being reused, and LRU may evict it prematurely during this idle period.
As a result, LRU’s temporal-locality assumption is misaligned with the structural nature of workflow-level cache reuse.
An idealized alternative is the classic Belady’s algorithm
[
8
]
, which achieves
offline
-optimal cache eviction by evicting the cache whose next access is farthest in the future.
The recent work KVFlow
[
9
]
adapts this idea to multi-agent settings by assuming a
predefined
and
static
agent step graph (i.e., a global DAG that specifies the invocation orders of all agents), and evicting the KV-Cache of the agent whose next invocation is farthest away (i.e., with the largest ‘steps-to-execution’).
This design rests on a strong assumption: the future invocation order of agents is
known a priori
.
This assumption fails on realistic dynamic workloads, where workflows are
runtime-dependent
.
For example, a Tester may send the code back for rewriting; and a Retriever may spawn new sub-queries based on intermediate results.
The realistic workflow structure cannot be determined in advance, thus effective KV-Cache management must
shift from assuming the future to predicting it
.
Challenge.
However, realizing this shift faces two conflicting challenges:
(i)
agentic workloads are inherently hard to predict
[
10
,
11
,
12
,
13
,
14
]
, because the stochastic decoding of LLMs injects uncertainty at each step, which propagates along the workflow path and yields high variability in the resulting agent invocation trace.
Industrial studies from Microsoft
[
15
]
and IBM
[
16
,
17
]
report that such uncertainty is common and consequential in agentic systems.
(ii)
Prediction errors are disproportionately costly.
The cost of mistakes is amplified by the workflow: a cache miss in multi-agent serving may force re-prefill of tens of thousands of tokens
accumulated
along the entire workflow context.
Taken together, the structure of agentic workloads exposes substantial reuse potential, yet inevitably entails prediction errors and the steep cost of erroneous evictions. This motivates the central question of our work:
in a dynamic multi-agent system, how can we design a KV-Cache management framework that (i) is robust to predictor quality and (ii) benefits continuously even from imperfect predictors?
Our Solution.
Our key insights: (i)
multi-step
prediction with
complementary
signals can effectively replace the static assumption; and (ii)
conservative
designs can yield
stable
and
robust
gains.
Specifically,
for the predictor
, we propose two design principles:
(i)
Complementary signal fusion
, which combines
cross-workflow
agent transition patterns with
per-request
semantics;
(ii)
Multi-step horizon
, which is motivated by the fact that cache reuse distances in agentic workflows can span several invocations (e.g., across a retry loop), so a single-step predictor cannot distinguish cache that will be reused later from useless cache. Multi-step prediction can prevent this myopia
without
assuming a static workflow.
For the cache manager
, we likewise propose two designs: (i)
Hierarchical eviction.
Guided by the observation that the
private cache of a terminated workflow has negligible reuse potential regardless of any prediction, we reclaim such
retired
cache first and then rank the
remaining active cache by a lookahead reuse score
from the predictor, yielding
stable
gains in the common case
and
graceful
degradation under poor predictions. (ii)
Conservative prefetching
, which carefully
trades off
the cost and benefit of prefetching and
consumes
only
otherwise-idle GPU space and PCIe bandwidth, so that
it does not backfire even under poor predictions.
Together, these designs form a
P
rediction-
B
ased
KV
-Cache management framework, which we call PBKV. We evaluate PBKV on realistic dynamic workflows, where it reduces the average workflow latency by up to
1.85
×
1.85\times
and improves the KV-Cache hit rate by up to
2.55
×
2.55\times
over LRU. On static workflows, PBKV outperforms KVFlow on these metrics by up to
1.26
×
1.26\times
and
1.39
×
1.39\times
, respectively.
Furthermore, PBKV’s predictor is
pluggable
; to ensure
robustness
across predictors, we prove that the performance is
Lipschitz-continuous
in prediction error, establishing
graceful degradation
.
Contributions.
In summary, we make the following contributions:
•
We formalize KV-Cache management in multi-agent serving as a problem of
predicting
future access patterns, and provide design guidelines for predictors in this setting.
•
We propose PBKV, guided by two design principles, i.e.,
hierarchical eviction
and
conservative prefetching
, that together identify cache with low reuse value for reclamation while preserving high-value cache. We further provide a
Lipschitz guarantee
that PBKV’s performance degrades
gracefully
even under prediction error.
•
We implement and evaluate PBKV across diverse workloads and LLMs. PBKV consistently outperforms LRU and the SOTA baseline in both cache hit rate and end-to-end performance.
2
Preliminaries
LLM-based Multi-Agent Serving.
A multi-agent application can be abstracted as a directed graph
G
=
(
V
,
E
)
G=(V,E)
, where each node in
V
V
corresponds to an agent and each edge in
E
E
denotes an admissible transition between agents. Since
G
G
enumerates
every possible
transition pattern, we refer to it as the
global call graph
. Figure
3
shows a representative example for a code-generation task. Notably,
G
G
can contain loops, capturing retry loops common in realistic agentic workflows.
A
workflow
is a single execution instance on
G
G
, consisting of an ordered sequence of agent invocations
a
1
,
a
2
,
…
a_{1},a_{2},\ldots
, where each
a
i
∈
V
a_{i}\in V
and each consecutive pair
(
a
i
,
a
i
+
1
)
∈
E
(a_{i},a_{i+1})\in E
.
Each
agent invocation
is an LLM request with a specific prompt, and thus benefits from KV-Cache reuse to reduce latency.
Agents typically share a large amount of KV-Cache, which we classify into two categories: (i)
global cache
, shared across agent instances from
different
workflows (e.g., the system prompt, tool/agent descriptions, and knowledge documents); and (ii)
private cache
, produced by upstream agents of a particular workflow and reusable only by downstream agents of the
same
workflow. Cross-workflow reuse of private cache is generically infeasible, because even under identical user prompts, the stochastic decoding of LLMs makes the workflows diverge within a few tokens.
Radix Tree.
PBKV is built on
SGLang
[
5
]
, which organizes prefix-shared cache as a
Radix Tree
, with each node holding a contiguous token segment reusable by all requests sharing that prefix.
HiCache
[
18
]
extends the cache into a two-tier hierarchy where cache evicted from GPU is retained in host memory and swapped back on a hit, avoiding full re-prefill at the cost of a PCIe transfer.
3
System Overview
Figure 1
:
A call graph for the code-generation task. The Tester conditionally triggers a retry path through Analyzer and Coder, i.e., a retry loop.
Figure 2
:
System overview of PBKV.
For each active workflow
w
w
, the predictor produces a
K
K
-step forecast over upcoming agent invocations. The forecast drives a shared scoring function
S
​
c
​
o
​
r
​
e
​
(
c
)
Score(c)
, which feeds both a hierarchical eviction policy and a conservative prefetching policy on the two-tier KV-Cache storage.
The underlying design principle of PBKV is: predicting upcoming agent invocations to evaluate the
reuse value
of existing KV-Cache, which then drives both KV-Cache eviction and prefetching. As shown in Figure
2
, PBKV consists of three components: (i) a
predictor
that produces a multi-step forecast for each active workflow, (ii) a set of
KV-Cache management policies
that translate the forecasts into eviction and prefetching decisions, and (iii) a
two-tier KV-Cache storage
organized as a Radix Tree on GPU memory and HiCache on host memory, on which the policies operate.
The predictor serves as the foundation of PBKV.
First
, it fuses two complementary signals: (i)
graph-level
agent transition patterns
shared
across requests, encoded in the global call graph
G
G
;
and (ii)
workflow-level
specifics
of the current request, reused from the LLM prefill embedding
x
x
.
Second
, it emits
K
K
probability distributions over upcoming agent invocations, rather than only the next one, preventing
myopic eviction
. For instance, in Figure
3
, when the current agent is Analyzer, a single-step predictor would reveal only the next Coder invocation and miss the Tester re-invocation two steps later, risking a wrongful eviction of the Tester’s cache and a costly re-prefill.
The KV-Cache management policies consist of an eviction policy and a prefetching policy. They share a common reuse scoring mechanism (i.e., multi-step lookahead and cross-workflow aggregation) and a common design philosophy (i.e., embedding deterministic guardrails within a probabilistic system). Specifically,
(i) hierarchical eviction
reclaims retired cache from terminated workflows first as it carries no reuse potential, and only after it is exhausted does score-driven eviction take over the active cache. Thus, performance degrades gracefully when the predictor is unreliable, while the upside is preserved when it is accurate.
(ii) Conservative prefetching
is motivated by the asymmetry that a prefetch always pays its cost while the benefit materializes only when the prediction is correct. PBKV therefore restricts prefetching to otherwise-idle GPU space and PCIe bandwidth, so that even under poor predictions, prefetching neither displaces valuable cache nor competes for on-path bandwidth.
In the following section, we elaborate on the design of each component and their coordination.
4
Design of PBKV
In this part, we design a predictor as the foundation of subsequent KV-Cache Management.
4.1
Workflow Prediction
Predictor Design.
Building on the principles above (i.e., multi-signal fusion and multi-step horizon), we instantiate the predictor with two desiderata: (i) leveraging structural priors in the global call graph
G
G
, and (ii) generalizing to unseen workflow prefixes at runtime to accommodate the dynamic nature of agentic workflows. We adopt
GraphSAGE
[
19
]
as the backbone, which satisfies both: (i) it operates directly on the
graph
through neighborhood sampling and aggregation, preserving the structural priors, and (ii) it is
inductive
, performing forward inference on unseen prefixes.
Figure 3
:
Architecture of the predictor.
It fuses a topology-aware agent embedding from GraphSAGE (
h
c
​
u
​
r
h_{cur}
), an attention-based workflow prefix summary (
h
p
​
a
​
t
​
h
h_{path}
), and a semantic signal reused from prefill (
h
t
​
x
​
t
h_{txt}
), then jointly predicts the next
K
K
agent probability distributions via an MLP.
As shown in Figure
3
,
the predictor fuses three complementary streams.
(i) Topology-aware agent embedding
𝐡
cur
\mathbf{h}_{\mathrm{cur}}
:
each agent’s learnable embedding is refined by two GraphSAGE layers over a transition matrix estimated from offline traces, so that the resulting
𝐇
(
2
)
\mathbf{H}^{(2)}
encodes both the agent’s identity and its neighborhood in
G
G
.
(ii) Attention-based history aggregation
𝐡
path
\mathbf{h}_{\mathrm{path}}
: since two workflows at the same current agent may have arrived through very different prefixes, we summarize prior agent representations via scaled dot-product attention with
𝐡
cur
\mathbf{h}_{\mathrm{cur}}
as the query, upweighting the most informative prefix agents over naive mean pooling.
(iii) Semantic signal from prefill
𝐡
txt
\mathbf{h}_{\mathrm{txt}}
:
to distinguish requests with the same prefix but diverging intent, we project the post-norm hidden state of the last prefill token, obtaining the signal essentially for free.
The three streams are concatenated and passed through a two-layer MLP that jointly emits logits over agents for each of the next
K
K
steps in a single forward pass, avoiding autoregressive error accumulation while keeping per-invocation latency to that of a single inference.
Full architecture is detailed in Appendix
B
.
Training and Performance.
The predictor is trained on offline invocation traces with cross-entropy loss, pairing each prefix and its prefill embedding with the next
K
K
agents as labels (padding positions after
⟨
END
⟩
\langle\mathrm{END}\rangle
are masked). The resulting predictor has roughly 350K parameters and processes a batch of 1,024 requests in 1.56 ms, rendering its runtime overhead negligible. On the HoVer
[
20
]
dataset with the LangChain
[
1
]
framework, training on 1
K
K
traces achieves an accuracy of 0.94 at 1-step and 0.77 at 3-step (500-trace test set). Scaling curves and comparisons against alternative predictors are provided in Appendix
C
, with full hyperparameters in the supplementary code.
4.2
Lookahead KV-Cache Eviction
Building on the multi-step predictor, we design a
lookahead
KV-Cache eviction policy.
4.2.1
Base: Lifecycle-Aware KV-Cache Eviction
Our observation and design.
Once a workflow terminates, its residual private cache (which we call
retired cache
) has negligible reuse potential and should be reclaimed first.
Under LRU, such cache can only age out passively, and LRU may evict still-valuable cache of other workflows during this aging window.
Additionally, retired cache is not all equivalent, we further rank them by the number of workflows that have accessed them. Thus, the popular shared prefix can be preserved longer.
Implementation.
We tag each cache node with the workflows that have accessed it. The server continuously listens for and records workflow termination messages from clients. Any cache node whose associated workflows have
all
terminated is tagged as retired and prioritized for eviction. Despite its simplicity, this change alone improves the average hit rate by up to
1.66
×
1.66\times
in our experiments.
4.2.2
Lookahead Score-Driven KV-Cache Eviction
Retired cache is not always abundant. Under high load, once the retired cache is drained, lifecycle-aware eviction degenerates back to LRU.
We notice that the reuse likelihood also
varies
across the active cache. For example, (i) among the
global cache
, descriptions of popular agents are reused more frequently than those of rarely used ones; and (ii) among the
private cache
, retention priority should scale with the predicted probability that the owning agent is invoked in the future.
We therefore extend eviction from a binary lifecycle label to a continuous score that reflects predicted reuse value.
Cross-Workflow Value Aggregation.
KV-Cache is shared across workflows, thus its reuse value should be aggregated
globally
.
Therefore, the score of a cache node should grow with
(i)
the number of workflows likely to reuse it, and
(ii)
each workflow’s reuse probability.
We further annotate each cache node
c
c
with a per-workflow access indicator vector
A
w
​
(
c
)
∈
{
0
,
1
}
|
V
|
A_{w}(c)\in\{0,1\}^{|V|}
.
For example, if
c
c
has been accessed by Agents 1 and 3 from workflow
w
w
, then
A
w
​
(
c
)
=
[
1
,
0
,
1
,
…
]
A_{w}(c)=[1,0,1,\dots]
.
For each workflow
w
w
, the predictor emits a next-step distribution, which we decompose into an agent-access probability vector
P
w
P_{w}
and a termination probability
p
w
,
⟨
END
⟩
p_{w,\langle\text{END}\rangle}
. The single-step reuse value of
c
c
is then defined as
Value
⁡
(
c
)
=
∑
w
∈
𝒲
act
​
(
c
)
A
w
​
(
c
)
⋅
P
w
\mathrm{Value}(c)\;=\;\sum_{w\,\in\,\mathcal{W}^{\text{act}}(c)}A_{w}(c)\cdot P_{w}
(1)
where
𝒲
act
​
(
c
)
\mathcal{W}^{\text{act}}(c)
denotes the set of active workflows associated with node
c
c
.
Intuitively,
Value
⁡
(
c
)
\mathrm{Value}(c)
aggregates
the probability that each workflow’s next invocation will touch node
c
c
.
Notably, this cross-workflow aggregation
naturally
protects the global cache and popular-prefix cache.
Figure 4
:
Computing the cross-workflow reuse score.
For each active workflow
w
w
accessing cache node
c
c
, the
K
K
-step (
K
K
=3 here) predictor outputs per-step access probabilities, which are weighted by the survival probability
s
(
k
)
s^{(k)}
and confidence factor
γ
k
−
1
\gamma^{k-1}
and summed across
m
m
workflows as
S
​
c
​
o
​
r
​
e
​
(
c
)
Score(c)
.
From One-Step to
K
K
-Step Lookahead.
As described above, a single-step view remains myopic, so we extend the score to a
K
K
-step horizon by leveraging the predictor’s multi-step outputs.
Two practical effects must be accounted for: (i) predictions further into the future are objectively less reliable, regardless of the predictor’s stated confidence; and (ii) steps following a predicted termination are meaningless and would pollute the score if left in.
To address them, we introduce a confidence decay factor
γ
<
1
\gamma<1
and a
cumulative survival probability
s
w
(
k
)
=
∏
j
=
1
k
−
1
(
1
−
p
w
,
⟨
END
⟩
(
j
)
)
,
s_{w}^{(k)}\;=\;\prod_{j=1}^{k-1}\bigl(1-p_{w,\langle\text{END}\rangle}^{(j)}\bigr),
i.e., the probability that workflow
w
w
remains active at step
k
k
.
Figure
4
illustrates the computation, which we formalize as:
Score
⁡
(
c
)
=
∑
k
=
1
K
γ
k
−
1
​
∑
w
∈
𝒲
act
​
(
c
)
s
w
(
k
)
⋅
A
w
​
(
c
)
⋅
P
w
(
k
)
\mathrm{Score}(c)\;=\;\sum_{k=1}^{K}\gamma^{k-1}\sum_{w\,\in\,\mathcal{W}^{\text{act}}(c)}s_{w}^{(k)}\cdot A_{w}(c)\cdot P_{w}^{(k)}
(2)
Implementation.
On every workflow state change (i.e., new agent invocation or termination), the predictor refreshes its forecast and updates the scores of the affected cache nodes. On eviction, nodes are sorted in ascending order of
Score
⁡
(
c
)
\mathrm{Score}(c)
and evicted until the requested space is freed.
4.2.3
Hierarchical Eviction: Unifying the Two Policies
The two policies can be naturally combined because retired cache nodes receive a score of
0
0
under Equation
2
(as they satisfy
𝒲
act
​
(
c
)
=
∅
\mathcal{W}^{\text{act}}(c)=\emptyset
).
That said, the “no value” judgment of retired cache is
deterministic
, whereas the “zero score” of an active node is merely a
probabilistic
estimate bounded by both the horizon
K
K
and the predictor’s accuracy.
We therefore adopt a
hierarchical eviction
strategy, in which active cache is spared until all retired cache is drained.
The underlying design philosophy is to
embed deterministic guardrails within a probabilistic system
, so that performance degrades gracefully under unreliable predictions while preserving the upside under good predictions.
4.3
Conservative KV-Cache Prefetching
Building on the predictor, a complementary optimization is to proactively load likely-to-be-reused cache nodes into GPU memory before they are hit, leveraging SGLang’s HiCache infrastructure to hide transfer latency behind ongoing decode steps rather than exposing it on the request critical path.
Prefetching Principle.
At its core, prefetching trades
known-valuable
GPU cache for
speculatively valuable
host cache, with the
fixed costs
in scheduling and PCIe bandwidth.
Given the inevitable prediction errors in dynamic workflows, the asymmetry between deterministic cost and probabilistic benefit motivates a
conservative
principle that prefers risk avoidance over aggressive speculation.
Prefetching Design.
Concretely, we do
not
evict any active cache to make room for prefetched data, for three considerations: (i) as argued above, evicting known-valuable cache is inherently risky under dynamic workflows; (ii) under high concurrency, such evictions can disrupt the radix tree’s prefix structure; and (iii) if the evicted active cache is hit shortly after, the system pays an additional GPU-reload cost or, in the worst case, a full re-prefill.
Instead
, we restrict the prefetch region to the union of currently
free
space and
retired
cache (§4.2.1), whose total size we denote as
S
a
S_{a}
.
This design guarantees that prefetching perturbs existing GPU-resident cache only minimally, if at all.
Beyond GPU space, prefetching also consumes PCIe bandwidth and therefore
competes
with prefill requests. To avoid interference, PBKV activates prefetching only on pure-decode batches (>90% of all batches in our measurements).
Within such a batch, we bound the transferable volume as
S
b
​
w
=
B
​
a
​
n
​
d
​
w
​
i
​
d
​
t
​
h
⋅
S
​
t
​
e
​
p
​
D
​
u
​
r
​
a
​
t
​
i
​
o
​
n
S_{bw}=Bandwidth\cdot StepDuration
,
where the PCIe bandwidth and decode step duration are dynamically updated by their runtime averages.
The final budget is
S
=
min
⁡
{
S
a
,
S
b
​
w
}
S=\min\{S_{a},\ S_{bw}\}
, which typically hides prefetching cost behind a single decode step and uses only otherwise-idle bandwidth.
To rank candidate nodes in the host memory, we reuse the one-step reuse value
V
​
a
​
l
​
u
​
e
​
(
c
)
Value(c)
defined in Eq.
1
.
We deliberately restrict ranking to the
one-step
horizon because prefetching is naturally incremental: a node that will be reused two steps ahead can simply be fetched at the next step. In contrast, eviction must look ahead across
K
K
steps, since a mistaken eviction incurs a costly reload or even a full re-prefill. Selecting the optimal subset under budget
S
S
is formally a knapsack problem and hence
NP-hard
. Since prefetch decisions lie on the scheduler’s critical path, we use a lightweight greedy heuristic that loads candidate nodes in descending order of value until the budget is exhausted.
An aggressive variant that permits evicting active cache for prefetch space is evaluated in Appendix
E
.
5
Discussion
Positioning.
While our primary contribution is KV-cache management, we additionally provide design guidelines for predictors in this setting (Section
7
explains why existing predictors fall short) and instantiate one accordingly. PBKV deliberately keeps the predictor module
pluggable
, so that it can benefit from future predictors. We further prove in Appendix
G
that PBKV degrades
gracefully
even under poor predictions (i.e., the degradation is
Lipschitz-continuous
), that is:
Theorem 5.1
.
Let
E
^
B
\widehat{E}_{B}
and
E
B
⋆
E_{B}^{\star}
be PBKV’s eviction set and the cost-minimizing set under the ground truth, respectively, and
ϵ
n
γ
\epsilon_{n}^{\gamma}
the per-node prediction error. The eviction cost regret of PBKV satisfies
0
≤
ℛ
⁡
(
B
)
:=
ℒ
⁡
(
E
^
B
)
−
ℒ
⁡
(
E
B
⋆
)
≤
1
2
​
(
1
−
γ
)
​
∑
c
∈
E
^
B
​
△
​
E
B
⋆
ϵ
c
γ
,
0\;\leq\;\mathcal{R}(B)\;:=\;\mathcal{L}\!\bigl(\widehat{E}_{B}\bigr)-\mathcal{L}\!\bigl(E_{B}^{\star}\bigr)\;\leq\;\frac{1}{2(1-\gamma)}\!\!\sum_{c\,\in\,\widehat{E}_{B}\triangle E_{B}^{\star}}\!\epsilon_{c}^{\gamma},
where
E
^
B
​
△
​
E
B
⋆
\widehat{E}_{B}\triangle E_{B}^{\star}
denotes the symmetric difference between PBKV’s eviction set and the optimum. The bound
ℛ
⁡
(
B
)
→
0
\mathcal{R}(B)\to 0
when the prediction is perfect and grows linearly in the prediction error.
Complexity.
PBKV maintains the score of candidate nodes in a
heap
structure.
Inspecting the top candidate takes
O
⁡
(
1
)
O(1)
, while popping, insertion, and score updates take
O
⁡
(
log
⁡
n
)
O(\log n)
for
n
n
cache nodes, keeping the scheduler overhead negligible even under high concurrency (measured in Appendix
F
).
Limitations.
(i) The predictor needs to be trained on a
specific
workload.
(ii) Cache-reuse patterns across agents are not universal but rather depend on the
client’s specific
message-passing convention. The indicator
A
w
​
(
c
)
A_{w}(c)
in Eq.
1
captures a
basic form
, namely the set of agents that have directly accessed
c
c
in workflow
w
w
. It admits straightforward
customization
, e.g., when a framework specifies that agent
j
j
inherits cache accessed by agent
i
i
,
A
w
​
(
c
)
​
[
j
]
A_{w}(c)[j]
can be set to 1 whenever
A
w
​
(
c
)
​
[
i
]
=
1
A_{w}(c)[i]=1
.
6
Experimental Evaluation
In this section, we evaluate PBKV on realistic multi-agent workloads and ablate each component.
6.1
Experimental Settings
Testbed and Models.
Our experiments are conducted on a server with
8
×
8\times
NVIDIA A6000 (48 GB) GPUs interconnected via NVLink, 128 virtual CPU cores, 512 GB of memory, and 20 GB/s PCIe bandwidth. We use Qwen3-14B and Qwen3-32B (two-way tensor parallelism) as the base LLMs.
Baselines.
We compare PBKV against
(i) LRU
on SGLang+HiCache (
HICACHE_RATIO
=
1
1
, allocating equal capacity on GPU and host memory), the default policy of SGLang.
(ii) KVFlow
[
9
]
, the SOTA workflow-aware policy, whose eviction is
driven
by the ‘steps-to-execution’ distance on a static DAG. Since this distance is
undefined
under runtime-dependent
loops
, we construct a static workflow scenario for fair comparison.
To isolate the contribution of each component, we further evaluate two ablation variants of PBKV:
(i) PBKV-LAE
, which enables only Lifecycle-Aware Eviction; and
(ii) PBKV-HE
, which adds Hierarchical Eviction on top of PBKV-LAE but disables prefetching.
Workloads.
We evaluate PBKV on three representative multi-agent workloads, each pairing a public benchmark with a widely-adopted agent framework to reflect
real-world
deployment:
(i) fact verification
, using the HoVer
[
20
]
dataset with the LangChain
[
1
]
agent framework;
(ii) code generation
, using SWE-bench
[
21
]
with Microsoft AutoGen
[
2
]
;
and
(iii) document analysis
, using FinanceBench
[
22
]
with CrewAI
[
23
]
, which constitutes a
static
workflow for direct comparison against KVFlow.
Following prior work
[
9
,
24
]
, we set the number of concurrent workflows to induce memory pressure, thereby effectively evaluating KV-Cache management policies.
Metrics.
We evaluate each policy along three
complementary
dimensions:
(i) End-to-end workflow latency
, measured from workflow submission to final completion;
(ii) Per-agent TTFT
, defined as the mean time-to-first-token across every agent invocation along a workflow;
(iii) Average KV-Cache hit rate
(token-level) on GPU memory, which
directly
reflects the quality of cache management.
6.2
Main Results.
Table 1
:
Performance of policies across workloads and LLMs. The metrics are described above. As different workloads have different GPU memory footprints, we set the concurrency limit to
72
72
/
24
24
/
48
48
, respectively, and study its sensitivity in Section
6.3
. The
static
workload is designed for comparison with
KVFlow
, which assumes a predefined static call graph. (Full results with std see Appendix
A
)
Workload
Policy
Qwen3-32B
Qwen3-14B
Lat. (s)
↓
\downarrow
PA. TTFT (s)
↓
\downarrow
Hit Rate (%)
↑
\uparrow
Lat. (s)
↓
\downarrow
PA. TTFT (s)
↓
\downarrow
Hit Rate (%)
↑
\uparrow
HoVer
+ LangChain
(with iterative
refinement
loops
)
LRU
189.66
189.66
16.65
16.65
27.09
27.09
139.59
139.59
10.90
10.90
28.79
28.79
PBKV-LAE
146.67
146.67
11.83
11.83
44.91
44.91
119.13
119.13
9.57
9.57
41.18
41.18
PBKV-HE
108.86
108.86
8.95
8.95
66.01
66.01
80.62
80.62
6.53
6.53
64.15
64.15
Full PBKV
102.60
102.60
8.22
8.22
69.10
69.10
76.15
76.15
5.50
5.50
68.29
68.29
SWE-bench
+ AutoGen
(with retry
loops
)
LRU
271.90
271.90
5.04
5.04
46.34
46.34
214.74
214.74
4.18
4.18
48.53
48.53
PBKV-LAE
233.86
233.86
3.73
3.73
59.51
59.51
177.50
177.50
3.26
3.26
60.41
60.41
PBKV-HE
177.22
177.22
2.46
2.46
75.31
75.31
141.53
141.53
2.19
2.19
73.36
73.36
Full PBKV
160.18
160.18
2.27
2.27
79.94
79.94
118.61
118.61
2.05
2.05
77.07
77.07
FinanceBench
+ CrewAI
(
static
)
LRU
130.34
130.34
12.93
12.93
27.95
27.95
96.11
96.11
9.02
9.02
26.58
26.58
KVFlow
101.57
101.57
9.91
9.91
39.87
39.87
80.13
80.13
7.42
7.42
39.65
39.65
Full PBKV
80.53
80.53
8.00
8.00
53.44
53.44
65.01
65.01
6.06
6.06
55.07
55.07
Observations.
We take HoVer + LangChain workload as a representative case.
Under
K
K
=3 and
γ
\gamma
=0.7, Table
1
shows that PBKV reduces end-to-end latency and per-agent TTFT by up to
1.85
×
1.85\times
and
2.03
×
2.03\times
over LRU, respectively. This directly confirms that PBKV delivers substantial gains in both system efficiency and quality of service (i.e., QoS).
The KV-Cache hit rate exposes the source of these gains:
(i) LRU
achieves a hit rate below 30% on both models,
confirming that it fails to capture the workflow-level reuse.
(ii) PBKV-LAE
, which merely identifies and evicts
retired cache
first, already lifts the hit rate by up to
1.66
×
1.66\times
over LRU, showing that even simple
lifecycle-awareness
is highly effective.
(iii) PBKV-HE
additionally incorporates the workflow predictor and reuse scoring, pushing the hit rate to 66.01%, because it assesses the reuse value of active cache through
cross-workflow aggregation
and
multi-step lookahead
. As a result, eviction decisions remain informed even after the retired cache is exhausted, and the policy never degenerates back to LRU.
(iv) Full PBKV
introduces
speculative prefetching
on top of PBKV-HE and attains a hit rate of 69.10% (
2.55
×
2.55\times
over LRU).
We further note that the hit rates are higher near the start and the end of each run, when the pressure is low.
Restricted to the steady-state interior, LRU’s hit rate drops to
∼
\sim
10% while full PBKV’s sustains
∼
\sim
50%.
Their behavior is detailed in Section
6.4
.
Results of other tests exhibit similar trends.
Ablation Study.
Comparing the three PBKV variants, the contributions of Lifecycle-Aware Eviction, Hierarchical Eviction, and speculative prefetching are
incremental
. The step from PBKV-LAE to PBKV-HE is pronounced, whereas the step from PBKV-HE to full PBKV is
modest
.
This modest gap stems from two factors: (i) the prediction errors of the multi-step predictor on realistic dynamic workflows, and (ii) our deliberately
conservative
prefetching design (Section
4.3
), which refuses to gamble known-valuable active cache for speculative gains.
Appendix
E
evaluates an aggressive alternative that evicts active cache to free prefetch space, confirming that our conservative variant delivers stable benefits while avoiding the backfire of aggressive prefetching under poor predictions.
Performance on Static Workflow.
Table
1
also reports the results under a static workflow (FinanceBench + CrewAI). KVFlow infers the steps-to-execution from the predefined call graph and prioritizes the cache accordingly, yielding a moderate improvement over LRU. PBKV achieves a
further
gain, which we attribute to two design choices.
(i) Lifecycle-aware eviction.
Like LRU, KVFlow can also mistakenly evict active cache that will still be reused, whereas PBKV’s lifecycle-aware eviction prevents this misjudgment.
(ii) Cross-workflow reuse aggregation.
KVFlow prioritizes each cache node by the
minimum
steps-to-execution across all related workflows, which captures
when
it will be reused but not how
popular
it is. PBKV instead
aggregates
the predicted reuse contribution from every active workflow accessing the node, so the score of popular cache grows naturally.
Remark on Static Workflows.
Given the deterministic agent invocation order in
static
workflows, PBKV could be further tuned by safely relaxing several mechanisms (e.g., adopting more aggressive prefetching and disabling the multi-step confidence decay
γ
\gamma
). However, we retain these mechanisms in our evaluation for compatibility and consistency across both dynamic and static workloads.
(a)
Average cache hit rate vs. concurrency. Excessive concurrency causes LRU to run out of memory (OOM).
(b)
Prediction accuracy of different backbones (lines) and the corresponding hit-rate ratio of PBKV over LRU (bars).
(c)
Average cache hit rate vs. lookahead horizon
K
K
(i.e., prediction step).
Figure 5
:
Sensitivity analysis of PBKV and its variants on HoVer + LangChain with Qwen3-32B.
6.3
Sensitivity Analysis
In this section, we vary several configurations to characterize their impact on PBKV and its variants. All experiments below are conducted on the HoVer + LangChain workload with Qwen3-32B.
Concurrency.
It directly governs GPU memory pressure. As shown in Figure
5(a)
, all hit rates degrade as concurrency rises, yet PBKV consistently and greatly outperforms LRU.
Below 60 workflows, evictions are too rare to differentiate any policy.
At the other extreme, LRU exhausts memory and crashes in 3/10 trials at concurrency 84 and 10/10 at 96.
We therefore adopt a concurrency of 72 for HoVer + LangChain in the main experiments to evaluate all policies under reasonable pressure.
Predictor Backbone.
PBKV treats the predictor as a pluggable component. We replace our GraphSAGE backbone with R-GCN and a third-order Markov model (Markov-N3), each trained on the same 1
K
K
traces. As shown in Figure
5(b)
, the variants exhibit lower prediction accuracy, which translates monotonically into lower cache hit rates.
Even so, the weakest backbone still strictly outperforms the prediction-free PBKV-LAE, confirming that PBKV is robust to predictor quality and that a reasonable predictor typically delivers additional benefits on top of lifecycle awareness.
Lookahead Horizon.
As shown in Figure
5(c)
, the best hit rate occurs at
K
K
=3: a smaller horizon induces myopic eviction, whereas a larger one dilutes the score with inaccurate long-range predictions. The gap between full PBKV and PBKV-HE stays nearly constant across
K
K
by design, since prefetching ranks candidates by the one-step value alone (Section
4.3
) and is decoupled from
K
K
.
Additional Studies.
Due to space constraints, we defer the following studies to the appendix:
(i) the accuracy of more predictor variants and how training scale affects it (Appendix
C
);
(ii) sensitivity to the confidence decay coefficient
γ
\gamma
(Appendix
D
);
(iii) aggressive vs. conservative prefetching across varying prediction accuracies (Appendix
E
);
(iv) scheduling overhead (Appendix
F
);
and (v) a theoretical analysis of PBKV’s graceful degradation under poor prediction (Appendix
G
).
6.4
Why PBKV Works: Analysis of Cache Behavior.
To understand the sources of PBKV’s gains, we trace the KV-Cache hit rate of each policy throughout a full run in Figure
6
. Key events (marked by dashed vertical lines) divide the run into several phases:
(i) Warm-up (0-30 s).
With ample GPU memory, all policies rapidly exceed 80% without eviction,
confirming our motivation
in Section
1
that multi-agent workflows expose abundant reuse potential.
(ii) Onset of memory pressure (30-55 s).
Around 30 s, GPU memory saturates and forces evictions, causing LRU’s hit rate (red) to drop sharply.
PBKV-LAE (orange) follows the same trajectory, as no workflow has terminated to release retired cache.
In contrast, PBKV-HE (blue) and full PBKV (green) decline only
gradually
, since their scoring identifies low-value
active
cache for eviction.
(iii) Retired-cache window (55-80 s).
From 55 s onward, the first-completed workflows release retired cache.
PBKV-LAE immediately capitalizes on this signal and recovers visibly.
PBKV-HE and PBKV enjoy the same benefit through their hierarchical eviction.
Thereafter, LRU stays around a 10% hit rate and only recovers near the end when the draining request pool relieves pressure.
(iv) Retired-cache drained (80-115 s).
Once the retired cache is drained, PBKV-LAE reverts to LRU.
Thereafter, its hit rate recovers only
briefly
when batches of workflows release retired cache concurrently.
PBKV-HE and PBKV also decline but remain well above LRU, thanks to their scoring.
(v) Steady-state serving (115-245 s).
PBKV and PBKV-HE greatly outperform others, showing the lookahead score remains effective under prolonged pressure.
PBKV further improves PBKV-HE by a
modest but consistent
margin, reflecting the bounded but stable benefit of
conservative
prefetching.
(vi) Tail phase (after 245 s).
As the request pool drains, eviction pressure subsides and the hit rate climbs back to roughly 90% by completion (around 285 s).
Full PBKV enters and exits this phase
first
,
achieving the lowest average job completion time and the highest throughput among all policies.
Figure 6
:
KV-Cache hit rate of each policy over time on the HoVer + LangChain workload, served by Qwen3-14B under a concurrency limit of 72. Dashed vertical lines mark key events.
Summary.
This phase-by-phase analysis reveals the
complementary
roles of PBKV’s three mechanisms. Lifecycle-aware eviction provides a deterministic improvement whenever retired cache is available; hierarchical eviction sustains improvements under prolonged pressure via multi-step lookahead and cross-workflow aggregation; and speculative prefetching contributes a bounded but stable improvement on top. Together, they enable PBKV to maintain a substantial and sustained lead over LRU, directly translating into lower latency (as shown in Table
1
) and higher throughput.
7
Related Work
KV-Cache Management for Multi-Agent Serving.
Modern inference engines (e.g., vLLM
[
4
]
and SGLang
[
5
]
) manage KV-Cache via paged
attention and radix-tree prefix caching under a default LRU policy. Orthogonal efforts such as HiCache
[
18
]
and LMCache
[
25
]
extend this with hierarchical GPU-CPU-disk offloading, while KVCOMM
[
26
]
and CacheBlend
[
27
]
target non-prefix reuse. All of them are oblivious to workflows.
Some recent systems try to close this gap, Continuum
[
28
]
targets ReAct-style single-agent tool calling, pinning KV entries with a dynamic TTL learned from per-tool duration statistics, whereas KVFlow
[
9
]
assumes a predefined Agent Step Graph and uses ‘steps-to-execution’ scores for eviction and prefetching.
They are not well-suited to realistic multi-agent workflows, which are typically dynamic and involve runtime-dependent loops. PBKV fills this gap by driving
workflow-level
KV-Cache management with multi-step
prediction
for each workflow.
Agentic Workflow Prediction.
A growing body of work predicts the structure of agentic workflows.
Parrot
[
29
]
introduces semantic variables to recover inter-request dependencies,
Ayo
[
30
]
compiles LLM applications into primitive-level dataflow graphs for end-to-end optimization,
and Autellix
[
10
]
elevates programs to first-class scheduling units.
Such abstractions assume a
(near-)static
DAG or dataflow graph and struggle to faithfully express the conditional loops common in practical multi-agent workflows.
Another thread of work instead reasons about workflow structure online through speculative execution; e.g.,
PASTE
[
11
]
exploits recurring tool-call patterns and predictable data dependencies to speculatively invoke tools,
and Speculative Actions
[
31
]
generalizes speculation to agent actions.
These methods accommodate dynamic workflows but predict only the next step, which can lead to
myopic eviction
when driving cache eviction; and autoregressive rollout also accumulates errors. Therefore, we develop a multi-step predictor customized for KV-Cache management.
8
Conclusion
We present PBKV for realistic dynamic multi-agent workflows.
First, PBKV proposes guidelines for a dedicated
predictor
, i.e., (i) fusing complementary signals from the global call graph and per-request prefill embeddings, and (ii) forecasting over a
multi-step
horizon to avoid myopic decisions.
Second, PBKV adopts a
conservative
policy, i.e., (i) hierarchical eviction that combines lifecycle-aware reclamation with lookahead, cross-workflow-aggregated scoring, and (ii) conservative prefetching that consumes only otherwise-idle GPU space and PCIe bandwidth.
Theoretically
, we prove that PBKV degrades gracefully under prediction error.
Empirically
, PBKV significantly outperforms LRU across models and workloads, and also outperforms the SOTA method on static workflows.
References
[1]
H. Chase
(2022)
LangChain
.
Note:
https://github.com/langchain-ai/langchain
Software
Cited by:
Appendix C
,
§G.1
,
§1
,
§1
,
§4.1
,
§6.1
.
[2]
Q. Wu, G. Bansal, J. Zhang, Y. Wu, B. Li, E. Zhu, L. Jiang, X. Zhang, S. Zhang, J. Liu, A. H. Awadallah, R. W. White, D. Burger, and C. Wang
(2024)
AutoGen: enabling next-gen LLM applications via multi-agent conversation
.
In
ICLR 2024 Workshop on Large Language Model (LLM) Agents
,
External Links:
Link
Cited by:
§G.1
,
§1
,
§6.1
.
[3]
S. Hong, M. Zhuge, J. Chen, X. Zheng, Y. Cheng, J. Wang, C. Zhang, Z. Wang, S. K. S. Yau, Z. Lin, L. Zhou, C. Ran, L. Xiao, C. Wu, and J. Schmidhuber
(2024)
MetaGPT: meta programming for a multi-agent collaborative framework
.
In
The Twelfth International Conference on Learning Representations
,
External Links:
Link
Cited by:
§G.1
,
§1
.
[4]
W. Kwon, Z. Li, S. Zhuang, Y. Sheng, L. Zheng, C. H. Yu, J. Gonzalez, H. Zhang, and I. Stoica
(2023)
Efficient memory management for large language model serving with pagedattention
.
In
Proceedings of the 29th symposium on operating systems principles
,
pp. 611–626
.
Cited by:
§1
,
§7
.
[5]
L. Zheng, L. Yin, Z. Xie, C. Sun, J. Huang, C. H. Yu, S. Cao, C. Kozyrakis, I. Stoica, J. E. Gonzalez,
et al.
(2024)
Sglang: efficient execution of structured language model programs
.
Advances in neural information processing systems
37
,
pp. 62557–62583
.
Cited by:
§G.1
,
§1
,
§2
,
§7
.
[6]
Y. Wu, S. Chen, Y. Zhong, R. Huang, Y. Tan, W. Zhang, L. Zhang, S. Zhou, Y. Liu, S. Zhou, M. Zhang, X. Jin, and P. Huang
(2026)
DualPath: breaking the storage bandwidth bottleneck in agentic llm inference
.
External Links:
2602.21548
,
Link
Cited by:
§1
.
[7]
LangChain AI
(2024)
LangGraph
.
Note:
https://github.com/langchain-ai/langgraph
Software
Cited by:
§1
.
[8]
L. A. Belady
(1966)
A study of replacement algorithms for a virtual-storage computer
.
IBM Systems journal
5
(
2
),
pp. 78–101
.
Cited by:
§G.1
,
§G.1
,
§G.2
,
§G.4
,
§G.4
,
§1
.
[9]
Z. Pan, A. Patel, Y. Shen, Z. Hu, Y. Guan, W. Li, L. Qin, Y. Wang, and Y. Ding
(2025)
KVFlow: efficient prefix caching for accelerating LLM-based multi-agent workflows
.
In
The Thirty-ninth Annual Conference on Neural Information Processing Systems
,
External Links:
Link
Cited by:
§1
,
§6.1
,
§6.1
,
§7
.
[10]
M. Luo, X. Shi, C. Cai, T. Zhang, J. Wong, Y. Wang, C. Wang, Y. Huang, Z. Chen, J. E. Gonzalez,
et al.
(2025)
Autellix: an efficient serving engine for llm agents as general programs
.
arXiv preprint arXiv:2502.13965
.
Cited by:
§1
,
§7
.
[11]
Y. Sui, H. Zhao, R. Ma, Z. He, H. Wang, J. Li, and Y. Yang
(2026)
Act while thinking: accelerating llm agents via pattern-aware speculative tool execution
.
arXiv preprint arXiv:2603.18897
.
Cited by:
§1
,
§7
.
[12]
M. Wagenländer, O. White, B. Jarrett, P. Silvestre, Y. Tao, G. Li, H. Zhu, L. Vilanova, and P. Pietzuch
(2026)
Scepsy: serving agentic workflows using aggregate llm pipelines
.
External Links:
2604.15186
,
Link
Cited by:
§1
.
[13]
J. Zhang, P. K. Choubey, K. Huang, C. Xiong, and C. Wu
(2026)
Agentic uncertainty quantification
.
arXiv preprint arXiv:2601.15703
.
Cited by:
§1
.
[14]
J. Zhang, C. Xiong, and C. Wu
(2026)
Agentic confidence calibration
.
arXiv preprint arXiv:2601.15778
.
Cited by:
§1
.
[15]
S. Barke, A. Goyal, A. Khare, A. Singh, S. Nath, and C. Bansal
(2026)
AgentRx: diagnosing ai agent failures from execution trajectories
.
arXiv preprint arXiv:2602.02475
.
Cited by:
§1
.
[16]
D. Moshkovich, H. Mulian, S. Zeltyn, N. Eder, I. Skarbovsky, and R. Abitbol
(2025)
Beyond black-box benchmarking: observability, analytics, and optimization of agentic systems
.
arXiv preprint arXiv:2503.06745
.
Cited by:
§1
.
[17]
D. Moshkovich and S. Zeltyn
(2025)
Taming uncertainty via automation: observing, analyzing, and optimizing agentic ai systems
.
In
2025 40th IEEE/ACM International Conference on Automated Software Engineering (ASE)
,
pp. 3840–3844
.
Cited by:
§1
.
[18]
LMSYS Org and SGLang Team
(2025)
SGLang HiCache: fast hierarchical KV caching with your favorite storage backends
.
Note:
https://lmsys.org/blog/2025-09-10-sglang-hicache/
Cited by:
§2
,
§7
.
[19]
W. Hamilton, Z. Ying, and J. Leskovec
(2017)
Inductive representation learning on large graphs
.
Advances in neural information processing systems
30
.
Cited by:
Appendix B
,
§4.1
.
[20]
Y. Jiang, S. Bordia, Z. Zhong, C. Dognin, M. Singh, and M. Bansal
(2020)
HoVer: a dataset for many-hop fact extraction and claim verification
.
In
Findings of the Association for Computational Linguistics: EMNLP 2020
,
pp. 3441–3460
.
Cited by:
Appendix C
,
§4.1
,
§6.1
.
[21]
C. E. Jimenez, J. Yang, A. Wettig, S. Yao, K. Pei, O. Press, and K. R. Narasimhan
(2024)
SWE-bench: can language models resolve real-world github issues?
.
In
The Twelfth International Conference on Learning Representations
,
External Links:
Link
Cited by:
§6.1
.
[22]
P. Islam, A. Kannappan, D. Kiela, R. Qian, N. Scherrer, and B. Vidgen
(2023)
Financebench: a new benchmark for financial question answering
.
arXiv preprint arXiv:2311.11944
.
Cited by:
§6.1
.
[23]
CrewAI
(2023)
CrewAI
.
Note:
https://github.com/crewAIInc/crewAI
Software
Cited by:
§6.1
.
[24]
Q. Chen, Z. Ye, T. Tang, P. Sun, B. Tian, G. Wang, S. Li, Y. Wen, Z. Han, and T. Zhang
(2026)
CONCUR: high-throughput agentic batch inference of llm via congestion-based concurrency control
.
arXiv preprint arXiv:2601.22705
.
Cited by:
§6.1
.
[25]
Y. Liu, Y. Cheng, J. Yao, Y. An, X. Chen, S. Feng, Y. Huang, S. Shen, R. Zhang, K. Du,
et al.
(2025)
Lmcache: an efficient kv cache layer for enterprise-scale llm inference
.
arXiv preprint arXiv:2510.09665
.
Cited by:
§7
.
[26]
H. Ye, Z. Gao, M. Ma, Q. Wang, Y. Fu, M. Chung, Y. Lin, Z. Liu, J. Zhang, D. Zhuo, and Y. Chen
(2025)
KVCOMM: online cross-context KV-cache communication for efficient LLM-based multi-agent systems
.
In
The Thirty-ninth Annual Conference on Neural Information Processing Systems
,
External Links:
Link
Cited by:
§7
.
[27]
J. Yao, H. Li, Y. Liu, S. Ray, Y. Cheng, Q. Zhang, K. Du, S. Lu, and J. Jiang
(2025)
Cacheblend: fast large language model serving for rag with cached knowledge fusion
.
In
Proceedings of the twentieth European conference on computer systems
,
pp. 94–109
.
Cited by:
§7
.
[28]
H. Li, Q. Mang, R. He, Q. Zhang, H. Mao, X. Chen, H. Zhou, A. Cheung, J. E. Gonzalez, and I. Stoica
(2026)
Continuum: efficient and robust multi-turn LLM agent scheduling with KV cache time-to-live
.
In
ICLR 2026 Workshop on Lifelong Agents: Learning, Aligning, Evolving
,
External Links:
Link
Cited by:
§7
.
[29]
C. Lin, Z. Han, C. Zhang, Y. Yang, F. Yang, C. Chen, and L. Qiu
(2024)
Parrot: efficient serving of
{
\{
llm-based
}
\}
applications with semantic variable
.
In
18th USENIX Symposium on Operating Systems Design and Implementation (OSDI 24)
,
pp. 929–945
.
Cited by:
§7
.
[30]
X. Tan, Y. Jiang, Y. Yang, and H. Xu
(2025)
Towards end-to-end optimization of llm-based applications with ayo
.
In
Proceedings of the 30th ACM International Conference on Architectural Support for Programming Languages and Operating Systems, Volume 2
,
External Links:
Link
,
Document
Cited by:
§7
.
[31]
N. Ye, A. Ahuja, G. Liargkovas, Y. Lu, K. Kaffes, and T. Peng
(2026)
Speculative actions: a lossless framework for faster AI agents
.
In
The Fourteenth International Conference on Learning Representations
,
External Links:
Link
Cited by:
§7
.
[32]
T. N. Kipf and M. Welling
(2017)
Semi-supervised classification with graph convolutional networks
.
In
International Conference on Learning Representations
,
External Links:
Link
Cited by:
Appendix B
.
[33]
A. Vaswani, N. Shazeer, N. Parmar, J. Uszkoreit, L. Jones, A. N. Gomez, Ł. Kaiser, and I. Polosukhin
(2017)
Attention is all you need
.
Advances in neural information processing systems
30
.
Cited by:
§C.2
.
[34]
S. Bai, J. Z. Kolter, and V. Koltun
(2018)
An empirical evaluation of generic convolutional and recurrent networks for sequence modeling
.
arXiv preprint arXiv:1803.01271
.
Cited by:
§C.2
.
[35]
M. Schlichtkrull, T. N. Kipf, P. Bloem, R. Van Den Berg, I. Titov, and M. Welling
(2018)
Modeling relational data with graph convolutional networks
.
In
European semantic web conference
,
pp. 593–607
.
Cited by:
§C.2
.
[36]
R. Shahout, eran malach, C. Liu, W. Jiang, M. Yu, and M. Mitzenmacher
(2025)
DON’t STOP ME NOW: EMBEDDING BASED SCHEDULING FOR LLMS
.
In
The Thirteenth International Conference on Learning Representations
,
External Links:
Link
Cited by:
§C.3
.
[37]
O. Skean, M. R. Arefin, D. Zhao, N. N. Patel, J. Naghiyev, Y. Lecun, and R. Shwartz-Ziv
(2025)
Layer by layer: uncovering hidden representations in language models
.
In
International Conference on Machine Learning
,
pp. 55854–55875
.
Cited by:
§C.3
.
[38]
T. Ulanovski, E. Blyachman, and M. Bechler-Speicher
(2026)
Improving llm predictions via inter-layer structural encoders
.
In
ICLR Workshop on Geometry-grounded Representation Learning and Generative Modeling
,
Cited by:
§C.3
.
[39]
T. Lykouris and S. Vassilvitskii
(2021)
Competitive caching with machine learned advice
.
Journal of the ACM (JACM)
68
(
4
),
pp. 1–25
.
Cited by:
§G.1
,
§G.1
,
§G.1
,
§G.4
.
[40]
D. Rohatgi
(2020)
Near-optimal bounds for online caching with machine learned advice
.
In
Proceedings of the Fourteenth Annual ACM-SIAM Symposium on Discrete Algorithms
,
pp. 1834–1845
.
Cited by:
§G.1
,
§G.1
,
§G.1
,
§G.4
.
[41]
M. Mitzenmacher and S. Vassilvitskii
(2022)
Algorithms with predictions
.
Communications of the ACM
65
(
7
),
pp. 33–35
.
Cited by:
§G.4
.
Appendix A
Main Results with Standard Deviations.
Table 2
:
Full results with standard deviations across multi-agent workloads. Each cell reports mean
±
\pm
standard deviation over multiple runs. The
static
workload (FinanceBench+CrewAI) is included for comparison with
KVFlow
, which assumes a predefined static call graph. Concurrency limits are 72 for HoVer+LangChain, 24 for SWE-bench+AutoGen, and 48 for FinanceBench+CrewAI.
Model
Workload
Policy
Latency (s)
↓
\downarrow
Per-Agent TTFT (s)
↓
\downarrow
Cache Hit Rate (%)
↑
\uparrow
Qwen3-32B
HoVer
+ LangChain
LRU
189.66
±
4.70
189.66\pm 4.70
16.65
±
0.78
16.65\pm 0.78
27.09
±
1.16
27.09\pm 1.16
PBKV-LAE
146.67
±
6.73
146.67\pm 6.73
11.83
±
0.74
11.83\pm 0.74
44.91
±
2.20
44.91\pm 2.20
PBKV-HE
108.86
±
6.93
108.86\pm 6.93
8.95
±
0.74
8.95\pm 0.74
66.01
±
2.79
66.01\pm 2.79
Full PBKV
102.60
±
7.28
102.60\pm 7.28
8.22
±
0.71
8.22\pm 0.71
69.10
±
2.23
69.10\pm 2.23
SWE-bench
+ AutoGen
LRU
271.90
±
9.14
271.90\pm 9.14
5.04
±
0.26
5.04\pm 0.26
46.34
±
2.01
46.34\pm 2.01
PBKV-LAE
233.86
±
12.70
233.86\pm 12.70
3.73
±
0.44
3.73\pm 0.44
59.51
±
2.92
59.51\pm 2.92
PBKV-HE
177.22
±
10.36
177.22\pm 10.36
2.46
±
0.37
2.46\pm 0.37
75.31
±
2.57
75.31\pm 2.57
Full PBKV
160.18
±
10.89
160.18\pm 10.89
2.27
±
0.35
2.27\pm 0.35
79.94
±
3.26
79.94\pm 3.26
FinanceBench
+ CrewAI
(
static
)
LRU
130.34
±
5.37
130.34\pm 5.37
12.93
±
0.51
12.93\pm 0.51
27.95
±
0.82
27.95\pm 0.82
KVFlow
101.57
±
5.27
101.57\pm 5.27
9.91
±
0.57
9.91\pm 0.57
39.87
±
1.43
39.87\pm 1.43
Full PBKV
80.53
±
5.06
80.53\pm 5.06
8.00
±
0.48
8.00\pm 0.48
53.44
±
2.07
53.44\pm 2.07
Qwen3-14B
HoVer
+ LangChain
LRU
139.59
±
3.13
139.59\pm 3.13
10.90
±
0.35
10.90\pm 0.35
28.79
±
1.04
28.79\pm 1.04
PBKV-LAE
119.13
±
6.04
119.13\pm 6.04
9.57
±
0.58
9.57\pm 0.58
41.18
±
3.17
41.18\pm 3.17
PBKV-HE
80.62
±
5.13
80.62\pm 5.13
6.53
±
0.34
6.53\pm 0.34
64.15
±
1.99
64.15\pm 1.99
Full PBKV
76.15
±
5.95
76.15\pm 5.95
5.50
±
0.42
5.50\pm 0.42
68.29
±
2.32
68.29\pm 2.32
SWE-bench
+ AutoGen
LRU
214.74
±
6.98
214.74\pm 6.98
4.18
±
0.28
4.18\pm 0.28
48.53
±
3.02
48.53\pm 3.02
PBKV-LAE
177.50
±
9.05
177.50\pm 9.05
3.26
±
0.51
3.26\pm 0.51
60.41
±
4.62
60.41\pm 4.62
PBKV-HE
141.53
±
7.57
141.53\pm 7.57
2.19
±
0.43
2.19\pm 0.43
73.36
±
3.95
73.36\pm 3.95
Full PBKV
118.61
±
8.06
118.61\pm 8.06
2.05
±
0.47
2.05\pm 0.47
77.07
±
3.71
77.07\pm 3.71
FinanceBench
+ CrewAI
(
static
)
LRU
96.11
±
4.88
96.11\pm 4.88
9.02
±
0.44
9.02\pm 0.44
26.58
±
0.86
26.58\pm 0.86
KVFlow
80.13
±
4.16
80.13\pm 4.16
7.42
±
0.41
7.42\pm 0.41
39.65
±
1.84
39.65\pm 1.84
Full PBKV
65.01
±
4.12
65.01\pm 4.12
6.06
±
0.40
6.06\pm 0.40
55.07
±
2.39
55.07\pm 2.39
In our main experiments, we evaluate LRU, KVFlow (only on the static workload due to its inherent limitation), and our PBKV along with its variants on two LLMs and three workloads. Each setting is repeated for 10 runs, with mean and standard deviation reported in Table
2
.
Appendix B
Predictor Details: Architecture and Training
This appendix complements Section
4.1
with the full design of the predictor, including the rationale behind the GraphSAGE backbone, the detailed architecture, and the training procedure.
Figure 7
:
Architecture of the predictor.
It fuses a topology-aware agent embedding from GraphSAGE (
h
c
​
u
​
r
h_{cur}
), an attention-based workflow prefix summary (
h
p
​
a
​
t
​
h
h_{path}
), and a semantic signal reused from prefill (
h
t
​
x
​
t
h_{txt}
), then jointly predicts the next
K
K
agent probability distributions via an MLP head.
Overview.
The predictor adopts
GraphSAGE
[
19
]
as its backbone, fuses
multiple complementary
signals, and jointly forecasts the next
few
invoked agents (i.e., Multi-Step Prediction).
Why GraphSAGE?
Our predictor design follows two desiderata.
First
, the predictor must serve
all
possible workflows across every admissible agent transition, so it is desirable to leverage the structural priors encoded in the global call graph
G
G
.
Second
, the dynamic nature of agentic workflows requires the predictor to generalize to unseen subgraphs encountered at runtime.
Guided by these desiderata, we adopt
GraphSAGE
as the backbone of predictor.
First
, GraphSAGE learns node representations directly on the graph through neighborhood sampling and aggregation, thereby preserving the structural priors encoded in agent transitions, which an MLP would otherwise discard.
Second
, GraphSAGE is an
inductive
framework, which performs forward inference on unseen workflow prefix without retraining on the entire graph. This property aligns naturally with the dynamic nature of agentic workflows, and is preferable to transductive alternatives (e.g., GCN
[
32
]
) that rely on a fixed training graph.
For completeness, we also implement and evaluate several baseline predictors (including MLPs, GCNs, and Markov models), detailed results are in Appendix
C
.
Architecture.
Figure
7
illustrates the architecture of predictor.
To forecast the future invocations of an active workflow, the predictor fuses three complementary streams as described below:
(i) Topology-aware agent representation.
We assign each agent
v
∈
V
v\in V
a learnable embedding
𝐞
v
∈
ℝ
d
\mathbf{e}_{v}\in\mathbb{R}^{d}
, stacked into
𝐇
(
0
)
∈
ℝ
|
V
|
×
d
\mathbf{H}^{(0)}\in\mathbb{R}^{|V|\times d}
.
A
∈
ℝ
|
V
|
×
|
V
|
A\in\mathbb{R}^{|V|\times|V|}
denotes the row-normalized forward
transition matrix
estimated from the offline traces. We then apply two GraphSAGE propagation layers:
𝐇
(
ℓ
)
=
ReLU
(
[
𝐇
(
ℓ
−
1
)
∥
A
𝐇
(
ℓ
−
1
)
]
(
𝐖
(
ℓ
)
)
⊤
)
,
𝐖
(
ℓ
)
∈
ℝ
d
×
2
​
d
,
ℓ
=
1
,
2
\mathbf{H}^{(\ell)}=\mathrm{ReLU}\!\left(\bigl[\,\mathbf{H}^{(\ell-1)}\,\|\,A\mathbf{H}^{(\ell-1)}\,\bigr](\mathbf{W}^{(\ell)})^{\top}\right),\quad\mathbf{W}^{(\ell)}\in\mathbb{R}^{d\times 2d},\quad\ell=1,2
(3)
where
∥
\|
denotes feature-wise concatenation. Thus, for each agent, the resulting
𝐇
(
2
)
\mathbf{H}^{(2)}
encodes both its own identity (through
𝐇
\mathbf{H}
) and the structural priors induced by its neighborhood in
G
G
(through
A
​
𝐇
A\mathbf{H}
).
(ii) Attention-based history aggregation.
While
𝐇
(
2
)
\mathbf{H}^{(2)}
equips each agent with a topology-aware representation, it does not yet capture the state of a
workflow
. In fact, two workflows residing at the same agent
v
t
v_{t}
may have arrived through very different prefixes. To leverage such prefix information, we summarize the prefix via scaled
dot-product attention
, using the current agent representation
𝐡
cur
=
𝐇
v
t
(
2
)
\mathbf{h}_{\mathrm{cur}}=\mathbf{H}^{(2)}_{v_{t}}
as the query and the prefix representations as both keys and values:
α
i
=
exp
⁡
(
(
𝐖
q
​
𝐡
cur
)
⊤
​
𝐇
v
i
(
2
)
/
d
)
∑
j
<
t
exp
⁡
(
(
𝐖
q
​
𝐡
cur
)
⊤
​
𝐇
v
j
(
2
)
/
d
)
,
𝐡
path
=
∑
i
<
t
α
i
​
𝐇
v
i
(
2
)
\alpha_{i}\;=\;\frac{\exp\!\bigl((\mathbf{W}_{q}\mathbf{h}_{\mathrm{cur}})^{\top}\mathbf{H}^{(2)}_{v_{i}}/\sqrt{d}\bigr)}{\sum_{j<t}\exp\!\bigl((\mathbf{W}_{q}\mathbf{h}_{\mathrm{cur}})^{\top}\mathbf{H}^{(2)}_{v_{j}}/\sqrt{d}\bigr)},\qquad\mathbf{h}_{\mathrm{path}}\;=\;\sum_{i<t}\alpha_{i}\,\mathbf{H}^{(2)}_{v_{i}}
(4)
Compared with naive mean pooling, attention allows the predictor to upweight those prefix agents that are most informative of the current state.
(iii) Semantic signal from prefill.
Graph topology and workflow history alone do not distinguish requests that share the same prefix but diverge in intent. To capture such
request-specific
semantics, we reuse the post-norm hidden state
𝐱
\mathbf{x}
of the last prefill token and project it through a single linear layer, i.e.,
𝐡
txt
=
ReLU
⁡
(
𝐖
t
​
𝐱
)
\mathbf{h}_{\mathrm{txt}}=\mathrm{ReLU}(\mathbf{W}_{t}\mathbf{x})
. As
𝐱
\mathbf{x}
is a by-product of prefill, this signal is obtained essentially for free.
Multi-step prediction head.
The above streams are concatenated and fed into a two-layer MLP with dropout, which jointly emits logits over agents for each of the next
K
K
steps.
Emitting all
K
K
logits from a shared backbone in one forward pass further avoids autoregressive error accumulation and bounds per-invocation latency to that of a single inference.
Training Strategy.
We train the predictor on offline invocation traces.
For each position
t
t
within a workflow, we pair the prefix
(
v
1
,
…
,
v
t
)
(v_{1},\ldots,v_{t})
and its prefill embedding with the future agents
(
v
t
+
1
,
…
,
v
t
+
K
)
(v_{t+1},\ldots,v_{t+K})
as labels.
The token
⟨
END
⟩
\langle\mathrm{END}\rangle
is treated as a regular target so that the termination probability
p
w
,
⟨
END
⟩
p_{w,\langle\mathrm{END}\rangle}
is properly learned, and only the padding positions after
⟨
END
⟩
\langle\mathrm{END}\rangle
in a target window are masked from the cross-entropy loss. The resulting predictor has roughly 350K parameters (orders of magnitude smaller than the served LLM) and processes a batch of 1,024 requests in 1.56 ms, rendering its runtime overhead negligible.
Detailed hyperparameter settings and training configurations are provided in the supplementary code.
Appendix C
Workflow Prediction
This appendix supplements Section
4.1
with three additional
results: (i) the scaling behavior of our predictor across training-set
sizes (Section
C.1
), (ii) a comparison against alternative
predictor families (Section
C.2
), and (iii) the sensitivity
of prediction accuracy to which transformer layer the prefill semantic
signal is extracted from (Section
C.3
).
Setup.
All experiments use the HoVer
[
20
]
dataset with the
LangChain
[
1
]
agent framework. We report top-
1
1
accuracy at horizons
k
=
1
,
2
,
3
k{=}1,2,3
(denoted
s
1
,
s
2
,
s
3
s_{1},s_{2},s_{3}
), averaged
over
10
10
random seeds.
C.1
Scaling Behavior
(a)
Prediction Accuracy of Step 1.
(b)
Prediction Accuracy of Step 2.
(c)
Prediction Accuracy of Step 3.
Figure 8
:
Top-
1
1
prediction accuracy as a function of training-set size
at horizons
k
=
1
,
2
,
3
k{=}1,2,3
. Our predictor leads every baseline at every
train size shown.
Figure
8
plots top-
1
1
accuracy against the number of
training traces. Two observations emerge. First, learning-based
predictors scale with data while the Markov baseline saturates within
100
100
traces, justifying predicting from a learned representation rather
than from tabulated transition probabilities. Second, our predictor
leads every learning-based baseline at every horizon and the lead
widens as the horizon grows.
C.2
Comparison Across Predictor Families
Table 3:
Predictor comparison at
1000
1000
training traces, grouped by
architectural family (mean
±
\pm
std over
10
10
seeds).
Family
Predictor
s
1
s_{1}
s
2
s_{2}
s
3
s_{3}
GraphSAGE (Ours)
0.935
±
0.007
\mathbf{0.935}\pm 0.007
0.848
±
0.012
\mathbf{0.848}\pm 0.012
0.771
±
0.019
\mathbf{0.771}\pm 0.019
R-GCN
R-GCN
0.896
±
0.008
0.896\pm 0.008
0.823
±
0.011
0.823\pm 0.011
0.710
±
0.018
0.710\pm 0.018
Transformer
1L
0.899
±
0.008
0.899\pm 0.008
0.811
±
0.023
0.811\pm 0.023
0.690
±
0.034
0.690\pm 0.034
2L
0.896
±
0.011
0.896\pm 0.011
0.810
±
0.022
0.810\pm 0.022
0.688
±
0.040
0.688\pm 0.040
TCN
small
0.901
±
0.006
0.901\pm 0.006
0.824
±
0.015
0.824\pm 0.015
0.717
±
0.019
0.717\pm 0.019
large
0.898
±
0.006
0.898\pm 0.006
0.831
±
0.007
0.831\pm 0.007
0.726
±
0.019
0.726\pm 0.019
MLP
tiny
0.786
±
0.003
0.786\pm 0.003
0.656
±
0.004
0.656\pm 0.004
0.494
±
0.003
0.494\pm 0.003
small
0.889
±
0.004
0.889\pm 0.004
0.801
±
0.012
0.801\pm 0.012
0.684
±
0.021
0.684\pm 0.021
deep
0.899
±
0.006
0.899\pm 0.006
0.824
±
0.016
0.824\pm 0.016
0.714
±
0.024
0.714\pm 0.024
Linear Probe
post-norm
0.840
±
0.026
0.840\pm 0.026
0.732
±
0.026
0.732\pm 0.026
0.576
±
0.036
0.576\pm 0.036
kNN
k
=
5
k{=}5
0.839
±
0.008
0.839\pm 0.008
0.699
±
0.007
0.699\pm 0.007
0.564
±
0.008
0.564\pm 0.008
k
=
20
k{=}20
0.817
±
0.005
0.817\pm 0.005
0.707
±
0.007
0.707\pm 0.007
0.576
±
0.006
0.576\pm 0.006
Markov
n
=
1
n{=}1
0.752
±
0.000
0.752\pm 0.000
0.555
±
0.000
0.555\pm 0.000
0.295
±
0.000
0.295\pm 0.000
n
=
2
n{=}2
0.774
±
0.000
0.774\pm 0.000
0.601
±
0.000
0.601\pm 0.000
0.383
±
0.000
0.383\pm 0.000
n
=
3
n{=}3
0.786
±
0.000
0.786\pm 0.000
0.656
±
0.000
0.656\pm 0.000
0.490
±
0.000
0.490\pm 0.000
Table
3
compares our predictor against every baseline
family we implemented: parameter-free baselines (Markov, kNN), a linear
probe on prefill states, MLPs, sequence models (Transformer
[
33
]
, TCN
[
34
]
), and
a relational graph encoder (R-GCN
[
35
]
). Our predictor outperforms the
strongest variant of every other family on all three horizons. The lead widens further at longer
horizons, consistent with the multi-step argument that long-horizon
prediction benefits most from a rich summary of the workflow prefix.
C.3
Choice of the Layer for Semantic Extraction
(a)
Prediction Accuracy of Step 1.
(b)
Prediction Accuracy of Step 2.
(c)
Prediction Accuracy of Step 3.
Figure 9
:
Top-
1
1
prediction accuracy as a function of the layer from
which the prefill semantic signal
h
txt
{h}_{\text{txt}}
is extracted.
The served LLM is Qwen3-32B, which exposes
64
64
transformer block
outputs (
ℓ
=
1
,
…
,
64
\ell{=}1,\ldots,64
) followed by the post-norm hidden
state
post-norm
that is fed into the output head.
The prefill semantic signal
h
txt
{h}_{\text{txt}}
described in
Section
4.1
is extracted from a single layer of the served
LLM, and a natural question is which layer to choose. Prior
studies
[
36
,
37
,
38
]
report that the optimal layer for hidden
state extraction is uncertain and depends jointly on the served model
and the downstream task. We therefore study this choice empirically on
Qwen3-32B by training the predictor with
h
txt
{h}_{\text{txt}}
taken
from each transformer block output (
ℓ
=
1
,
…
,
64
\ell{=}1,\ldots,64
) and from
the post-norm hidden state
post-norm
, holding the rest of the
architecture and the training protocol fixed.
Figure
9
reports the resulting
s
1
,
s
2
,
s
3
s_{1},s_{2},s_{3}
accuracies.
Consistent with prior observations, the optimal layer varies across
horizons and is highly specific to the served LLM and the workload at
hand: deploying our system on a different LLM or workload would require
re-running the layer scan to identify a new optimum. To preserve
compatibility with arbitrary served LLMs and workloads, and to keep the
predictor self-contained, we extract
h
txt
{h}_{\text{txt}}
from
post-norm
in all other experiments. The post-norm hidden state
is the standard input to the LLM’s output head, and is therefore
universally accessible across LLMs without extra instrumentation,
regardless of how many transformer blocks the model contains.
Appendix D
Sensitivity to the Confidence Decay Coefficient
Figure 10
:
Average cache hit rate vs. confidence decay coefficient
γ
\gamma
.
The score computation uses a coefficient
γ
\gamma
to discount the contribution of farther-step predictions, reflecting their decreasing reliability. We study its sensitivity on Qwen3-32B under the HoVer+LangChain workload. As shown in Figure
10
,
γ
=
0.7
\gamma=0.7
achieves the best performance. A smaller
γ
\gamma
can cause the score to decay too rapidly, suppressing lookahead and degrading toward myopic behavior; while a larger
γ
\gamma
will over-weight unreliable predictions at distant steps, leading to misguided eviction decisions.
Appendix E
Aggressive vs. Conservative Prefetching under Varying Prediction Accuracy
E.1
Motivation and Setup
Section
4.3
argues that PBKV adopts a conservative prefetching principle: under dynamic workflows, the uncertainty of prediction makes “displacing known-valuable active cache in exchange for speculatively valuable cache” an asymmetric trade-off between deterministic cost and probabilistic benefit. This appendix empirically validates this design choice.
Aggressive variant.
We construct an aggressive prefetching variant that relaxes only the space constraint of Section
4.3
, while keeping the rest of the design unchanged (i.e., the predictor, the scoring function, the activation only on pure-decode batches, and the PCIe bandwidth budget
S
b
​
w
S_{bw}
). Specifically, beyond the conservative budget
S
a
S_{a}
, the aggressive variant is additionally permitted to displace at most
ρ
⋅
S
total
\rho\cdot S_{\text{total}}
of active cache to make room for prefetching, where
S
total
S_{\text{total}}
denotes the total GPU cache capacity. Active nodes are evicted in ascending order of their lookahead score, ensuring that the lowest-scored nodes are displaced first.
Prediction noise injection.
To isolate the effect of prediction accuracy, we apply a controlled perturbation to the predictor’s output. Let
P
w
(
k
)
P_{w}^{(k)}
denote the GraphSAGE next-step distribution for workflow
w
w
at horizon
k
k
, and let
U
U
denote the uniform distribution over agents. The perturbed distribution is:
P
~
w
(
k
)
=
(
1
−
λ
)
​
P
w
(
k
)
+
λ
​
U
,
\tilde{P}_{w}^{(k)}=(1-\lambda)\,P_{w}^{(k)}+\lambda\,U,
(5)
where
λ
∈
[
0
,
1
]
\lambda\in[0,1]
denotes the noise level.
λ
=
0
\lambda=0
corresponds to the original predictor, while
λ
=
1
\lambda=1
degenerates to a uniform (i.e., random) prediction. The perturbation is applied to the predictor outputs consumed by both eviction and prefetching, simulating a system-wide degradation of the prediction signal.
Workload and metrics.
We follow the main experimental setup, i.e., the HoVer + LangChain workload with Qwen3-32B at a concurrency of 72. Each configuration is repeated 10 times, and we report the mean and standard deviation of the average cache hit rate.
E.2
Experiment 1: Sensitivity to the Prefetching Space Budget
We first sweep
ρ
\rho
under the noise-free setting
λ
=
0
\lambda=0
to identify the optimal aggressiveness of the variant.
Figure 11
:
Cache hit rate of conservative and aggressive prefetching across different prefetching space budgets
ρ
\rho
, under the noise-free setting (
λ
=
0
\lambda=0
). Error bars denote standard deviation over 10 trials.
As shown in Figure
11
, the hit rate of aggressive prefetching first increases and then decreases with
ρ
\rho
, peaking at
ρ
=
20
%
\rho=20\%
with roughly a 3-percentage-point margin over conservative prefetching. As
ρ
\rho
further grows, the hit rate falls below the conservative baseline, indicating that the cumulative cost of mistakenly displacing active cache outweighs the gain from prefetching.
More notably, the standard deviation grows monotonically with
ρ
\rho
even under the noise-free setting. At the optimal point
ρ
∗
=
20
%
\rho^{*}=20\%
, the standard deviation is already
∼
3.5
×
\sim 3.5\times
that of conservative prefetching. This indicates that, although aggressive prefetching can deliver expected gains, it harms the stability of the system.
In the following analysis, we use
ρ
∗
=
20
%
\rho^{*}=20\%
, at which aggressive prefetching achieves its best performance.
E.3
Experiment 2: Sweeping the Prediction Noise
Under
ρ
=
ρ
∗
\rho=\rho^{*}
, we sweep the noise level and compare PBKV-HE (no-prefetching reference), conservative prefetching (the default in PBKV), and aggressive prefetching.
Figure 12
:
Cache hit rate of PBKV-HE, conservative prefetching, and aggressive prefetching across different noise levels
λ
\lambda
. Error bars denote standard deviation over 10 trials.
As shown in Figure
12
, two key observations emerge:
(i) The advantageous regime of aggressive prefetching is narrow.
Only at
λ
=
0
\lambda=0
and
λ
=
10
%
\lambda=10\%
does aggressive prefetching outperform conservative prefetching, and the margin shrinks rapidly as the noise increases. At
λ
=
20
%
\lambda=20\%
, aggressive prefetching is already overtaken by conservative prefetching. In practice, the realistic operating regime of aggressive prefetching is even narrower.
(ii) Aggressive prefetching falls below PBKV-HE under moderate-to-high noise.
At
λ
=
30
%
\lambda=30\%
, aggressive prefetching already underperforms PBKV-HE, which performs no prefetching at all; at
λ
=
40
%
\lambda=40\%
the gap further widens. This shows that aggressive prefetching becomes counterproductive under inaccurate predictions, with its cost outweighing its benefit. In contrast, conservative prefetching consistently outperforms PBKV-HE across all noise levels, reflecting its lower-bound guarantee.
E.4
Justification of the Design Choice
In summary, aggressive prefetching only achieves a marginal and unstable advantage over conservative prefetching when the prediction accuracy is sufficiently high (i.e., the noise level is below 20%). However, dynamic multi-agent workflows are inherently hard to predict, especially under complex agent frameworks. Therefore, PBKV adopts conservative prefetching to obtain stable gains.
Appendix F
Scheduler Overhead Analysis
A natural concern with prediction-driven cache management is whether the additional scheduler logic erodes the cache-hit-rate gains. We instrument every PBKV scheduler hook in our SGLang implementation and measure per-call wall-clock latency over a full run of the HoVer+LangChain workload on Qwen3-32B at a concurrency of 72, identical to the operating point used throughout Section
6.2
.
Table 4
:
Per-call latency of PBKV’s scheduler components on Qwen3-32B with the HoVer+LangChain workload at concurrency 72. EvictDecision selects victim nodes on memory pressure; PredictInfer runs one forward pass of the GraphSAGE predictor; ScoreUpdate refreshes a cache node’s heap entry after a new prediction; PrefetchDecision ranks host-resident candidates under the
(
S
a
,
S
b
​
w
)
(S_{a},S_{bw})
budget; DecodeStep is one batched decode iteration, included as a reference.
Note the unit difference
: ScoreUpdate is in microseconds (µs); all other components in milliseconds (ms).
Component
Mean
P99
EvictDecision
0.44 ms
0.81 ms
PredictInfer
1.18 ms
1.68 ms
ScoreUpdate
1.53
µs
2.69
µs
PrefetchDecision
0.64 ms
1.60 ms
DecodeStep
12.34 ms
43.14 ms
Table
4
reports the mean and P99 latency of EvictDecision, PredictInfer, ScoreUpdate, and PrefetchDecision, with DecodeStep included as a reference for relative cost.
Among them, EvictDecision, ScoreUpdate, and PrefetchDecision run on the CPU scheduler thread and operate purely on PBKV’s heap-based bookkeeping structures, concurrent with the GPU decode kernel. PredictInfer executes on the GPU but is issued on a separate CUDA stream that overlaps with the ongoing decode kernel. None of the four therefore sit on the GPU critical path. ScoreUpdate in particular is essentially free at
1.53
​
μ
1.53~\mu
s on average, precisely what allows per-node scores to be refreshed at high frequency without serializing the scheduler.
Eviction and prefetch decisions both average well under
1
1
ms (
0.44
0.44
ms and
0.64
0.64
ms), and even predictor inference – the dominant component – averages just
1.18
1.18
ms, less than
10
%
10\%
of a mean decode step (
12.34
12.34
ms), and the other components fall well below this. These overheads do not show up in end-to-end performance: PBKV achieves a
1.85
×
1.85\times
speedup over LRU on this workload (Section
6.2
).
Appendix G
Smoothness Analysis
Overview.
This appendix establishes the smoothness pillar of PBKV’s algorithms-with-predictions guarantee. We organize the analysis into four layers. Lemma
G.1
identifies the per-node score
SCORE
⁡
(
c
)
\mathrm{SCORE}(c)
as the expected discounted miss count attributable to evicting
c
c
, thereby grounding the proxy cost in a system-relevant quantity. Lemma
G.2
shows that this score is Lipschitz-continuous in the predicted distributions. Corollary
G.3
translates this score-level continuity into pairwise ranking stability. Theorem
G.4
further lifts it to a cost-level regret bound. All Lipschitz-type results share a single multiplier with a
K
K
-independent upper bound
1
/
(
2
​
(
1
−
γ
)
)
1/\bigl(2(1-\gamma)\bigr)
that is also independent of
|
𝒲
act
|
|\mathcal{W}_{\mathrm{act}}|
and the cache size, which justifies treating the predictor as a pluggable module: any future improvement in predictor accuracy directly tightens all bounds.
G.1
Setup
Probabilistic model.
We posit a ground-truth conditional distribution under which each active workflow
w
w
produces, at every step
k
k
, a true distribution
P
w
(
k
)
∈
Δ
|
V
|
P_{w}^{(k)}\in\Delta^{|V|}
over
V
∪
{
⟨
END
⟩
}
V\cup\{\langle\mathrm{END}\rangle\}
, conditioned on the workflow having not terminated before step
k
k
. Here
Δ
|
V
|
\Delta^{|V|}
denotes the
|
V
|
|V|
-dimensional probability simplex over the
|
V
|
+
1
|V|+1
outcomes in
V
∪
{
⟨
END
⟩
}
V\cup\{\langle\mathrm{END}\rangle\}
, following the standard topological convention. The predictor outputs an estimate
P
^
w
(
k
)
\widehat{P}_{w}^{(k)}
on the same simplex. Consistent with the sequential agent execution adopted by mainstream multi-agent frameworks (e.g., LangChain
[
1
]
, Microsoft AutoGen
[
2
]
, MetaGPT
[
3
]
), we model each active workflow as invoking exactly one agent per step (or terminating), so that
P
w
(
k
)
P_{w}^{(k)}
is the marginal distribution of the step-
k
k
invocation conditioned on survival to step
k
k
. Let
p
w
,
⟨
END
⟩
(
j
)
p_{w,\langle\mathrm{END}\rangle}^{(j)}
denote the conditional termination probability at step
j
j
. The cumulative survival factor follows the standard hazard-product decomposition
s
w
(
k
)
=
∏
j
=
1
k
−
1
(
1
−
p
w
,
⟨
END
⟩
(
j
)
)
s_{w}^{(k)}=\prod_{j=1}^{k-1}\!\bigl(1-p_{w,\langle\mathrm{END}\rangle}^{(j)}\bigr)
. Throughout,
𝒲
act
​
(
c
)
\mathcal{W}_{\mathrm{act}}(c)
denotes the set of active workflows associated with node
c
c
at the moment the eviction decision is made.
Eviction-only abstraction.
Following the classical formulation of caching analysis pioneered by Belady
[
8
]
and adopted by recent algorithms-with-predictions work
[
39
,
40
]
, we evaluate eviction policies under the
eviction-only abstraction
, i.e., a node, once evicted, remains out of the cache for the entire
K
K
-step horizon over which the cost is measured. This abstraction isolates the quality of the eviction decision from orthogonal storage-hierarchy mechanisms (e.g., HiCache re-admission on miss), which are properties of the underlying system rather than of the eviction policy itself. PBKV’s eviction policy operates on the same abstraction and is agnostic to whether a second-tier storage is present. The composition of our analysis with HiCache is discussed at the end of Section
G.4
.
Access-indicator semantics.
For each active workflow
w
∈
𝒲
act
​
(
c
)
w\in\mathcal{W}_{\mathrm{act}}(c)
, the access indicator
A
w
​
(
c
)
∈
{
0
,
1
}
|
V
|
A_{w}(c)\in\{0,1\}^{|V|}
marks the set of agents within
w
w
that access
c
c
, denoted
𝒪
w
​
(
c
)
:=
{
a
∈
V
:
A
w
​
(
c
)
a
=
1
}
\mathcal{O}_{w}(c):=\{a\in V:A_{w}(c)_{a}=1\}
. Two cases arise. (i) For private cache,
|
𝒲
act
​
(
c
)
|
|\mathcal{W}_{\mathrm{act}}(c)|
is small and
A
w
​
(
c
)
A_{w}(c)
is typically one-hot, since the owning agent of
c
c
is determined by the upstream agent that produced it within
w
w
. (ii) For global cache (e.g., system prompts or tool/agent descriptions),
|
𝒲
act
​
(
c
)
|
|\mathcal{W}_{\mathrm{act}}(c)|
may be large and each
A
w
​
(
c
)
A_{w}(c)
may have multiple ones, reflecting that distinct agents within the same workflow all access the shared prefix. The score formula in Eq. (
2
) treats both cases under a single mathematical form, with the cross-workflow outer sum protecting popular-prefix nodes by design (Section
4.2
). For notational convenience, we adopt the convention that
A
w
​
(
c
)
A_{w}(c)
is implicitly zero-padded on the
⟨
END
⟩
\langle\mathrm{END}\rangle
coordinate, so that the inner product
A
w
​
(
c
)
⊤
​
P
w
(
k
)
=
∑
a
∈
V
A
w
​
(
c
)
a
​
P
w
(
k
)
​
(
a
)
=
P
w
(
k
)
​
(
𝒪
w
​
(
c
)
)
A_{w}(c)^{\top}P_{w}^{(k)}\;=\;\sum_{a\in V}A_{w}(c)_{a}\,P_{w}^{(k)}(a)\;=\;P_{w}^{(k)}\!\bigl(\mathcal{O}_{w}(c)\bigr)
(6)
is dimensionally consistent and equals the probability that workflow
w
w
invokes some agent in
𝒪
w
​
(
c
)
\mathcal{O}_{w}(c)
at step
k
k
.
Past access equals future hit.
The radix-tree prefix structure adopted by SGLang
[
5
]
ensures that
A
w
​
(
c
)
A_{w}(c)
, defined from the observed access history, also characterizes future hits within the same workflow. Specifically, a cache node
c
c
corresponds to a fixed token prefix; if agent
a
a
has invoked the radix path through
c
c
in
w
w
, then any subsequent invocation of
a
a
within
w
w
(e.g., under a retry loop) prepends the same system prompt and upstream context, and therefore traverses the same prefix and hits
c
c
provided
c
c
remains cached. Conversely, an agent that has never accessed
c
c
does not have
c
c
on its execution path and will not hit
c
c
in future invocations within
w
w
. Hence, throughout the analysis, “
w
w
would hit
c
c
at step
k
k
if
c
c
remained cached” is equivalent to “
w
w
invokes some
a
∈
𝒪
w
​
(
c
)
a\in\mathcal{O}_{w}(c)
at step
k
k
”.
Unit-size abstraction and the role of node size.
A natural question is why
SCORE
⁡
(
c
)
\mathrm{SCORE}(c)
in Eq. (
2
) does not contain an explicit
|
c
|
|c|
factor. This is a deliberate design choice: for a cache node
c
c
of size
|
c
|
|c|
, both the space cost of retaining it and the wall-clock cost of a miss on it scale linearly with
|
c
|
|c|
, since a miss triggers the re-prefill (or PCIe transfer under HiCache) of
|
c
|
|c|
tokens. The two factors of
|
c
|
|c|
therefore cancel out when the quantity of interest is value per unit space. By construction,
SCORE
⁡
(
c
)
\mathrm{SCORE}(c)
measures exactly this per-unit-space value, which is also the canonical ranking criterion of fractional-knapsack-style cache replacement: ranking by per-unit-space value, rather than by absolute value, is what minimizes total miss cost under a space budget. Multiplying
SCORE
⁡
(
c
)
\mathrm{SCORE}(c)
by
|
c
|
|c|
would conflate “valuable” with “large” and bias eviction against small-but-hot nodes, which is the opposite of the intended behavior.
For the regret analysis, we adopt the standard unit-size abstraction
[
8
,
39
,
40
]
, under which each node contributes an equal volume to the eviction budget and the budget-
B
B
eviction reduces to selecting
B
B
lowest-scoring nodes. This abstraction is consistent with the size-heterogeneous setting via a standard reduction in which each node of size
|
c
|
|c|
is treated as
|
c
|
|c|
unit-size virtual nodes sharing the same per-unit-space score
SCORE
⁡
(
c
)
\mathrm{SCORE}(c)
, whereby cardinality-constrained selection over virtual nodes recovers size-constrained selection over original nodes. Since radix-tree nodes are page-sized in practice and
|
c
|
≪
B
|c|\ll B
, the boundary effect of integer-budget rounding is at most one node and does not affect the asymptotic behavior of the bound. The Lipschitz and regret bounds below therefore transfer to the size-heterogeneous setting without modification of the multiplier
1
/
(
2
​
(
1
−
γ
)
)
1/\bigl(2(1-\gamma)\bigr)
.
Perturbation model.
Following standard practice in algorithms-with-predictions analyses for caching
[
39
,
40
]
, we measure prediction error via the per-step
ℓ
1
\ell_{1}
deviation and its node-local discount-weighted aggregate:
ϵ
w
(
k
)
:=
∥
P
w
(
k
)
−
P
^
w
(
k
)
∥
1
,
ϵ
c
γ
:=
∑
w
∈
𝒲
act
​
(
c
)
∑
k
=
1
K
γ
k
−
1
ϵ
w
(
k
)
.
\epsilon_{w}^{(k)}:=\bigl\lVert P_{w}^{(k)}-\widehat{P}_{w}^{(k)}\bigr\rVert_{1},\qquad\epsilon_{c}^{\gamma}:=\sum_{w\,\in\,\mathcal{W}_{\mathrm{act}}(c)}\sum_{k=1}^{K}\gamma^{k-1}\,\epsilon_{w}^{(k)}.
(7)
Throughout, we let
SCORE
⁡
(
c
)
\mathrm{SCORE}(c)
and
SCORE
^
​
(
c
)
\widehat{\mathrm{SCORE}}(c)
denote the per-node scores computed from
{
P
w
(
k
)
}
\{P_{w}^{(k)}\}
and
{
P
^
w
(
k
)
}
\{\widehat{P}_{w}^{(k)}\}
respectively, both via Eq. (
2
).
G.2
From Score to Expected Miss Count
We first establish the system-level meaning of
SCORE
⁡
(
c
)
\mathrm{SCORE}(c)
, which grounds the subsequent regret analysis in a quantity of direct interest to caching theory.
Lemma G.1
(Score equals expected discounted miss count attributable to eviction)
.
Under the eviction-only abstraction (Section
G.1
), for any cache node
c
c
that is evicted at the decision point and not re-admitted within the horizon,
EMC
⁡
(
c
)
:=
∑
k
=
1
K
γ
k
−
1
​
𝔼
​
[
misses on
​
c
​
at step
​
k
]
=
SCORE
⁡
(
c
)
,
\mathrm{EMC}(c)\;:=\;\sum_{k=1}^{K}\gamma^{k-1}\,\mathbb{E}\bigl[\text{misses on }c\text{ at step }k\bigr]\;=\;\mathrm{SCORE}(c),
(8)
where the expectation is taken under the ground-truth distribution and the misses are aggregated across all
w
∈
𝒲
act
​
(
c
)
w\in\mathcal{W}_{\mathrm{act}}(c)
.
Proof.
Fix a cache node
c
c
and a workflow
w
∈
𝒲
act
​
(
c
)
w\in\mathcal{W}_{\mathrm{act}}(c)
. Let
#
​
miss
w
(
k
)
​
(
c
)
∈
{
0
,
1
}
\#\mathrm{miss}_{w}^{(k)}(c)\in\{0,1\}
denote the indicator that
w
w
incurs a miss on
c
c
at step
k
k
. Since
w
w
invokes exactly one agent per step (or terminates), and any invocation of an agent
a
∈
𝒪
w
​
(
c
)
a\in\mathcal{O}_{w}(c)
would have traversed
c
c
by the radix-tree prefix structure (Section
G.1
), we have
#
miss
w
(
k
)
(
c
)
=
[
w
survives to step
k
and invokes some
a
∈
𝒪
w
(
c
)
]
,
\#\mathrm{miss}_{w}^{(k)}(c)\;=\;\mathbf{1}\!\bigl[w\text{ survives to step }k\text{ and invokes some }a\in\mathcal{O}_{w}(c)\bigr],
(9)
where the equality uses that, under the eviction-only abstraction, every such invocation is a miss. The events
{
w
invokes
a
at step
k
}
a
∈
V
\{\text{$w$ invokes $a$ at step $k$}\}_{a\in V}
are mutually exclusive conditional on survival to step
k
k
, so
Pr
⁡
[
w
​
invokes some
​
a
∈
𝒪
w
​
(
c
)
|
w
​
survives to
​
k
]
=
∑
a
∈
𝒪
w
​
(
c
)
P
w
(
k
)
​
(
a
)
=
A
w
​
(
c
)
⊤
​
P
w
(
k
)
.
\Pr\!\bigl[w\text{ invokes some }a\in\mathcal{O}_{w}(c)\,\big|\,w\text{ survives to }k\bigr]\;=\;\sum_{a\in\mathcal{O}_{w}(c)}P_{w}^{(k)}(a)\;=\;A_{w}(c)^{\top}P_{w}^{(k)}.
(10)
Multiplying by
Pr
⁡
[
w
​
survives to
​
k
]
=
s
w
(
k
)
\Pr[w\text{ survives to }k]=s_{w}^{(k)}
gives
𝔼
⁡
[
#
​
miss
w
(
k
)
​
(
c
)
]
=
s
w
(
k
)
⋅
A
w
​
(
c
)
⊤
​
P
w
(
k
)
\mathbb{E}\!\bigl[\#\mathrm{miss}_{w}^{(k)}(c)\bigr]=s_{w}^{(k)}\cdot A_{w}(c)^{\top}P_{w}^{(k)}
. Summing across
w
∈
𝒲
act
​
(
c
)
w\in\mathcal{W}_{\mathrm{act}}(c)
by linearity of expectation and discounting by
γ
k
−
1
\gamma^{k-1}
over
k
=
1
,
…
,
K
k=1,\ldots,K
, comparing with Eq. (
2
) yields
EMC
⁡
(
c
)
=
SCORE
⁡
(
c
)
\mathrm{EMC}(c)=\mathrm{SCORE}(c)
.
∎
Implications.
Lemma
G.1
provides three benefits. (i) It removes any circularity between the scoring rule and the cost it is evaluated against, since
SCORE
⁡
(
c
)
\mathrm{SCORE}(c)
is now identified with a quantity defined purely from the ground-truth distribution and the cache state. (ii) It places PBKV’s analysis on the same footing as classical caching results
[
8
]
, where eviction policies are evaluated through their effect on miss counts, independent of any specific reload mechanism. (iii) It motivates the proxy cost adopted in Section
G.4
as a system-relevant rather than ad-hoc surrogate.
G.3
Lipschitz Continuity of the Score
We next show that
SCORE
⁡
(
c
)
\mathrm{SCORE}(c)
depends continuously on the predicted distributions, with a Lipschitz constant whose dependence on the prediction horizon
K
K
admits a uniform
K
K
-independent upper bound.
Lemma G.2
(Lipschitz continuity of the score)
.
For any cache node
c
c
and any pair of distribution sets
{
P
w
(
k
)
}
\{P_{w}^{(k)}\}
and
{
P
^
w
(
k
)
}
\{\widehat{P}_{w}^{(k)}\}
in
Δ
|
V
|
\Delta^{|V|}
,
|
SCORE
⁡
(
c
)
−
SCORE
^
​
(
c
)
|
≤
1
−
γ
K
2
​
(
1
−
γ
)
​
ϵ
c
γ
≤
ϵ
c
γ
2
​
(
1
−
γ
)
.
\Bigl|\mathrm{SCORE}(c)-\widehat{\mathrm{SCORE}}(c)\Bigr|\;\leq\;\frac{1-\gamma^{K}}{2(1-\gamma)}\,\epsilon_{c}^{\gamma}\;\leq\;\frac{\epsilon_{c}^{\gamma}}{2(1-\gamma)}.
(11)
The Lipschitz multiplier admits a
K
K
-independent upper bound
1
/
(
2
​
(
1
−
γ
)
)
1/\bigl(2(1-\gamma)\bigr)
that is also independent of
|
𝒲
act
​
(
c
)
|
|\mathcal{W}_{\mathrm{act}}(c)|
and the cache size; the dependence on these quantities is fully isolated in
ϵ
c
γ
\epsilon_{c}^{\gamma}
.
Proof.
We bound the per-term deviation
|
s
w
(
k
)
​
A
w
​
(
c
)
⊤
​
P
w
(
k
)
−
s
^
w
(
k
)
​
A
w
​
(
c
)
⊤
​
P
^
w
(
k
)
|
\bigl|s_{w}^{(k)}A_{w}(c)^{\top}P_{w}^{(k)}-\widehat{s}_{w}^{(k)}A_{w}(c)^{\top}\widehat{P}_{w}^{(k)}\bigr|
in two steps and then aggregate over
k
k
and
w
w
.
Step 1 (per-term bound).
The survival factor
s
w
(
k
)
s_{w}^{(k)}
takes values in
[
0
,
1
]
[0,1]
as a product of
[
0
,
1
]
[0,1]
terms, and so does
s
^
w
(
k
)
\widehat{s}_{w}^{(k)}
. The standard telescoping identity for products of
[
0
,
1
]
[0,1]
-valued sequences gives
|
s
w
(
k
)
−
s
^
w
(
k
)
|
≤
∑
j
=
1
k
−
1
|
p
w
,
⟨
END
⟩
(
j
)
−
p
^
w
,
⟨
END
⟩
(
j
)
|
.
\bigl|s_{w}^{(k)}-\widehat{s}_{w}^{(k)}\bigr|\;\leq\;\sum_{j=1}^{k-1}\bigl|p_{w,\langle\mathrm{END}\rangle}^{(j)}-\widehat{p}_{w,\langle\mathrm{END}\rangle}^{(j)}\bigr|.
(12)
For any pair of probability distributions
P
,
Q
P,Q
on a finite outcome space and any subset
S
S
of outcomes, the difference of subset-event probabilities is bounded by the total variation distance,
|
P
⁡
(
S
)
−
Q
⁡
(
S
)
|
≤
TV
⁡
(
P
,
Q
)
=
1
2
​
‖
P
−
Q
‖
1
|P(S)-Q(S)|\leq\mathrm{TV}(P,Q)=\tfrac{1}{2}\|P-Q\|_{1}
. Applied to the singleton
S
=
{
⟨
END
⟩
}
S=\{\langle\mathrm{END}\rangle\}
, this yields
|
p
w
,
⟨
END
⟩
(
j
)
−
p
^
w
,
⟨
END
⟩
(
j
)
|
≤
1
2
​
ϵ
w
(
j
)
\bigl|p_{w,\langle\mathrm{END}\rangle}^{(j)}-\widehat{p}_{w,\langle\mathrm{END}\rangle}^{(j)}\bigr|\leq\tfrac{1}{2}\epsilon_{w}^{(j)}
, and substituting into (
12
) gives
|
s
w
(
k
)
−
s
^
w
(
k
)
|
≤
1
2
​
∑
j
=
1
k
−
1
ϵ
w
(
j
)
.
\bigl|s_{w}^{(k)}-\widehat{s}_{w}^{(k)}\bigr|\;\leq\;\frac{1}{2}\sum_{j=1}^{k-1}\epsilon_{w}^{(j)}.
(13)
Similarly, by the zero-padding convention (
6
),
A
w
​
(
c
)
⊤
​
P
w
(
k
)
=
P
w
(
k
)
​
(
𝒪
w
​
(
c
)
)
∈
[
0
,
1
]
A_{w}(c)^{\top}P_{w}^{(k)}=P_{w}^{(k)}\!\bigl(\mathcal{O}_{w}(c)\bigr)\in[0,1]
is a subset-event probability under
P
w
(
k
)
P_{w}^{(k)}
, and the same holds for
A
w
​
(
c
)
⊤
​
P
^
w
(
k
)
A_{w}(c)^{\top}\widehat{P}_{w}^{(k)}
. Applying the same total-variation bound to the subset
S
=
𝒪
w
​
(
c
)
S=\mathcal{O}_{w}(c)
,
|
A
w
​
(
c
)
⊤
​
P
w
(
k
)
−
A
w
​
(
c
)
⊤
​
P
^
w
(
k
)
|
≤
1
2
​
ϵ
w
(
k
)
.
\bigl|A_{w}(c)^{\top}P_{w}^{(k)}-A_{w}(c)^{\top}\widehat{P}_{w}^{(k)}\bigr|\;\leq\;\frac{1}{2}\,\epsilon_{w}^{(k)}.
(14)
Combining (
13
) and (
14
) via the elementary identity
|
u
​
v
−
u
^
​
v
^
|
≤
|
v
−
v
^
|
+
|
u
−
u
^
|
|uv-\widehat{u}\widehat{v}|\leq|v-\widehat{v}|+|u-\widehat{u}|
for
u
,
u
^
,
v
,
v
^
∈
[
0
,
1
]
u,\widehat{u},v,\widehat{v}\in[0,1]
yields
|
s
w
(
k
)
​
A
w
​
(
c
)
⊤
​
P
w
(
k
)
−
s
^
w
(
k
)
​
A
w
​
(
c
)
⊤
​
P
^
w
(
k
)
|
≤
1
2
​
∑
j
=
1
k
ϵ
w
(
j
)
.
\Bigl|s_{w}^{(k)}A_{w}(c)^{\top}P_{w}^{(k)}-\widehat{s}_{w}^{(k)}A_{w}(c)^{\top}\widehat{P}_{w}^{(k)}\Bigr|\;\leq\;\frac{1}{2}\sum_{j=1}^{k}\epsilon_{w}^{(j)}.
(15)
Step 2 (aggregation).
Multiplying (
15
) by
γ
k
−
1
\gamma^{k-1}
, summing over
k
=
1
,
…
,
K
k=1,\dots,K
, and exchanging the order of summation between
k
k
and
j
j
,
∑
k
=
1
K
γ
k
−
1
⋅
1
2
∑
j
=
1
k
ϵ
w
(
j
)
=
1
2
∑
j
=
1
K
γ
j
−
1
ϵ
w
(
j
)
⋅
1
−
γ
K
−
j
+
1
1
−
γ
≤
1
−
γ
K
2
​
(
1
−
γ
)
∑
j
=
1
K
γ
j
−
1
ϵ
w
(
j
)
,
\sum_{k=1}^{K}\gamma^{k-1}\!\cdot\!\frac{1}{2}\sum_{j=1}^{k}\epsilon_{w}^{(j)}\;=\;\frac{1}{2}\sum_{j=1}^{K}\gamma^{j-1}\epsilon_{w}^{(j)}\cdot\frac{1-\gamma^{K-j+1}}{1-\gamma}\;\leq\;\frac{1-\gamma^{K}}{2(1-\gamma)}\sum_{j=1}^{K}\gamma^{j-1}\epsilon_{w}^{(j)},
(16)
where the inner sum is a finite geometric series and the inequality uses
1
−
γ
K
−
j
+
1
≤
1
−
γ
K
1-\gamma^{K-j+1}\leq 1-\gamma^{K}
for
j
≥
1
j\geq 1
and
γ
∈
(
0
,
1
)
\gamma\in(0,1)
. Summing across
w
∈
𝒲
act
​
(
c
)
w\in\mathcal{W}_{\mathrm{act}}(c)
yields the tighter form
(
1
−
γ
K
)
​
ϵ
c
γ
/
(
2
​
(
1
−
γ
)
)
(1-\gamma^{K})\epsilon_{c}^{\gamma}/\bigl(2(1-\gamma)\bigr)
in Eq. (
11
), and the looser corollary
ϵ
c
γ
/
(
2
​
(
1
−
γ
)
)
\epsilon_{c}^{\gamma}/\bigl(2(1-\gamma)\bigr)
follows from
1
−
γ
K
≤
1
1-\gamma^{K}\leq 1
.
∎
Locality remark.
Only workflows in
𝒲
act
​
(
c
)
\mathcal{W}_{\mathrm{act}}(c)
contribute to
ϵ
c
γ
\epsilon_{c}^{\gamma}
, so prediction errors on workflows
w
w
with
A
w
​
(
c
)
=
0
A_{w}(c)=0
leave
SCORE
⁡
(
c
)
\mathrm{SCORE}(c)
unchanged. This locality reflects the radix-tree prefix structure respected by the scoring rule and matches the design intent of Section
4.2
.
Corollary G.3
(Ranking stability)
.
Let
c
1
,
c
2
c_{1},c_{2}
be two cache nodes with
SCORE
⁡
(
c
1
)
>
SCORE
⁡
(
c
2
)
\mathrm{SCORE}(c_{1})>\mathrm{SCORE}(c_{2})
, and let
Δ
:=
SCORE
⁡
(
c
1
)
−
SCORE
⁡
(
c
2
)
\Delta:=\mathrm{SCORE}(c_{1})-\mathrm{SCORE}(c_{2})
. If
1
−
γ
K
2
​
(
1
−
γ
)
​
(
ϵ
c
1
γ
+
ϵ
c
2
γ
)
<
Δ
,
\frac{1-\gamma^{K}}{2(1-\gamma)}\bigl(\epsilon_{c_{1}}^{\gamma}+\epsilon_{c_{2}}^{\gamma}\bigr)\;<\;\Delta,
(17)
then
SCORE
^
​
(
c
1
)
>
SCORE
^
​
(
c
2
)
\widehat{\mathrm{SCORE}}(c_{1})>\widehat{\mathrm{SCORE}}(c_{2})
, and the eviction preference between
c
1
c_{1}
and
c
2
c_{2}
is preserved.
Proof.
By Lemma
G.2
applied to
c
1
c_{1}
and
c
2
c_{2}
separately, together with the triangle inequality.
∎
G.4
Eviction Cost Regret
We now lift the score-level continuity to a cost-level regret bound, which is the form prescribed by the smoothness desideratum of the algorithms-with-predictions framework
[
41
]
.
Proxy cost.
We adopt
ℒ
⁡
(
E
)
:=
∑
c
∈
E
SCORE
⁡
(
c
)
,
\mathcal{L}(E)\;:=\;\sum_{c\in E}\mathrm{SCORE}(c),
(18)
which, by Lemma
G.1
, equals the expected discounted miss count incurred by evicting the set
E
E
under the eviction-only abstraction. This grounds the proxy cost in the canonical quantity studied since Belady
[
8
]
and isolates the eviction-policy quality from orthogonal storage-hierarchy concerns. The same surrogate has also been used in algorithms-with-predictions analyses for caching
[
39
,
40
]
, where costs are likewise defined through predicted access patterns rather than realized latencies.
Regret definition.
For the regret analysis, we specialize
{
P
w
(
k
)
}
\{P_{w}^{(k)}\}
to the ground-truth distributions and
{
P
^
w
(
k
)
}
\{\widehat{P}_{w}^{(k)}\}
to the predictor outputs. Freeing a budget of
B
B
nodes reduces to a cardinality-constrained selection (Section
G.1
). PBKV ranks candidate nodes by
SCORE
^
\widehat{\mathrm{SCORE}}
and evicts
E
^
B
:=
arg
⁡
min
⁡
∑
c
∈
E
|
E
|
=
B
⁡
SCORE
^
​
(
c
)
,
\widehat{E}_{B}\;:=\;\arg\min_{|E|=B}\sum_{c\in E}\widehat{\mathrm{SCORE}}(c),
(19)
whereas the cost-minimizing eviction set under the ground truth is
E
B
⋆
:=
arg
⁡
min
|
E
|
=
B
⁡
ℒ
⁡
(
E
)
E_{B}^{\star}:=\arg\min_{|E|=B}\mathcal{L}(E)
. The eviction cost regret of PBKV is
ℛ
⁡
(
B
)
:=
ℒ
⁡
(
E
^
B
)
−
ℒ
⁡
(
E
B
⋆
)
≥
0
,
\mathcal{R}(B)\;:=\;\mathcal{L}\bigl(\widehat{E}_{B}\bigr)-\mathcal{L}\bigl(E_{B}^{\star}\bigr)\;\geq\;0,
(20)
where non-negativity follows from the optimality of
E
B
⋆
E_{B}^{\star}
for
ℒ
\mathcal{L}
.
Theorem G.4
(Eviction cost regret bound)
.
Under the eviction-only abstraction and the unit-size abstraction (Section
G.1
), for any predictor outputs
{
P
^
w
(
k
)
}
\{\widehat{P}_{w}^{(k)}\}
, the eviction cost regret of PBKV satisfies
ℛ
⁡
(
B
)
≤
∑
c
∈
E
^
B
​
△
​
E
B
⋆
δ
c
≤
1
−
γ
K
2
​
(
1
−
γ
)
​
∑
c
∈
E
^
B
​
△
​
E
B
⋆
ϵ
c
γ
,
\mathcal{R}(B)\;\leq\;\sum_{c\,\in\,\widehat{E}_{B}\triangle E_{B}^{\star}}\delta_{c}\;\leq\;\frac{1-\gamma^{K}}{2(1-\gamma)}\!\!\sum_{c\,\in\,\widehat{E}_{B}\triangle E_{B}^{\star}}\!\epsilon_{c}^{\gamma},
(21)
where
△
\triangle
denotes the symmetric set difference and
δ
c
:=
|
SCORE
⁡
(
c
)
−
SCORE
^
​
(
c
)
|
\delta_{c}:=\bigl|\mathrm{SCORE}(c)-\widehat{\mathrm{SCORE}}(c)\bigr|
. As the prediction error vanishes,
ℛ
⁡
(
B
)
→
0
\mathcal{R}(B)\to 0
.
Proof.
Partition
E
^
B
∪
E
B
⋆
\widehat{E}_{B}\cup E_{B}^{\star}
into
𝒜
:=
E
^
B
∖
E
B
⋆
\mathcal{A}:=\widehat{E}_{B}\setminus E_{B}^{\star}
,
ℬ
:=
E
B
⋆
∖
E
^
B
\mathcal{B}:=E_{B}^{\star}\setminus\widehat{E}_{B}
, and
𝒞
:=
E
^
B
∩
E
B
⋆
\mathcal{C}:=\widehat{E}_{B}\cap E_{B}^{\star}
. Both eviction sets have cardinality
B
B
, hence
|
𝒜
|
=
|
ℬ
|
|\mathcal{A}|=|\mathcal{B}|
. By construction of
E
^
B
\widehat{E}_{B}
as the minimizer of
∑
c
∈
E
SCORE
^
​
(
c
)
\sum_{c\in E}\widehat{\mathrm{SCORE}}(c)
over cardinality-
B
B
sets, and after cancelling the common
𝒞
\mathcal{C}
-terms,
∑
c
∈
𝒜
SCORE
^
​
(
c
)
≤
∑
c
∈
ℬ
SCORE
^
​
(
c
)
.
\sum_{c\in\mathcal{A}}\widehat{\mathrm{SCORE}}(c)\;\leq\;\sum_{c\in\mathcal{B}}\widehat{\mathrm{SCORE}}(c).
(22)
Therefore
ℛ
⁡
(
B
)
\displaystyle\mathcal{R}(B)
=
∑
c
∈
𝒜
SCORE
⁡
(
c
)
−
∑
c
∈
ℬ
SCORE
⁡
(
c
)
\displaystyle=\sum_{c\in\mathcal{A}}\mathrm{SCORE}(c)-\sum_{c\in\mathcal{B}}\mathrm{SCORE}(c)
(23)
≤
∑
c
∈
𝒜
(
SCORE
⁡
(
c
)
−
SCORE
^
​
(
c
)
)
+
∑
c
∈
ℬ
(
SCORE
^
​
(
c
)
−
SCORE
⁡
(
c
)
)
\displaystyle\leq\sum_{c\in\mathcal{A}}\!\bigl(\mathrm{SCORE}(c)-\widehat{\mathrm{SCORE}}(c)\bigr)+\sum_{c\in\mathcal{B}}\!\bigl(\widehat{\mathrm{SCORE}}(c)-\mathrm{SCORE}(c)\bigr)
(24)
≤
∑
c
∈
𝒜
∪
ℬ
δ
c
=
∑
c
∈
E
^
B
​
△
​
E
B
⋆
δ
c
,
\displaystyle\leq\sum_{c\in\mathcal{A}\cup\mathcal{B}}\!\delta_{c}\;=\;\sum_{c\,\in\,\widehat{E}_{B}\triangle E_{B}^{\star}}\!\delta_{c},
(25)
where the first inequality follows from (
22
) and the second from
|
SCORE
⁡
(
c
)
−
SCORE
^
​
(
c
)
|
≤
δ
c
|\mathrm{SCORE}(c)-\widehat{\mathrm{SCORE}}(c)|\leq\delta_{c}
on each side. The remaining inequality of Eq. (
21
) follows by applying Lemma
G.2
to each
δ
c
\delta_{c}
.
∎
Interpretation.
Theorem
G.4
bounds the regret of PBKV’s eviction decisions on the expected discounted miss count, the canonical cost in caching analysis dating back to Belady
[
8
]
. Two observations are worth emphasizing. First, the multiplier
(
1
−
γ
K
)
/
(
2
​
(
1
−
γ
)
)
(1-\gamma^{K})/\bigl(2(1-\gamma)\bigr)
matches that of Lemma
G.2
, so the score-level and cost-level bounds share a single
K
K
-independent upper bound
1
/
(
2
​
(
1
−
γ
)
)
1/\bigl(2(1-\gamma)\bigr)
. Second, only nodes in the symmetric difference
E
^
B
​
△
​
E
B
⋆
\widehat{E}_{B}\triangle E_{B}^{\star}
contribute to
ℛ
⁡
(
B
)
\mathcal{R}(B)
. A correctly ranked node, relative to the eviction boundary, contributes zero regret regardless of the magnitude of its individual score error. This boundary-localized regret structure indicates that the bound is governed by ranking errors near the eviction frontier rather than by aggregate score errors, consistent with the ranking-stability view of Corollary
G.3
.
G.5
Summary
This appendix establishes the smoothness pillar of PBKV’s algorithms-with-predictions guarantee along four layers: identification of
SCORE
⁡
(
c
)
\mathrm{SCORE}(c)
as the expected discounted miss count under the eviction-only abstraction (Lemma
G.1
), per-node score Lipschitz continuity (Lemma
G.2
), pairwise ranking stability (Corollary
G.3
), and cost-level regret on the resulting proxy cost (Theorem
G.4
). All Lipschitz-type results share a single
K
K
-independent multiplier
1
/
(
2
​
(
1
−
γ
)
)
1/\bigl(2(1-\gamma)\bigr)
, independent of
|
𝒲
act
|
|\mathcal{W}_{\mathrm{act}}|
and the cache size. By analyzing eviction quality under the same eviction-only abstraction adopted in classical caching theory, the analysis treats PBKV’s eviction policy as a self-contained component decoupled from any specific storage-hierarchy mechanism. This justifies treating the predictor as a pluggable module in PBKV’s design (Section
4.2
): any future improvement in predictor accuracy directly tightens all bounds, and the bounds themselves remain meaningful in deployments without second-tier storage.
---
title: 'Act While Thinking: Accelerating LLM Agents via Pattern-Aware Speculative
  Tool Execution'
id: act-while-thinking-accelerating-llm-agents-via-pattern-aware-speculative-tool-ex
tags:
- ai-software-factory-architecture-58e4cc
- probabilistic-skill-sequencing
- agent-serving-optimization
- speculative-execution
created: '2026-10-12T08:31:42.630660Z'
updated: '2026-10-12T08:34:19.099754Z'
source: https://arxiv.org/html/2603.18897v1
source_domain: arxiv.org
fetched_at: '2026-10-12T08:31:42.628559Z'
fetch_provider: builtin
status: draft
type: note
tier: institutional
content_type: paper
deprecated: false
summary: 'ArXiv paper (Sui, Zhao, Ma, He, Wang, Li, Yang; SJTU + Microsoft Research
  + Stevens Institute, March 2026, cs.DC) introduces PASTE (Pattern-Aware Speculative
  Tool Execution), a serving-layer system that mines a developer/agent''s historical
  tool-call traces to probabilistically predict and pre-execute the next tool call(s)
  before the LLM finishes ''thinking,'' hiding tool latency behind LLM generation.
  Motivation: across Deep Research Bench, SWE-bench, and ScholarQA benchmarks, tool
  execution (not LLM generation) is the dominant latency cost — 60% of latency in
  coding tasks, 50% in deep research, 36% in scientific tasks — because the LLM-tool
  loop is strictly serial. Core abstraction is the ''Pattern Tuple'' (context, prediction,
  function, probability), which decouples control-flow prediction (which tool comes
  next, mined as discrete ''Strong Chains'' and ''Refinement Loops'' over tool-signature
  sequences) from data-flow prediction (a symbolic value-mapping function that derives
  tool arguments from prior tool outputs without invoking the LLM). Measured control-flow
  regularities: 55% of successful file_editor write/replace calls are immediately
  followed by a terminal pytest/python call (''Edit-Verify'' pattern); 38% of grep
  calls are immediately followed by file_editor (''Locate-Examine'' pattern); in DeepResearch
  tasks, 51% of tool calls follow a search-then-visit funnel. A risk-aware opportunistic
  scheduler runs speculative tool calls only on transient idle compute/memory/IO slack,
  throttled by a dynamic slack budget, and instantly preempts speculative work the
  moment real (authoritative) demand appears, so mispredictions never slow the critical
  path; a unified result cache lets authoritative requests join an already-running
  speculative execution. Evaluated against ORION (serverless DAG execution) and SpecFaaS
  (speculative serverless execution) baselines on VirtualLab, Qwen Deep Research,
  and gemini-cli agents using real Azure Functions arrival traces for realistic bursty
  load: PASTE cuts average end-to-end task completion time by up to 48.5% (p95/p99
  tail latency down 48.6%/61.9%), average speedup of 1.25x/1.32x over ORION/SpecFaaS;
  cuts average tool execution latency by up to 55.2% (1.71x/1.83x speedup over ORION/SpecFaaS);
  reduces tool-wait time by 67% versus both baselines and increases measured LLM/tool
  overlap by >10x versus SpecFaaS. The next-tool predictor itself achieves only 27.8%
  top-1 accuracy but 43.9% top-3 recall and 93.8% overall hit rate (because the scheduler
  can speculate on multiple ranked candidates within a bounded resource budget, so
  exact top-1 accuracy matters less than ranked-candidate coverage). Safety/side-effect
  audit: of >20,000 speculative actions across all workloads, 602 were flagged as
  potentially side-effecting and blocked from committing; no task produced an output
  different from authoritative-only execution. Overhead: 0.02 core-seconds CPU / 2.6MB
  memory / 0.9MB network per second of latency saved; pattern-prediction + scheduling
  overhead is under 100ms.'
utility_score: 14.0
---

Act While Thinking: Accelerating LLM Agents via Pattern-Aware Speculative Tool Execution
Title:
Content selection saved. Describe the issue below:
Description:
arXiv is now an independent nonprofit!
Learn more
×
License: CC BY-NC-ND 4.0
arXiv:2603.18897v1 [cs.DC] 19 Mar 2026
Act While Thinking: Accelerating LLM Agents via Pattern-Aware Speculative Tool Execution
Yifan Sui
Affiliation:
Shanghai Jiao Tong University
,
Shanghai
,
China
email:
suiyifan@sjtu.edu.cn
,
Han Zhao
Affiliation:
Shanghai Jiao Tong University
,
Shanghai
,
China
email:
zhaohan_miven@sjtu.edu.cn
,
Rui Ma
Affiliation:
Microsoft Research
,
Beijing
,
China
email:
mrui@microsoft.com
,
Zhiyuan He
Affiliation:
Microsoft Research
,
Beijing
,
China
email:
zhiyuhe@microsoft.com
,
Hao Wang
Affiliation:
Stevens Institute of Technology
,
Hoboken
,
NJ
,
USA
email:
hwang9@stevens.edu
,
Jianxun Li
Affiliation:
Shanghai Jiao Tong University
,
Shanghai
,
China
email:
lijx@sjtu.edu.cn
and
Yuqing Yang
Affiliation:
Microsoft Research
,
Redmond
,
WA
,
USA
email:
yuqyang@microsoft.com
2026
Abstract.
LLM-powered agents are emerging as a dominant paradigm for autonomous task solving. Unlike standard inference workloads, agents operate in a strictly serial “LLM-tool” loop, where the LLM must wait for external tool execution at every step. This execution model introduces severe latency bottlenecks. To address this problem, we propose PASTE, a
P
attern-
A
ware
S
peculative
T
ool
E
xecution method designed to hide tool latency through speculation. PASTE is based on the insight that although agent requests are semantically diverse, they exhibit stable application level control flows (recurring tool-call sequences) and predictable data dependencies (parameter passing between tools). By exploiting these properties, PASTE improves agent serving performance through speculative tool execution. Experimental results against state of the art baselines show that PASTE reduces average task completion time by 48.5% and improves tool execution throughput by 1.8
×
\times
.
1.
Introduction
Figure 1
.
Example patterns observed in execution of (a) deep research agents and (b) coding agents. Patterns indicate not only tool invocations in the near future but also latent data dependencies between tool calls (orange lines in this figure).
As large language models (LLMs) continue to improve their reasoning and understanding capabilities, LLM-powered agents have emerged as a major research focus
(
Moonshot AI, 2025
;
, 2025
;
, 2025
;
, 2025
;
, 2025
)
. As exemplified by OpenAI Deep Research
(
OpenAI, 2025
)
and Manus
(
Manus, 2025
)
, the LLM acts as the “brain” of the agent. It decomposes a complex task into a sequence of sub-steps and invokes external tools at each step to interact with the outside world. By lowering the barrier to using powerful and complex tools, agents are widely expected to drive the productivity revolution. As a result, many companies have invested tens of billions of dollars in this line of research and development
(
Luo et al., 2025
;
Zhang et al., 2026
;
Giusti et al., 2025
)
.
Motivation.
Figure
1
illustrates a typical workflow of a modern LLM-powered Agent. As shown, the LLM alternates between generating text and making external tool calls. These two steps operate strictly serially, as they have inherent dependencies. Our experimental results in §
2.2.2
show that tool execution accounts for 35% to 61% of total request time. This execution model forces LLMs to hold expensive memory resources, yet still delivers long end-to-end latency. These inefficiencies significantly hinder the rapid deployment and continued evolution of agent serving systems.
Limitation of state-of-the-art approaches.
Although numerous existing works
(
Mahgoub et al., 2022
;
Stojkovic et al., 2023
;
Fu et al., 2024
)
have attempted to optimize the startup of agent serving systems, they either focus solely on tool startup optimization
(
Mahgoub et al., 2022
;
Joosen et al., 2025
;
Liu et al., 2024
)
and execution environment optimization or on general LLM serving system optimization
(
Prabhu et al., 2024
;
Cai et al., 2024
)
. Specifically, optimizing the execution environment warmup (Docker and Conda) only addresses one-time startup overhead, which accounts for an extremely small portion of the total execution time. Similarly, general LLM serving system optimizations fail to reduce tool execution time, the primary contributor to end-to-end latency as indicated by our experiments.
Opportunities.
Faced with the aforementioned problems, we identify an opportunity to optimize tool execution. Specifically, we can adopt speculative execution to pre-execute tools, thereby reducing the proportion of tool execution time in the overall execution process. For example, in a deep research task, after acquiring relevant URLs, we can directly download these web pages in advance to reduce the time consumed by web page downloading.
Challenges.
However, leveraging the aforementioned opportunity is non-trivial. Since LLM requests are unique, it is highly challenging to quickly and accurately predict the next tool to be used. More importantly, merely predicting the tool is insufficient; we also need to predict the parameters required by the tool, which is even more challenging. Furthermore, inaccurate pre-execution could disrupt the original agent execution workflow, which poses another challenge to integrate tool pre-execution in the current system design.
Key insights and contributions.
To address these challenges, we propose
P
attern-
A
ware
S
peculative
T
ool
E
xecution (
PASTE
), a method that accelerates agent serving by leveraging speculative tool execution. The design is motivated by two key observations about agent workloads. First, tool invocations exhibit strong application-level control flow (recurring tool-call sequences). For example, a
git clone
operation is almost always followed by
git checkout
. Second, tool parameters follow predictable data flow patterns, where arguments are implicitly derived from the outputs of earlier tools. As one example, the URL required by a
download
tool is typically extracted directly from the JSON output produced by a preceding
search
operation.
Operationalizing these insights, however, requires solving two fundamental problems: formalizing unstructured tool-call sequences and managing the risks of probabilistic execution.
PASTE
addresses these through two components: a novel pattern abstraction that decouples control flow from data flow, and a risk-aware scheduler that preserves the execution performance of authoritative tools.
To resolve the formalization problem,
PASTE
introduces the
Pattern Tuple
(context, prediction, function, probability). This abstraction achieves robustness by strictly separating execution
structure
from execution
content
. While agents may solve similar problems using diverse natural language phrasing, the tuple defines context strictly over event signatures (sequences of tool types), allowing the system to identify stable control flows amidst volatile user inputs. Furthermore, the tuple utilizes a symbolic value mapping function to encode the logical relationships between data, enabling the system to automatically resolve implicit parameter passing between tools without invoking the LLM.
To manage execution risk at runtime, the PASTE scheduler strictly partitions the workload into authoritative invocations and speculative invocations. It employs
opportunistic scheduling
: speculative jobs run
only
on slack resources (i.e., transient idle compute/memory/IO capacity) and are throttled by a dynamic slack budget, so they can harvest otherwise-wasted cycles without competing with the normal LLM inference or critical-path tool execution. Critically, PASTE guarantees non-interference by instantaneously preempting speculative work the moment resource contention arises, ensuring that mispredictions never slow down authoritative progress.
Experimental methodology and artifact availability
Our evaluation demonstrates that
PASTE
effectively improves the end-to-end latency of LLM agents. Compared to state-of-the-art baselines,
PASTE
reduces the average task completion time by 48.5% and accelerates average tool execution by 1.8
×
\times
.
PASTE
will be open-sourced after review.
The main contributions of this paper are as follows:
•
Characterization of Agent Latency.
We characterize modern LLM agent workloads, identifying the serial dependency between LLM inference and tool invocation as the dominant latency bottleneck.
•
Pattern-Driven Speculation.
We introduce a Pattern Analyzer that abstracts dynamic agent behaviors into stable application-level invocation sequences and implicit parameter derivation rules, enabling accurate prediction of future tool calls.
•
Resource-Aware Orchestration.
We design an Online Scheduler that dynamically leverages these patterns to launch speculative tool execution within available compute budgets, effectively parallelizing tool processing with LLM generation.
2.
Background and Motivation
2.1.
The LLM Agent Basics
2.1.1.
The Era of LLM Agents
The evolution of Large Language Models (LLMs) has shifted the computing paradigm from static text generation to autonomous problem solving, including deep research
(
OpenAI, 2025
;
Moonshot AI, 2025
)
, bug-fix assistance
(
, 2025
;
, 2025
)
, and agent employee
(
, 2025
;
Manus, 2025
)
. While standard LLM inference treats the model as a function
f
⁡
(
t
​
e
​
x
​
t
)
→
t
​
e
​
x
​
t
f(text)\to text
, LLM Agents reframe the model as the cognitive core of a broader control loop. An agent is defined not just by its underlying model, but by its ability to orchestrate multi-step tasks through the use of external tools (e.g., Python interpreters, web retrieval APIs, vector databases) and long-term memory.
This shift has profound implications for system design. Unlike traditional inference workloads that are relatively short and independent, agent workloads are long-running, stateful, and highly sequential. A single user request (e.g., “Analyze this dataset and plot the trends”) triggers many intermediate reasoning steps and tool executions that may span minutes. Consequently, the system must transition from optimizing individual request latency (Time-to-First-Token) to optimizing the end-to-end latency.
Figure 2
.
Workflow of LLM agent.
2.1.2.
The Agent Execution Model
LLM agents naturally follow an
Iterative LLM–Tool Loop
, as shown in
Figure 2
. In each iteration, the LLM is conditioned on the current context and execution history, and then either (i) emits the final answer and terminates, or (ii) decides to invoke a tool with concrete parameters. If a tool is invoked, the system executes the call, appends the tool output back into the session state, and resumes LLM inference on the updated context.
This loop repeats until the LLM determines that enough evidence has been gathered and produces the final result as the session output. From a system perspective, end-to-end latency is jointly determined by LLM inference and tool execution.
2.2.
Problems and Challenges
2.2.1.
Problems of Current Agents
The execution time of LLM agents can be divided into two parts, LLM generation and tool execution. We first measure the time spent in these two parts using three mainstream agent benchmarks (Deep Research Bench
(
Du et al., 2025
)
, SWE Bench
(
Jimenez et al., 2024
)
, ScholarQA
(
Asai et al., 2024
)
). These benchmarks all cover the three dominant application domains of deep research, bug-fix assistance, and scientific research. Our experimental setup uses three main-stream agent products, with both LLM API (Gemini-2.5, GPT-5.2), and a local deployed Qwen-DeepResearch-30B
(
Team, 2025
)
model on a server with 8 NVIDIA A100-80G GPUs.
3(a)
shows the latency breakdown of representative requests from these benchmarks. The results show that tool execution constitutes a substantial portion of the total request lifetime. On average, tool execution accounts for 60% of the latency in coding tasks, 50% in deep research tasks, and 36% in scientific tasks. This observation remains consistent across all three benchmarks. As discussed earlier, the LLM generation and tool execution are strictly serialized because of inherent data dependencies. As a result, the large overhead of tool execution becomes a direct bottleneck, leading to suboptimal end-to-end latency for the overall system.
((a))
Agent time breakdown
(LLM vs. tools)
((b))
Tool time breakdown
(init vs. execution)
Figure 3
.
Time Breakdown of Agent and Tools
2.2.2.
Inefficiencies of Current Approaches
Existing serverless workflow, and microservice optimizations typically require a
static
, end-to-end execution graph (often a DAG) to make scheduling decisions and optimize caching and data movement
(
Liu et al., 2023
;
Zhang et al., 2024
;
Zhang et al., 2025b
;
Marcelino and Nastic, 2024
;
Wu et al., 2024
;
Marcelino et al., 2025
)
. When these systems perform prediction, it is largely conditioned on the complete static DAG (i.e., predicting the next branch or request given the graph).
This assumption breaks for agentic workloads: the control flow is generated online, and the next tool call is not known until the LLM finishes the current step. Without the full DAG a priori, ahead-of-time scheduling and graph-based prefetching provide limited benefit.
Prior work has focused on cold start mitigation and environment reuse
(
Joosen et al., 2025
;
Sui et al., 2026
;
Liu et al., 2024
)
. However, in our agent traces, initialization typically accounts for less than 20% of overall tool latency. In addition, speculation in agent workloads is constrained by tool side effects and a large, context dependent argument space. Prior works are ineffective in the agent serving scenario
(
Stojkovic et al., 2023
;
Ye et al., 2025
)
.
2.2.3.
Opportunities and Challenges
First, predicting the next tool to be used is highly challenging. Unlike traditional branch prediction in CPUs, which operates over a limited and well structured set of instructions, agent requests are highly diverse and unstructured. It is therefore difficult to design a simple method that can achieve highly accurate tool prediction. If the predictor fails to identify the tool invocation earlier than the LLM itself, speculation provides no performance benefit.
Second, predicting the next tool alone is not sufficient. The system must also accurately predict the exact input parameters required by that tool. This intent plus argument prediction is computationally difficult because the arguments, such as specific code snippets, file paths, or search queries, are often generated on the fly and depend heavily on the current context.
Third, integrating pre-execution is complicated by the state mutating nature of agent tools. Unlike read only operations, inaccurate pre-execution can corrupt the environment, such as by installing incompatible dependencies, and disrupt the original workflow. Restoring consistency then requires expensive rollback mechanisms and intricate system design.
2.3.
Observations and Insights
Figure 4
.
Histogram of tool execution time. Blue bars represent tool calls whose arguments are derived from the prompt or outputs of previous tools, while orange bars represent tool calls with LLM-generated arguments.
To solve the above challenge, we conduct a comprehensive characterization study of agent requests from SWE-bench, MetaGPT and OpenHands benchmarks. Our analysis reveals that while agent behavior appears non-deterministic at a macro level, it exhibits strong temporal locality and data-flow dependencies at the micro-level. These characteristics provide the primitives necessary for speculative execution.
2.3.1.
Insight 1: Predictable Control Flow Patterns
Contrary to the assumption that agents select tools randomly, we observe that tool invocations follow distinct, domain-specific state transition probabilities. We categorize these transitions into “Strong Chains” (deterministic sequences) and “Refinement Loops” (iterative patterns).
The “Edit-Verify” and “Locate-Examine” Patterns in Coding.
In bug-fix assistance tasks, agents act as state machines driven by the codebase status.
(1) Edit-Verify Pattern: This is the strongest correlation observed. Among all coding traces, 55% of successful
file_editor
tool calls (write/replace) were immediately followed by a
terminal
tool call (specifically pytest or python execution). This reflects a fundamental workflow: modification necessitates validation.
(2) Locate-Examine Pattern: During the debugging phase, we observe a causal link between output discovery and file access. Among all coding traces, 38% of
grep
tool calls were immediately followed by
file_editor
tool call.
The “Search-Visit” Pattern in Research.
In DeepResearch tasks, the control flow follows a funnel structure—starting broad and narrowing down. 51% of tool calls
search
10 related results, and then immediately trigger a tool call to
visit
the top 3-4 URLs. In addition, when a website was fetched via tool
web_fetch
, it would
pre_fetch
other URLs embedded within that website. This occurred in 20% of
web_fetch
calls.
Implication for agent system design.
The high transition probability between these states suggests that the next tool prediction is feasible. We can utilize high-probability tool call patterns to accelerate the tool calling.
2.3.2.
Insight 2: Implicit Data Flow and Parameter Derivation
Predicting the next tool is insufficient; speculative execution also requires predicting the tool parameters. A key finding of our study is that not all tool parameters are "hallucinated" by the LLM from scratch; they could be derived from the output of previous tools. Moreover, as shown in Figure
4
, tool calls that use arguments derived from the prompt or previous tool outputs are generally more time
-
consuming.
(1) Producer-Consumer Pattern: In web tasks, the
visit
call requires a URL. In 95% of cases, this URL is a strict substring of the JSON output from the preceding
search
call. Agents typically select URLs containing query keywords, such as matching the term Prometheus in the page title for a Prometheus-related query. In coding tasks, the
file_editor
requires a filename, which could be distilled directly from the output of a prior
grep
call.
(2) Repetitive-Debug Pattern: In coding tasks, agents follow an iterative debugging loop that involves file edits and environment modifications. After completing a fix, the agent immediately executes the program to verify the result, which creates a tight edit verify dependency cycle.
Implication for agent system design:
This observation enables Argument Prediction. Instead of generating arguments token-by-token (which is slow),
PASTE
can identify "candidate arguments" (URLs, filenames) from the execution history and speculatively execute on the most likely candidates.
2.3.3.
Insight 3: Latent Parallelism in Serial Agent Execution
While standard agent frameworks (e.g., ReAct) force serial execution, our analysis reveals significant opportunities for parallelism.
(1) Broad Search Pattern: Once the LLM determines the keywords, we find that agents often issue multiple search queries that span Arxiv, PubMed, and Google Scholar. The search process could be parallelized.
(2) Batch Fetch Pattern: Upon receiving the search results, the agents need to fetch the landing pages, PDFs, and code repositories in a sequential way. Similarly, when a code execution error occurs, the agent sequentially opens all relevant code files. The above processes could also be parallelized.
Implication for agent system design:
The logical workload is not strictly serial. By identifying
independent sub-tasks
(like fetching multiple URLs or reading multiple files) via speculation,
PASTE
can break the strict ReAct loop and saturate the otherwise idle network/IO resources.
3.
Overview
Figure 5
.
System architecture of
PASTE
.
To address the latency bottlenecks inherent in sequential agent execution, we present
PASTE
, a method designed to accelerate agent serving using speculative tool calling.
PASTE
operates on the insight that while agent behaviors are non-deterministic at the request-level, they exhibit stable application level control
flows (recurring tool-call sequences) and predictable data dependencies (parameter passing between tools).
However, transforming these insights into a practical system requires solving two fundamental problems:
formalizing unstructured agent dependencies
and
managing the risks of probabilistic execution
. As shown in
Figure 5
,
PASTE
addresses these through two core components: a pattern abstraction that decouples control flow from data flow, and a scheduler that decouples speculative tool execution from authoritative tool paths.
3.1.
Abstraction
The first problem lies in representation: How do we formalize the relationships between tools and the flow of parameters in a way that is embeddable into a generic agent system? Hard-coding dependencies (e.g., "always run
g
​
i
​
t
​
c
​
l
​
o
​
n
​
e
git\ clone
after
s
​
e
​
a
​
r
​
c
​
h
search
") is brittle because agent requests are diverse; the validity of a dependency often hinges on the specific context and data available.
To capture these dynamics,
PASTE
introduces the
Pattern Tuple
(context, tool prediction, function, probability). This abstraction first enables robustness by separating the execution structure from the execution content. While agents often solve similar problems using different natural language phrasing, the tuple defines the context strictly over event signatures (sequence of tool types) to identify stable control flows despite this noise.
Secondly, the pattern tuple supports late-binding value resolution. A major hurdle in speculation is parameter passing, since a tool cannot be executed without its arguments. Rather than predicting concrete values, which often leads to hallucination,
PASTE
predicts a value mapping function (the third element in the tuple). This function encodes the logical relationships between data.
3.2.
Scheduling
The second problem is operational: How do we schedule predictions that are inherently uncertain? While application-level dependencies exist (e.g.,
g
​
i
​
t
​
c
​
l
​
o
​
n
​
e
git\ clone
usually follows
r
​
e
​
p
​
o
​
s
​
e
​
a
​
r
​
c
​
h
repo\ search
), they are probabilistic (
p
<
1
p<1
). Blindly executing every predicted tool would lead to severe resource contention and waste. To solve this,
PASTE
employs scheduling with opportunistic speculation. This design treats speculation not as a mandate, but as a mechanism for harvesting slack resources. The scheduler is designed by two principles: strict prioritization with isolation and the promotion mechanism.
The scheduler partitions the workload into authoritative invocations (generated by the agent, correctness-critical) and speculative Invocations (generated by
PASTE
, best-effort). Authoritative jobs are given strict priority and preemption capability. Speculative jobs are confined to a dynamic slack budget, which allows them to hide latency when resources are available.
PASTE
also ensures they are immediately suppressed when contention arises.
To maximize efficiency,
PASTE
implements a promotion protocol. When an authoritative request arrives and matches a running speculative job, that job is immediately promoted. It moves from low priority to high priority, and its result is committed directly to the agent history. This mechanism allows
PASTE
to safely convert uncertain bets into guaranteed latency reductions without redundant computation.
4.
Pattern Abstraction
To operationalize the formalization of probabilistic dependencies,
PASTE
centers its design on the
Pattern Tuple
. This abstraction is defined to isolate structural regularity(control flow) from parameter dependencies (data flow). By doing so, the system can generalize across diverse agent sessions while preserving precise execution semantics.
4.1.
The Pattern Tuple
Table 1
.
An example pattern definition
C
C
T
T
f
f
p
p
P1
[(Search, success)]
Web_fetch
Web_fetch: arg0 =
SearchRes["list"][0]["url"]
0.9
P2
[(Search, success),
(Web_fetch, fail)]
Web_fetch
Web_fetch: arg0 =
SearchRes["list"][1]["url"]
0.8
We define a speculative pattern
𝒫
\mathcal{P}
as a tuple
(
C
,
T
,
f
,
p
)
(C,T,f,p)
.
Table 1
presents two concrete pattern definitions, P1 and P2, for a deep research agent. We explain the four components in the following paragraphs using these two examples.
(1) Context
C
C
(Control Flow Anchor).
C
C
defines the structural precondition for a prediction and is modeled as an order-preserving subsequence of event signatures. Each signature contains only event metadata, such as the tool type and execution status, and intentionally excludes high variance payloads like specific query strings.
This payload agnostic design ensures robustness through signature matching. For example, in Pattern P1 shown in
Table 1
, the context
[
(
S
​
e
​
a
​
r
​
c
​
h
,
s
​
u
​
c
​
c
​
e
​
s
​
s
)
]
[(Search,success)]
matches any successful search operation, independent of whether the query concerns “distributed systems” or “quantum physics”. By removing natural language variability,
PASTE
is able to identify stable control flows that are shared across different users and tasks.
(2) Target
T
T
(Prediction).
T
T
specifies the type of the future tool invocation and represents the agent intent before the LLM explicitly generates it. In P1, the target
W
​
e
​
b
​
_
​
f
​
e
​
t
​
c
​
h
Web\_fetch
indicates that after a successful search, the agent intends to retrieve a webpage.
(3) Value Mapping Function
f
f
(Data Flow Logic).
f
f
encodes the dependency logic required for late-binding value resolution. Instead of predicting concrete argument values (which risks hallucination),
f
f
is a symbolic function that specifies how to derive arguments from the payloads of historical events in
C
C
. This design captures the producer consumer relationships that commonly arise in agent workloads.
In P1,
f
f
is defined as
a
​
r
​
g
​
0
=
S
​
e
​
a
​
r
​
c
​
h
​
R
​
e
​
s
​
[
"
​
l
​
i
​
s
​
t
​
"
]
​
[
0
]
​
[
"
​
u
​
r
​
l
​
"
]
arg0=SearchRes["list"][0]["url"]
, which means that the URL for the fetch tool is derived dynamically from the first result of the preceding search. Pattern P2 handles a failure case in a similar way. When the first fetch fails, as indicated by (
W
​
e
​
b
​
_
​
f
​
e
​
t
​
c
​
h
,
f
​
a
​
i
​
l
Web\_fetch,fail
) in
C
C
,
f
f
adapts by selecting the second URL (
i
​
n
​
d
​
e
​
x
​
[
1
]
index[1]
). This function is evaluated lazily at runtime, which allows
PASTE
to generate precise parameters as soon as the required upstream data becomes available.
(4) Probability
p
p
(Confidence Metric).
p
p
represents the empirical success rate of a pattern and is derived from validation over historical traces. This score turns prediction from a binary decision into a graded signal. For example, P1 has a confidence of 0.9, while the fallback pattern P2 has a confidence of 0.8. This distinction allows the risk aware scheduler to favor high confidence speculations as
p
p
approaches one, while deprioritizing weaker ones. As a result, the system allocates resources based on expected utility rather than treating all predictions equally.
4.2.
Pattern Mining and Validation
Algorithm 1
Pattern Mining and Validation in
PASTE
Input:
Execution traces
ℰ
\mathcal{E}
, max context length
k
k
, min support
σ
\sigma
, confidence threshold
τ
\tau
Output:
Pattern set
𝒫
\mathcal{P}
1
𝒫
←
∅
\mathcal{P}\leftarrow\emptyset
//
Step 0: Extract event signatures (temporal order preserved)
2
𝒮
←
ExtractEventSignatures
​
(
ℰ
)
\mathcal{S}\leftarrow\text{ExtractEventSignatures}(\mathcal{E})
3
𝒯
←
UniqueToolInvocationEventSignatures
​
(
𝒮
)
\mathcal{T}\leftarrow\text{UniqueToolInvocationEventSignatures}(\mathcal{S})
4
foreach
t
∈
𝒯
t\in\mathcal{T}
do
//
Step 1: Mine frequent structural contexts preceding tool
t
t
//
extracts all sequences of length
≤
k
\leq k
immediately preceding
t
t
5
𝒟
t
←
CollectPrecedingSignatures
​
(
𝒮
,
t
,
k
)
\mathcal{D}_{t}\leftarrow\text{CollectPrecedingSignatures}(\mathcal{S},t,k)
6
if
|
𝒟
t
|
<
σ
|\mathcal{D}_{t}|<\sigma
then
7
continue
//
Skip tools with insufficient support
8
Q
←
MineFrequentSubsequences
​
(
𝒟
t
)
Q\leftarrow\text{MineFrequentSubsequences}(\mathcal{D}_{t})
9
foreach
c
∈
Q
c\in Q
do
//
Step 2: Infer value mapping for
(
c
→
t
)
(c\rightarrow t)
10
ℳ
←
MatchOccurrences
(
ℰ
,
c
→
t
)
\mathcal{M}\leftarrow\text{MatchOccurrences}(\mathcal{E},c\rightarrow t)
11
f
←
InferValueMapping
​
(
ℳ
)
f\leftarrow\text{InferValueMapping}(\mathcal{M})
//
Step 3: Validate and score the pattern
12
𝒞
←
MatchOccurrences
​
(
ℰ
,
c
)
\mathcal{C}\leftarrow\text{MatchOccurrences}(\mathcal{E},c)
13
if
f
≠
∅
f\neq\varnothing
then
//
retaining only those occurrences where
f
f
holds
14
ℳ
⋆
←
FilterByValueMapping
​
(
ℳ
,
f
)
\mathcal{M}^{\star}\leftarrow\text{FilterByValueMapping}(\mathcal{M},f)
15
else
16
ℳ
⋆
←
ℳ
\mathcal{M}^{\star}\leftarrow\mathcal{M}
17
p
←
|
ℳ
⋆
|
/
|
𝒞
|
p\leftarrow{|\mathcal{M}^{\star}|}/{|\mathcal{C}|}
18
if
p
≥
τ
p\geq\tau
then
19
Add pattern
(
c
,
t
,
f
,
p
)
(c,t,f,p)
to
𝒫
\mathcal{P}
20
return
𝒫
\mathcal{P}
Constructing the pattern pool requires distinguishing between structural regularities (which are frequent but coarse) and valid parameter flows (which are precise but hard to verify). To achieve this,
PASTE
employs a Two-Phase Mining Strategy (summarized in
algorithm 1
) that explicitly mirrors the abstraction’s decoupling of control flow and data flow.
4.2.1.
Phase I: Structural Mining (The "Where")
The process starts by treating execution traces as streams of event signatures. As shown in
algorithm 1
(line 2),
PASTE
removes high cardinality payload data, which reduces the search space to a small set of tool types. For each unique tool invocation type
t
t
, the system aggregates the preceding signature sequences (line 5) and applies sequential pattern mining (e.g., PrefixSpan) to identify recurring short horizon subsequences (line 8). This phase filters out low frequency noise (lines 6-7) and establishes candidate contexts
C
C
and targets
T
T
based solely on control flow. Because it ignores payloads, this approach remains lightweight and scalable even when applied to massive execution logs.
4.2.2.
Phase II: Symbolic Dependency Inference (The "How")
In the second phase,
PASTE
infers a value mapping function
f
f
(line 11) to realize
late-binding value resolution
: it explains how the arguments of the predicted tool
T
T
can be derived directly from the payloads in
C
C
. To keep inference simple,
PASTE
only considers a few recurring transformations that we repeatedly observe in agent traces: (i) field/path lookup in a structured result (e.g.,
S
​
e
​
a
​
r
​
c
​
h
​
R
​
e
​
s
​
[
"
​
l
​
i
​
s
​
t
​
"
]
​
[
i
]
​
[
"
​
u
​
r
​
l
​
"
]
SearchRes["list"][i]["url"]
), (ii) choosing an element by index with a fallback (e.g., use the first result; if it fails, try the next), and (iii) basic string formatting/normalization when passing values across tools. If such an
f
f
is found, the pattern becomes fully parameterized; otherwise, it predicts only the tool type.
4.2.3.
Validation
Finally, the algorithm validates each candidate tuple
(
C
,
T
,
f
)
(C,T,f)
against the trace dataset to estimate its reliability.
PASTE
computes the empirical success probability
p
p
(line 17), defined as the fraction of context matches in which the predicted invocation actually occurred and satisfied the value mapping
f
f
. Patterns with confidence below the threshold
τ
\tau
are discarded (lines 18-19), which ensures that the runtime is not burdened with low-probability speculation.
4.3.
Online Pattern Prediction
Algorithm 2
Runtime Pattern Prediction
Input:
Recent execution events
E
=
⟨
e
1
,
…
,
e
k
⟩
E=\langle e_{1},\ldots,e_{k}\rangle
;
Pattern pool
𝒫
=
{
(
C
i
,
T
i
,
f
i
,
p
i
)
}
\mathcal{P}=\{(C_{i},T_{i},f_{i},p_{i})\}
;
Historical statistics table
H
H
Output:
Predicted tool invocations
𝒯
\mathcal{T}
with probability
1
𝒯
←
∅
\mathcal{T}\leftarrow\emptyset
2
foreach
pattern
(
c
,
t
,
f
,
p
)
∈
𝒫
(c,t,f,p)\in\mathcal{P}
do
3
E
C
←
MatchOccurrences
​
(
E
,
c
)
E_{C}\leftarrow\text{MatchOccurrences}(E,c)
4
if
E
C
≠
∅
E_{C}\neq\emptyset
then
5
a
←
f
⁡
(
E
C
)
a\leftarrow f(E_{C})
6
e
p
​
r
​
e
​
d
←
CreateEvent
​
(
t
,
a
)
e_{pred}\leftarrow\text{CreateEvent}(t,a)
//
with signature and args
7
Add
(
e
p
​
r
​
e
​
d
,
p
)
(e_{pred},p)
to
𝒯
\mathcal{T}
8
return
𝒯
\mathcal{T}
At runtime,
PASTE
uses the validated pattern pool to perform continuous, non-blocking prediction of near-future tool invocations, as detailed in
algorithm 2
. The process operates incrementally on the live event stream and updates predictions without interrupting the agent’s critical execution path.
4.3.1.
Context Matching (Control Flow)
When each new event arrives,
PASTE
updates a bounded window of recent execution events
E
E
(line 1). The system then iterates over the pattern pool and identifies all patterns whose context
C
C
matches a suffix of the observed event signatures (line 3). This matching relies only on metadata and preserves temporal order, which ensures that predictions are triggered only under execution conditions that are consistent with historical observations. Because multiple patterns may match the current state,
PASTE
generates candidate predictions for all matches without performing early arbitration.
4.3.2.
Function Evaluation (Data Flow)
For each matched pattern
(
C
,
T
,
f
,
p
)
(C,T,f,p)
,
PASTE
attempts to evaluate the associated value mapping function
f
f
against the concrete payloads of the matched events
E
C
E_{C}
(line 5). This step connects the abstract structure with executable actions. Depending on whether the required inputs are available in
E
C
E_{C}
, the evaluation produces a predictive event
e
p
​
r
​
e
​
d
e_{pred}
(line 6). This event may be a fully specified tool invocation, a partially parameterized invocation, or only the tool identity.
4.3.3.
Probabilistic Hint Generation
Finally, the resulting predictive invocation is annotated with the empirical probability
p
p
learned during offline validation (line 7). These annotated predictions are collected into the set
𝒯
\mathcal{T}
and passed to the scheduler as probabilistic look ahead hints. This design allows the scheduler to weigh the expected utility of each speculation against its resource cost, using the confidence score
p
p
as the primary factor.
5.
Scheduling with Opportunistic Speculation
Algorithm 3
Scheduling with Opportunistic Speculation
Input:
JobTable
𝒥
\mathcal{J}
, AvailableResources
R
R
, SpecResourcesBudget
B
B
Output:
Scheduling decisions
1
while
PendingJobsExist
(
𝒥
\mathcal{J}
)
do
2
J
r
←
J_{r}\leftarrow
FilterPendingAuthoritativeJobs(
𝒥
\mathcal{J}
)
//
Step 1: Confirm speculative jobs if possible
3
foreach
j
∈
𝒥
j\in\mathcal{J}
do
4
s
←
s\leftarrow
FindMatchingSpecJob(
j
j
)
5
if
s
≠
∅
s\neq\varnothing
then
6
ConfirmSpecJob(s, j)
7
J
r
←
J
r
∖
{
j
}
J_{r}\leftarrow J_{r}\setminus\{j\}
//
Step 2: Ensure resources for real jobs
8
while
RequiredResources
(
J
r
J_{r}
) >
R
R
do
9
j
←
j\leftarrow
PreemptSpecJob(
J
J
)
10
if
j
=
∅
j=\varnothing
then
11
break
12
AbortJob(
j
j
)
13
ReleaseResources(
j
j
,
R
R
)
//
Step 3: Primary scheduling of real jobs
14
while
J
r
≠
∅
J_{r}\neq\emptyset
do
15
j
←
j\leftarrow
PrimaryScheduling(
J
r
J_{r}
,
R
R
)
16
AllocateResources(
j
j
,
R
R
)
17
LaunchJob(
j
j
)
18
J
r
←
J
r
∖
{
j
}
J_{r}\leftarrow J_{r}\setminus\{j\}
//
Step 4: Opportunistic scheduling of speculative jobs
19
J
s
←
J_{s}\leftarrow
FilterPendingSpecJobs(
𝒥
\mathcal{J}
)
20
while
J
s
≠
∅
J_{s}\neq\emptyset
and
R > 0
and
B > 0
do
21
j
←
j\leftarrow
OpportunisticSpecScheduling(
J
s
J_{s}
,
R
R
,
B
B
)
22
AllocateResources(
j
j
,
R
R
)
23
LaunchJob(
j
j
)
24
B
←
B
−
ResourceCost
​
(
j
)
B\leftarrow B-\textnormal{ResourceCost}(j)
25
J
s
←
J
s
∖
{
j
}
J_{s}\leftarrow J_{s}\setminus\{j\}
The performance of
PASTE
is largely determined by how effectively it schedules tool executions under uncertainty.
Unlike conventional cluster schedulers,
PASTE
must continuously arbitrate between two classes of tool invocations:
authoritative invocations
, which are issued by the agent’s actual execution and are correctness-critical, and
speculative invocations
, which are generated by the pattern predictor with associated uncertainty and may never be consumed.
The scheduler’s objective is to maximize the expected reduction in future tool latency by exploiting idle resources,
while strictly guaranteeing that authoritative invocations are never delayed, reordered, or otherwise affected by speculation.
Algorithm
3
illustrates how
PASTE
achieves this objective through opportunistic speculation.
At each scheduling decision point, authoritative invocations are always prioritized via the existing scheduling policy,
denoted as
PrimaryScheduling
. Speculative invocations are treated as best-effort tasks: they may only execute on
resources not required by authoritative work and are immediately preempted when contention arises.
This design ensures non-interference with the agent’s normal execution while enabling aggressive latency hiding.
The scheduling process proceeds in four stages.
First, when an authoritative invocation arrives, the scheduler first checks whether a matching speculative job already exists.
If the speculative execution has completed,
PASTE
directly reuses its result, eliminating redundant execution.
If the speculative execution is still in progress,
PASTE
promotes
the running speculative job to authoritative:
the execution continues without interruption, its result is committed upon completion, and the job becomes non-preemptible.
In both cases, the authoritative invocation is satisfied without launching a new execution.
This promotion mechanism allows
PASTE
to safely harvest ongoing speculative work while preserving correctness and minimizing response latency.
Second, before scheduling any new work, the scheduler ensures that sufficient resources are available for all pending
authoritative jobs by preempting speculative jobs if necessary.
Third, authoritative jobs are scheduled according to the existing primary policy without modification.
Finally, if slack resources remain within a predefined speculative resource budget
B
B
, the scheduler opportunistically
dispatches speculative jobs.
Overall, this design guarantees that existing scheduling objectives for authoritative invocations are preserved,
while speculative invocations are confined to slack resources and remain opportunistic, best-effort, and preemptible by construction.
5.1.
Opportunistic Speculative Scheduling
The goal of speculative scheduling in
PASTE
is to utilize transient slack resources to proactively execute predicted tool invocations, thereby reducing the latency of future authoritative executions, while strictly preserving isolation and performance guarantees for real agent-driven invocations.
Before enqueuing speculative actions, the scheduler preprocesses predicted tool invocations according to the speculation eligibility policy, merging duplicate predictions and discarding those that violate safety or side-effect constraints. Only policy-compliant speculative actions are admitted for opportunistic execution and prioritized based on their expected performance benefit.
At each scheduling decision point, the scheduler observes the available slack resources
R
slack
R_{\text{slack}}
, defined as the residual capacity after all authoritative jobs have been admitted, together with a speculation budget
B
B
that caps the total resources allocable to speculative execution.
Let
𝒥
s
\mathcal{J}_{s}
denote the set of pending speculative jobs generated by the pattern predictor.
Each speculative job
j
∈
𝒥
s
j\in\mathcal{J}_{s}
is characterized by a predicted consumption probability
p
j
∈
(
0
,
1
]
p_{j}\in(0,1]
, an estimated latency reduction
T
j
T_{j}
if the speculative result is eventually consumed, an estimated resource cost
c
j
c_{j}
, and an expected execution duration
d
j
d_{j}
.
The speculative scheduling decision is to select a subset of jobs for execution.
We introduce a binary decision variable
x
j
∈
{
0
,
1
}
x_{j}\in\{0,1\}
for each
j
∈
𝒥
s
j\in\mathcal{J}_{s}
, where
x
j
=
1
x_{j}=1
indicates that job
j
j
is admitted for speculative execution.
The objective can be formulated as the following constrained maximization problem:
(1)
max
\displaystyle\max
∑
j
∈
𝒥
s
x
j
⋅
p
j
⋅
T
j
\displaystyle\sum_{j\in\mathcal{J}_{s}}x_{j}\cdot p_{j}\cdot T_{j}
s.t.
\displaystyle\text{s.t.}
∑
j
∈
𝒥
s
x
j
⋅
c
j
≤
min
⁡
(
R
slack
,
B
)
.
\displaystyle\sum_{j\in\mathcal{J}_{s}}x_{j}\cdot c_{j}\leq\min(R_{\text{slack}},B).
Solving Eq.
1
optimally in an online setting is intractable, as speculative jobs arrive dynamically, their benefits are probabilistic, and available slack resources fluctuate over time.
Accordingly,
PASTE
adopts a greedy, best-effort heuristic that prioritizes speculative jobs based on their expected utility per unit resource.
Specifically, for each speculative job
j
i
j_{i}
, the scheduler computes a priority score:
(2)
U
⁡
(
j
i
)
=
p
i
⋅
T
i
c
i
⋅
d
i
,
U(j_{i})=\frac{p_{i}\cdot T_{i}}{c_{i}\cdot d_{i}},
which jointly captures the likelihood of consumption, the potential latency benefit, and the resource and time cost of speculative execution.
During opportunistic scheduling (Algorithm
3
, Step 4), speculative jobs are ranked in descending order of
U
⁡
(
j
i
)
U(j_{i})
and launched greedily as long as sufficient slack resources remain.
All speculative jobs are explicitly marked as preemptible and may be aborted at any time to reclaim resources for authoritative executions.
When resource contention arises, the scheduler preempts running speculative jobs with the lowest utility scores first, ensuring that speculative execution never delays or degrades the performance of real agent-driven tool invocations.
5.2.
Speculation Eligibility Policy
To ensure correctness, safety, and efficient resource utilization,
PASTE
governs the use of predictive tool invocations through a
speculation eligibility policy
specified by users or system operators. This policy resolves conflicts among multiple predictions, constrains speculative actions based on prediction confidence and side-effect risk, and provides explicit control to system operators.
Speculative Invocation Arbitration.
Because patterns are mined from data and are not guaranteed to be unique, multiple patterns may predict the same future tool invocation, potentially with different probabilities or levels of parameter completeness.
PASTE
therefore performs arbitration at the level of speculative
invocations
, rather than patterns. For predicted invocations targeting the same tool,
PASTE
retains at most one speculative action according to an
expected speculative utility
criterion. By default, utility is defined as the product of the prediction probability and the estimated latency reduction of speculative execution, though the framework allows alternative utility metrics. All other speculative instantiations of the same tool are discarded to avoid redundant work.
Policy-Constrained Graded Speculation.
PASTE
supports
graded speculation
along two orthogonal dimensions: the completeness of prediction and the risk of side effects. When a tool invocation is fully parameterized and the operation is declared side-effect-free by policy,
PASTE
may speculatively execute the invocation end-to-end. When predictions are partial, such as when only the tool identity or coarse parameters are known,
PASTE
limits speculation to shallow preparatory actions, including runtime warm-up, container or environment initialization, and dependency loading.
For operations that may incur side effects, speculative execution is further constrained by policy.
PASTE
supports transformed speculation, in which potentially unsafe operations are rewritten into safe variants, such as dry-run execution or execution against staging resources that prefetch data without committing irreversible state changes. Importantly,
PASTE
never speculates beyond the bounds specified by the policy and does not infer side-effect freedom automatically.
⬇
speculation_policy
:
default
:
allow
:
false
tools
:
web_search
:
allow
:
true
max_speculation
:
full
pip_install
:
allow
:
true
max_speculation
:
dry_run
deduplication
:
strategy
:
max_expected_speculative_utility
Figure 6.
Example user-defined speculation eligibility policy. The policy constrains which tools may be speculated, the allowed speculation level, and how duplicate predictions are merged.
Figure
6
illustrates an example speculation eligibility policy. The policy is explicitly defined by users or system operators and specifies, for each tool, whether speculation is permitted, the maximum allowed speculation level, and the handling of potential side effects. When predictions are duplicated across multiple patterns,
PASTE
applies a configurable deduplication strategy, retaining only the speculative action with the highest expected latency reduction. This policy-driven design ensures that speculative execution is both safe and predictable, while allowing operators to trade off aggressiveness and resource usage according to deployment requirements.
Together, these mechanisms ensure that incorrect predictions at worst consume bounded resources, while preserving the correctness of agent execution and enabling operators to control the aggressiveness of speculation.
6.
Implementation
We implement
PASTE
as a middleware layer that interposes between LLM agents and tool execution backends. The prototype consists of approximately 8,000 lines of TypeScript (Gemini-CLI integration) and 4,000 lines of Python (Qwen-DeepResearch and Virtual-Lab integrations).
PASTE
runs as a tool-serving proxy: agents send tool requests through
PASTE
, which records execution traces and coordinates speculative executions while preserving the original tool API.
Event Extractor.
The event extractor ingests tool invocation logs and converts them into a normalized event stream. It delineates sessions using a configurable inactivity threshold. For LLM interactions, we wrap the generation API to collect request/response timing and streaming-chunk metadata, enabling consistent alignment between model-side activity and tool executions.
Pattern Mining and Prediction State.
We implement the mining and prediction pipeline as in-memory summaries keyed by compact encodings of recent tool context. Each tool call is mapped to a discrete signature using lightweight classifiers for common argument forms (e.g., URLs, file paths, and free-form queries). These summaries are updated online and checkpointed periodically to disk for durability.
Pattern Predictor.
The predictor serves next-step candidates via hash-map lookups over serialized context keys (constant-time per key in our implementation). Parameter suggestions reuse previously observed values when available, with simple extraction rules for common value types.
Speculative Scheduler.
The scheduler maintains two asynchronous task queues: an active queue for agent-issued invocations and a shadow queue for speculative executions. Both share a unified result cache keyed by tool name and argument hash; when an authoritative request matches an in-flight speculative execution,
PASTE
joins the existing task and returns its result.
Agent Integrations.
We integrate with agents by wrapping their tool-dispatch interfaces and routing calls through the
PASTE
HTTP proxy.
7.
Evaluation
This section evaluates
PASTE
along five axes: (1) End-to-End (E2E) latency and throughput improvement, (2) where the improvement comes from (time breakdown and overlap), (3) scalability under concurrent sessions and bursty arrivals, (4) prediction quality, and (5) speculation overhead and safety under mispredictions.
Across all experiments, we hold hardware, LLM configuration, tool interfaces, and resource budgets constant to isolate system effects.
7.1.
Evaluation Methodology
Experimental setup and controls.
Unless stated otherwise, all systems run on the same hardware/software stack (Table
2
).
We apply the same per-task timeouts and retry policy to all systems.
For pattern prediction, we mine tool-call patterns from a corpus of historical tasks and evaluate on a disjoint set of new tasks (no train/test overlap).
Workloads and baselines.
We evaluate three agents: (i)
VirtualLab
(
Swanson et al., 2025
)
, a science-focused agent designed to support end-to-end research workflows; (ii)
Qwen Deep Research
(
Alibaba-NLP, 2025
)
, an agent tailored for
deep research
—multi-step, tool-assisted information gathering, synthesis, and report writing over open-ended questions; and (iii)
gemini-cli
(
, 2025
)
, Google’s official open-source, production-grade agent for code modification as well as general-purpose tasks.
We use three benchmark families:
DeepResearchBench
(
Du et al., 2025
)
for deep-research-style tasks,
SWE-bench
(
Jimenez et al., 2024
)
for software engineering and code-writing tasks, and
ScholarQA
(
Asai et al., 2024
)
as a domain-specific scientific research benchmark.
We compare
PASTE
against
ORION
(
Mahgoub et al., 2022
)
(serverless DAG execution) and
SpecFaaS
(
Stojkovic et al., 2023
)
(speculative serverless execution) under the same tool interfaces and resource limits.
Real-world trace-driven request arrivals.
We replay a production Azure Functions invocation trace
(
Shahrad et al., 2020
)
to generate realistic, bursty arrivals.
Each trace record becomes one agent request issued at its logged timestamp, preserving the
arrival process
.
LLM configuration.
As Table
2
shows, we choose both state-of-the-art proprietary LLM APIs and locally hosted open-source models, and keep the model configuration identical across all experiments.
Metrics.
Our primary metric is
E2E latency
(request arrival to final agent response) and tool execution latency.
We also report tail latency (p95/p99),
tool stall time
(time the agent waits for tool execution results), throughput, speculative
hit rate
, and resource overhead.
Table 2
.
Evaluation setup
Component
Setting
Cluster
4 nodes
Per-node CPU
96 vCPUs, AMD EPYC 7V13
Per-node Memory
512 GB
Per-node GPU
8 GPU, NVIDIA A100 80GB
Total GPUs
32
×
\times
NVIDIA A100 80GB
LLM API
Gemini-2.5-Pro, GPT-5.2
Local Model
Qwen-DeepResearch-30B
(
Team, 2025
)
7.2.
E2E Latency Reduction
We first quantify whether
PASTE
reduces E2E latency for each agent.
Figure
7
summarizes the results.
Across all agents,
PASTE
consistently reduces E2E latency relative to both ORION and SpecFaaS.
PASTE
reduces average latency by up to 48.5%, and reduces p95/p99 tail latency by up to 48.6%/61.9%.
Aggregating across all configurations,
PASTE
achieves an average speedup of
1.25
×
\times
/1.32
×
\times
over ORION/SpecFaaS.
Figure 7
.
Average E2E latency comparison.
Figure 8
.
CDF of E2E latency for each task.
To further characterize the full latency distribution, Figure
8
plots the CDF of E2E latency aggregated across all configurations.
PASTE
stochastically dominates both baselines: for a given latency threshold, a larger fraction of requests complete within the threshold under
PASTE
.
This indicates that speculation improves not only the tail but also the “bulk” of requests by reducing tool stalls on the critical path.
We further quantify this mechanism (tool-stall reduction and overlap) in Sec
7.3
.
In addition to end-to-end improvements, we evaluate
PASTE
’s ability to accelerate tool execution.
Figure
9
reports average tool latency aggregated across all agents, and Figure
10
plots the corresponding per-task CDF.
Across agents and benchmarks,
PASTE
significantly reduces tool latency relative to both ORION and SpecFaaS.
PASTE
reduces average tool latency by up to 55.2%, and reduces p95/p99 tool latency by up to 59.3%/60.6%.
Aggregating across all configurations,
PASTE
achieves an average tool speedup of 1.71
×
\times
/1.83
×
\times
over ORION/SpecFaaS.
These gains are consistent with speculative execution overlapping tool work with LLM generation and thus shortening the effective tool critical path.
Figure 9
.
Average tool latency comparison.
Figure 10
.
CDF of tool latency for each task.
Figure 11
.
Throughput evaluation.
Finally, we aggregate all tasks and examine
PASTE
’s overall speedup relative to the baselines.
Figure
12
reports the CDF of per-request speedup over ORION and SpecFaaS after pooling all requests.
Most requests observe positive speedup (97% above 1
×
\times
), while the worst cases remain close to parity, consistent with
PASTE
’s low speculation overhead when predictions do not hit.
((a))
CDF of per-request E2E speedup over ORION/SpecFaaS.
((b))
CDF of per-request Tool speedup over ORION/SpecFaaS.
Figure 12
.
CDF of Speedup for E2E and Tool scenarios.
These gains are robust across agents, benchmarks, and LLM settings.
Improvements are largest for tool-heavy tasks where tool stalls dominate the critical path, but remain non-negative for more LLM-dominated tasks, indicating that
PASTE
introduces low overhead when speculation does not hit.
Overall, speculative tool execution reliably converts a portion of tool-wait time into overlap with LLM generation, improving both median and tail latency.
7.3.
Time Breakdown and Overlap Analysis
To explain
why
PASTE
reduces E2E latency, we instrument the runtime and attribute time to three components: (1) tool execution (active runtime), (2) tool stall (time blocked on waiting for next tool call due to LLM thinking), and (3) speculation overhead.
We additionally measure
overlap
, defined as tool execution while the LLM is still thinking. Overlap reflects the effectiveness of speculative tool execution.
Figure
13
reports the breakdown for ORION, SpecFaaS, and
PASTE
.
Compared with both baselines,
PASTE
reduces tool-wait time by 67%. Compared with SpecFaaS,
PASTE
increases the measured overlap by over 10
×
\times
.
Figure 13
.
Time breakdown and overlap analysis, showing where
PASTE
reduces tool stall time by overlapping speculative tool work with LLM generation.
These results confirm that
PASTE
’s speedups come from overlap: tool work that previously executed strictly after an LLM step is shifted earlier and completed in parallel with LLM generation.
In contrast, ORION exposes tool latency directly after LLM generation, and SpecFaaS overlaps less effectively because its speculative policy is designed for static DAG applications but not agentic workflow. As a result, it cannot predict the argument of each tool call.
Overall,
PASTE
reduces latency by hiding tool stalls rather than shifting cost elsewhere.
7.4.
System Scalability
We next evaluate scalability to determine whether
PASTE
maintains low latency under many concurrent agent sessions, and to verify that speculation does not harm isolation by increasing queueing for authoritative tool calls.
We stress the system by sweeping arrival rate and concurrent sessions while holding resource budgets fixed.
Figure
14
summarizes
PASTE
’s E2E speedup performance as workload increases. At each concurrency,
PASTE
sustains at least 1.76
×
\times
/2.05
×
\times
higher speedup compared with ORION/SpecFaaS.
These results demonstrate that
PASTE
scales without violating isolation: speculative work is throttled by explicit budgets and remains preemptible, so it does not crowd out authoritative tool execution.
Figure 14
.
Scalability under multi-session concurrent agent requests: speedup compared with baselines.
7.5.
Pattern Prediction Accuracy
Figure 15
.
Pattern prediction quality: Top-1 accuracy, Top-3 recall, and overall hit rate.
Speculative execution is only effective when the system can correctly anticipate near-future tool calls.
We therefore measure prediction quality using
Top-1 accuracy
(the highest-probability predicted tool matches the next tool actually invoked) and
Top-3 recall
(the next tool appears among the three most likely predictions).
Top-3 recall is particularly relevant because
PASTE
may speculatively execute multiple candidates within a bounded budget.
We also report
overall hit rate
, defined per tool call as the probability that
any
speculatively executed prediction matches the next tool actually invoked.
Because
PASTE
can issue multiple predictions (and increase the number of candidates when the system is lightly loaded and spare resources are available), overall hit rate can be high even when Top-1 accuracy is low.
Figure
15
reports prediction quality by benchmark family.
Overall, the predictor achieves up to 27.8% Top-1 accuracy, 43.9% Top-3 recall, and 93.8% overall hit rate.
Accuracy is higher for structured tool sequences (e.g., compilation/test loops) and lower for open-ended exploration patterns typical of broad research tasks.
Despite imperfect Top-1 accuracy, strong Top-3 recall is sufficient in practice:
PASTE
can speculate on a small set of likely tools and still obtain overlap when any candidate hits.
When prediction is uncertain, the explicit speculation budget bounds wasted work and prevents negative interference with authoritative execution.
7.6.
Side-effect Evaluation
Finally, we evaluate safety to ensure that enabling speculation does not change externally visible behavior or violate isolation, even under mispredictions.
We audit speculative executions to measure how many speculative actions would have caused external side effects, (ii) whether such effects were prevented from committing, and (iii) any divergences in final outputs relative to authoritative-only execution.
Across all workloads,
PASTE
detects 602 potentially side-effecting speculative actions among over 20,000 speculative actions and prevents them from committing. No task produces a different final result compared with the baselines.
Overall, the results support
PASTE
’s safety claim: speculative actions are contained by policy and sandboxing and only become externally visible after authoritative confirmation.
7.7.
Resource Overhead
For the latency–overhead tradeoff, for every 1 second of latency reduction, the
PASTE
consumes 0.02 core-seconds of CPU, 2.6 MB of memory, and 0.9 MB of network bandwidth. At moderate settings,
PASTE
achieves 48% tool execution latency reduction with extra 1-3 idle CPU cores and 250 MB additional memory. These results show that
PASTE
can be tuned to a practical “sweet spot” in which most speculative work is converted into useful overlap, while the remaining waste is bounded by explicit budgets. Overall, PASTE is lightweight enough to be deployed as a sidecar alongside existing agent runtimes, delivering latency wins without requiring dedicated infrastructure or disruptive changes to the execution stack.
For the pattern predict and scheduling policy, the overall latency overhead is less than 100 ms.
8.
Related Works
Agentic LLM serving acceleration.
Recent systems treat agentic applications as
structured programs/workflows
and optimize serving via semantics/workflow-aware execution and orchestration (including agent communication/runtime co-design)
(
Luo et al., 2025
;
Lin et al., 2024
;
Zhang et al., 2026
;
Giusti et al., 2025
;
Zhang et al., 2025a
;
Guo et al., 2025
;
Zheng et al., 2024
)
.
Other work accelerates
augmented/tool-interrupt inference
with intercept and scheduling support
(
Abhyankar et al., 2024
;
Wang et al., 2025
;
Zhai et al., 2026
;
Xu et al., 2025
)
, while general LLM serving advances improve throughput/latency via better scheduling, multiplexing, and distributed serving (often applicable to agent workloads)
(
Agrawal et al., 2024
;
Wu et al., 2023
;
Duan et al., 2024
;
Qiao et al., 2024
;
Qiu et al., 2024
;
Li et al., 2025
)
.
Because agent loops intensify context reuse and long-context pressure, many efforts focus on
KV/prefix/context caching and memory management
, including KV reuse/compression and context caching schemes
(
Pan et al., 2025
;
Kim et al., 2025
;
Cai et al., 2025
;
Yang et al., 2025
;
Hu et al., 2024
;
Xie et al., 2025
;
Kwon et al., 2023
;
Prabhu et al., 2024
)
.
However, these systems primarily optimize LLM inference/serving and largely treat tool execution as an external interruption, leaving end-to-end tool latency unaddressed compared to
PASTE
.
Tool & runtime acceleration.
Tool execution performance is shaped by serverless/workflow runtimes, so recent work reduces
workflow orchestration overhead
and mitigates
cold starts
via better provisioning/worker reuse
(
Liu et al., 2023
;
Joosen et al., 2025
;
Liu et al., 2024
;
Sui et al., 2024
)
.
Additional systems target
cross-service caching/state management
for microservice graphs and serverless settings
(
Zhang et al., 2024
;
Zhang et al., 2025b
)
, and speed up tool-heavy pipelines with more efficient
data passing/transfer paths
(
Marcelino and Nastic, 2024
;
Wu et al., 2024
;
Marcelino et al., 2025
)
.
Yet, most of these techniques assume a largely static workflow/microservice graph and cannot directly exploit the online, LLM-generated control flow and context-dependent argument binding in agent loops, which
PASTE
is designed to handle.
Yet, most of these techniques assume a static workflow/microservice graph and cannot directly exploit the online, LLM-generated control flow and context-dependent argument binding in agent loops, which
PASTE
is designed to handle.
Speculation.
Speculation has been applied to
serverless functions
to accelerate workflows by executing likely-needed tasks early
(
Stojkovic et al., 2023
)
.
Emerging agentic work explores
speculative actions and speculative tool calls
to overlap tool latency with reasoning/search while preserving correctness constraints
(
Ye et al., 2025
;
Huang et al., 2025
;
Nichols et al., 2025
)
. Compared to
PASTE
, existing speculation mechanisms struggle to (i) infer the concrete, context-dependent arguments that are only produced online by the agent, making accurate tool-call speculation difficult, and (ii) manage the correctness and side-effect risks of executing wrong calls, which requires explicit, risk-aware control.
9.
Conclusion
In this paper, we address the fundamental serialization bottleneck in modern LLM powered agents, where a strictly sequential “LLM-tool” loop forces expensive resources to remain idle during external tool execution. We introduce PASTE, a speculative tool execution method that transforms this reactive workflow into a proactive and pipelined architecture. Using a new Pattern Tuple abstraction, PASTE decouples stable application-level control flows from dynamic data flow dependencies, which enables robust and late binding tool prediction. Combined with a risk-aware and opportunistic scheduler, the system exploits transient slack resources to hide tool latency while preserving strict performance for authoritative tasks.
References
Abhyankar
et al.
(2024)
R. Abhyankar, Z. He, V. Srivatsa, H. Zhang, and Y. Zhang
InferCept: efficient intercept support for augmented large language model inference
.
In
Proceedings of the 41st International Conference on Machine Learning
,
Proceedings of Machine Learning Research
, Vol.
235
,
pp. 81–95
.
Cited by:
§8
.
[2]
(2025)
Agent skills
.
Note:
https://agentskills.io/home
Accessed: 2026-01-25
Cited by:
§1
,
§2.1.1
.
Agrawal
et al.
(2024)
A. Agrawal, N. Kedia, A. Panwar, J. Mohan, N. Kwatra, B. S. Gulavani, A. Tumanov, and R. Ramjee
Taming throughput-latency tradeoff in LLM inference with Sarathi-Serve
.
In
18th USENIX Symposium on Operating Systems Design and Implementation (OSDI)
,
Cited by:
§8
.
Alibaba-NLP (2025)
DeepResearch: tongyi deep research, the leading open-source deep research agent
External Links:
Link
Cited by:
§7.1
.
Asai
et al.
(2024)
A. Asai, J. He, R. Shao, W. Shi, A. Singh, J. C. Chang, K. Lo, L. Soldaini, S. Feldman, M. D’arcy, D. Wadden, M. Latzke, M. Tian, P. Ji, S. Liu, H. Tong, B. Wu, Y. Xiong, L. Zettlemoyer, G. Neubig, D. Weld, D. Downey, W. Yih, P. W. Koh, and H. Hajishirzi
OpenScholar: synthesizing scientific literature with retrieval-augmented lms
.
External Links:
2411.14199
,
Link
,
Document
Cited by:
§2.2.1
,
§7.1
.
[6]
(2025)
Build, debug & deploy with AI
.
Note:
https://geminicli.com/
Cited by:
§1
,
§7.1
.
Cai
et al.
(2024)
T. Cai, Y. Li, Z. Geng, H. Peng, J. D. Lee, D. Chen, and T. Dao
Medusa: simple LLM inference acceleration framework with multiple decoding heads
.
In
Proceedings of the 41st International Conference on Machine Learning (ICML)
,
Vol.
235
.
Cited by:
§1
.
Cai
et al.
(2025)
Z. Cai, W. Xiao, H. Sun, C. Luo, Y. Zhang, K. Wan, Y. Li, Y. Zhou, L. Chang, J. Gu, Z. Dong, A. Anandkumar, A. Asi, and J. Hu
R-kv: redundancy-aware KV cache compression for training-free reasoning models acceleration
.
Advances in Neural Information Processing Systems
.
Cited by:
§8
.
[9]
(2025)
Claude Code | Claude
.
Note:
https://www.claude.com/product/claude-code
Cited by:
§1
,
§2.1.1
.
Du
et al.
(2025)
M. Du, B. Xu, C. Zhu, X. Wang, and Z. Mao
DeepResearch bench: a comprehensive benchmark for deep research agents
.
arXiv preprint
.
Cited by:
§2.2.1
,
§7.1
.
Duan
et al.
(2024)
J. Duan, R. Lu, H. Duanmu,
et al.
MuxServe: flexible spatial-temporal multiplexing for multiple LLM serving
.
In
Forty-first International Conference on Machine Learning (ICML)
,
Cited by:
§8
.
Fu
et al.
(2024)
Y. Fu, L. Xue, Y. Huang, A. Brabete, D. Ustiugov, Y. Patel, and L. Mai
ServerlessLLM: low-latency serverless inference for large language models
.
In
18th USENIX Symposium on Operating Systems Design and Implementation (OSDI)
,
pp. 135–153
.
Cited by:
§1
.
[13]
(2025)
GitHub Copilot
.
Note:
https://github.com/features/copilot
Cited by:
§1
,
§2.1.1
.
Giusti
et al.
(2025)
L. Giusti, O. A. Werner, R. Taiello, M. C. Costa, E. Tosun, A. Protani, M. Molina, R. L. de Almeida, P. Cacace, D. R. Santos, and L. Serio
Federation of agents: a semantics-aware communication fabric for large-scale agentic ai
.
arXiv preprint arXiv:2509.20175
.
Cited by:
§1
,
§8
.
Guo
et al.
(2025)
L. Guo, B. Zhu, Q. Tao, K. Liu, X. Zhao, X. Qin, J. Gao, and G. Hao
Agentic lybic: multi-agent execution system with tiered reasoning and orchestration
.
arXiv preprint arXiv:2509.11067
.
Cited by:
§8
.
Hu
et al.
(2024)
J. Hu, W. Huang, H. Wang, W. Wang, T. Hu, Q. Zhang, H. Feng, X. Chen, Y. Shan, and T. Xie
EPIC: efficient position-independent context caching for serving large language models
.
arXiv preprint arXiv:2410.15332
.
Cited by:
§8
.
Huang
et al.
(2025)
Z. Huang, W. Zeng, T. Fu, T. Liu, Y. Sun, K. Hong, X. Yang, C. Liu, Y. Li, Q. Zhang, G. Dai, Z. Zhu, and Y. Wang
Reducing latency of LLM search agent via speculation-based algorithm-system co-design
.
arXiv preprint arXiv:2511.20048
.
Cited by:
§8
.
Jimenez
et al.
(2024)
C. E. Jimenez, J. Yang, A. Wettig, S. Yao, K. Pei, O. Press, and K. R. Narasimhan
SWE-bench: can language models resolve real-world github issues?
.
In
The Twelfth International Conference on Learning Representations (ICLR)
,
Cited by:
§2.2.1
,
§7.1
.
Joosen
et al.
(2025)
A. Joosen, A. Agarwal, C. L. Abad, G. Van Seghbroeck, S. Deckers, A. Lemmens, and M. Shahrad
Serverless cold starts and where to find them
.
In
Proceedings of the Twentieth European Conference on Computer Systems (EuroSys)
,
External Links:
Document
Cited by:
§1
,
§2.2.2
,
§8
.
Kim
et al.
(2025)
J. Kim, J. Kim, S. Kwon, J. W. Lee, S. Yun, and H. O. Song
KVzip: query-agnostic KV cache compression with context reconstruction
.
Advances in Neural Information Processing Systems
.
Cited by:
§8
.
Kwon
et al.
(2023)
W. Kwon, Z. Li, S. Zhuang, Y. Sheng, L. Zheng, C. H. Yu, J. E. Gonzalez, H. Zhang, and I. Stoica
Efficient memory management for large language model serving with PagedAttention
.
In
Proceedings of the ACM SIGOPS 29th Symposium on Operating Systems Principles
,
Cited by:
§8
.
Li
et al.
(2025)
Y. Li, J. Dai, and T. Peng
Throughput-optimal scheduling algorithms for LLM inference and AI agents
.
arXiv preprint arXiv:2504.07347
.
Cited by:
§8
.
Lin
et al.
(2024)
C. Lin, Z. Han, C. Zhang, Y. Yang, F. Yang, C. Chen, and L. Qiu
Parrot: efficient serving of llm-based applications with semantic variable
.
In
Proceedings of the 18th USENIX Conference on Operating Systems Design and Implementation
,
OSDI
,
USA
.
External Links:
ISBN 978-1-939133-40-3
Cited by:
§8
.
Liu
et al.
(2023)
D. H. Liu, A. Levy, S. Noghabi, and S. Burckhardt
Doing more with less: orchestrating serverless applications without an orchestrator
.
In
20th USENIX Symposium on Networked Systems Design and Implementation (NSDI)
,
pp. 1505–1519
.
Cited by:
§2.2.2
,
§8
.
Liu
et al.
(2024)
Q. Liu, Y. Yang, D. Du, Y. Xia, P. Zhang, J. Feng, J. R. Larus, and H. Chen
Harmonizing efficiency and practicability: optimizing resource utilization in serverless computing with Jiagu
.
In
2024 USENIX Annual Technical Conference (ATC)
,
pp. 1–17
.
Cited by:
§1
,
§2.2.2
,
§8
.
Luo
et al.
(2025)
M. Luo, X. Shi, C. Cai, T. Zhang, J. Wong, Y. Wang, C. Wang, Y. Huang, Z. Chen, J. E. Gonzalez, and I. Stoica
Autellix: an efficient serving engine for llm agents as general programs
.
arXiv preprint arXiv:2502.13965
.
Cited by:
§1
,
§8
.
Mahgoub
et al.
(2022)
A. Mahgoub, E. B. Yi, K. Shankar, S. Elnikety, S. Chaterji, and S. Bagchi
ORION and the three rights: sizing, bundling, and prewarming for serverless DAGs
.
In
16th USENIX Symposium on Operating Systems Design and Implementation (OSDI)
,
Carlsbad, CA
,
pp. 303–320
.
External Links:
ISBN 978-1-939133-28-1
Cited by:
§1
,
§7.1
.
Manus (2025)
Manus
Manus: Hands On AI
.
Note:
https://manus.im/
Cited by:
§1
,
§2.1.1
.
Marcelino
et al.
(2025)
C. Marcelino, L. Guelmino, T. Pusztai, and S. Nastic
Databelt: a continuous data path for serverless workflows in the 3d compute continuum
.
Journal of Systems Architecture
.
External Links:
2508.15351
Cited by:
§2.2.2
,
§8
.
Marcelino and Nastic (2024)
C. Marcelino and S. Nastic
Truffle: efficient data passing for data-intensive serverless workflows in the edge-cloud continuum
.
In
2024 IEEE/ACM 17th International Conference on Utility and Cloud Computing (UCC)
,
pp. 53–62
.
External Links:
Document
Cited by:
§2.2.2
,
§8
.
Moonshot AI (2025)
Moonshot AI
Kimi-researcher: end-to-end rl training for emerging agentic capabilities
(Website)
External Links:
Link
Cited by:
§1
,
§2.1.1
.
Nichols
et al.
(2025)
D. Nichols, P. Singhania, C. Jekel, A. Bhatele, and H. Menon
Optimizing agentic language model inference via speculative tool calls
.
arXiv preprint arXiv:2512.15834
.
Cited by:
§8
.
OpenAI (2025)
OpenAI
Introducing deep research
.
Note:
https://openai.com/index/introducing-deep-research/
Cited by:
§1
,
§2.1.1
.
Pan
et al.
(2025)
Z. Pan, W. Li, L. Qin, Y. Wang, and Y. Ding
KVFlow: efficient prefix caching for accelerating LLM-based multi-agent workflows
.
arXiv preprint arXiv:2507.07400
.
Cited by:
§8
.
Prabhu
et al.
(2024)
R. Prabhu, A. Nayak, J. Mohan, R. Ramjee, and A. Panwar
VAttention: dynamic memory management for serving LLMs without PagedAttention
.
External Links:
2405.04437
Cited by:
§1
,
§8
.
Qiao
et al.
(2024)
Y. Qiao, S. Anzai, S. Yu, H. Ma, Y. Wang, M. Kim, and H. Xu
ConServe: harvesting gpus for low-latency and high-throughput large language model serving
.
arXiv preprint arXiv:2410.01228
.
Cited by:
§8
.
Qiu
et al.
(2024)
H. Qiu, W. Mao, A. Patke, S. Cui, S. Jha, C. Wang, H. Franke, Z. T. Kalbarczyk, T. Baçar, and R. K. Iyer
Efficient interactive LLM serving with proxy model-based sequence length prediction
.
arXiv preprint arXiv:2404.08509
.
Cited by:
§8
.
Shahrad
et al.
(2020)
M. Shahrad, R. Fonseca, I. Goiri, G. Chaudhry, P. Batum, J. Cooke, E. Laureano, C. Tresness, M. Russinovich, and R. Bianchini
Serverless in the wild: characterizing and optimizing the serverless workload at a large cloud provider
.
In
2020 USENIX Annual Technical Conference (USENIX ATC)
,
pp. 205–218
.
External Links:
ISBN 978-1-939133-14-4
Cited by:
§7.1
.
Stojkovic
et al.
(2023)
J. Stojkovic, T. Xu, H. Franke, and J. Torrellas
SpecFaaS: accelerating serverless applications with speculative function execution
.
In
2023 IEEE International Symposium on High-Performance Computer Architecture (HPCA)
,
pp. 814–827
.
External Links:
Document
Cited by:
§1
,
§2.2.2
,
§7.1
,
§8
.
Sui
et al.
(2024)
Y. Sui, H. Yu, Y. Hu, J. Li, and H. Wang
Pre-warming is not enough: accelerating serverless inference with opportunistic pre-loading
.
In
Proceedings of the 2024 ACM Symposium on Cloud Computing
,
SoCC
,
New York, NY, USA
,
pp. 178–195
.
External Links:
ISBN 9798400712869
Cited by:
§8
.
Sui
et al.
(2026)
Y. Sui, H. Yu, Y. Hu, J. Li, and H. Wang
Accelerating ml inference via opportunistic pre-loading on serverless clusters
.
IEEE Transactions on Parallel and Distributed Systems
37
(
2
),
pp. 472–488
.
Cited by:
§2.2.2
.
Swanson
et al.
(2025)
K. Swanson, W. Wu, N. L. Bulaong, J. E. Pak, and J. Zou
The virtual lab of ai agents designs new sars-cov-2 nanobodies
.
Nature
646
(
8085
),
pp. 716–723
.
Note:
Epub 2025-07-29
External Links:
Document
,
Link
Cited by:
§7.1
.
Team (2025)
T. D. Team
Tongyi deepresearch: a new era of open-source ai researchers
.
Note:
https://github.com/Alibaba-NLP/DeepResearch
Cited by:
§2.2.1
,
Table 2
.
Wang
et al.
(2025)
Y. Wang, Z. Jin, J. Xu, W. Lin, Y. Chen, and W. Chen
AugServe: adaptive request scheduling for augmented large language model inference serving
.
arXiv preprint arXiv:2512.04013
.
Cited by:
§8
.
Wu
et al.
(2023)
B. Wu, Y. Zhong, Z. Zhang, G. Wang, X. Liu, and X. Jin
Fast distributed inference serving for large language models
.
arXiv preprint arXiv:2305.05920
.
Cited by:
§8
.
Wu
et al.
(2024)
H. Wu, J. Deng, M. Yu, Y. Yu, Y. Liu, H. Fan, S. Wu, and W. Wang
FaaSTube: optimizing gpu-oriented data transfer for serverless computing
.
arXiv preprint arXiv:2411.01830
.
Cited by:
§2.2.2
,
§8
.
Xie
et al.
(2025)
Z. Xie, Z. Xu, M. Zhao, Y. An, V. S. Mailthody, S. Mahlke, M. Garland, and C. Kozyrakis
Strata: hierarchical context caching for long context language model serving
.
arXiv preprint arXiv:2508.18572
.
Cited by:
§8
.
Xu
et al.
(2025)
H. Xu, Z. Wang, Z. Zhu, L. Pan, X. Chen, S. Fan, L. Chen, and K. Yu
Alignment for efficient tool calling of large language models
.
In
Proceedings of the 2025 Conference on Empirical Methods in Natural Language Processing
,
pp. 17776–17792
.
Cited by:
§8
.
Yang
et al.
(2025)
J. Yang, B. Hou, W. Wei, Y. Bao, and S. Chang
KVLink: accelerating large language models via efficient KV cache reuse
.
arXiv preprint arXiv:2502.16002
.
Cited by:
§8
.
Ye
et al.
(2025)
N. Ye, A. Ahuja, G. Liargkovas, Y. Lu, K. Kaffes, and T. Peng
Speculative actions: a lossless framework for faster agentic systems
.
arXiv preprint arXiv:2510.04371
.
Cited by:
§2.2.2
,
§8
.
Zhai
et al.
(2026)
Y. Zhai, D. Shen, J. Luo, and B. Yang
ToolCaching: towards efficient caching for llm tool-calling
.
arXiv preprint arXiv:2601.15335
.
Cited by:
§8
.
Zhang
et al.
(2025a)
C. Zhang, L. Li, H. Huang, C. Ni, B. Qiao, S. Qin, Y. Kang, M. Ma, Q. Lin, S. Rajmohan, and D. Zhang
UFO
3
{}^{3}
: weaving the digital agent galaxy
.
arXiv preprint arXiv:2511.11332
.
Cited by:
§8
.
Zhang
et al.
(2024)
H. Zhang, K. Kallas, S. Pavlatos, R. Alur, S. Angel, and V. Liu
MuCache: a general framework for caching in microservice graphs
.
In
21st USENIX Symposium on Networked Systems Design and Implementation (NSDI)
,
pp. 221–238
.
Cited by:
§2.2.2
,
§8
.
Zhang
et al.
(2025b)
H. Zhang, S. Mu, S. Angel, and V. Liu
CausalMesh: a causal cache for stateful serverless computing
.
Proceedings of the VLDB Endowment
.
Cited by:
§2.2.2
,
§8
.
Zhang
et al.
(2026)
L. Zhang, M. Chen, R. Cao, J. Chen, F. Zhou, Y. Xu, J. Yang, Z. Ma, L. Chen, C. Luo, K. Zhang, F. Yan, K. Shum, J. Zhang, Z. Cui, F. Hu, J. Lin, B. Hui, and M. Yang
MegaFlow: large-scale distributed orchestration system for the agentic era
.
arXiv preprint arXiv:2601.07526
.
Cited by:
§1
,
§8
.
Zheng
et al.
(2024)
L. Zheng, L. Yin, Z. Xie, C. Sun, J. Huang, C. H. Yu, S. Cao, C. Kozyrakis, I. Stoica, J. Gonzalez, C. Barrett, and Y. Sheng
SGLang: efficient execution of structured language model programs
.
In
Advances in Neural Information Processing Systems 37 (NeurIPS)
,
Cited by:
§8
.
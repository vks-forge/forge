---
title: 'L-MAD: A Systematic Evaluation of Multi-Agent Debate Structures in Legal Reasoning'
id: l-mad-a-systematic-evaluation-of-multi-agent-debate-structures-in-legal-reasonin
tags:
- ai-software-factory-architecture-58e4cc
created: '2026-10-12T08:59:50.944504Z'
updated: '2026-10-12T09:02:00.962547Z'
source: https://arxiv.org/html/2607.09099v1
source_domain: arxiv.org
fetched_at: '2026-10-12T08:59:50.942577Z'
fetch_provider: builtin
status: deprecated
type: note
tier: institutional
content_type: paper
deprecated: false
---

L-MAD: A Systematic Evaluation of Multi-Agent Debate Structures in Legal Reasoning
Title:
Content selection saved. Describe the issue below:
Description:
arXiv is now an independent nonprofit!
Learn more
×
License: CC BY 4.0
arXiv:2607.09099v1 [cs.AI] 10 Jul 2026
L-MAD: A Systematic Evaluation of Multi-Agent Debate Structures
in Legal Reasoning
Tan-Minh Nguyen
Affiliation:
Japan Advanced Institute of Science and Technology (JAIST), Ishikawa, Japan
Hoang-Trung Nguyen
Affiliation:
VNU University of Engineering and Technology, Hanoi, Vietnam
Huu-Dong Nguyen
Affiliation:
VNU University of Engineering and Technology, Hanoi, Vietnam
Truong Dinh Do
Affiliation:
Japan Advanced Institute of Science and Technology (JAIST), Ishikawa, Japan
Thi-Hai-Yen Vuong
Affiliation:
VNU University of Engineering and Technology, Hanoi, Vietnam
Le-Minh Nguyen
Affiliation:
Japan Advanced Institute of Science and Technology (JAIST), Ishikawa, Japan
Correspondence to:
nguyenml@jaist.ac.jp
Abstract
While multi-agent debate (MAD) frameworks have shown significant potential in general reasoning, their effectiveness in highly structured, knowledge-heavy legal domains remains under-explored. In this work, we introduce the Legal Multi-Agent Debate (L-MAD) framework to systematically evaluate different debate structures and aggregation methods within Legal Textual Entailment. By assigning distinct expert personas to multiple agents, L-MAD improves upon strong single-agent baselines by up to 8%. Furthermore, analyzing how debate scales reveals a clear trade-off: increasing the agent population reduces inconsistency and improves accuracy, whereas extending discussion rounds induces a detrimental
over-deliberation drift
where agents reinforce each other’s mistakes. Ultimately, our findings outline the practical boundaries and safety margins of deploying collaborative multi-agent systems in high-stakes legal reasoning environments.
Keywords:
Machine Learning, ICML
1
Introduction
Large language models (LLMs) show remarkable capabilities in general reasoning, but they frequently struggle in high-stakes, knowledge-heavy domains that demand strict logic. Legal Textual Entailment (LTE)
(
Aoki et al., 2022
;
Bilgin et al., 2024
)
is a challenging test for these models, requiring them to determine whether specific legal statutes apply to a given factual scenario
(
Aletras et al., 2016
;
Zhong et al., 2020
)
. While specialized models like LegalBERT
(
Chalkidis et al., 2020
)
and Lawformer
(
Xiao et al., 2021
)
outperform generalist baselines, standard single-model inference is still limited by a model’s basic reasoning capacity and its tendency to make factual or logical errors.
Figure 1
:
Illustration of decision-making protocols used in this study.
Multi-Agent Debate (MAD) frameworks offer a promising way to overcome these limitations by allowing models to spend more computing power during inference
(
Nie et al., 2020
;
Choi et al., 2026
)
. By assigning distinct expert personas to multiple LLM agents, these frameworks let models iterate and refine their arguments to arrive at a better final answer
(
Kaesberg et al., 2025b
)
. However, how these debate frameworks perform in highly structured, rule-bound fields like law remains underexplored. While open-ended debate typically helps in general tasks, it introduces unique challenges in legal reasoning. The trade-offs between forcing agents to agree versus letting them vote independently—and the risk of errors multiplying over several rounds—have not yet been systematically analyzed.
To bridge this gap, we introduce Legal Multi-Agent Debate (L-MAD), a framework designed to analyze different multi-agent debate structures under strict legal rules (Figure
1
). Unlike prior work that mainly focuses on connecting LLMs to external tools, L-MAD provides a controlled environment to evaluate core aggregation methods. Specifically, we compare
forced consensus
strategies (where agents debate until they agree) against
voting
approaches (where agents maintain independent reasoning paths).
Our empirical results show that L-MAD significantly improves performance, outperforming strong single-agent baselines by up to 8% in some settings. Crucially, we find that the best debate strategy depends heavily on the underlying model’s capability. Forcing a consensus works well with highly capable models (e.g., 30B+ parameters) by encouraging constructive debate, whereas independent voting protects smaller models (e.g., 8B parameters) from superficial agreement. Furthermore, exploring how debate scales reveals a clear trade-off: adding more agents to the population reduces inconsistency and improves accuracy, but adding more discussion rounds causes
over-deliberation drift
—a behavior where agents echo and validate each other’s mistakes, ultimately degrading performance.
In summary, our core contributions are:
•
A systematic evaluation of multi-agent debate frameworks for decision-making in high-stakes, knowledge-dense legal domains.
•
A clear analysis of the scaling trade-offs between increasing the number of participating agents versus extending the number of debate rounds.
•
Actionable insights into the boundaries and safety margins of deploying multi-agent LLM systems in collaborative legal reasoning environments.
2
Preliminaries
2.1
Legal Textual Entailment
We employ Legal Textual Entailment to assess the ability of LLMs to accurately deduce legal outcomes from factual descriptions and statutory rules. By emphasizing subtle linguistic and doctrinal distinctions, this task rigorously evaluates whether a model possesses a genuine comprehension of legal theory. An illustrative example of the task (official translation from Japanese) is presented below:
Premise:
(Juridical Acts by Adult Wards under Guardianship) Article 9
A juridical act performed by an adult ward is voidable; provided, however, that this does not apply to the purchase of daily necessities or to any other act involved in day-to-day life.
Hypothesis:
If a person under adult guardianship purchases daily necessities without the consent of the adult guardian, the adult guardian may cancel the contract involving the purchase.
Entailment:
No
More formally, let
𝒮
=
{
S
1
,
S
2
,
…
,
S
n
}
\mathcal{S}=\{S_{1},S_{2},\dots,S_{n}\}
denote a set of relevant statutory articles and let
Q
Q
represent a legal hypothesis. The Legal Textual Entailment task can be cast as a binary classification problem mapping the tuple
(
𝒮
,
Q
)
(\mathcal{S},Q)
to a label
y
∈
{
1
,
0
}
y\in\{1,0\}
, corresponding to
E
​
n
​
t
​
a
​
i
​
l
​
s
​
(
𝒮
,
Q
)
Entails(\mathcal{S},Q)
and
E
​
n
​
t
​
a
​
i
​
l
​
s
​
(
𝒮
,
¬
Q
)
Entails(\mathcal{S},\neg Q)
, respectively.
The primary evaluation metric for this task is classification accuracy. Given that the benchmark datasets are rigorously balanced between positive and negative instances, a random guessing baseline or a naive uniform-prediction heuristic yields an expected accuracy of approximately
0.50
0.50
.
2.2
Prompting Techniques
Standard Prompting and In-Context Learning.
Standard prompting elicits an answer
a
a
from a model parameterized by
θ
\theta
given a query
q
q
, formally modeling the conditional distribution
P
θ
​
(
a
∣
q
)
P_{\theta}(a\mid q)
. In-context learning
(
Brown et al., 2020
)
enhances this generation process by conditioning the language model on a small set of exemplars
𝒟
=
{
d
1
,
d
2
,
…
,
d
n
}
\mathcal{D}=\{d_{1},d_{2},\dots,d_{n}\}
, effectively modeling
P
θ
​
(
a
∣
𝒟
,
q
)
P_{\theta}(a\mid\mathcal{D},q)
without requiring parameter updates.
Legal Reasoning CoT (IRAC).
Eliciting intermediate reasoning steps significantly improves the proficiency of LLMs on complex cognitive tasks
(
Wei et al., 2022
)
. Standard CoT extends the in-context learning paradigm by augmenting each exemplar with a rationale
r
i
r_{i}
, such that
d
i
=
(
q
i
,
r
i
,
a
i
)
d_{i}=(q_{i},r_{i},a_{i})
. The complexity and structural rigor of
r
i
r_{i}
directly correlate with downstream performance
(
Fu et al., 2022
)
. In the juridical domain,
Yu et al. (2022)
specialized this approach via the IRAC framework—a canonical legal reasoning structure comprising four discrete stages: Issue (identifying the legal controversy), Rule (retrieving the governing statute), Application (mapping the rule to the factual matrix), and Conclusion (deriving the final legal verdict).
Self-Consistency.
To mitigate the stochasticity of single-path decoding, self-consistency
(
Wang et al., 2022
)
samples a diverse set of reasoning paths and marginalizes over them to find the most robust answer. By drawing multiple independent completions from the model, the final prediction
a
∗
a^{*}
is obtained via majority voting, defined as
a
∗
=
arg
⁡
max
⁡
∑
i
a
⁡
𝕀
⁡
(
a
i
=
a
)
a^{*}=\arg\max_{a}\sum_{i}\mathbb{I}(a_{i}=a)
. While this ensemble-like method effectively increases the likelihood of finding the correct reasoning pathway, it remains upper-bounded by the native inferential limits of the base model.
2.3
Multi-Agent Debate for Decision-Making
Multi-Agent Debate is a collaborative framework in which multiple language-model agents engage in structured interaction—typically in the form of iterative exchanges or discussions —to solve tasks such as question answering or text generation. In a typical MAD protocol, each agent independently generates an initial response and then engages in a series of debate rounds. At round
t
t
, an agent receives the original question along with responses from its peers at round
t
−
1
t-1
, prompting the model to update its response accordingly. This iterative process is designed to leverage diverse reasoning paths and peer wisdom, potentially enhancing the overall decision quality. After all rounds of debate, the final answer is typically derived through an aggregation mechanism, such as majority voting.
3
Methodology
In this section, we formalize the architecture of our multi-agent framework, detailing the deliberation topology, the prompt-based response conditioning, and the decision aggregation protocols.
3.1
Framework Configuration and Topology
Our multi-agent debate framework is parameterized by three foundational elements: a deliberation topology, a decision protocol, and an agent-specific response generator. We initialize each debate session with three distinct, automatically generated expert personas, adapting the methodology of
Kim et al. (2024)
. Empirical evidence from
Yin et al. (2023)
demonstrates that a tripartite configuration offers an optimal theoretical trade-off between viewpoint diversity and computational overhead. By instantiating distinct personas, we effectively inject domain-specific inductive biases into the reasoning process, ensuring a robust exploration of the solution space.
During deliberation, agents exchange information over discrete communication rounds. In each round, agents operate asynchronously, attending to the broadcasted messages of their peers from previous rounds based on a sliding context window (restricted to the two most recent turns). This truncated context serves as an attention regularization mechanism to limit context dilution and prevent catastrophic drift from the original hypothesis. The exact termination condition of the debate is strictly governed by the chosen decision protocol. For consensus protocols, agents explicitly signal agreement or disagreement per turn, iteratively refining their stance until the threshold is met. For voting protocols, agents communicate for a fixed horizon (e.g., three rounds) before casting terminal votes.
3.2
Response Generation and Decision Protocols
The semantic structure of the agent prompt heavily influences the trajectory of multi-agent deliberation. We employ a
Simple Response Generator
as our default template, which conditions agents to evaluate preceding arguments neutrally and without adversarial bias, sustaining constructive dialogue while accommodating the persona formulation.
To aggregate heterogeneous reasoning paths into a final output, we implement and evaluate two distinct classes of decision-making protocols:
Consensus-Based Protocols.
These protocols enforce active negotiation, driving agents to mathematically converge on a unified hypothesis. A final decision is formalized only when a predefined threshold of inter-agent agreement is satisfied. We define three progressive thresholds: majority (
>
50
%
>50\%
agreement), supermajority (
>
66
%
>66\%
agreement), and unanimity (
100
%
100\%
agreement). Building upon the standard majority-vote mechanism of
Yin et al. (2023)
, we employ a hybrid consensus approach that demands unanimity for initial convergence while defaulting to a supermajority threshold to prevent deadlock at the turn limit.
Voting-Based Protocols.
In contrast to forced consensus, voting protocols decouple the deliberation phase from the final aggregation step, permitting agents to maintain isolated, parallel reasoning tracks throughout the debate. Following the communication horizon, the protocol halts argumentation and prompts a discrete voting mechanism. In the event of a tie, the framework triggers a single supplementary deliberation round, followed by a tie-breaking vote. Inspired by
Yang et al. (2024)
, we utilize a ranked-choice voting scheme wherein each agent issues a strict preference ordering over the candidate solutions (e.g., Borda count equivalent). The hypothesis maximizing the aggregated rank score is established as the final legal entailment.
4
Experiment
4.1
Benchmarks
Table 1
:
Statistics of COLIEE benchmarks for three years.
Data
R07
R06
R05
# samples
82
73
109
avg. # tokens per hypothesis
93.18
96.04
102.34
avg # tokens per premise
231.48
232.51
283.76
avg. # relevant articles
1.10
1.26
1.19
For the experiments, we used the training and test datasets provided in COLIEE 2026 Task 4. Although no model fine-tuning was performed in this study, the training data were utilized to select examples for few-shot prompting.
To analyze year-by-year performance variation, we used evaluation data from three years, spanning from 2024 to 2026. The COLIEE 2026 formal run uses the 2025 test subset, while our methods comparisons are reported as a post-hoc controlled comparison over 2024-2025.
Problem IDs in the dataset follow the Japanese era naming convention, for example, R05 to 2023, and so on up to R07 for 2025.
Each sample in the training and test datasets consists of the following information: Relevant article, Query, Answer (Y: correct/N: incorrect). The statistics of benchmarks are reported in Table
1
.
4.2
Metric
We used accuracy as the evaluation metric to assess the performance of each method. The model outputs were parsed from the fixed output labels: “Answer:Y” (Correct/True) and “Answer:N” (Incorrect/False). Accuracy was computed by comparing the parsed label with the ground truth label.
4.3
Baselines and Implementation Details
We compare L-MAD against various prompting baselines, including Zeroshot, Legal theory chain-of-thought (IRAC)
(
Yu et al., 2022
)
, Fewshot, and Self-Consistency
(
Wang et al., 2022
)
.
The LLMs used for the experiments are Qwen3-8/32B, Qwen3-30B-A3B
(
Yang et al., 2025
)
, Llama3.1-8B
(
Dubey et al., 2024
)
, all instruction following versions. All experiments are conducted on a single A6000 GPU with 49GB of memory.
For implementation, we set the temperature to 0.1 for generating diverse reasoning paths. All models are loaded in full precision
bfloat16
. The self-consistency method is aggregated on three independent samples. Few-shot examples are retrieved using BM25 on the training set. The number of examples is set at 6.
5
Result
Table 2
:
Task performance for two decision protocols (voting and consensus-based) on four LLM backbones. All values and standard deviations are multiplied by 100. Bold and underline indicate the highest and second-highest results per dataset. Green cells indicate that the L-MAD variant outperforms the Zeroshot baseline; red indicates it does not. Standard deviation over three runs.
Model
Method
R07
R06
R05
Average
Qwen3-30B-A3B
Zeroshot
85.77
±
1.41
85.77_{\pm 1.41}
80.37
±
1.58
80.37_{\pm 1.58}
76.45
±
1.06
76.45_{\pm 1.06}
80.86
±
1.35
80.86_{\pm 1.35}
IRAC
86.59
±
0.00
86.59_{\pm 0.00}
79.45
±
0.00
79.45_{\pm 0.00}
75.54
±
0.53
75.54_{\pm 0.53}
80.73
±
0.18
80.73_{\pm 0.18}
Fewshot
89.02
±
1.22
89.02_{\pm 1.22}
80.82
±
0.95
80.82_{\pm 0.95}
80.73
±
1.15
80.73_{\pm 1.15}
83.52
±
1.11
83.52_{\pm 1.11}
Self-Consistency
86.59
79.45
76.15
80.73
L-MAD-consensus
95.12
±2.58
84.93
±1.29
8
5.32
±1.94
88.46
±0.65
L-MAD-voting
91.36
±1.73
80.56
±2.91
82.41
±0.97
84.78
±3.24
Qwen3-32B
Zeroshot
91.87
±
0.70
91.87_{\pm 0.70}
88.58
±
1.58
88.58_{\pm 1.58}
87.16
±0.00
89.20
±
0.76
89.20_{\pm 0.76}
IRAC
94.31
±1.86
87.21
±
0.79
87.21_{\pm 0.79}
85.32
±
1.83
85.32_{\pm 1.83}
88.71
±
1.50
88.71_{\pm 1.50}
Fewshot
92.68
±
0.85
92.68_{\pm 0.85}
84.93
±
1.32
84.93_{\pm 1.32}
81.65
±
0.98
81.65_{\pm 0.98}
86.42
±
1.07
86.42_{\pm 1.07}
Self-Consistency
95.12
87.67
87.16
89.98
L-MAD-consensus
9
2.68
±3.25
87.67
±4.31
8
5.32
±0.86
88.56
±2.59
L-MAD-voting
9
2.68
±0.00
82.19
±1.73
80.73
±4.84
85.20
±1.94
Qwen3-8B
Zeroshot
86.59
±
0.00
86.59_{\pm 0.00}
81.74
±
2.09
81.74_{\pm 2.09}
76.45
±
1.40
76.45_{\pm 1.40}
81.59
±
1.16
81.59_{\pm 1.16}
IRAC
88.62
±
1.41
88.62_{\pm 1.41}
79.45
±
0.00
79.45_{\pm 0.00}
79.20
±
1.91
79.20_{\pm 1.91}
82.66
±
1.11
82.66_{\pm 1.11}
Fewshot
90.24
±
1.10
90.24_{\pm 1.10}
76.71
±
1.45
76.71_{\pm 1.45}
74.31
±
1.22
74.31_{\pm 1.22}
80.42
±
1.27
80.42_{\pm 1.27}
Self-Consistency
87.80
79.45
81.65
82.97
L-MAD-consensus
91.46
±2.58
9
0.41
±1.94
79.82
±0.65
87.23
±1.29
L-MAD-voting
91.46
±0.86
93.15
±2.58
83.49
±1.10
8
9.37
±1.45
Llama3.1-8B
Zeroshot
79.27
±
0.00
79.27_{\pm 0.00}
71.23
±
0.00
71.23_{\pm 0.00}
64.83
±
0.53
64.83_{\pm 0.53}
71.88
±
0.18
71.88_{\pm 0.18}
IRAC
79.67
±
0.70
79.67_{\pm 0.70}
71.23
±
0.00
71.23_{\pm 0.00}
68.81
±
0.00
68.81_{\pm 0.00}
73.10
±
0.23
73.10_{\pm 0.23}
Fewshot
63.41
±
1.55
63.41_{\pm 1.55}
64.38
±
1.12
64.38_{\pm 1.12}
62.39
±
1.38
62.39_{\pm 1.38}
63.39
±
1.36
63.39_{\pm 1.36}
Self-Consistency
79.27
71.23
68.81
73.10
L-MAD-consensus
70.73
±1.22
68.49
±1.15
54.13
±0.95
64.53
±1.38
L-MAD-voting
71.95
±2.91
68.49
±1.58
65.14
±0.70
68.53
±1.83
5.1
Performance of Multi-Agent Debate framework
Table
2
presents the efficacy of the L-MAD framework, which scales non-linearly with the inherent competence of the base language model. Rather than providing a universal performance boost, L-MAD acts as a cognitive amplifier that reveals three distinct behavioral regimes.
First, for highly capable but non-saturating models (such as Qwen3-8B and Qwen3-30B), L-MAD serves as a powerful corrective mechanism. On average, the consensus and voting protocols outperform robust single-agent baselines like self-consistency and IRAC. In this ”sweet spot,” the debate structure successfully aggregates diverse reasoning paths, allowing agents to fact-check one another and converge on more nuanced legal entailments.
Second, we observe a ceiling effect with the most advanced architecture (Qwen3-32B). As a model’s standalone reasoning approaches state-of-the-art, advanced single-agent prompting—particularly self-consistency—saturates the task performance, matching or even marginally exceeding the multi-agent setup. This suggests that when a model possesses sufficiently robust internal semantic representations of legal logic, the computational overhead and complexity of multi-agent collaboration may offer diminishing returns.
Finally, the results expose a critical “competence threshold” for multi-agent systems. When deployed on less-capable models (e.g., Llama3.1-8B), the L-MAD protocols actively degrade performance relative to isolated single-agent baselines. From a theoretical standpoint, this indicates that without a minimum baseline of deductive reasoning, multi-agent frameworks become vulnerable to collaborative hallucination. Instead of correcting mistakes, weak agents blindly validate each other’s flawed premises, cascading errors, and forming a confidently incorrect echo chamber.
5.2
Performance of Decision Protocols
Comparing consensus and voting mechanisms reveals a clear trade-off between individual agent independence and collective alignment. Consensus protocols require agents to actively negotiate and converge on a single shared conclusion across debate rounds. In contrast, voting protocols preserve independent, parallel reasoning paths, delaying aggregation until the final step.
Our empirical results indicate that the optimal decision protocol depends heavily on the reasoning capacity of the underlying model. For larger models (e.g., 30B+ parameters), consensus protocols generally outperform voting. Because these models possess stronger internal logical consistency, they can engage in constructive evaluation—effectively identifying errors in competing arguments, correcting them, and synthesizing a more accurate final rationale. In this regime, the forced alignment mechanism functions as a rigorous, iterative peer-review process.
Conversely, for smaller models (e.g., 8B parameters), the voting mechanism significantly outperforms the consensus approach. Forced consensus in mid-tier models frequently induces sycophancy or premature convergence, where agents tend to uncritically adopt the initial or dominant reasoning path, even if it is fundamentally flawed. Voting mitigates this vulnerability by maintaining the independence of each agent’s analysis. By delaying aggregation to the final stage, voting successfully leverages a ”wisdom of the crowd” effect, preventing the final verdict from being derailed by a single, incorrect agent during the discussion phase.
5.3
Number of Agents and Discussion Rounds
Figure 2
:
Left
: System accuracy as a function of the number of deliberation rounds prior to voting.
Right
: System accuracy as a function of the number of participating agents. The final answers are derived using the ranked voting decision protocol. Trends are indicated by linear regression fits (dotted lines).
Prior literature presents conflicting hypotheses on the scaling properties of multi-agent debate. While some studies suggest that scaling both the number of participating agents and deliberation rounds monotonically improves performance via test-time computational scaling
(
Yin et al., 2023
;
Wang et al., 2024
)
, others warn that extended discourse may induce topic drift or echo-chamber effects
(
Becker, 2024
)
. To optimize the compute-accuracy trade-off and rigorously evaluate these claims within the domain of legal reasoning, we systematically ablate the multi-agent topology parameter space.
Specifically, we independently scale the agent population size (
N
∈
{
2
,
3
,
4
,
5
}
N\in\{2,3,4,5\}
) and the deliberation depth constraint (
T
∈
{
1
,
2
,
3
,
4
,
5
}
T\in\{1,2,3,4,5\}
) on the Qwen3-8B backbone using the ranked-voting protocol. To isolate the marginal effect of each dimension, accuracy with respect to the number of rounds is averaged across all agent configurations, and conversely, accuracy with respect to the agent count is marginalized across all round limits.
The results reveal a clear divergence in how these two scaling axes govern task performance (Figure
2
). Broadening the agent population yields a modest upward trend in accuracy (Figure
2
, right), analogous to the variance reduction and coverage maximization observed in self-consistency techniques
(
Wang et al., 2022
)
. Expanding the diversity of initial propositions generally benefits the final aggregation step by providing a broader sample of reasoning paths.
Conversely, scaling the deliberation depth exhibits a negative trajectory (Figure
2
, left). Rather than self-refining toward the ground truth, agents subjected to extended discussion rounds demonstrate gradual performance degradation. This empirical finding challenges the assumed universal benefits of iterative self-correction
(
Madaan et al., 2023a
)
, aligning instead with emerging skepticism regarding LLM self-refinement stability without external feedback
(
Huang et al., 2023
)
. In specialized domains like legal entailment, extended deliberation intuitively amplifies the risk of adversarial drift, where agents over-critique valid logic and jointly regress toward suboptimal hypotheses.
5.4
Qualitative Analysis
To better understand the quantitative results, we conducted a systematic review of the debate transcripts across both successful and failed entailment cases. This evaluation categorizes the distinct behaviors of multi-agent reasoning into its fundamental strengths and practical limitations within rule-based environments.
5.4.1
Advantages of Multi-Agent Debate
Distributed Interpretation and Error Correction.
In highly capable models (e.g., Qwen3-8B and Qwen3-30B), performance improvements are driven by substantive corrections rather than simple output aggregation. When multi-agent systems correct a unanimous failure of a single agent, the success typically stems from dividing the analytical effort. Figure
3
illustrates this on a complex statute. A single agent often focuses prematurely on a primary clause and misses critical exceptions. In contrast, assigning different roles allows agents to independently parse various parts of the legal text, enabling one agent to identify an overlooked exception and correct the group’s understanding.
Article 102
Gold: Yes  Baseline: No/No/No  MAD: Yes
Statement.
An act performed by a restricted-capacity person as legal agent for another restricted-capacity person may be cancelled on grounds of incapacity.
Article.
An act by a restricted-capacity person as agent cannot be cancelled on grounds of capacity; provided, however, that this does not apply when acting as legal agent for another restricted-capacity person.
Baseline (R1, R3): Reads only the main clause. The act cannot be cancelled. No
Agent 1 (R1): The exception clause carves out an exception that applies here. Yes
Agent 2 (R1): Agree. The exception explicitly allows cancellation in this case. Yes
Agent 3 (R1): Agree. Input matches the exception. Yes
Final:
Yes (correct). A clause that zeroshot reads past is surfaced by the multi-agent parse.
Figure 3
:
MAD-win on Civil Code Article 102. The zeroshot baseline misses the statutory exception in all three runs; L-MAD identifies it on the first turn.
Multi-Step Reasoning Convergence.
Building on the ability to distribute reading, the debate framework also effectively connects multiple legal provisions. The multi-agent setup excels when a legal outcome requires combining two distinct articles (e.g., Articles 253 and 254 in Figure
4
). While a single agent might stop after reading only one provision, collaborating agents can sequentially build upon each other’s points to bridge logical gaps. This behavior constructs a chain of reasoning that single-pass prompting often fails to produce, which explains the heightened performance on datasets with complex legislative requirements.
Articles 253 & 254
Gold: Yes  Baseline: No/No/No  MAD: Yes
Statement.
Co-owner A paid management costs. Co-owner B then transferred their share to C. A may claim reimbursement from C proportional to C’s share.
Article 253.
Each co-owner pays management costs in proportion to their share.
Article 254.
A claim that a co-owner holds against another co-owner may also be exercised against a successor in interest.
Baseline (R1, R3): Considers only Article 253. Successor’s liability is unclear. No
Agent 1 (R1): Article 253 imposes proportional liability; Article 254 transmits the claim to successors. C inherits the obligation. Yes
Agent 2 (R1): Agree. The two articles together support the input. Yes
Agent 3 (R1): Agree. The chain is consistent with the statutory text. Yes
Final:
Yes (correct). The two-article chain is resolved on the first turn of debate.
Figure 4
:
MAD-win on co-ownership reimbursement (Articles 253 and 254). Zeroshot fixates on a single article; L-MAD integrates both provisions in one turn.
Voting Divergence as a Reliability Signal.
Evaluating the voting framework reveals that disagreement among agents serves as a practical, natural indicator of task difficulty. For mid-tier models, instances with unanimous votes achieved approximately 70% accuracy, while split votes—making up about 25% of queries—dropped to 48% accuracy. Protocols that force consensus obscure this metric by requiring all agents to align. By allowing agents to reason independently until the final decision, voting frameworks naturally expose when a model has reached the limits of its understanding. In real-world applications, this allows administrators to automatically route uncertain, split decisions to human experts while confidently automating unanimous cases.
5.4.2
Failure Cases of Multi-Agent Debate
Collaborative Hallucination and the Over-Qualification Cascade.
For less capable models, such as Llama3.1-8B, the debate format introduces a compounding failure mode where errors are validated rather than corrected. As shown in Figure
5
, this cascade begins when an agent introduces a flawed interpretation or an incorrect hesitation. Because subsequent agents lack the reasoning capacity to recognize the error, they adopt the incorrect premise and treat it as a factual constraint. Our analysis shows that expressions of uncertainty or hesitation appear ten times more frequently in the failure logs of weaker models compared to capable ones. This indicates that without a strong foundational reasoning ability, multi-agent frameworks can act as echo chambers that reinforce mistakes.
Statement:
The benefit of a deadline cannot be waived when waiver harms the other party.
Article 136(2):
The benefit may be waived; provided, however, that the waiver may not harm the other party.
Gold:
No.
Agent 1 (round 1):
The statement reflects the exception in Article 136(2), which prohibits waiver when it harms the other party. Yes.
Agent 2 (round 1):
Agree
. The input mirrors the exception clause. Yes.
Agent 3 (round 1):
Agree
. Direct restatement of the exception. Yes.
All round-2 agents reaffirm without disagreement.
Final:
Yes (incorrect). The article restricts the effect of waiver, not the act itself.
Figure 5
:
Cascade on Civil Code Article 136(2). A literal misreading of the exception clause is adopted unchanged through the three remaining turns of the five-turn debate.
Over-Deliberation Drift from Extended Debate
A key limitation of allocating more discussion rounds is the risk of continuous performance degradation, previously identified as over-deliberation drift. Because the framework instructs agents to critique previous answers, extending the discussion selectively encourages the creation of unnecessary doubts. Figure
6
demonstrates how a correct initial voting is overturned in the second round by a flawed objection, leading the group away from the correct answer. When agents cannot resolve ambiguity, they tend to generate increasingly defensive responses instead of producing new insights. Therefore, implementing a rule to stop the debate early when unanimous agreement is reached is essential to preserve correct conclusions and prevent topic drift.
Statement:
The pledgee of immovable property bears management costs unless the contract provides otherwise.
Article 357:
The pledgee shall pay management costs and other burdens related to the immovable.
Gold:
Yes.
Round 1 (all three agents):
The statement aligns with Article 357’s assignment of costs to the pledgee. Yes.
Agent 1 (round 2):
Disagree
. The clause unless provided otherwise is not in Article 357. No.
Agent 2 (round 2):
Disagree
. The input introduces an exception not present in the article. No.
Agent 3 (round 2):
Disagree
. Same reasoning. No.
Final:
No (incorrect). A correct round-1 voting is inverted by a second-round critique.
Figure 6
:
Over-deliberation drift on Civil Code Article 357. Round 1 produces the correct answer; round 2 introduces a spurious objection that flips the entire group.
Fundamental Knowledge Boundaries.
Despite these collaborative benefits, the framework consistently struggles with an irreducible subset of queries (roughly 17-24%). Manual inspection shows that most of these universally failed cases require legal knowledge that is not directly stated in the supplied text. Because all participating agents share the same underlying model and knowledge constraints, they are equally unable to bridge these informational gaps. Consequently, the agents reach the same incorrect conclusion without productive debate. This highlights that simply increasing the amount of computation during inference is insufficient; multi-agent systems must be supported by external knowledge sources—such as legal precedents and hierarchical document context—to surpass this inherent performance limit.
6
Related Work
Legal NLP.
Legal NLP benchmarks such as LexGLUE
(
Chalkidis et al., 2022
)
, LegalBench
(
Guha et al., 2023
)
, and LEXam
(
Fan et al., 2026
)
show that legal language understanding requires models to handle domain-specific terminology, long contexts, and rule-based inference. Our work focuses on COLIEE Task 4
(
Rabelo et al., 2024
;
Goebel et al., 2026
)
, a binary legal textual entailment task over Japanese Civil Code articles. Prior COLIEE systems have explored retrieval, transformer-based entailment models, data augmentation, hybrid symbolic-neural methods, and Japanese LLM prompting for Task 4
(
Goebel et al., 2024
;
Steging and Leeuwen, 2024
;
Onaga and Kano, 2026
)
. More broadly, prompting methods such as in-context learning
(
Brown et al., 2020
)
, chain-of-thought prompting
(
Wei et al., 2022
)
, self-consistency
(
Wang et al., 2022
)
, and IRAC-style legal prompting
(
Yu et al., 2022
)
have been used to improve reasoning without model fine-tuning. However, iterative reasoning is not always reliable: self-refinement can help in some settings
(
Madaan et al., 2023b
)
, but LLMs often fail to self-correct without external feedback
(
Huang et al., 2023
)
. In contrast to prior single-agent legal entailment systems, we study whether the final legal decision can be improved through multi-agent deliberation.
Multi-agent Frameworks.
Multi-agent debate uses multiple LLM instances to propose, critique, and revise answers before aggregation. Prior work shows that such interaction can improve factuality and reasoning
(
Du et al., 2024
)
, and communication-based frameworks study topologies such as memory, relay, report, and debate
(
Yin et al., 2023
)
. However, these gains are not universal: strong single-agent prompting can often match multi-agent discussion
(
Wang et al., 2024
)
, and voting may explain a large part of the improvement attributed to debate
(
Choi et al., 2026
)
. MALLM frames multi-agent systems as a design space involving personas, response generators, communication paradigms, and decision protocols
(
Becker et al., 2025
)
. Persona prompting can diversify reasoning paths but may also introduce instability
(
Kim et al., 2024
)
. Aggregation protocols also matter: consensus forces agents to converge, while voting preserves independent judgments until the final decision
(
Yang et al., 2024
;
Kaesberg et al., 2025a
)
. Our work connects these ideas to statute-grounded legal entailment, comparing consensus and voting across several LLM backbones and analyzing when debate corrects errors, over-deliberates, or amplifies flawed reasoning.
7
Conclusion
In this work, we introduced L-MAD, a framework to evaluate multi-agent debate for complex legal reasoning. We found that simply adding more agents or discussion rounds does not guarantee better results. Instead, MAD acts as a performance multiplier that is strictly limited by the base model’s capabilities: while it helps capable models collaborate and correct mistakes, it offers little benefit to state-of-the-art models and causes weaker models to reinforce each other’s errors.
Furthermore, we demonstrated that forcing models to debate for too long actually harms accuracy, as agents begin to second-guess correct answers. Our results suggest that to improve performance, it is better to increase the number of diverse agents voting independently than to force extended, consensus-driven discussions.
These findings are crucial for safely deploying language models in high-stakes environments like law. When agents naturally disagree during a vote, it serves as a reliable signal to route the difficult problem to a human expert. Ultimately, effective multi-agent collaboration requires carefully balancing the capabilities of the models and the structure of the debate, rather than assuming that longer discussions will naturally yield better answers.
For future work, we plan to explore how asymmetric power dynamics and hierarchical relationships among agents influence debate outcomes. Specifically, investigating whether authoritative or collaborative leadership personas are more effective at guiding discussions could yield more robust decision protocols. Additionally, integrating Explainable AI (XAI) techniques into the MAD framework should be explored to further enhance the transparency and reliability of LLMs in high-stakes legal applications.
Acknowledgements
We sincerely thank the anonymous reviewers for their insightful comments and valuable feedback, which helped improve the quality of this manuscript. This work was partly supported by the Japan Science and Technology Agency (JST) as part of the Adopting Sustainable Partnerships for Innovative Research Ecosystem (ASPIRE), Grant Number JPMJAP25B2.
Impact Statement
This paper presents work whose primary goal is to advance the reliability and interpretability of Machine Learning systems in high-stakes, knowledge-dense domains, specifically focusing on legal reasoning. As Large Language Models are increasingly integrated into judicial, legal, and regulatory workflows, ensuring their deductive accuracy and epistemological robustness is of paramount societal importance.
Our research highlights both the potential and the systemic risks of deploying multi-agent systems in these environments. On the positive side, our findings regarding vote disagreement provide a native, training-free confidence signal. This enables the design of safe, hybrid human-in-the-loop systems where high-uncertainty cases are reliably routed to human legal professionals, thereby mitigating the risk of fully autonomous legal malpractice.
References
Aletras
et al.
(2016)
N. Aletras, D. Tsarapatsanis, D. Preoţiuc-Pietro, and V. Lampos
Predicting judicial decisions of the european court of human rights: a natural language processing perspective
.
PeerJ computer science
2
,
pp. e93
.
Cited by:
§1
.
Aoki
et al.
(2022)
Y. Aoki, M. Yoshioka, and Y. Suzuki
Data-augmentation method for bert-based legal textual entailment systems in coliee statute law task
.
The Review of Socionetwork Strategies
16
(
1
),
pp. 175–196
.
Cited by:
§1
.
Becker
et al.
(2025)
J. Becker, L. B. Kaesberg, N. Bauer, J. P. Wahle, T. Ruas, and B. Gipp
MALLM: multi-agent large language models framework
.
In
Proceedings of the 2025 Conference on Empirical Methods in Natural Language Processing: System Demonstrations
,
I. Habernal, P. Schulam, and J. Tiedemann (Eds.)
,
Suzhou, China
,
pp. 418–439
.
External Links:
Link
,
Document
,
ISBN 979-8-89176-334-0
Cited by:
§6
.
Becker (2024)
J. Becker
Multi-agent large language models for conversational task-solving
.
arXiv preprint arXiv:2410.22932
.
Cited by:
§5.3
.
Bilgin
et al.
(2024)
O. Bilgin, L. Fields, A. Laverghetta Jr, Z. Marji, A. Nighojkar, S. Steinle, and J. Licato
Exploring prompting approaches in legal textual entailment
.
The Review of Socionetwork Strategies
18
(
1
),
pp. 75–100
.
Cited by:
§1
.
Brown
et al.
(2020)
T. Brown, B. Mann, N. Ryder, M. Subbiah, J. D. Kaplan, P. Dhariwal, A. Neelakantan, P. Shyam, G. Sastry, A. Askell,
et al.
Language models are few-shot learners
.
Advances in neural information processing systems
33
,
pp. 1877–1901
.
Cited by:
§2.2
,
§6
.
Chalkidis
et al.
(2020)
I. Chalkidis, M. Fergadiotis, P. Malakasiotis, N. Aletras, and I. Androutsopoulos
LEGAL-BERT: the muppets straight out of law school
.
In
Findings of the Association for Computational Linguistics: EMNLP 2020
,
T. Cohn, Y. He, and Y. Liu (Eds.)
,
Online
,
pp. 2898–2904
.
External Links:
Link
,
Document
Cited by:
§1
.
Chalkidis
et al.
(2022)
I. Chalkidis, A. Jana, D. Hartung, M. Bommarito, I. Androutsopoulos, D. Katz, and N. Aletras
LexGLUE: a benchmark dataset for legal language understanding in English
.
In
Proceedings of the 60th Annual Meeting of the Association for Computational Linguistics (Volume 1: Long Papers)
,
S. Muresan, P. Nakov, and A. Villavicencio (Eds.)
,
Dublin, Ireland
,
pp. 4310–4330
.
External Links:
Link
,
Document
Cited by:
§6
.
Choi
et al.
(2026)
H. K. Choi, J. Zhu, and S. Li
Debate or vote: which yields better decisions in multi-agent large language models?
.
Advances in Neural Information Processing Systems
38
,
pp. 101732–101764
.
Cited by:
§1
,
§6
.
Du
et al.
(2024)
Y. Du, S. Li, A. Torralba, J. B. Tenenbaum, and I. Mordatch
Improving factuality and reasoning in language models through multiagent debate
.
In
Proceedings of the 41st International Conference on Machine Learning
,
ICML’24
.
Cited by:
§6
.
Dubey
et al.
(2024)
A. Dubey, A. Jauhri, A. Pandey, A. Kadian, A. Al-Dahle, A. Letman, A. Mathur, A. Schelten, A. Yang, A. Fan,
et al.
The llama 3 herd of models
.
arXiv e-prints
,
pp. arXiv–2407
.
Cited by:
§4.3
.
Fan
et al.
(2026)
Y. Fan, J. Ni, J. Merane, E. Salimbeni, Y. Tian, Y. Hermstrüwer, Y. Huang, M. Akhtar, F. Geering, O. Dreyer,
et al.
LEXam: benchmarking legal reasoning on 340 law exams
.
In
International Conference on Learning Representations (ICLR)
,
Cited by:
§6
.
Fu
et al.
(2022)
Y. Fu, H. Peng, A. Sabharwal, P. Clark, and T. Khot
Complexity-based prompting for multi-step reasoning
.
arXiv preprint arXiv:2210.00720
.
Cited by:
§2.2
.
Goebel
et al.
(2026)
R. Goebel, Y. Kano, M. Kim, C. Kwan, J. Rabelo, K. Satoh, H. Yamada, and M. Yoshioka
The coliee 2025 competition on legal information extraction and entailment: overview, discussion, and dataset expansion
.
The Review of Socionetwork Strategies
,
pp. 1–31
.
Cited by:
§6
.
Goebel
et al.
(2024)
R. Goebel, Y. Kano, M. Kim, J. Rabelo, K. Satoh, and M. Yoshioka
Overview of benchmark datasets and methods for the legal information extraction/entailment competition (coliee) 2024
.
In
New Frontiers in Artificial Intelligence: JSAI International Symposium on Artificial Intelligence, JSAI-IsAI 2024, Hamamatsu, Japan, May 28–29, 2024, Proceedings
,
Berlin, Heidelberg
,
pp. 109–124
.
External Links:
ISBN 978-981-97-3075-9
,
Link
,
Document
Cited by:
§6
.
Guha
et al.
(2023)
N. Guha, J. Nyarko, D. Ho, C. Ré, A. Chilton, A. K, A. Chohlas-Wood, A. Peters, B. Waldon, D. Rockmore, D. Zambrano, D. Talisman, E. Hoque, F. Surani, F. Fagan, G. Sarfaty, G. Dickinson, H. Porat, J. Hegland, J. Wu, J. Nudell, J. Niklaus, J. Nay, J. Choi, K. Tobia, M. Hagan, M. Ma, M. Livermore, N. Rasumov-Rahe, N. Holzenberger, N. Kolt, P. Henderson, S. Rehaag, S. Goel, S. Gao, S. Williams, S. Gandhi, T. Zur, V. Iyer, and Z. Li
LegalBench: a collaboratively built benchmark for measuring legal reasoning in large language models
.
In
Advances in Neural Information Processing Systems
,
A. Oh, T. Naumann, A. Globerson, K. Saenko, M. Hardt, and S. Levine (Eds.)
,
Vol.
36
,
pp. 44123–44279
.
Cited by:
§6
.
Huang
et al.
(2023)
J. Huang, X. Chen, S. Mishra, H. S. Zheng, A. W. Yu, X. Song, and D. Zhou
Large language models cannot self-correct reasoning yet
.
arXiv preprint arXiv:2310.01798
.
Cited by:
§5.3
,
§6
.
Kaesberg
et al.
(2025a)
L. B. Kaesberg, J. Becker, J. P. Wahle, T. Ruas, and B. Gipp
Voting or consensus? decision-making in multi-agent debate
.
In
Findings of the Association for Computational Linguistics: ACL 2025
,
W. Che, J. Nabende, E. Shutova, and M. T. Pilehvar (Eds.)
,
Vienna, Austria
,
pp. 11640–11671
.
External Links:
Link
,
Document
,
ISBN 979-8-89176-256-5
Cited by:
§6
.
Kaesberg
et al.
(2025b)
L. B. Kaesberg, J. Becker, J. P. Wahle, T. Ruas, and B. Gipp
Voting or consensus? decision-making in multi-agent debate
.
In
Findings of the Association for Computational Linguistics: ACL 2025
,
pp. 11640–11671
.
Cited by:
§1
.
Kim
et al.
(2024)
J. Kim, N. Yang, and K. Jung
Persona is a double-edged sword: mitigating the negative impact of role-playing prompts in zero-shot reasoning tasks
.
arXiv preprint arXiv:2408.08631
.
Cited by:
§3.1
,
§6
.
Langley (2000)
P. Langley
Crafting papers on machine learning
.
In
Proceedings of the 17th International Conference
on Machine Learning (ICML 2000)
,
P. Langley (Ed.)
,
Stanford, CA
,
pp. 1207–1216
.
Cited by:
§A.2.3
.
Madaan
et al.
(2023a)
A. Madaan, N. Tandon, P. Gupta, S. Hallinan, L. Gao, S. Wiegreffe, U. Alon, N. Dziri, S. Prabhumoye, Y. Yang, S. Gupta, B. P. Majumder, K. Hermann, S. Welleck, A. Yazdanbakhsh, and P. Clark
Self-refine: iterative refinement with self-feedback
.
In
Advances in Neural Information Processing Systems
,
A. Oh, T. Naumann, A. Globerson, K. Saenko, M. Hardt, and S. Levine (Eds.)
,
Vol.
36
,
pp. 46534–46594
.
Cited by:
§5.3
.
Madaan
et al.
(2023b)
A. Madaan, N. Tandon, P. Gupta, S. Hallinan, L. Gao, S. Wiegreffe, U. Alon, N. Dziri, S. Prabhumoye, Y. Yang,
et al.
Self-refine: iterative refinement with self-feedback
.
Advances in neural information processing systems
36
,
pp. 46534–46594
.
Cited by:
§6
.
Nie
et al.
(2020)
Y. Nie, A. Williams, E. Dinan, M. Bansal, J. Weston, and D. Kiela
Adversarial NLI: a new benchmark for natural language understanding
.
In
Proceedings of the 58th Annual Meeting of the Association for Computational Linguistics
,
D. Jurafsky, J. Chai, N. Schluter, and J. Tetreault (Eds.)
,
Online
,
pp. 4885–4901
.
External Links:
Link
,
Document
Cited by:
§1
.
Onaga and Kano (2026)
T. Onaga and Y. Kano
Kis: coliee 2025 task 4 solver using japanese llm
.
The Review of Socionetwork Strategies
,
pp. 1–19
.
Cited by:
§6
.
Rabelo
et al.
(2024)
J. Rabelo, R. Goebel, M. Kim, Y. Kano, M. Yoshioka, and K. Satoh
Overview and discussion of the competition on legal information extraction/entailment (COLIEE) 2023
.
The Review of Socionetwork Strategies
18
(
1
),
pp. 27–47
.
Cited by:
§6
.
Steging and Leeuwen (2024)
C. Steging and L. Leeuwen
A hybrid approach to legal textual entailment
.
In
Proceedings of the Eighteenth International Workshop on Juris-Informatics (JURISIN 2024)
,
Cited by:
§6
.
Wang
et al.
(2024)
Q. Wang, Z. Wang, Y. Su, H. Tong, and Y. Song
Rethinking the bounds of LLM reasoning: are multi-agent discussions the key?
.
In
Proceedings of the 62nd Annual Meeting of the Association for Computational Linguistics (Volume 1: Long Papers)
,
L. Ku, A. Martins, and V. Srikumar (Eds.)
,
Bangkok, Thailand
,
pp. 6106–6131
.
External Links:
Link
,
Document
Cited by:
§5.3
,
§6
.
Wang
et al.
(2022)
X. Wang, J. Wei, D. Schuurmans, Q. Le, E. Chi, S. Narang, A. Chowdhery, and D. Zhou
Self-consistency improves chain of thought reasoning in language models
.
arXiv preprint arXiv:2203.11171
.
Cited by:
§2.2
,
§4.3
,
§5.3
,
§6
.
Wei
et al.
(2022)
J. Wei, X. Wang, D. Schuurmans, M. Bosma, F. Xia, E. Chi, Q. V. Le, D. Zhou,
et al.
Chain-of-thought prompting elicits reasoning in large language models
.
Advances in neural information processing systems
35
,
pp. 24824–24837
.
Cited by:
§2.2
,
§6
.
Xiao
et al.
(2021)
C. Xiao, X. Hu, Z. Liu, C. Tu, and M. Sun
Lawformer: a pre-trained language model for chinese legal long documents
.
AI Open
2
,
pp. 79–84
.
Cited by:
§1
.
Yang
et al.
(2025)
A. Yang, A. Li, B. Yang, B. Zhang, B. Hui, B. Zheng, B. Yu, C. Gao, C. Huang, C. Lv, C. Zheng, D. Liu, F. Zhou, F. Huang, F. Hu, H. Ge, H. Wei, H. Lin, J. Tang, J. Yang, J. Tu, J. Zhang, J. Yang, J. Yang, J. Zhou, J. Zhou, J. Lin, K. Dang, K. Bao, K. Yang, L. Yu, L. Deng, M. Li, M. Xue, M. Li, P. Zhang, P. Wang, Q. Zhu, R. Men, R. Gao, S. Liu, S. Luo, T. Li, T. Tang, W. Yin, X. Ren, X. Wang, X. Zhang, X. Ren, Y. Fan, Y. Su, Y. Zhang, Y. Zhang, Y. Wan, Y. Liu, Z. Wang, Z. Cui, Z. Zhang, Z. Zhou, and Z. Qiu
Qwen3 technical report
.
arXiv preprint arXiv:2505.09388
.
Cited by:
§4.3
.
Yang
et al.
(2024)
J. C. Yang, D. Dailisan, M. Korecki, C. I. Hausladen, and D. Helbing
Llm voting: human choices and ai collective decision-making
.
In
Proceedings of the AAAI/ACM Conference on AI, Ethics, and Society
,
Vol.
7
,
pp. 1696–1708
.
Cited by:
§3.2
,
§6
.
Yin
et al.
(2023)
Z. Yin, Q. Sun, C. Chang, Q. Guo, J. Dai, X. Huang, and X. Qiu
Exchange-of-thought: enhancing large language model capabilities through cross-model communication
.
In
Proceedings of the 2023 Conference on Empirical Methods in Natural Language Processing
,
H. Bouamor, J. Pino, and K. Bali (Eds.)
,
Singapore
,
pp. 15135–15153
.
External Links:
Link
,
Document
Cited by:
§3.1
,
§3.2
,
§5.3
,
§6
.
Yu
et al.
(2022)
F. Yu, L. Quartey, and F. Schilder
Legal prompting: teaching a language model to think like a lawyer
.
arXiv preprint arXiv:2212.01326
.
Cited by:
§2.2
,
§4.3
,
§6
.
Zhong
et al.
(2020)
H. Zhong, C. Xiao, C. Tu, T. Zhang, Z. Liu, and M. Sun
How does NLP benefit legal system: a summary of legal artificial intelligence
.
In
Proceedings of the 58th Annual Meeting of the Association for Computational Linguistics
,
D. Jurafsky, J. Chai, N. Schluter, and J. Tetreault (Eds.)
,
Online
,
pp. 5218–5230
.
External Links:
Link
,
Document
Cited by:
§1
.
Appendix A
Additional Experiment Details.
A.1
Agents’ Personas
Judge
: You are an impartial, highly analytical Japanese Presiding Judge in a civil chamber. Your objective is to evaluate the arguments of the Plaintiff and Defendant, verify their statutory mapping against the Civil Code, and render a final verdict.
Attorney
: You are a precise, methodical Japanese civil litigator. Your sole objective is to prove that the Premise legally ENTAILS the Hypothesis under the Japanese Civil Code.
Lawyer
: You are a sharp, analytical Japanese civil lawyer. Your objective is to prove that the Premise does NOT legally entail the Hypothesis.
A.2
Prompt Templates
This section provides the exact prompt templates used for the baselines evaluated in our experiments. All experiments were conducted using Japanese prompts, natively aligning with the language of the Japanese Civil Code corpus. The text enclosed in brackets
{...}
represents dynamic variables substituted at inference time.
A.2.1
Zeroshot Prompting
System Prompt (Zeroshot)
```
あなたは日本の民法に精通した法律専門家です。
与えられた民法条文と法律問題を注意深く分析し、
条文が問題の答えを「はい」と裏付けているかどうかを判断してください。

回答は必ず以下の形式で出力してください：
判断: Y または N
理由: （簡潔な説明）
```
User Prompt (Zeroshot)
```
以下の民法条文と法律問題を読んでください。

【関連条文】
{article_text}

【法律問題】
{query}

この条文を根拠として、問題の答えは「はい」と言えますか？
判断: Y または N で答え、その理由を説明してください。
```
A.2.2
IRAC (Legal Reasoning CoT) Prompting
System Prompt (IRAC)
```
あなたは日本の民法に精通した法律専門家です。
提示された法的推論の手法に従い、仮説が「真」か「偽」かを分析してください。
手法：争点、法則、適用、結論。
回答は必ず以下の形式で出力してください：
判断: Y または N
理由: （簡潔な説明）
```
User Prompt (IRAC)
```
以下の民法条文と法律問題を読んでください。

【関連条文】
{article_text}

【法律問題】
{query}

この条文を根拠として、問題の答えは「はい」と言えますか？
判断: Y または N で答え、その理由を説明してください。
```
A.2.3
Fewshot Prompting
System Prompt (Fewshot)
```
あなたは日本の民法に精通した法律専門家です。
与えられた民法条文と法律問題を分析し、
条文が問題の答えを「はい」と裏付けているか判断してください。

回答は必ず以下の形式で出力してください：
判断: Y または N
理由: （簡潔な説明）
```
User Prompt (Fewshot)
```
以下の例を参考にして判断してください。

{examples}

今度はあなたが判断してください。

【関連条文】
{article_text}

【法律問題】
{query}

判断: Y または N で答え、その理由を説明してください。
```
21
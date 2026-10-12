---
title: 'ProMAS: Proactive Error Forecasting for Multi-Agent Systems'
id: promas-proactive-error-forecasting-for-multi-agent-systems
tags:
- ai-software-factory-architecture-58e4cc
- probabilistic-skill-sequencing
- agent-trace-analysis
- markov-models
created: '2026-10-12T08:36:46.704753Z'
updated: '2026-10-12T08:37:32.321139Z'
source: https://arxiv.org/abs/2603.20260
source_domain: arxiv.org
fetched_at: '2026-10-12T08:36:46.703480Z'
fetch_provider: builtin
status: draft
type: note
tier: institutional
content_type: paper
deprecated: false
summary: 'ArXiv preprint (Zhao, Liu, Zhang, Ma, Cheng, Wang, Liu; Zhejiang University,
  March 2026) proposes PROMAS, a proactive (not post-hoc) error-forecasting framework
  for multi-agent LLM systems that models the reasoning trajectory as a first-order
  Markov process over a latent semantic manifold, predicting failure risk before the
  triggering action completes rather than auditing logs afterward. Mechanism: an encoder
  maps dialogue history to a latent state s_t; a ''Causal Delta'' Δt = s_t - s_{t-1}
  captures the semantic displacement (by analogy to velocity in physical collision
  avoidance) introduced by each agent turn; deltas are quantized into a ''Vector Markov
  Space'' modeling reasoning as probabilistic state transitions with a Markov state-transfer
  matrix (built from success-success / success-failure / failure-failure transition
  statistics on training data); a Proactive Prediction Head estimates failure risk
  ρt = E[P(fail | s_{t-1}, predicted Δt)] from history alone, without seeing the completed
  current action; and a Dynamic Jump Detection algorithm flags the first logic breach
  by monitoring risk *acceleration* (sudden jumps) rather than a static risk threshold.
  Evaluated on the Who&When benchmark against both offline auditors (All-at-Once 10.37%
  step accuracy, Binary Search 13.54%, Famas/SBFL 29.35%, AgenTracer 31.89%, all requiring
  full/look-ahead context) and the online reactive monitor MASC (21.62% step accuracy,
  processing 42.19% of the dialogue): PROMAS achieves 22.97% step-level localization
  accuracy — beating MASC and more than doubling All-at-Once — while using only 26.79%
  of the dialogue (Information Fraction η) and, unlike MASC, requiring zero look-ahead.
  Agent-level attribution accuracy reaches 40.54% overall (46.53% on algorithm-generated
  failure logs vs. 27.66% on hand-crafted/human-designed logs, the harder, more semantically
  subtle case), versus a 23.71% random baseline. The paper explicitly frames this
  as an accuracy-for-latency tradeoff: PROMAS sacrifices precision relative to full-context
  offline methods (AgenTracer''s 31.89%) in exchange for the ability to intervene
  before a task concludes, cutting data/context overhead by about 73% relative to
  MASC''s reactive overhead baseline.'
raw_file: raw/promas-proactive-error-forecasting-for-multi-agent-systems.pdf
doi: arXiv:2603.20260
---

*Suggested by [[github-yintonghuoawesome-agent-trajectory-a-collection-of-agent-trajectory-analy]] — listed in awesome-agent-trajectory as Markov-transition-based failure forecasting, directly relevant to probabilistic skill-sequence prediction*

ProMAS: Proactive Error Forecasting for Multi-Agent Systems
Using Markov Transition Dynamics
Xinkui Zhao 1 Sai Liu 1 Yifan Zhang 1 Qingyu Ma 1 Guanjie Cheng 1 Naibo Wang 1 Chang Liu 1
Abstract
The integration of Large Language Models into
Multi-Agent Systems (MAS) has enabled the so-
lution of complex, long-horizon tasks through
collaborative reasoning. However, this collec-
tive intelligence is inherently fragile, as a single
logical fallacy can rapidly propagate and lead to
system-wide failure. Most current research re-
lies on post-hoc failure analysis, thereby hinder-
ing real-time intervention. To address this, we
propose PROMAS, a proactive framework utiliz-
ing Markov transitions for predictive error anal-
ysis. PROMAS extracts Causal Delta Features
to capture semantic displacement, mapping them
to a quantized Vector Markov Space to model
reasoning as probabilistic transitions. By inte-
grating a Proactive Prediction Head with Jump
Detection, the method localizes errors via risk
acceleration rather than static thresholds.
On
the Who&When benchmark, PROMAS achieves
22.97% step-level accuracy while processing only
27% of reasoning logs. This performance rivals
reactive monitors like MASC while reducing data
overhead by 73%. Although this strategy entails
an accuracy trade-off compared to post-hoc meth-
ods, it significantly improves intervention latency,
balancing diagnostic precision with the real-time
demands of autonomous reasoning.
1. Introduction
The evolution of Large Language Models (LLMs) has fun-
damentally reshaped artificial intelligence, transitioning
the field from isolated single-agent executors to sophis-
ticated Multi-Agent Systems (MAS). While single-agent
paradigms have demonstrated remarkable proficiency in
code generation (Liu et al., 2024; Zhong et al., 2024; Dong
et al., 2024), data analysis (Xie et al., 2024; Li et al., 2024;
Hong et al., 2025), and instruction following (Zhao et al.,
1Zhejiang University.
Correspondence to:
Yifan Zhang
<12451018@zju.edu.cn>.
Preprint. March 24, 2026.
2025; Yue, 2025; Zhu et al., 2024), they struggle with the
constrained context windows and specialized knowledge
deficits inherent in complex, long-horizon tasks (Du et al.,
2023; Valmeekam et al., 2023; Ke et al., 2025). To address
these limitations, research has pivoted toward MAS, where
diverse, specialized agents collaborate to decompose and
solve intricate objectives (Islam et al., 2024; Zhang et al.,
2025c). However, this collaborative intelligence is inher-
ently fragile; a minor logical fallacy or “hallucination” by
a single agent can rapidly propagate, leading to system-
wide failure. Consequently, the mistake identification prob-
lem—pinpointing precisely When a logic breach occurs and
Who is responsible—has become critical for ensuring the
reliability of autonomous reasoning.
Foundational research in this domain has formalized the
landscape of error localization.
Benchmarks such as
Who&When (Zhang et al., 2025b) established protocols for
attributing failures to specific agents and timestamps, shift-
ing the focus from aggregate task success to the transparency
of the reasoning process. Building on this, state-of-the-
art (SOTA) methods have improved attribution precision
through spectrum-based fault localization (SBFL) (Ge et al.,
2025), supervised execution tracing like AgenTracer (Zhang
et al., 2025a), and iterative feedback loops (Du et al., 2023).
Despite their utility, existing methodologies remain predom-
inantly post-hoc. These frameworks function as “auditors,”
analyzing reasoning logs only after a failure has manifested.
Even approaches claiming “real-time” monitoring are of-
ten conceptually reactive, identifying errors only via their
immediate negative impact. This reliance on “incremental
post-hoc auditing” complicates temporal credit assignment,
as the distinction between a root cause and its downstream
ripples blurs as the dialogue progresses.
This raises a fundamental question: Can we move beyond
reactive auditing to develop a proactive defense mechanism
capable of pinpointing logical failures at their inception?
To address this, we propose a novel perspective that paral-
lels logical reasoning trajectories with physical motion
in autonomous systems. Just as embodied agents mitigate
risk by estimating action safety a priori to prevent colli-
sions (Wang et al., 2025; Mou et al., 2026), we treat logical
1
arXiv:2603.20260v1  [cs.AI]  12 Mar 2026


---

ProMAS: Proactive Error Forecasting for Multi-Agent Systems Using Markov Transition Dynamics
fallacies as “semantic collisions” that derail a reasoning
path. We introduce PROMAS, a proactive framework for
pre-analysis error prediction. By characterizing logical
transitions as causal displacements, PROMAS monitors the
“velocity” of semantic shifts within a latent manifold. This
allows the system to foresee and localize logic breaches
immediately, applying the rigorous pre-emption of physical
collision avoidance to complex multi-agent reasoning.
Our approach comprises three key components: (1) Causal
Delta Features that extract semantic displacement between
consecutive actions via contrastive learning; (2) a Vector
Markov Space that models reasoning as a probabilistic
chain of transitions; and (3) a Proactive Prediction Head
coupled with a Jump Detection algorithm to localize mis-
takes via risk acceleration. Experimental results demon-
strate that PROMAS achieves step-level accuracy compet-
itive with offline diagnostic tools while significantly out-
performing real-time baselines. By shifting from reactive
diagnosis to proactive defense, we offer a robust solution
for error management in autonomous MAS.
Our contributions are summarized as follows:
• We introduce the paradigm of proactive pre-analysis
for MAS error management, pioneering a shift from
post-hoc failure summarization to pre-emptive risk pre-
diction during the reasoning process.
• We propose a transition-centric framework integrating
Causal Delta representations with a Vector Markov
Entropy model and Jump Detection. This combina-
tion captures logical “velocity” to localize breaches via
risk acceleration, effectively identifying early warning
signals.
• PROMAS matches the localization precision of SOTA
offline diagnostic tools on the Who&When benchmark
while operating under real-time constraints and pro-
cessing only 25% of the complete reasoning logs on
average.
2. Problem Formulation
In this section, we formalize the dynamics of multi-agent
reasoning and define the task of proactive mistake local-
ization. We depart from traditional post-hoc auditing by
framing this challenge as a real-time risk estimation task
defined over semantic transitions.
2.1. The Multi-Agent Reasoning System
We define a Multi-Agent Reasoning System (MAS) as a
tuple (A, T , S), where:
• A = {A1, A2, . . . , An} is a set of heterogeneous
agents, where each agent Ai represents a policy map-
ping interaction histories to natural language actions.
• T represents the task context, including the initial
global constraints and objectives.
• S = (m1, m2, . . . , mL) denotes the reasoning trajec-
tory, where each turn mt = (at, xt) comprises an
acting agent at ∈A and its generated content xt.
Latent Semantic Transitions.
We posit that the rea-
soning process evolves along a latent semantic manifold
H ⊆Rd. An encoder ϕ maps the dialogue history Ht =
{T , m1, . . . , mt} to a latent state st ∈H. Drawing in-
spiration from state estimation in embodied MAS—where
physical actions induce spatial displacement—we define the
Causal Delta as:
∆t = st −st−1
(1)
This ∆t captures the logical “force” or directional shift in-
troduced by agent at at step t. We model the state sequence
{s0, s1, . . . , sL} as a first-order Markov process, assuming
that the validity of the subsequent state st is conditioned
primarily on the current state st−1 and the semantic dis-
placement ∆t.
2.2. Proactive Mistake Localization
The primary objective of proactive mistake localization is to
anticipate and identify the initial logic breach immediately
upon occurrence, thereby preventing cascading failures.
Definition 1 (The First Logic Breach). In a failed tra-
jectory, we posit the existence of a unique timestamp
t∗and a corresponding agent a∗such that the transition
st∗−1
∆t∗
−−→st∗marks the first deviation from the task’s
logical manifold. States where t < t∗are designated as safe,
while states where t ≥t∗are deemed corrupted due to error
propagation.
Definition 2 (Pre-analysis Error Prediction). In contrast
to reactive analysis, which relies on the completed action xt
or future turns {mt+1, . . . , mL} for diagnosis, pre-analysis
prediction estimates the risk ρt based on the anticipated
displacement ˆ∆t. Given the history Ht−1, the detector D
computes:
ρt = EP ( ˆ∆t|Ht−1)[P(fail|st−1, ˆ∆t)]
(2)
where P(·) quantifies the transition risk from a safe state to
a failure state within the Markov space.
Optimization Objective. The central goal of PROMAS is
to maximize the probability of Exact Localization. Since
each reasoning turn mt corresponds to a specific acting
agent at, correctly identifying the failure timestamp ˆt = t∗
2


---

ProMAS: Proactive Error Forecasting for Multi-Agent Systems Using Markov Transition Dynamics
History Context 
Statet-1
Stept-1
Frozen LLM
Attention Pool
Ht-1
Predictive
Riskt-1
Detection
Stept
Ht
ftask
fhistory
Frozen LLM+MLP
Train set
Success 
Action
Failure 
Action
success->success
success->failure
…
Markov state 
transfer matrix
Building
Agent
Train Proactive Head
Statet-1
Input
Predict
Statet
If the mistake
∆t = st - st-1
Input
ProMAS
Causal Manifold Learning
Vector Markov Modeling
Output
Predictive Risk Estimation
Figure 1. Overview of the PROMAS. The architecture is divided into two coupled components: (Left) Proactive Inference: The
dialogue history Ht−1 is encoded into a latent state st−1 to predict the cluster distribution and transition risk Rt of the next action. A
Jump Detection mechanism identifies logic breaches by monitoring risk mutations. (Right) Multi-stage Training: (i) Causal Manifold
Learning aligns semantic displacement features ∆t = st −st−1 via triplet loss; (ii) Transition Modeling constructs discrete Markov
matrices from successful and failed trajectories; (iii) Proactive Head Optimization trains the model to anticipate future action clusters.
inherently resolves the attribution problem ˆa = a∗. For-
mally, we define our objective as:
max P(ˆt = t∗)
subject to
It < ξ, ∀t < t∗
(3)
where ˆt = arg mint{ρt > τ} denotes the first step trigger-
ing the detection signal. We decompose this objective into
two operational priorities:
• Exact Step-level Alignment: Maximize the Step Hit
rate, ensuring the predicted breach ˆt aligns perfectly
with the ground-truth rupture t∗. This metric serves
as a sufficient statistic for both temporal precision and
agent attribution.
• Causal False Alarm Suppression: Minimize the
Early Warning Rate P(ˆt < t∗) and the Missed De-
tection Rate. This requires the risk estimator ρt to
remain below the activation threshold during safe rea-
soning cycles, exhibiting a sharp mutation only at the
inception of a logic breach.
By formulating mistake localization as a mutation detec-
tion problem over predictive Markov transitions, PROMAS
identifies logical ruptures at their inception, establishing a
non-intrusive safety boundary for autonomous multi-agent
reasoning.
3. Methodology
The PROMAS framework transforms the reactive error-
auditing paradigm into a proactive transition-monitoring
task.
As illustrated in Figure 1, the system comprises
three hierarchical modules: (i) Causal Manifold Learning,
which extracts semantic displacement features; (ii) Vector
Markov Modeling, which quantizes action trajectories; and
(iii) Predictive Risk Estimation, which localizes logical
breaches via mutation detection.
3.1. Causal Manifold and Transition Learning
A fundamental premise of our work is that logical consis-
tency in Multi-Agent Reasoning (MAR) is an emergent
property of transitions rather than isolated states. To cap-
ture this dynamic, we project the high-dimensional dialogue
history onto a latent semantic manifold H.
Hierarchical Feature Extraction.
Let Ht−1
=
(T, m1, . . . , mt−1) denote the history up to step t −1. We
employ a frozen LLM backbone Φ to generate hidden states.
3


---

ProMAS: Proactive Error Forecasting for Multi-Agent Systems Using Markov Transition Dynamics
To distill logical signals from verbose natural language, we
introduce a learnable Attention Pooling layer ψ. The com-
pressed state representation st−1 ∈Rd is derived as:
st−1 =
L
X
i=1
αi · Φ(Ht−1)i,
where α = Softmax(MLP(Φ(Ht−1)))
(4)
Here, αi represents the learned importance weight of the
i-th token in the history trajectory.
Causal Delta Features. Drawing inspiration from safety
estimation in embodied systems—where physical actions
induce state displacement—we define the Causal Delta, ∆t,
as the semantic shift introduced by an agent’s action at step
t:
∆t =
(
st
if t = 0
st −st−1
if t > 0
(5)
This ∆t isolates the logical “velocity” of the reasoning
process, effectively filtering out static environmental noise.
Contrastive Manifold Alignment. To ensure ∆t effec-
tively discriminates logic breaches, we train a projection
head fθ via Hard Negative Mining. Given an anchor failure
delta ∆fail, a positive sample ∆pos drawn from the failure
manifold, and a hard negative ∆hard (defined as the tran-
sition immediately preceding the failure within the same
trajectory), we minimize the triplet margin loss:
Ltri = max

0, D(fθ(∆fail), fθ(∆pos))
−D(fθ(∆fail), fθ(∆hard)) + m

(6)
where D(·, ·) denotes the cosine distance and m = 1.0 is
the margin. This optimization encourages logical fallacies
to cluster into distinct regions within the causal space V ⊆
R1024.
3.2. Action Quantization and Markovian Trajectories
Although the continuous manifold V captures rich semantic
details, estimating transition risks directly within this high-
dimensional space remains computationally challenging. To
bridge the gap between neural representations and discrete
reasoning states, we quantize the causal space into a finite
set of K Action Prototypes.
Unified Quantization. We employ Mini-Batch K-Means
to partition the manifold V into disjoint regions.
Let
C = {c1, . . . , cK} denote the set of cluster centroids. Each
semantic displacement fθ(∆t) is mapped to its nearest pro-
totype index zt via the quantization operator q(·):
zt = q(fθ(∆t)) = arg
min
k∈{1,...,K} ∥fθ(∆t) −ck∥2
(7)
This discretization transforms the unstructured dialogue
into a sequence of symbolic transitions, facilitating robust
statistical modeling of reasoning trajectories.
Transition Probability Estimation. We model the reason-
ing process as a first-order Markov chain over the sequence
of clusters. We construct two empirical count matrices, Nfail
and Nsucc ∈RK×K, where entries Nfail
ij and Nsucc
ij
record
the transition frequencies from prototype i to j in failed and
successful trajectories, respectively.
To mitigate the data sparsity inherent in diverse agent in-
teractions, we derive the Bayesian-smoothed transition
likelihood λij. This metric represents the posterior proba-
bility of failure given a specific transition:
λij = P(Failure | i, j) =
Nfail
ij + ϵ
Nfail
ij + Nsucc
ij
+ β
(8)
where ϵ and β serve as smoothing priors. This formula-
tion ensures that for rare or unseen transitions—common
in MAS with complex agent behaviors—risk estimation re-
mains stable rather than yielding extreme values. For the
initial step (t = 0), we define a prior likelihood λstart,j us-
ing separate start-state counts to account for the absence of
preceding context.
3.3. Proactive Anticipation and Expected Risk
The core innovation of PROMAS lies in its shift from re-
active observation to proactive anticipation. By forecasting
potential logical trajectories before an action is realized,
the framework preemptively identifies high-risk transitions,
facilitating intervention before error propagation occurs.
Distribution Prediction. We introduce a Proactive Predic-
tion Head gω, implemented as a Multi-Layer Perceptron
(MLP) with layer normalization. Given the latent state st−1,
which encapsulates the history up to the current turn, gω
maps this high-dimensional semantic context to a categori-
cal distribution πt over the K action prototypes:
πt = ˆP(zt | Ht−1) = Softmax(gω(st−1)) ∈RK
(9)
Here, πt,k represents the predicted probability that the sub-
sequent logical displacement assigns to cluster k. The head
is optimized using cross-entropy loss with label smoothing;
this regularization prevents overfitting to specific reasoning
paths and accounts for the semantic ambiguity inherent in
multi-agent interactions.
Expected Transition Risk. To mitigate sensitivity to LLM
stochasticity, we avoid relying on a single deterministic
prediction. Instead, we formulate the proactive risk Rt as the
Expected Failure Likelihood over the predicted action space.
We restrict the calculation to the Top-M most probable
clusters to filter out the low-probability tail, which often
4


---

ProMAS: Proactive Error Forecasting for Multi-Agent Systems Using Markov Transition Dynamics
contains semantic noise. The risk score is computed as:
Rt =
X
k∈Top-M
˜πt,k·λzt−1,k,
where ˜πt,k =
πt,k
P
j∈Top-M πt,j
(10)
and λzt−1,k denotes the Bayesian-smoothed failure likeli-
hood derived from the Markov Space. By treating the forth-
coming action as a random variable and marginalizing the
risk over the predicted distribution, PROMAS effectively
estimates the risk profile of the reasoning process. This ap-
proach ensures that high-risk alerts are triggered only when
the most likely future steps align significantly with historical
failure patterns, providing a robust, pre-emptive signal for
error localization.
3.4. Localization via Dynamic Jump Detection
A critical challenge in long-horizon multi-agent reasoning is
the inherent non-stationarity of transition risks. As dialogue
complexity accumulates, the baseline risk score Rt often
exhibits natural “semantic drift,” where background uncer-
tainty rises even during logically sound trajectories. Conse-
quently, relying on static global thresholds τ necessitates a
suboptimal trade-off between excessive Early Warnings and
frequent Missed Detections.
To address this, we propose a Dynamic Jump Detection al-
gorithm inspired by anomaly detection in stochastic signals.
We treat the risk sequence {R1, . . . , RL} as a discrete-time
signal and focus on its first-order temporal difference, or
risk velocity, defined as ∇Rt = Rt −Rt−1. This formula-
tion enables the model to distinguish between the gradual
increase in contextual complexity and the abrupt logical
ruptures that characterize an error.
Formally, a localization alert is triggered at step t according
to the decision rule Dt:
Dt =





True
(Rt > τbase) ∧(∇Rt > δ)
True
Rt > τmax
False
otherwise
(11)
where τbase is a baseline threshold calibrated to the p-th per-
centile (e.g., 85%) of the training risk distribution to filter
low-level noise. The parameter δ denotes the jump sensi-
tivity, representing the minimum rate of increase required
to signal a logical deviation. To ensure robustness in cases
of extreme logical collapse—where the risk score may sat-
urate without a sharp instantaneous jump—we incorporate
an absolute panic threshold τmax.
By prioritizing the relative rate of change in risk over its
absolute magnitude, PROMAS effectively applies a high-
pass filter to the reasoning trajectory. This design ensures
the system is invariant to background semantic fluctuations,
intercepting the reasoning flow precisely at the inception of a
logical failure to maximize step-level localization accuracy.
4. Experiments
This section evaluates PROMAS using the Who&When
benchmark (Ge et al., 2025). Our analysis aims to address
three primary research questions:
• RQ1: Does PROMAS outperform existing reactive
and static detection methods in terms of localization
accuracy?
• RQ2: How effectively does the Jump Detection mech-
anism suppress false alarms?
• RQ3: Does the Causal Delta representation capture
logic breaches more effectively than absolute state rep-
resentations?
4.1. Experimental Setup
Benchmark. We employ the Who&When dataset (Zhang
et al., 2025b), a specialized benchmark designed for identi-
fying errors in multi-agent reasoning. The dataset comprises
complex multi-turn dialogues (e.g., mathematical reason-
ing, logic puzzles) where each sample is annotated with the
ground-truth timestamp (t∗) and the responsible agent (a∗)
corresponding to the initial logic breach.
Baselines. We compare PROMAS against three representa-
tive paradigms of failure attribution, spanning from post-hoc
auditing to real-time monitoring:
• Offline LLM-Based Heuristics: This category in-
cludes “LLM-as-Detector” approaches that directly
prompt Large Language Models to identify erro-
neous steps. We adopt the strategies defined in the
Who&When benchmark (Zhang et al., 2025b), specifi-
cally the All-at-Once, Step-by-Step, and Binary Search
protocols.
• Offline Attribution Models: These state-of-the-art
diagnostic tools operate post-hoc, analyzing logs only
after task completion: (i) AgenTracer (Zhang et al.,
2025a): A supervised framework fine-tuned to trace
execution flows and attribute failures to specific agents.
(ii) Famas (Ge et al., 2025): A statistical Spectrum-
Based Fault Localization (SBFL) approach that corre-
lates agent activity patterns with final success or failure
outcomes.
• Online Monitoring Baselines: These methods oper-
ate incrementally during execution. We compare our
approach with MASC (Shen et al., 2025), a state-of-
the-art online monitor. Unlike PROMAS, MASC is
fundamentally reactive, detecting mistakes by assess-
ing the immediate semantic impact of a completed
action rather than predicting future transition risks.
5


---

ProMAS: Proactive Error Forecasting for Multi-Agent Systems Using Markov Transition Dynamics
Table 1. Performance comparison of failure attribution accuracy (%) on the Who&When benchmark. We categorize methods into
Post-hoc Analysis (performing diagnosis after task completion) and Proactive Monitoring (identifying breaches during execution). G
denotes ground-truth guidance. PROMAS achieves competitive precision while adhering to the strict causality constraint of real-time
environments.
Method
Algorithm-Generated
Hand-Crafted
Total
Agent-level
Step-level
Agent-level
Step-level
Agent-level
Step-level
-
Random
29.10
19.06
12.00
4.16
23.71
14.36
Offline
LLM-Based
All-at-Once
51.12
13.52
53.44
3.51
51.85
10.37
Step-by-Step
26.02
15.31
53.44
8.77
28.14
13.25
Binary Search
30.11
16.59
36.21
6.90
32.03
13.54
All-at-Once (G)
54.33
12.50
55.17
5.27
54.59
10.22
Step-by-Step (G)
35.20
25.51
34.48
7.02
34.97
19.68
Binary Search (G)
44.13
23.98
51.72
6.90
46.52
18.60
Finetune-Based
AgenTracer
63.73
37.30
63.82
20.68
63.78
31.89
AgenTracer (G)
69.62
42.86
69.10
20.68
69.73
36.22
SBFL-Based
Famas
55.56
23.81
62.07
41.38
57.61
29.35
Online
MASC
-
21.72
-
20.79
-
21.62
MASC (G)
-
19.24
-
18.25
-
18.92
PROMAS (Ours)
46.53
24.75
27.66
19.14
40.54
22.97
Implementation Details. To ensure a rigorous and fair com-
parison, all methods are evaluated using the identical dataset
version and evaluation protocols. (1) LLM-as-Detector:
For heuristic strategies, we employ the GPT-4o model,
strictly adhering to the prompts and search protocols de-
fined in the Who&When benchmark (Zhang et al., 2025b).
(2) Offline Baselines: For AgenTracer and Famas, we re-
port the performance figures directly from their respective
original publications (Zhang et al., 2025a; Ge et al., 2025),
as these were evaluated on the same tasks and metrics un-
der optimized configurations. (3) Online Monitors: Both
PROMAS and the MASC baseline (Shen et al., 2025) uti-
lize Meta-Llama-3.1-8B-Instruct as the frozen se-
mantic backbone.
4.2. Overall Performance
Table 1 summarizes the performance of PROMAS against
representative paradigms. We evaluate the models based
on their ability to identify the precise moment of failure
(Step-level) and the responsible agent (Agent-level).
Precision in Temporal Localization (When). The Step-
level accuracy is the most critical indicator for proactive
monitoring. PROMAS achieves a total Step-level accuracy
of 22.97%, demonstrating a substantial advantage over stan-
dard offline LLM-based heuristics, more than doubling the
performance of All-at-Once (10.37%) and significantly out-
performing Binary Search (13.54%). Most notably, within
the Online category, PROMAS surpasses the reactive base-
line MASC (21.62%). This result is significant because,
unlike MASC which relies on static LLM checks, our frame-
work utilizes dynamic transition modeling. This confirms
that capturing the “velocity” of reasoning via Causal Deltas
is more effective for real-time pinpointing than discrete state
analysis.
Effectiveness in Agent Attribution (Who). Regarding
Agent-level identification, PROMAS yields a total accu-
racy of 40.54%, providing a reliable signal well above the
random baseline (23.71%). We observe a performance di-
vergence between data splits: on Algorithm-Generated logs,
our method reaches a high accuracy of 46.53%, whereas
performance on Hand-Crafted logs is lower (27.66%). This
suggests that human-designed errors tend to be more seman-
tically subtle and context-dependent, making them harder
to detect without full-trajectory access. However, the strong
performance on algorithmic errors validates the robustness
of the Vector Markov Space in modeling distinct agent-
specific risk profiles during automated interactions.
Cross-Category Comparison. Acknowledging the struc-
tural gap, supervised offline methods like AgenTracer
(31.89% Step-level) naturally outperform online meth-
ods by leveraging ”look-ahead” information and full
context visibility.
However, PROMAS successfully
6


---

ProMAS: Proactive Error Forecasting for Multi-Agent Systems Using Markov Transition Dynamics
bridges the gap between diagnosis and intervention. By
achieving competitive precision (22.97%) under strict
causality constraints—surpassing even some offline base-
lines—PROMAS establishes itself as a viable solution for
real-time error interception, trading a controlled margin of
accuracy for the crucial ability to act before a task concludes.
Table 2. Information Efficiency Analysis. We compare PROMAS
with baselines regarding the processed context ratio. Look-ahead
indicates if future (post-error) information is required. η denotes
the Information Fraction: the percentage of dialogue processed
at the time of detection. PROMAS achieves high accuracy with
minimal context.
Method
Look-ahead
η (%) ↓
Step Acc. ↑
Random
None
50.0
14.36
ALL-at-Once
Full
100.0
10.37
AgenTracer
Full
100.0
31.89
Famas
Full
100.0
29.35
MASC
None
42.19
21.62
PROMAS
None
26.79
22.97
4.3. Information Efficiency and Detection Latency
To evaluate the practical utility of PROMAS, we analyze the
critical trade-off between localization accuracy and contex-
tual consumption. As summarized in Table 2, we compare
our framework against both offline auditors and online mon-
itors using the Information Fraction (η) and Look-ahead
dependency.
Early Detection with Minimal Context. A primary advan-
tage of PROMAS is its ability to localize mistakes preemp-
tively. While post-hoc methods like AgenTracer and Famas
require the complete reasoning trajectory (η = 100%) to
diagnose errors, PROMAS triggers a detection signal at an
average η of only 26.79%. This implies that our framework
identifies logical ruptures when nearly three-quarters of the
dialogue remains unexecuted. Such early intervention capa-
bility is crucial for autonomous systems, as it allows for the
termination of faulty reasoning paths before they propagate
into cascading failures, significantly reducing computational
waste.
Superiority over Online Baselines. When compared to the
reactive online baseline MASC, PROMAS demonstrates a
superior balance of speed and precision. Despite process-
ing significantly less context (η = 26.79% vs. 42.19%),
our method achieves higher Step-level accuracy (22.97%
vs. 21.62%). This indicates that PROMAS is not only
faster—reducing the observation window by over 15 per-
centage points—but also more sensitive to the inception of
errors. Although there is a natural performance gap com-
pared to offline SOTA methods that benefit from future
information (e.g., AgenTracer at 31.89%), PROMAS still
doubles the accuracy of the naive ALL-at-Once approach
(10.37%), proving that transition-based modeling is a far
more effective strategy for real-time monitoring than holistic
text analysis.
Table 3. Generalization study of PROMAS.
Split
Backbone
Agent-level
Step-level
Automated
Llama-3.1-8B
46.53
24.75
Qwen3-8B
42.57
23.76
Handcraft
Llama-3.1-8B
27.66
14.89
Qwen3-8B
36.17
17.02
Total
Llama-3.1-8B
40.54
22.97
Qwen3-8B
40.54
21.62
4.4. Generalization
Table 3 demonstrates the model-agnostic robustness of PRO-
MAS. We evaluate the framework’s adaptability by switch-
ing the backbone from Llama-3.1-8B to Qwen3-8B. The
results indicate remarkable stability across different archi-
tectures. In terms of overall performance, both backbones
achieve an identical Total Agent-level accuracy of 40.54%,
and the difference in Total Step-level accuracy is marginal
(22.97% for Llama vs. 21.62% for Qwen). This consistency
confirms that our Vector Markov Space captures universal
reasoning patterns rather than model-specific artifacts.
Interestingly, the two models exhibit complementary
strengths across data splits. While Llama-3.1 performs
slightly better on the Automated split (Step-level: 24.75%
vs. 23.76%), Qwen3 demonstrates superior semantic sensi-
tivity on the more challenging Handcraft split. Specifically,
Qwen3 significantly improves Agent-level attribution on
human-annotated errors, rising from 27.66% to 36.17%.
This suggests that while the core transition logic remains
robust, deploying backbones with stronger reasoning capa-
bilities can further enhance the detection of subtle, human-
designed logical fallacies within the PROMAS framework.
4.5. Ablation Study
As illustrated in Figure 2, we evaluate the indispensability
of each core component in PROMAS across Agent-level
and Step-level metrics. The most dramatic performance
collapse occurs when removing the Triplet Loss, causing
Step-level accuracy to plunge from 24.75% to 8.91%. This
confirms that contrastive optimization is the backbone of
our manifold, forcing the model to learn sharp boundaries
between logical consistency and breaches. Furthermore,
replacing Causal Deltas (∆t) with absolute semantic states
results in a substantial drop to 16.83%. This validates our
hypothesis that logical consistency is a relational property
7


---

ProMAS: Proactive Error Forecasting for Multi-Agent Systems Using Markov Transition Dynamics
Figure 2. Ablation study of PROMAS on the Algorithm-Generated
split of Who&When benchmark.
of the transition: modeling the “velocity” of reasoning via
semantic displacement is far more effective for temporal
localization than analyzing static state content.
We further compare our transition-based approach against
a standard Binary Classifier and our own Jump Detec-
tion mechanism. The Binary Classifier, which treats error
prediction as an isolated classification task, yields subopti-
mal results (Agent: 31.68%, Step: 16.83%), significantly
lagging behind the Full Model. This performance gap under-
scores that error detection is not a static snapshot problem
but a trajectory modeling challenge; the model must per-
ceive the evolution of reasoning rather than just the current
state. Finally, disabling Jump Detection leads to a dis-
tinct decline (Step: 21.78%), demonstrating its utility as
a high-pass filter. Unlike static thresholds, monitoring the
acceleration of risk allows PROMAS to isolate catastrophic
logical mutations from background fluctuations, ensuring
high temporal resolution.
5. Related Work
5.1. LLM-based Multi-Agent Systems
LLM-based agents have exhibited remarkable proficiency
across diverse domains, spanning code generation (Liu et al.,
2024; Zhong et al., 2024; Dong et al., 2024), data analy-
sis (Xie et al., 2024; Li et al., 2024; Hong et al., 2025),
and complex question answering (Zhao et al., 2025; Yue,
2025; Zhu et al., 2024). Nevertheless, individual models
often falter in long-horizon tasks due to constrained reason-
ing depth and limited expertise coverage (Du et al., 2023;
Valmeekam et al., 2023; Ke et al., 2025). To circumvent
these constraints, Multi-Agent Systems (MAS) harness col-
lective intelligence (Islam et al., 2024; Zhang et al., 2025c),
demonstrating superior performance in collaborative sce-
narios such as software development (Qian et al., 2023;
Hong et al., 2024; Chen et al., 2024) and immersive world
simulations (Park et al., 2023; Kaiya et al., 2023).
5.2. Error Diagnosis and Localization in MAS
Robust mechanisms for identifying logical failures are criti-
cal as MAS complexity grows. Existing research generally
spans empirical analysis, reactive attribution, and interven-
tion.
Empirical and Attribution Analysis. Foundational stud-
ies (Cemri et al., 2025; Zhu et al., 2025) have established
taxonomies of MAS failure modes. To identify culpable
agents, Ge et al. (2025) adapt Spectrum-Based Fault Local-
ization (SBFL), while others (Zhang et al., 2025a; Ma et al.,
2025) introduce debugging frameworks to trace execution
flows. However, these methodologies are predominantly
post-hoc, relying on complete reasoning logs for diagnosis
rather than real-time monitoring.
Step-wise Intervention. For mitigation, frameworks like
Self-Refine (Madaan et al., 2023) and Reflexion (Shinn et al.,
2023) employ iterative feedback. In MAS, Mou et al. (2026)
propose MASC to enable intervention via output monitoring.
Despite supporting turn-by-turn detection, MASC remains
reactive, diagnosing errors only after action execution. Sim-
ilarly, metacognitive approaches (Shen et al., 2025) focus
primarily on reconstruction following failure detection.
The Gap. Existing paradigms typically treat actions as
isolated states using static thresholds, exacerbating the tem-
poral credit assignment problem where early breaches are
masked by downstream noise. PROMAS departs from this
by introducing Causal Delta transitions and proactive jump
detection. Instead of waiting for observable failure, our
method localizes the initial logic breach via risk accelera-
tion before the fallacy propagates.
6. Conclusion
In this paper, we introduced PROMAS, a proactive frame-
work designed to address the critical “Who and When” mis-
take identification problem in multi-agent reasoning. By
shifting the paradigm from reactive state auditing to tran-
sition monitoring, PROMAS leverages Causal Delta Fea-
tures and Vector Markov Entropy to accurately quantify
semantic displacement and logical risks. Crucially, our
Dynamic Jump Detection algorithm effectively suppresses
false alarms by identifying sharp risk accelerations rather
than relying on static thresholds. Extensive evaluations
on the Who&When benchmark demonstrate that PROMAS
achieves localization accuracy competitive with post-hoc
diagnostic methods while significantly outperforming re-
active online monitors. This transition-centric approach
establishes a robust foundation for real-time error manage-
ment and the development of trustworthy, self-correcting
autonomous multi-agent systems.
8


---

ProMAS: Proactive Error Forecasting for Multi-Agent Systems Using Markov Transition Dynamics
Impact Statement
This work introduces a framework designed to enhance
the reliability and safety of Multi-Agent Systems (MAS)
driven by Large Language Models. As autonomous agents
are increasingly integrated into critical domains—ranging
from software engineering to scientific research and strate-
gic decision-making—the capability to identify and localize
logical failures in real-time has become paramount. Our
research addresses several societal and ethical imperatives.
First, in the realm of AI Safety, PROMAS facilitates a shift
from reactive diagnosis to proactive defense, mitigating the
propagation of hallucinations before they precipitate system-
wide failures. Second, the framework advances Compu-
tational Sustainability; by identifying and terminating er-
roneous trajectories early, it reduces context consumption
to approximately 27% of the complete logs, significantly
lowering the energy expenditure and carbon footprint associ-
ated with large-scale LLM inference. Third, we bolster the
Accountability of collaborative systems by ensuring trans-
parent error attribution to specific agents and timestamps, a
prerequisite for establishing trustworthy autonomous ecosys-
tems.
From an ethical perspective, it is important to acknowledge
that our Markovian risk estimation relies heavily on the
diversity of the training trajectories. In highly sensitive or
novel environments, there exists a risk that valid but uncon-
ventional reasoning patterns may be misidentified as errors
due to their deviation from historical distributions. Conse-
quently, we encourage practitioners to deploy this frame-
work as a support mechanism within a human-in-the-loop
architecture, ensuring that the pursuit of logical consistency
does not inadvertently penalize creative or outlier reasoning
strategies.
References
Cemri, M., Pan, M. Z., Yang, S., Agrawal, L. A., Chopra,
B., Tiwari, R., Keutzer, K., Parameswaran, A., Klein, D.,
Ramchandran, K., et al. Why do multi-agent llm systems
fail? arXiv preprint arXiv:2503.13657, 2025.
Chen, Y., Arkin, J., Zhang, Y., Roy, N., and Fan, C. Scalable
multi-robot collaboration with large language models:
Centralized or decentralized systems?
In 2024 IEEE
International Conference on Robotics and Automation
(ICRA), pp. 4311–4317. IEEE, 2024.
Dong, Y., Jiang, X., Jin, Z., and Li, G. Self-collaboration
code generation via chatgpt. ACM Transactions on Soft-
ware Engineering and Methodology, 33(7):1–38, 2024.
Du, Y., Li, S., Torralba, A., Tenenbaum, J. B., and Mordatch,
I. Improving factuality and reasoning in language models
through multiagent debate. In Forty-first International
Conference on Machine Learning, 2023.
Ge, Y., Xie, L., Li, Z., Pei, Y., and Zhang, T. Who is intro-
ducing the failure? automatically attributing failures of
multi-agent systems via spectrum analysis. arXiv preprint
arXiv:2509.13782, 2025.
Hong, S., Zhuge, M., Chen, J., Zheng, X., Cheng, Y.,
Zhang, C., Wang, J., Wang, Z., Yau, S. K. S., Lin,
Z., Zhou, L., Ran, C., Xiao, L., Wu, C., and Schmid-
huber, J.
Metagpt: Meta programming for a multi-
agent collaborative framework, 2024.
URL https:
//arxiv.org/abs/2308.00352.
Hong, S., Lin, Y., Liu, B., Liu, B., Wu, B., Zhang, C., Li, D.,
Chen, J., Zhang, J., Wang, J., et al. Data interpreter: An
llm agent for data science. In Findings of the Association
for Computational Linguistics: ACL 2025, pp. 19796–
19821, 2025.
Islam, M. A., Ali, M. E., and Parvez, M. R. Mapcoder:
Multi-agent code generation for competitive problem
solving. arXiv preprint arXiv:2405.11403, 2024.
Kaiya, Z., Naim, M., Kondic, J., Cortes, M., Ge, J., Luo, S.,
Yang, G. R., and Ahn, A. Lyfe agents: Generative agents
for low-cost real-time social interactions. arXiv preprint
arXiv:2310.02172, 2023.
Ke, Z., Jiao, F., Ming, Y., Nguyen, X.-P., Xu, A., Long,
D. X., Li, M., Qin, C., Wang, P., Savarese, S., et al. A
survey of frontiers in llm reasoning: Inference scaling,
learning to reason, and agentic systems. arXiv preprint
arXiv:2504.09037, 2025.
Li, B., Luo, Y., Chai, C., Li, G., and Tang, N. The dawn of
natural language to sql: Are we fully ready? Proceedings
of the VLDB Endowment, 17(11):3318–3331, 2024.
Liu, J., Wang, K., Chen, Y., Peng, X., Chen, Z., Zhang,
L., and Lou, Y.
Large language model-based agents
for software engineering: A survey.
arXiv preprint
arXiv:2409.02977, 2024.
Ma, M., Zhang, J., Yang, F., Kang, Y., Lin, Q., Yang,
T., Rajmohan, S., and Zhang, D. Dover: Intervention-
driven auto debugging for llm multi-agent systems. arXiv
preprint arXiv:2512.06749, 2025.
Madaan, A., Tandon, N., Gupta, P., Hallinan, S., Gao,
L., Wiegreffe, S., Alon, U., Dziri, N., Prabhumoye, S.,
Yang, Y., et al. Self-refine: Iterative refinement with self-
feedback. Advances in Neural Information Processing
Systems, 36:46534–46594, 2023.
Mou, Y., Xue, Z., Li, L., Liu, P., Zhang, S., Ye, W., and
Shao, J. Toolsafe: Enhancing tool invocation safety of
9


---

ProMAS: Proactive Error Forecasting for Multi-Agent Systems Using Markov Transition Dynamics
llm-based agents via proactive step-level guardrail and
feedback. arXiv preprint arXiv:2601.10156, 2026.
Park, J. S., O’Brien, J., Cai, C. J., Morris, M. R., Liang,
P., and Bernstein, M. S. Generative agents: Interactive
simulacra of human behavior. In Proceedings of the 36th
annual acm symposium on user interface software and
technology, pp. 1–22, 2023.
Qian, C., Liu, W., Liu, H., Chen, N., Dang, Y., Li, J., Yang,
C., Chen, W., Su, Y., Cong, X., et al. Chatdev: Commu-
nicative agents for software development. arXiv preprint
arXiv:2307.07924, 2023.
Shen, X., Zhang, Q., Wang, S., Tan, Z., Zhao, X., Yao, L.,
Tadiparthi, V., Mahjoub, H. N., Pari, E. M., Lee, K., et al.
Metacognitive self-correction for multi-agent system via
prototype-guided next-execution reconstruction. arXiv
preprint arXiv:2510.14319, 2025.
Shinn, N., Cassano, F., Gopinath, A., Narasimhan, K., and
Yao, S. Reflexion: Language agents with verbal rein-
forcement learning. Advances in Neural Information
Processing Systems, 36:8634–8652, 2023.
Valmeekam, K., Marquez, M., Sreedharan, S., and Kamb-
hampati, S. On the planning abilities of large language
models-a critical investigation. Advances in Neural Infor-
mation Processing Systems, 36:75993–76005, 2023.
Wang, H., Poskitt, C. M., Sun, J., and Wei, J. Pro2guard:
Proactive runtime enforcement of llm agent safety
via probabilistic model checking.
arXiv preprint
arXiv:2508.00500, 2025.
Xie, L., Zheng, C., Xia, H., Qu, H., and Zhu-Tian, C. Wait-
gpt: Monitoring and steering conversational llm agent in
data analysis with on-the-fly code visualization. In Pro-
ceedings of the 37th Annual ACM Symposium on User
Interface Software and Technology, pp. 1–14, 2024.
Yue, M. A survey of large language model agents for ques-
tion answering. arXiv preprint arXiv:2503.19213, 2025.
Zhang, G., Wang, J., Chen, J., Zhou, W., Wang, K., and Yan,
S. Agentracer: Who is inducing failure in the llm agentic
systems? arXiv preprint arXiv:2509.03312, 2025a.
Zhang, S., Yin, M., Zhang, J., Liu, J., Han, Z., Zhang, J.,
Li, B., Wang, C., Wang, H., Chen, Y., et al. Which agent
causes task failures and when? on automated failure
attribution of llm multi-agent systems. arXiv preprint
arXiv:2505.00212, 2025b.
Zhang, Y., Zhao, X., Wang, Z., Zhou, Z., Cheng, G., Deng,
S., and Yin, J. Sortinghat: Redefining operating systems
education with a tailored digital teaching assistant. In
Companion Proceedings of the ACM on Web Conference
2025, pp. 2951–2954, 2025c.
Zhao, X., Wang, Z., Zhang, Y., Cheng, G., Xu, Y., Deng, S.,
Liu, C., Wang, N., and Yin, J. Video-qtr: Query-driven
temporal reasoning framework for lightweight video un-
derstanding. arXiv preprint arXiv:2512.09354, 2025.
Zhong, L., Wang, Z., and Shang, J. Debug like a human:
A large language model debugger via verifying runtime
execution step by step. In Findings of the Association
for Computational Linguistics ACL 2024, pp. 851–870,
2024.
Zhu, J.-P., Cai, P., Xu, K., Li, L., Sun, Y., Zhou, S., Su,
H., Tang, L., and Liu, Q. Autotqa: Towards autonomous
tabular question answering through multi-agent large lan-
guage models. Proceedings of the VLDB Endowment, 17
(12):3920–3933, 2024.
Zhu, K., Liu, Z., Li, B., Tian, M., Yang, Y., Zhang, J., Han,
P., Xie, Q., Cui, F., Zhang, W., et al. Where llm agents
fail and how they can learn from failures. arXiv preprint
arXiv:2509.25370, 2025.
10


---

ProMAS: Proactive Error Forecasting for Multi-Agent Systems Using Markov Transition Dynamics
A. Implementation Details of Frozen LLM Backbone
To ensure robust semantic representation while maintaining computational efficiency, we employ a frozen Large Language
Model (LLM) as the primary feature extractor. The specific configurations and input processing strategies are detailed below.
A.1. Backbone Configuration
We utilize Meta-Llama-3.1-8B-Instruct as the foundation model. The model is loaded in BFloat16 precision to
optimize memory usage on CUDA devices. Crucially, all parameters ΘLLM are frozen (non-trainable) during the entire
training pipeline. This freezing strategy ensures that the semantic manifold remains stable, acting as a fixed anchor for the
learnable projection head and attention pooling layers.
To capture high-level semantic abstractions rather than just next-token probabilities, we do not rely solely on the last hidden
state. Instead, we implement a Layer-wise Mean Pooling strategy. Let hl ∈RL×D denote the hidden states of layer l. We
extract the last four layers of the transformer:
hpooled = 1
4
N
X
l=N−3
hl
(12)
where N = 32 is the total number of layers in Llama-3-8B and D = 4096 is the hidden dimension. This compiled
representation is then passed to the trainable Attention Pooling mechanism.
Key hyperparameters for the backbone are summarized in Table 4.
Table 4. Hyperparameters of the Frozen LLM Backbone.
Parameter
Value
Model Architecture
Llama 3.1 8B Instruct
Parameter Count
8 Billion
Hidden Dimension (D)
4096
Precision
BFloat16
Context Window
8192 tokens
Pooling Strategy
Mean of Last 4 Layers
Trainable Parameters
0 (Fully Frozen)
A.2. Structured Input Prompts
Since the backbone is frozen, the quality of the embedding st heavily depends on the input format. We employ a Structured
Tagging template to explicitly demarcate the Task Context, Interaction History, and Current Action. This ensures the
attention mechanism can distinguish between the agent’s goal and its execution trajectory.
For the Feature Extraction step (calculating ∆t), the input prompt Pextract is constructed as follows:
Input Template for Feature Extraction
[TASK]
{Task Description}
[PREVIOUS_FEEDBACK]
{Previous Agent Response or Observation}
[CURRENT_ACTION]
{Current Step to be Analyzed}
For the Proactive Prediction step (estimating future risk Rt), where the current action is unknown, we utilize a history-
focused template:
11


---

ProMAS: Proactive Error Forecasting for Multi-Agent Systems Using Markov Transition Dynamics
Input Template for Proactive Prediction
[TASK]
{Task Description}
[HISTORY]
{Full Dialogue Trace up to step t-1}
Tokens are processed using the standard Llama-3 tokenizer with left-padding enabled to align batch representations.
B. Details of Dataset
Table 5. Additional details about the Who&When benchmark: We present the total number of tasks for each category, along with the
maximum and minimum number of agents and log lengths.
Algorithm-Generated
Hand-Crafted
GAIA
AssistantBench
GAIA
AssistantBench
Total Number
98
28
30
28
Maximum Agent Number
4
4
5
4
Minimum Agent Number
1
3
1
2
Maximum Log Length
10
10
130
129
Minimum Log Length
5
6
5
8
We provide details about the Who&When dataset, which comprises 184 failure annotations tasks from both hand-crafted
and algorithm-generated agentic systems. These failure logs encompass diverse scenarios with varying numbers of agents
and interaction lengths. In Table 5, we show the total number of data instances for each category, along with the maximum
and minimum number of agents and log lengths.
C. Experimental Settings
C.1. Dataset and Partitioning
We evaluate our framework on the Who&When benchmark, utilizing both the Algorithm-Generated and
Hand-Crafted subsets. To ensure the causal model generalizes to unseen dialogue trajectories, we employ a strict
random split strategy. The dataset is partitioned with a ratio of approximately 20% for training and 80% for testing.
Crucially, the partitioning is performed at the file level rather than the turn level, ensuring that no partial dialogue history
from the test set leaks into the training phase. All experiments are conducted with a fixed random seed (Seed = 42) to
guarantee reproducibility across the data shuffling, clustering initialization, and neural network weight initialization.
C.2. Computational Resources
The experiments are implemented using PyTorch 2.x and HuggingFace Transformers. Given the frozen back-
bone strategy, our framework is computationally efficient. All training and inference processes were conducted on a single
NVIDIA GPU with 24GB VRAM (e.g., RTX 3090/4090 or A10G). The Llama-3-8B-Instruct backbone is loaded in
bfloat16 precision to minimize memory footprint without compromising representation quality.
C.3. Hyperparameter Configuration
We provide a detailed list of hyperparameters used in the two-stage training pipeline in Table 6. In Stage 1 (Manifold
Alignment), we use a smaller learning rate to carefully adjust the projection space, whereas in Stage 2 (Proactive Prediction),
a higher learning rate is used to train the classification head. The cluster size K for discretization was set to 30 for the
reported experiments to capture broad failure categories.
Additionally, for the inference-time risk assessment, we employ a Risk Jump Detection strategy to reduce false positives in
the early stages of dialogue. The detection logic is governed by two thresholds: (1) An absolute Base Risk Threshold τbase,
12


---

ProMAS: Proactive Error Forecasting for Multi-Agent Systems Using Markov Transition Dynamics
Table 6. Hyperparameter settings for Causal Manifold training and Proactive Estimation.
(a) Stage 1: Contrastive Projection
Parameter
Value
Optimizer
Adam
Learning Rate
1 × 10−4
Batch Size
32
Epochs
15
Loss Function
Triplet Margin
Margin (m)
1.0
Distance Metric
Cosine
Random Negative Weight
0.5
(b) Stage 2: Proactive Head
Parameter
Value
Optimizer
Adam
Learning Rate
1 × 10−3
Batch Size
32
Epochs
15
Label Smoothing
0.1
Cluster Size (K)
30
Top-k Risk Lookhead
5
Threshold Strategy
Adaptive (KMeans)
which is dynamically calibrated via K-Means on the validation set risks (typically converging around 0.02 −0.05); (2) A
Jump Threshold δ = 0.15, which triggers an alert only if the risk surges by more than 15% compared to the previous step.
A secondary safety valve triggers immediately if the absolute risk exceeds τmax = τbase + 0.30, regardless of the jump
magnitude, to capture catastrophic failure modes.
D. Supplementary Experiments
D.1. Sensitivity Analysis of Cluster Number K
To construct the Vector Markov Space, PROMAS quantizes semantic vectors via K-Means. We analyze sensitivity by
varying the cluster number K ∈{10, . . . , 60} (Figure 3). The performance follows a non-monotonic trend:
• Under-segmentation (K < 30): Low values cause ”semantic collision,” forcing distinct actions into shared clusters.
This limits the model’s discriminative power, resulting in suboptimal scores at K = 10 (Agent: 24.75%, Step: 16.83%).
• Optimal Granularity (K = 30): Performance peaks at K = 30 (Agent: 45.54%, Step: 24.75%). This configuration
strikes the most effective balance, capturing sufficient semantic diversity without fragmenting transition statistics.
• Over-segmentation (K > 30): Increasing K leads to instability (e.g., sharp drops at K = 40, 60). Excessive clustering
causes data sparsity in the Markov transition matrix, preventing the formation of reliable probabilistic priors.
Consequently, we select K = 30 as the default to ensure robust error prediction.
Figure 3. Impact of the number of clusters (K) on Agent-level and Step-level performance. The results indicate that K = 30 offers the
optimal trade-off between semantic resolution and transition robustness.
13

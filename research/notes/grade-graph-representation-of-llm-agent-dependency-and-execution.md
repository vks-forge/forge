---
title: 'Grade: Graph Representation of LLM Agent Dependency and Execution'
id: grade-graph-representation-of-llm-agent-dependency-and-execution
tags:
- ai-software-factory-architecture-58e4cc
- probabilistic-skill-sequencing
- agent-trace-analysis
- negative-result
created: '2026-10-12T08:38:16.536683Z'
updated: '2026-10-12T08:38:55.186784Z'
source: https://arxiv.org/abs/2606.22741
source_domain: arxiv.org
fetched_at: '2026-10-12T08:38:16.534509Z'
fetch_provider: builtin
status: draft
type: note
tier: institutional
content_type: paper
deprecated: false
summary: 'ArXiv paper (Yue Zhao, USC, single-author, v3 Oct 2026, cs.LG) proposes
  GRADE (Graph Representation of LLM Agent Dependency and Execution), a unified graph
  schema for agent traces with two layers on the same nodes: a free ''execution''
  layer (control flow / step order, read deterministically off the trace) and a costly
  ''dependency'' layer (what each step relied on — reads/writes of files, database
  rows, resources). Each dependency edge is graded by provenance: observed (directly
  visible in the raw trace), declared (recovered via added logging the raw trace omits),
  or inferred (assumed under a named heuristic, the weakest being ''full history'':
  assume each step used every earlier step). The paper shows six published agent-run
  graph representations (reason-act/ReAct traces, MetaGPT orchestration graphs, GPTSwarm
  graphs, computation graphs, PROV/data-lineage graphs, agent anomaly graphs) are
  all projections of this two-layer schema under specific stated conditions. Central
  empirical question: how much does the costly dependency layer improve failure prediction
  over a cheap run-size baseline (step/tool-call/decision/agent counts)? Findings
  are deliberately cautionary for the broader probabilistic-skill-sequencing thesis:
  (1) the recovered dependency layer improves failure prediction over the run-size-only
  baseline on only 3 of 6 tested corpora, and the gain is sensitive to which learner
  and task-sampling scheme is used; (2) on held-out corpora the dependency layer stays
  above-chance (under one specific learner) only with the same task-sampling caveat;
  (3) graph structure can ''pass for signal it does not carry'' — a dependency layer
  inferred under the weak full-history assumption essentially just restates run size,
  adding no real information; (4) within a corpus (tau-bench), a preregistered statistical
  test FAILS to significantly separate the recovered dependency layer''s predictive
  power from a degree-matched counterfeit control that rewires which earlier steps
  each step depends on while preserving the same edge counts (ROC-AUC: run-size-only
  0.619, +recovered dependency layer 0.665, +degree-matched counterfeit 0.654; recovered
  minus counterfeit = +0.011, not statistically significant); (5) the dependency layer''s
  largest cross-corpus transfer advantage over the counterfeit control reverses when
  the held-out corpus''s task family is withheld. The paper''s prescriptive takeaway:
  before crediting graph/dependency structure extracted from agent traces with predictive
  power, researchers must grade each edge by provenance, keep a run-size baseline
  for comparison, and test against degree-matched attachment controls — otherwise
  claimed gains from trace-derived structural features may be an artifact of edge
  count/density rather than genuine dependency information. Code and per-corpus data
  cards released at github.com/yzhao062/grade.'
raw_file: raw/grade-graph-representation-of-llm-agent-dependency-and-execution.pdf
doi: arXiv:2606.22741
---

*Suggested by [[github-yintonghuoawesome-agent-trajectory-a-collection-of-agent-trajectory-analy]] — listed in awesome-agent-trajectory as graph-based agent dependency/execution model for failure likelihood prediction, relevant to skill-sequence prediction*

Grade: Graph Representation of LLM Agent Dependency and Execution
Yue Zhao
University of Southern California
yue.z@usc.edu
Abstract
Traces record what LLM agents did, leaving
implicit what each step relied on. Grade holds
both in one graph; six published graph views are
its projections. Execution edges come free; each
costly dependency edge is graded as observed
in the trace, declared by added logging, or
inferred under an assumption, a schema we test
one grade at a time. We recover the dependency
layer from six tool-use, coding, and web corpora
and measure its failure-prediction gain over run
size. First, over a linear run-size baseline, it
improves prediction on three corpora, but the
gain depends on the learner and task sampling.
On held-out corpora the layer stays above chance
where run size does not, under one learner,
with the same task-sampling caveat. Second,
structure can pass for signal it does not carry:
a layer inferred under full history restates run
size. Within a corpus, a preregistered test does
not separate the recovered layer from a degree-
matched counterfeit that rewires each step’s
dependencies but keeps their number.
The
recovered layer’s largest transfer lead over it
reverses when the held-out corpus’s task family
is withheld. Before crediting structure, grade
each edge, keep a run-size baseline, and score
degree-matched attachment controls.
1
Introduction
LLM agents fail for what they relied on, but the
record shows only what they did. A booking agent
reads a price, holds a reservation, then confirms
it; the confirmation is valid only while the price is
current. If the price goes stale in between, the run
fails, yet every step ran in order. Such unchecked
inputs recur in agent failures (Cemri et al., 2025).
Coordination failures live in the execution:
which agent acted, how control passed, whether a
handoff dropped a result (Cemri et al., 2025; Zhang
et al., 2025a). Reliance failures live in the depen-
dency structure (Figure 1B), which no trace states.
A step used state an earlier step produced or held,
now stale, overwritten, or wrong from the start.
A second problem travels with it: there is no
shared way to draw such runs. LLM agents span
tool use, coding, and multi-agent collaboration (Xi
et al., 2025), each drawn its own way: an orchestra-
tion graph (Zhuge et al., 2024; Hong et al., 2024),
a reason-act trace (Yao et al., 2023), or a sequence
of edits (Yang et al., 2024; Jimenez et al., 2024).
Analysis is rebuilt per setting.
Both share one
cause: common representations of agent runs
center execution and leave dependency implicit.
Dependency is the harder half to obtain, from trace
content, instrumentation, or an assumption; once
recorded, it would carry analysis across settings.
We propose Grade (Graph Representation of
LLM Agent Dependency and Execution), a uni-
fied representation for agent runs (§2).
Program analysis has represented dependency
as a graph since the 1980s: program dependence
graphs (Ferrante et al., 1987), static interprocedu-
ral slicing (Horwitz et al., 1990), dynamic slic-
ing (Korel and Laski, 1988), and dynamic de-
pendence graphs over executed statement occur-
rences (Agrawal and Horgan, 1990). Grade takes
that relation into agent traces. There the evidence
behind an edge varies by corpus (Figure 1A), so
each dependency edge is graded by how it is known.
What does the costly dependency layer add over
the free execution one? Run size (the counts of
steps, tool calls, decisions, and agents) comes free
from the execution layer. We therefore measure the
gain over run size: how much the dependency layer
improves failure prediction over a linear model of
run size (§3). This paper makes three contributions.
• A Unified Representation. Grade records a
run as one graph with execution and dependency
layers on the same steps, each dependency edge
graded by how it is known (§2, Figure 1). Six
published graph views of agent runs, from reason-
act traces to lineage graphs, are its projections
under the conditions in Table 1. The per-edge
1
arXiv:2606.22741v3  [cs.LG]  6 Oct 2026


---

A  One Coding Run
Illustrative Timeout Fix
1 Inspect Files
project/
config.py
runner.py
2 Edit Config
config.py (diff)
− timeout = 30
+ timeout = 60
3 Add Test
test_timeout.py
t = timeout
assert t == 60
4 Run Tests
Terminal
$ pytest -q
1 passed
5 Submit Patch
Patch Contents
M config.py
A test_timeout.py
O Example raw-trace record:  2 writes config.py@v2;  4 reads config.py@v2
2 → 4
B  One Run, Two Edge Layers
C  Degree-Matched Counterfeit
Execution EX
Step Order
1
2
3
+
4
>_
5
Recovered Dependency Layer ED
O
O
O
O
O
2 out
Depth (longest chain): 3 / 5 = 0.6
Blast (steps relying on one step): 2 / 5 = 0.4
1
2
3
+
4
>_
5
O = Observed Access (Illustrative Records)
Hold Fixed
5 steps; sources per step: (0, 1, 1, 2, 1)
Every source precedes its consumer
Unchanged: Density 1.0; Audit 0.4
Change Earlier Sources
Step 4: {2, 3} → {1, 2}
Step 5: {4} → {1}
Illustrative Counterfeit N2
4 out
Depth (longest chain): 2 / 5 = 0.4
Blast (steps relying on one step): 4 / 5 = 0.8
1
2
3
+
4
>_
5
Kept
Rewired Sources
D  Measured on tau-bench
tau-bench / Within-Corpus Logistic / Mean ROC-AUC
0.55
0.60
0.65
0.70
0.75
Run size
0.619
+ Recovered
0.665
+ Counterfeit
0.654
Recovered − Counterfeit = +0.011, not significant
E  How Each Edge Is Known
O
Observed
Access in the raw trace
2
4
D
Declared
Added read/write logging
2
4
I
Inferred
A named assumption
2
4
Figure 1: One run, two layers, graded edges. (A) A coding run and a raw-trace record. (B) The same run as two
layers on shared nodes: execution (step order) and dependency (what each step used). (C) The degree-matched
counterfeit n2 rewires which earlier steps each step depends on but keeps their number, so density and audit stay
fixed. (D) Within-corpus ROC-AUC on tau-bench: the recovered layer adds to the run-size baseline and scores
slightly above the counterfeit, a gap that does not survive correction (Table 3, Figure 3). (E) Dependency edges are
graded observed (in the trace), declared (added logging), or inferred (a named assumption).
grade is a proposed schema: our experiments test
each grade only as a whole layer.
• Empirical Findings. Over a linear run-size base-
line, the recovered dependency layer improves
failure prediction on three of the six corpora, but
the gain depends on the learner and task sampling
(§4.1). On held-out corpora it stays above chance
where run size does not, under one learner, with
the same task-sampling caveat (§4.3). Graph
structure can also pass for signal it does not carry:
a layer inferred under full history restates run size
(§5.1). Within a corpus, a preregistered test does
not separate the recovered layer from a degree-
matched counterfeit, which rewires each step’s
dependencies but keeps their number (§4.2). The
recovered layer’s largest transfer lead over it re-
verses when the held-out corpus’s task family is
withheld (Appx. D.7).
• A Reusable Evaluation Protocol. Before graph
structure gets credit, the protocol grades each
edge, keeps a run-size baseline, and scores degree-
matched counterfeits within a corpus and in trans-
fer (§3, §4.2, §5.2). The anonymized supple-
mentary material holds its code, the loaders that
recover each corpus’s dependency layer, and a
data card per corpus (Appx. C.1).1
1Available at https://github.com/yzhao062/grade.
2


---

Table 1: Six published graph views as projections of the two-layer graph. Discs mark what each view keeps of
the execution layer, the dependency layer and the per-edge grade:
kept,
partial,
absent. The last column is the
condition under which the view lines up with Grade; it is not a recovery theorem, and it says nothing about how a
model fitted on one view would behave (each view is described in Appx. A).
Graph view
Exec. Dep. Grade Lines up with the two-layer graph when
Reason-act / tool trace (Yao
et al., 2023)
A reliance edge joins two steps only where both touch the same named
resource
MetaGPT orchestration (Hong
et al., 2024)
Subscription fixes the artifact kind a role reads, never the revision a step
used
GPTSwarm graph (Zhuge
et al., 2024)
Routines that ignore their input, a gap the view itself names, stay apart
(Appx. A)
Computation graph (Yue
et al., 2026)
An emitter types the edges; the view has no typing function of its own
Data-lineage / PROV (Moreau
and Missier, 2013)
Steps that ran in sequence and exchanged nothing get no edge (Cheney
et al., 2013)
Agent anomaly graph (He
et al., 2025; Zhou et al., 2025)
State dependency stays partial; SentinelAgent pairs a declared graph with
an observed one
2
A Unified Graph Representation for
LLM Agents
2.1
Execution Edges and Graded Dependency
Edges
Grade records a run as one graph with two edge
layers on the same nodes (Figure 1B). The nodes are
agents, decisions, tool calls, and external resources,
the state a decision reads or writes (a database row,
a source file). Execution edges record control: an
agent emits its decision and tool nodes, and control
hands off from one step to the next. Dependency
edges record reliance: a step depends on an earlier
node whose state it used, reads a resource, or writes
one. Which earlier step a dependency edge points
to is its attachment. Multi-agent, tool-use, coding,
and web traces build this graph the same way.
The two layers differ in cost. Execution edges
are free, because a trace records which agent acted
and in what order. No trace states what a step relied
on, so each dependency edge is graded by how it is
known (Figure 1E). An edge is observed when the
trace shows the access it records, as when a coding
step edits a named file or a database step reads a
named row. It is declared when added logging
records the reads and writes a raw trace omits.
Where no access is logged, an edge is inferred
under a named assumption, the weakest being full
history: each step used every earlier step (Appx. A).
Grades attach to single edges, so one graph can mix
observed edges with inferred ones where the trace
fell silent. We evaluate each grade only as a whole
layer; mixed-grade graphs are untested.
2.2
The Formal Graph and Its Projections
In Grade, a run is a directed, typed, temporal
multigraph 𝐺= (𝑉, 𝐸𝑋, 𝐸𝐷, 𝜏, 𝑡, 𝜎): nodes 𝑉with
types 𝜏and times 𝑡, an execution layer 𝐸𝑋read de-
terministically off the trace, a dependency layer 𝐸𝐷
recovered from logged accesses or inferred under a
named assumption, and a map 𝜎that grades each
dependency edge observed, declared, or inferred.
The full tuple and recovery maps are in Appx. A.
Four operations produce the fragments of Table 1:
deleting node types, deleting or merging an edge
layer, contracting steps onto the agent that emitted
them, and deleting the per-edge grade. Reasoning
graphs in the Graph-of-Thoughts family (Besta et al.,
2024), Tree of Thoughts included, sit outside the
table. Their vertices are units of information rather
than run steps, and they can be deleted mid-run,
which no projection of a step graph reproduces.
3
What Dependency Adds over Run Size
The execution layer gives run size for free, so we
credit the costly dependency layer only with what
it adds to failure prediction over run size. Run size
is four counts from the trace: steps, tool calls, deci-
sions, and agents. A linear logistic model on these
counts is the run-size baseline. It leaves out per-step
execution features, such as the acting agent’s share
of decisions, activity rank and handoff degrees,
which an ancillary study scores on Who&When
(Appx. E). The dependency features are four size-
normalized summaries of the dependency layer
(Figure 1B, C; formulas in Appx. C). They are den-
sity (edges per step), depth (the longest dependency
chain), blast (the largest share of the run that relies
directly on one step) and audit (the largest share of
the run that one step relies on). Their gain over run
size is how much cross-validated ROC-AUC rises
when they join the run-size baseline on identical
3


---

splits (Figure 1D):
Δdep = AUC(run size + dependency)
−AUC(run size) .
A positive gain shows what the dependency fea-
tures add to a linear model of four counts, which
is weaker than information beyond run size. Under
this learner, a nonlinear function of run size can
raise the AUC while carrying nothing the counts
did not already hold (§5 gives a case). Separating
the gain from such a re-encoding takes two further
tests: a preregistered test against counterfeit layers
that rewire which earlier step each edge points to
(§4.2), and transfer to a held-out corpus (§4.3).
The gain may come out near zero where run size
already separates failures. Two precautions keep
it honest: run-length normalization and the nested
comparison on identical splits (Appx. B).
4
Does Dependency Predict Failure?
4.1
Prediction Within a Corpus
Corpora and model. We first ask whether the
recovered dependency layer predicts failure within
each corpus. Every dependency edge in the six cor-
pora is observed. Two are database tool-use corpora
scored against a gold final state (tau-bench (Yao
et al., 2025), tau2-bench (Barres et al., 2026)).
Three are software-engineering corpora scored on
issue resolution (SWE-agent (Yang et al., 2024),
SWE-Gym (Pan et al., 2025), OpenHands (Wang
et al., 2025c)), and one is a web-navigation corpus
(AgentRewardBench (Lù et al., 2025)). A standard-
ized logistic regression predicts failure; we score
it by ROC-AUC under five-fold cross-validation
over five seeds. Normalizing the features by run
length does not free them of run size, so each gain
compares models with and without the dependency
features on identical splits. A gain clears zero when
its 95% interval across the five split seeds excludes
zero; this split-seed interval measures sensitivity
to the split and says nothing about task sampling
(Appx. C).
One grade, three attachment rules. On tau-
bench a consequential write attaches to every prior
database read, an upper bound because the trace
does not say which read the write used. In the
file and web corpora an access attaches to the
most recent earlier access to the same resource.
On tau2-bench a step attaches to the most recent
earlier step that produced an identifier it consumes
Table 2: Within-corpus gain Δ in ROC-AUC when the
dependency features join a baseline. Logistic model,
run-level folds (Appx. C). flat is the run-size baseline;
the composition baseline adds counts of reads, writes
and resources (Appx. C.5). The task interval resamples
tasks (2000 draws) for the gain on pooled out-of-fold
predictions, which can differ from Δ. A dash marks a
corpus with too few task clusters for that interval.
Over flat baseline
Over composition baseline
Corpus
Δ
Task 95% CI
Δ
Task 95% CI
tau-bench
+0.046 [−0.005, +0.100] +0.018 [−0.008, +0.043]
SWE-agent +0.085
—
+0.065
—
SWE-Gym
+0.142 [+0.084, +0.217] +0.012 [−0.017, +0.036]
OpenHands −0.004 [−0.015, +0.004] −0.002 [−0.004, −0.001]
tau2-bench
−0.015 [−0.028, −0.003] −0.016 [−0.029, −0.001]
web
−0.009 [−0.024, +0.005] −0.002 [−0.016, +0.013]
(Appx. C.1). An observed edge records shared
access to a resource, not proven reliance.
4.1.1
The Gain over Run Size in Each Corpus
Over the linear run-size baseline, the dependency
features add a gain on three corpora and none
on the other three. We order the corpora by how
well that baseline predicts failure (Table 3), from
the size-weak corpora tau-bench, SWE-agent and
SWE-Gym to the size-strong corpora OpenHands,
tau2-bench and web. Each size-weak corpus shows
a gain in all five seeds, with a split-seed interval
clear of zero (Table 2, Figure A1). On the size-
strong corpora the gain is consistent with zero on
OpenHands and small and negative in every seed
on tau2-bench and web. Because the ordering and
each gain share the run-size baseline, the two are
arithmetically coupled. A permutation check shows
that this design cannot separate a dependency effect
from that coupling (Appx. C.8). Each corpus’s gain
keeps its own sign and interval, computed without
reference to the ordering.
The gain depends on the baseline and the
learner (Figure 2). Over a composition baseline
that also counts reads, writes and resources (Ta-
ble 2), the three gains shrink but stay positive in
every seed. None keeps an interval above zero when
tasks are resampled. With 1/𝑛and log 𝑛added to
the four counts, only tau-bench’s increment keeps a
seed-block interval above zero under both run-level
and task-grouped folds (+0.046 and +0.028), and
its task-level intervals include zero; SWE-Gym’s
falls from +0.142 to −0.006 (Appx. C.6). Under
a spline model SWE-Gym’s gain is negative, and
under a boosted tree it is positive. OpenHands and
tau2-bench are negative under all three learners
(Appx. C.5).
4


---

tau-
bench
SWE-
agent
SWE-
Gym
Open-
Hands
tau2-
bench
web
Gain over run size
Split seeds
Task resampling
Task-grouped folds
Spline model
Boosted-tree model
Composition baseline
+0.046 +0.085
–
–
+0.142
n/a
−0.004 −0.015
n/a
−0.009
interval above 0
includes 0
below 0
Figure 2: Which checks the within-corpus gain sur-
vives. Top row: the gain over run size (Table 2). Each
other row: where that check’s 95% interval lies (task re-
sampling for the task-resampling and composition rows,
split seeds elsewhere; Appx. C.5, Appx. C.7). n/a: one
run per task; dash: too few task clusters.
So does task sampling. When tasks are resam-
pled instead of runs, only SWE-Gym’s gain stays
above zero, and SWE-agent has too few tasks with
a resolved run to tell (Table 2). Grouping folds by
task turns SWE-agent’s +0.085 into −0.011 and
cuts tau-bench’s to +0.028. SWE-Gym’s one run
per task makes grouping there vacuous (Appx. C.7).
The gain passes two checks, and neither ties it
to the attachment. It persists when the model also
sees how often a run revisits state, so it does not
restate revisit volume. On the size-strong corpora
the dependency features alone still predict failure,
so their overlap with run size is shared signal rather
than an empty layer (Appx. C).
4.2
A Preregistered Test Against Counterfeit
Layers
A gain over run size does not show that the recov-
ered attachment is the reason. The logistic model
reads four summaries of the dependency layer, and
a counterfeit layer of the same shape would supply
them too. We therefore build counterfeit layers
that keep the steps and their order and change only
which earlier step each edge points to.
Four counterfeit layers compete with the re-
covered dependency layer. The reading-free chain
links each step to the step just before it and reads
nothing from the log, so in total it carries more
edges than the recovered layer. Each of the other
three keeps the recovered edge count on every run.
Of these, the uniform counterfeit places those edges
uniformly among earlier-to-later step pairs. The
degree-matched counterfeit keeps how many ear-
lier steps each step depends on but rewires which
ones (Figure 1C). Last, the recency counterfeit
Table 3: The control ladder: within-corpus ROC-
AUC as only the attachment changes. flat is the
run-size baseline, aware the recovered layer, and n0
to n3 the reading-free chain and the uniform, degree-
matched and recency counterfeits, in order of increasing
strength. n1 to n3 hold the edge count fixed as well;
n0 does not, and carries 5.3 times the observed count.
𝑑= aware −n2 is the primary comparison. Neither
preregistered prediction held: 𝑑has a six-corpus mean
of −0.0003, and aware clears n0 by more than +0.02
on two corpora of six. Per-seed values: Appx. D.2.
Corpus
𝑛flat aware
n0
n1
n2
n3
𝑑
tau-bench
660 0.619 0.665 0.618 0.614 0.654 0.651 +0.011
SWE-agent 600 0.628 0.713 0.595 0.698 0.710 0.721 +0.003
SWE-Gym 376 0.663 0.804 0.827 0.814 0.811 0.806 −0.007
OpenHands 600 0.698 0.695 0.698 0.689 0.693 0.696 +0.002
tau2-bench 278 0.722 0.706 0.715 0.709 0.713 0.714 −0.006
web
600 0.765 0.756 0.754 0.759 0.761 0.758 −0.005
keeps those counts but attaches to the most recent
earlier steps (constructions in Appx. D.2). Such
counterfeits follow network null models (Váša and
Mišić, 2022; Maslov and Sneppen, 2002); scoring
a model against a matched counterfeit it should not
fit follows Hewitt and Liang (2019).
Neither preregistered prediction held. First,
the recovered layer would beat the degree-matched
counterfeit; after correction for multiple tests, no
corpus separates the two (Figure 3). Second, it
would beat the reading-free chain by more than
0.02 in ROC-AUC on most corpora. It does so on
two of six.
The reading-free chain beats the recovered
layer on three corpora, SWE-Gym, OpenHands
and tau2-bench (Table 3), and loses on the other
three. Concurrent work reports the opposite against
a weaker counterfeit: RUPA finds its graph beats
a random one (Ma et al., 2026). The two results
are compatible, since the strength of the counterfeit
decides the answer. Our own results show this on
tau-bench, where the recovered layer’s lead shrinks
from the uniform counterfeit to the degree-matched
one (Table 3). A relation-aware graph network,
scored against a counterfeit of the uniform kind,
also favors the recovered layer (Appx. D.9).
The null result is narrow. It covers the evalu-
ated extraction, features, logistic model, corpora
and degree-matched counterfeit, and we report it
because it was preregistered. The result does not
show that the attachment or the grade is inert, and
it does not carry to other projections, features or
learners. Two of the four features, density and audit,
cannot move under the degree-matched or recency
counterfeit, because each step’s number of earlier
5


---

−0.04
0.00
0.04
0.08
0.12
Difference in within-corpus ROC-AUC
tau-bench
SWE-agent
SWE-Gym
OpenHands
tau2-bench
web
After correction, no corpus separates
the recovered layer from the counterfeit
+0.011 [+0.008, +0.014]
+0.048
+0.003 [−0.001, +0.007]
+0.118
−0.007 [−0.010, −0.003]
−0.023
+0.002 [−0.001, +0.005]
−0.004
−0.006 [−0.012, −0.001]
−0.009
−0.005 [−0.011, +0.001]
+0.002
p = 0.08
p = 0.38
p = 1.00
p = 0.23
p = 0.81
p = 0.88
Figure 3: Within a corpus, the recovered layer does
not separate from the degree-matched counterfeit.
Coral discs: 𝑑(Table 3) with seed-block 95% intervals
over five seeds; right column: permutation 𝑝against
degree-matched draws, 𝐵= 25; hollow markers: aware
minus n0; dotted line: the second prediction’s +0.02
threshold (H2). No 𝑝survives Holm across six corpora.
0.3
0.4
0.5
0.6
0.7
0.8
Held-out ROC-AUC (chance = 0.5)
tau-bench (DB)
SWE-agent (coding)
SWE-Gym (coding)
OpenHands (coding)
tau2-bench (DB)
web (navigation)
below chance:
the learned size
relation flips
run size alone
dependency features alone
Figure 4: In transfer, run size flips on two corpora;
the dependency features do not. One logistic model,
held-out bootstrap 95% intervals (Table A6).
sources, which both keep, fixes them (Figure 1C).
That bounds what this test could detect.
4.3
Transfer to a Held-Out Corpus
We train on five corpora and test on the held-
out sixth. The held-out corpus rotates through all
six. Each rotation fits the logistic model of §4.1 to
three feature sets: run size alone, the dependency
features alone, and run size plus the dependency
features. Pairwise transfer is in Appx. D. Training
on five corpora at once does not require a feature to
predict failure in each of them. A score therefore
describes portability under one learner rather than
a mechanism shared across corpora.
Under the logistic model the dependency fea-
tures stay above chance on every held-out corpus;
run size does not. Run size transfers to four held-
out corpora but falls below chance on tau-bench
and SWE-Gym, where the relation between run
size and failure learned elsewhere flips (Figure 4).
The dependency features alone never fall below
chance, and neither does run size plus the depen-
dency features. When held-out runs are resampled,
every interval of these two feature sets lies above
chance, while both run-size inversions lie below it
(Appx. D.5).
The pattern weakens under task resampling
and other learners. When held-out tasks are re-
sampled instead of runs, both dependency intervals
on tau-bench include chance. The paired gain of the
dependency features alone over run size stays above
zero there (Table A5). SWE-agent has too few tasks
with a resolved run for this check. An exploratory
spline refit, without uncertainty intervals, puts run
size plus the dependency features below chance on
three of the six held-out corpora (Appx. D.4).
What these results support is narrower than a
shared invariant. Under one learner and on these six
corpora, the direction run size carries flips on two
held-out corpora, while the dependency features
keep their sign on all six. That contrast is a property
of the fitted model as much as of the corpora. Under
two other learners, the dependency features alone
also fall below chance on some held-out corpora
(Appx. D.4). Within a corpus, run size is stronger
than the dependency features alone on the size-
strong corpora, so dependency does not dominate
everywhere.
5
When a Dependency Layer Restates
Run Size
A dependency layer can score well by restating
run size. Under the full-history assumption, each
step used every earlier step. Edge count and depth
then follow from the step count, so the dependency
features read off that layer restate run size. A sparse
layer can restate it too (§5.1). On SWE-Gym, the
reading-free chain and the full-history layer read
nothing about reliance, yet both beat the recovered
dependency layer (Tables 3 and 4).
5.1
How a Layer Collapses to Run Size
A full-history layer is a fixed function of run size.
If each of a run’s 𝑛steps used every earlier step,
then
𝑛dep = |𝐸𝐷| =
𝑛
2

= 𝑛(𝑛−1)
2
,
depth(𝐸𝐷) = 𝑛−1.
6


---

101
102
run size (execution steps, n)
100
102
104
dependency edges  |ED|
full-history ceiling (
n
2):
Who&When sits on it (ρ = 1)
observed layers:
0.1% to 1.8%
of the ceiling
Full-history layers collapse to run size
tau-bench  |r| = 0.68
SWE-agent  |r| = 0.49
SWE-Gym  |r| = 0.92
OpenHands  |r| = 0.82
tau2-bench  |r| = 0.78
web (AgentRewardBench)  |r| = 0.96
Who&When  |r| = 1.00
Figure 5: Inferred full-history dependencies collapse
to run size; observed dependencies sit far below
the ceiling. Dependency-edge count |𝐸𝐷| versus run
size 𝑛per run, log-log, across the seven corpora; the
dashed line is the full-history ceiling  𝑛
2
. The 126 failed
Who&When runs lie on the ceiling, every one at 𝜌= 1,
while the observed corpora sit roughly two to three
orders below it (per-corpus medians 0.001 to 0.018) yet
still climb with 𝑛. A layer at the ceiling is run size in
disguise; sitting below it does not establish the converse.
A measured edge and an assumed one carry the same
edge type (Figure 1E), so the graph alone cannot
tell a real dependency from one the assumption
invented. Observed layers track run size too, though
less tightly: their edge count correlates with step
count at |𝑟| up to 0.96. They sit two to three orders
of magnitude below the full-history ceiling yet still
climb with 𝑛(Figure 5, Appx. D). That is why §4.1
divides every feature by run length.
A sparse layer can restate run size as well. Define
the saturation ratio as the edges a layer has divided
by the full-history edge count, 𝜌=
𝑛dep
(𝑛
2) ∈[0, 1],
which reaches 1 for the full-history layer.
The
reading-free chain links each step to the step just
before it, so its ratio is only 2/𝑛. Yet each of its
four features is 1/𝑛or 1 −1/𝑛, so across runs they
vary along one direction set by run size (Appx. C).
A small saturation ratio therefore certifies nothing
about whether a layer restates run size.
5.2
Full-History and Counterfeit Layers in
Transfer
A full-history layer on the same steps carries
only run size. In each corpus we swap it in for the
recovered dependency layer, keeping the features,
labels, splits and logistic model. Within a corpus
it then fails to improve on the run-size baseline on
five of the six corpora. The exception is SWE-Gym,
where the gain is run size in disguise. Given the
four counts, this layer and the reading-free chain
each add only the reciprocal of the step count, so
Table 4: Swap the observed dependency layer for a
full-history inferred one and the cross-corpus signal
collapses. The same size-normalized shape features on
the observed layer (aware) and the full-history inferred
layer (+inf, A0), against run size (flat); ROC-AUC,
within corpus and pooled transfer. Bold: within-corpus
set beats flat; italic: below-chance transfer. The ob-
served layer sits between 𝜌= 0.001 and 𝜌= 0.018, the
inferred at 𝜌= 1.000 by construction.
Within corpus
Transfer (held-out)
Corpus
flat
aware
+inf
flat
aware
+inf
tau-bench
0.619
0.665
0.618
0.436
0.553
0.443
SWE-agent
0.628
0.713
0.595
0.624
0.691
0.605
SWE-Gym
0.663
0.804
0.828
0.359
0.590
0.342
OpenHands
0.698
0.695
0.698
0.699
0.696
0.699
tau2-bench
0.722
0.706
0.716
0.723
0.663
0.723
web
0.765
0.756
0.754
0.766
0.643
0.287
the two score alike there. In transfer both fall below
chance on three held-out corpora, one more than
run size (Table 4, Appx. D).
The saturation ratio flags such a layer but
cannot clear one. Across the corpora, the recovered
layer holds a small fraction of the full-history edges,
and the full-history layer holds all of them (Figure 5).
This makes the ratio a diagnostic to report beside the
grade. Three off-the-shelf graph networks match
run size plus the dependency features within a
corpus but trail them in transfer (Appx. D.9). Like
the logistic model, the edge-type-blind one is fooled
by the full-history layer on web.
Two readings of the within-corpus gain re-
main. Within a corpus, the preregistered test does
not separate the recovered layer from the degree-
matched counterfeit (§4.2). That counterfeit keeps
how many earlier steps each step depends on but
rewires which ones. Attachment is therefore not a
demonstrated source of the gain. On SWE-Gym, re-
liance evidence is not a demonstrated source either:
the full-history layer reads none and still scores
higher. One reading credits the gain to the de-
gree sequence, each step’s count of earlier sources,
which the counterfeit keeps (Figure 1C). The other
lets the recovered layer carry something the counts
miss when the corpus changes. Telling them apart
takes the counterfeit scored in transfer.
In transfer, the recovered layer leads the coun-
terfeit on some held-out corpora. It leads on
average, where within a corpus the mean margin
was near zero. The recovered layer also stays above
chance on every held-out corpus, while the counter-
feit falls below chance on SWE-Gym alone. Since
7


---

every layer is read together with run size, these
counts cannot split the transferred signal between
the degree sequence and the attachment. The mar-
gin over the counterfeit measures only how much
transfer changes when the attachment is rewired,
under one learner. In the transfer permutation test,
few or no degree-matched draws reach the recov-
ered layer on SWE-Gym, tau-bench and web. Only
SWE-Gym separates after correction for multiple
tests. Paired task resampling, registered after that
test and before any interval, separates all three af-
ter correction (Appx. D.6). On two corpora the
counterfeit scores higher.
Withholding the task family reverses the
largest transfer lead.
Preregistered family-
withheld transfer removes the held-out corpus’s
whole task family (coding; database and tool use;
web) from training. The recovered layer then shows
no positive separation from the counterfeit on any
held-out corpus whose training pool changed. On
SWE-Gym, where its lead was largest, the recovered
layer now trails the counterfeit, and under paired
task resampling that reversal survives correction
for multiple tests (Appx. D.7).
6
Related Work
This paper meets two literatures that seldom cite
each other, agent-graph systems and graph learn-
ing on typed, temporal, and uncertain graphs;
Appx. I treats seven adjacent areas.
Orchestra-
tion and optimizable-agent graphs (Zhuge et al.,
2024; Hong et al., 2024; Besta et al., 2024) rep-
resent a multi-agent system as a graph and tune
it for task performance. None separates a typed
state-dependency layer from execution, grades an
edge by how it is known, or measures a depen-
dency layer across corpora. A recent line trains a
graph network on the workflow graph to predict
performance (Zhang et al., 2025b). We reuse those
workflow graphs in an exploratory comparison of
graph summaries against node and edge counts
(Appx. F). The dependency layer alone is a data-
lineage or program-dependence graph (Ferrante
et al., 1987; Moreau and Missier, 2013). Network
measures of such graphs already predicted defects
in software (Zimmermann and Nagappan, 2008),
and agent computation-graph views type them for
optimization (Yue et al., 2026; Wang et al., 2025d).
A lineage graph answers what depended on what;
the grade also answers how we know. Probing work
corroborates that the dependency object is recov-
erable (Sun and Kazakov, 2026): a low-capacity
probe decodes tool-call dependency structure from
residual streams above both a random-label control
task and a positional baseline. The effect attenuates
as call order alone becomes a sufficient proxy.
The two-layer representation also separates
Grade from recent graph work on agent traces.
CHIEF builds a hierarchical causal graph and
FALAT a typed step-dependency structure, both
for failure attribution on Who&When; neither sepa-
rates execution from a dependency layer graded by
how each edge is known (Wang et al., 2026a; Rafi
et al., 2026). Three later systems bound what is new
here. EDGE distinguishes observational propaga-
tion edges from intervention-validated edges and
compares its validated graph against an edge-count-
matched random control, so an edge-evidence dis-
tinction already enters a control design (Hou et al.,
2026). Where EDGE attributes errors over an er-
ror dependency graph, AIG attributes them over
an adaptively built influence graph and reports
that richer trace representations improve attribution
(Bakish et al., 2026). RUPA propagates trajectory-
level uncertainty over execution-event nodes on tau-
2, Terminal-Bench-2 and GAIA, which overlaps our
task (Ma et al., 2026). None of the three recovers a
dependency layer over run steps in six corpora, and
none reports a control that holds each step’s degree
fixed while varying the attachment. From Agent
Traces to Trust frames agent execution as a typed
graph for evidence tracing, but stays a tracing and
lineage survey without a graded two-layer model
(Wang et al., 2026b). AgentArmor maps traces into
CFG, DFG and PDG for prompt-injection defense,
a security analysis layer with no graded dependency
layer tied to run-failure prediction (Wang et al.,
2025a).
7
Conclusion
A trace records what an agent did; Grade adds a
graded record of what each step relied on and mea-
sures its gain over run size. Over a linear run-size
baseline, the recovered dependency layer improves
failure prediction on three of the six corpora, but
the gain depends on the learner and task sampling.
On held-out corpora it stays above chance where
run size does not, under one learner and with the
same task-sampling caveat. Graph structure can
also pass for signal it does not carry: a layer in-
ferred under full history restates run size. Within
a corpus, a preregistered test does not separate the
8


---

recovered layer from a degree-matched counterfeit.
The counterfeit keeps how many earlier steps each
step depends on but rewires which ones. In trans-
fer the recovered layer leads it on some held-out
corpora and trails it on others, and its largest lead
reverses when the held-out corpus’s task family is
withheld. A gain over run size does not by itself
show that the attachment carries it. Reuse the proto-
col: grade each edge, keep a run-size baseline, and
score degree-matched attachment controls within a
corpus and in transfer.
9


---

Limitations
What the dependency layer adds over run size
is fragile. Over a linear run-size baseline it adds
failure-prediction signal on three of six corpora.
That gain depends on the learner and on task sam-
pling. Resampling tasks can leave its sign unre-
solved, and a corpus that never repeats a task cannot
test repeated-task leakage. Against the composi-
tion baseline, which also counts reads, writes and
resources, the gain shrinks under the logistic model
with run-level folds. Its point estimates there turn
negative under flexible learners.
Transfer holds under one learner only. On ev-
ery held-out corpus the dependency features alone
stay above chance, while run size falls below chance
on two. No prediction was preregistered for this
pattern. An exploratory spline refit carries no uncer-
tainty intervals. Under it, the dependency features
alone fall below chance on four of six held-out
corpora, and run size plus the dependency features
on three. No transfer check rescales run size per
corpus or builds the dependency-only block from a
counterfeit layer, so part of the contrast may reflect
feature scaling.
Counterfeit layers give the recovered attach-
ment no stable credit. Within a corpus, the prereg-
istered test does not separate the recovered depen-
dency layer from the degree-matched counterfeit.
That counterfeit keeps how many earlier steps each
step depends on but rewires which ones, and two
of the four features cannot move under it. In trans-
fer, the recovered layer separates from it on one
to three held-out corpora, depending on the test,
and the counterfeit scores higher on two. Family-
withheld transfer leaves no positive separation on
any held-out corpus whose training pool changes,
and the recovered layer’s largest lead turns negative.
These results do not show that the attachment or
the grade is inert, and they license no claim be-
yond the evaluated extraction, learner, corpora and
counterfeits.
The corpora are narrow and the runs are
short. Coverage leans on coding and database
tasks. Three corpora mix generating models, and
no analysis separates a gain from model identity.
Runs are short and observed reliance is mostly local;
long-range reliance, where run size may become a
stronger baseline, is untested.
The grading rules and graph models are pre-
liminary. Observed-grade edges rest on heuristic
attachment rules, since no agent corpus has ground-
truth reliance labels at scale. The per-edge grade is
a proposed schema: no experiment mixes grades
within a graph, so whether a model can use it is
untested. We compare only off-the-shelf graph
networks, and which architectural change would
close their transfer deficit against run size plus the
dependency features is open. Appx. H states each
limitation in full.
Ethical Considerations
This work studies a graph representation of LLM
agent runs, evaluated on public benchmarks, and it
introduces no new data collection, human subjects,
or personally identifying information. By predict-
ing failures and localizing faults, the representation
is meant to make deployed agents more reliable and
auditable. Beyond the general dual-use nature of
any reliability tooling, we identify no specific risk:
the structural signals it reads come from a run’s
own trace, already available to whoever operates the
agent. Where the declared grade adds instrumenta-
tion, the dependency logs it records (file, database,
and tool I/O) can carry sensitive payloads from the
underlying task, so a deployment should minimize
and access-control them.
References
Hiralal Agrawal and Joseph R. Horgan. 1990. Dynamic
program slicing. In Proceedings of the ACM SIG-
PLAN 1990 Conference on Programming Language
Design and Implementation (PLDI ’90), pages 246–
256. ACM Press.
Miltiadis Allamanis, Marc Brockschmidt, and Mahmoud
Khademi. 2018. Learning to represent programs with
graphs. In International Conference on Learning
Representations (ICLR).
Yarden Bakish, Amir Dudai, Roy Ganz, Oren Nuriel,
Elad Ben Avraham, Mor Shpigel Nacson, and Ron
Litman. 2026. Adaptive influence graphs for failure
attribution in multi-agent systems. arXiv preprint
arXiv:2608.24361.
Victor Barres, Honghua Dong, Soham Ray, Xujie Si, and
Karthik Narasimhan. 2026. 𝜏2-bench: Evaluating
conversational agents in a dual-control environment.
In Forty-third International Conference on Machine
Learning.
Maciej Besta, Nils Blach, Ales Kubicek, Robert Ger-
stenberger, Michal Podstawski, Lukas Gianinazzi,
Joanna Gajda, Tomasz Lehmann, Hubert Niewiadom-
ski, Piotr Nyczyk, and Torsten Hoefler. 2024. Graph
of thoughts: Solving elaborate problems with large
language models. In Proceedings of the AAAI Con-
ference on Artificial Intelligence (AAAI).
10


---

Islem Bouzenia and Michael Pradel. 2025. Understand-
ing software engineering agents: A study of thought-
action-result trajectories. In Proceedings of the 40th
IEEE/ACM International Conference on Automated
Software Engineering (ASE).
Mert Cemri, Melissa Z. Pan, Shuyi Yang, Lakshya A.
Agrawal, Bhavya Chopra, Rishabh Tiwari, Kurt
Keutzer, Aditya Parameswaran, Dan Klein, Kannan
Ramchandran, Matei A. Zaharia, Joseph E. Gonzalez,
and Ion Stoica. 2025. Why do multi-agent LLM
systems fail? In Advances in Neural Information Pro-
cessing Systems (Datasets and Benchmarks Track).
James Cheney, Paolo Missier, and Luc Moreau. 2013.
Constraints of the PROV data model. W3C Recom-
mendation, 30 April 2013.
Liming Dong, Qinghua Lu, and Liming Zhu. 2024.
AgentOps: Enabling observability of LLM agents.
arXiv preprint arXiv:2411.05285.
Jeanne Ferrante, Karl J. Ottenstein, and Joe D. Warren.
1987. The program dependence graph and its use in
optimization. ACM Transactions on Programming
Languages and Systems, 9(3):319–349.
Xu He, Di Wu, Yan Zhai, and Kun Sun. 2025. SentinelA-
gent: Graph-based anomaly detection in multi-agent
systems. arXiv preprint arXiv:2505.24201.
John Hewitt and Percy Liang. 2019. Designing and in-
terpreting probes with control tasks. In Proceedings
of the 2019 Conference on Empirical Methods in Nat-
ural Language Processing and the 9th International
Joint Conference on Natural Language Processing
(EMNLP-IJCNLP), pages 2733–2743. Association
for Computational Linguistics.
Sirui Hong, Mingchen Zhuge, Jonathan Chen, Xiawu
Zheng, Yuheng Cheng, Jinlin Wang, Ceyao Zhang,
Zili Wang, Steven Ka Shing Yau, Zijuan Lin, Liyang
Zhou, Chenyu Ran, Lingfeng Xiao, Chenglin Wu,
and Jürgen Schmidhuber. 2024. MetaGPT: Meta pro-
gramming for a multi-agent collaborative framework.
In International Conference on Learning Representa-
tions (ICLR).
Susan Horwitz, Thomas Reps, and David Binkley. 1990.
Interprocedural slicing using dependence graphs.
ACM Transactions on Programming Languages and
Systems, 12(1):26–60.
Jun Hou, Priya Pitre, Yi Fang, and Xuan Wang. 2026.
EDGE: Error dependency graph-guided multi-error
attribution in multi-agent LLM systems.
arXiv
preprint arXiv:2609.01360.
Ziniu Hu, Yuxiao Dong, Kuansan Wang, and Yizhou
Sun. 2020. Heterogeneous graph transformer. In
Proceedings of The Web Conference (WWW), pages
2704–2710.
Carlos E. Jimenez, John Yang, Alexander Wettig,
Shunyu Yao, Kexin Pei, Ofir Press, and Karthik
Narasimhan. 2024. SWE-bench: Can language mod-
els resolve real-world GitHub issues?
In Inter-
national Conference on Learning Representations
(ICLR).
Seyed Mehran Kazemi, Rishab Goel, Kshitij Jain, Ivan
Kobyzev, Akshay Sethi, Peter Forsyth, and Pascal
Poupart. 2020. Representation learning for dynamic
graphs: A survey. Journal of Machine Learning
Research, 21(70):1–73.
Bogdan Korel and Janusz Laski. 1988.
Dynamic
program slicing.
Information Processing Letters,
29(3):155–163.
Han Li, Yifan Yao, Letian Zhu, Rili Feng, Hongyi Ye,
Jiaming Wang, Yancheng He, Pengyu Zou, Lehan
Zhang, Xinping Lei, Haoyang Huang, Ken Deng,
Ming Sun, Zhaoxiang Zhang, He Ye, and Jiaheng Liu.
2026a. CodeTracer: Towards traceable agent states.
arXiv preprint arXiv:2604.11641.
Ting-Wei Li, Yuanchen Bei, Xiao Lin, and Hang-
hang Tong. 2026b. Beyond LLM-based reasoning:
Lightweight GNNs for agent failure attribution. arXiv
preprint arXiv:2608.18575.
Jinbo Liu, Defu Cao, Yifei Wei, Tianyao Su, Yuan
Liang, Yushun Dong, Yan Liu, Yue Zhao, and Xiyang
Hu. 2026. Topology matters: Measuring memory
leakage in multi-agent LLMs. In Findings of the As-
sociation for Computational Linguistics: ACL 2026,
pages 39728–39746. Association for Computational
Linguistics.
Xing Han Lù, Amirhossein Kazemnejad, Nicholas
Meade, Arkil Patel, Dongchan Shin, Alejandra Zam-
brano, Karolina Stańczak, Peter Shaw, Christopher J.
Pal, and Siva Reddy. 2025. AgentRewardBench: Eval-
uating automatic evaluations of web agent trajectories.
In Second Conference on Language Modeling.
Zhengzhao Ma, Boxi Cao, Yaojie Lu, Hongyu Lin,
Xianpei Han, and Le Sun. 2026. From sequence
to structure: Relational uncertainty propagation for
LLM agents. arXiv preprint arXiv:2608.16002.
Sergei Maslov and Kim Sneppen. 2002. Specificity and
stability in topology of protein networks. Science,
296(5569):910–913.
Luc Moreau, Ben Clifford, Juliana Freire, Joe Futrelle,
Yolanda Gil, Paul Groth, Natalia Kwasnikowska, Si-
mon Miles, Paolo Missier, Jim Myers, Beth Plale,
Yogesh Simmhan, Eric Stephan, and Jan Van den
Bussche. 2011. The Open Provenance Model core
specification (v1.1). Future Generation Computer
Systems, 27(6):743–756.
Luc Moreau and Paolo Missier. 2013. PROV-DM: The
PROV data model. W3C Recommendation.
Christopher Morris, Nils M. Kriege, Franka Bause,
Kristian Kersting, Petra Mutzel, and Marion Neu-
mann. 2020. TUDataset: A collection of benchmark
11


---

datasets for learning with graphs. In ICML Work-
shop on Graph Representation Learning and Beyond
(GRL+).
Kiran-Kumar Muniswamy-Reddy, Uri Braun, David A.
Holland, Peter Macko, Diana Maclean, Daniel Margo,
Margo Seltzer, and Robin Smogor. 2009. Layering
in provenance systems. In Proceedings of the 2009
USENIX Annual Technical Conference.
Claude Nadeau and Yoshua Bengio. 2003. Inference
for the generalization error.
Machine Learning,
52(3):239–281.
Yi Nian, Haosen Cao, Shenzhe Zhu, Henry Peng Zou,
Qingqing Luan, Yudi Zhang, and Yue Zhao. 2026.
When only the final text survives: Implicit execu-
tion tracing for multi-agent auditing. arXiv preprint
arXiv:2603.17445.
Jiayi Pan, Xingyao Wang, Graham Neubig, Navdeep
Jaitly, Heng Ji, Alane Suhr, and Yizhe Zhang. 2025.
Training software engineering agents and verifiers
with SWE-Gym. In Proceedings of the 42nd Inter-
national Conference on Machine Learning, volume
267 of Proceedings of Machine Learning Research,
pages 47717–47737. PMLR.
Michalis Potamias, Francesco Bonchi, Aristides Gionis,
and George Kollios. 2010. K-nearest neighbors in un-
certain graphs. Proceedings of the VLDB Endowment,
3(1):997–1008.
Md Nakhla Rafi, Md Ahasanuzzaman, Dong Jae
Kim, Zhijie Wang, and Tse-Hsun Chen. 2026.
FALAT: Tracing failures in LLM agent trajecto-
ries via dependency-guided search. arXiv preprint
arXiv:2606.00765.
Raghunathan Ramakrishnan, Pavlo O. Dral, Matthias
Rupp, and O. Anatole von Lilienfeld. 2014. Quan-
tum chemistry structures and properties of 134 kilo
molecules. Scientific Data, 1:140022.
Michael Schlichtkrull, Thomas N. Kipf, Peter Bloem,
Rianne van den Berg, Ivan Titov, and Max Welling.
2018. Modeling relational data with graph convolu-
tional networks. In The Semantic Web (ESWC), pages
593–607.
Haoyue Shi, Hao Zhou, Jiaze Chen, and Lei Li. 2018.
On tree-based neural sentence modeling. In Proceed-
ings of the 2018 Conference on Empirical Methods
in Natural Language Processing, pages 4631–4641,
Brussels, Belgium. Association for Computational
Linguistics.
Tianda Sun and Dimitar Kazakov. 2026. Tool-call depen-
dency structure is linearly decodable in LLM agent
residual streams. arXiv preprint arXiv:2605.25310.
František Váša and Bratislav Mišić. 2022. Null models in
network neuroscience. Nature Reviews Neuroscience,
23(8):493–504.
Peiran Wang, Yang Liu, Yunfei Lu, Yifeng Cai, Hongbo
Chen, Qingyou Yang, Jie Zhang, Jue Hong, and
Ye Wu. 2025a. AgentArmor: Enforcing program
analysis on agent runtime trace to defend against
prompt injection. arXiv preprint arXiv:2508.01249.
Shilong Wang, Guibin Zhang, Miao Yu, Guancheng
Wan, Fanci Meng, Chongye Guo, Kun Wang, and
Yang Wang. 2025b. G-Safeguard: A topology-guided
security lens and treatment on LLM-based multi-agent
systems. In Proceedings of the 63rd Annual Meet-
ing of the Association for Computational Linguistics
(Volume 1: Long Papers), pages 7261–7276, Vienna,
Austria. Association for Computational Linguistics.
Xingyao Wang, Boxuan Li, Yufan Song, Frank F. Xu,
Xiangru Tang, Mingchen Zhuge, Jiayi Pan, Yueqi
Song, Bowen Li, Jaskirat Singh, Hoang H. Tran,
Fuqiang Li, Ren Ma, Mingzhang Zheng, Bill Qian,
Yanjun Shao, Niklas Muennighoff, Yizhe Zhang,
Binyuan Hui, and 5 others. 2025c. OpenHands: An
open platform for AI software developers as generalist
agents. In The Thirteenth International Conference
on Learning Representations.
Yanbo Wang, Zixiang Xu, Yue Huang, Xiangqi Wang,
Zirui Song, Lang Gao, Chenxi Wang, Xiangru Tang,
Yue Zhao, Arman Cohan, Xiangliang Zhang, and
Xiuying Chen. 2025d. DyFlow: Dynamic workflow
framework for agentic reasoning. Advances in Neural
Information Processing Systems, 38.
Yawen Wang, Wenjie Wu, Junjie Wang, and Qing Wang.
2026a. From flat logs to causal graphs: Hierarchical
failure attribution for LLM-based multi-agent systems.
arXiv preprint arXiv:2602.23701.
Yiqi Wang, Jiaqi Zhang, Zhangkai Wu, Taotao Cai, Zirui
Liu, Zequn Sun, Manqing Dong, Mingkai Zheng,
Yiqun Duan, Xuefei Yin, and Yanming Zhu. 2026b.
From agent traces to trust: A survey of evidence
tracing and execution provenance in LLM agents.
arXiv preprint arXiv:2606.04990.
Zhiheng Xi, Wenxiang Chen, Xin Guo, Wei He, Yiwen
Ding, Boyang Hong, Ming Zhang, Junzhe Wang,
Senjie Jin, Enyu Zhou, Rui Zheng, Xiaoran Fan,
Xiao Wang, Limao Xiong, Yuhao Zhou, Weiran
Wang, Changhao Jiang, Yicheng Zou, Xiangyang
Liu, and 9 others. 2025. The rise and potential of
large language model based agents: A survey. Science
China Information Sciences, 68(2):121101.
Haoyan Xu, Zhengtao Yao, Yushun Dong, Ziyi Wang,
Ryan A. Rossi, Mengyuan Li, and Yue Zhao. 2025.
Few-shot graph out-of-distribution detection with
llms. In Proceedings of the European Conference
on Machine Learning and Principles and Practice of
Knowledge Discovery in Databases (ECML PKDD).
Keyulu Xu, Weihua Hu, Jure Leskovec, and Stefanie
Jegelka. 2019. How powerful are graph neural net-
works?
In International Conference on Learning
Representations (ICLR).
12


---

Fabian Yamaguchi, Nico Golde, Daniel Arp, and Konrad
Rieck. 2014. Modeling and discovering vulnerabili-
ties with code property graphs. In Proceedings of the
2014 IEEE Symposium on Security and Privacy (SP),
pages 590–604. IEEE.
John Yang, Carlos E. Jimenez, Alexander Wettig, Kilian
Lieret, Shunyu Yao, Karthik Narasimhan, and Ofir
Press. 2024. SWE-agent: Agent-computer interfaces
enable automated software engineering. In Advances
in Neural Information Processing Systems (NeurIPS),
volume 37.
Shunyu Yao, Noah Shinn, Pedram Razavi, and Karthik
Narasimhan. 2025. 𝜏-bench: A benchmark for tool-
agent-user interaction in real-world domains.
In
The Thirteenth International Conference on Learning
Representations.
Shunyu Yao, Jeffrey Zhao, Dian Yu, Nan Du, Izhak
Shafran, Karthik Narasimhan, and Yuan Cao. 2023.
ReAct: Synergizing reasoning and acting in language
models. In International Conference on Learning
Representations (ICLR).
Ling Yue, Kushal Raj Bhandari, Ching-Yun Ko, Dhaval
Patel, Shuxin Lin, Nianjun Zhou, Jianxi Gao, Pin-Yu
Chen, and Shaowu Pan. 2026.
From static tem-
plates to dynamic runtime graphs: A survey of work-
flow optimization for LLM agents. arXiv preprint
arXiv:2603.22386.
Shaokun Zhang, Ming Yin, Jieyu Zhang, Jiale Liu,
Zhiguang Han, Jingyang Zhang, Beibin Li, Chi Wang,
Huazheng Wang, Yiran Chen, and Qingyun Wu.
2025a. Which agent causes task failures and when?
on automated failure attribution of LLM multi-agent
systems. In Proceedings of the 42nd International
Conference on Machine Learning, volume 267 of
Proceedings of Machine Learning Research, pages
76583–76599. PMLR.
Yuanshuo Zhang, Yuchen Hou, Bohan Tang, Shuo Chen,
Muhan Zhang, Xiaowen Dong, and Siheng Chen.
2025b.
FLORA: GNNs as predictors of agentic
workflow performances. In The Fourth Learning on
Graphs Conference.
Jialong Zhou, Lichao Wang, and Xiao Yang. 2025.
GUARDIAN: Safeguarding LLM multi-agent collab-
orations with temporal graph modeling. In Advances
in Neural Information Processing Systems, volume 38,
pages 8881–8909.
Yaqin Zhou, Shangqing Liu, Jingkai Siow, Xiaoning Du,
and Yang Liu. 2019. Devign: Effective vulnerability
identification by learning comprehensive program
semantics via graph neural networks. In Advances in
Neural Information Processing Systems 32 (NeurIPS
2019), volume 32. Curran Associates, Inc.
Mingchen Zhuge, Wenyi Wang, Louis Kirsch, Francesco
Faccio, Dmitrii Khizbullin, and Jürgen Schmidhuber.
2024. GPTSwarm: Language agents as optimizable
graphs. In International Conference on Machine
Learning (ICML).
Thomas Zimmermann and Nachiappan Nagappan. 2008.
Predicting Defects using Network Analysis on Depen-
dency Graphs. In Proceedings of the 30th Interna-
tional Conference on Software Engineering (ICSE),
pages 531–540. ACM.
13


---

Supplementary Material for Grade
A
Formal Class and Correspondence
A.1
The Formal Tuple and Recovery Maps
A run is a directed, typed, temporal multigraph
𝐺= (𝑉, 𝐸𝑋, 𝐸𝐷, 𝜏, 𝑡, 𝜎),
with a typing map, a time map, and a source map
𝜏: 𝑉→{agent, decision, tool, resource},
𝑡: 𝑉→R≥0,
𝜎: 𝐸𝐷→{observed, declared, inferred}.
The map 𝜏labels each node and 𝑡orders nodes
in time, with resource nodes versioning the state
they hold. The execution layer 𝐸𝑋⊆𝑉× 𝑉is
labeled by 𝜅: 𝐸𝑋→{emit, handoff}: an agent
emits its decision and tool nodes, and control hands
off between consecutive steps. The dependency
layer 𝐸𝐷⊆𝑉× 𝑉holds reliance edges,
(𝑢, 𝑣) ∈𝐸𝐷⇒𝑡(𝑢) < 𝑡(𝑣),
meaning step 𝑣used state produced or held by the
earlier node 𝑢. The source map 𝜎records, per edge,
which grade of the attachment model it carries.
The two layers arise from a trace 𝑇in different
ways. The execution layer is a deterministic read-
off,
𝐸𝑋= 𝑓exec(𝑇).
The dependency layer is not fixed by𝑇alone. Where
read and write events 𝑅(𝑇) are available, whether
already present in the trace content or emitted by
added instrumentation, the dependency edges are
recovered from them,
𝑓rec(𝑅(𝑇)) ⊆𝐸𝐷,
and 𝜎marks each such edge observed or declared
accordingly. Where no access events exist, the layer
is inferred under an assumption A,
𝐸𝐷= 𝑓infer(𝑇, A),
𝜎≡inferred,
the weakest assumption A0 being full history:
(𝑢, 𝑣) ∈𝐸𝐷
for every 𝑢with 𝑡(𝑢) < 𝑡(𝑣).
A.2
Related Views as Fragments of One
Graph
Execution-side fragments are the common case.
A reason-act trace (Yao et al., 2023) is the execu-
tion chain of a single agent expanded over its tool
calls, and an orchestration or optimizable-agent
graph (Zhuge et al., 2024; Hong et al., 2024) is
the agent-level execution graph used to coordinate
agents or to optimize task performance. Some of
these carry dependency-like edges. GPTSwarm’s
single edge set is at once execution topology and
information flow, and that paper states the gap the
two layers keep apart, that “many routines might
be designed to ignore the input and operate solely
in the context provided by the predecessor nodes.”
A computation graph (Yue et al., 2026) carries one
undifferentiated edge set in its definition, with the
control, data and communication split described in
prose and no typing function that separates them.
In each of these the dependency layer stays partial
and carries no per-edge grade. The mirror-image
fragment drops the execution layer instead: a data-
lineage or PROV graph keeps what was read and
written and carries no per-edge grade, and its activ-
ity ordering is entity-mediated in both directions:
one inference derives that ordering from genera-
tion composed with use, and the converse makes
a directly asserted ordering imply an entity that
one activity generated and the other used (Cheney
et al., 2013). The Open Provenance Model calls
the same composition’s summary lossy (Moreau
et al., 2011). So two steps that ran in sequence
and exchanged nothing get no edge at all. Lay-
ered lineage-capture systems already separate what
the system observes from what an application dis-
closes through an interface (Muniswamy-Reddy
et al., 2009); the grade carries that distinction onto
agent dependency edges and adds a rung for edges
posited under an assumption. Agent-graph anomaly
detectors (He et al., 2025; Zhou et al., 2025) build
an execution graph for a security objective and like-
wise leave state dependency partial; GUARDIAN
is homogeneous, with one node kind and one edge
kind, and SentinelAgent pairs a statically declared
graph with a dynamically observed one.
B
The Two-Layer Object
Neither layer is the contribution by itself. The
execution layer alone is ordinary control flow, the
directed record of which step followed which that
any log or call graph already supplies; representing
14


---

it is established, and §2 reads prior agent-graph
work as projections onto it. A dependency layer on
its own is a data-lineage graph, a reads-and-writes
relation over evolving state of the kind PROV-style
and dataflow systems have recorded for years. The
object this paper adds is the pair, joined by a per-
edge observability grade: every dependency edge
is stamped observed, declared, or inferred, so the
model knows how each reliance edge was obtained
and can price the dependency layer against the
execution one. The attachment model (§2) is that
stamp, and the marginal-lift estimand is the price.
Two analyses run on the joined object, one per
layer, and each is scored on its own task. The depen-
dency layer is scored on run-level failure prediction,
reported as marginal lift over run size (§4.1). A gold
final state scores the two database corpora, issue
resolution the three software-engineering corpora,
and task outcome the web corpus. On Who&When
the execution layer is scored on a different task. A
score learned over eight execution-layer features
ranks a failed run’s labeled faulting step against
a position prior (Appx. E). Within a single edge
set the observability grade keeps an assumed edge
distinct from a logged one, so a method reading the
graph can treat them differently. Neither analysis
sorts runs into coordination and reliance categories,
so Table A1 states the design rationale for carrying
two layers and reports no measured mapping from
failure type to layer. Whether the pair is required
also goes untested. Marginal lift prices one layer
against a summary of the other, and no experiment
here asks whether both must sit on one node set for
either result to hold. Attributing a run to its failure
mode awaits a corpus with observed dependencies
and step-level fault labels, a gap the Limitations
section already records.
B.1
Keeping the Marginal-Lift Estimand
Honest
One choice keeps the estimand honest and one pre-
caution is weaker than it looks. The comparison is
nested, flat against flat-plus-dependency on identi-
cal cross-validation splits, so Δdep isolates what the
dependency block adds to the counts. The features
are also divided by run length, which rescales them
but does not free them of run length: under the
full-history assumption the normalized edge count
is (𝑛−1)/2, still linear in 𝑛. So normalization
does not establish that a gain reflects information
beyond run size, and the paper does not rest on it:
on OpenHands and the web corpus a dependency-
only model reaches essentially the flat AUC and
adding the block moves the mean down, which is
what redundancy looks like under this probe. The
estimand is allowed to come out near zero. On the
three size-strong corpora Δdep lands at or just below
zero (§4.1). On the other three the lift is positive,
and what it clears is a free run-size summary drawn
from the execution layer rather than chance; it does
not clear every function of run size (§4.1). The
permutation diagnostic of Appx. C.8 finds the link
between baseline strength and gain compatible with
arithmetic coupling alone.
C
Within-Corpus Protocol and Ablations
C.1
Corpus Cards
Table A2 lists, for each corpus, the public release
and revision, the models that generated the runs,
the rule that selected them, and the share of runs
that carry no dependency edge. The anonymized
supplementary artifact holds the loaders that apply
these rules and a machine-readable card per corpus.
The observed grade records where the evidence
for an edge came from, and three different rules
realize it here. On tau-bench a consequential write
attaches to every prior database read, a conservative
upper bound rather than a keyed match, because
the trace does not label which read a write relied
on. In the file and web corpora an edge links each
access to the most recent earlier access to the same
resource, which is resource-keyed. On tau2-bench
the rule is identifier-keyed: a step attaches to the
most recent earlier step that produced an identifier
it consumes. Attachment rules affect density; each
graph records its rule, which results should name.
C.2
Probe Design
We predict run failure with standardized logistic
regression scored by ROC-AUC, the area under
the receiver operating characteristic curve. The
quantity of interest is the marginal-lift estimand
from §3: the increase in AUC when the depen-
dency block joins a model that already holds the
free execution-layer size features. The baseline
model, flat, uses run size alone, the counts of
steps, tool calls, decisions, and agents, which is
exactly what the observed execution layer hands
over at no cost. Within each corpus the agent count
is constant and decisions equal steps minus tool
calls; on SWE-agent, OpenHands and web, tool
calls also equal decisions. The standardized flat
block therefore has rank two on tau-bench, SWE-
15


---

Table A1: The two edge layers and the analysis each one was evaluated on. Failure prediction over six corpora
evaluates the dependency layer, and ranking a failed Who&When run’s labeled faulting step evaluates the execution
layer. The failure-mode row states the design rationale for carrying two layers; no experiment here assigns a run to a
failure mode.
Dependency layer (the costly signal)
Execution layer (the free base)
Records
State reliance: what each step read or wrote
Control flow: which step ran, in what order
Failure mode
Reliance: the state a step used has gone bad
Coordination: control moves wrongly
Surfaces as
Size-normalized dependency shape predicts
failure
Execution topology ranks the labeled faulting step
Tested in
§4, six corpora
Appx. E, Who&When
Gym and tau2-bench, and rank one, run length
alone, on the other three corpora. The treatment
model, flat+dep, adds the four size-normalized
dependency features defined below. We divide
those features by run length, which removes the
raw growth of dependency counts with run length
without making them independent of it. Under
the full-history assumption the collinearity reaches
an extreme and the layer becomes a deterministic
function of run size, the normalized edge count
standing at (𝑛−1)/2; that degenerate regime is
analyzed in §5. With observed dependencies the
rescaling is a precaution rather than a separation, so
the nested comparison, and not the normalization,
is what makes Δdep interpretable.
Write 𝑠1, . . . , 𝑠𝑛for the run’s execution steps in
temporal order, and 𝐷= {(𝑖, 𝑗) : (𝑠𝑖, 𝑠𝑗) ∈𝐸𝐷}
for the dependency edges among them.
Edges
run earlier to later as in Appx. A, so (𝑖, 𝑗) ∈𝐷
implies 𝑖< 𝑗and records that step 𝑗accessed
a resource or identifier that step 𝑖produced or
accessed earlier, under the corpus’s attachment rule.
The four features are
𝜙dens = |𝐷|/𝑛,
𝜙depth = depth(𝐷)/𝑛,
𝜙blast =
1
𝑛max
𝑖
{ 𝑗: (𝑖, 𝑗) ∈𝐷}
,
𝜙audit =
1
𝑛max
𝑗
{ 𝑖: (𝑖, 𝑗) ∈𝐷}
,
where depth(𝐷) counts the edges on the longest
directed path. A large 𝜙blast says that one step is
relied on by a large share of the run, so a fault
in it can reach many later steps.
Where 𝜙audit
is large, one step draws on a large share of the
run, so checking that step means reading most
of the history. The reference implementation calls
the four dep_edges_per_step, rel_dep_depth,
max_blast_share and max_audit_share, in
that column order. It stores each edge reversed,
from the later step to the earlier one, so the blast
count is an in-degree there and the audit count an
out-degree.
Two cases make the arguments of §5 checkable
in one line.
Under A0 every earlier step is an
endpoint, so 𝜙dens = (𝑛−1)/2 and 𝜙depth = 𝜙blast =
𝜙audit = (𝑛−1)/𝑛, all four functions of 𝑛alone.
For the sparse chain, where each step attaches
only to its predecessor, 𝜙dens = 𝜙depth = (𝑛−
1)/𝑛and 𝜙blast = 𝜙audit = 1/𝑛for 𝑛≥2. Each
run’s row is then  1 −1
𝑛, 1 −1
𝑛,
1
𝑛,
1
𝑛
, so across
runs of differing length the raw block has rank 2.
Centering the columns leaves every row a multiple
of (−1, −1, 1, 1), so the centered rank is 1. The full-
history block keeps rank 2 under the same centering,
over runs of three or more distinct lengths. Its first
column is affine in 𝑛while the other three are affine
in 1/𝑛.
We evaluate every model under five-fold stratified
cross-validation repeated over five seeds, and report
seed-block 95% confidence intervals across the five
seeds. A gain whose interval excludes zero clears
zero across split seeds; the interval measures split
sensitivity on a fixed corpus, not the sampling of
tasks.
On the within-corpus AUCs of Table 3,
in that table’s corpus order, the seed-block 95%
half-widths are ±0.003, ±0.003, ±0.007, ±0.003,
±0.005 and ±0.002 for flat, and ±0.006, ±0.009,
±0.005, ±0.007, ±0.002 and ±0.007 for aware.
C.3
Dependency Shape Adds Beyond Revisit
Density
Granting the within-corpus lift of §4.1 (Figure A1),
a skeptic can still doubt its content. Perhaps the
dependency block only counts how often a run
revisits state, so failed runs touch the same file
or row more often and the gain is revisit volume
rather than dependency structure.
We separate
volume from structure.
The dependency block
splits into one revisit-density feature, dependency
edges per step, and three shape features: relative
reliance-chain depth, the largest blast hub share
16


---

Table A2: Corpus cards. Every corpus keeps runs with at least two steps; label 1 is a failed run. Only the tau-bench
loader pins its revision; for the others the table gives the revision the rebuild resolved. The web cohort was drawn
from a copy of the release that lacks seven trajectory files, which the card lists. Task counts use corrected identifiers;
on the archived web cohort, Figure A2(b) counts 202. The SWE-agent, SWE-Gym and OpenHands scaffolds are
read from the release names; their machine-readable cards leave the scaffold field as not recorded. Where a release
states no license, its benchmark code is MIT (tau-bench, tau2-bench) or Apache 2.0 (SWE-Gym).
tau-bench
SWE-agent
SWE-Gym
OpenHands
tau2-bench
web
Release
AgentSuite/
tau-bench-
trajectories
nebius/
SWE-agent-
trajectories
SWE-Gym/
OpenHands-
Sampled-
Trajectories
nebius/
SWE-rebench-
openhands-
trajectories
AgentSuite/
tau2-bench-
trajectories
McGill-NLP/
agent-reward-
bench
Revision
382e57d
68195a1
baf3a4e
3545538
07264f1
b6d17e6
License
none stated
CC BY 4.0
none stated
CC BY 4.0
none stated
research terms of
use
Models (runs) Claude 4.5
Sonnet
(thinking),
GPT-4.1,
GPT-4o-mini,
Kimi-K2-
Instruct (165
each)
swe-agent-llama-
70b (570),
swe-agent-llama-
8b (30)
GPT-4o
(2024-08-06),
one sampled run
(376)
Qwen3-Coder-
480B (600)
Qwen3-235B-
A22B-Thinking
(278)
Claude 3.7
Sonnet (200),
Qwen2.5-VL-
72B (199),
GPT-4o (103),
Llama-3.3-70B
(98)
Scaffold
not recorded
SWE-agent
OpenHands
OpenHands
not recorded
GenericAgent
Selection
all runs of four
model files with
a database check
first 600 runs of
shard 0
largest balanced
run cohort, 188
per class
first 600 runs of
shard 0
largest balanced
cohort of the first
ten model files,
139 per class
first 600
annotated runs,
WebArena and
VisualWe-
bArena
Runs / tasks
660 / 165
600 / 35
376 / 376
600 / 574
278 / 278
600 / 203
Failed
363 (55.0%)
540 (90.0%)
188 (50.0%)
312 (52.0%)
139 (50.0%)
399 (66.5%)
Steps, median
[IQR]
29 [25, 38]
34 [22, 56.5]
28 [14.75, 50]
122 [101.5,
150.5]
22 [16, 29]
26 [12, 62]
No
dependency
edge
119 (18.0%)
74 (12.3%)
3 (0.8%)
0 (0.0%)
23 (8.3%)
25 (4.2%)
(the most-relied-upon node’s share of downstream
steps), and the largest audit hub share (the step that
draws on the most prior state). We then ask whether
shape adds anything once density is in the model. It
does, on all three corpora where dependency helps:
+0.046 on tau-bench, +0.036 on SWE-agent, and
+0.064 on SWE-Gym, five of five seeds with the
seed-block 95% interval excluding zero.
The three corpora reach that result by different
routes, and the difference bounds the claim. tau-
bench is the clean case: adding revisit density
to run size leaves the AUC where it was, 0.619
to 0.620, a paired gain whose seed-block interval
[−0.002, +0.003] spans zero, and the lift appears
only when chain depth and hub concentration enter
(0.665). There the gain is shape rather than revisit
count. On SWE-agent and SWE-Gym the density
feature itself already raises AUC above the flat
baseline, and shape adds a further +0.036 and
+0.064 on top. There revisit density is part of the
signal and shape is the part it misses. The honest
summary is therefore narrower than a blanket claim
that the gain ignores revisit count: dependency
shape carries information beyond revisit density
on every corpus where the dependency layer helps,
while revisit density itself contributes on two of the
three.
C.4
Dependency Alone Matches Run Size
Where Size Is Strong
The redundancy reading of the three size-strong
corpora makes a testable claim. If the dependency
layer is redundant with size there, then dependency
features on their own, with the size counts removed,
should still predict failure. They do. A dependency-
only model reaches 0.694 on OpenHands against
the flat 0.698 from size and 0.755 on the web corpus
against the flat 0.765, matching size on both; on
tau2-bench it is weaker at 0.645 against the flat
0.722 but stays well above chance. The dependency
layer still predicts failure by itself; it is simply
redundant with size, which is why it adds no lift
17


---

0.60
0.65
0.70
0.75
0.80
Within-corpus ROC-AUC
tau-bench
(DB)
SWE-agent
(coding)
SWE-Gym
(coding)
OpenHands
(coding)
tau2-bench
(DB)
web
(navigation)
Run size (flat) to flat plus the dependency block, fixed logistic
probe, five-fold CV over five seeds; paired gain at right
Three gains clear zero, two are negative, one spans zero
+0.046
+0.085
+0.142
−0.004
−0.015
−0.009
[+0.041, +0.051]
[+0.077, +0.094]
[+0.135, +0.149]
[−0.009, +0.002]
[−0.021, −0.009]
[−0.016, −0.002]
gain  [seed-block 95% CI]
run size (flat)
flat + dependency
Figure A1: Within-corpus ROC-AUC under the fixed lo-
gistic probe, from flat to flat plus the size-normalized
dependency block, in Table 3’s corpus order. Order and
gain share the flat baseline, so they are arithmetically
coupled (permutation 𝑝= 0.56, Appx. C.8).
once size is in the model. Redundancy here is
overlap between two informative blocks.
The same test draws out the complementary case.
On tau-bench the dependency-only model (0.569)
is weaker than size alone (0.619), yet the combined
model clears both at 0.665: dependency and size
each catch failures the other misses, so they add
instead of overlap. The split between tau-bench,
where the two blocks complement, and OpenHands
and the web corpus, where they overlap, is the split
the marginal-lift estimand exists to read. It is also
why we price the costly dependency layer against
the free execution layer rather than reporting either
block alone.
C.5
Matched Learner Controls for Run Size
Figure A2(a) compares size plus dependency fea-
tures with size alone using the same learner and
matched splits. The size block contains the four
recorded counts: steps, tool calls, decisions, and
agents.
The augmented arm adds the recorded
dependency feature block. All results use the cor-
rected dependency cache and the shared web cohort
used by the primary analysis.
Each arm uses five seeds and five stratified run-
level folds per seed.
We average the five fold
AUCs within each seed and form paired differences
𝑑𝑠. The reported interval is ¯𝑑± 2.776 sd(𝑑𝑠)/
√
5.
These nominal intervals describe split sensitivity
on the fixed corpus; repeated folds reuse runs,
and the intervals do not quantify sampling of new
tasks or corpora.
No adjustment across the 18
comparisons is applied. Grouped evaluation is a
separate analysis.
Logistic regression uses training-only standard-
ization, balanced classes, liblinear, and 𝐶= 1. The
spline model applies training-only variance filtering,
cubic splines with five quantile knots per retained in-
put, linear extrapolation, and standardization before
the same logistic learner. The augmented spline
arm also expands the dependency inputs. GBT
uses 200 iterations, learning rate 0.05, at most 15
leaves, minimum leaf size 20, L2 regularization
1, balanced classes, and no early stopping. The
learner configurations are fixed; this comparison
does not search all nonlinear size models.
SWE-Gym has a positive logistic increment
(+0.142), a negative spline increment (−0.020), and
a positive GBT increment (+0.039), with all three
intervals excluding zero.
Mixed point-estimate
signs occur on two of six corpora, SWE-Gym and
web. Both flexible-learner intervals on web include
zero, leaving its reversal unresolved. OpenHands
and tau2-bench have negative point estimates un-
der all three learners. On OpenHands, the spline
and GBT intervals exclude zero; on tau2-bench,
the logistic and spline intervals exclude zero. A
flexible-learner increment has an interval entirely
above zero on tau-bench, SWE-agent, and SWE-
Gym. These comparisons do not identify depen-
dency information independent of every function
of run size.
For transparency, two selected cross-learner con-
trasts on SWE-Gym are also retained as exploratory
checks. Selecting the strongest dependency arm
(GBT) and strongest size arm (spline) gives +0.012
AUC; comparing the logistic dependency arm with
the selected size spline gives −0.028. Both choices
use the observed evaluation results, change the
learner across arms, and lack a selection-adjusted
interval. The size spline reaches 0.832 AUC, com-
pared with 0.804 for the logistic dependency arm;
that comparison cannot replace a matched incre-
ment.
An execution-side composition baseline. A
stronger baseline adds to the four counts the
numbers of reads, writes and distinct resources,
a repeat count, per-tool call counts, log 𝑛and
1/𝑛.
Under the logistic probe the increment
over it falls from +0.046 to +0.018 on tau-bench
(task-grouped, from +0.028 to +0.014, interval
[+0.002, +0.026]), from +0.085 to +0.065 on
SWE-agent (task-grouped, from −0.011 to +0.010,
interval spanning zero) and from +0.142 to +0.012
18


---

−0.05
0.00
0.05
0.10
0.15
0.20
0.25
Increment in ROC-AUC
tau-bench
(DB)
SWE-agent
(coding)
SWE-Gym
(coding)
OpenHands
(coding)
tau2-bench
(DB)
web
(navigation)
(a) By learner, run-level split
+0.031 [+0.0221, +0.0409]
+0.046 [+0.0413, +0.0510]
+0.049 [+0.0378, +0.0601]
+0.074 [+0.0314, +0.1158]
+0.085 [+0.0769, +0.0937]
+0.118 [+0.0956, +0.1408]
−0.020 [−0.0280, −0.0127]
+0.142 [+0.1346, +0.1487]
+0.039 [+0.0262, +0.0510]
−0.019 [−0.0228, −0.0144]
−0.004 [−0.0088, +0.0016]
−0.044 [−0.0556, −0.0324]
−0.014 [−0.0278, −0.0002]
−0.015 [−0.0211, −0.0093]
−0.001 [−0.0179, +0.0150]
−0.006 [−0.0138, +0.0015]
−0.009 [−0.0164, −0.0025]
+0.001 [−0.0037, +0.0052]
logistic
spline
GBT
−0.05
0.00
0.05
0.10
0.15
Increment in ROC-AUC
(b) Logistic, by split policy
+0.046 [+0.041, +0.051]
+0.028 [+0.012, +0.045]
informative
tasks 165, max 4
+0.085 [+0.077, +0.094]
−0.011  [−0.030, +0.007]
informative
tasks 35, max 65
[+0.135, +0.149]
+0.142
[+0.138, +0.158]
+0.148
vacuous
tasks 376, max 1
−0.004 [−0.009, +0.002]
−0.000 [−0.005, +0.004]
limited
tasks 574, max 2
−0.017 [−0.032, −0.001]
−0.017 [−0.026, −0.009]
vacuous
tasks 278, max 1
−0.007 [−0.012, −0.001]
−0.011 [−0.021, −0.001]
informative
tasks 202, max 4
run-level
task-grouped
Within-corpus increment, by learner and by split policy
Size plus dependency minus size alone, ROC-AUC; bars are nominal 95% seed-block t intervals over five split seeds
Figure A2: Within-corpus matched increments in ROC-AUC, size plus dependency minus size alone. (a) Under
three learners; bars give nominal 95% seed-block 𝑡intervals for variation across the five split seeds. (b) Under
the logistic probe, with a run-level split and with folds grouped by task. Tasks counts distinct task identifiers and
max the largest number of runs any one task contributes. A corpus whose tasks each carry one run already holds
out whole tasks under either policy, so the comparison between its two markers tests nothing about repeated-task
leakage and is marked vacuous rather than counted as a check that passed. In (b), the tau2-bench and web rows run
on historical inputs, described in the text, which is why their run-level markers differ from the logistic markers in (a).
Both rows are retained as historical checks.
on SWE-Gym, and it stays at or below zero on
the other three corpora. Under the spline and the
boosted tree with run-level folds, each of the three
point estimates is negative and no interval lies
above zero. With task-grouped folds the spline
gives −0.011 ([−0.019, −0.003]) on tau-bench and
+0.022 ([+0.013, +0.030]) on SWE-agent, where
both spline arms score below chance (0.439 and
0.461); the boosted tree gives +0.001 and −0.009,
both intervals spanning zero. This comparison
and the task-resampled intervals of Appx. C.7 ran
under a protocol written before their values were
computed. Its reproduction gate stops an analy-
sis on failure, and it stopped both on tau2-bench,
where runs with identical features and opposite
labels receive exactly tied probabilities in the re-
run. The gate was then relaxed to accept such
ties. Every printed value it checks is unchanged,
and the tau2-bench values of both analyses use the
rerun’s resolution of the ties. Before that relaxation,
scratch runs had computed this comparison’s values
on the other five corpora, which pass the original
gate, so the relaxation cannot move them. Earlier
code-path checks of the task-resampled intervals,
with few replicates, placeholder web identifiers and,
in one case, a loosened gate, were never reported
or used. The supplementary deviation log records
the relaxation, the scratch runs and the code-path
checks, and states that the relaxation was decided
on the gate evidence alone.
C.6
Flexible Size Baselines
The size block of Appx. C.5 enters the probe linearly.
Table A3 adds two flexible size baselines, fixed with
their reporting rule before any value was computed:
B1 adds 1/𝑛and log 𝑛to the four counts, and B2
adds a cubic spline basis in 𝑛. Each treatment
adds the four dependency features to its baseline,
with the learner, folds and seed-block intervals of
Appx. C.5. Task-grouped folds follow Appx. C.7 on
the corrected task identifiers, so web’s task-grouped
B0 row is the current-cache value that Appx. C.7
reports, not the archived row of Figure A2(b). The
rule calls an increment separated from these func-
tions of run size only when its B1 interval lies
above zero under run-level folds and under the cor-
pus’s grouping policy: task-grouped folds where
tasks repeat, and folds grouped by repository on
SWE-Gym. Only tau-bench meets it. Under B1
and B2 alike, its seed-block intervals lie above zero
under both fold policies, and its task-level intervals
include zero. With run-level folds, its B0 and B1
task-level intervals (Tables 2 and A3) agree at three
decimals and differ at four: [−0.0053, +0.0996]
19


---

against [−0.0048, +0.1000]. SWE-Gym’s incre-
ment turns negative under both baselines. The
composition baseline of Appx. C.5 contains B1’s
terms, yet over it SWE-Gym’s increment is +0.012;
that baseline alone scores 0.798 against B1’s 0.827,
so the sign depends on which other counts share the
model. SWE-agent’s B1 increment stays positive
under run-level folds and loses its interval under
task grouping; its task-grouped B2 interval clears
zero by 0.0003, between two arms below chance
(AUC 0.433 and 0.446). Folds grouped by repos-
itory cannot be formed on SWE-Gym: only two
of its 11 repositories hold a failed run, so three of
every five test folds hold resolved runs only. That
policy yields no AUC, no claim rests on it, and
SWE-Gym already fails the run-level condition.
C.7
Grouping the Folds by Task
A run-level split can place two runs of the same task
on both sides of a fold, so a model may be scoring
task identity rather than run structure. We compare
run-level folds against StratifiedGroupKFold on
the saved task identifier, five folds and seeds 0 to
4, with the size and size-plus-dependency arms
sharing folds within each policy and the learner and
feature blocks of Appx. C unchanged. This compar-
ison runs on the archived C2 cache. Four corpora
match the cache used elsewhere in this paper: tau-
bench, SWE-agent, SWE-Gym and OpenHands.
Two do not. The tau2-bench row carries historical
dependency features that the producer fix super-
seded. The web row runs on an archived 600-run
cohort that shares 599 runs with the current one,
and those shared runs carry identical features and
identical labels. One failed run stands in the archive
where a successful run stands in the current cohort.
That single substitution shifts the row order, so
the two label arrays disagree at 241 positions be-
fore run identities are matched.
We keep both
rows as historical checks and label them here rather
than present all six as one current analysis. On
the current caches with corrected task identifiers,
the web increment under grouped folds is −0.014
([−0.020, −0.009]), negative as in the archived row,
and tau2-bench, with one run per task, needs no
grouped rerun. Figure A2(b) reports both policies.
Every grouped fold has zero train-test task overlap,
and every fold set partitions the corpus.
Three corpora carry information about leakage,
tau-bench, SWE-agent, web, because their runs
repeat tasks.
Two, SWE-Gym and tau2-bench,
have one run per task, so both policies already
hold out whole tasks.
The two algorithms can
still choose different folds, and on SWE-Gym they
do, but neither corpus tests sensitivity to repeated-
task leakage, so their agreement certifies nothing
about it; OpenHands is between, with 26 of its 574
tasks holding two runs. SWE-agent is the case
that matters. Its 600 runs come from 35 tasks,
and grouping removes the lift outright: +0.085
becomes −0.011, with the interval spanning zero
and one positive seed of five. tau-bench keeps a
gain that clears zero at a smaller size. The web
corpus is negative under both policies and stays
negative.
The reading is that the SWE-agent lift of §4.1 is
not established once task identity is held out, that
the tau-bench lift survives at roughly 60% of its run-
level size, and that SWE-Gym’s largest-in-the-paper
gain is untested by this check rather than confirmed
by it. The intervals here describe split sensitiv-
ity on fixed corpora; they do not resample tasks.
Resampling tasks instead (2000 draws, pooled
out-of-fold predictions, run-level folds) gives
[−0.005, +0.100] on tau-bench, [+0.084, +0.217]
on
SWE-Gym,
[−0.015, +0.004]
on
Open-
Hands,
[−0.028, −0.003] on tau2-bench and
[−0.024, +0.005] on web; SWE-agent, with 5 of
its 35 tasks holding a resolved run, has too few task
clusters for that interval.
C.8
The Ordering Is Coupled to the Baseline
A corpus’s place in this order is fixed by its flat
baseline, and each gain subtracts that same baseline,
so the two quantities are mathematically coupled.
Part of any association between them is therefore
arithmetic. Across the six corpora the association
measures Pearson −0.658, Spearman −0.714 and
Kendall −0.467. Four of the 15 corpus pairs put
the larger gain on the higher flat baseline, so
the within-corpus ordering falls short of a strict
reversal. A permutation diagnostic that holds each
baseline fixed and reassigns the combined scores
across corpora puts the observed association well
inside its null, at two-sided 𝑝= 0.56 for Pearson and
𝑝= 0.79 for Kendall over all 720 assignments. The
ordering is therefore compatible with the arithmetic
alone. That result does not show the dependency
effect is absent; it shows this design and these six
points cannot separate the two. The transfer panel
of Appx. D.4 raises the same objection, reaches
Kendall −1.000 on its logistic arm, and reports no
calibrated test either.
20


---

Table A3: Within-corpus increment of the dependency block over three size baselines under the logistic probe: B0 is
the four counts, B1 adds 1/𝑛and log 𝑛, and B2 adds a cubic spline basis in 𝑛with five knots at training-fold quantiles.
Brackets are seed-block 95% intervals; the last column resamples tasks for the pooled out-of-fold B1 increment. run
and task are run-level and task-grouped folds. A dash marks a corpus with too few task clusters for that interval.
Corpus
Folds
B0
B1 [95%]
B2 [95%]
Task CI, B1
tau-bench
run
+0.046
+0.046 [+0.041, +0.052]
+0.047 [+0.037, +0.057]
[−0.005, +0.100]
task
+0.028
+0.028 [+0.009, +0.047]
+0.030 [+0.014, +0.047]
[−0.022, +0.084]
SWE-agent
run
+0.085
+0.125 [+0.110, +0.141]
+0.097 [+0.074, +0.120]
—
task
−0.011
+0.006 [−0.010, +0.021]
+0.013 [+0.000, +0.026]
—
SWE-Gym
run
+0.142
−0.006 [−0.011, −0.002]
−0.006 [−0.009, −0.002]
[−0.024, +0.021]
OpenHands
run
−0.004
−0.004 [−0.009, +0.001]
−0.003 [−0.008, +0.001]
[−0.013, +0.005]
task
−0.000
−0.000 [−0.005, +0.004]
−0.000 [−0.001, +0.001]
[−0.009, +0.009]
tau2-bench
run
−0.015
−0.018 [−0.024, −0.013]
−0.021 [−0.036, −0.007]
[−0.034, −0.003]
web
run
−0.009
−0.003 [−0.011, +0.005]
−0.008 [−0.012, −0.004]
[−0.015, +0.013]
task
−0.014
−0.008 [−0.015, −0.000]
−0.016 [−0.024, −0.009]
[−0.018, +0.007]
D
Transfer and the Misread Apparatus
D.1
The Full-History Swap, Per Corpus
We can build the degenerate regime and watch
the signal collapse. For each observed-dependency
corpus we replace the recovered dependency layer
with the full-history layer A0 on the same steps,
compute the same size-normalized features on both,
and score them under the probe of §4.1. The feature
formulas, the flat counts, the labels and the protocol
are held fixed. What the replacement varies is the
whole construction, so edge endpoints, density and
span move together with the attachment grade, and
the gap between the columns is the effect of that
construction rather than of the grade alone.
In the within-corpus block of Table 4 the inferred
features fail to improve on flat on five of six corpora
while the observed features lift the three size-weak
ones; the lone exception, SWE-Gym at 0.828, is
run size in disguise (the saturated shape features
are nonlinear functions of run length), and transfer
strips the disguise off.
In transfer the inferred
features invert where the observed features hold:
they follow run size into its two inversions (tau-
bench, SWE-Gym) and add a third, collapsing
to 0.287 on the web corpus where run size alone
transfers best at 0.766. Counted by held-out corpora
below chance, the inferred layer inverts on three
of six where run size inverts on two, transferring
worse than the size it encodes. The chain that reads
nothing (n0) clears chance on only 3 of the six
held-out corpora (Table A7). Within corpus the
two score alike on SWE-Gym (0.827 and 0.828),
and the reason is structural. Given the four counts,
the chain and the full-history layer each add one
direction, 1/𝑛: every chain feature is 1−1/𝑛or 1/𝑛,
and every full-history feature is 1−1/𝑛or (𝑛−1)/2.
The probe therefore sees one model class in both,
the counts plus 1/𝑛.
D.2
The Control Ladder in Full
Figure 3, in §4.2, gives the estimand 𝑑= aware −
n2 of Table 3 with its seed-block 95% interval, its
permutation 𝑝against the degree-matched null, and
the aware −n0 column that H2 was stated on. H1
predicted 𝑑> 0; the six-corpus mean is −0.0003,
and the best corpus, tau-bench, reaches 𝑑= +0.011
at 𝑝= 0.077, which becomes 𝑝= 0.090 at a raised
permutation budget and 0.54 under Holm across
six corpora (Figure 3). H2 predicted aware −n0 >
+0.02 on a majority; it clears that on two corpora of
six (+0.048 and +0.118), with a mean of +0.022.
A chain that reads nothing beats the recovered layer
on three corpora, SWE-Gym (0.827 against 0.804),
OpenHands (0.698 against 0.695) and tau2-bench
(0.715 against 0.706), while aware wins on the
other three. The permutation budget is 25 draws per
corpus, raised to 200 on tau-bench, the only corpus
whose interval lies above zero. At that budget tau-
bench gives 𝑑= +0.010 with 𝑝= 0.090, which
is 0.54 after Holm correction across six corpora.
Holm was stated in advance.
At 25 draws the
smallest attainable 𝑝is 1/26, above the first Holm
threshold of 0.05/6, so only the corpus run at 200
draws could have cleared Holm.
Two figures for tau-bench must not be conflated.
The +0.010 above is the full-population result. A
separately computed analysis on the 541 runs car-
rying both an observed and an inferred grade gives
𝑑= +0.000 at 𝑝= 0.423. A run carries both grades
here when it has at least one observed dependency
edge, since the full-history layer over the same steps
21


---

then adds inferred edges the recovered layer lacks;
the other 119 runs have none, the degree-matched
counterfeit reproduces their all-zero features, and
no inferred edge enters either analysis. These are
different populations at different permutation bud-
gets, and either may be reported with its own label.
Counterfeit constructions. aware is the recov-
ered assignment. n1 to n3 also hold the edge count
fixed, on every one of the 3,114 runs. n0 instead
attaches each step to its immediate predecessor,
reading no logged information at all, so it builds
𝑛−1 edges and carries 5.3 times the observed
count. n1 draws distinct pairs uniformly. n2 pre-
serves each step’s number of earlier sources exactly,
its in-degree under Appx. A’s orientation, while
its number of later consumers varies (one draw in
Figure 1C). n3 preserves that in-degree and fills by
recency.
D.3
Pairwise Versus Pooled Transfer
Pairwise transfer measures a pair. The naive
design trains on one corpus and tests on another,
across every ordered pair. Its result is weak: pair-
wise A-to-B transfer lands at or below chance for
most pairs. Two features of the design contribute
to that outcome. First, a single corpus is a thin
and idiosyncratic training set, so the fitted model
carries whatever is particular to that one corpus
into the test. Second, a pairwise score mixes the
question we care about, whether dependency struc-
ture carries across corpora, with one we do not,
whether two specific corpora resemble each other.
A weak pairwise number is therefore hard to read
as evidence about portability in general.
Pooled leave-one-corpus-out measures a mix-
ture. The pooled design trains on five corpora at
once and tests on the held-out sixth, rotating the
held-out corpus through all six. We use it because
the intended training setting holds several corpora
at once, and because five pooled corpora make a
thicker training set than any one of them. Pooling
does not force the model onto signal common to all
five. A feature that predicts failure in one training
corpus and is uninformative in the other four can
keep a positive pooled coefficient, so the other four
do not outvote it. Each score evaluates transfer
to a corpus held out of training. Five of the six
targets keep another corpus from the same broad
task family in the training pool, and web is the only
held-out family in this protocol. These scores there-
fore measure corpus-level portability rather than
leave-one-family-out transfer across tool use, cod-
ing, and web navigation. Which structure produces
that portability is left open by these scores.
D.4
Exploratory Pooled Transfer Panel
For each of the six target corpora, we train on the
pooled runs from the other five and evaluate ROC-
AUC on the held-out target, with failure labeled
1. Figure A3 and Table A4 use the same size and
dependency blocks, fixed learner configurations,
and corrected cache as Appx. C.5. All transforms,
including spline knots and scaling, are fitted on the
training pool. This panel uses the shared web cohort
of the primary analysis. Comparisons with earlier
results that used another web cohort would com-
bine cohort changes with the dependency producer
correction.
The saved computation repeats each fit for seeds
0 to 4. Training and test rows remain fixed, and
the seed enters only through the estimator factory.
The logistic and spline factories ignore it; this
GBT configuration produces identical predictions
across seeds on the fixed cache. All 36 cells have
exactly zero AUC spread and identical predictions
across the five repeats. Their average supplies no
variability estimate.
No interval is available in this panel for a paired
difference, either arm’s macro-average, the macro-
average difference, a minimum, the difference of
minima, a range ratio, or Kendall correlation. The
separate gating analysis computes marginal held-
out-run bootstrap intervals for individual logistic
arms on the same target runs.
Subtracting the
saved marginal interval endpoints cannot construct
a paired interval. The current summaries also do not
quantify uncertainty from training data or variation
across a population of corpora.
Logistic regression has three positive and three
negative target differences, with a macro-average
difference of +0.038. Its dependency-arm AUCs
are all above 0.5 as point estimates. The observed
ranges shrink from 0.407 to 0.143, a ratio of 2.85.
Ordering targets by the logistic size AUC places
their differences in reverse order, with all 15 target
pairs concordant with decreasing Δ and 𝜏= −1.000.
This ordering, range comparison, and earlier empha-
sis on minima followed inspection of the six targets.
Because Δ subtracts 𝑆, the plotted quantities are
mathematically coupled; no calibrated test of that
relationship is reported. Neither the ordering nor
the smaller range identifies a mechanism or predicts
performance on an unseen corpus.
We omit the difference between separately mini-
22


---

0.2
0.4
0.6
0.8
1.0
tau-bench
(DB)
SWE-agent
(coding)
SWE-Gym
(coding)
OpenHands
(coding)
tau2-bench
(DB)
web
(navigation)
macro-average
Logistic (the fixed probe)
chance
0.436
0.553
0.563
+0.117
0.624
0.691
0.646
+0.067
0.359
0.590
0.573
+0.230
0.699
0.696
0.594
−0.003
0.723
0.663
0.626
−0.059
0.766
0.643
0.663
−0.123
0.601
0.639
0.610
+0.038
Δ = D − S
0.2
0.4
0.6
0.8
1.0
Leave-one-corpus-out transfer ROC-AUC
tau-bench
SWE-agent
SWE-Gym
OpenHands
tau2-bench
web
macro-avg.
GBT
chance
0.553
0.605
0.537
+0.051
0.466
0.549
0.543
+0.083
0.341
0.344
0.343
+0.003
0.661
0.647
0.646
−0.014
0.573
0.601
0.445
+0.028
0.269
0.521
0.587
+0.252
0.477
0.544
0.517
+0.067
Δ = D − S
0.2
0.4
0.6
0.8
1.0
tau-bench
SWE-agent
SWE-Gym
OpenHands
tau2-bench
web
macro-avg.
Cubic spline
chance
0.517
0.581
0.479
+0.064
0.532
0.648
0.586
+0.116
0.281
0.307
0.298
+0.026
0.699
0.679
0.486
−0.020
0.503
0.364
0.476
−0.139
0.235
0.467
0.576
+0.232
0.461
0.508
0.484
+0.046
Δ = D − S
Learner sensitivity of leave-one-corpus-out transfer
S = run size, D = size plus dependency, dep = dependency-only block; seed-mean point estimates with no interval; below-chance region shaded
S
D
dep
Figure A3: Leave-one-corpus-out transfer ROC-AUC under three learners, on the shared splits and learner
configurations of Appx. C.5. 𝑆is size alone, 𝐷is size plus dependency, and dep is the size-normalized dependency
block alone, with no run-size counts, on the same pooled splits. 𝑆and 𝐷are joined by a gray connector, and the
smaller dep marker sits just below its corpus row. The logistic dep values are the dep column of Table A6. Every
marker is a seed-mean point estimate without an uncertainty interval; the shaded region is below chance, and a
marker there carries a brown ring. The macro-average row is the unweighted mean over the six targets, computed
before rounding, and the Δ column prints 𝐷−𝑆computed before rounding. The per-learner summaries (Δ > 0
counts, 𝑆and 𝐷below-chance counts, ranges and Kendall 𝜏) are in Table A4.
mized arms. For logistic, the size minimum occurs
on SWE-Gym and the augmented minimum on
tau-bench, so their difference describes no target’s
paired change.
Learner sensitivity changes both the signs and
the ordering. On web, the difference is −0.123
for logistic and +0.252 for GBT. On tau2-bench,
it is +0.028 for GBT and −0.139 for spline. The
number of dependency-arm point AUCs below 0.5
is zero for logistic, one for GBT, and three for spline.
The dependency-only block under the same
three learners. The dep markers of Figure A3 refit
the size-normalized dependency block alone, with
no run-size counts, on the same pooled splits and
with the same learner configurations. Under logistic
regression every target sits above chance, which is
the transfer sentence of the abstract. Under GBT
two targets fall below chance and under the cubic
spline four do, against one and three for size plus
dependency in the same figure. The dependency-
only arm is therefore the more learner-sensitive of
the two. Every marker in Figure A3 is a seed-mean
point estimate with no uncertainty interval.
D.5
Transfer Uncertainty
Table A6 attaches a confidence interval to every
leave-one-corpus-out transfer AUC. The pooled fit
is deterministic, so the uncertainty that matters is
sampling of the held-out corpus: we resample the
held-out runs with replacement (2000 draws) for
the 95% interval. We report the intervals and do not
attach a significance test to them, because six held-
out corpora screened one at a time is a description
of where the signal holds rather than a hypothesis
under test. This table and Table 4 are cut from a
single run of the gating experiment, so every point
AUC the two share is the same number. Every dep
and f+d transfer AUC sits above 0.5 with its whole
interval above the chance line; the two inverted
flat entries (tau-bench, SWE-Gym) sit below it.
Resampling held-out tasks rather than runs widens
the intervals on tau-bench and web, where tasks
repeat up to four times (Table A5): both tau-bench
intervals then include 0.5, and SWE-agent, with
23


---

Learner
Δ > 0
AUC < 0.5 (𝑆/𝐷)
Range 𝑆
Range 𝐷
Ratio
𝜏
Logistic
3/6
2/0
0.407
0.143
2.85
−1.000
GBT
5/6
3/1
0.392
0.303
1.29
−0.600
Spline
4/6
2/3
0.463
0.372
1.25
−0.200
Table A4: Per-learner summaries of the transfer panel in Figure A3. 𝑆is size alone, 𝐷is size plus dependency, and
Δ = 𝐷−𝑆within a target, computed before rounding. Range is maximum minus minimum across these six targets;
ratio is range(𝑆)/range(𝐷). 𝜏is Kendall correlation between 𝑆and Δ. Every entry is a point summary without an
uncertainty interval.
Table A5:
Task-level 95% intervals for the trans-
fer AUCs of Table A6, from 2000 paired draws
of held-out tasks that condition on the fitted mod-
els.
SWE-agent has too few task clusters for
this interval.
On the same draws the paired dif-
ferences from flat have intervals [+0.025, +0.219]
(dep) and
[+0.006, +0.223]
(f+d) on tau-bench,
[+0.150, +0.280] and [+0.172, +0.292] on SWE-Gym,
and [−0.145, −0.063] and [−0.007, +0.001] on Open-
Hands; on tau2-bench and web both lie below zero.
Held-out
flat
dep
f+d
tau-bench
[0.382, 0.495] [0.496, 0.626] [0.483, 0.620]
SWE-agent
—
—
—
SWE-Gym
[0.301, 0.417] [0.513, 0.631] [0.530, 0.647]
OpenHands [0.659, 0.740] [0.547, 0.639] [0.655, 0.738]
tau2-bench
[0.661, 0.779] [0.560, 0.694] [0.601, 0.726]
web
[0.717, 0.811] [0.607, 0.716] [0.585, 0.697]
5 of its 35 tasks holding a resolved run, has too
few task clusters for a task-level interval. The task
intervals use 2000 paired draws of held-out tasks
and condition on the fitted models.
D.6
The Control Ladder, Scored in Transfer
§4.2 scores the attachment ladder within corpus.
Table A7 scores the same four rules in the pooled
leave-one-corpus-out design of Appx. D.5. The
feature definitions and the attachment rules are
unchanged, and the evaluation is what differs. Each
null block replaces the dependency columns on the
training corpora and on the held-out corpus alike,
since the arm is the whole pipeline rather than a
perturbation of the test set. n1 and n2 draw 200
times here and we report the draw mean; n0 and
n3 are deterministic and drawn once. Two details
keep the two panels from being read as paired. This
run shares one generator across corpora for each
rule and draw, while the within-corpus ladder resets
inside each corpus, so the later corpora see different
draws. That ladder also used 25 draws for its six-
corpus mean rather than 200. Rerunning this panel
under the ladder’s reset convention moves the six-
corpus mean from +0.028 to +0.029 and changes
Table A6: Leave-one-corpus-out transfer AUC with
a held-out bootstrap 95% CI, for run size (flat), the
size-normalized dependency layer (dep), and flat plus
that layer (f+d). Italic marks a below-chance (inverted)
AUC. No significance test is attached; see Appx. D.5.
Held-out
Features
AUC
95% CI
tau-bench
flat
0.436
[0.392, 0.481]
dep
0.563
[0.520, 0.607]
f+d
0.553
[0.509, 0.596]
SWE-agent
flat
0.624
[0.559, 0.690]
dep
0.646
[0.574, 0.716]
f+d
0.691
[0.624, 0.757]
SWE-Gym
flat
0.359
[0.297, 0.420]
dep
0.573
[0.512, 0.633]
f+d
0.590
[0.532, 0.648]
OpenHands
flat
0.699
[0.655, 0.740]
dep
0.594
[0.548, 0.637]
f+d
0.696
[0.652, 0.738]
tau2-bench
flat
0.723
[0.662, 0.781]
dep
0.626
[0.561, 0.689]
f+d
0.663
[0.602, 0.725]
web
flat
0.766
[0.728, 0.806]
dep
0.663
[0.619, 0.708]
f+d
0.643
[0.598, 0.688]
no sign, no above-chance count and not the Holm
survivor. The contrast below is therefore between
two evaluation settings rather than an estimate of
what switching the convention does. Two gates
ran before any null was scored. The dependency
columns recomputed from the ladder’s own code are
bit-identical to this panel’s cached features on every
corpus, and all twelve saved flat and flat+dep
transfer cells reproduce exactly, including each of
the sixty per-seed values. The protocol behind this
panel was registered after the aware transfer values
existed and before either gate or any null arm ran.
Its primary rule counts the held-out corpora on
which an arm scores above chance (the last row
of Table A7). Outcomes written in advance treat
aware’s finding, above chance on every held-out
corpus, as surviving the control if n2 falls below
chance on some targets or has materially lower
24


---

AUC. They call for a narrower claim if n2 also
clears chance on every target at similar AUC, and
report a partial pattern as mixed. No materiality
threshold was set. The run’s report assigns the
observed pattern, n2 below chance on SWE-Gym
alone, to the survival outcome, so that verdict rests
on a single corpus.
Three things separate this from the within-corpus
ladder. Its estimand changes sign and size, from
−0.0003 within corpus to +0.028 here. The control
gives nominal separations on three corpora here and
on none within corpus, and only SWE-Gym clears
Holm in the 𝑝column. No draw reached aware on
SWE-Gym (𝑝= 0.005), and some draws reached
it on tau-bench and web (𝑝= 0.020). And n2 loses
the all-corpora-above-chance pattern that aware
keeps, failing on SWE-Gym at 0.481. Against that,
the counterfeit scores higher on two corpora, and
every arm that keeps each step’s number of earlier
sources reaches 5 of six on its own. A universal
advantage for the recovered attachment is therefore
false here. In the attachment-randomization screen,
the pipeline transfers better with the recovered end-
points on SWE-Gym after Holm correction and
nominally on tau-bench and web. The paired boot-
strap was registered after every entry of Table A7
existed, its 𝑝column and Holm survivor included.
Its protocol quotes some of those values and names
SWE-Gym as the corpus the attachment screen
selected.
The resampling unit, replicate count,
Holm family and outcome branches, including a
branch that would have retracted the SWE-Gym
result, were fixed before any bootstrap quantity
was computed. Resampling the held-out corpus
2000 times, clustered by task, gives paired 95%
intervals of [+0.086, +0.133] on SWE-Gym and
[+0.021, +0.036] on the six-corpus mean. One
resample is shared by aware and all 200 n2 blocks,
which is what makes the interval paired. These in-
tervals resample held-out tasks while conditioning
on the fitted models, the five training corpora and
the 200 realized n2 draws; they quantify evaluation-
unit sampling within these six corpora. Table A8
carries all six of them with the run-level panel
beside each. The same three corpora that sepa-
rate nominally in the attachment screen clear Holm
across the six paired task-bootstrap tests.
The
printed 95% intervals are pointwise. The paired
tests concern held-out task sampling, whereas the
𝑝column concerns attachment randomization, so
their Holm outcomes are not interchangeable. Re-
sampling runs instead, as Appx. D.5 does, changes
no decision.
D.7
Withholding a Whole Task Family
Appx. D.5 and Appx. D.6 hold out one corpus at a
time, and every target except web keeps a corpus
from its own broad task family in the training pool.
This subsection withholds the family. The three
families partition the six corpora, frozen before
any quantity of this panel existed: coding (SWE-
agent, SWE-Gym, OpenHands), database and tool
interaction (tau-bench, tau2-bench), and web (Agen-
tRewardBench). For a target corpus the training
pool is every corpus whose family differs from its
own. The three coding targets therefore train on
tau-bench, tau2-bench and web (1,538 runs); the
two database and tool targets train on SWE-agent,
SWE-Gym, OpenHands and web (2,176 runs); web
trains on the other five (2,514 runs). Everything
else is the pipeline of Appx. D.6: the same caches,
the same fixed logistic probe, the same 200 realized
degree-matched draws, and the same 2,000 paired
replicates with one index vector per replicate shared
by aware and all 200 n2 blocks.
Web is reused evidence, and carries † wher-
ever it appears. Its family holds one corpus, so
withholding that family removes nothing beyond the
target itself, and web’s pool is its leave-one-corpus-
out pool. Every web entry in Tables A9 and A10 is
the published leave-one-corpus-out value reprinted
for context, and a gate required that reproduction
and measured a maximum absolute difference of
0.0 over every web quantity. Web is therefore in no
Holm family, no survivor count and no summary,
and it replicates nothing here.
The two tests keep separate families, as they
do on the leave-one-corpus-out panel. The at-
tachment screen varies which earlier step each de-
pendency edge attaches to and conditions on the
realized evaluation sample; the paired bootstrap re-
samples the evaluation units and conditions on the
fits and the 200 realized draws. Here the screen’s
family S holds five members and leaves no survivor,
while the bootstrap’s families hold four members
at the task unit and five at the run unit and leave
SWE-Gym alone in each, in the negative direction.
The three sets of Holm outcomes answer different
questions and are never merged or reported under
one word.
Four of the five new targets carry a negative
contrast, and both prespecified equal-corpus sum-
maries are negative with intervals clear of zero
(-0.016, [−0.027, −0.004] at the task unit over four
25


---

Held-out
flat
aware
n0
n1
n2
n3
n2 draw range
aware −n2
𝑝
tau-bench
0.436
0.553
0.443
0.545
0.536
0.496
0.518–0.564
+0.017
0.020
SWE-agent
0.624
0.691
0.605
0.690
0.689
0.691
0.677–0.704
+0.002
0.348
SWE-Gym
0.359
0.590
0.342
0.416
0.481
0.531
0.431–0.529
+0.109
0.005
OpenHands
0.699
0.696
0.699
0.698
0.697
0.697
0.695–0.698
−0.002
0.995
tau2-bench
0.723
0.663
0.723
0.667
0.668
0.670
0.640–0.685
−0.005
0.791
web
0.766
0.643
0.287
0.534
0.594
0.645
0.538–0.656
+0.049
0.020
Above chance
4
6
3
5
5
5
mean +0.028
Table A7: The attachment ladder in transfer. Pooled leave-one-corpus-out AUC under each attachment rule,
with the same fixed logistic probe as Table A6. The flat and aware columns are that table’s flat and f+d entries.
Italic marks an entry below 0.5. 𝑝is the fraction of 200 degree-matched draws reaching or exceeding aware on
that corpus, by the ladder’s (1 + ge)/(1 + 𝐵) convention; it is one-sided, so a value near 1 means the counterfeit
scored higher. Under Holm across six corpora only SWE-Gym clears 0.05. The five seed calls return identical
AUCs, so the seed-block half-width is zero on every cell. The n2 draw range is the minimum and maximum over the
200 draws; it describes attachment randomization on fixed runs. This panel carries no sampling interval for the
individual arms, and the bootstrap intervals of Table A6 cannot be borrowed for a paired contrast. Appx. D.6 gives a
paired interval for the aware −n2 column.
Held-out
aware −n2
Task 95% CI
Run 95% CI
𝑝(task)
Holm (task)
tau-bench
+0.017
[+0.005, +0.028]
[+0.007, +0.027]
0.006
survives
SWE-agent
+0.002
[−0.012, +0.015]
[−0.011, +0.016]
0.730
no
SWE-Gym
+0.109
[+0.086, +0.133]
[+0.085, +0.134]
0.001
survives
OpenHands
−0.002
[−0.005, +0.002]
[−0.005, +0.002]
0.337
no
tau2-bench
−0.005
[−0.019, +0.010]
[−0.018, +0.010]
0.510
no
web
+0.049
[+0.019, +0.080]
[+0.024, +0.073]
0.002
survives
Six-corpus mean
+0.028
[+0.021, +0.036]
[+0.022, +0.035]
0.001
not corrected
Table A8: The paired held-out interval on the aware −n2 column of Table A7. Percentile 95% intervals
from 2000 bootstrap replicates of the held-out corpus. One resample is shared by aware and all 200 n2 draws,
which is what pairs the two arms. The task panel is primary and clusters by task; the run panel resamples runs,
matching Table A6. 𝑝is the two-sided bootstrap tail of the task panel under the plus-one convention. Holm runs at
family-wise 0.05 across these six per-corpus tests, and the run panel returns the same three survivors. That family
covers sampling of evaluation units, with the fitted models and the 200 realized draws held fixed. It is therefore
separate from the attachment-randomization screen of Table A7, whose 𝑝column leaves SWE-Gym alone. The
six-corpus mean is one prespecified summary and takes no correction. SWE-Gym and tau2-bench hold one run per
task, so the two units coincide there and the small endpoint differences come from the two independent random
streams. Six replicates on SWE-agent drew a single label class and were recorded as dropped rather than redrawn.
The joint mean keeps the 1,994 replicates in which all six corpora carry both classes.
corpora; -0.013, [−0.021, −0.006] at the run unit
over five). SWE-Gym carried the leave-one-corpus-
out finding and loses the most. A gate reproduced
its leave-one-corpus-out aware AUC at 0.590 on
these same evaluation rows, and the family-withheld
pool puts it at 0.343, a move of −0.247 that lands
below chance. flat falls on the two database and
tool targets as well, which says the shrunken mix-
ture carries less of everything; it is a diagnostic and
carries no test here.
The protocol was written before any result
existed, and a second implementation re-derived
the panel. The registration fixed the families, the
six splits, the two tests, the Holm memberships, the
primary unit, the two summaries and the structural
floors while no AUC, draw, replicate or interval
of this panel had been computed, and it recorded
that boundary. The re-derivation reads the same
pinned caches under its own code: it matched all 11
input hashes, regenerated the 200 degree-matched
blocks and reproduced the leave-one-corpus-out
cells exactly, and agreed on every survivor list. Over
222 compared quantities its maximum absolute
discrepancy is 6.5 × 10−16, which is floating-point
noise.
What three families cannot settle. One family
holds a single corpus and another holds two sibling
releases of one benchmark, so this panel bounds
how far the leave-one-corpus-out reading travels
without settling how the representation behaves
across task domains in general, in either direction.
Family withholding also shrinks the training pool
26


---

Family-withheld transfer AUC
Attachment screen (family S, 𝑚= 5)
Held-out
Runs
flat
aware
n2 mean
n2 range
aware −n2
≥aware
𝑝
Holm
coding withheld; pool tau-bench, tau2-bench, web (1,538 runs)
SWE-agent‡
600
0.624
0.633
0.636
0.629–0.644
−0.003
162/200
0.811
1.000, no
SWE-Gym
376
0.339
0.343
0.379
0.343–0.423
−0.036
199/200
0.995
1.000, no
OpenHands
600
0.699
0.698
0.699
0.697–0.700
−0.001
166/200
0.831
1.000, no
database and tool withheld; pool SWE-agent, SWE-Gym, OpenHands, web (2,176 runs)
tau-bench
660
0.423
0.518
0.516
0.503–0.534
+0.002
66/200
0.333
1.000, no
tau2-bench
278
0.291
0.548
0.577
0.542–0.601
−0.029
198/200
0.990
1.000, no
web withheld; pool the other five corpora (2,514 runs), unchanged from leave-one-corpus-out
web†
600
0.766
0.643
0.594
0.538–0.656
+0.049
3/200
0.020
excluded
Table A9: The family-withheld transfer panel and its attachment screen. Pooled AUC under a training pool
holding no corpus from the target’s own frozen family, with the features, probe and 200 realized draws of Table A7.
Italic marks an entry below 0.5. n2 range is the minimum and maximum over the 200 draws, and ≥aware counts the
draws reaching or exceeding it. The screen’s 𝑝is that count under the (1 + ge)/(1 + 𝐵) convention; it is one-sided, so
a value near 1 means the counterfeit scored higher. Holm runs at family-wise 0.05 over the attachment screen’s own
family S, whose five members are the targets whose pool changed, and it leaves no survivor; no new target reaches
0.05 before correction either. † reused evidence: web’s pool is unchanged from the leave-one-corpus-out panel, so
this row reprints published values and is not an independent replication. ‡ SWE-agent’s task-unit result was flagged
uninterpretable at registration; it stays in this screen, whose unit is the attachment draw rather than the task cluster.
and changes its relatedness to the target at the same
time: the coding targets lose 976 to 1,200 runs
and the database and tool targets lose 278 and 660,
and no control here separates size from related-
ness. A null is consistent with the representation
failing to travel across families, with a three-corpus
pool being too small to fit the probe, or with both.
The leave-one-corpus-out result of Appx. D.6 was
measured under a different training pool and is not
re-measured here.
D.8
Four Ways a Generic Representation
Misreads
The degenerate regime turns into four concrete dif-
ficulties when a permutation-invariant graph model
meets the two-layer graph. Each is tied to a mea-
surement already in hand.
1. Size- and permutation-blind pooling keys on
run size.
A standard sum or mean readout
over the degenerate layer recovers a function
of 𝑛, because at step 𝑖the full-history degrees
are 𝑖−1 toward earlier steps and 𝑛−𝑖toward
later ones, and both are fixed by 𝑛. Run size
is the signal §4.3 shows is not corpus-invariant:
pooled flat features fall below chance on two
held-out corpora, as low as 0.36 on SWE-Gym.
A pooled readout therefore locks onto a feature
that can invert across corpora.
2. No channel for the source label. The graph
carries observed execution edges, declared de-
pendency edges, and inferred dependency edges,
but a generic message-passing layer sees one ad-
jacency and cannot condition on the attachment
grade 𝜎. It cannot down-weight an inferred edge
relative to a declared one, so the size-collinear
inferred layer (|𝑟| up to 0.99 when the evaluation
corpora are given full-history edges, and 1.00 on
the Who&When runs of Figure 5) is propagated
as if it were observed signal. Generic message
passing has no inductive bias for this, because
the bias that would help, treating declared and
inferred adjacency as different relations, is not
one it carries by default.
3. Transfer performance requires separate eval-
uation. In the regenerated five-seed GIN results,
pooled transfer AUC is lower than the lean graph
features on every held-out corpus (Figure A4).
These model comparisons also change architec-
ture and representation, so they do not isolate
capacity as the cause of poorer transfer.
4. A joint embedding states the marginal lift
only under a nested ablation, and the lift it
then reports varies by corpus and model. A
single embedding of the whole graph returns one
score. The lift therefore has to be recovered by
fitting the same architecture twice on identical
splits, once on the execution layer alone and
once with the dependency layer added. We ran
that nested ablation, so this is a measurement
rather than an impossibility. All twelve cells
27


---

Task unit, primary (family B-task, 𝑚= 4) Run unit, secondary (family B-run, 𝑚= 5)
Held-out
aware −n2
95% CI
𝑝Holm
95% CI
𝑝Holm
tau-bench
+0.002 [−0.030, +0.035] 0.917 1.000, no
[−0.023, +0.026] 0.909 1.000, no
SWE-agent‡
−0.003 [−0.011, +0.004] 0.521 excluded
[−0.006, +0.001] 0.164 0.492, no
SWE-Gym
−0.036 [−0.048, −0.025] 0.001 0.004 survives
[−0.048, −0.025] 0.001 0.005 survives
OpenHands
−0.001 [−0.003, +0.001] 0.556 1.000, no
[−0.003, +0.001] 0.558 1.000, no
tau2-bench
−0.029 [−0.056, −0.001] 0.045 0.135, no
[−0.057, −0.003] 0.029 0.116, no
web†
+0.049 [+0.019, +0.080] 0.002 excluded
[+0.024, +0.073] 0.001 excluded
S1 mean
−0.016 [−0.027, −0.004] 0.005 not corrected
S2 mean
−0.013
[−0.021, −0.006] 0.001 not corrected
Table A10: The paired held-out bootstrap on the family-withheld panel. Percentile 95% intervals from 2,000
resamples of the held-out corpus, with one index vector per replicate shared by aware and all 200 n2 draws, which
is what pairs the arms. 𝑝is the two-sided bootstrap tail under the plus-one convention. The two units carry separate
Holm families, B-task over four targets and B-run over five, and each leaves SWE-Gym alone and in the negative
direction. Both families cover sampling of the evaluation units with the fits and the 200 realized draws held fixed,
so their outcomes are not interchangeable with the attachment screen’s family S in Table A9. † reused evidence,
excluded from every family and summary. ‡ SWE-agent’s task-unit row was flagged uninterpretable at registration,
because 5 of its 35 task clusters carry the minority class against a preregistered floor of 10; the row is printed and
is not evidence, and it is why B-task holds four members while B-run holds five. Six of SWE-agent’s 2,000 task
replicates drew a single label class and were recorded as dropped; every other cell retains all 2,000. S1 and S2
are the two summaries declared before the run, both web-excluded, both secondary and uncorrected: S1 averages
aware −n2 over the four members of B-task at the task unit and S2 over the five members of B-run at the run unit,
each from a joint resample.
come from one sweep: one device, five seeds,
the shared cohort. On tau-bench the relation-
aware R-GCN gains +0.031 ± 0.010 from the
real dependency layer against −0.015 ± 0.019
from a count-matched rewiring of it, a paired
gap of +0.047. Over the six corpora the mean
lift is +0.015 for R-GCN and −0.008 for the
edge-type-blind GIN, and neither pattern is uni-
form: the GIN gains +0.018 ± 0.003 on the web
corpus and loses −0.067±0.009 on OpenHands,
while R-GCN loses on tau2-bench.
Against
the rewiring control the result is cleaner, the
real layer beating it in eleven of twelve cells.
Edge-type blindness therefore does not by itself
stop a model from responding to dependency
endpoints. What a monolithic fit forfeits is read-
ing the decomposition off one score, not the
estimand.
The first three are readings of one blind spot: the
attachment grade is invisible to a model built for
graphs whose edges all mean the same thing. The
fourth is a constraint on how a joint model has to
be fitted if it is to price the layer at all.
D.9
Graph Networks, Per Corpus
We make the cost concrete with three off-the-shelf
networks under the same five-seed, five-fold proto-
col: the edge-type-blind GIN (Xu et al., 2019), and
two relation-aware models that read the edge type,
R-GCN (Schlichtkrull et al., 2018) and HGT (Hu
et al., 2020).
The lean graph features are the
flat+dep set of §4.3 under the logistic probe: the
four counts and the size-normalized dependency
block. Within corpus all three match the lean graph
features (mean AUC 0.70 to 0.71 against 0.72).
In pooled transfer the ranking inverts (Figure A4).
The lean graph features hold a 0.639 mean and
never fall below 0.553. The GIN trails on all six
corpora, and the two relation-aware models drop
below chance on held-out corpora. HGT is the
one partial exception, clearing the features on two
corpora while losing the mean by more than a tenth.
All three are also unstable, the GIN swinging up to
±0.12 across seeds (Figure A4(b)).
Settings. Each network has two message-passing
layers of width 64 (HGT with four heads) over
8-dimensional node features: a node-type indica-
tor, a read, write or neither access tag, and the
step’s normalized position. Edges carry no features.
The graphs hold no resource nodes, so the popu-
lated relations are emit, handoff and dependency
edges; GIN merges them into one edge set, and
R-GCN and HGT keep them typed. The graph
vector concatenates the global_mean_pool and
global_max_pool outputs of PyTorch Geometric
and feeds a two-layer head with dropout 0.3. Train-
ing runs 40 epochs of Adam (learning rate 10−3,
28


---

weight decay 10−4, batch 32) without hyperparam-
eter tuning or early stopping, weighting the failure
class by (1 −𝑝)/𝑝for training failure rate 𝑝. Seeds
0 to 4 set both the initial weights and the batch order.
Within corpus each seed runs five stratified folds;
in transfer each seed trains once on the pooled other
five corpora. HGT’s five transfer AUCs on the web
corpus span 0.2339 to 0.2347, so its seed interval
has half-width 0.0004 and prints as ±0.000 at three
decimals.
A message-passing network is fooled the same
way. The edge-type-blind GIN, rerun on the in-
ferred graphs over five seeds, falls below chance on
the web corpus (0.244 ± 0.007) and on SWE-Gym
(0.351 ± 0.095), fooled by the saturated layer as
the linear probe is. Only the web corpus separates
the two constructions: there the observed graph
stays above chance at 0.567±0.146, while on SWE-
Gym the observed graph is below chance too, at
0.469 ± 0.120. These observed-graph scores come
from the rerun paired with the inferred graphs, a
separate run from the sweep in Figure A4, so they
differ slightly from that figure’s GIN row.
The graph-network control sits at n1’s rung.
On tau-bench, aware beats n1 by +0.051 in the lad-
der of §4.2. A relation-aware graph network sepa-
rates the real layer from a count-preserving rewiring
of it by +0.047 on the same corpus (Appx. D.8).
n1 and the network’s rewiring agree in direction,
and they agree as two count-preserving controls
sampled differently rather than as one intervention
measured twice: each holds only the per-graph edge
count and neither holds per-step source degree, so
the network control sits at n1’s rung. Neither reads
the degree-matched contrast.
Figure A4 gives the per-corpus graph-network
scores behind the summary in §5.
D.10
Observed Dependency Span
The saturation ratio 𝜌(§5.1) measures how many
prior steps a layer attaches, not how far back they sit.
To separate the two, for each observed dependency
edge 𝑢→𝑣, where 𝑢is the earlier source and 𝑣the
later step that uses it, we measure span 𝑠(𝑢, 𝑣) =
idx(𝑣) −idx(𝑢) and report per corpus the median
per-run span, the median per-run maximum span,
the median normalized by 𝑛−1, and the share of
edges with 𝑠≥10 (Table A11, six corpora, run
under a fixed interpreter seed for reproducibility).
The picture splits by edge type. The coding and
web corpora are local at the median, with same-file
or same-resource predecessor edges at span two
to four, though OpenHands carries a delayed tail
(median run maximum span 40). tau-bench is not
local: its writes attach to prior database reads in
the same run, so the median span is 14.5 and 76%
of edges span at least ten steps. All sit far below
the ceiling, from 𝜌= 0.001 to 𝜌= 0.018, so span
is a distinct axis from saturation. This is an access-
derived span over recovered edges, not a gold causal
reach: in tau-bench a write links to its conservative
prior reads, and in the file corpora an edge links
consecutive accesses to the same resource, so the
number reports how local or delayed the recovered
edges are, not a proven long-range reliance.
E
Localization Detail
Over position baselines the execution layer im-
proves top-3 and MRR localization but not top-1,
an ancillary result on one corpus. Where the de-
pendency layer predicts which runs fail, the free
layer ranks where the fault lies. On Who&When,
a multi-agent failure-attribution benchmark with
step-level fault labels (Zhang et al., 2025a), one
score learned over eight execution-layer features
ranks the 126 failed runs’ steps. Faults cluster (57%
in the first third, 54% at the most-active agent), so
the comparison that matters is against an early-fault
position prior rather than the random floor. The
gain over that prior excludes zero on all three met-
rics under a seed-block interval over five splits of
the same runs. Resampling the 126 runs instead
leaves top-3 and MRR clear of zero and puts top-1
at [−0.002, +0.108], so the top-1 gain is the one
that does not survive a run-level interval. No abla-
tion separates which of the eight features carries the
lift, and a cubic spline on position alone beats this
model on top-1, so the prior we measure against is
a stated linear baseline.
E.1
Why the Dependency Layer Is
Position-Equivalent Here
The dependency layer does not help on Who&When,
and the reason is exact rather than incidental.
Who&When records no per-step read or write, so
its dependency layer is inferred at the weakest at-
tachment grade: the full-history assumption that
each step depended on every earlier step. Under
that assumption every dependency-structural fea-
ture of a step is a deterministic function of the step’s
index and the run’s length. For a step with zero-
based index 𝑖in an 𝑛-step run, the number of earlier
sources is 𝑖and the number of later consumers is
29


---

0.5
0.6
0.7
0.8
0.9
ROC-AUC
tau-bench
(DB)
SWE-agent
(coding)
SWE-Gym
(coding)
OpenHands
(coding)
tau2-bench
(DB)
web
(navigation)
mean
(a) Within corpus
chance
0.607
0.665
0.658
0.620
0.627
0.713
0.642
0.628
0.838
0.804
0.852
0.805
0.631
0.695
0.650
0.697
0.693
0.706
0.698
0.685
0.784
0.756
0.778
0.773
0.697
0.723
0.713
0.701
0.2
0.3
0.4
0.5
0.6
0.7
0.8
0.9
ROC-AUC
(b) Transfer (held-out corpus)
chance
ring: below chance
0.524 ± 0.018
0.553
0.487 ± 0.022
0.597 ± 0.070
0.602 ± 0.036
0.691
0.563 ± 0.029
0.649 ± 0.006
0.453 ± 0.122
0.590
0.337 ± 0.014
0.333 ± 0.004
0.680 ± 0.018
0.696
0.490 ± 0.041
0.688 ± 0.012
0.583 ± 0.063
0.663
0.595 ± 0.017
0.669 ± 0.013
0.578 ± 0.083
0.643
0.568 ± 0.090
0.234 ± 0.000
0.570
0.639
0.507
0.528
Graph networks match the features within corpus and fall behind in transfer
ROC-AUC, five-seed means; transfer bars are seed-block 95% intervals for the three graph networks; the features are a deterministic fit
lean graph features
GIN
R-GCN
HGT
Figure A4: The lean graph features against three off-the-shelf graph networks on the full two-layer graph: the
edge-type-blind GIN (Xu et al., 2019), and the relation-aware R-GCN (Schlichtkrull et al., 2018) and HGT (Hu et al.,
2020), which read the edge type. Scores are within corpus and in pooled leave-one-corpus-out transfer (ROC-AUC,
label 1 a failed run, chance 0.5, mean over five seeds). Within corpus the graph networks are competitive with the
features (mean 0.70 to 0.71 against 0.72); in transfer they diverge. The features hold a 0.639 mean and a 0.553
worst case, while every graph network is lower on the mean and the two relation-aware models drop below chance
on held-out corpora (R-GCN to 0.337, HGT to 0.234), and the GIN dips below chance once, on SWE-Gym. At the
untuned settings of Appx. D.9, reading the edge type buys within-corpus fit without improving transfer to held-out
corpora. All eight series come from saved artifacts: the features from the gating run, the graph networks from a
single five-seed sweep of all 36 cells. Transfer bars are five-seed 95% intervals (seed-block 𝑡, df = 4) on the pooled
leave-one-corpus-out transfer AUC of the three graph networks. The off-the-shelf models score lower and swing
across seeds. The GIN’s transfer moves by up to ±0.12, and R-GCN and HGT each cross below chance on held-out
corpora. These intervals vary the training seed on a fixed target. The lean graph feature intervals of Table A6
resample held-out runs for a deterministic fit. The two widths therefore answer different questions, and comparing
them does not establish a stability advantage.
𝑛−1 −𝑖, and that earlier-source count normalized
by 𝑛−1 is the position itself, on all 1,099 steps of
the corpus; a linear ranker on that earlier-source
count reproduces the position prior exactly in all
five seeds. The layer is order in another notation,
an instance of the degenerate regime in which a
named assumption collapses the dependency layer
onto run order. That bounds what the layer encodes
rather than what any ranker reading it could score:
a cubic spline on position alone beats the linear
prior on two of the three metrics, and beats the
eight-feature execution model itself on top-1 in four
seeds of five and ties it in the fifth, so the prior is
a stated baseline and the lift is measured against
that baseline rather than against the best reader of
position. The attachment model anticipates the col-
lapse. What a layer can do is decided by the grade
of its edges, not only by their presence: inferred
at full history, the dependency layer adds nothing
to run order; observed, as in the coding corpora, it
would not be position-bound. The lift we measure
is therefore an execution-layer gain over that stated
prior.
E.2
The Limits of the Localization Result
Position-equivalence bounds what the dependency
layer carries on this corpus, and the localization
result reports what the execution layer carries in
the same place. The execution layer is the free,
observed base: it defines the nodes and the run
order. A reader could grant all of that and still
doubt that it carries failure information of its own.
Localization speaks to that doubt. On a corpus
where the dependency layer is degenerate, a score
30


---

Table A11: Observed dependency span per corpus (per-run summaries over edgeful runs). Coding and web edges
are local at the median; tau-bench read-to-write edges reach further. All sit between 𝜌= 0.001 and 𝜌= 0.018, so
span is distinct from saturation. The span is access-derived over recovered edges, not gold reliance.
Corpus
med span
med/𝑛
med max
share 𝑠≥10
tau-bench
14.5
0.47
22
0.76
SWE-agent
2.0
0.07
4
0.10
SWE-Gym
2.0
0.09
4
0.04
OpenHands
4.0
0.03
40
0.37
tau2-bench
3.5
0.18
6
0.08
AgentRewardBench
2.0
0.09
2
0.02
Table A12:
Step-level fault localization on the
Who&When multi-agent failure-attribution corpus (the
126 labeled-failed runs of its algorithm-generated sub-
set, per-run mean over five seeds). Each model ranks a
failed run’s steps so the labeled fault lands near the top.
Execution-graph structure beats the early-fault position
prior, and both beat the random floor; the structure-over-
position gain has a seed-block 95% interval excluding
zero on all three metrics, over five splits of the same
runs; a 20,000-resample run-level bootstrap keeps top-3
and MRR clear of zero and spans zero on top-1. The
inferred dependency layer is a relabelling of run order
on this corpus (see text), so the lift is carried by the
execution layer.
Ranking model
top-1
top-3
MRR
Random (chance floor)
0.119
0.346
0.324
Position prior
0.159
0.516
0.407
Execution structure
0.211
0.614
0.454
over eight execution-layer features puts the labeled
faulting step above the position prior. The top-
3 and MRR gains stay clear of zero under both
the seed-block interval and the run-level bootstrap.
Measured against that stated linear prior, those
gains are evidence that the execution layer carries
signal of its own. They do not say which kind of
failure produced them, since no experiment here
sorts runs into coordination and reliance categories
(Appx. B). So the base layer has a job of its own,
and localization is it.
Three limits bound the claim. The result lives
within a single corpus, so it is a faithfulness re-
sult for the execution layer, not a transfer result;
localization is reported run by run, with no cross-
corpus generalization claimed for it. It is also a
layer-faithfulness ablation rather than an entry on
the Who&When leaderboard: the trace-reading
LLM attribution baselines in that benchmark diag-
nose from the full transcript, while this test asks
only whether execution topology adds signal beyond
time, so the two numbers answer different questions.
The mirror experiment for the dependency layer has
not been evaluated here. It requires step-level error
annotations aligned with observed access events.
CodeTraceBench (Li et al., 2026a) provides access-
bearing coding traces and step annotations, making
it a candidate subject to recovery and annotation-
alignment checks. Such a test would assess the
dependency layer’s localization value directly.
F
An Exploratory Probe of Declared
Workflow Graphs
FLORA-Bench (Zhang et al., 2025b) supplies work-
flow graphs over agents, together with a binary
pass/fail label per workflow-task pair, for workflows
emitted by a planner (the G-Designer subset) or by a
program (the AFLOW subset). We use these graphs
as workflow-level examples of explicit dependency
specifications. Their connections describe supplied
workflow flow; they do not establish which earlier
result a particular execution step consumed, and
74 of the 1051 AFLOW HumanEval graphs are
cyclic, so no edge-wise ordering 𝑡(𝑢) < 𝑡(𝑣) holds
across the corpus. This probe therefore evaluates
workflow summaries at agent granularity, while
validation of declared event-level reliance remains
open.
Every group here carries the same declared desig-
nation, and the probe neither varies the attachment
grade nor supplies it to a learner. The AFLOW and
G-Designer subsets differ in emitter, workflow dis-
tribution and task sampling at once, so a difference
between them identifies none of those factors on its
own.
We retain up to 4000 rows per group from the
first 120000 rows of the train stream after buffer
shuffling with seed 0 and buffer size 20000. The
eight retained groups hold 28006 rows in total.
Failure is the complement of the shipped success
label. Node count is the number of defined entries
in the supplied workflow node dictionary, including
31


---

isolated nodes and excluding null fields introduced
by struct materialization. Node counts vary within
groups, so the baseline uses both the node count 𝑛
and the count 𝑚of distinct non-self directed edges.
Pair-normalized edge count. The median of
the eight group medians of 𝑚/ 𝑛
2
 is 0.568 (range
0.361 to 0.700). We report this as a descriptive pair-
normalized edge count for the supplied workflow
graphs. These values do not support a comparison
with the observed layer, whose per-corpus medians
run 0.001 to 0.018 (Figure 5), and this statistic
establishes neither independence from size nor
predictive utility. For cyclic workflow graphs  𝑛
2

is a numerical reference rather than a full-history
ceiling: a three-node directed cycle reaches 𝜌= 1
without being full history.
Two of eight intervals exclude zero. In the sam-
pled FLORA-Bench data, adding four normalized
workflow-graph summaries to a logistic baseline
on defined node and edge counts increases mean
ROC-AUC by +0.095 on AFLOW HumanEval
and +0.070 on AFLOW mmlu under repeated
within-group row-level cross-validation; these are
the only two of eight groups whose approximate
paired corrected-CV 95% intervals exclude zero
(Table A13). The intervals for the other six groups
include zero. These exploratory comparisons show
predictive gains for the specified workflow sum-
maries in two AFLOW groups. They do not identify
an effect of attachment grade, establish a template
mechanism, or establish absence of useful graph
information in the remaining groups. A declared
designation alone does not establish predictive util-
ity; the measured increment is specific to the graph
summaries, the learner, the baseline and the evalua-
tion population.
The approximate paired intervals describe the
corrected repeated-CV comparison. They are ex-
ploratory, they do not adjust for repeated tasks or
workflows or for selection across the eight groups,
and they do not establish equivalence when they in-
clude zero. Adding 𝑚/𝑛to the count baseline leaves
increments of +0.094 on AFLOW HumanEval and
+0.066 on AFLOW mmlu; those comparisons ad-
dress that additional count transformation, without
establishing independence from all size-based pre-
dictors.
The implemented depth feature is the longest di-
rected path length for acyclic graphs and a zero sen-
tinel for the cyclic ones. Retaining that convention,
the HumanEval increment is +0.095; excluding
the 74 cyclic rows and refitting gives 0.575 against
0.644, an increment of +0.069. That sensitivity
analysis uses a different population and is reported
separately, not as the headline value.
What this probe does and does not settle. It
reports a reproducible workflow-level comparison
on a public corpus, including its small and negative
increments. It does not instantiate the event-level
recovery map of §2, because its graphs relate agents
rather than time-ordered events and some of them
are cyclic. Empirical coverage of declared event-
level reliance therefore remains open, and a tool-
call-level declared corpus with step labels stays the
cleaner target Appx. G names.
G
Instrumentation and Open Directions
Instrumentation is the lever the rest of this agenda
turns on. Logging each step’s reads and writes
supplies the access events a raw trace omits, which
is what carries an edge from inferred to declared.
The workflow-level probe of Appx. F does not eval-
uate such instrumentation, and it does not establish
a predictive gain from changing the grade. The
same logs would build the tool-call-level declared
corpus that localizing a reliance fault needs, one
carrying logged dependencies and step-level fault
labels together, which no benchmark supplies to-
day. Whether the marginal lift holds under genuine
long-range reliance is untested, and richer web and
embodied settings are where the two-layer graph
should be exercised next.
Our first span audit
(Appx. D.10) finds observed edges local in the
coding corpora and longer where writes attach to
earlier reads, at the same low 𝜌. Pruning off-path
reliance, repairing a run while it still runs, and
fleet-scale structural anomaly detection (Xu et al.,
2025) sit outside what this paper demonstrates.
Our unsupervised attempts at the last are weak
and detector-inconsistent, and a static dead-step
scan tracks graph density rather than wasted work.
For the graph networks of Appx. D.9, a readout
that uses the attachment grade is one design worth
evaluating.
H
Limitations in Detail
The transfer result holds under the fixed logistic
probe. This pattern is descriptive, with no regis-
tered hypothesis, and the exploratory refit under
a cubic spline and a gradient-boosted model has
no uncertainty interval (Appx. D.5, Appx. D.4).
The registered primary rule of the transfer ladder
concerns another arm, size plus dependency against
32


---

Table A13: Exploratory failure prediction from supplied FLORA-Bench (Zhang et al., 2025b) workflow graphs,
by task domain and emitter. Size is a standardized logistic model on the number of defined nodes 𝑛and distinct
non-self directed edges 𝑚; + shape adds 𝑚/𝑛, normalized depth, and normalized maximum in- and out-degree.
ROC-AUCs average five stratified folds at each of five shuffle seeds within each group. The failure rate and the
median pair-normalized edge count 𝜌= 𝑚/ 𝑛
2
 describe the retained rows. Lifts are differences of unrounded mean
AUCs. The paired intervals are approximate corrected repeated-CV diagnostics (Nadeau and Bengio, 2003), without
task or workflow cluster adjustment and without adjustment for selection across the eight groups.
Domain
Emitter
Fail%
𝜌
Size
+ shape
Lift
Paired 95% interval
mbpp
AFLOW
29
0.600
0.739
0.742
+0.003
[−0.007, +0.013]
humaneval
AFLOW
56
0.361
0.567
0.662
+0.095
[+0.050, +0.140]
mmlu
AFLOW
53
0.400
0.621
0.691
+0.070
[+0.055, +0.086]
gsm8k
AFLOW
34
0.700
0.611
0.620
+0.010
[−0.002, +0.021]
MATH
G-Designer
52
0.536
0.522
0.524
+0.002
[−0.014, +0.018]
humaneval
G-Designer
37
0.536
0.495
0.494
−0.001
[−0.020, +0.018]
mbpp
G-Designer
52
0.600
0.497
0.492
−0.005
[−0.019, +0.008]
mmlu
G-Designer
38
0.600
0.510
0.513
+0.004
[−0.011, +0.018]
its degree-matched control. Refit under the same
two learners, the dependency-only block falls below
chance on two of the six held-out corpora under
the gradient-boosted model and on four under the
cubic spline, against one and three for size plus
dependency. The arm the abstract reports is there-
fore the more learner-sensitive of the two, and the
headline holds for the fixed logistic probe rather
than for the feature block in general. No transfer
control rescales the raw size counts per corpus or
builds the dependency-only block from a counter-
feit layer, so part of the transfer contrast may reflect
feature scaling rather than recovered dependencies.
Two separate checks, never combined, bound
the within-corpus lift, and one corpus carries it
through both. Of the three corpora with a positive
lift, tau-bench keeps it clear of zero under a spline, a
boosted tree, and task-grouped folds, though resam-
pling tasks leaves its sign unresolved (Appx. C.5,
Appx. C.7). SWE-agent loses it under task grouping.
SWE-Gym keeps it under a boosted tree, reverses
sign under a spline, and holds one run per task,
which leaves sensitivity to repeated-task leakage
untestable there rather than passed. Under flexible
learners the increments are not separated from read
and write composition either: against an execution-
side baseline with run-level folds, each logistic
increment shrinks yet stays positive in every seed,
while each spline and boosted-tree point estimate is
negative (Appx. C.5). The corpus cards show that
the tau-bench, SWE-agent and web corpora mix
generating models, and no analysis here separates
an increment from model identity. The prereg-
istered control did not separate the recovered
attachment from a degree-matched counterfeit
within corpus; in transfer, only SWE-Gym clears
Holm in the attachment-randomization screen.
Two of the four features cannot move under that
control (§4.2). That screen gives nominal separa-
tions on three of the six held-out corpora, and the
counterfeit scores higher on two. The paired task-
bootstrap contrasts clear Holm on all three of those
positive corpora within their separate six-corpus
family (Appx. D.6). With run-size covariates and
each step’s earlier-source count held fixed, that
contrast measures sensitivity to replacing depen-
dency endpoints; it does not apportion absolute
AUC between run size and dependency features
(§4.3). Neither result shows that the attachment
grade is inert, and neither licenses a claim beyond
the evaluated extraction, feature probe, corpora and
control (§4.2).
Whole-family withholding yields no positive
separation on any new target. The attachment
screen has no Holm survivor among five new targets.
The paired task bootstrap has one among four eligi-
ble targets: SWE-Gym, negative at −0.036. These
three frozen task families support no general claim
across domains (Appx. D.7). Coverage leans on
coding and database tasks. Five of the six corpora
are coding or database runs; the web family holds
one. Horizon is short and long-range reliance is
untested. The characterized runs are small at the
median, about 10, 30, and 34 steps on Who&When,
tau-bench, and SWE-agent, and the observed re-
liance available today is mostly local (Appx. D.10).
Under long-range reliance, run size may become a
stronger baseline (Appx. G). The observed grade
is a principled heuristic. Its attachment rules are
in §4.1; ground-truth reliance labels do not exist at
scale for any agent corpus. The per-edge grade
is a proposed schema. No experiment here mixes
33


---

grades within a graph, so whether a model can
use the per-edge stamp is untested. The graph-
network comparison covers off-the-shelf models
only.
It does not establish which architectural
change would close their transfer deficit against the
lean graph features (Appx. D.9). Open directions
and undemonstrated uses are in Appx. G.
I
Related Work, Extended
Agent tracing and observability. The execution
layer is precisely what agent traces and observability
tooling already record (Dong et al., 2024). A reason-
act trace (Yao et al., 2023) logs which step ran
and in what order, and the public corpora behind
our results (§4.3) are themselves logged execution
records. Recording the execution layer is the free
half: a trace gives which agent acted and how
control moved, and stops there. Even work that
reconstructs an execution trace post hoc, when only
final outputs survive (Nian et al., 2026), recovers
the execution layer and not the reliance beneath it.
Within software engineering, one study puts the
trajectories of three agents into a common thought-
action-result format and relates trajectory properties
to success (Bouzenia and Pradel, 2025); that format
is shared within one setting and records each run
as a step sequence. What each step relied on is
not recorded by the trace as a dependency edge.
When access events are absent, that reliance must
be declared by instrumentation or inferred under
an assumption. Observability that captures only
execution therefore captures the base and misses
the signal.
Graph anomaly detection for agents. A newer
line builds an agent graph and scores it for anoma-
lies, almost always with a security framing: attacks,
prompt injection, or malicious agents (He et al.,
2025; Zhou et al., 2025; Wang et al., 2025b). How
much of it is typed varies: SentinelAgent distin-
guishes node and edge kinds, while GUARDIAN
carries one of each. This work shares the graph base
but differs in aim. We evaluate one representation
for faithfulness across agent settings and make the
dependency layer the object of study, rather than
building a single-objective security detector. Evi-
dence that graph topology changes memory-leakage
risk in multi-agent systems (Liu et al., 2026) is one
reason to put structure at the center, and it points
the same detectors at reliability rather than only at
attacks.
Learned program graphs. Software has been
represented as a typed graph over code for some
time, and learned on. Code property graphs merge
the syntax tree, control flow and data flow into one
typed multigraph for vulnerability discovery (Yam-
aguchi et al., 2014); program graphs with data-flow
and lexical-use edges are learned with message
passing for variable tasks (Allamanis et al., 2018);
and Devign learns over a composite of those repre-
sentations (Zhou et al., 2019). Two things separate
this line from ours. Its graph is static, recovered
from source text rather than from a run, so an edge
is a syntactic fact rather than something a step did;
and every edge arrives at one epistemic standing,
with no rung for an edge posited under an assump-
tion. The two-layer object here is a record of an
execution, and the attachment grade is the axis those
representations have no place for.
Uncertain and probabilistic graphs. Uncertain-
graph and probabilistic-graph models attach a scalar
probability to each edge and reason about the distri-
bution of graphs it induces (Potamias et al., 2010).
The attachment grade is related but finer along a
different axis. It does not say an edge is present
with probability 𝑝; it records by what means the
edge is known to be present, observed from the
trace, declared by instrumentation, or inferred un-
der a named assumption. Two edges can be equally
certain yet differ in grade, and it is the grade, not a
probability, that tells a size-collinear inferred edge
apart from a logged one (§5). A single edge weight
cannot represent that distinction.
Temporal and dynamic heterogeneous graph
learning. Our object is a directed, typed, tem-
poral multigraph whose dependency edges point
forward in time, which places it inside the dynamic
heterogeneous graph family that temporal and dy-
namic graph learning studies (Kazemi et al., 2020).
Agent-side methods already borrow from it: tempo-
ral graph modeling has been applied to multi-agent
collaboration for safety (Zhou et al., 2025). What
the general family does not contain is the degener-
ate regime of §5. Because the dependency layer is
sometimes inferred rather than observed, a named
full-history assumption collapses it to a determinis-
tic function of run size, with edge count  𝑛steps
2
 and
a measured collinearity with run length as high as
0.99 on the evaluation corpora under that assump-
tion and 1.00 on the Who&When runs of Figure 5.
An edge weight says how strong an edge is and a
temporal attribute says when it arrived; neither says
by what means it is known, so neither separates
a logged reliance from one a full-history assump-
34


---

tion supplied. The relation-aware models that do
read the edge type, R-GCN and HGT, fall below
chance on held-out corpora (Appx. D.9), and the
edge-type-blind network is fooled by the inferred
layer exactly as the linear probe is (§5.2).
Learning on small typed graphs. Small graph
size is not a general barrier to message passing:
molecular benchmarks such as MUTAG and QM9
support classification and property prediction on
small labeled graphs (Xu et al., 2019; Ramakrishnan
et al., 2014; Morris et al., 2020). This comparison
does not identify why the graph networks underper-
form the lean graph features on our agent runs. It
does show that small size and typed nodes alone
do not distinguish agent graphs from established
graph-learning settings.
Edge ablations on agent graphs. Concurrent
work ablates edge types under a different construc-
tion: holding turn nodes and a two-layer GCN
fixed, AFANet’s single-run point estimates put
adjacent-turn edges alone at 74.82 agent micro-F1
on AEGIS-Bench against 74.16 for adjacent-turn
and same-agent edges together, so the richer edge
set does not win every metric, although its authors
conclude that both edge types contribute (Li et al.,
2026b). Shi et al. (2018) likewise found trivial trees
competitive with real parse trees across ten tasks
when only the structure-generating rule changed.
J
AI Use Statement
The author used AI coding and writing assistants
to support implementation, analysis tooling, figure
preparation, and manuscript drafting and revision.
The reported empirical results are computed by
evaluation code over benchmark records and saved
experimental artifacts. The author takes full respon-
sibility for the methods, interpretation, and final
content of the paper.
35

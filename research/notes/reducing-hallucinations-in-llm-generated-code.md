---
title: Reducing Hallucinations in LLM-Generated Code
id: reducing-hallucinations-in-llm-generated-code
tags:
- ai-software-factory-architecture-58e4cc
- zero-hallucination
- code-verification
- primary-research
created: '2026-10-12T08:33:35.501646Z'
updated: '2026-10-12T08:35:17.637105Z'
source: https://arxiv.org/abs/2511.12288
source_domain: arxiv.org
fetched_at: '2026-10-12T08:33:35.500664Z'
fetch_provider: builtin
status: draft
type: note
tier: institutional
content_type: paper
deprecated: false
summary: 'ACM paper (Proc. ACM Program. Lang., Vol 10, No. OOPSLA2, Article 393/111,
  Oct 2026; arXiv:2511.12288; authors Dai, Liang, Xu, Xie, Mechtaev — Peking University)
  introduces ''semantic triangulation,'' a theory-grounded framework for reducing
  LLM code hallucinations at selection time (post-generation, black-box). Problem
  framing: standard plurality voting over multiple LLM-generated code samples fails
  because LLMs produce correlated errors — sampled programs can ''collude'' on the
  same wrong answer, so voting amplifies shared mistakes rather than catching them.
  Existing proxy-based approaches (LLM-generated tests, auto-formalized specifications)
  suffer the same flaw since the proxies come from the same imperfect model that wrote
  the code.


  Core mechanism: transform the original problem into a ''dissociative variant'' likely
  requiring a fundamentally different algorithm (via problem inversion, decomposition,
  or solution enumeration — 4 concrete triangulation methods instantiated), then check
  consistency between independently sampled solutions to the original and the transformed
  problem. The paper proves, under a formal model of LLM hallucination, that this
  decorrelation property confers higher confidence in program correctness than correlated-error
  methods.


  Empirical results (LiveCodeBench and CodeElo benchmarks, across GPT-4o, DeepSeek-V3,
  Gemini 2.5 Flash): the method increases the probability of selecting a correct program
  by 16% over baselines (test generation, metamorphic testing, auto-formalized specifications),
  and achieves 7% higher reliability and 7% higher F1 score in selection-or-abstention
  scenarios. It is reported as the only evaluated method that consistently handles
  ''inexact'' problems admitting multiple valid solutions — a known failure mode for
  exact-match and test-based proxies. Directly load-bearing for the whitepaper''s
  Zero-Hallucination / Rigid Evals pillar: provides a concrete, provable mechanism
  for decorrelating LLM self-verification signals rather than relying on majority
  vote or same-model-generated tests, which is exactly the trap naive LLM-as-judge
  adversarial review setups can fall into.'
raw_file: raw/reducing-hallucinations-in-llm-generated-code.pdf
doi: arXiv:2511.12288
citation_count: 3
venue: Proceedings of the ACM on Programming Languages
---

*Suggested by [[best-sast-tools-in-2026-semgrep-codeql-snyk-compared]] — arXiv mirror of ACM paper 10.1145/3839525 cited in batch (ACM HTML/PDF 403'd)*

Reducing Hallucinations in LLM-Generated Code
via Semantic Triangulation
YIHAN DAI, Key Lab of HCST (PKU), MOE; SCS, Peking University, China
SIJIE LIANG, Key Lab of HCST (PKU), MOE; SCS, Peking University, China
HAOTIAN XU, Key Lab of HCST (PKU), MOE; SCS, Peking University, China
PEICHU XIE, Independent, China
SERGEY MECHTAEV∗, Key Lab of HCST (PKU), MOE; SCS, Peking University, China
Large language models (LLMs) can generate executable code from natural language descriptions, but the
resulting programs frequently contain bugs due to hallucinations. In the absence of formal specifications,
existing approaches attempt to assess correctness using LLM-generated proxies such as tests or auto-formalized
specifications. However, these proxies are produced by the same imperfect models and thus often corrobo-
rate rather than catch errors, especially when the model exhibits correlated errors. We introduce semantic
triangulation, a theory-grounded framework that decorrelates model errors by transforming the original
problem into a dissociative variant—one likely requiring a fundamentally different algorithm—and checks
consistency between independently sampled solutions to both problems. We identify theoretical requirements
for this framework, and we prove that under a formal model of LLM hallucinations, these properties confer
higher confidence in program correctness. We instantiate the framework through four concrete triangulation
methods based on problem inversion, decomposition, and solution enumeration. Evaluated on LiveCodeBench
and CodeElo across GPT-4o, DeepSeek-V3, and Gemini 2.5 Flash, our tool increases the probability of selecting
a correct program by 16% over baselines (test generation, metamorphic testing, and auto-formalized specifica-
tions) and achieves 7% higher reliability and 7% higher F1 score in selection-or-abstention scenarios, while
being the only method that consistently handles inexact problems admitting multiple valid solutions.
CCS Concepts: • Software and its engineering →Automatic programming; Formal software verifica-
tion; • Computing methodologies →Natural language processing.
Additional Key Words and Phrases: Code Generation, Large Language Models, Sample Consensus
1
Introduction
Large language models (LLMs) turn natural language specifications into executable code, but this
convenience comes at a cost: the generated programs often contain bugs [35] or vulnerabilities [42]
due to LLM hallucinations (also known as confabulations). This is exacerbated by the growing
trend of “vibe coding”, where developers engage in continuous prompting without thoroughly
reviewing the generated code. In a black-box setting, code hallucinations can be automatically
mitigated through two orthogonal strategies: (1) pre-generation input improving—such as prompt
engineering via CoT [55] or RAG [30]—and (2) post-generation output assessment, which examines
generated candidates for correctness [15]. Here, we focus on the latter.
Identifying which, if any, programs from a pool of LLM-generated samples are correct is akin to
a police detective trying to determine which suspects, if any, are actually innocent. The standard
approach, plurality voting [18], simply asks all generated programs for their “story”—its input-
output behaviour—and selects the most common answer. However, since LLMs are prone to
generating correlated errors [27], this is equivalent to interrogating a group of suspects who have
∗Sergey Mechtaev is the corresponding author.
Authors’ Contact Information: Yihan Dai, Key Lab of HCST (PKU), MOE; SCS, Peking University, Beijing, China, yhdai25@stu.
pku.edu.cn; Sijie Liang, Key Lab of HCST (PKU), MOE; SCS, Peking University, Beijing, China, 2601213433@stu.pku.edu.cn;
Haotian Xu, Key Lab of HCST (PKU), MOE; SCS, Peking University, Beijing, China, xht@stu.pku.edu.cn; Peichu Xie,
Independent, Beijing, China, xie_peichu@hotmail.com; Sergey Mechtaev, Key Lab of HCST (PKU), MOE; SCS, Peking
University, Beijing, China, mechtaev@pku.edu.cn.
arXiv:2511.12288v4  [cs.SE]  8 Sep 2026


---

111:2
Dai et al.
already colluded on the same fake alibi. In such cases, plurality voting does not identify the truth;
it merely amplifies their shared deception [51].
To counter this, previous methods employ alternative “interrogation” techniques, using generated
tests [23, 49] or auto-formalized specifications [13, 38] as proxies for truth. Yet, because these proxies
are generated by the same underlying LLM, it is akin to bringing in a biased witness who shares the
same flawed logic as the suspects; they will likely corroborate the false alibi, leading to an erroneous
conclusion. Meanwhile, metamorphic testing approaches, such as paraphrasing the problem [54],
aim to reveal inconsistencies by probing suspects with slightly altered scenarios. However, since
the suspects have rehearsed their alibi thoroughly enough to withstand such variations—much
like LLMs’ robustness to minor perturbations, the rephrased questions elicit the same erroneous
responses, just with different phrasing.
Our key insight is to tackle this problem much like skilled detectives who expose liars by
approaching their narrative from fundamentally different, unexpected angles. In particular, we
apply dissociative problem transformations: perspectives on the same problem that are sufficiently
different that an LLM, being an imperfect “stochastic parrot” [2, 44], struggles to maintain consistent
deception across them. Then, we check the consistency between responses to these dissociated
problems using traditional formal methods. While an innocent suspect’s account, i.e. correct
program behaviour, holds up under any line of questioning because it reflects the truth, hallucinated
programs, like liars caught off guard, will betray themselves through contradiction.
This paper introduces semantic triangulation, a general, theory-grounded framework that opera-
tionalises the above intuition. Given an original coding task 𝑑, a semantic triangulation method first
applies a dissociative transformation to obtain a non-trivially different task 𝑑′. The transformation
must ensure that solutions to 𝑑and 𝑑′ are linked through a binary relation over programs (a hyper-
property) 𝜙. Intuitively, 𝜙captures how a correct solution to 𝑑should relate to a correct solution
to 𝑑′—for instance, if 𝑑′ is obtained by swapping the input and output, 𝜙may require that one
program is the inverse of the other. Formally, 𝜙must satisfy two properties: (1) bijection-inducing,
meaning it establishes a one-to-one correspondence between program equivalence classes, so
that each solution for 𝑑—whether correct or erroneous—maps to a unique solution for 𝑑′; and
(2) correctness-coupling, meaning this correspondence preserves correctness: a correct solution to
𝑑maps to a correct solution to 𝑑′. We then compare independently sampled solutions to 𝑑and
𝑑′; when a solution to 𝑑′ agrees with a solution to 𝑑as checked via 𝜙, it serves as a plausibility
witness—independent corroboration that the solution to 𝑑is not a hallucination.
Returning to our police detective analogy, each of these theoretical requirements plays a dis-
tinct role in exposing deception. The dissociative property ensures that the transformed problem
approaches suspects from unexpected angles wholly unrelated to their rehearsed deception. The
bijection-inducing property enables detectives to detect even subtle inconsistencies in the suspects’
stories. Finally, correctness-coupling ensures that independently fabricated stories are unlikely to
corroborate each other by coincidence. Together, these requirements yield a theoretical result:
under our formal model of LLM hallucinations, an appropriately designed semantic triangulation
provably increases the probability of identifying a correct program compared to plurality voting.
We instantiate our framework through four concrete semantic triangulation methods, employing
transformations that invert problems, decompose them into sub-problems, and enumerate their
solution spaces. The dissociative character of these transformations stems from a key observation:
each transformed problem typically requires the LLM to implement a fundamentally different
algorithm—for instance, inversion demands a parser where the original required a printer. Because
the resulting programs embody distinct computational strategies, an LLM that hallucinated one
is unlikely to produce a matching hallucination for the other, making corroboration across the


---

Reducing Hallucinations in LLM-Generated Code via Semantic Triangulation
111:3
Problem 𝑑(CodeElo 1999D)
𝑝∼𝑚( · | 𝑑)
{True}𝑟= 𝑝2(𝑠,𝑡){𝑞1(𝑠,𝑡,𝑟)} holds.
{True}𝑟= 𝑝1(𝑠,𝑡){𝑞1(𝑠,𝑡,𝑟)} holds.
A string 𝑠consists of lowercase letters and zero or more “?”. Implement a function def p(s: str,
Implement a predicate def q(s: str, t: str,
r: Optional[str]) -> bool, that verifies that
the output 𝑟is a correct solution to the problem {𝑑}
a subsequence (not necessarily continuous) of 𝑠. Output any such string, or None if no exists.
t: str) -> Optional[str] to change each “?” to a lowercase letter such that string 𝑡becomes
def p(s: str, t: str) -> Optional[str]:
if len(t) > len(s):
return None
modified_s, t_idx = [], 0
for char in s:
if char == ’?’:
Postcondition Prompt Template 𝜏
𝑞∼𝑚( · | 𝜏(𝑑))
Sample 𝑝1 with P([𝑝1]) = 0.23
Sample 𝑝2 with P([𝑝2]) = 0.07
if t_idx < len(t):
modified_s.append(t[t_idx])
t_idx += 1
else:
modified_s.append(’a’)
else:
t_idx is not incremented
modified_s.append(char)
modified_s = ”.join(modified_s)
if is_subsequence(t, modified_s):
else:
return None
return modified_s
incomplete check
def q(s: str, t: str, r: Optional[str]) \
-> bool:
if r is None:
candidate_s = s.replace(’?’, ’a’)
if is_subsequence(t, candidate_s):
return False
Sample 𝑞1 with P([𝑞1]) = 0.73
else:
if not is_subsequence(t, r):
return False
if len(r) != len(s):
return False
for orig, trans in zip(s, r):
if orig != ’?’ and orig != trans:
return False
return True
def p(s: str, t: str) -> Optional[str]:
s_list, t_idx = list(s), 0
for i in range(len(s_list)):
if t_idx < len(t) and \
s_list[i] == t[t_idx]:
t_idx += 1
elif s_list[i] == ’?’:
if t_idx < len(t):
s_list[i] = t[t_idx]
t_idx += 1
else:
s_list[i] = ’a’
if t_idx == len(t):
return s_list
else:
return None
Fig. 1. Identifying a correct solution is hard when the model’s success probability is low (0.07 in the figure),
and it makes correlated errors (the dominant error has the probability 0.23). Auto-inferred Hoare-style
specifications tend to be overly permissive, failing to distinguish correct from incorrect solutions. The notation
𝑝∼𝑚( · | 𝑑) means the program 𝑝is sampled from a conditional distribution induced by an LLM 𝑚given a
problem description 𝑑. P([𝑝]) is the probability mass of the equivalence class of 𝑝, estimated via sampling.
transformation a strong signal of correctness. We further provide machine-checked proofs (in Lean)
that all four methods satisfy the theoretical requirements of our framework.
We implemented all triangulation methods in a tool, dubbed just-tri-it, and evaluated it on
LiveCodeBench [25] and a subset of CodeElo [43] that includes inexact problems—tasks where
multiple distinct outputs are valid for the same input. We evaluate just-tri-it across three state-of-
the-art models from different families: GPT-4o, DeepSeek-V3, and Gemini Flash 2.5. Our experiments
show that a successful triangulation increases the probability of correctness by 16% over baselines
(test generation, metamorphic testing, and auto-formalized Hoare-style specifications). For the task
of selection-or-abstention—selecting a solution only when sufficiently confident, and abstaining
otherwise—just-tri-it achieves 7% higher reliability and 7% higher abstention F1 than the strongest
baseline, which selects only high-confidence solutions with sampling probability ≥0.5. Remarkably,
it maintains this reliability while being able to select solutions with sampling probabilities as
low as 0.07, thereby enabling reliable outputs on harder tasks. Crucially, just-tri-it is the only
method that handles inexact problems consistently. Finally, we show that the requirements of our
framework are not satisfied by prior methods such as auto-formalization into Hoare logic, while an
ablation study confirms that these requirements are essential for our method’s reliability.
In summary, the paper makes the following contributions:
• Semantic triangulation, a theory-grounded hallucination detection framework that enhances
confidence of LLM-generated code by checking cross-task solution consistency.
• Practical instances of triangulation, with their design rigorously proven in Lean.
• Evaluation on LiveCodeBench and CodeElo showing that triangulation outperforms previous
methods in correct code selection decisions on instances with low probability of correct
solutions, and when the task permits multiple non-equivalent solutions.
All code, data, and mechanized proofs are available at https://github.com/msv-lab/just-tri-it.


---

111:4
Dai et al.
2
Overview
To illustrate the challenge of assessing correctness of LLM-generated programs, we use the problem
1999D1 from the CodeElo benchmark [43], denoted as 𝑑and shown in Figure 1. The problem asks to
replace each "?" in a string 𝑠with a lowercase letter so that a target string 𝑡becomes a subsequence
of 𝑠, or to report that no such replacement exists. For example, p("a?a", "ab") should return
"aba". Notably, the problem is inexact: multiple solutions may be valid for the same input. For
example, given the input p("??", "a"), both "aa" and "ab" are acceptable answers.
GPT-4o has a low success rate on this problem: the estimated probability of sampling a correct
solution, equivalent to 𝑝2 in Figure 1, is only 0.07, while the dominant incorrect behaviour has the
probability 0.23 ≫0.07. The sample 𝑝1 in Figure 1 exemplifies this error: it fails to advance the
index into the target string 𝑡during the main loop, causing, for instance, p("ab??e", "abcde")
to erroneously return None.
Plurality voting [18] selects the most frequent semantic equivalence class among sampled
solutions; majority voting, a stricter variant, requires the selected class to have probability at
least 0.5. Both are ineffective due to the tendency of LLMs to produce correlated errors, like 𝑝1 in
our example,—a phenomenon observed not only across samples from the same model but even
across different models [27]. In such cases, plurality consensus amplifies rather than mitigates
mistakes, preferring the dominant error 𝑝1 over the correct sample 𝑝2, an effect long recognized in
the ensemble learning literature [51]. Inexact problems further exacerbate the issue: since multiple
correct solutions may exist, plurality voting may favor a single dominant error even when the total
probability mass across all correct equivalence classes is higher.
0.0
0.2
0.4
0.6
0.8
1.0
Probability
0
20
40
60
80
100
Problem count
P ≥0.5
0 < P < 0.5
P = 0
Fig. 2. Probabilities of sampling correct so-
lutions from GPT-4o for LiveCodeBench-v6
problems (estimated over 100 trials).
Alternative techniques—checking consistency with
generated tests [5], auto-formalized specifications [13,
38], and metamorphic testing via paraphrasing [54]—
all fail to identify a correct solution on this example.
We discuss the failure of auto-formalized Hoare-style
specifications [21] in detail, as it reveals a conceptual
issue. For this problem, GPT-4o generates a postcondi-
tion equivalent to 𝑞1 in Figure 1 with probability 0.73.
This postcondition implements an incomplete check for
the answer None, and thus holds for both the incorrect
sample 𝑝1 and the correct sample 𝑝2, failing to distin-
guish between them. This failure has two causes. First,
complete behavioral specifications are inherently hard
to write, so real-world specifications tend to be overly permissive—as evidenced by benchmarks
such as SV-COMP [3]—and models reproduce this tendency. Second, and more fundamentally, the
semantics of a Hoare triple does not require the postcondition to capture the intended behavior
exactly: {pre} 𝑝{post} holds for any postcondition that overapproximates the behavior of 𝑝, up to
the trivial True. Errors in specifications thus need not mirror errors in programs: a single incorrect
or incomplete specification accepts many incorrect programs, making spurious matches between
LLM-generated specifications and programs highly probable.
Overpermissiveness is not the only failure mode. Figure 3 shows a LiveCodeBench task in which
a sampled program and an independently generated postcondition repeat the same semantic error.
In this task, the constraint requires selecting at least as many black balls as white balls, whereas
𝑝1 always selects equal numbers of each. The postcondition 𝑞1 reimplements the same flawed
1The problem is simplified for presentation; more details are available in Section G.


---

Reducing Hallucinations in LLM-Generated Code via Semantic Triangulation
111:5
Given 𝑁black balls with values 𝐵and 𝑀white balls with values 𝑊,
choose any subset of balls such that the number of chosen black balls is at
least the number of chosen white balls. Implement a function def p(N:
int, M: int, B: List[int], W: List[int]) -> int to return
the maximum possible total value.
Implement a predicate def q (N: int, M: int, B: List[int], W:
List[int], sum: int) -> bool, that verifies that the output 𝑠𝑢𝑚is a
answer to the problem {𝑑}.
Problem 𝑑 (LiveCodeBench atcoder_abc396_c)
Postcondition Prompt Template 𝜏
𝑝 ~ 𝑚 %  𝑑 )
def p(N: int, M: int, B: List[int], W: List[int]) -> int:
sorted_B = sorted(B, reverse=True)
sorted_W = sorted(W, reverse=True)
B_prefix_sum = [0] * (N + 1)
W_prefix_sum = [0] * (M + 1)
for i in range(N):
B_prefix_sum[i + 1] = B_prefix_sum[i] + sorted_B[i]
for i in range(M):
W_prefix_sum[i + 1] = W_prefix_sum[i] + sorted_W[i]
max_sum = 0
for W_chosen in range(M + 1):
if W_chosen <= N:
B_required = W_chosen
current_sum = B_prefix_sum[B_required] + 
W_prefix_sum[W_chosen]
max_sum = max(max_sum, current_sum)
return max_sum
Sample 𝑝! with ℙ( 𝑝! = 0.57)
def q (N: int, M: int, B: List[int], W: List[int], sum: int) 
-> bool:
B.sort(reverse=True)
W.sort(reverse=True)
current_B_sum, current_W_sum = 0, 0
B_prefix_sum, W_prefix_sum = [0], [0]
for value in B:
B_prefix_sum.append(B_prefix_sum[-1] + value)
for value in W:
W_prefix_sum.append(W_prefix_sum[-1] + value)
max_sum = 0
for num_W_chosen in range(M + 1):
if num_W_chosen > N:
break
num_B_chosen = max(num_W_chosen, 0)
current_sum = B_prefix_sum[num_B_chosen] + 
W_prefix_sum[num_W_chosen]
max_sum = max(max_sum, current_sum)
return sum == max_sum
Sample 𝑞! with ℙ𝑞!
= 0.7
𝑞 ~ 𝑚 %  𝜏(𝑑) )
same
logic
forces #black = #white, missing 
valid choices with more black balls.
Fig. 3. Hoare-style postconditions can degenerate into a functional reimplementation of the verified program.
In this example, the generated postcondition 𝑞1 follows the same algorithmic structure as sampled solution
𝑝1; as a result, 𝑞1 successfully verifies 𝑝1 despite both being incorrect.
calculation; hence, it accepts the output of 𝑝1 even though neither program captures the intended
semantics. Thus, specification can suffer from correlated errors in the same way as plurality.
The situation shown in Figure 1 is not uncommon. Figure 2 reports the estimated probability
of sampling a correct solution from GPT-4o across tasks in LiveCodeBench [25]. The model fails
to solve most tasks, and for a large fraction of solvable tasks, the probability of a correct solution
is below 0.5. No existing method can both abstain from unsolvable tasks and reliably identify
low-probability correct solutions on solvable ones, posing a significant challenge to the reliability
of LLM-generated code.
To understand this limitation and find a path forward, we recast prior approaches within a
unifying perspective: they sample auxiliary artifacts 𝑤(such as other programs, tests, specifications,
etc.)—which we refer to as the plausibility witnesses—and check their agreement with sampled
programs 𝑝. These agreement checks yield matching pairs that are then used to form consensus.
This leads to the following fundamental yet overlooked question:
What plausibility witnesses provide higher confidence in program correctness?
More formally, it asks to identify the type of witnesses that maximize the probability that the
program is correct under an agreement, P(𝑝is correct w.r.t. 𝑑| agree(𝑝,𝑤)), where 𝑑is a problem
description, and “agree” may denote (i) semantic equivalence if 𝑤is a program, i.e. another solution
to𝑑, (ii) test execution if 𝑤is a test suite, or (iii) a verification procedure if 𝑤is a formal specification.
2.1
High-Confidence Plausibility Witnesses via Semantic Triangulation
Semantic triangulation is the first approach designed from first principle to answer the above
question. Specifically, it applies a dissociative transformation to the problem in order to change
the surface representation or structure of the task sufficiently to decorrelate model errors, but
does so in a way that maintains an exact, verifiable mapping between solutions before and after


---

111:6
Dai et al.
transformation. This is feasible in the programming domain, where problems have well-defined
semantics and program behavior can be reasoned about with precision.
Let 𝐷be a space of problem descriptions, and 𝑃be a space of programs. We define:
Definition 2.1 (Semantic Triangulation). A semantic
triangulation (𝜏,𝜙) consists of a dissociative prob-
lem transformation 𝜏: 𝐷→𝐷and a predicate on
pairs of programs 𝜙: 𝑃× 𝑃→{0, 1} that induces
a bijection between semantic equivalence classes
of programs such that, for any problem description
𝑑∈𝐷, it maps correct solutions for 𝑑to correct
solutions for 𝜏(𝑑).
Problem description 𝑑
Solution 𝑝
Solution 𝑞
𝑑′
𝑝∼𝑚( · | 𝑑)
Hyperproperty 𝜙
𝑑′ = 𝜏(𝑑)
𝑞∼𝑚( · | 𝑑′)
where by inducing a bijection we mean that there exists a one-to-one correspondence between
equivalence classes of programs such that 𝜙holds exactly for those pairs (𝑝,𝑞) where the class of
𝑝is mapped to the class of 𝑞. Intuitively, this definition can be interpreted as follows:
• Error decorrelation through bijection: A bijective mapping between equivalence classes guaran-
tees that each error in solutions to the original problem maps to a unique error (one-to-one) in
solutions to the transformed problem. Thus, the probability that two independently generated
incorrect programs match exactly under a dissociative transformation is low.
• Correctness-coupling: The requirement that the bijection preserves correctness increases the
probability of correctness under agreement via 𝜙since in well-trained models, even in the
presence of correlated errors, the correct class still carries a non-negligible signal – it is
expected to be more likely than an arbitrarily chosen error class; otherwise the model would
effectively output noise.
We theoretically justify this definition using a mathematical model tailored to LLM hallucinations.
In particular, to capture LLM’s lack of genuine understanding of the problem’s semantics, which is
supported by empirical evidence [2, 44], we posit that for any given problem, there exists a seman-
tically different problem that the model cannot distinguish (Assumption 3). Furthermore, drawing
on empirical findings of widespread error correlation [27], we assume that the LLM produces
solutions with imbalanced distributions over equivalence classes of errors (Assumption 4). Under
these assumptions, and using the rearrangement inequality [19], we prove that an appropriately
designed triangulation strictly improves upon plurality voting (Proposition 4.2 and Proposition 4.3):
E𝑑∼Unif (𝐷)

P(𝑝is correct w.r.t. 𝑑| 𝜙(𝑝,𝑞′)) −P(𝑝is correct w.r.t. 𝑑| 𝑝≡𝑞)

> 0,
where 𝑝and 𝑞are independently sampled solutions for a uniformly chosen problem, 𝑞′ is a sampled
solution to the transformed problem, and ≡is semantic program equivalence.
2.2
Inversion-Based Dissociative Problem Transformation
Semantic triangulation requires that its problem transformation𝜏is dissociative, meaning it changes
the task sufficiently that the model does not precisely associate it with the original. Since deriving
such a transformation directly from the model weights is infeasible given the complexity of modern
LLMs, we instead design it based on intuition and validate the design empirically (Section 6.1).
A natural candidate for a dissociative transformation is problem inversion, since an inverse prob-
lem will likely require a different algorithm, e.g. a parsing algorithm is substantially different from
that of a printer for the same format, making perfectly matching mistakes in their implementations
less likely. However, the challenge of applying problem inversion in practice is that many problems


---

Reducing Hallucinations in LLM-Generated Code via Semantic Triangulation
111:7
Problem 𝑑(CodeElo 1999D)
Answer enumeration problem 𝑑≺
Set-valued partial inverse problem 𝑑≻
∀𝑠,𝑡. ∀𝑟∈𝑒1(𝑠,𝑡). 𝑡∈𝑞1(𝑠,𝑟)
ENUM-SINV is bijection-inducing
FWD-ENUM
∧∀𝑟,𝑠. ∀𝑡∈𝑞1(𝑠,𝑟). 𝑟∈𝑒1(𝑠,𝑡) holds.
∀𝑠,𝑡. 𝑝2(𝑠,𝑡) ∈𝑒1(𝑠,𝑡) holds.
∀𝑠,𝑡. 𝑝1(𝑠,𝑡) ∈𝑒1(𝑠,𝑡) fails.
See Fig. 1
See Fig. 1
def p(s: str, t: str) -> Optional[str]
A string 𝑠consists of lowercase letters and zero
or more “?”. Change each “?” to a lowercase
letter such that string 𝑡becomes a subsequence
(not necessarily continuous) of 𝑠. Output any
such string, or None if no such string exists.
def q(s: str, r: Optional[str]) -> \
A string 𝑠consists of lowercase letters and zero
or more “?”. If 𝑟is a string, output all 𝑡such
List[str]
subsequences for any substitution of “?” in 𝑠.
that 𝑟is the result of changing each “?” to a
lowercase letter and 𝑡is a subsequence of 𝑟;
if 𝑟is None, output all 𝑡which cannot be
def e(s: str, t: str) -> List[str]
A string 𝑠consists of lowercase letters and zero
or more “?”. Change each “?” to a lowercase
letter such that string 𝑡becomes a subsequence
(not necessarily continuous) of 𝑠. Output all
possible such strings.
𝑝∼𝑚( · | 𝑑)
Sample 𝑝1
Sample 𝑞1 with P([𝑞1]) = 0.07
Sample 𝑒1 with P([𝑒1]) = 0.27
def e(s: str, t: str) -> List[str]:
results = []
chars = ’abcdefghijklmnopqrstuvwxyz’
queue = [(s, t, 0)]
while queue:
ss, tt, idx = queue.pop(0)
if idx < len(ss):
if ss[idx] == ’?’:
for r in chars:
n = ss[:idx] + r + ss[idx+1:]
queue.append((n, tt, idx+1))
else:
queue.append((ss, tt, idx+1))
else:
if is_subsequence(ss, tt):
results.append(ss)
return results
def q(s: str, r: Optional[str]) -> \
List[str]
if r is None:
chars = string.ascii_lowercase
rs = [c if c != ’?’ else chars
for c in s]
result_set = set()
for l in range(1, len(s) + 1):
for c in product(chars, repeat=l):
c = ”.join(c)
can_form_subsequence = False
for v in product(*rs):
v = ”.join(v)
if is_subsequence(c, v):
can_form_subsequence = True
break
...omitted for brevity...
Sample 𝑝2
𝑒∼𝑚( · | 𝑑≺)
𝑞∼𝑚( · | 𝑑≻)
Fig. 4. just-tri-it transforms the program 𝑑into two derived problems: 𝑑≺, which enumerates all valid outputs
for a given input, and 𝑑≻, which computes all second-argument values that produce a given output under
a given first argument. It then triangulates candidate solutions to 𝑑≺against those to 𝑑≻via ENUM-SINV,
identifying a reliable enumerator 𝑒1, which is used to discard buggy 𝑝1, and select correct 𝑝2 via FWD-ENUM.
are hard to invert. Formally, inverting a function requires it to be bijective, while most practical
problems require implementing non-bijective functions (e.g., squaring is not bijective since both 2
and −2 map to 4). Although this can be addressed by returning all values that map to a given output,
the approach has two limitations. First, a full inversion, e.g., enumerating the values of both 𝑠and 𝑡
for the problem in Figure 1, is often intractable. Second, inexact problems further exacerbate the
situation: since multiple valid solutions exist, any concrete solution will fail a bijection-inducing
check with a correct inverse, which is a requirement of semantic triangulation (see Section 5.1).
Our tool just-tri-it identifies the low-probability correct solution 𝑝2 and discards the dominant
error 𝑝1 shown in Figure 1. Initially, it uses an LLM to automatically transform the original problem
𝑑into two derived problems shown in Figure 4: an answer enumeration problem 𝑑≺and a set-valued
partial inverse problem 𝑑≻. Considering that 𝑑is an inexact problem, an enumerator 𝑒solving 𝑑≺
must, for a given input e("??", "a"), return all valid substitutions satisfying the requirements of
𝑑: ["aa", "ab", ...]. The set-valued partial inverse 𝑑≻flips the roles of the second argument
𝑡and the return value, requiring the computation of all second-argument values that produce a
given output under a given first argument. For example, given input q("??", "ab"), an inverse 𝑞
solving 𝑑≻must produce all 𝑡that would require such a substitution: ["a", "b", "ab"].
After transforming the problems, just-tri-it samples candidate solutions to both and proceeds
as follows. First, it triangulates enumerators (solutions to 𝑑≺) against set-valued partial inverses
(solutions to 𝑑≻) using the hyperproperty ENUM-SINV shown in Figure 4. Concretely, for each can-
didate enumerator 𝑒and each candidate inverse 𝑞, ENUM-SINV checks whether the two programs
agree: for a sampled input, every output listed by 𝑒must map back through 𝑞to a set containing the
original second argument, and vice versa. Since ENUM-SINV is bijection-inducing, a match can only
occur when both 𝑒and 𝑞implement the exact same underlying input-output relation—just viewed


---

111:8
Dai et al.
from opposite directions. In our example, the enumerator 𝑒1 and inverse 𝑞1 pass this check, while
other candidate pairs do not, because their independent errors are inconsistent under inversion.
Second, it uses the identified enumerator 𝑒1 to check solutions to the original problem using the
hyperproperty FWD-ENUM. This hyperproperty simply checks the membership of the output of
𝑝in the output of 𝑒. Since FWD-ENUM holds only for 𝑝2, it is returned as the plausible solution,
while the dominant error 𝑝1 is discarded.
The success of this method stems from a combination of factors. First, the transformations are
dissociative: as can be seen in Figure 1 and Figure 4, all problems require substantially different
algorithms, making it non-trivial to produce perfectly matching bugs across them. Second, in
contrast to the Hoare triples in Figure 1, ENUM-SINV is bijection-inducing, which we prove in Lean,
meaning it can detect even minor inconsistencies between solutions. Thus, while each problem is
solved correctly with low probability, only correct solutions match under the hyperproperties.
Crucially, all components of this triangulation scheme play distinct roles:
• A set-valued partial inverse problem 𝑑≻and ENUM-SINV are needed because FWD-ENUM
is not bijection-inducing. Like the Hoare triples in Figure 1, it permits enumerators that
output overapproximate sets, resulting in spurious matches. As we show experimentally via
an ablation, non-bijection-inducing properties do not confer high reliability.
• An answer enumeration problem 𝑑≺and FWD-ENUM are needed because solutions to the
original problem cannot be directly triangulated against set-valued inverses: since the problem
is inexact, a correct solution to 𝑑does not map to a single correct solution to 𝑑≻, and therefore
will fail any bijection-inducing, correctness-coupling property.
3
Background, Notation and Basic Assumptions
We use P(·) to denote probability and E[·] for expectation. Conditional probability P(𝐴| 𝐵)
represents the probability of 𝐴given that 𝐵holds. We use 𝑑∼Unif(𝐷) for uniform sampling.
Let 𝐷be a space of problem descriptions, 𝑃be a space of programs. Let 𝑚be a code generation
model, and 𝑚( · | 𝑑) be a distribution of programs conditioned on the description 𝑑. We denote
programs independently sampled from this distribution as 𝑝,𝑞, ... ∼𝑚( · | 𝑑). The support of a
distribution is the set of all programs with non-zero probability. Let ≡be the (partial) semantic
program equivalence relation [8], P/≡be the set of all equivalence classes [𝑝1]≡, [𝑝2]≡, .... Since
semantic program equivalence is a classical relation, we omit ≡when denoting equivalence classes
w.r.t this relation, e.g. [𝑝1]. Given [𝑝], we call 𝑝its representative. We use id𝐴to denote the identity
function on the domain 𝐴.
The plurality method selects a representative of the most probable equivalence class. Formally, if
we sample 𝑛> 2 programs 𝑆≜{𝑝1, 𝑝2, . . . , 𝑝𝑛}, that is, 𝑝1, 𝑝2, . . . , 𝑝𝑛∼𝑚( · | 𝑑), then plurality will
select a program 𝑝∗≜arg max𝑝𝑖∈𝑆|[𝑝𝑖] ∩𝑆|. This method captures the intuition that a well-trained
model assigns higher probability to semantically correct solutions. Random sample consensus
(RANSAC) [16] is a classical algorithm designed to detect outliers, which was adapted to eliminate
hallucinated program-test pairs in CodeT [5]. In this context, this algorithm is applied to sets of
programs {𝑝1, ..., 𝑝𝑛} and witnesses {𝑤1, ...,𝑤𝑛} to maximize |𝑃a| · |𝑊a| where all program in 𝑃a
agree with all witnesses in𝑊a. Importantly, plurality is a special case of RANSAC consensus, where
equivalence between two programs directly corresponds to their agreement.
The modulus of an array 𝑥indexed by 𝐼is defined as ∥𝑥∥ℓ2(𝐼) ≜
√︃Í
𝑖∈𝐼𝑥2
𝑖.
Since prompts are written in natural language, they are prone to imprecision and ambiguity,
often allowing conflicting interpretations [26]. We categorize causes of this uncertainty into two
groups. We say that a problem description is ambiguous if it admits unintended interpretations.
For example, in the task “find three distinct elements of a given list that sum to zero”, the term


---

Reducing Hallucinations in LLM-Generated Code via Semantic Triangulation
111:9
“distinct” may refer either to distinct indices or to distinct values, and it is likely to be a fault in
the description. In contrast, a problem description is inexact if it omits unimportant details. For
example, the specification “return a positive element of a given list” allows one to choose a positive
element arbitrarily, which is likely valid and even desirable. Indeed, Quan et al. [43] found that
even in programming contests, where descriptions are more precise than in typical user prompts,
“about 30% of problems do not have unique correct outputs.” We rely on the following assumption:
Assumption 1. All descriptions 𝐷are unambiguous, but some are inexact.
This relaxes assumptions of previous works. For example, the uncertainty measure by Valentin
et al. [52] assumes that “if two LLM-generated programs behave differently on the same input, at
least one must be incorrect”, thus requiring prompts that are both unambiguous and exact.
Following standard practice in program verification, we model programs as mathematical func-
tions (please see Section 7 for practical implications):
Assumption 2. Relevant behavior of solutions to 𝐷can be represented as mathematical functions
𝑝: 𝐼→𝑂, where 𝐼is a space of program inputs, and 𝑂is a space of program outputs.
Definition 3.1 (Semantic Program Equivalence). Programs 𝑝and 𝑞operating on the same domains
are semantically equivalent, which is denoted as 𝑝≡𝑞, iff ∀𝑖∈𝐼. 𝑝(𝑖) = 𝑞(𝑖).
Given that (partial) program equivalence is undecidable, we estimate it by comparing programs’
outputs on LLM-generated inputs provided that the programs terminate within a timeout.
We rely on the existence (without requiring explicit knowledge) of a semantic function J·K : NL →
2𝐼×𝑂that for each problem description returns the required relation between inputs and outputs.
For example, J“multiply two numbers”K = {((2, 2), 4), ((2, 3), 6), · · · }. Inexactness is defined as
Definition 3.2 (Exactness). A problem description 𝑑is exact if and only if for any 𝑖∈𝐼, 𝑜,𝑜′ ∈𝑂,
(𝑖,𝑜) ∈J𝑑K ∧(𝑖,𝑜′) ∈J𝑑K ⇒𝑜= 𝑜′; Otherwise, it is inexact.
Example 3.3 (Inexact Problem Description).
J“return a positive element of a given set”K = { ({1, −1, 3}, 1), ({1, −1, 3}, 3), · · · }.
To simplify our definitions, we assume that all inputs are valid and all outputs are reachable:
∀𝑖∈𝐼∃𝑜∈𝑂. (𝑖,𝑜) ∈J𝑑K,
∀𝑜∈𝑂∃𝑖∈𝐼. (𝑖,𝑜) ∈J𝑑K.
In practice, identifying valid inputs is undecidable; Section 5.2 discusses our practical mitigation.
Definition 3.4 (Program Correctness w.r.t. Problem Description). A program 𝑝∈𝑃is correct w.r.t. a
problem description 𝑑∈𝐷iff ∀𝑖∈𝐼.(𝑖, 𝑝(𝑖)) ∈J𝑑K, which is denoted as 𝑝⊢J𝑑K. It is incorrect iff
∃𝑖∈𝐼.(𝑖, 𝑝(𝑖)) ∉J𝑑K, which is denoted as 𝑝⊬J𝑑K.
Hoare logic [21] is a framework for specifying expected program behavior. Its central construct,
the Hoare triple {Pre}𝑐{Post}, expresses that, if the program 𝑐starts in a state satisfying the
precondition Pre, then—assuming termination—it will end in a state satisfying the postcondition
Post. Pre- and postconditions are predicates over program states—mappings from variables to values.
Since we assume that programs are pure functions and all inputs are valid, such specifications
reduce to {True}𝑜= 𝑐(𝑖){Post(𝑖,𝑜)}, determined by postconditions Post.
4
Theoretical Basis of Triangulation
This section formally justifies the design of semantic triangulation (Theorem 2.1), along with
providing a conceptual account of the underlying improvement. Plurality, test generation, and
autoformalization can be unified under the concept of plausibility witnesses. Let 𝑝∼𝑚( · | 𝑑) be a


---

111:10
Dai et al.
program generated for a description 𝑑. Suppose there exists a procedure for sampling artifacts 𝑤
and a criterion “agree” for assessing their agreement with 𝑝. We call such 𝑤plausibility witnesses.
Based on agreeing pairs (𝑝,𝑤), algorithms such as RANSAC form consensus over the entire sample,
and plurality voting is a special case of this algorithm. Thus, a fundamental question arises:
Definition 4.1 (Confidence-Enhancing Plausibility Witness Problem). For a sampled program 𝑝,
what type of plausibility witness 𝑤and the corresponding agreement criterion provide higher
P(𝑝⊢J𝑑K | agree(𝑝,𝑤)), the probability that the program is correct under an agreement?
4.1
Semantic Triangulation Provably Enhances Confidence Under Agreement
We prove that triangulation yields higher-confidence witnesses than plurality in a mathematical
model of LLM hallucinations, which rigorously explains the mechanism of mitigating hallucinations,
informing our practical implementation. To streamline the formal analysis, we adopt several
simplifying conventions that do not restrict the practical applicability of our approach:
• to avoid modeling linguistic variations, all descriptions in 𝐷are semantically distinct;
• to facilitate equivalence checking, all programs 𝑃operate on exactly the same domains;
• there is a finite number of equivalence classes [𝑝1], [𝑝2], · · · , [𝑝𝑛] in 𝑃/≡;
• the existence of 𝜙does not require a closed-form representation.
Plurality voting operates under the assumption that each problem has a single solution. Indeed,
if there are multiple correct solutions to a problem, plurality may prefer high-probability errors
even if the total probability mass of all correct solutions is higher. Since our theoretical justification
involves a comparison with plurality, in this section we assume that each 𝑑has exactly one solution.
In the subsequent section, we show how triangulation alleviates this limitation in practice.
Intuitively, triangulation yields higher-confidence witnesses than plurality by mitigating corre-
lated errors. This arises because LLMs, as “stochastic parrots,” lack precise semantic understanding
and therefore fail to preserve errors under non-trivial transformations. To formalize this intuition,
inspired by work on spurious correlations [58], we assume that LLMs rely on shallow features
preventing them from capturing subtle aspects of problem semantics. At the same time, when a
model lacks the ability to discriminate between any problem instances, confidence improvement
becomes infeasible. The following assumption reflects these intuitions:
Assumption 3 (Stochastic Parrots). Let 𝑚be a model that defines a distribution of programs
conditioned on problem descriptions𝑚(𝑝| 𝑑). We say that𝑚is a stochastic parrot if for any description
𝑑, there is a description 𝑑′ such that 𝑚( · | 𝑑) = 𝑚( · | 𝑑′) and J𝑑K ≠J𝑑′K, and a description 𝑑′′ such
that 𝑚( · | 𝑑) ≠𝑚( · | 𝑑′′) and J𝑑K ≠J𝑑′′K.
If 𝑚is a stochastic parrot, the equivalence relation ≃defined as 𝑑≃𝑑′ ⇔𝑚( · | 𝑑) = 𝑚( · | 𝑑′)
partitions 𝐷into at least two equivalence classes containing at least two elements each. We refer to
this partitioning 𝐷/≃as the hallucination pattern of 𝑚.
To formalize the notion of correlated errors, we say that all programs in the same incorrect
equivalence class have the same errors, while different classes have different errors. Then, correlated
errors across samples for a given problem effectively mean that some equivalence classes are more
likely than others. For simplicity, assume that all error classes have different probabilities:
Assumption 4 (Correlated Errors). Let 𝑚be a model that defines a distribution of programs
conditioned on problem descriptions 𝑚(𝑝| 𝑑). We say that its errors correlate if for each 𝑑, all classes
of programs incorrect w.r.t. 𝑑have different probabilities.
In our proof, we transform problems by exploiting the hallucination pattern of a stochastic parrot.
We pose a requirement for triangulation that it must not make problems arbitrarily harder to solve,


---

Reducing Hallucinations in LLM-Generated Code via Semantic Triangulation
111:11
[𝑝1]
[𝑝5]
𝜙
≡
correct w.r.t. 𝑑
Legend:
Program classes:
Witness classes:
correct w.r.t. 𝜏(𝑑)
[𝑝2]
[𝑝3]
[𝑝4]
[𝑝1]
[𝑝5]
[𝑝2]
[𝑝3]
[𝑝4]
Fig. 5. Plurality suffers from correlated errors. Triangulation rearranges the mapping of programs to their
witnesses so that large classes of program errors are matched with small classes of witness errors and vice
versa, which decreases the probability of matching bugs as per the rearrangement inequality.
i.e., the probabilities of correct solutions for the original problem 𝑑and the transformed problem 𝑑′
must differ from each other less than the probabilities of errors. In the first proposition, operating
under a weak Assumption 4 that merely establishes that the probabilities of errors are different, we
assume that the probabilities of correct solutions to 𝑑and 𝑑′ are the same2:
Proposition 4.2. Let a code generation model 𝑚be a stochastic parrot with correlated errors that
hallucinates on problems with equal probability of correct solutions. There exists semantic triangulation
(𝜏,𝜙) such that for 𝑝,𝑞∼𝑚( · | 𝑑) and 𝑞′ ∼𝑚( · | 𝜏(𝑑)),
E𝑑∼Unif (𝐷)

P(𝑝⊢J𝑑K | 𝜙(𝑝,𝑞′)) −P(𝑝⊢J𝑑K | 𝑝≡𝑞)

> 0.
(1)
Proof. We construct 𝜏so that it exploits the stochastic parrot assumption. For each [𝑑]≃in the
𝑚’s hallucination pattern, we define 𝜏as a permutation on [𝑑]≃that has no fixed-points.
Let 𝜙≜{(𝑝,𝑞) | 𝑑∈𝐷, 𝑝⊢J𝑑K,𝑞⊢J𝜏(𝑑)K}. Since 𝜏is a permutation on semantically distinct
problems, 𝜙induces a permutation on equivalence classes [𝑝1], [𝑝2], · · · , [𝑝𝑛]. We represent this
permutation on the indices {1, ...,𝑛} as 𝜎. By construction, 𝜙is correctness-coupling, i.e. if [𝑝𝑐] is
correct w.r.t. 𝑑, then [𝑝𝜎(𝑐)] is correct w.r.t. 𝜏(𝑑). Therefore, (𝜏,𝜙) is semantic triangulation. Apart
from that, since 𝜏has no fixed-points, therefore 𝜎has no fixed-points. The effect of this permutation
𝜎, induced by 𝜙, is illustrated in Figure 5 using dashed arrows.
Let 𝜋𝑖≜P(𝑝∈[𝑝𝑖]), for 𝑝∼𝑚( · | 𝑑). We can rewrite P(𝑝⊢J𝑑K | 𝑝≡𝑞) and P(𝑝⊢
J𝑑K | 𝜙(𝑝,𝑞)) as
𝜋2
𝑐
Í
𝑖
𝜋2
𝑖, and
𝜋𝑐𝜋𝜎(𝑐)
Í
𝑖
𝜋𝑖𝜋𝜎(𝑖) , respectively. Assume 𝐶𝑑are the indices of correct solutions to
problems in [𝑑]≃, and 𝐵𝑑are the remaining indices of buggy solutions. Then, the expectation in
Equation (1) for each class [𝑑]≃, which we refer to as E𝑑∼Unif ([𝑑]≃) (ΔP), is expressed as
E𝑑∼Unif ([𝑑]≃)
"𝜋𝑐𝜋𝜎(𝑐)
Í
𝑖
𝜋2
𝑖−𝜋2
𝑐
Í
𝑖
𝜋𝑖𝜋𝜎(𝑖)
Í
𝑖
𝜋2
𝑖· Í
𝑖
𝜋𝑖𝜋𝜎(𝑖)
#
=
Í
𝑐∈𝐶𝑑
𝜋𝑐𝜋𝜎(𝑐) · Í
𝑖
𝜋2
𝑖−Í
𝑐∈𝐶𝑑
𝜋2
𝑐· Í
𝑖
𝜋𝑖𝜋𝜎(𝑖)
|[𝑑]≃| Í
𝑖
𝜋2
𝑖· Í
𝑖
𝜋𝑖𝜋𝜎(𝑖)
(2)
The reduction of correlated errors through triangulation can be explained by the rearrangement
inequality [19]. This inequality captures the principle that matching large terms with large terms
and small terms with small terms maximizes the sum of products. Specifically, for any real numbers
𝜋1, 𝜋2, . . . , 𝜋𝑛and any permutation 𝜎, Í𝑛
𝑖=1 𝜋2
𝑖≥Í𝑛
𝑖=1 𝜋𝑖𝜋𝜎(𝑖). Moreover, if all 𝜋𝑖are different and
𝜎has no fixed points, the inequality is guaranteed to be strict. See Appendix H for a proof of the
strictness condition.
In our case, 𝜎does not preserve any index by construction, and all 𝜋𝑏for 𝑏∈𝐵𝑑are distinct due
to Assumption 4. Apart from that, since 𝜎is a permutation on [1..𝑛] and on 𝐶𝑑, therefore it is also
2This assumption will be relaxed in Theorem 4.3


---

111:12
Dai et al.
a permutation on 𝐵𝑑, which contains at least two elements due to Assumption 3. Therefore, for the
top part of Equation (2), after canceling repeated terms, the following holds:
∑︁
𝑐∈𝐶𝑑
𝜋𝑐𝜋𝜎(𝑐) ·
∑︁
𝑏∈𝐵𝑑
𝜋2
𝑏−
∑︁
𝑐∈𝐶𝑑
𝜋2
𝑐·
∑︁
𝑏∈𝐵𝑑
𝜋𝑏𝜋𝜎(𝑏) >
∑︁
𝑐∈𝐶𝑑
𝜋𝑐𝜋𝜎(𝑐) ·
∑︁
𝑏∈𝐵𝑑
𝜋𝑏𝜋𝜎(𝑏) −
∑︁
𝑐∈𝐶𝑑
𝜋2
𝑐·
∑︁
𝑏∈𝐵𝑑
𝜋𝑏𝜋𝜎(𝑏)
Since we assumed that all correct solutions to problems in [𝑑]≃have equal probabilities, the RHS
of this inequality is zero, therefore E𝑑∼Unif (𝐷) (ΔP) > 0.
□
The preceding proof constructs𝜏such that the transformed problem instances are equally difficult
to solve as the originals, where “difficulty” is defined as the probability of sampling a correct solution.
This contrasts with our empirical observations, in which non-semantics-preserving transformations
may increase task difficulty. To reconcile this, we introduce the dissociative hallucination pattern
assumption that enables us to construct 𝜏in such a way that it does not make problems significantly
harder, while still preventing the model from precisely associating their semantics:
Assumption 5 (Dissociative Hallucination Pattern). Let 𝑚be a stochastic parrot, 𝐷/≃be its
hallucination pattern, [𝑝𝑖] ∈𝑃/≡be all program equivalence classes, 𝑐∈𝐶𝑑be all indexes such that
[𝑝𝑐] is correct w.r.t. at least one problem in [𝑑]≃, 𝐵𝑑be the remaining indexes, and 𝜋𝑖≜P(𝑝∈[𝑝𝑖]).
We say that 𝐷/≃is dissociative if there exists 𝜏defined as a permutation on each [𝑑]≃, with 𝜎being
the corresponding permutation on the indexes of a correct solution induced by 𝜏, that the normalized
difference between probabilities of correct solutions for the original programs and correct solutions for
the transformed problems is lower than difference between probabilities of corresponding errors:
∑︁
𝑐∈𝐶𝑑
𝜋𝑐−𝜋𝜎(𝑐)
∥𝜋∥ℓ2(𝐶𝑑)
2
<
∑︁
𝑏∈𝐵𝑑
𝜋𝑏−𝜋𝜎(𝑏)
∥𝜋∥ℓ2(𝐵𝑑)
2
(3)
The justification of this assumption is that if a well-trained model does not distinguish between two
problems and produces high-probability bugs, we can still expect that the probabilities of correct
solutions to these problems in the distribution should not vary as much as probabilities of errors.
Under this assumption, we can prove a more general statement:
Proposition 4.3. Let the model 𝑚be a stochastic parrot with a dissociative hallucination pattern.
There exists semantic triangulation (𝜏,𝜙) such that for 𝑝,𝑞∼𝑚( · | 𝑑) and 𝑞′ ∼𝑚( · | 𝜏(𝑑)),
E𝑑∼Unif (𝐷)

P(𝑝⊢J𝑑K | 𝜙(𝑝,𝑞′)) −P(𝑝⊢J𝑑K | 𝑝≡𝑞)

> 0.
Proof. Continuing the derivation for E𝑑∼Unif ([𝑑]≃) (ΔP) in Equation (2) leads to the equation in
Assumption 5, as elaborated in Section A.
□
5
Practical Design of Triangulation
Our practical design of semantic triangulation methods is based on the insights of our theoretical
analysis (Assumption 5) that require that the transformed problems are not significantly harder to
solve, while it is hard to exactly match errors in their implementations. In particular, we transform
a problem into one that requires a different algorithm while still being “natural” for an LLM to
solve. Our transformations involve algorithm inversion/partial inversion, answer enumeration and
problem decomposition. Specifically, we introduce three inversion-based methods consisting of
problem transformations and corresponding hyperproperties: FWD-INV, FWD-SINV, and ENUM-
SINV, and a meta triangulation method STREAM for stateless stream-processing programs. All
transformations are performed automatically by prompting an LLM (see, e.g., Figure 6).
To specify the intended effect of transformations, we use an imaginary procedure L · M that, given
a binary relation between inputs and outputs, converts it into natural language text.


---

Reducing Hallucinations in LLM-Generated Code via Semantic Triangulation
111:13
SINV problem transformation prompt template
You are given a programming problem that requires implementing the function {ORIG_SIGN}. Rewrite this problem
so that it instead requires implementing the set-valued inverse function {SINV_SIGN}. Given the desired output
value {NEW_ARG} (corresponding to the original function's return value), the new function should return an
exhaustive list of values for the parameter {INV_ARG} such that if the original function were called with
any of these values (and the other parameters unchanged), it would produce {NEW_ARG} as the result.
Fig. 6. A fragment of prompt template used for set-valued inverse problem transformation. ORIG_SIGN is the
typed signature of the original function, INV_SIGN is the signature of the inverse function, NEW_ARG is the
argument of the inverse function representing the output of the original function, INV_ARG is the argument
for inversion. The argument to invert (INV_ARG) is chosen by an LLM using a separate prompt.
Definition 5.1 (Inverse Problem). Let 𝑑be a problem such that J𝑑K ⊂𝐼× 𝑂. The corresponding
inverse problem is 𝑑−1 ≜L {(𝑜,𝑖) | (𝑖,𝑜) ∈J𝑑K} M.
Proposition 5.2 (Full FWD-INV). Let 𝜏transform each problem 𝑑into 𝑑−1, 𝑝is a sample for 𝑑, 𝑞
is for 𝑑−1, and 𝜙≜𝑞◦𝑝≡idI ∧∀𝑜,𝑜′ ∈𝑂. 𝑜≠𝑜′ ⇒𝑞(𝑜) ≠𝑞(𝑜′). If 𝜏is dissociative, then (𝜏,𝜙) is
semantic triangulation (Theorem 2.1). We refer to this triangulation method as Full FWD-INV.
Proof. A proof that 𝜙is bijection-inducing and correctness-coupling is mechanized in Lean.
□
Inversion may exploit dissociative hallucination patterns, because forward and inverse problems
often require different algorithms. However, full invertion is often infeasible. Consider the problem
“given a graph and two of its nodes, compute the length of the shortest path between them”. A
full inversion requires producing a pair consisting of a graph and two nodes whose shortest-path
distance matches a given value—such outputs would likely fail to align with the behavior of a
forward program, or else require exhaustively enumerating all such pairs, which is infeasible.
To alleviate this problem, we apply a more natural and practical partial inversion, that is inverting
an algorithm w.r.t. a single parameter. For instance, “given a graph and a target distance, enumerate
all pairs of nodes whose shortest-path length is exactly that distance”. This formulation is easier
for an LLM to handle, while still satisfying the properties required for semantic triangulation:
Definition 5.3 (Partial Inverse Problem). Let 𝑑be a problem such that J𝑑K ⊂(𝐼1 × 𝐼2) × 𝑂. The
corresponding partial inverse problem w.r.t. the first argument is
𝑑−1
1
≜L {((𝑜,𝑖2),𝑖1) | ((𝑖1,𝑖2),𝑜) ∈J𝑑K} M.
The inversion with respect to other arguments is defined accordingly. In practice, we prompt an
LLM to decide which argument to use for inverting the problem.
Proposition 5.4 (Partial FWD-INV). Let 𝜏transform each problem 𝑑into 𝑑−1
1 , and
𝜙≜∀(𝑖1,𝑖2) ∈𝐼. 𝑞(𝑝(𝑖1,𝑖2),𝑖2) = 𝑖1 ∧∀(𝑜,𝑖2), (𝑜′, _) ∈𝑂′. 𝑜≠𝑜′ ⇒𝑞(𝑜,𝑖2) ≠𝑞(𝑜′,𝑖2),
where 𝑝is a sample for 𝑑, 𝑞is for 𝑑−1
1
and 𝑂′ refers to all inputs to 𝑞. If 𝜏is dissociative, then (𝜏,𝜙) is
semantic triangulation. We refer to this triangulation method as Partial FWD-INV.
Proof. A proof that 𝜙is bijection-inducing and correctness-coupling is mechanized in Lean.
□
Although the problem inversion defined above is likely to change the solution algorithms, while
keeping the problem tractable for an LLM, its key limitation is that for the hyperproperty to
faithfully hold, i.e., hold on pairs of correct solution-witness pairs, the problem description must
permit bijective functions as valid solutions. This, however, often does not hold in practice. For
example, for the problem “compute the square of a given number”, a correct solution maps both −𝑖
and 𝑖to 𝑖2, implying that only incorrect forward and inverse implementations will match.
To alleviate this challenge, we employ set-valued inverses that return the exhaustive list of values
for a given input argument that would result in a given output:


---

111:14
Dai et al.
Original problem 𝑑
Implement p(i: int) -> int that re-
turns an integer strictly greater than i
by at most 2.
Sample 𝑝
def p(i: int) -> int:
return i+1
Inverse problem 𝑑−1
Implement q(i: int) -> int that re-
turns an integer strictly smaller than i
by at most 2.
Sample 𝑞
def q(i: int) -> int:
return i-2
Set-valued inverse problem 𝑑≻
Implement
q(i: int) -> list[int]
that returns all integers strictly smaller
than i by at most 2.
Sample 𝑞′
def q(i: int) -> list[int]:
return [i-1, i-2]
Fig. 7. It is challenging to achieve consensus for problems that permit multiple non-equivalent solutions.
Definition 5.5 (Set-valued Inverse Problem). Let 𝑑be a problem such that J𝑑K ⊂𝐼× 𝑂. The
corresponding set-valued inverse problem is
𝑑≻≜L

(𝑜, {𝑖| (𝑖,𝑜) ∈J𝑑K}) | (_,𝑜) ∈J𝑑K
	
M.
Proposition 5.6 (Full FWD-SINV). Let 𝜏transform each problem 𝑑into 𝑑≻, and
𝜙≜∀𝑖∈𝐼. 𝑖∈𝑞(𝑝(𝑖))
|       {z       }
𝐿1
∧∀𝑖′ ∈𝑞(𝑝(𝑖)). 𝑝(𝑖′) = 𝑝(𝑖)
|                            {z                            }
𝐿2
∧∀𝑜,𝑜′ ∈𝑂. 𝑜≠𝑜′ ⇒𝑞(𝑜) ∩𝑞(𝑜′) = ∅
|                                            {z                                            }
𝐿3
,
where 𝑝is a sample for 𝑑and 𝑞is for 𝑑≻. If 𝜏is dissociative, then (𝜏,𝜙) is semantic triangulation. We
refer to this triangulation method as Full FWD-SINV.
Proof. A proof that 𝜙is bijection-inducing and correctness-coupling is mechanized in Lean.
□
As with FWD-INV, we define a partial version of FWD-SINV:
Definition 5.7 (Partial Set-valued Inverse Problem). Let 𝑑be a problem such that J𝑑K ⊂(𝐼1 ×𝐼2) ×𝑂.
The corresponding partial set-valued inverse problem w.r.t. the first argument is
𝑑≻
1 ≜L
 (𝑜,𝑖2), {𝑖1 | ((𝑖1,𝑖2),𝑜) ∈J𝑑K} | ((_,𝑖2),𝑜) ∈J𝑑K
	
M.
Proposition 5.8 (Partial FWD-SINV). Let 𝜏transform each problem 𝑑into 𝑑≻
1 , and
𝜙≜∀(𝑖1,𝑖2) ∈𝐼. 𝑖1 ∈𝑞(𝑝(𝑖1,𝑖2),𝑖2) ∧∀𝑖′
1 ∈𝑞(𝑝(𝑖1,𝑖2),𝑖2). 𝑝(𝑖′
1,𝑖2) = 𝑝(𝑖1,𝑖2)
∧∀(𝑜,𝑖2), (𝑜′, _) ∈𝑂′. 𝑜≠𝑜′ ⇒𝑞(𝑜,𝑖2) ∩𝑞(𝑜′,𝑖2) = ∅,
where 𝑝is a sample for 𝑑, 𝑞is for 𝑑≻
1 and 𝑂′ refers to all inputs to 𝑞. If 𝜏is dissociative, then (𝜏,𝜙) is
semantic triangulation. We refer to this triangulation method as Partial FWD-SINV.
Proof. A proof that 𝜙is bijection-inducing and correctness-coupling is mechanized in Lean.
□
Automating such a transformation with an LLM is straightforward, as it often reduces to a
simple linguistic reformulation and does not require the reasoning to actually solve the problem. A
fragment of the prompt used for Partial FWD-SINV transformation is given in Figure 6.
5.1
Triangulation for Inexact Problems
Inexact problems permit multiple non-equivalent solutions (Theorem 3.2), e.g., the task “generate
a script that extracts all customers from a CSV” can be interpreted as saving customer data to a file
or printing it to stdout, returning it in sorted order or not, and deciding which specific information
to extract. Some details are likely irrelevant to the user’s goal. We speculate that in practice, most
code generation prompts are inexact. In contrast, to the best of our knowledge, existing techniques
to establish consensus or control uncertainty, sometimes explicitly [52], assume that only one
solution is correct, since forming a consensus under inexact problem descriptions is challenging.


---

Reducing Hallucinations in LLM-Generated Code via Semantic Triangulation
111:15
Figure 7 illustrates this challenge. The original problem admits at least two non-equivalent
solutions: 𝑖↦→𝑖+ 1 and 𝑖↦→𝑖+ 2 (for simplicity, we omit solutions whose logic varies depending
on the input). This undermines plurality, as the vote may select a high-probability error even when
correct solutions have greater total probability mass. This also hinders the above triangulation
methods. For example, composing the inverse program 𝑞with the forward program 𝑝in Figure 7
does not yield an identity function as required by FWD-INV, despite both programs being correct
individually. Similarly, in the context of FWD-SINV, the clause ∀𝑖′ ∈𝑞′(𝑝(𝑖)). 𝑝(𝑖′) = 𝑝(𝑖) in
Theorem 5.6 fails, as for 𝑖= 1, 𝑞′(𝑝(𝑖)) is {0, 1}, but 𝑝(0) ≠𝑝(1).
Triangulation is the first to alleviate this problem; it generates a program to exhaustively enu-
merate valid answers for each input, and triangulate this enumerator against a set-valued inverse.
Definition 5.9 (Answer Enumeration Problem). Let 𝑑be a problem such that J𝑑K ⊂𝐼× 𝑂. The
corresponding answer enumeration problem is 𝑑≺≜L

(𝑖, {𝑜| (𝑖,𝑜) ∈J𝑑K}) | (𝑖, _) ∈J𝑑K
	
M.
An enumerator is inefficient as a solution to the original problem; to address it, we sample
solutions to three problems: the original problem 𝑑, the enumeration problem 𝑑≺, and the set-
valued inverse problem 𝑑≻. After triangulating a solution to 𝑑≺with a solution to 𝑑≻, we triangulate
a solution to 𝑑with 𝑑≺. Note that triangulating with 𝑑≻cannot be omitted, since triangulating only
𝑑with 𝑑≺lacks the bijective property of semantic triangulation and therefore does not sufficiently
decorrelate errors. We call such a triangulation scheme a cascade.
Proposition 5.10 (Full ENUM-SINV). Let 𝜏1 transform each problem 𝑑into 𝑑≺, and 𝜏2 transform
each problem 𝑑into 𝑑≻. Let a hyperproperty 𝜙defined as
∀𝑖∈𝐼. ∀𝑜∈𝑝(𝑖). 𝑖∈𝑞(𝑜) ∧∀𝑜∈𝑂. ∀𝑖∈𝑞(𝑜). 𝑜∈𝑝(𝑖)
where 𝑝is a sample for 𝑑≺and 𝑞is for 𝑑≻. If 𝜏2 ◦𝜏−1
1
is dissociative, then (𝜏2 ◦𝜏−1
1 ,𝜙) is semantic
triangulation. We refer to this triangulation method as Full ENUM-SINV cascade.
Proof. A proof that 𝜙is bijection-inducing and correctness-coupling is mechanized in Lean.
□
To illustrate this hyperproperty, refer again to Figure 7. Assume an incorrect enumerator 𝑝′ ≜
𝑖↦→[𝑖+ 1] misses 𝑖+ 2 in its output. Although 𝐿1 will hold for any input to 𝑝′, the clause 𝐿2 will
fail. For example, for 𝑜= 2, 𝑞′(𝑜) will return {0, 1}, but 2 ∉𝑝′(0). At the second phase, solutions 𝑝
to 𝑑are checked against triangulated enumerators 𝑝′′ via FWD-ENUM: ∀𝑖∈𝐼. 𝑝(𝑖) ∈𝑝′′(𝑖).
Similar to previous triangulation methods, we define a partial inversion variant of ENUM-SINV:
Proposition 5.11 (Partial ENUM-SINV). Let 𝜏1 transform each problem 𝑑into 𝑑≺, and 𝜏2
transform each problem 𝑑into 𝑑≻
1 . Let the hyperproperty 𝜙be defined as
∀(𝑖1,𝑖2) ∈𝐼. ∀𝑜∈𝑝(𝑖1,𝑖2). 𝑖1 ∈𝑞(𝑜,𝑖2) ∧∀(𝑜,𝑖2) ∈𝑂′. ∀𝑖1 ∈𝑞(𝑜,𝑖2). 𝑜∈𝑝(𝑖1,𝑖2)
where 𝑝is a sample for 𝑑≺, 𝑞is for 𝑑≻
1 , and 𝑂′ refers to all inputs to 𝑞. If 𝜏2 ◦𝜏−1
1
is dissociative, then
(𝜏2 ◦𝜏−1
1 ,𝜙) is semantic triangulation. We refer to this method as Partial ENUM-SINV cascade.
Proof. A proof that 𝜙is bijection-inducing and correctness-coupling is mechanized in Lean.
□
5.2
Implementation
We implemented triangulation in a tool called just-tri-it for Python programs. To form consensus
over the entire sample from individual agreements, we apply RANSAC in a manner similar to CodeT.
For stateless stream-processing problems, just-tri-it additionally applies the domain-specific
decomposition method STREAM; its construction and theoretical justification are available in
Appendix B. In addition, we implemented autoformalization into Hoare Logic–style postconditions,
expressed as boolean Python functions to avoid limitations of low-resource specification languages.


---

111:16
Dai et al.
GT
R
Correctly
selected
Incorrectly
selected
Abstained
No abstention
𝑁1
𝑁2
𝑁3
Abstention
𝑁4
𝑁5
(a) Abstention confusion matrix. “GT” is the ground-
truth, where “Abstention” indicates tasks with no cor-
rect solutions in the sample; “R” is the sample consensus
response. When GT is abstention, the response can only
be either “Abstained” or “Incorrectly selected”.
Reliable Accuracy =
𝑁1
𝑁1 + 𝑁2 + 𝑁4
Overall Accuracy =
𝑁1 + 𝑁5
𝑁1 + 𝑁2 + 𝑁3 + 𝑁4 + 𝑁5
Abstention Rate =
𝑁3 + 𝑁5
𝑁1 + 𝑁2 + 𝑁3 + 𝑁4 + 𝑁5
Precisionabs =
𝑁5
𝑁3 + 𝑁5
,
Recallabs =
𝑁5
𝑁2 + 𝑁4 + 𝑁5
Abstention F1-score = 2 · Precisionabs · Recallabs
Precisionabs + Recallabs
Fig. 8. Summary of abstention evaluation metrics. 𝑁𝑖are decision counts across evaluation dataset that are
classified along two dimensions GT and R. For example, 𝑁2 is the number of cases where the correct solution
exists but the method selects a wrong one.
Formal verification of Python code is hampered by the gap between capabilities of SOTA LLM-
based code generation and automated formal verification. Even on simpler benchmarks like Hu-
manEval [6]—where SOTA LLMs nearly solve all tasks—these LLMs automate verification of correct
solutions with the SOTA Python verifier Nagini [12] in only 15% of cases [45]. To obtain enough
signal on harder benchmarks, we approximate property validity by testing properties on LLM-
generated inputs. To generate inputs, we use the similar method as EvalPlus [36] to craft prompts
that sample until each problem reaches high coverage, but instead of supplying a ground-truth solu-
tion, which is not available in practice, we provide the problem description in the input generation
prompt. Also, we use the same input sets for all baselines to ensure fairness.
just-tri-it implements practical mitigations to two fundamental problems: (1) in practice, many
inputs are invalid, e.g., negative numbers for Fibonacci, and (2) some transformed problems, e.g., a
set-valued inverse, may require enumerating infinite or intractable sets. First, our code-generation
prompt instructs programs to validate inputs and raise ValueError on invalid cases following
common Python practice. Second, this prompt requests enumerating only a tractable subset when
the answer set is infinite or too large, and marking the output accordingly.
Checking hyperproperties by execution must handle two sources of uncertainty: the valid-input
domain may be unknown, and transformed programs may compute infinite or intractable sets. We
therefore use an extended evaluation semantics with three special outcomes. A crash or timeout
yields the demonic value D and rejects the check; an invalid input yields U; and an unresolvable
check—for example, membership outside a marked finite subset of an infinite set—yields the
angelic value A. The latter is inconclusive rather than positive evidence. A universally quantified
hyperproperty is accepted only when every checked branch is either True or A, and fewer than a
threshold𝑇of its branches are angelic. Thus, the checker tolerates a bounded amount of uncertainty
without certifying a property whose apparent validity rests mainly on invalid inputs or incomplete
enumeration. The complete operational semantics and an example derivation are given in Section C.
The same semantics governs differential testing for semantic equivalence between sampled
programs: an invalid-input failure (U) is tolerated angelically, so a pair is not deemed inequivalent
merely because one program rejects an input, whereas other crashes and timeouts are demonic. In
our experiments, the angelic treatment of failing executions was exercised in 42.4% of pairwise
equivalence checks; it does not, however, inflate equivalence decisions: checks involving a crashing
or failing variant concluded equivalence in only 19.1% of cases, compared to 32.6% across all checks,
because programs that fail on some inputs are generally more likely to be incorrect and thus tend
to disagree with other programs on further inputs.


---

Reducing Hallucinations in LLM-Generated Code via Semantic Triangulation
111:17
Table 1. Agreements methods check agreements with plausibility witnesses; Dissoc. = dissociative (witnesses
likely require fundamentally different algorithm), Biject. = bijection-inducing. Consensus methods form
selection/abstention decisions by aggregating agreements across the entire sample.
Agreement method for agree(𝑝, 𝑤)
Properties
Consensus method
Dissoc.
Biject.
Another solution: 𝑤is another sampled solution to the
original problem; agree(𝑝, 𝑤) is semantic equivalence
×
✓
Plurality
×
✓
Majority0.5
Tests: 𝑤is a generated test; agree(𝑝, 𝑤) means 𝑝passes 𝑤
−
×
CodeT [5]: Tests + RANSAC
Postcondition: 𝑤is an LLM-generated postcondition;
agree(𝑝, 𝑤) means 𝑝satisfies 𝑤
✓
×
Postcondition + RANSAC
Syntactic: metamorphic testing via paraphrasing
×
✓
Syntactic + RANSAC
OffByOne: metamorphic testing via off-by-one
×
✓
OffByOne + RANSAC
Is triangulated via FWD-INV
✓
✓
just-tri-it
Is triangulated via FWD-SINV
✓
✓
Is triangulated via ENUM-SINV
✓
✓
6
Evaluation
Our experiments address the following research questions:
RQ1: Does triangulation yield higher-confidence plausibility witnesses than baselines?
RQ2: Does triangulation enable better program selection and abstention than baselines?
RQ3: Does triangulation handle inexact tasks that permit non-equivalent correct solutions?
RQ4: (Ablation) What aspects of triangulation contribute to its performance?
RQ5: What are the causes of failures of semantic triangulation?
RQ6: What are the time and token cost of semantic triangulation in comparison with baselines?
RQ7: Do the empirical results support the theoretical assumptions for semantic triangulation?
We selected three SOTA LLMs from different families, GPT-4o [24], a popular closed-weight
model, DeepSeek-V3 [34], a popular open-weight model, and Gemini-2.5-Flash, a reasoning model.
Table 1 summarizes the methods used in our evaluation, all implemented as described in Sec-
tion 5.2. Each approach is evaluated in two modes. First, as an individual agreement method in
RQ1, e.g., Postcondition checks whether generated code satisfies a generated postcondition. Since
FWD-INV, FWD-SINV, and ENUM-SINV represent different ways of obtaining such agreement,
we evaluate them separately here. Second, as a sample consensus method in RQ2 and RQ3, where
selection and abstention decisions are formed by aggregating agreements across an entire sample,
typically using the RANSAC procedure described in Section 3. Because the three triangulation
methods target different problem types, we combine them into a single tool, just-tri-it, for those
evaluations. It sequentially tries ENUM-SINV, FWD-SINV, FWD-INV, with STREAM automatically
enabled when the LLM classifies the problem as stream-processing. It forms consensus via RANSAC
and abstains if no triangulation succeeds. Majority0.5 selects a solution whose estimated probability
is at least 0.5 and abstains if no such solution exists. Syntactic is a variant of the metamorphic
testing approach of Wang et al. [54]: it translates problem statements from English to Chinese and
checks equivalence of the resulting solutions. OffByOne is a metamorphic testing approach that
applies off-by-one perturbations to problem specifications, introducing trivial semantic changes,
and verifies that solutions change accordingly.
Important hyperparameters involve the number of samples, which we set to 30, as at this rate
the entropy of distribution of equivalence classes stabilizes, and the threshold for the tolerance of
angelic values during property checking (Section 5.2), which we set to 1
3 based on a pilot study on
MBPP [1]. We use the default temperature 1.0 for sampling. Refer to Section D for details.


---

111:18
Dai et al.
Since traditional code generation benchmarks HumanEval [6] and MBPP [1] are reaching their
saturation, we evaluated the above configurations on newer, more challenging benchmarks:
• LiveCodeBench (LCB) [25] is a popular, challenging code generation dataset; to ensure
contamination-free evaluation, we used the most recent, sixth segment of LiveCodeBench,
including 175 problems published between Feb-Apr 2025. This benchmark itself provides
oracle tests, so we use them for correctness checking as ground truth. Its limitations are that
it explicitly excludes inexact problems due to the difficulty of testing their solutions.
• CodeElo-Inexact (CEI): to address the LCB limitation, we selected inexact problems from
CodeElo [43], which originally contains 408 tasks. We collected all problems whose inexactness
is explicitly stated in the problem description (e.g., "If there are multiple answers, print any of
them"), yielding 64 problems. We then excluded problems whose inexactness is only due to case-
insensitivity (e.g., "YES" vs. "Yes"), leaving the final 31 instances. A limitation of CodeElo is that
it does not provide correctness oracles, suggesting the use of a closed third-party evaluation
platform, which harms reproducibility. To address it, we manually wrote correctness judges for
these 31 problems. As a sanity check, we collected pairs of correct and incorrect submissions
for them from CodeForces database [50], and ensured that our judges discriminate them.
6.1
RQ1: Confidence-Enhancing Plausibility Witnesses
ENUM-SINV
FWD-INV
FWD-SINV
Postcondition
Another solution
OﬀByOne
Syntactic
Test
Unconditional
0
20
40
60
80
100
Probability (%)
91.4
88.7
88.3
63.6
59.2
57.5
57.5
48.1
31.3
Fig. 9. The probability of GPT-4o sample correct-
ness under agreement across 175 LCB problems.
The horizontal axis lists the agreement methods
agree(𝑝,𝑤) described in Table 1. “Unconditional”
refers to the probability of correctness irrespec-
tive of an agreement.
To identify which type of plausibility witness con-
fers greater confidence in program correctness (as
posed in Theorem 4.1), we evaluate conditional prob-
ability of correctness given agreement P(𝑝⊢J𝑑K |
agree(𝑝,𝑤)). For just-tri-it, we report results sep-
arately for each triangulation scheme. Empirical es-
timates of this probability for GPT-4o on 175 LCB
tasks are given in Figure 9. For details of DeepSeek-
V3 and Gemini 2.5 Flash results, refer to Section E.
Although all witnesses increase the probability of
correctness in comparison to “Unconditional” (no
witnesses), triangulation methods consistently out-
perform the strongest baselines, e.g. Hoare-style
postconditions in the case of GPT-4o, by 16% on av-
erage across the evaluated models, confirming our
theoretical analysis in Section 4. We used a task-level paired nonparametric bootstrap with 10,000
resamples over all task-run results. The three methods outperformed postcondition under the
95% percentile bootstrap criterion: ENUM-SINV (Δ = 0.167, 95% CI [0.099, 0.230]), FWD-SINV
(Δ = 0.140, 95% CI [0.090, 0.187]), and FWD-INV (Δ = 0.159, 95% CI [0.037, 0.227]). All confidence
intervals exclude zero, indicating statistically significant improvements over postcondition.
Importantly, methods that apply non-dissociative transformations, Syntactic (translation to
Chinese) and OffByOne (trivial semantic transformation), yield little improvement, as they do
not disrupt error correlation. The substantial gap between these baselines and our triangulation
methods provides empirical evidence that inversion-based transformations are indeed dissociative.
RQ1: Semantic triangulation yields the most confidence-enhancing plausibility witnesses, out-
performing the strongest baseline by 16% on average.


---

Reducing Hallucinations in LLM-Generated Code via Semantic Triangulation
111:19
0
20
40
60
80
100
Reliable Accuracy (%)
CodeT
Postcondition
Plurality
Majority0.5
JUST-TRI-IT
35.4
36.3
36.5
52.9
63.0
0
20
40
60
80
100
Overall Accuracy (%)
CodeT
Postcondition
Plurality
Majority0.5
JUST-TRI-IT
38.8
39.2
39.6
64.6
73.1
0
20
40
60
80
100
Abstention Rate (%)
JUST-TRI-IT
Majority0.5
Postcondition
CodeT
Plurality
58.5
48.2
7.6
5.3
4.9
Ground Truth (58.2%)
0
20
40
60
80
100
Abstention F1 (%)
Plurality
CodeT
Postcondition
Majority0.5
JUST-TRI-IT
13.9
14.8
15.8
67.8
77.7
0
20
40
60
80
100
Reliable Accuracy (%)
Plurality
Postcondition
CodeT
Majority0.5
JUST-TRI-IT
50.0
52.3
55.1
69.8
74.4
0
20
40
60
80
100
Overall Accuracy (%)
Plurality
Postcondition
CodeT
Majority0.5
JUST-TRI-IT
50.3
52.4
55.5
63.5
67.1
0
20
40
60
80
100
Abstention Rate (%)
JUST-TRI-IT
Majority0.5
Postcondition
CodeT
Plurality
49.1
42.5
11.3
0.8
0.6
Ground Truth (38.8%)
0
20
40
60
80
100
Abstention F1 (%)
Plurality
CodeT
Postcondition
Majority0.5
JUST-TRI-IT
2.4
3.6
20.0
56.1
63.9
0
20
40
60
80
100
Reliable Accuracy (%)
CodeT
Plurality
Postcondition
Majority0.5
JUST-TRI-IT
67.8
69.3
70.7
82.4
88.1
0
20
40
60
80
100
Overall Accuracy (%)
CodeT
Plurality
Postcondition
Majority0.5
JUST-TRI-IT
67.4
69.5
71.3
74.9
77.4
0
20
40
60
80
100
Abstention Rate (%)
JUST-TRI-IT
Majority0.5
Postcondition
Plurality
CodeT
29.7
25.1
1.8
0.6
0.6
Ground Truth (23.1%)
0
20
40
60
80
100
Abstention F1 (%)
Plurality
Postcondition
Majority0.5
JUST-TRI-IT
3.8
11.1
51.2
57.8
Fig. 10. Abstention measures on LCB with GPT-4o (top), DeepSeek-V3 (middle), and Gemini 2.5 Flash (bottom).
6.2
RQ2: Selection & Abstention
While witnesses that bolster confidence in program correctness are valuable, their practical impact
is limited if they exist only for cases where LLMs already solve problems with high confidence—for
example, by producing correct programs with high probability. Thus, we evaluate how semantic
triangulation compares with other techniques in terms of their selection and abstention decisions.
Standard measures like Pass@k [6] do not take into account reliability of selection and abstention
decisions. Instead, we adopted established metrics for evaluating abstention [27] (Figure 8):
• Reliable Accuracy the proportion of correctly solved tasks among those where the method did
not abstain. On problems on which the technique does not abstain, it is identical to Pass@1.
• Overall Accuracy is a comprehensive measure, incorporating abstention decision.
• Abstention Rate represents the proportion of tasks in which the method chooses to abstain.
• Abstention F1-score is a composite metric balancing abstention precision and recall.
Figure 10 summarizes abstention measures for the main configurations3. Only Majority0.5 and
just-tri-it achieve abstention rate comparable to the ground truth, with just-tri-it having higher
abstention rate, and 7% higher reliable accuracy on average. The key difference between Majority0.5
and just-tri-it is that Majority0.5 selects only high-confidence solutions, whereas just-tri-it
can identify low-probability but correct answers. On LCB tasks with GPT-4o, just-tri-it correctly
selected solutions for five problems where Majority0.5 abstained, indicating the potential to reliably
solve hard problems. Accordingly, just-tri-it achieves a 8% higher abstention F1 score. We also
used a task-level paired nonparametric bootstrap with 10,000 resamples over paired task-run results.
Under the 95% percentile bootstrap criterion, just-tri-it outperformed Majority0.5 in both reliable
accuracy (Δ = 0.075, 95% CI [0.025, 0.126]) and abstention F1 (Δ = 0.094, 95% CI [0.032, 0.156]). Both
confidence intervals exclude zero, indicating statistically significant improvements over Majority0.5.
RQ2: just-tri-it’s reliability is, on average, 7% higher than that of the method selecting only
solutions with the probability ≥0.5, while also being able to select correct solutions for tasks
solved with only low probability, resulting in a 8% higher abstention F1 score.
3We excluded Syntactic and OffByOne, as they showed no significant difference compared to plurality.


---

111:20
Dai et al.
0
20
40
60
80
100
Reliable Accuracy (%)
CodeT
Plurality
Postcondition
Majority0.5
JUST-TRI-IT
10.0
13.3
20.8
40.0
44.4
0
20
40
60
80
100
Overall Accuracy (%)
CodeT
Plurality
Postcondition
JUST-TRI-IT
Majority0.5
10.0
12.9
25.9
64.5
64.5
0
20
40
60
80
100
Abstention Rate (%)
Majority0.5
JUST-TRI-IT
Postcondition
Plurality
CodeT
83.9
71.0
11.1
3.2
0.0
Ground Truth (67.7%)
0
20
40
60
80
100
Abstention F1 (%)
Postcondition
JUST-TRI-IT
Majority0.5
16.7
74.4
76.6
0
20
40
60
80
100
Reliable Accuracy (%)
Majority0.5
Plurality
CodeT
Postcondition
JUST-TRI-IT
12.5
13.8
17.2
20.0
30.0
0
20
40
60
80
100
Overall Accuracy (%)
Plurality
CodeT
Postcondition
Majority0.5
JUST-TRI-IT
13.8
17.2
29.2
48.3
56.7
0
20
40
60
80
100
Abstention Rate (%)
Majority0.5
JUST-TRI-IT
Postcondition
Plurality
CodeT
72.4
66.7
16.7
0.0
0.0
Ground Truth (60.0%)
0
20
40
60
80
100
Abstention F1 (%)
Postcondition
Majority0.5
JUST-TRI-IT
26.1
63.4
68.3
0
20
40
60
80
100
Reliable Accuracy (%)
CodeT
Postcondition
Plurality
Majority0.5
JUST-TRI-IT
33.3
45.8
46.2
70.0
76.9
0
20
40
60
80
100
Overall Accuracy (%)
CodeT
Plurality
Postcondition
Majority0.5
JUST-TRI-IT
33.3
48.1
51.9
55.6
63.0
0
20
40
60
80
100
Abstention Rate (%)
Majority0.5
JUST-TRI-IT
CodeT
Postcondition
Plurality
63.0
51.9
11.1
11.1
3.7
Ground Truth (37.0%)
0
20
40
60
80
100
Abstention F1 (%)
CodeT
Plurality
Postcondition
Majority0.5
JUST-TRI-IT
10.0
12.5
31.6
57.1
58.3
Fig. 11. Abstention measures on CEI with GPT-4o (top), DeepSeek-V3 (middle) and Gemini 2.5 Flash (bottom).
6.3
RQ3: Sample Consensus on Inexact Problems
Forming consensus is challenging on inexact problems that admit multiple non-equivalent solutions.
For example, for CEI problems, GPT-4o produces a correct solution with an average probability of
only 0.1. Figure 11 reports the abstention metrics for these models. Compared with the previous
experiment, postconditions outperform plurality voting, likely because plurality is degraded by the
presence of non-equivalent correct solutions. For Majority0.5, the models exhibited varied behavior
on this benchmark: while it remains competitive for GPT-4o and Gemini, its reliability drops to
12.5% for DeepSeek-V3, whose output distribution contains more correlated errors. In contrast, just-
tri-it displays the most consistent performance, achieving the highest reliable accuracy among the
evaluated methods for all three models—10% higher than Majority0.5 on average—while maintaining
comparable abstention F1. Under the task-level paired bootstrap (10,000 resamples), just-tri-it’s
improvements on CEI are statistically significant over Plurality (reliable accuracy Δ = 0.296, 95%
CI [0.165, 0.440]; abstention F1 Δ = 0.662, 95% CI [0.513, 0.745]) and Postcondition (Δ = 0.237,
95% CI [0.111, 0.379]; Δ = 0.431, 95% CI [0.278, 0.586]). The improvement over Majority0.5, while
directionally consistent across all three models, is not statistically significant at this benchmark
size, as 31 tasks provide insufficient statistical power for this comparison. Remarkably, just-tri-it
maintains high reliability while still selecting low-confidence solutions with sampling probabilities
as low as 0.07, as shown in Figure 4.
RQ3: On challenging inexact problems, just-tri-it showed the most consistent performance
across models, achieving on average 10% higher reliable accuracy than a method restricted to
selecting high-confidence solutions (probability threshold 0.5), while maintaining comparable
abstention F1.
6.4
RQ4: Ablation Study
To assess the contribution of each triangulation scheme to just-tri-it’s performance, we counted
the correct selections attributed to each scheme on the combined LCB and CEI results for GPT-
4o (Figure 12). FWD-SINV yielded the most correct selections—likely because most benchmark
problems are exact but do not specify one-to-one input–output mappings—yet every scheme
uniquely solved at least one problem.


---

Reducing Hallucinations in LLM-Generated Code via Semantic Triangulation
111:21
Our theoretical analysis in Section 4 shows the importance of a bijection between equivalence
classes of programs and their witnesses (Theorem 2.1). To confirm this empirically, we investigated
mappings from programs to generated Hoare-style postconditions, since they do not guarantee
such a bijection. Among generated postconditions for LCB that matched at least one program, 15%
failed to distinguish a correct sample from an incorrect one; 36% of these cases led to an incorrect
selection.
1
18
4
3
0
6
5
FWD INV
FWD SINV
ENUM SINV
Fig. 12. Contribution over all LCB
+ CEI problems for GPT-4o, where
a correct selection was made by at
least one triangulation scheme.
Semantic triangulation prevents such situations by design.
To investigate the impact of bijectiveness on just-tri-it, we
removed right-hand-side conjuncts from FWD-INV, FWD-SINV
and ENUM-SINV hyperproperties (e.g., ∀(𝑜,𝑖2), (𝑜′, _) ∈𝑂′....
from Theorem 5.4), breaking Theorem 2.1, and reran the bench-
marks. As a result, the probability of correctness under agree-
ment reduced by 23% on average, which led to the drop of reliable
accuracy by 16%.
RQ4: While each triangulation method contributed to the
selection of correct solutions, FWD-SINV was the most ef-
fective. Postconditions often failed to differentiate between
correct and incorrect solutions due to the lack of a bijective
mapping ensured by semantic triangulation.
6.5
RQ5: Analysis of Failures
To analyse semantic triangulation’s failures to select a correct solution or abstain correctly, we
used an LLM to classify them, and then manually inspected and corrected the classification results.
False positive errors (N2 & N4) are the type of failures that affect reliability. They account for
34% of all failure cases and fall into three categories: correlated errors between the solution to the
transformed problem and the original problem (17%), weak input coverage (15%) and an incorrect
solution to the original problem matched a solution to an incorrectly transformed problem (2%).
The first category was often caused by the fact that LLM solved the inverse problem by using a
forward solution as a subcomponent.
False negative errors (N3 in Figure 8) account for about 66% of all failures and fall into two
categories: the failure to correctly solve the transformed problem (51%) and incorrect transformation
(15%). As mentioned in our theoretical analysis, the transformed problem should not be excessively
difficult compared with the original one. However, since we cannot strictly control the difficulty of
each transformed problem, some problems may become more challenging after transformation
thus exceeding the model’s capability. As for the second, the primary issue lies in the loss of critical
information during problem transformation. For instance, “the maximum value at any time” in the
original problem description may be oversimplified to “the maximum value” in the transformed
one, leading the LLM to misinterpret it as “the maximum value at the final time”. Crucially, these
transformation errors did not compromise reliability, but merely led to extra abstentions.
RQ5: Failures of semantic triangulation are dominated by false negatives (66%), due to extra
difficulty and information loss introduced by transformation, while false positives mainly arise
from correlated errors and weak input coverage.
6.6
RQ6: Time and Token Cost


---

111:22
Dai et al.
Table 2. Average time and tokens across different models.
GPT-4o
DeepSeek-V3
Gemini-2.5-Flash
Method
Time(s) Tokens Time(s) Tokens Time(s)
Tokens
Plurality
24
8835
21
3957
13
7158
Majority0.5
24
8835
21
3957
13
7158
CodeT
87
10798
35
10165
39
8259
Syntactic
39
20902
30
42396
26
64059
OffByOne
34
17561
27
35575
21
57579
Postcondition
56
23073
31
40339
26
59160
FWD_INV
38
34390
34
54530
38
71650
FWD_SINV
132
28701
83
53228
97
64343
ENUM_SINV
183
39630
76
51310
88
88821
Table 2 compares average time over-
head and token usage among various
methods and models. Since the latter six
methods require generating additional
artifacts beyond the original solutions
and tests compared to the first three,
they exhibit at least a twofold increase
in token consumption. In terms of time,
three semantic triangulation methods
are the most computationally expen-
sive, with the majority of the time spent on property validity checking. Furthermore, the average
execution time exhibits an increasing trend from FWD_INV to FWD_SINV and ENUM_SINV,
which directly corresponds to the escalating complexity of hyperproperty checking across these
three methods. Overall, there is a trade-off: plurality is the cheapest but lowest-precision method,
whereas triangulation spends tokens to improve reliability. Crucially, plurality cannot buy back
this precision with a larger token budget – more samples only reinforce the dominant error.
RQ6: Triangulation methods increase code reliability at the expense of a 2.5× increase in time
and 4.9× as many tokens as plurality. Compared with autoformalized specifications, triangulation
only moderately increases the time by 1.5× and consumes 2.1× more tokens.
6.7
RQ7: Empirical Validation of Theoretical Assumptions
Our theoretical analysis relies on assumptions: the correlated errors (Assumption 4), and a more
general dissociative hallucination pattern (Assumption 5). To empirically validate these assumptions,
we analyze program-equivalence-class distributions estimated from task runs, reported in Table 3.
To analyze error correlation, we computed normalized entropy of the distribution over incorrect
equivalence classes (1 is for uniform distribution). The estimated values—0.645 for GPT-4o, 0.569 for
DeepSeek-V3, and 0.397 for Gemini-2.5-Flash—are substantially below one, indicating moderately
concentrated errors. Across model–benchmark task instances, the largest observed equivalence
class is incorrect in 52% of cases. Moreover, among instances in which at least one correct solution
is sampled, an incorrect equivalence class has a higher estimated probability than every correct
class in 12% of cases. These observations provide empirical support for Assumption 4: errors are
often concentrated in a small number of high-probability equivalence classes rather than being
distributed uniformly.
Table 3. Empirical evidence for Assumption 5. Each transforma-
tion cell reports 𝑉𝐶< 𝑉𝐵, the empirical left- and right-hand sides
of Equation (3), aggregated over LCB and CEI.
Source
FWD-INV
FWD-SINV
ENUM-SINV
GPT-4o
0.0000 < 0.0141
0.0015 < 0.0227
0.0000 = 0.0000
DeepSeek-V3
0.0052 < 0.0070
0.0136 < 0.0745
0.0499 < 0.0569
Gemini-2.5-Flash
0.0000 < 0.7288
0.0154 < 0.1028
0.0071 < 0.0800
To assess the dissociative halluci-
nation pattern, for each triangula-
tion transformation we estimate the
two sides of Equation (3): the normal-
ized probability variation over cor-
rect equivalence classes, 𝑉𝐶, and that
over incorrect equivalence classes,𝑉𝐵.
The first three columns of Table 3 report these values in the form 𝑉𝐶< 𝑉𝐵, estimated over the
observed agreement pairs. The inequality holds for eight of the nine model–transformation con-
figurations, indicating that transformations typically perturb the probabilities of incorrect classes
more strongly than those of correct classes. For GPT-4o with ENUM-SINV, both quantities are
zero, because it yielded only 16 valid task transformations, each with a single agreement, so all


---

Reducing Hallucinations in LLM-Generated Code via Semantic Triangulation
111:23
paired normalized masses are identical and both estimated variations are zero. Overall, these results
provide empirical support for Assumption 5.
RQ7: The empirical results support both theoretical assumptions: errors concentrate in a few
high-probability equivalence classes (entropy 0.397–0.645, well below uniform), and transfor-
mations perturb incorrect classes more strongly than correct ones in eight of nine model–
transformation configurations.
7
Threats to Validity & Discussion
External validity. LiveCodeBench and CodeElo are challenging benchmarks widely used to
evaluate the capabilities of state-of-the-art models. A potential threat to external validity is limited
generalization beyond programming-contest problems that form the basis of these benchmarks.
In particular, we model program behaviour as mathematical functions, which is suitable for, e.g.,
algorithm implementations or components of larger systems. For whole projects that maintain state
and interact with users or external systems, a potentially suitable model would represent behavior
as sets of execution traces or transition systems, capturing sequences of requests, side effects,
and state updates. Extending semantic triangulation to such models—for instance, by defining
hyperproperties over traces rather than input-output pairs—is a promising direction for future
work. We evaluated just-tri-it on three models from different families, including a reasoning
model, addressing generalizability.
Transformation correctness and applicability. Our problem transformations are automatically
generated via LLM prompting. Although transformation is significantly easier than solving the
original task—often amounting to simple linguistic reformulation—it can still introduce errors.
However, our analysis in Section 6.5 shows that in the case of such mistakes, when a transformation
is incorrect, triangulation usually simply fails to find agreement, leading to abstentions, and thus
not compromising reliability. Only in 2% of cases it led to the selection of an unreliable program. A
potential approach to mitigate this is to fine-tune a specialized problem-transformation model to
ensure high transformation accuracy.
While our triangulation methods rely on partial problem inversion, not all problems are naturally
inverted. For example, problems requiring implementing boolean predicates may have intractable
input domain to enumerate for each outcome. Similarly, methods presented in this work may be
ineffective for optimization problems, since it is often non-trivial to correctly invert a suboptimal
solution. Specialized, domain-specific triangulation methods may address these limitations.
Internal validity: LLM-generated test inputs. In our method, hyperproperties are evaluated using
LLM-generated inputs, which are not fully dissociated from the code generator. Test-input quality
could therefore affect the effectiveness of property checking. Importantly, all evaluated methods use
the same generated inputs, so this factor does not create bias in their relative comparison. Table 4
reports the characteristics of LLM-generated test inputs. Across models, generated inputs achieve
80.9–86.5% average coverage and 59.2–76.4% distinguishable-test ratio (the fraction of generated
tests that differentiate behaviour of at least two samples), both close to the corresponding oracle-test
values, with 23–24 valid tests per program on average. Together, these statistics indicate that the
generated inputs provide substantial, though not exhaustive, behavioral evidence for checking
hyperproperties.
To investigate whether input- and code-generation failures are correlated, we compute task-level
Spearman correlations between the probability of generating correct code and two proxies for
input quality: coverage and Diff. Ratio (Table 5). Intuitively, tasks with lower code-correctness


---

111:24
Dai et al.
Table 4. Characteristics of LLM-generated test inputs. Paren-
thesized values are measured using oracle tests. Diff. Ratio is
the percentage of generated inputs that distinguish at least
two sampled programs.
Source
Coverage (%) Diff. Ratio (%) Valid Inputs
GPT-4o
86.5 (86.9)
76.4 (73.7)
23 (37)
DeepSeek-V3
86.0 (85.8)
63.8 (62.6)
24 (38)
Gemini-2.5-Flash
80.9 (81.0)
59.2 (58.4)
23 (39)
Table 5. Spearman correlations between the
probability of generating correct code and, re-
spectively, coverage and Diff. Ratio. Asterisks
denote permutation-test significance: *𝑝<
0.05, **𝑝< 0.01, ***𝑝< 0.001.
Source
𝜌cov
𝜌diff
GPT-4o
-0.204**
-0.222**
DeepSeek-V3
-0.095
-0.518***
Gemini-2.5-Flash
-0.303***
-0.527***
probability should also receive lower-quality inputs, yielding positive correlations. We observe
the opposite pattern. Coverage is negatively correlated with correctness for GPT-4o and Gemini-
2.5-Flash, while the correlation is not significant for DeepSeek-V3. Diff. Ratio is negatively and
significantly correlated with correctness for all three models. Thus, there is no evidence that weak
input generation systematically co-occurred with weak code generation.
Table 6. Stability of just-tri-it and Majority0.5 over
three independent reruns on a 50-task subset. Entries
report mean ± standard deviation.
Source
Method
Rel. acc
Overall acc
Abs. F1
GPT-4o
JTI
58.9 ± 1.1
65.9 ± 1.3
71.1 ± 1.8
MV0.5
55.3 ± 2.5
62.4 ± 2.5
57.6 ± 3.5
DeepSeek-V3
JTI
81.5 ± 3.2
68.1 ± 3.2
70.0 ± 4.1
MV0.5
72.4 ± 3.9
66.0 ± 2.4
58.8 ± 2.6
Gemini-2.5-Flash JTI
86.9 ± 1.1
69.6 ± 1.6
53.1 ± 2.2
MV0.5
82.1 ± 0.5
73.1 ± 1.0
50.9 ± 1.6
Statistical conclusion validity. LLM sampling
introduces stochastic variation into all evalu-
ation metrics. Except for reporting task-level
paired bootstrap confidence intervals for the
main comparisons, we also repeat the evalua-
tion on a 50-task subset for three independent
runs (Table 6). The results show that the im-
provements in reliable accuracy and abstention
F1 persist across reruns, although their absolute
magnitude varies by model and benchmark.
8
Related Work
Theoretical Analysis of LLMs: To explain the mechanisms underlying semantic triangulation, we use
a theoretical model of LLM hallucinations (Section 4). No widely accepted LLM model exists: PAC
learning [53] assumes supervised learning with fixed, bounded-complexity concept classes, while
merely assigning LLMs a non-zero error probability is inadequate—it follows from computability
limits [48, 56] and does not explain specific error patterns. Our model is inspired by work on
spurious correlations [58].
Reliability of LLM-Generated Code: Methods for improving LLM-generated code control (1)
inputs, e.g., prompt engineering such as CoT [55], RAG [30], and their enhancements [31]; (2)
inference, e.g., grammar- [41] and type-constrained decoding [40]; or (3) outputs, which is our
focus. Previous plurality-based techniques [14, 46] focus on selection of correct samples, but do not
tackle abstention [27] when no correct programs are present in the sample. Algo [59] generates a
slow reference solution using enumerative search to check against an optimized solution, which
can be considered as a special case of semantic triangulation. Another line of work, e.g., Cycles [10],
self-refines generated code; using triangulation as its refinement signal is a promising direction.
LLM-Based Testing & Verification: LLMs created opportunities to automate testing and verification,
for example, generate Dafny programs with specifications and assertions to automate proofs [38, 39],
and infer postconditions from natural language [13, 37]. For error detection, these methods are
limited because LLMs may repeat program errors in tests and specifications, are less effective at
predicting test outputs than generating code [4, 17], and face hallucination-prone low-resource
specification languages [33]; even human-written Eiffel contracts are as error-prone as code [9]. To
address it, CodeT [5] employs a dual execution agreement between sampled programs and tests.


---

Reducing Hallucinations in LLM-Generated Code via Semantic Triangulation
111:25
Similarly, Huang et al. [22] checked consistency between code, specifications and tests. just-tri-
it significantly outperformed these methods in our experiments, and pinpointed a fundamental
limitation of naive inference of formal specifications—the lack of a bijective mapping between
equivalence classes of solutions and specifications.
Confidence & Uncertainty: Confidence and uncertainty measures [47, 57] can help filter unreliable
LLM outputs, such as incorrect programs. In our experiments, majority voting with a probability
threshold of 0.5—used here as a simple uncertainty proxy—proved dataset-dependent: it was too
permissive on LiveCodeBench and too conservative on CodeElo. Valentin et al. [52] proposed a
theoretically grounded estimator of correctness as an uncertainty measure, but it relies on the
assumption that “if two LLM-generated programs behave differently on the same input, at least
one must be incorrect”. This assumption fails for inexact problems. Our semantic triangulation
approach overcomes this limitation via ENUM-SINV (see Theorem 5.10). ValTest [49] uses a
confidence measure (semantic entropy) to evaluate correctness of generated tests. In contrast, we
generate plausibility witnesses whose agreement increases the likelihood of correctness; confidence
measures such as ValTest’s can further strengthen them.
Metamorphic Testing: Metamorphic testing (MT) [7, 29] evaluates properties across related
programs or executions but does not prescribe the properties or tests; Drowzee [32] encodes
such relations in logic programs to detect hallucinations in general-knowledge QA. Although
triangulation is a special case of MT, it significantly differs from typical MT approaches in its formal
requirements (Theorem 2.1), dissociative transformations and bijection-inducing properties. In our
evaluation, just-tri-it significantly outperformed a metamorphic approach by Wang et al. [54]
that applies non-dissociative transformations (paraphrasing).
Dual Learning: Dual learning [11, 20] exploits intrinsic task symmetry, such as English-French
translation, to form a feedback mechanism for enhanced learning. Our work differs in that we
use problem inversion to decorrelate model errors, rather than providing reinforcement learn-
ing feedback, and we identified and theoretically justified requirements for effectively reducing
hallucinations. These ideas can be potentially applied to dual learning for code models.
9
Conclusion
Semantic triangulation provides a principled, black-box way to raise confidence in LLM-generated
code by checking cross-task solution consistency. Implemented via partial inversion, answer
enumeration, and problem decomposition, it improves reliability measures on LiveCodeBench
and CodeElo—achieving correct selection even at low sampling probabilities and outperforming
auto-formalized specifications. These results highlight triangulation’s value as a robust consensus
mechanism for hard-to-solve, or multi-solution programming tasks.
10
Acknowledgements
This work was supported by the National Natural Science Foundation of China (NSFC) under Grant
No. 92582202. We thank Dimitrios Stamatios Bouras, Haoxiang Jia, Marcel Böhme and Earl T. Barr
for insightful feedback.
References
[1] Jacob Austin, Augustus Odena, Maxwell Nye, Maarten Bosma, Henryk Michalewski, David Dohan, Ellen Jiang, Carrie
Cai, Michael Terry, Quoc Le, et al. 2021. Program synthesis with large language models. arXiv preprint arXiv:2108.07732
(2021).
[2] Emily M Bender, Timnit Gebru, Angelina McMillan-Major, and Shmargaret Shmitchell. 2021. On the dangers of
stochastic parrots: Can language models be too big?. In Conference on fairness, accountability, and transparency.
[3] Dirk Beyer. 2012. Competition on Software Verification: (SV-COMP). In International Conference on Tools and Algorithms
for the Construction and Analysis of Systems. Springer, 504–524.


---

111:26
Dai et al.
[4] Dimitrios Stamatios Bouras, Yihan Dai, Tairan Wang, Yingfei Xiong, and Sergey Mechtaev. 2025. HoarePrompt:
Structural Reasoning About Program Correctness in Natural Language. arXiv preprint arXiv:2503.19599 (2025).
[5] Bei Chen, Fengji Zhang, Anh Nguyen, Daoguang Zan, Zeqi Lin, Jian-Guang Lou, and Weizhu Chen. 2023. CodeT:
Code Generation with Generated Tests. In International Conference on Learning Representations. https://openreview.
net/forum?id=ktrw68Cmu9c
[6] Mark Chen, Jerry Tworek, Heewoo Jun, Qiming Yuan, Henrique Ponde De Oliveira Pinto, Jared Kaplan, Harri Edwards,
Yuri Burda, Nicholas Joseph, Greg Brockman, et al. 2021. Evaluating large language models trained on code. arXiv
preprint arXiv:2107.03374 (2021).
[7] Tsong Yueh Chen, Fei-Ching Kuo, Huai Liu, Pak-Lok Poon, Dave Towey, TH Tse, and Zhi Quan Zhou. 2018. Metamor-
phic testing: A review of challenges and opportunities. Comput. Surveys (2018).
[8] Ştefan Ciobâcă, Dorel Lucanu, Vlad Rusu, and Grigore Roşu. 2014. A language-independent proof system for mutual
program equivalence. In International Conference on Formal Engineering Methods.
[9] Ilinca Ciupa, Alexander Pretschner, Manuel Oriol, Andreas Leitner, and Bertrand Meyer. 2011. On the number and
nature of faults found by random testing. Software Testing, Verification and Reliability 21, 1 (2011), 3–28.
[10] Yangruibo Ding, Marcus J Min, Gail Kaiser, and Baishakhi Ray. 2024. Cycle: Learning to self-refine the code generation.
International Conference on Object-Oriented Programming Systems, Languages, and Applications (2024).
[11] Pierre Dognin, Igor Melnyk, Inkit Padhi, Cicero dos Santos, and Payel Das. 2020. Dualtkb: A dual learning bridge
between text and knowledge base. In Proceedings of the 2020 Conference on Empirical Methods in Natural Language
Processing (EMNLP). 8605–8616.
[12] Marco Eilers and Peter Müller. 2018. Nagini: a static verifier for Python. In International Conference on Computer Aided
Verification. Springer, 596–603.
[13] Madeline Endres, Sarah Fakhoury, Saikat Chakraborty, and Shuvendu K Lahiri. 2024. Can large language models
transform natural language intent into formal method postconditions?. In International Conference on the Foundations
of Software Engineering.
[14] Zhiyu Fan, Haifeng Ruan, Sergey Mechtaev, and Abhik Roychoudhury. 2024. Oracle-guided Program Selection from
Large Language Models. In International Symposium on Software Testing and Analysis.
[15] Shangbin Feng, Weijia Shi, Yike Wang, Wenxuan Ding, Vidhisha Balachandran, and Yulia Tsvetkov. 2024. Don’t
Hallucinate, Abstain: Identifying LLM Knowledge Gaps via Multi-LLM Collaboration. In Annual Meeting of the
Association for Computational Linguistics.
[16] Martin A Fischler and Robert C Bolles. 1981. Random sample consensus: a paradigm for model fitting with applications
to image analysis and automated cartography. Commun. ACM 24, 6 (1981), 381–395.
[17] Luyu Gao, Aman Madaan, Shuyan Zhou, Uri Alon, Pengfei Liu, Yiming Yang, Jamie Callan, and Graham Neubig. 2023.
Pal: Program-aided language models. In International Conference on Machine Learning. PMLR, 10764–10799.
[18] Lars Kai Hansen and Peter Salamon. 2002. Neural network ensembles. IEEE transactions on pattern analysis and
machine intelligence 12, 10 (2002), 993–1001.
[19] Godfrey Harold Hardy, John Edensor Littlewood, and George Pólya. 1952. Inequalities. Cambridge university press.
[20] Di He, Yingce Xia, Tao Qin, Liwei Wang, Nenghai Yu, Tie-Yan Liu, and Wei-Ying Ma. 2016. Dual learning for machine
translation. Advances in neural information processing systems 29 (2016).
[21] Charles Antony Richard Hoare. 1969. An axiomatic basis for computer programming. Commun. ACM 12, 10 (1969),
576–580.
[22] Baizhou Huang, Shuai Lu, Xiaojun Wan, and Nan Duan. 2024. Enhancing large language models in coding through
multi-perspective self-consistency. In Annual Meeting of the Association for Computational Linguistics.
[23] Dong Huang, Jie M Zhang, Michael Luck, Qingwen Bu, Yuhao Qing, and Heming Cui. 2023. Agentcoder: Multi-agent-
based code generation with iterative testing and optimisation. arXiv preprint arXiv:2312.13010 (2023).
[24] Aaron Hurst, Adam Lerer, Adam P Goucher, Adam Perelman, Aditya Ramesh, Aidan Clark, AJ Ostrow, Akila Welihinda,
Alan Hayes, Alec Radford, et al. 2024. GPT-4o System Card. arXiv preprint arXiv:2410.21276 (2024).
[25] Naman Jain, King Han, Alex Gu, Wen-Ding Li, Fanjia Yan, Tianjun Zhang, Sida Wang, Armando Solar-Lezama, Koushik
Sen, and Ion Stoica. 2025. LiveCodeBench: Holistic and Contamination Free Evaluation of Large Language Models for
Code. In International Conference on Learning Representations.
[26] Haoxiang Jia, Robbie Morris, He Ye, Federica Sarro, and Sergey Mechtaev. 2025. Automated Repair of Ambiguous
Natural Language Requirements. arXiv preprint arXiv:2505.07270 (2025).
[27] Elliot Myunghoon Kim, Avi Garg, Kenny Peng, and Nikhil Garg. 2025. Correlated Errors in Large Language Models.
In International Conference on Machine Learning. https://openreview.net/forum?id=kzYq2hfyHB
[28] Lorenz Kuhn, Yarin Gal, and Sebastian Farquhar. 2023. Semantic Uncertainty: Linguistic Invariances for Uncertainty
Estimation in Natural Language Generation. In International Conference on Learning Representations. https://openreview.
net/forum?id=VD-AYtP0dve


---

Reducing Hallucinations in LLM-Generated Code via Semantic Triangulation
111:27
[29] Hyeonseok Lee, Gabin An, and Shin Yoo. 2025. Metamon: Finding inconsistencies between program documentation
and behavior using metamorphic LLM queries. In 2025 IEEE/ACM International Workshop on Large Language Models
for Code (LLM4Code). IEEE, 120–127.
[30] Patrick Lewis, Ethan Perez, Aleksandra Piktus, Fabio Petroni, Vladimir Karpukhin, Naman Goyal, Heinrich Küttler,
Mike Lewis, Wen-tau Yih, Tim Rocktäschel, et al. 2020. Retrieval-augmented generation for knowledge-intensive nlp
tasks. In Conference on Neural Information Processing Systems.
[31] Jia Li, Ge Li, Yongmin Li, and Zhi Jin. 2025. Structured chain-of-thought prompting for code generation. ACM
Transactions on Software Engineering and Methodology 34, 2 (2025), 1–23.
[32] Ningke Li, Yuekang Li, Yi Liu, Ling Shi, Kailong Wang, and Haoyu Wang. 2024. Drowzee: Metamorphic testing
for fact-conflicting hallucination detection in large language models. International Conference on Object-Oriented
Programming Systems, Languages, and Applications (2024).
[33] Zihao Li, Yucheng Shi, Zirui Liu, Fan Yang, Ali Payani, Ninghao Liu, and Mengnan Du. 2025. Language ranker: A
metric for quantifying llm performance across high and low-resource languages. In AAAI Conference on Artificial
Intelligence.
[34] Aixin Liu, Bei Feng, Bing Xue, Bingxuan Wang, Bochao Wu, Chengda Lu, Chenggang Zhao, Chengqi Deng, Chenyu
Zhang, Chong Ruan, et al. 2024. DeepSeek-v3 Technical Report. arXiv preprint arXiv:2412.19437 (2024).
[35] Fang Liu, Yang Liu, Lin Shi, Houkun Huang, Ruifeng Wang, Zhen Yang, Li Zhang, Zhongqi Li, and Yuchi Ma. 2024.
Exploring and evaluating hallucinations in llm-powered code generation. arXiv preprint arXiv:2404.00971 (2024).
[36] Jiawei Liu, Chunqiu Steven Xia, Yuyao Wang, and Lingming Zhang. 2023. Is your code generated by chatgpt really
correct? rigorous evaluation of large language models for code generation. Advances in neural information processing
systems 36 (2023), 21558–21572.
[37] Lezhi Ma, Shangqing Liu, Yi Li, Xiaofei Xie, and Lei Bu. 2025. SpecGen: Automated Generation of Formal Program
Specifications via Large Language Models. In International Conference on Software Engineering.
[38] Md Rakib Hossain Misu, Cristina V Lopes, Iris Ma, and James Noble. 2024. Towards ai-assisted synthesis of verified
dafny methods. In International Conference on the Foundations of Software Engineering.
[39] Eric Mugnier, Emmanuel Anaya Gonzalez, Nadia Polikarpova, Ranjit Jhala, and Zhou Yuanyuan. 2025. Laurel: Un-
blocking automated verification with large language models. International Conference on Object-Oriented Programming
Systems, Languages, and Applications.
[40] Niels Mündler, Jingxuan He, Hao Wang, Koushik Sen, Dawn Song, and Martin Vechev. 2025. Type-Constrained Code
Generation with Language Models. In Conference on Programming Language Design and Implementation.
[41] Kanghee Park, Jiayu Wang, Taylor Berg-Kirkpatrick, Nadia Polikarpova, and Loris D’Antoni. 2024. Grammar-aligned
decoding. In Conference on Neural Information Processing Systems.
[42] Hammond Pearce, Baleegh Ahmad, Benjamin Tan, Brendan Dolan-Gavitt, and Ramesh Karri. 2022. Asleep at the
Keyboard? Assessing the Security of GitHub Copilot’s Code Contributions. In Symposium on Security and Privacy.
[43] Shanghaoran Quan, Jiaxi Yang, Bowen Yu, Bo Zheng, Dayiheng Liu, An Yang, Xuancheng Ren, Bofei Gao, Yibo
Miao, Yunlong Feng, Zekun Wang, Jian Yang, Zeyu Cui, Yang Fan, Yichang Zhang, Binyuan Hui, and Junyang Lin.
2025. CodeElo: Benchmarking Competition-level Code Generation of LLMs with Human-comparable Elo Ratings.
arXiv:2501.01257 [cs.CL] https://arxiv.org/abs/2501.01257
[44] Chen Shani, Dan Jurafsky, Yann LeCun, and Ravid Shwartz-Ziv. 2025. From tokens to thoughts: How LLMs and
humans trade compression for meaning. arXiv preprint arXiv:2505.17117 (2025).
[45] Aleksandr Shefer, Igor Engel, Stanislav Alekseev, Daniil Berezun, Ekaterina Verbitskaia, and Anton Podkopaev. 2025.
Can LLMs Enable Verification in Mainstream Programming? arXiv preprint arXiv:2503.14183 (2025).
[46] Freda Shi, Daniel Fried, Marjan Ghazvininejad, Luke Zettlemoyer, and Sida I. Wang. 2022. Natural Language to Code
Translation with Execution. In Conference on Empirical Methods in Natural Language Processing.
[47] Claudio Spiess, David Gros, Kunal Suresh Pai, Michael Pradel, Md Rafiqul Islam Rabin, Amin Alipour, Susmit Jha,
Prem Devanbu, and Toufique Ahmed. 2025. Calibration and Correctness of Language Models for Code. In International
Conference on Software Engineering.
[48] Atsushi Suzuki, Yulan He, Feng Tian, and Zhongyuan Wang. 2025. Hallucinations are inevitable but can be made
statistically negligible. The" innate" inevitability of hallucinations cannot explain practical LLM issues. arXiv preprint
arXiv:2502.12187 (2025).
[49] Hamed Taherkhani and Hadi Hemmati. 2024. Valtest: Automated validation of language model generated test cases.
arXiv preprint arXiv:2411.08254 (2024).
[50] Codeforces Team. 2025. Codeforces. https://codeforces.com/
[51] Kagan Tumer and Joydeep Ghosh. 1996. Error correlation and error reduction in ensemble classifiers. Connection
science 8, 3-4 (1996), 385–404.
[52] Thomas Valentin, Ardi Madadi, Gaetano Sapia, and Marcel Böhme. 2025. Incoherence as Oracle-less Measure of Error
in LLM-Based Code Generation. AAAI Conference on Artificial Intelligence (2025).


---

111:28
Dai et al.
[53] Leslie Valiant. 2013. Probably approximately correct: nature’s algorithms for learning and prospering in a complex world.
Basic Books.
[54] Xiaoyin Wang and Dakai Zhu. 2024. Validating LLM-generated programs with metamorphic prompt testing. arXiv
preprint arXiv:2406.06864 (2024).
[55] Jason Wei, Xuezhi Wang, Dale Schuurmans, Maarten Bosma, Fei Xia, Ed Chi, Quoc V Le, Denny Zhou, et al. 2022.
Chain-of-thought prompting elicits reasoning in large language models. In Conference on Neural Information Processing
Systems.
[56] Ziwei Xu, Sanjay Jain, and Mohan Kankanhalli. 2024. Hallucination is inevitable: An innate limitation of large language
models. arXiv preprint arXiv:2401.11817 (2024).
[57] Fanghua Ye, Mingming Yang, Jianhui Pang, Longyue Wang, Derek Wong, Emine Yilmaz, Shuming Shi, and Zhaopeng
Tu. 2024. Benchmarking llms via uncertainty quantification. Advances in Neural Information Processing Systems (2024).
[58] Wenqian Ye, Guangtao Zheng, Xu Cao, Yunsheng Ma, and Aidong Zhang. 2024. Spurious correlations in machine
learning: A survey. arXiv preprint arXiv:2402.12715 (2024).
[59] Kexun Zhang, Danqing Wang, Jingtao Xia, William Yang Wang, and Lei Li. 2023. Algo: Synthesizing algorithmic
programs with generated oracle verifiers. In Conference on Neural Information Processing Systems.
[60] Yuqi Zhu, Jia Li, Ge Li, YunFei Zhao, Jia Li, Zhi Jin, and Hong Mei. 2024. Hot or Cold? Adaptive Temperature Sampling
for Code Generation with Large Language Models. In AAAI Conference on Artificial Intelligence.


---

Reducing Hallucinations in LLM-Generated Code via Semantic Triangulation
111:29
A
Proof for Proposition 4.3
Proof. Assume semantic triangulation (𝜏,𝜙) is defined as in the proof of Theorem 4.2 and in
accordance with Assumption 5. Continuing the derivation for E𝑑∼Unif ([𝑑]≃) (ΔP) in Equation (2),
E𝑑∼Unif ([𝑑]≃)

𝜋𝑐𝜋𝜎(𝑐)
Í
𝑖
𝜋𝑖𝜋𝜎(𝑖)
−
𝜋2
𝑐
Í
𝑖
𝜋2
𝑖

=
1
|[𝑑]≃|
∑︁
𝑐∈𝐶𝑑
©­
«
𝜋𝑐𝜋𝜎(𝑐)
Í
𝑖
𝜋𝑖𝜋𝜎(𝑖)
−
𝜋2
𝑐
Í
𝑖
𝜋2
𝑖
ª®
¬
=
1
|[𝑑]≃|
©­
«
Í
𝑐∈𝐶𝑑𝜋𝑐𝜋𝜎(𝑐)
Í
𝑖
𝜋𝑖𝜋𝜎(𝑖)
−
Í
𝑐∈𝐶𝑑𝜋2
𝑐
Í
𝑖
𝜋2
𝑖
ª®
¬
=
1
|[𝑑]≃|
©­­
«
1
1 +
Í
𝑏∈𝐵𝑑𝜋𝑏𝜋𝜎(𝑏)
Í
𝑐∈𝐶𝑑𝜋𝑐𝜋𝜎(𝑐)
−
1
1 +
Í
𝑏∈𝐵𝑑𝜋2
𝑏
Í
𝑐∈𝐶𝑑𝜋2𝑐
ª®®
¬
In order that this quantity gets positive, it suffices to have
Í
𝑏∈𝐵𝑑𝜋𝑏𝜋𝜎(𝑏)
Í
𝑐∈𝐶𝑑𝜋𝑐𝜋𝜎(𝑐)
<
Í
𝑏∈𝐵𝑑𝜋2
𝑏
Í
𝑐∈𝐶𝑑𝜋2𝑐
in turn,
Í
𝑏∈𝐵𝑑𝜋𝑏𝜋𝜎(𝑏)
Í
𝑏∈𝐵𝑑𝜋2
𝑏
<
Í
𝑐∈𝐶𝑑𝜋𝑐𝜋𝜎(𝑐)
Í
𝑐∈𝐶𝑑𝜋2𝑐
yet in turn,
Í
𝑏∈𝐵𝑑(𝜋𝑏−𝜋𝜎(𝑏))2
Í
𝑏∈𝐵𝑑𝜋2
𝑏
>
Í
𝑐∈𝐶𝑑(𝜋𝑐−𝜋𝜎(𝑐))2
Í
𝑐∈𝐶𝑑𝜋2𝑐
having in mind an equality like (𝑎2 + 𝑏2 + 𝑐2) −(𝑎𝑏+ 𝑏𝑐+ 𝑐𝑎) = 1
2 ((𝑎−𝑏)2 + (𝑏−𝑐)2 + (𝑐−𝑎)2).
This is exactly the requirement of a dissociative pattern from Assumption 5.
□
B
Problem Decomposition
Problems involving non-trivial data structures are hard for LLMs to invert. To simplify inversion, we
apply a domain-specific decomposition. In particular, we define a triangulation method STREAM for
stateless stream-processing problems, i.e., that process sequences of elements without depending on
global state. We designate solutions to such problems 𝑝: Seq[𝐼] →Seq[𝑂]. Let [·] be a sequence
constructor, head : Seq[𝐼] →𝐼return the first element of a sequence.
Proposition B.1 (STREAM). Let 𝑑be a stateless stream-processing problem, (𝜏,𝜙) be semantic
triangulation, 𝜏◦transform a stateless stream-processing problem into a corresponding pointwise
problem that processes individual elements. Let the hyperproperty 𝜓be defined as
𝜙(𝑝◦,𝑞) ∧∀[𝑖1, · · · ,𝑖𝑛] ∈Seq[𝐼]. 𝑝([𝑖1, · · · ,𝑖𝑛]) = [𝑝◦(𝑖1), · · · , 𝑝◦(𝑖𝑛)]
where 𝑝is a sample for 𝑑, 𝑝◦≜𝑖↦→head(𝑝([𝑖])). If 𝜏is dissociative, then (𝜏◦𝜏◦,𝜓) is semantic
triangulation. We refer to this triangulation meta-method as STREAM.
Proof. A proof that𝜓is bijection-inducing and correctness-coupling is mechanized in Lean.
□
Effectively, STREAM applies a given triangulation method pointwise and then triangulates the lifting
from pointwise to sequence-level processing. This demonstrates the modularity of triangulation.


---

111:30
Dai et al.
⟨Σ,𝑡⟩⇒𝑠
⟨Σ, 𝑝(𝑡)⟩⇒exec(𝑝,𝑠) exec
⟨Σ,𝑡1⟩⇒𝑠1
⟨Σ,𝑡2⟩⇒𝑠2
⟨Σ,𝑡1 ∨𝑡2⟩⇒𝑠1 ∨𝑠2
or
⟨Σ,𝑡1⟩⇒𝑠1
⟨Σ,𝑡2⟩⇒𝑠2
⟨Σ,𝑡1 = 𝑡2⟩⇒𝑠1 = 𝑠2
eq
⟨Σ, 𝑣⟩⇒𝑠
⟨Σ,𝑡⟩⇒𝑉
⟨Σ, 𝑣∈𝑡⟩⇒𝑠∈𝑉
in
⟨Σ,𝑡⟩⇒𝑠
⟨Σ, 𝑝(𝑡)⟩⇒𝑠exec_s
⟨Σ,𝑡⟩⇒D
⟨Σ,𝑡∨_⟩⇒D or_d
⟨Σ,𝑡1⟩⇒A
⟨Σ,𝑡2⟩⇒D
⟨Σ,𝑡1 ∨𝑡2⟩⇒A
or_a
⟨Σ,𝑡1⟩⇒U
⟨Σ,𝑡2⟩⇒?
? ∉{A, D}
⟨Σ,𝑡1 ∨𝑡2⟩⇒U
or_u
⟨Σ,𝑡⟩⇒D
⟨Σ,𝑡= _⟩⇒D eq_d
⟨Σ,𝑡1⟩⇒U
⟨Σ,𝑡2⟩⇒U
⟨Σ,𝑡1 = 𝑡2⟩⇒True
eq_uu
⟨Σ,𝑡1⟩⇒A
⟨Σ,𝑡2⟩⇒D
⟨Σ,𝑡1 = 𝑡2⟩⇒A
eq_a
⟨Σ,𝑡1⟩⇒U
⟨Σ,𝑡2⟩⇒𝑠
⟨Σ,𝑡1 = 𝑡2⟩⇒U
eq_u
⟨Σ, 𝑣⟩⇒𝑠
⟨Σ,𝑡⟩⇒𝑉∗
𝑠∈𝑉∗
⟨Σ, 𝑣∈𝑡⟩⇒True
in_inf
⟨Σ, 𝑣⟩⇒𝑠
⟨Σ,𝑡⟩⇒𝑉∗
𝑠∉𝑉∗
⟨Σ, 𝑣∈𝑡⟩⇒A
in_inf_a
⟨Σ, 𝑣⟩⇒U
⟨Σ,𝑡⟩⇒U
⟨Σ, 𝑣∈𝑡⟩⇒True
in_uu
⟨Σ, 𝑣⟩⇒?1
⟨Σ,𝑡⟩⇒?2
{?1, ?2} ∪𝑆≠∅∧{?1, ?2} \ {U} ≠∅
⟨Σ, 𝑣∈𝑡⟩⇒↑({?1, ?2})
in_s
⟨Σ,𝑡1⟩⇒{𝑠𝑖}𝑖
∀𝑖. ⟨Σ[𝑣↦→𝑠𝑖],𝑡2⟩⇒?𝑖
⟨Σ, ∀𝑣∈𝑡1. 𝑡2⟩⇒∀𝑖. ?𝑖∈{A, True} ∧|{?𝑖|?𝑖= A}𝑖| < 𝑇forall
⟨Σ,𝑡⟩⇒𝑠
⟨Σ, ∀𝑣∈𝑡. _⟩⇒𝑠= A forall_s
Fig. 13. Operational semantics of property checking. The first four rules (exec, or, eq, in) handle normal
values; the remaining rules handle errors and infinite sets. Here ⇒—the evaluation relation, Σ—a variable
assignment, 𝑡—a term, 𝑥—a variable, 𝑆—all special values {A, U, D}, 𝑠—a special value, D—any value except
for D, 𝑠—a non-special value, 𝑉—a finite set of non-special values, 𝑉∗—a marked subset of an unknown
set of non-special values, 𝑝—a program, exec—an execution procedure, ?—any value or set, ↑selects the
“strongest” special value, where D is stronger than A and A is stronger than U, 𝑇—threshold parameter.
Logical connectives are handled analogously to ∨, all rules respect commutativity.
C
Operational Semantics for Practical Property Checking and an Example
We augment the semantics of hyperproperties by introducing three special values: the angelic
value A, the demonic value D, and the undefined value U, and extended the domains of all
property components (functions, predicates and logical connectives) as defined in Figure 13. First, if
a program fails with ValueError, indicating an invalid input, we set its output to U; if it fails with
other errors or timeout, then we treat its output as D. Second, we introduce a function “tolerate”
that is an identity on all values except for U where it returns A; we use it to tolerate invalid
inputs when their consistency with witnesses cannot be ensured, i.e. 𝑞(tolerate(𝑝(𝑖1,𝑖2)),𝑖2) = 𝑖1 in
Theorem 5.4. Third, when dealing with infinite sets, as shown in rule in_inf_a, we treat the result
of membership check as angelic if the value is not in the returned subset. Finally, we ensure that
we only interpret the result of universal quantification as True when there is sufficient evidence,
embodied in a threshold for the maximum number of accepted angelic values in rule FORALL. An
example of applying these rules is given in below. This design balances the need for strict property
enforcement with the practical reality that validity of inputs cannot be precisely identified, and
some transformed problems require computing infinite sets.
Here, we present an example derivation for the ENUM-SINV hyperproperty under the Figure 13
semantics for the programs in Figure 7. Assume we have the following programs: 𝑝≜𝑖↦→
{𝑖+1, 𝑖+2},
𝑞≜𝑜↦→{𝑜−1, 𝑜−2}. The property consists of two conjunctive clauses, per input:
𝐿1(𝑖) :
∀𝑜∈𝑝(𝑖). 𝑖∈𝑞(𝑜),
𝐿2(𝑜) :
∀𝑖′ ∈𝑞(𝑜). 𝑜∈𝑝(𝑖′).
Executions may yield special values U (invalid/undefined), A (angelic), and D (demonic crash/-
failure) with precedence D > A > U. The rule forall uses a threshold 𝑇to tolerate a bounded
number of A branches; if |{A𝑖}| < 𝑇it returns True, otherwise it fails.


---

Reducing Hallucinations in LLM-Generated Code via Semantic Triangulation
111:31
The following example derivation is for 𝐿1(−1):
⟨Σ, 𝑝(−1)⟩⇒{0, 1}
⟨Σ, −1⟩⇒−1
⟨Σ, 𝑞(0)⟩⇒{−1, −2}
⟨Σ, −1 ∈𝑞(0)⟩⇒True
in
⟨Σ, −1⟩⇒−1
⟨Σ, 𝑞(1)⟩⇒{0, −1}
⟨Σ, −1 ∈𝑞(1)⟩⇒True
in
⟨Σ, ∀𝑜∈𝑝(−1). −1 ∈𝑞(𝑜)⟩⇒True
forall
Imagine now that the LLM decided that it is intractable to enumerate all input values for the
set-valued inverse function, and instead produces only the largest such number, i.e.𝑞≜𝑜↦→{𝑜−1}∗.
In this case, the derivation will change as follows:
...
⟨Σ, −1⟩⇒−1
⟨Σ, 𝑞(0)⟩⇒{−1}∗
⟨Σ, −1 ∈𝑞(0)⟩⇒True
in_inf
⟨Σ, −1⟩⇒−1
⟨Σ, 𝑞(1)⟩⇒{0}∗
⟨Σ, −1 ∈𝑞(1)⟩⇒A
in_inf_a
⟨Σ, ∀𝑜∈𝑝(−1). −1 ∈𝑞(𝑜)⟩⇒False
forall
That is, the property check will fail, because the number of angelic values A in forall rule
exceeds our threshold 1
3, indicating insufficient evidence of validity in the presence of intractable
enumeration.
D
Choosing Hyperparameters
Model Temperature Setting. Essentially, as the model’s temperature approaches 0, its outputs for
the same prompt become highly concentrated, yielding more conservative and repetitive samples.
Raising the temperature increases sampling variability, which can produce more creative outputs
(at the cost of greater randomness), a trade-off that is often necessary for challenging inputs [60].
Since the two datasets we use (LCB and CEI) consist of recent competition problems and are quite
challenging (as also evident in Figure 2 with a high proportion of problems that can’t be solved over
100 trials), we need the model to explore a broader range of possibilities. Thus, the temperature
was set to a relatively high value, 1.0, which is usually the default temperature for API calls.
5
10
15
20
25
30
35
40
45
50
Program Sample Size
1.2
1.4
1.6
1.8
2.0
2.2
2.4
Entropy
1.22308
1.62108
1.88769
2.02761
2.13959
2.23000
2.25200
2.30042
2.32416
2.38431
Fig. 14. Semantic entropy of distribution of pro-
gram equivalence classes with sample size for
GPT-4o across 175 LCB problems.
Sample Size Setting. As noted earlier, the plausi-
bility witnesses underlying Plurality (and its special
case, Majority0.5) that we compare against are de-
rived from the semantic equivalence relation over
programs. Therefore, to enable a fair evaluation,
when choosing the sample size, we require the distri-
bution over program equivalence classes to exhibit
statistical stability. To assess this stability, we use
semantic entropy [28], defined as follows:
SE 𝑚≡( · | 𝑥) ≜−Í
𝑦𝑚≡(𝑦| 𝑥) log𝑚≡(𝑦| 𝑥),
where 𝑚≡is the conditional distribution over equiv-
alence classes.
Varying the sample size from 5 to 50 in steps of 5,
we show in Figure 14 the resulting entropy change
on the 175 LCB problems using GPT-4o (temperature=1.0). It is observed that the entropy increases
rapidly from 1.22 (N=5) to 2.23 (N=30), after which the growth becomes markedly slower. Therefore,
as a practical trade-off between precision and cost, we select a sample size of 30.


---

111:32
Dai et al.
E
RQ1 Result for DeepSeek-V3 and Gemini 2.5 Flash
The figures below shows the probability of correctness under agreement for various methods with
DeepSeek-V3 and Gemini 2.5 Flash, mirroring the trends observed with GPT-4o, albeit with a
smaller gap.
ENUM-SINV
FWD-SINV
FWD-INV
Syntactic
OﬀByOne
Postcondition
Another solution
Test
Unconditional
0
20
40
60
80
100
Probability (%)
95.3
88.6
83.1
75.4
73.2
70.7
68.2
55.5
42.2
FWD-INV
ENUM-SINV
FWD-SINV
OﬀByOne
Postcondition
Syntactic
Another solution
Test
Unconditional
0
20
40
60
80
100
Probability (%)
98.8
91.3
89.3
84.0
83.3
83.0
82.4
72.7
60.3
Fig. 15. The probability of DeepSeek-V3 (left) and Gemini 2.5 Flash (right) sample correctness under agreement
for different methods across 175 LCB problems. “Unconditional” refers to the probability of correctness
irrespective of an agreement.
F
Lean Proof
This appendix gives the Lean mechanization of the semantic triangulation framework and the
concrete triangulation instances used in the paper. Table 7 maps paper results to Lean declarations.
Table 7. Correspondence between paper results and Lean declarations.
Paper result
Lean declaration
Definition 2.1
Triangulation
Auxiliary result
pluralityTriangulation
Proposition 5.2
tri_FULL_FWD_INV
Proposition 5.4
tri_partial_FWD_INV
Proposition 5.6
tri_FWD_SINV
Proposition 5.8
triang_PARTIAL_FWD_SINV
Proposition 5.10
tri_Full_ENUM_SINV
Proposition 5.11
tri_Partial_ENUM_SINV
Proposition B.1
triangulation_STREAM
Semantic triangulation framework
import Mathlib.Data.Set.Basic
/- Definition 2.1 -/
-- D: type of problem descriptions
-- P: type of "forward" programs (solve D)
-- Q: type of "transformed" programs (solve T D)
structure Triangulation (D D' P Q : Type) where
T
: D →D'
Phi
: P →Q →Prop
/-semantic equivalence on the original side -/
EP
: Setoid P
/- Injectivity on classes: if the same q matches two p’s by Φ, then those two p’s are EP-equivalent. -/
injective
:
∀{p1 p2 q}, Phi p1 q →Phi p2 q →EP.r p1 p2
/- Surjectivity on classes (onto the relevant image): for every q we can find a p with Φ -/


---

Reducing Hallucinations in LLM-Generated Code via Semantic Triangulation
111:33
surjective :
∀q, ∃p, Phi p q
/-- Existence of a mate for every p. -/
totality
:
∀p, ∃q, Phi p q
/-- Correctness predicates (what it means to "solve" a task). -/
CorrectP : D →P →Prop
CorrectQ : D' →Q →Prop
/- Correctness coupling : if q correctly solves T d and Φ(p,q) holds,
then p correctly solves d. -/
correctness_coupling :
∀{d p q}, CorrectQ (T d) q →Phi p q →CorrectP d p
Auxiliary result: triangulation generalizes plurality
/-
Auxiliary result - triangulation generalizes plurality
-/
-- We will need that correctness is stable under ≡on P. if p ≡q,both correct or incorrect
def CorrectRespects (D P : Type) (EP : Setoid P)
(Correct : D →P →Prop) : Prop :=
∀{d p q}, EP.r p q →(Correct d p ↔Correct d q)
def pluralityTriangulation
(D P : Type)(EP : Setoid P)(Correct : D →P →Prop)(resp : CorrectRespects D P EP Correct)
: Triangulation D D P P :=
{ T := id , Phi := fun p q => EP.r p q , EP
:= EP ,
injective := by
intro p1 p2 q h1 h2
-- h1: Phi p1 q (p1 ≡q) , h2: Phi p2 q (p2 ≡q)
exact EP.trans h1 (EP.symm h2),
surjective := by
intro q;
exact ⟨q, EP.refl q⟩,
totality := by
intro p;
exact ⟨p, EP.refl p⟩,
CorrectP := Correct, CorrectQ := fun d' p => Correct d' p ,
correctness_coupling := by
intro d p q hQ hPhi
have hiff := resp (d:=d) (p:=p) (q:=q) hPhi
-- hiff : Correct d p ↔Correct d q
-- from Correct d q, conclude Correct d p
exact Iff.mpr hiff hQ }
Proposition 5.2: Full FWD-INV
/-
Proposition 5.2 – Full FWD_INV
-/
section Full_FWD_INV
variable {A B : Type}
abbrev Spec (A B : Type) := A →B →Prop
def T_inv (R : Spec A B) : Spec B A := fun b a => R a b
def CorrectF (R : Spec A B) (e : Equiv A B) : Prop := ∀a, R a (e a)
def CorrectG (R' : Spec B A) (e' : Equiv B A) : Prop := ∀b, R' b (e' b)
def tri_FULL_FWD_INV
: Triangulation (Spec A B) (Spec B A) (Equiv A B) (Equiv B A) :=


---

111:34
Dai et al.
{ T := T_inv, Phi := fun e e' => e' = e.symm
, EP :=
{ r := fun (e1 e2 : Equiv A B) => e1 = e2
, iseqv := by
refine ⟨?refl, ?symm, ?trans⟩
· intro x; rfl
· intro x y h; simpa using h.symm
· intro x y z h1 h2; simpa using h1.trans h2
}
, injective := by
intro e1 e2 e' h1 h2
have h : e2 = e1 := by
simpa [h2] using congrArg Equiv.symm h1
exact h.symm
, surjective := by
intro e'
exact ⟨e'.symm, rfl⟩
, totality := by
intro e
exact ⟨e.symm, rfl⟩
, CorrectP := fun R e => CorrectF R e
, CorrectQ := fun R' e' => CorrectG R' e'
, correctness_coupling := by
intro R e e' hG hPhi a
subst hPhi
simpa using hG (e a)
}
end Full_FWD_INV
Proposition 5.4: Partial FWD-INV
/-
Proposition 5.4 – Partial FWD_INV
-/
section Partial_FWD_INV
variable {I1 I2 O : Type}
def T_inv1 (d : Spec (I1 × I2) O) : Spec (O × I2) I1 :=
fun (oi : O × I2) (i1 : I1) => d (i1, oi.2) oi.1
abbrev PFwd (I1 I2 O : Type) := I2 →Equiv I1 O
abbrev PInv (I1 I2 O : Type) := I2 →Equiv O I1
def setoidPFwd {I1 I2 O : Type} : Setoid (PFwd I1 I2 O) where
r p1 p2 := ∀i2 i1, (p1 i2) i1 = (p2 i2) i1
iseqv := {
refl := fun _ _ _ => rfl
symm := fun h i2 i1 => (h i2 i1).symm
trans := fun h1 h2 i2 i1 => (h1 i2 i1).trans (h2 i2 i1)
}
def Phi_partial (p : PFwd I1 I2 O) (q : PInv I1 I2 O) : Prop :=
∀i1 i2, (q i2) ((p i2) i1) = i1
def CorrectP (d : Spec (I1 × I2) O) (p : PFwd I1 I2 O) : Prop :=
∀i1 i2, d (i1, i2) ((p i2) i1)
def CorrectQ (d' : Spec (O × I2) I1) (q : PInv I1 I2 O) : Prop :=
∀o i2, d' (o, i2) ((q i2) o)
def tri_partial_FWD_INV
: Triangulation (Spec (I1 × I2) O) (Spec (O × I2) I1) (PFwd I1 I2 O) (PInv I1 I2 O) :=
{ T := T_inv1, Phi := Phi_partial, EP := setoidPFwd


---

Reducing Hallucinations in LLM-Generated Code via Semantic Triangulation
111:35
, injective := by
intro p1 p2 q h1 h2 i2 i1
have inj : Function.Injective (q i2) := (q i2).injective
have e : (q i2) ((p1 i2) i1) = (q i2) ((p2 i2) i1) := by
calc
(q i2) ((p1 i2) i1) = i1 := h1 i1 i2
_ = (q i2) ((p2 i2) i1) := (h2 i1 i2).symm
exact inj e
, surjective := by
intro q
refine ⟨(fun i2 => (q i2).symm), ?_⟩
intro i1 i2
exact Equiv.apply_symm_apply (q i2) i1
, totality := by
intro p
refine ⟨(fun i2 => (p i2).symm), ?_⟩
intro i1 i2
exact Equiv.symm_apply_apply (p i2) i1
, CorrectP := CorrectP, CorrectQ := CorrectQ
, correctness_coupling := by
intro d p q hQ hPhi i1 i2
have := hQ ((p i2) i1) i2
simpa [T_inv1, hPhi i1 i2] using this
}
end Partial_FWD_INV
Proposition 5.6: Full FWD-SINV
/-
Proposition 5.6 – Full FWD_SINV
-/
section Full_FWD_SINV
variable {I O : Type}
def T_swap (d : Spec I O) : Spec O I := fun o i => d i o
structure SINV (I O : Type) where
q
: O →Set I
cover
: ∀i : I, ∃o : O, i ∈q o
unique : ∀i o1 o2, i ∈q o1 →i ∈q o2 →o1 = o2
def setoidFun (X Y : Type) : Setoid (X →Y) where
r f g := ∀x, f x = g x
iseqv :=
{ refl
:= by intro f x; rfl
symm
:= by intro f g h x; simpa using (h x).symm
trans := by intro f g h h1 h2 x; exact (h1 x).trans (h2 x) }
-- 𝜑:L1 ∧L2
def Phi_SINV (p : I →O) (q : SINV I O) : Prop :=
(∀i, i ∈q.q (p i)) ∧(∀i i', i' ∈q.q (p i) →p i' = p i)
def CorrectPSINV (d : Spec I O) (p : I →O) : Prop :=
∀i, d i (p i)
def CorrectQSINV (d' : Spec O I) (q : SINV I O) : Prop :=
∀o i, i ∈q.q o →d' o i
def sinvOfP (p : I →O) : SINV I O :=
{ q := fun o => { i | p i = o }
, cover := by
intro i; exact ⟨p i, rfl⟩
, unique := by
intro i o1 o2 hi1 hi2
-- hi1 : p i = o1, hi2 : p i = o2
exact hi1.symm.trans hi2 }


---

111:36
Dai et al.
noncomputable def pOfSINV (q : SINV I O) : I →O :=
fun i => Classical.choose (q.cover i)
lemma pOfSINV_L1 (q : SINV I O) :
∀i, i ∈q.q (pOfSINV q i) := by
intro i
exact Classical.choose_spec (q.cover i)
lemma pOfSINV_L2 (q : SINV I O) :
∀i i', i' ∈q.q (pOfSINV q i) →pOfSINV q i' = pOfSINV q i := by
intro i i' hi'
have hi'cov : i' ∈q.q (pOfSINV q i') := pOfSINV_L1 q i'
have := q.unique i' (pOfSINV q i') (pOfSINV q i) hi'cov hi'
simp [this]
def tri_FWD_SINV
: Triangulation (Spec I O) (Spec O I) (I →O) (SINV I O) :=
{ T := T_swap, Phi := Phi_SINV, EP := setoidFun I O
, injective := by
intro p1 p2 q h1 h2 i
have hi1 : i ∈q.q (p1 i) := h1.left i
have hi2 : i ∈q.q (p2 i) := h2.left i
exact q.unique i (p1 i) (p2 i) hi1 hi2
, surjective := by
intro q
refine ⟨pOfSINV q, ?_⟩
refine ⟨?_, ?_⟩
· exact pOfSINV_L1 q
· exact pOfSINV_L2 q
, totality := by
intro p
refine ⟨sinvOfP p, ?_⟩
constructor
· intro i
-- i ∈{ i | p i = p i }
simp [sinvOfP]
· intro i i' hi'
-- hi' : p i' = p i
simpa [sinvOfP] using hi'
, CorrectP := CorrectPSINV, CorrectQ := CorrectQSINV
, correctness_coupling := by
intro d p q hQ hPhi i
have hi : i ∈q.q (p i) := hPhi.left i
simpa [T_swap] using hQ (p i) i hi
}
end Full_FWD_SINV
Proposition 5.8: Partial FWD-SINV
/-
Proposition 5.8 – Partial FWD_SINV
-/
namespace PARTIAL_FWD_SINV
variable {A Y B : Type}
abbrev Fwd
(A Y B : Type) := A →Y →B
abbrev SINV
(A Y B : Type) := B →Y →Set A
abbrev SpecPSINV (A Y B : Type) := B →Y →Set A →Prop
abbrev Spec (A Y B : Type) := A →Y →B →Prop
def T_pfib_partial (R : Spec A Y B) : SpecPSINV A Y B :=
fun b y S => ∀x, x ∈S →R x y b
def Phi_pSINV (f : Fwd A Y B) (g : SINV A Y B) : Prop :=


---

Reducing Hallucinations in LLM-Generated Code via Semantic Triangulation
111:37
(∀x y, x ∈g (f x y) y) ∧
(∀x y x', x' ∈g (f x y) y →f x' y = f x y)
structure Resonator (A Y B : Type) where
g
: SINV A Y B
spec : ∃f : Fwd A Y B, Phi_pSINV f g
unique : ∀(y : Y) (x : A) (b1 b2 : B), x ∈g b1 y →x ∈g b2 y →b1 = b2
def EP_Fwd2 : Setoid (Fwd A Y B) :=
{ r := fun f1 f2 => ∀x y, f1 x y = f2 x y,
iseqv := ⟨(fun _ _ _ => rfl), (fun h x y => (h x y).symm),
(fun h1 h2 x y => (h1 x y).trans (h2 x y))⟩}
def CorrectF2 (R : Spec A Y B) (f : Fwd A Y B) : Prop :=
∀x y, R x y (f x y)
def CorrectG2 (R' : SpecPSINV A Y B) (g : Resonator A Y B) : Prop :=
∀b y, R' b y (g.g b y)
def triang_PARTIAL_FWD_SINV :
Triangulation (Spec A Y B) (SpecPSINV A Y B)
(Fwd A Y B) (Resonator A Y B) :=
{ T := T_pfib_partial
, Phi := fun f g => Phi_pSINV f g.g, EP := EP_Fwd2
, injective := by
intro f1 f2 g h1 h2 x y
-- L1: x ∈g (f1 x y) y
have hx : x ∈g.g (f1 x y) y := h1.left x y
have hx2 : x ∈g.g (f2 x y) y := h2.left x y
exact g.unique y x (f1 x y) (f2 x y) hx hx2
, surjective := by
intro g
rcases g.spec with ⟨f, hf⟩
exact ⟨f, hf⟩
, totality := by
intro f
let g : SINV A Y B := fun b y => {x | f x y = b}
have hΦ : Phi_pSINV f g := by
constructor
· intro x y; simp [g]
· intro x y x' hx'; simpa [g] using hx'
have hunique : ∀(y : Y) (x : A) (b1 b2 : B), x ∈g b1 y →x ∈g b2 y →b1 = b2 := by
intro y x b1 b2 hb1 hb2
exact hb1.symm.trans hb2
exact ⟨⟨g, ⟨f, hΦ⟩, hunique⟩, hΦ⟩
, CorrectP := fun R f => CorrectF2 R f, CorrectQ := fun R' g => CorrectG2 R' g
, correctness_coupling := by
intro d f g hG hPhi x y
have hsound := hG (f x y) y
have hx : x ∈g.g (f x y) y := hPhi.left x y
exact hsound x hx
}
end PARTIAL_FWD_SINV
Proposition 5.10: Full ENUM-SINV
/-
Proposition 5.10 - Full ENUM_SINV
-/
namespace Full_ENUM_SINV
variable {I O : Type}
abbrev SpecRel
(I O : Type) := I →O →Prop
abbrev SpecEnum
(I O : Type) := I →Set O →Prop
-- d^≺


---

111:38
Dai et al.
abbrev SpecSInv
(I O : Type) := O →Set I →Prop
-- d^≻
-- 𝜏1, 𝜏2
def tau1 (R : SpecRel I O) : SpecEnum I O :=
fun i S => S = { o | R i o }
def tau2 (R : SpecRel I O) : SpecSInv I O :=
fun o S => S = { i | R i o }
structure EnumDesc (I O : Type) where
R : SpecRel I O
d : SpecEnum I O
repr : d = tau1 (I:=I) (O:=O) R
structure SInvDesc (I O : Type) where
R : SpecRel I O
d : SpecSInv I O
repr : d = tau2 (I:=I) (O:=O) R
-- T = 𝜏2 ◦𝜏1−1
def T_enum_sinv (de : EnumDesc I O) : SInvDesc I O :=
{ R := de.R, d := tau2 (I:=I) (O:=O) de.R, repr := rfl }
def Phi (p : I →Set O) (q : O →Set I) : Prop :=
∀i o, o ∈p i ↔i ∈q o
def EP : Setoid (I →Set O) :=
{ r := fun p1 p2 => ∀i, p1 i = p2 i
, iseqv := ⟨(fun _ _ => rfl),
(fun h i => (h i).symm),
(fun h1 h2 i => (h1 i).trans (h2 i))⟩}
def CorrectEnum (de : EnumDesc I O) (p : I →Set O) : Prop :=
∀i, de.d i (p i)
def CorrectSInv (ds : SInvDesc I O) (q : O →Set I) : Prop :=
∀o, ds.d o (q o)
def tri_Full_ENUM_SINV
: Triangulation (EnumDesc I O) (SInvDesc I O) (I →Set O) (O →Set I) :=
{ T := T_enum_sinv, Phi := Phi, EP := EP
, injective := by
intro p1 p2 q h1 h2 i
apply Set.ext
intro o
exact (h1 i o).trans (Iff.symm (h2 i o))
, surjective := by
intro q
refine ⟨(fun i => { o | i ∈q o }), ?_⟩
intro i o
rfl
, totality := by
intro p
refine ⟨(fun o => { i | o ∈p i }), ?_⟩
intro i o
rfl
, CorrectP := CorrectEnum, CorrectQ := CorrectSInv
, correctness_coupling := by
intro de p q hQ hPhi
let R := de.R
have hde : de.d = tau1 (I:=I) (O:=O) R := de.repr
have hQ' : ∀o, q o = { i | R i o } := by
intro o
have : (T_enum_sinv de).d o (q o) := hQ o
simp [T_enum_sinv, tau2] at this
exact this
intro i
have : p i = { o | R i o } := by
apply Set.ext; intro o


---

Reducing Hallucinations in LLM-Generated Code via Semantic Triangulation
111:39
have 𝜑:= hPhi i o
have iInQ : i ∈q o ↔R i o := by
rw [hQ' o]
rfl
exact 𝜑.trans iInQ
rw [hde]
simp [tau1, this]
}
end Full_ENUM_SINV
Proposition 5.11: Partial ENUM-SINV
/-
Proposition 5.11 - Partial ENUM_SINV
-/
namespace Partial_ENUM_SINV
variable {I1 I2 O : Type}
abbrev SpecRel
(I1 I2 O : Type) := I1 →I2 →O →Prop
abbrev SpecEnum
(I1 I2 O : Type) := I1 →I2 →Set O
→Prop
abbrev SpecSInv
(I1 I2 O : Type) := O
→I2 →Set I1 →Prop
-- 𝜏1, 𝜏2
def tau1 (R : SpecRel I1 I2 O) : SpecEnum I1 I2 O :=
fun i1 i2 S => S = { o | R i1 i2 o }
def tau2 (R : SpecRel I1 I2 O) : SpecSInv I1 I2 O :=
fun o i2 S => S = { i1 | R i1 i2 o }
structure EnumDesc (I1 I2 O : Type) where
R : SpecRel I1 I2 O
d : SpecEnum I1 I2 O
repr : d = tau1 (I1:=I1) (I2:=I2) (O:=O) R
structure SInvDesc (I1 I2 O : Type) where
R : SpecRel I1 I2 O
d : SpecSInv I1 I2 O
repr : d = tau2 (I1:=I1) (I2:=I2) (O:=O) R
-- T = 𝜏2 ◦𝜏1−1
def T_enum_sinv (de : EnumDesc I1 I2 O) : SInvDesc I1 I2 O :=
{ R := de.R, d := tau2 (I1:=I1) (I2:=I2) (O:=O) de.R, repr := rfl }
def Phi (p : I1 →I2 →Set O) (q : O →I2 →Set I1) : Prop :=
∀i1 i2 o, o ∈p i1 i2 ↔i1 ∈q o i2
def EP : Setoid (I1 →I2 →Set O) :=
{ r := fun p1 p2 => ∀i1 i2, p1 i1 i2 = p2 i1 i2
, iseqv := ⟨(fun _ _ _ => rfl),
(fun h i1 i2 => (h i1 i2).symm),
(fun h1 h2 i1 i2 => (h1 i1 i2).trans (h2 i1 i2))⟩}
def CorrectEnum (de : EnumDesc I1 I2 O) (p : I1 →I2 →Set O) : Prop :=
∀i1 i2, de.d i1 i2 (p i1 i2)
def CorrectSInv (ds : SInvDesc I1 I2 O) (q : O →I2 →Set I1) : Prop :=
∀o i2, ds.d o i2 (q o i2)
def tri_Partial_ENUM_SINV
: Triangulation (EnumDesc I1 I2 O) (SInvDesc I1 I2 O) (I1 →I2 →Set O) (O →I2 →Set I1) :=
{ T := T_enum_sinv, Phi := Phi, EP := EP
, injective := by
intro p1 p2 q h1 h2 i1 i2
apply Set.ext; intro o
exact (h1 i1 i2 o).trans (Iff.symm (h2 i1 i2 o))
, surjective := by
intro q
refine ⟨(fun i1 i2 => { o | i1 ∈q o i2 }), ?_⟩
intro i1 i2 o; rfl


---

111:40
Dai et al.
, totality := by
intro p
refine ⟨(fun o i2 => { i1 | o ∈p i1 i2 }), ?_⟩
intro i1 i2 o; rfl
, CorrectP := CorrectEnum, CorrectQ := CorrectSInv
, correctness_coupling := by
intro de p q hQ hPhi
let R := de.R
have hde : de.d = tau1 (I1:=I1) (I2:=I2) (O:=O) R := de.repr
have hQ' : ∀o i2, q o i2 = { i1 | R i1 i2 o } := by
intro o i2
have : (T_enum_sinv de).d o i2 (q o i2) := hQ o i2
simp [T_enum_sinv, tau2] at this
exact this
intro i1 i2
have p_eq : p i1 i2 = { o | R i1 i2 o } := by
apply Set.ext; intro o
have 𝜑:= hPhi i1 i2 o
have iInQ : i1 ∈q o i2 ↔R i1 i2 o := by
rw [hQ' o i2]
rfl
exact 𝜑.trans iInQ
rw [hde]
simp [tau1, p_eq]
}
end Partial_ENUM_SINV
Proposition B.1: STREAM
/-
Proposition 5.12 - STREAM
-/
namespace STREAM
variable {I O : Type}
structure SpecDesc (I O : Type) where
R : I →O →Prop
structure SpecSeqDesc (I O : Type) where
R : List I →List O →Prop
stateless : ∀(p0 : I →O), (∀i, R [i] [p0 i]) →∀l, R l (l.map p0)
structure StreamHom (I O : Type) where
p : List I →List O
p0
: I →O
hom
: ∀l, p l = l.map p0
def EP_STREAM {D' Q : Type}
(base_tri : Triangulation (SpecDesc I O) D' (I →O) Q) :
Setoid (StreamHom I O) where
r h1 h2 := base_tri.EP.r h1.p0 h2.p0
iseqv :=
{ refl
:= by
intro h
exact base_tri.EP.refl h.p0
symm
:= by
intro h1 h2 h
exact base_tri.EP.symm h
trans := by
intro h1 h2 h3 h12 h23
exact base_tri.EP.trans h12 h23 }
variable {D' Q : Type}
variable (tri_pt : Triangulation (SpecDesc I O) D' (I →O) Q)


---

Reducing Hallucinations in LLM-Generated Code via Semantic Triangulation
111:41
def T_pointwise (d : SpecSeqDesc I O) : SpecDesc I O := { R := fun i o => d.R [i] [o] }
def T := fun d => tri_pt.T (T_pointwise d)
def Phi (h : StreamHom I O) (q : Q) := tri_pt.Phi h.p0 q ∧∀l, h.p l = l.map h.p0
def CorrectP_STREAM (d : SpecSeqDesc I O) (h : StreamHom I O) : Prop := ∀l, d.R l (h.p l)
def CorrectQ_STREAM (d' : D') (q : Q) : Prop := tri_pt.CorrectQ d' q
def triangulation_STREAM (base_tri : Triangulation (SpecDesc I O) D' (I →O) Q)
(h_CorrectP_def : ∀(d : SpecDesc I O) (p : I →O), base_tri.CorrectP d p ↔(∀i, d.R i (p i)))
: Triangulation (SpecSeqDesc I O) D' (StreamHom I O) Q :=
{ T
:= fun d => base_tri.T (T_pointwise d)
, Phi := fun h q => base_tri.Phi h.p0 q ∧∀l, h.p l = l.map h.p0
, EP
:= EP_STREAM base_tri
, injective := by
intro h1 h2 q h1q h2q
exact base_tri.injective (p1:=h1.p0) (p2:=h2.p0) (q:=q) h1q.left h2q.left
, surjective := by
intro q; rcases base_tri.surjective q with ⟨p0, hp⟩
exact ⟨⟨fun l => l.map p0, p0, by intro l; rfl⟩, And.intro hp (by intro l; rfl)⟩
, totality := by
intro h; rcases base_tri.totality h.p0 with ⟨q, hp⟩
exact ⟨q, And.intro hp h.hom⟩
, CorrectP := CorrectP_STREAM
, CorrectQ := fun d' q => base_tri.CorrectQ d' q
, correctness_coupling := by
intro d h q hQ hΦ l
have maplaw : ∀l, h.p l = l.map h.p0 := hΦ.right
have pc0 : base_tri.CorrectP (T_pointwise d) h.p0 :=
base_tri.correctness_coupling hQ hΦ.left
rw [h_CorrectP_def] at pc0
have singletons : ∀i, d.R [i] [h.p0 i] := by
intro i
simpa [T_pointwise] using pc0 i
have stream_ok : d.R l (l.map h.p0) :=
d.stateless h.p0 singletons l
simpa [maplaw l] using stream_ok
}
end STREAM
G
Motivating Example Details
The motivating example in Figure 4 was simplified for presentation purpose. Here, we provide
complete problem descriptions, their transformations and example solutions. Note that for this
example just-tri-it also applied STREAM meta-rule (Theorem B.1) on top of ENUM-SINV.
Original problem 1999D from CodeElo
def slavics_exam(t: int, test_cases: list[tuple[str, str]]) -> list[Union[str,tuple[str,str]]]
Slavic has a very tough exam and needs your help in order to pass it. Here is the question he is struggling
with:
↩→
There exists a string $s$, which consists of lowercase English letters and possibly zero or more "?".
Slavic is asked to change each "?" to a lowercase English letter such that string $t$ becomes a subsequence
(not necessarily continuous) of the string $s$.
↩→
Output any such string, or say that it is impossible in case no string that respects the conditions exists.
# Input:
The first line contains a single integer $T$ ($1 \leq T \leq 10^4$) – the number of test cases.


---

111:42
Dai et al.
The first line of each test case contains a single string $s$ ($1 \leq |s| \leq 2 \cdot 10^5$, and $s$
consists only of lowercase English letters and "?"-s)
– the original string you have.
↩→
The second line of each test case contains a single string $t$ ($1 \leq |t| \leq |s|$, and $t$ consists only
of lowercase English letters)
– the string that should be a subsequence of string $s$.
↩→
The sum of $|s|$ over all test cases doesn't exceed $2 \cdot 10^5$, where $|x|$ denotes the length of the
string $x$.
↩→
# Output:
For each test case, if no such string exists as described in the statement, output "NO" (without quotes).
Otherwise, output "YES" (without quotes). Then, output one line – the string that respects all conditions.
You can output "YES" and "NO" in any case (for example, strings "yEs", "yes", and "Yes" will be recognized as
a positive response).
↩→
If multiple answers are possible, you can output any of them.
# Example input:
5
?????
xbx
ab??e
abcde
ayy?x
a
ab??e
dac
paiu
mom
# Example output:
YES
xabax
YES
abcde
YES
ayyyx
NO
NO
Dominant error (probability 0.23)
def slavics_exam(t: int, test_cases: List[Tuple[str, str]]) -> List[Union[str, Tuple[str, str]]]:
def is_subsequence(sub: str, full: str) -> bool:
"""Check if sub is a subsequence of full."""
it = iter(full)
return all(char in it for char in sub)
results = []
for s, t in test_cases:
if len(t) > len(s):
results.append("NO")
continue
# Attempt to replace '?' in s to make t a subsequence
modified_s = []
t_idx = 0
for char in s:
if char == '?':
if t_idx < len(t):
modified_s.append(t[t_idx])
t_idx += 1
else:
modified_s.append('a') # Any character when t is already matched
else:
modified_s.append(char)
modified_s = ''.join(modified_s)


---

Reducing Hallucinations in LLM-Generated Code via Semantic Triangulation
111:43
# Check if t is now a subsequence of modified_s
if is_subsequence(t, modified_s):
results.append(("YES", modified_s))
else:
results.append("NO")
return results
Low-probability (0.07) correct solution
def slavics_exam(t: int, test_cases: List[Tuple[str, str]]) -> List[Union[str, Tuple[str, str]]]:
def can_form_subsequence(s: str, t: str) -> str:
# Fill '?' in `s` such that `t` can be a subsequence of `s`
s_list = list(s)
t_index = 0
t_len = len(t)
for i in range(len(s_list)):
if t_index < t_len and s_list[i] == t[t_index]:
# Advance t_index if matches
t_index += 1
elif s_list[i] == '?':
# Replace '?' with a character from `t` if needed
if t_index < t_len:
s_list[i] = t[t_index]
t_index += 1
else:
# Replace remaining '?' with 'a' or any other letter
s_list[i] = 'a'
if t_index == t_len:
return "YES", "".join(s_list)
else:
return "NO"
results = []
for s, t in test_cases:
if not(1 <= len(s) <= 2 * 10**5) or not(1 <= len(t) <= len(s)):
raise ValueError('Invalid input')
result = can_form_subsequence(s, t)
results.append(result)
return results
Transformed pointwise problem
def slavics_exam_pointwise_unpacked(s: str, t: str) -> Union[str, tuple[str, str]]
Slavic has a very tough exam and needs your help in order to pass it. Here is the question he is struggling
with:
↩→
There exists a string $s$, which consists of lowercase English letters and possibly zero or more "?".
Slavic is asked to change each "?" to a lowercase English letter such that another string becomes a
subsequence (not necessarily continuous) of the string $s$.
↩→
Output any such string, or say that it is impossible in case no string that respects the conditions exists.
# Input:
The input consists of two parameters:
The first parameter contains a single string $s$ ($1 \leq |s| \leq 2 \cdot 10^5$, and $s$ consists only of
lowercase English letters and "?"-s) – the original string you have.
↩→
The second parameter contains a single string $t$ ($1 \leq |t| \leq |s|$, and $t$ consists only of lowercase
English letters) – the string that should be a subsequence of string $s$.
↩→
# Output:
For the parameters, if no such string exists as described in the statement, output "NO" (without quotes).


---

111:44
Dai et al.
Otherwise, output "YES" (without quotes). Then, output one line – the string that respects all conditions.
You can output "YES" and "NO" in any case (for example, strings "yEs", "yes", and "Yes" will be recognized as
a positive response).
↩→
If multiple answers are possible, you can output any of them.
Answer enumeration problem
def slavics_exam_pointwise_unpacked_enum(s: str, t: str) -> list[Union[str, tuple[str, str]]]
Slavic has a very tough exam and needs your help in order to pass it. Here is the question he is struggling
with:
↩→
There exists a string $s$, which consists of lowercase English letters and possibly zero or more "?".
Slavic is asked to change each "?" to a lowercase English letter such that another string becomes a
subsequence (not necessarily continuous) of the string $s$.
↩→
Output all such strings, along with "YES" if at least one solution is found, or say that it is impossible in
case no string that respects the conditions exists.
↩→
# Input:
The input consists of two parameters:
The first parameter contains a single string $s$ ($1 \leq |s| \leq 2 \cdot 10^5$, and $s$ consists only of
lowercase English letters and "?"-s) – the original string you have.
↩→
The second parameter contains a single string $t$ ($1 \leq |t| \leq |s|$, and $t$ consists only of lowercase
English letters) – the string that should be a subsequence of string $s$.
↩→
# Output:
For the parameters, output a list of all possible outputs as described in the statement: either "NO" if no such
string exists, or one or more tuples containing "YES" (in any case, for example, strings "yEs", "yes", and
"Yes" will be recognized as positive responses) followed by a valid string that respects all conditions.
↩→
↩→
If multiple answers are possible, all of them must be included in the list.
ENUM solution
def slavics_exam_simp_single_unpacked_enum(s: str, t: str) -> List[Union[str, Tuple[str, str]]]:
if not s or not t or len(t) > len(s):
raise ValueError('Invalid input')
def is_subsequence(s: str, t: str) -> bool:
"""Check if t is a subsequence of s."""
t_index = 0
for char in s:
if t_index < len(t) and char == t[t_index]:
t_index += 1
return t_index == len(t)
results = []
queue = [(s, t, 0)]
while queue:
current_s, target_t, index = queue.pop(0)
# If '?' is found, try all possible replacements
if index < len(current_s):
if current_s[index] == '?':
for replacement in 'abcdefghijklmnopqrstuvwxyz':
new_string = current_s[:index] + replacement + current_s[index+1:]
queue.append((new_string, target_t, index + 1))
else:
queue.append((current_s, target_t, index + 1))
else:
if is_subsequence(current_s, target_t):
results.append(('YES', current_s))
if not results:


---

Reducing Hallucinations in LLM-Generated Code via Semantic Triangulation
111:45
return ['NO']
return results
Set-valued partial inverse problem w.r.t. NO
def slavics_exam_pointwise_unpacked_sinv_no(s: str) -> list[str]
Slavic has a challenging exam and needs your help to pass it. Here is a new question he needs assistance with:
There exists a string $s$ which is composed of lowercase English letters and may include zero or more "?". The
task is to replace each "?" with a lowercase English letter such that a second given string, $t$, is not a
subsequence (not necessarily continuous) of string $s$.
↩→
↩→
You need to identify the set of all possible strings $t$ that would result in an output of "NO" within
reasonable bounds.
↩→
# Input:
The input consists of one parameter:
The parameter contains a single string $s$ ($1 \leq |s| \leq 2 \cdot 10^5$, and $s$ consists only of lowercase
English letters and "?"-s) – the original string you have.
↩→
# Output:
Output a list of all strings $t$ ($1 \leq |t| \leq |s|$) which do not exist as a subsequence of string $s$
after replacing every "?" in $s$ with appropriate lowercase English letters. If no such strings exist
within the reasonable bound, return an empty list.
↩→
↩→
The reasonable bound should be considered as any string $t$ with a length up to that of $s$.
The output list must include all possible strings that satisfy the condition, respecting the bounds.
Set-valued partial inverse problem w.r.t. Yes
def slavics_exam_pointwise_unpacked_sinv_yes(s_with_replaced_marks: str, s: str) -> list[str]
Slavic has a very tough exam and needs your help. Here is the modified question he is struggling with:
There exists a string \( s \), which consists of lowercase English letters and possibly zero or more "?".
You are given a string \( s_{\text{with\_replaced\_marks}} \), which represents \( s \) with all the "?"
replaced by lowercase English letters such that a string could become a subsequence of this \(
s_{\text{with\_replaced\_marks}} \).
↩→
↩→
Your task is to determine all the possible values of string \( t \) such that \( t \) is a subsequence of \(
s_{\text{with\_replaced\_marks}} \).
↩→
# Input:
The input consists of two parameters:
The first parameter contains a single string \( s_{\text{with\_replaced\_marks}} \) (same length and character
restrictions as \( s \)) – the original string with "?" replaced.
↩→
The second parameter contains a single string \( s \) (\( 1 \leq |s| \leq 2 \cdot 10^5 \), and \( s \)
consists only of lowercase English letters and "?"-s) – the original string you have.
↩→
# Output:
Output an exhaustive list of strings \( t \) such that if the function were called with any of these \( t \)
values and \( s \), it would produce the result: "YES" and the \( s_{\text{with\_replaced\_marks}} \) as
the satisfying string.
↩→
↩→
If no such string \( t \) exists, return an empty list.
Ensure that the solution includes every possible string \( t \) that meets the condition.
Composed SINV solution
def slavics_exam_pointwise_unpacked_sinv_no(s: str) -> list[str]:
from itertools import product
import string


---

111:46
Dai et al.
def is_subsequence(small: str, large: str) -> bool:
it = iter(large)
return all(char in it for char in small)
if not isinstance(s, str) or any(c not in string.ascii_lowercase + '?' for c in s):
raise ValueError('Invalid input')
potential_chars = string.ascii_lowercase
replacements = [c if c != '?' else potential_chars for c in s]
result_set = set()
# Generate candidate strings whose lengths are in the reasonable bound
for length in range(1, len(s) + 1):
# Generate all possible combinations of letters with the given length
for candidate in product(potential_chars, repeat=length):
candidate_str = ''.join(candidate)
can_form_subsequence = False
# Check if the candidate is a subsequence of any possible version of `s`
for version in product(*replacements):
version_str = ''.join(version)
if is_subsequence(candidate_str, version_str):
can_form_subsequence = True
break
if not can_form_subsequence:
result_set.add(candidate_str)
return list(result_set)
from itertools import combinations
def slavics_exam_pointwise_unpacked_sinv_yes(s_with_replaced_marks: str, s: str) -> list[str]:
def is_subsequence(t: str, s_rep: str) -> bool:
it = iter(s_rep)
return all(char in it for char in t)
if len(s_with_replaced_marks) != len(s):
raise ValueError('Invalid input')
possible_ts = set()
# Generate all unique possible 't' strings by considering '?' to be any character
# that would make it a subsequence.
for i in range(1, len(s_with_replaced_marks) + 1):
for comb in combinations(range(len(s_with_replaced_marks)), i):
candidate = ''.join(s_with_replaced_marks[idx] for idx in comb)
if is_subsequence(candidate, s_with_replaced_marks):
possible_ts.add(candidate)
return sorted(possible_ts)
def slavics_exam_pointwise_unpacked_sinv(*args):
args = list(args)
if isinstance(args[0], str):
return (False, slavics_exam_pointwise_unpacked_sinv_no(*args[1:]))
else:
yes_args = [args[0][1]] + args[1:]
return (True, slavics_exam_pointwise_unpacked_sinv_yes(*yes_args))
H
Proof of the Strict Rearrangement Step
We justify the strict inequality used in the proof of Proposition 4.2. Let 𝑆be a finite index set and
let 𝜎: 𝑆→𝑆be a permutation. For any real numbers {𝜋𝑖}𝑖∈𝑆, consider the gap
∑︁
𝑖∈𝑆
𝜋2
𝑖−
∑︁
𝑖∈𝑆
𝜋𝑖𝜋𝜎(𝑖).


---

Reducing Hallucinations in LLM-Generated Code via Semantic Triangulation
111:47
Since 𝜎is a permutation, it only reorders the indices, and therefore
∑︁
𝑖∈𝑆
𝜋2
𝜎(𝑖) =
∑︁
𝑖∈𝑆
𝜋2
𝑖.
Thus,
1
2
∑︁
𝑖∈𝑆
 𝜋𝑖−𝜋𝜎(𝑖)
2 = 1
2
∑︁
𝑖∈𝑆

𝜋2
𝑖+ 𝜋2
𝜎(𝑖) −2𝜋𝑖𝜋𝜎(𝑖)

=
∑︁
𝑖∈𝑆
𝜋2
𝑖−
∑︁
𝑖∈𝑆
𝜋𝑖𝜋𝜎(𝑖).
The left-hand side is a sum of squared terms, so it is nonnegative. Hence
∑︁
𝑖∈𝑆
𝜋2
𝑖≥
∑︁
𝑖∈𝑆
𝜋𝑖𝜋𝜎(𝑖).
Moreover, the inequality is strict whenever at least one squared term is positive, i.e., whenever
there exists 𝑖∈𝑆such that 𝜋𝑖≠𝜋𝜎(𝑖). In our application, we take 𝑆= 𝐵𝑑. By construction, 𝜎has
no fixed points on 𝐵𝑑, and by Assumption 4 the probabilities {𝜋𝑏: 𝑏∈𝐵𝑑} are distinct. Therefore,
for every 𝑏∈𝐵𝑑, 𝜋𝑏≠𝜋𝜎(𝑏), and at least one squared term above is strictly positive. Consequently,
∑︁
𝑏∈𝐵𝑑
𝜋2
𝑏>
∑︁
𝑏∈𝐵𝑑
𝜋𝑏𝜋𝜎(𝑏).
This establishes the strictness condition used in Equation (2).

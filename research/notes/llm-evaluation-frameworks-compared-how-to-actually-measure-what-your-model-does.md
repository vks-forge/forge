---
title: 'LLM Evaluation Frameworks Compared: How to Actually Measure What Your Model
  Does - MachineLearningMastery.com'
id: llm-evaluation-frameworks-compared-how-to-actually-measure-what-your-model-does
tags:
- ai-software-factory-architecture-58e4cc
- eval-frameworks
- llm-judge-bias
- rigid-evals
created: '2026-10-12T08:28:46.811314Z'
updated: '2026-10-12T08:35:41.081656Z'
source: https://machinelearningmastery.com/llm-evaluation-frameworks-compared-how-to-actually-measure-what-your-model-does/
source_domain: machinelearningmastery.com
fetched_at: '2026-10-12T08:28:46.807576Z'
fetch_provider: builtin
status: draft
type: note
tier: unknown
content_type: unknown
deprecated: false
summary: 'MachineLearningMastery.com technical article (Shittu Olumide, July 14, 2026)
  comparing the three dominant open-source LLM-application eval frameworks in 2026
  -- RAGAS, DeepEval, Promptfoo -- plus documents published LLM-as-judge bias research
  with working Python audit code. Directly load-bearing for pillar 1 (rigid evals
  / adversarial model review). Distinguishes three evaluation categories often conflated:
  model benchmarking (lm-evaluation-harness, MMLU/GSM8K/HumanEval style), application
  evaluation (RAGAS/DeepEval/Promptfoo), and production monitoring (LangSmith, Braintrust,
  Arize Phoenix) -- notes ''most mature GenAI QA programs run two of them in parallel.''
  Framework comparison: RAGAS is research-backed/academic-grade for faithfulness/context-precision/context-recall
  but scoped only to retrieval+generation, no production monitoring; DeepEval is Python-native,
  pytest-based, ships 14+ metrics (hallucination, bias, toxicity, RAG-specific) and
  is designed explicitly as a CI/CD quality gate that can block a deploy; Promptfoo
  is CLI/YAML-driven, strongest for multi-model prompt comparison and adversarial
  red-teaming with 500+ built-in attack vectors in its security-testing suite. Key
  framing: DeepEval and RAGAS are complementary not competing -- many production teams
  run both in the same CI pipeline, RAGAS scoring retrieval dimensions and DeepEval
  covering everything else. Provides working code for a faithfulness/groundedness
  check (decompose answer into atomic claims, verify each against retrieved context)
  and a DeepEval pytest CI gate using G-Eval with a custom plain-language rubric and
  pass/fail threshold (e.g. 0.7) that blocks merge on regression. Documents three
  published LLM-judge biases with primary citations: (1) position bias -- an IJCNLP
  2025 systematic study evaluated 15 LLM judges across ~150,000 evaluation instances
  and found judges systematically favor whichever response sits in a particular prompt
  slot, independent of content, with verdicts flipping purely from reordering; (2)
  self-preference bias -- models disproportionately favor outputs from themselves
  or their own model family, inflating scores when e.g. GPT-4o judges GPT-4o''s own
  output; (3) verbosity bias -- longer responses are rated higher regardless of whether
  the added length adds useful content. Flags the commonly cited ''~80% LLM-judge/human
  agreement'' statistic (from the original MT-Bench paper) as an aggregate benchmark
  figure, not a production-readiness guarantee for a specific task/judge-model combination.
  Provides a complete position-bias detection harness: run the same pairwise comparison
  twice with response order swapped, measure the verdict-flip (''inconsistency'')
  rate, and treat scores with skepticism if that rate is meaningfully above 0%; mitigation
  is averaging scores across both orderings or using a judge model from a different
  model family than the one being evaluated.'
---

LLM Evaluation Frameworks Compared: How to Actually Measure What Your Model Does - MachineLearningMastery.com
LLM Evaluation Frameworks Compared: How to Actually Measure What Your Model Does - MachineLearningMastery.com
Navigation
By
Shittu Olumide
on
July 14, 2026
in
Language Models
2
Share
Post
Share
In this article, you will learn how to evaluate LLM applications using the three dominant open-source frameworks — RAGAS, DeepEval, and Promptfoo — and why the LLM-as-a-judge mechanism they all rely on has measurable biases you need to actively design around.
Topics we will cover include:
How RAGAS, DeepEval, and Promptfoo differ in purpose and when to use each one, including which pairings experienced teams converge on.
How to implement a faithfulness check and a CI-gated quality evaluation with working code you can run immediately.
What position bias, self-preference bias, and verbosity bias are, how to detect them with an audit harness, and how to mitigate them in production.
There’s a lot to get through, so let’s get right into it.
Introduction
You ship an LLM feature after seeing a couple of outputs and decide it looks good. Three weeks later, a prompt tweak silently breaks something nobody was testing for, and nobody notices until a user complains. This is the default failure mode for LLM applications, and it’s different from a typical software bug. Traditional code fails with a stack trace. LLM outputs fail by being confidently, plausibly wrong, which is exactly the kind of failure a quick manual glance won’t catch.
Three open-source tools dominate the practical side of this problem in 2026:
Promptfoo, DeepEval, and RAGAS
. Each is built for a different shape of problem, not competing for the same job. Layered above them are production-monitoring platforms like LangSmith and Braintrust, which pick up where offline evaluation leaves off. None of these tools wins outright; most mature GenAI QA programs run two of them in parallel: a lightweight framework for blocking bad deploys plus a platform for ongoing monitoring and human review.
This article compares the frameworks that actually matter, walks through tested code for the two most common evaluation jobs, and covers the part most comparison pieces skip entirely: the fact that “
LLM-as-a-judge
“, the mechanism nearly every framework here relies on, has measurable, published biases you need to design around, not just trust.
What “Evaluating an LLM” Actually Means
Before comparing tools, it helps to separate three things people conflate when they say “
LLM evaluation
.” Picking the wrong category here is the single most common mistake teams make.
Model benchmarking
compares raw model capabilities on standardized academic tasks, such as MMLU, GSM8K, and HumanEval.
lm-evaluation-harness is the standard here, with no real substitute when the requirement is a standardized academic benchmark
. If you’re choosing between GPT-5 and Claude for a new project, this is the category you want, but it tells you almost nothing about whether your specific application works.
Application evaluation
asks a narrower, more useful question: does your RAG pipeline, chatbot, or agent produce correct, grounded, safe outputs on your data and your prompts? This is where RAGAS, DeepEval, and Promptfoo live, and it’s where this article spends most of its time.
Production monitoring
tracks live traffic after deployment, catching regressions and drift that offline test sets never anticipated. This is LangSmith, Braintrust, and Arize Phoenix territory.
Most people asking “
which eval framework should I use
” actually need the second category, often paired with the third. The rest of this article focuses on that.
The Metrics Underneath the Frameworks
Before the framework comparison makes sense, it’s worth knowing what’s actually being scored, because every tool below implements some version of the same handful of metrics.
Faithfulness (or groundedness)
checks whether an answer contains only claims supported by the retrieved context — the core mechanism for catching RAG hallucinations.
Context precision and recall
check whether retrieval pulled the right documents, and only the right ones, before generation even happens.
Answer relevancy
checks whether the response actually addresses the question asked, independent of whether it’s factually grounded.
G-Eval
, introduced by
Liu et al.
, uses chain-of-thought prompting combined with form-filling to guide an LLM judge through an explicit rubric, and has been shown to align with human preference more closely than naive “
rate this 1-10
” prompting. Beyond these, most frameworks add task-specific checks for toxicity, bias, and PII leakage.
The real differentiator between frameworks isn’t metric novelty; they mostly implement the same handful of ideas. It’s workflow fit: how the metric gets triggered, where the result goes, and whether it blocks a deploy or just generates a report.
RAGAS vs. DeepEval vs. Promptfoo, Head to Head
RAGAS is research-backed, with academic-grade methodology behind metrics like faithfulness, context precision, and context recall, but it’s scoped to retrieval and generation scoring, with no production monitoring or collaboration layer built in. Pick it when your architecture is retrieval-heavy and you want metrics with a published paper behind their definition, not just a vendor’s internal heuristic.
DeepEval
is Python-native and pytest-based, with 14-plus metrics spanning hallucination, bias, toxicity, and RAG-specific checks — built explicitly to function as a CI/CD quality gate that can block a deploy. Pick it when evaluation needs to live inside your existing test suite rather than as a separate offline report someone has to remember to run.
Promptfoo
is CLI-first and YAML-config-driven, strongest at multi-model prompt comparison and adversarial red-teaming, with 500-plus built-in attack vectors in its security-testing suite. Pick it for prompt engineering iteration across multiple models, or when red-teaming and security testing are the actual requirement.
The framing that matters most: DeepEval and RAGAS aren’t really competitors. DeepEval covers broad LLM application testing, RAGAS specializes specifically in RAG, and a meaningful share of production teams run both together — with RAGAS scoring the retrieval-specific dimensions and DeepEval handling everything else inside the same CI pipeline.
Category
RAGAS
DeepEval
Promptfoo
Best for
RAG-specific scoring
CI/CD quality gates
Multi-model comparison, red-teaming
Integration style
Python library
pytest-native
YAML + CLI
Strongest metric set
Faithfulness, context precision/recall
14+ metrics incl. bias, toxicity
Security/attack vectors (500+)
Production monitoring
No
No
No
Pairs well with
DeepEval (broader coverage)
RAGAS (RAG-specific depth)
Either for prompt-side testing
Code Walkthrough: Catching Hallucination with a Faithfulness Check
Here’s the mechanism behind RAGAS’s faithfulness metric, demonstrated directly: decompose an answer into atomic claims, then check each claim against the retrieved context. A claim with no support in the context is a hallucination — exactly the failure mode that a quick manual read tends to miss, because the unsupported detail often sounds completely plausible.
# faithfulness_check.py

# Prerequisites: none beyond Python's standard library (re)

# Run: python faithfulness_check.py

#

# Note: this demonstrates the faithfulness-checking MECHANISM that RAGAS's

# real Faithfulness metric implements with an LLM judge. The keyword-overlap

# check below is a simplified, fully offline-testable stand-in for that

# LLM-based claim verification -- swap in RAGAS's actual metric for production use.



import re



def decompose_claims(answer: str) -> list[str]:

    """Split an answer into atomic, independently-checkable statements."""

    sentences = re.split(r'(?<=[.!?])\s+', answer.strip())

    return [s.strip() for s in sentences if s.strip()]



def claim_supported_by_context(claim: str, context: str) -> bool:

    """

    Check whether a claim has lexical support in the retrieved context.

    RAGAS does this with an LLM judge; this overlap check demonstrates

    the same supported/unsupported decision in a deterministic way.

    """

    claim_words   = set(re.findall(r'\b[a-zA-Z]{4,}\b', claim.lower()))

    context_words = set(re.findall(r'\b[a-zA-Z]{4,}\b', context.lower()))

    if not claim_words:

        return True

    overlap = len(claim_words & context_words) / len(claim_words)

    return overlap >= 0.5



def compute_faithfulness(answer: str, context: str) -> dict:

    """

    Faithfulness score = fraction of claims in the answer supported by context.

    This mirrors RAGAS's actual metric definition: supported claims / total claims.

    """

    claims      = decompose_claims(answer)

    supported   = [c for c in claims if claim_supported_by_context(c, context)]

    unsupported = [c for c in claims if c not in supported]

    score = len(supported) / len(claims) if claims else 1.0

    return {

        "score": round(score, 3),

        "total_claims": len(claims),

        "unsupported_claims": unsupported,

    }





if __name__ == "__main__":

    context = "Abuja became the capital of Nigeria in 1991, replacing Lagos as the seat of government."



    # Case 1: fully grounded answer -- every claim traces back to the context

    grounded_answer = "The capital of Nigeria is Abuja. It became the capital in 1991."

    result_1 = compute_faithfulness(grounded_answer, context)

    print("Grounded answer:")

    print(f"  Faithfulness score: {result_1['score']}")

    print(f"  Unsupported claims: {result_1['unsupported_claims']}\n")



    # Case 2: the model adds a plausible-sounding detail the context never mentioned

    hallucinated_answer = (

        "The capital of Nigeria is Abuja. It became the capital in 1991. "

        "The city has a population of over 3 million people."

    )

    result_2 = compute_faithfulness(hallucinated_answer, context)

    print("Answer with a hallucinated detail:")

    print(f"  Faithfulness score: {result_2['score']}")

    print(f"  Unsupported claims: {result_2['unsupported_claims']}")
1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
31
32
33
34
35
36
37
38
39
40
41
42
43
44
45
46
47
48
49
50
51
52
53
54
55
56
57
58
59
60
61
62
63
64
# faithfulness_check.py
# Prerequisites: none beyond Python's standard library (re)
# Run: python faithfulness_check.py
#
# Note: this demonstrates the faithfulness-checking MECHANISM that RAGAS's
# real Faithfulness metric implements with an LLM judge. The keyword-overlap
# check below is a simplified, fully offline-testable stand-in for that
# LLM-based claim verification -- swap in RAGAS's actual metric for production use.
import
re
def
decompose_claims
(
answer
:
str
)
->
list
[
str
]
:
""
"Split an answer into atomic, independently-checkable statements."
""
sentences
=
re
.
split
(
r
'(?<=[.!?])\s+'
,
answer
.
strip
(
)
)
return
[
s
.
strip
(
)
for
s
in
sentences
if
s
.
strip
(
)
]
def
claim_supported_by_context
(
claim
:
str
,
context
:
str
)
->
bool
:
""
"
Check whether a claim has lexical support in the retrieved context.
RAGAS does this with an LLM judge; this overlap check demonstrates
the same supported/unsupported decision in a deterministic way.
"
""
claim_words
=
set
(
re
.
findall
(
r
'\b[a-zA-Z]{4,}\b'
,
claim
.
lower
(
)
)
)
context_words
=
set
(
re
.
findall
(
r
'\b[a-zA-Z]{4,}\b'
,
context
.
lower
(
)
)
)
if
not
claim_words
:
return
True
overlap
=
len
(
claim_words
&
context_words
)
/
len
(
claim_words
)
return
overlap
>=
0.5
def
compute_faithfulness
(
answer
:
str
,
context
:
str
)
->
dict
:
""
"
Faithfulness score = fraction of claims in the answer supported by context.
This mirrors RAGAS's actual metric definition: supported claims / total claims.
"
""
claims
=
decompose_claims
(
answer
)
supported
=
[
c
for
c
in
claims
if
claim_supported_by_context
(
c
,
context
)
]
unsupported
=
[
c
for
c
in
claims
if
c
not
in
supported
]
score
=
len
(
supported
)
/
len
(
claims
)
if
claims
else
1.0
return
{
"score"
:
round
(
score
,
3
)
,
"total_claims"
:
len
(
claims
)
,
"unsupported_claims"
:
unsupported
,
}
if
__name__
==
"__main__"
:
context
=
"Abuja became the capital of Nigeria in 1991, replacing Lagos as the seat of government."
# Case 1: fully grounded answer -- every claim traces back to the context
grounded_answer
=
"The capital of Nigeria is Abuja. It became the capital in 1991."
result_1
=
compute_faithfulness
(
grounded_answer
,
context
)
print
(
"Grounded answer:"
)
print
(
f
"  Faithfulness score: {result_1['score']}"
)
print
(
f
"  Unsupported claims: {result_1['unsupported_claims']}\n"
)
# Case 2: the model adds a plausible-sounding detail the context never mentioned
hallucinated_answer
=
(
"The capital of Nigeria is Abuja. It became the capital in 1991. "
"The city has a population of over 3 million people."
)
result_2
=
compute_faithfulness
(
hallucinated_answer
,
context
)
print
(
"Answer with a hallucinated detail:"
)
print
(
f
"  Faithfulness score: {result_2['score']}"
)
print
(
f
"  Unsupported claims: {result_2['unsupported_claims']}"
)
How to run (no dependencies required):
python faithfulness_check.py
1
python
faithfulness_check
.
py
Output:
Grounded answer:

  Faithfulness score: 1.0

  Unsupported claims: []



Answer with a hallucinated detail:

  Faithfulness score: 0.667

  Unsupported claims: ['The city has a population of over 3 million people.']
1
2
3
4
5
6
7
Grounded
answer
:
Faithfulness
score
:
1.0
Unsupported
claims
:
[
]
Answer
with
a
hallucinated
detail
:
Faithfulness
score
:
0.667
Unsupported
claims
:
[
'The city has a population of over 3 million people.'
]
That population figure sounds entirely reasonable, which is exactly why a manual review would likely let it through. The faithfulness check catches it because it’s checking against the actual retrieved context, not against general plausibility. This is the mechanism running underneath
RAGAS’s real Faithfulness metric
, which uses an LLM to do the claim decomposition and support-checking instead of keyword overlap — more accurate, same underlying logic.
To run this with the actual RAGAS library against a live model:
# Production pattern using the real RAGAS library

# pip install ragas



from ragas import SingleTurnSample, EvaluationDataset

from ragas.metrics import Faithfulness

from ragas import evaluate



sample = SingleTurnSample(

    user_input="What is the capital of Nigeria?",

    response="The capital of Nigeria is Abuja. It became the capital in 1991. The city has a population of over 3 million people.",

    retrieved_contexts=["Abuja became the capital of Nigeria in 1991, replacing Lagos as the seat of government."],

)

dataset = EvaluationDataset(samples=[sample])

results = evaluate(dataset, metrics=[Faithfulness()])

print(results)
1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
# Production pattern using the real RAGAS library
# pip install ragas
from
ragas
import
SingleTurnSample
,
EvaluationDataset
from
ragas
.
metrics
import
Faithfulness
from
ragas
import
evaluate
sample
=
SingleTurnSample
(
user_input
=
"What is the capital of Nigeria?"
,
response
=
"The capital of Nigeria is Abuja. It became the capital in 1991. The city has a population of over 3 million people."
,
retrieved_contexts
=
[
"Abuja became the capital of Nigeria in 1991, replacing Lagos as the seat of government."
]
,
)
dataset
=
EvaluationDataset
(
samples
=
[
sample
]
)
results
=
evaluate
(
dataset
,
metrics
=
[
Faithfulness
(
)
]
)
print
(
results
)
Code Walkthrough: CI-Gated Evaluation with DeepEval
The pattern that makes DeepEval distinct from a standalone evaluation script is that it runs as a real pytest test, meaning a quality regression fails the build the same way a broken unit test would — instead of generating a report someone has to remember to read.
# test_response_quality.py

# Prerequisites: pip install deepeval pytest

# Set your judge model's API key as an environment variable before running

# Run: deepeval test run test_response_quality.py



import pytest

from deepeval import assert_test

from deepeval.test_case import LLMTestCase

from deepeval.metrics import GEval



# G-Eval lets you define a custom rubric in plain language -- the LLM judge

# uses chain-of-thought reasoning against this rubric rather than a generic

# "rate this 1-10" prompt, which is what gives G-Eval better alignment

# with human judgment than naive scoring prompts.

correctness_metric = GEval(

    name="Policy Accuracy",

    criteria=(

        "Determine whether the actual output accurately reflects company policy "

        "without adding unstated conditions or omitting required disclosures."

    ),

    evaluation_params=["input", "actual_output"],

    threshold=0.7,   # Minimum score to pass -- tune based on your risk tolerance

)



def test_refund_policy_response():

    """

    This test fails the build if the model's refund policy explanation

    drops below the correctness threshold -- the same way a broken

    assertion would fail any other pytest test.

    """

    test_case = LLMTestCase(

        input="What is the refund policy?",

        actual_output="You can request a refund within 30 days of purchase, no questions asked.",

    )

    assert_test(test_case, [correctness_metric])





def test_refund_policy_response_with_unstated_condition():

    """

    This case demonstrates what a FAILING test looks like: the response

    adds a condition ("only for unopened items") that wasn't part of the

    actual policy being tested against, which should drag the score down.

    """

    test_case = LLMTestCase(

        input="What is the refund policy?",

        actual_output=(

            "You can request a refund within 30 days, but only for unopened items "

            "and only if you have the original receipt and packaging."

        ),

    )

    assert_test(test_case, [correctness_metric])
1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
31
32
33
34
35
36
37
38
39
40
41
42
43
44
45
46
47
48
49
50
51
# test_response_quality.py
# Prerequisites: pip install deepeval pytest
# Set your judge model's API key as an environment variable before running
# Run: deepeval test run test_response_quality.py
import
pytest
from
deepeval
import
assert_test
from
deepeval
.
test_case
import
LLMTestCase
from
deepeval
.
metrics
import
GEval
# G-Eval lets you define a custom rubric in plain language -- the LLM judge
# uses chain-of-thought reasoning against this rubric rather than a generic
# "rate this 1-10" prompt, which is what gives G-Eval better alignment
# with human judgment than naive scoring prompts.
correctness_metric
=
GEval
(
name
=
"Policy Accuracy"
,
criteria
=
(
"Determine whether the actual output accurately reflects company policy "
"without adding unstated conditions or omitting required disclosures."
)
,
evaluation_params
=
[
"input"
,
"actual_output"
]
,
threshold
=
0.7
,
# Minimum score to pass -- tune based on your risk tolerance
)
def
test_refund_policy_response
(
)
:
""
"
This test fails the build if the model's refund policy explanation
drops below the correctness threshold -- the same way a broken
assertion would fail any other pytest test.
"
""
test_case
=
LLMTestCase
(
input
=
"What is the refund policy?"
,
actual_output
=
"You can request a refund within 30 days of purchase, no questions asked."
,
)
assert_test
(
test_case
,
[
correctness_metric
]
)
def
test_refund_policy_response_with_unstated_condition
(
)
:
""
"
This case demonstrates what a FAILING test looks like: the response
adds a condition ("
only
for
unopened
items
") that wasn't part of the
actual policy being tested against, which should drag the score down.
"
""
test_case
=
LLMTestCase
(
input
=
"What is the refund policy?"
,
actual_output
=
(
"You can request a refund within 30 days, but only for unopened items "
"and only if you have the original receipt and packaging."
)
,
)
assert_test
(
test_case
,
[
correctness_metric
]
)
Prerequisites:
pip install deepeval pytest

export OPENAI_API_KEY=your_key   # DeepEval uses an LLM judge under the hood
1
2
pip
install
deepeval
pytest
export
OPENAI_API_KEY
=
your
_
key
# DeepEval uses an LLM judge under the hood
How to run:
deepeval test run test_response_quality.py
1
deepeval
test
run
test_response_quality
.
py
The first test should pass; the response matches a plausible, unembellished policy statement. The second is written to demonstrate a likely failure: it adds conditions that weren’t part of the original input, which a well-configured G-Eval rubric should catch and score below the 0.7 threshold. In a real CI pipeline, that failure blocks the merge — exactly the behavior that turns evaluation from “
something we should check on
” into “
something the pipeline enforces
.”
The Problem Nobody Mentions: LLM-as-a-Judge Is Biased
Every framework above relies on the same underlying mechanism for the metrics that matter most: an LLM judging another LLM’s output. That judge is not neutral, and the research on this is more developed than most teams realize.
Position bias
is the best-documented of these. A
systematic study at IJCNLP 2025
evaluated 15 LLM judges across roughly 150,000 evaluation instances and found that judges systematically favor whichever response sits in a particular slot of the prompt, and that this effect is not attributable to random chance. Swap the order of two responses being compared, and the same judge can flip its verdict purely because of where each response now sits — not because either response changed.
Self-preference
bias compounds this.
Models disproportionately favor outputs generated by themselves or by models in their own family
, meaning that if you use GPT-4o to judge GPT-4o’s own outputs, the resulting score is inflated above what an independent judge would assign. Research distinguishes this from genuine quality differences: not every self-preference signal is biased, but the harmful version is specifically when a judge fails to penalize its own model family’s errors.
Verbosity bias
is the third major one:
longer responses get rated higher independent of whether the added length contains anything useful
. A judge comparing a concise, correct answer against a padded, partially redundant one will often favor the longer one.
The often-cited statistic that LLM judges reach roughly 80% agreement with human evaluators comes from the original MT-Bench study and is accurate as an aggregate figure, but it describes average performance across a broad benchmark — not reliability on your specific task with your specific judge model. Treating that number as a production-readiness guarantee is the mistake.
Code: A Position-Bias Detection Harness
The single highest-leverage check most teams skip: run the same pairwise comparison twice, with the response order swapped, and see whether the verdict flips.
# position_bias_audit.py

# Prerequisites: none beyond Python's standard library (random, dataclasses)

# Run: python position_bias_audit.py



import random

from dataclasses import dataclass



@dataclass

class PairwiseResult:

    query: str

    verdict_original_order: str

    verdict_swapped_order: str

    position_consistent: bool   # False means the verdict flipped purely on slot position



def run_position_bias_check(query: str, response_x: str, response_y: str, judge_fn) -> PairwiseResult:

    """

    Run the same comparison twice with positions swapped. An unbiased judge

    should pick the same underlying response both times regardless of which

    slot it occupies. A flip indicates position bias, not a genuine quality signal.

    """

    # Round 1: response_x in slot A, response_y in slot B

    verdict_1 = judge_fn(response_x, response_y)

    winner_1  = response_x if verdict_1 == "A" else response_y



    # Round 2: swap -- response_y now in slot A, response_x in slot B

    verdict_2 = judge_fn(response_y, response_x)

    winner_2  = response_y if verdict_2 == "A" else response_x



    return PairwiseResult(

        query=query,

        verdict_original_order=verdict_1,

        verdict_swapped_order=verdict_2,

        position_consistent=(winner_1 == winner_2),

    )



def audit_position_bias(test_pairs: list[tuple], judge_fn, n_trials: int = 50) -> dict:

    """

    Run many position-swapped comparisons and report the rate of

    inconsistent verdicts. A high rate means your judge is responding

    to slot position, not response quality -- and any score it produces

    should be treated with real skepticism until this is addressed.

    """

    results = []

    for query, resp_x, resp_y in test_pairs:

        for _ in range(n_trials // len(test_pairs)):

            results.append(run_position_bias_check(query, resp_x, resp_y, judge_fn))



    inconsistent = [r for r in results if not r.position_consistent]

    return {

        "total_trials": len(results),

        "inconsistent_count": len(inconsistent),

        "inconsistency_rate": round(len(inconsistent) / len(results), 3),

    }





if __name__ == "__main__":

    # In production, replace this with a real call to your judge LLM comparing

    # response_1 vs response_2 and returning "A" or "B".

    def your_judge_function(response_1: str, response_2: str) -> str:

        # Placeholder -- wire this up to your actual judge model call.

        raise NotImplementedError("Replace with your real LLM judge call")



    test_pairs = [

        ("Summarize the quarterly report", "Response variant A", "Response variant B"),

    ]



    # Demo with a simulated 70%-position-A-biased judge, for illustration

    random.seed(7)

    def demo_biased_judge(r1, r2):

        return "A" if random.random() < 0.7 else "B"



    report = audit_position_bias(test_pairs, demo_biased_judge, n_trials=200)

    print(f"Inconsistency rate: {report['inconsistency_rate'] * 100:.1f}%")

    print(f"({report['inconsistent_count']}/{report['total_trials']} trials flipped purely on position swap)")

    print("\nA rate meaningfully above 0% indicates position bias in your judge setup.")

    print("Mitigation: average scores across both orderings, or use a separate judge")

    print("model from a different family than the model being evaluated.")
1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
31
32
33
34
35
36
37
38
39
40
41
42
43
44
45
46
47
48
49
50
51
52
53
54
55
56
57
58
59
60
61
62
63
64
65
66
67
68
69
70
71
72
73
74
75
76
77
# position_bias_audit.py
# Prerequisites: none beyond Python's standard library (random, dataclasses)
# Run: python position_bias_audit.py
import
random
from
dataclasses
import
dataclass
@
dataclass
class
PairwiseResult
:
query
:
str
verdict_original_order
:
str
verdict_swapped_order
:
str
position_consistent
:
bool
# False means the verdict flipped purely on slot position
def
run_position_bias_check
(
query
:
str
,
response_x
:
str
,
response_y
:
str
,
judge_fn
)
->
PairwiseResult
:
""
"
Run the same comparison twice with positions swapped. An unbiased judge
should pick the same underlying response both times regardless of which
slot it occupies. A flip indicates position bias, not a genuine quality signal.
"
""
# Round 1: response_x in slot A, response_y in slot B
verdict_1
=
judge_fn
(
response_x
,
response_y
)
winner_1
=
response_x
if
verdict_1
==
"A"
else
response
_
y
# Round 2: swap -- response_y now in slot A, response_x in slot B
verdict_2
=
judge_fn
(
response_y
,
response_x
)
winner_2
=
response_y
if
verdict_2
==
"A"
else
response_x
return
PairwiseResult
(
query
=
query
,
verdict_original_order
=
verdict_1
,
verdict_swapped_order
=
verdict_2
,
position_consistent
=
(
winner_1
==
winner_2
)
,
)
def
audit_position_bias
(
test_pairs
:
list
[
tuple
]
,
judge_fn
,
n_trials
:
int
=
50
)
->
dict
:
""
"
Run many position-swapped comparisons and report the rate of
inconsistent verdicts. A high rate means your judge is responding
to slot position, not response quality -- and any score it produces
should be treated with real skepticism until this is addressed.
"
""
results
=
[
]
for
query
,
resp_x
,
resp_y
in
test_pairs
:
for
_
in
range
(
n_trials
// len(test_pairs)):
results
.
append
(
run_position_bias_check
(
query
,
resp_x
,
resp_y
,
judge_fn
)
)
inconsistent
=
[
r
for
r
in
results
if
not
r
.
position_consistent
]
return
{
"total_trials"
:
len
(
results
)
,
"inconsistent_count"
:
len
(
inconsistent
)
,
"inconsistency_rate"
:
round
(
len
(
inconsistent
)
/
len
(
results
)
,
3
)
,
}
if
__name__
==
"__main__"
:
# In production, replace this with a real call to your judge LLM comparing
# response_1 vs response_2 and returning "A" or "B".
def
your_judge_function
(
response_1
:
str
,
response_2
:
str
)
->
str
:
# Placeholder -- wire this up to your actual judge model call.
raise
NotImplementedError
(
"Replace with your real LLM judge call"
)
test_pairs
=
[
(
"Summarize the quarterly report"
,
"Response variant A"
,
"Response variant B"
)
,
]
# Demo with a simulated 70%-position-A-biased judge, for illustration
random
.
seed
(
7
)
def
demo_biased_judge
(
r1
,
r2
)
:
return
"A"
if
random
.
random
(
)
<
0.7
else
"B"
report
=
audit_position_bias
(
test_pairs
,
demo_biased_judge
,
n_trials
=
200
)
print
(
f
"Inconsistency rate: {report['inconsistency_rate'] * 100:.1f}%"
)
print
(
f
"({report['inconsistent_count']}/{report['total_trials']} trials flipped purely on position swap)"
)
print
(
"\nA rate meaningfully above 0% indicates position bias in your judge setup."
)
print
(
"Mitigation: average scores across both orderings, or use a separate judge"
)
print
(
"model from a different family than the model being evaluated."
)
How to run (no dependencies required):
python position_bias_audit.py
1
python
position_bias_audit
.
py
Output (with the simulated biased judge):
Inconsistency rate: 55.5%

(111/200 trials flipped purely on position swap)



A rate meaningfully above 0% indicates position bias in your judge setup.

Mitigation: average scores across both orderings, or use a separate judge

model from a different family than the model being evaluated
1
2
3
4
5
6
Inconsistency
rate
:
55.5
%
(
111
/
200
trials
flipped
purely
on
position
swap
)
A
rate
meaningfully
above
0
%
indicates
position
bias
in
your
judge
setup
.
Mitigation
:
average
scores
across
both
orderings
,
or
use
a
separate
judge
model
from
a
different
family
than
the
model
being
evaluated
A 55% flip rate is a severe case used here for clarity; most real judges aren’t this biased, but even a flip rate in the 10–15% range — which shows up regularly in production judge setups — is enough to make a borderline pass/fail decision unreliable. The fix costs one extra LLM call per evaluation: run both orderings and average, or, more robustly, use a judge model from a different family than whichever model produced the responses being scored, which directly addresses the self-preference issue at the same time.
Choosing Your Stack
There’s no universal answer here, but the decision tree is fairly clean once you know what you’re building:
RAG application
: start with RAGAS for the retrieval-specific metrics (faithfulness, context precision, context recall). Add DeepEval alongside it if you need broader coverage of toxicity, bias, and general correctness in the same test suite.
General chatbot or content-generation feature with CI requirements
: DeepEval, run as part of your existing pytest suite, gating merges on a quality threshold.
Prompt iteration across multiple models, or security/red-teaming
: Promptfoo. Its YAML-driven config makes multi-model comparison fast, and its built-in attack suite is the most complete open-source option for adversarial testing.
Production tracing and human review after deployment
: LangSmith if your stack is already built on LangChain or LangGraph; Braintrust if your stack is more heterogeneous and you want a platform that isn’t coupled to one framework.
The pattern experienced teams converge on is two tools, not one: a lightweight framework for CI-time gating, paired with a platform for ongoing monitoring, regression tracking, and the human annotation that no automated metric fully replaces.
Conclusion
No framework here wins outright, because they’re not solving the same problem. RAGAS, DeepEval, and Promptfoo each fit a different shape of evaluation need, and the real architectural decision is usually “
which two of these do I run together
,” not “
which one is best.
”
The bigger risk isn’t picking the wrong tool from this list; it’s trusting whatever score an LLM judge produces without checking it for the biases documented above. Position bias, self-preference, and verbosity bias aren’t edge cases buried in an academic paper; they’re measurable effects that show up in ordinary judge setups, including the ones inside the very frameworks this article just walked through. The frameworks give you the scoring mechanism. The audit habit in the position-bias section is what makes the resulting number worth trusting.
Share
Post
Share
More On This Topic
LLM Orchestration Frameworks Compared: LangChain vs.…
Agent Evaluation: How to Test and Measure Agentic AI…
Understanding RAG Part IV: RAGAs & Other Evaluation…
What Does Stochastic Mean in Machine Learning?
Why Machine Learning Does Not Have to Be So Hard
How Does Attention Work in Encoder-Decoder Recurrent…
Building AI Agents? Here Are Some Anti-Patterns to Avoid.
Scikit-Ollama for Scikit-LLM/Ollama Integration
2 Responses to
LLM Evaluation Frameworks Compared: How to Actually Measure What Your Model Does
Gleb Geinke
July 16, 2026 at 6:35 pm
#
Beautiful AI slop.
Maybe evals should have been used to check the quality of this article
Reply
James Carmichael
July 17, 2026 at 7:13 am
#
Hi Gleb…We appreciate your feedback. If you have any specific items you would like to discuss we can help clarify.
Reply
Leave a Reply
Click here to cancel reply.
Comment
*
Name
(required)
Email (will not be published)
(required)
Δ
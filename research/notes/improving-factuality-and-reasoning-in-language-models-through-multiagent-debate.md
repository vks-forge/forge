---
title: Improving Factuality and Reasoning in Language Models through Multiagent Debate
id: improving-factuality-and-reasoning-in-language-models-through-multiagent-debate
tags:
- ai-software-factory-architecture-58e4cc
- adversarial-review
- multiagent-debate
created: '2026-10-12T08:29:06.996735Z'
updated: '2026-10-12T08:31:48.425071Z'
source: https://composable-models.github.io/llm_debate/
source_domain: composable-models.github.io
fetched_at: '2026-10-12T08:29:06.994867Z'
fetch_provider: builtin
status: draft
type: note
tier: unknown
content_type: unknown
deprecated: false
summary: 'MIT/Google Brain paper (Du, Li, Torralba, Tenenbaum, Mordatch; ICML 2024,
  arXiv 2305.14325) introducing multiagent debate: multiple instances of the same
  (or different) LLM propose answers, critique each other over several rounds, then
  converge on a final answer. Shown to substantially improve mathematical/strategic
  reasoning and factual accuracy across six benchmarks versus single-agent inference,
  with performance scaling further as agent count or debate rounds increase. Demonstrates
  cross-model debate (ChatGPT + Bard) correcting a GSM8K error neither model solved
  alone. Project page also links four follow-on papers (Multiagent Finetuning, Multi-Agent
  Verification, SLM-MUX, Economy of Minds) extending the ''society of minds'' line
  directly relevant to adversarial model review architectures.'
---

Improving Factuality and Reasoning in Language Models through Multiagent Debate
Improving Factuality and Reasoning in Language Models through Multiagent Debate
Yilun Du
1
,
Shuang Li
1
,
Antonio Torralba
1
,
Joshua B. Tenenbaum
1
,
Igor Mordatch
2
1
MIT
2
Google Brain
ICML 2024
description
Paper
code
Code
Your browser does not support the video tag.
Abstract
Large language models (LLMs) have recently shown remarkable progress in language generation, understanding, and few-shot learning. At the same time, a growing body of work has explored how prompting strategies such as verification, self-consistency, and scratchpads can further improve their performance.
            In this paper, we present a complementary approach in which multiple instances of a language model propose answers, critique one another, and debate over several rounds before reaching a final answer. We show that this procedure substantially improves mathematical and strategic reasoning across a range of tasks. It also improves factual accuracy, reducing the fallacies and hallucinations that contemporary models often produce. Our method can be applied directly to existing black-box models and uses the same overall procedure and prompts across all of the tasks we study.
            Overall, our findings suggest that a "society of minds" approach can significantly strengthen language models and offers a promising direction for further advances in language generation and reasoning.
Results
Most approaches for improving language models focus on making a single generator perform better. In contrast, we treat multiple instances of the same language model as a
multiagent society
, in which different agents propose answers and critique the answers proposed by others. The final answer produced by this debate procedure is both more factually accurate and more effective on reasoning tasks. Below, we compare multiagent debate with standard single-agent generation across several benchmarks covering reasoning and factuality.
Multiagent Debate Improves Reasoning and Factual Accuracy.
Accuracy of traditional inference and our multi-agent debate over six benchmarks (chess move optimality reported as a normalized score)
Performance with More Agents and Rounds of Debate
In the main experiments, we use three language-model agents that debate for two rounds, largely for computational reasons. However, the performance of multiagent debate can improve further when we increase either the number of agents or the number of debate rounds. Below, we show arithmetic accuracy as each of these factors is varied.
(a) Performance with Increased Agents.
Arithmetic performance improves as the number of underlying agents involved in debate increases.
(b) Performance with Increased Rounds.
Arithmetic performance improves as the number of rounds of underlying debate increases.
Debate Between ChatGPT and Bard
Although we mainly study debate among multiple instances of the same language model, the same procedure can also be used to combine different language models. This lets the strengths of one model compensate for the weaknesses of another. Below, we show how a combination of ChatGPT and Bard can work together to solve a difficult grade-school math problem.
Debate Between ChatGPT and Bard.
Illustration of debate between different models. While both models generate incorrect responses to the initial GSM8K problem, debate between the models enables them to generate the correct final answer.
Paper
Our Work on Multiagent Intelligence
Multiagent debate motivated a broader line of work on
scaling intelligence through multiagent computation
. Our subsequent papers explore how agents can learn complementary roles, verify candidate solutions, and coordinate their computation more effectively. For a broader perspective connecting these ideas, see
Generalization by Construction
.
Multiagent Finetuning: Self Improvement with Diverse Reasoning Chains
We study how to
train
agents to become better members of a collective. Starting from the same base model, we fine-tune different agents on different interaction-generated reasoning traces. This preserves useful diversity, encourages specialization, and turns multiagent computation into a learned inference procedure rather than repeated sampling from interchangeable copies.
Multi-Agent Verification: Scaling Test-Time Compute with Multiple Verifiers
We show that additional computation can be spent not only on generating more candidate answers, but also on
verifying
them. Multiple verifiers, each focused on different aspects of a solution, can be combined to evaluate candidate outputs and help select a stronger final answer.
SLM-MUX: Orchestrating Small Language Models for Reasoning
Instead of relying on a single large language model, we ask how to
select and combine complementary smaller models
. The main idea is to route each problem to the most useful subset of models, showing that the organization of computation—and the complementarity of the participating models—can matter as much as raw model scale.
Economy of Minds: Emerging Multi-Agent Intelligence with Economic Interactions
We investigate how a larger population of agents can be
organized adaptively
. Economic interactions let agents compete and cooperate, helping determine which specialists should act next and how a collective should allocate its computation on the current problem.
BibTeX
```
@article{du2023improving,
title={Improving factuality and reasoning in language models through multiagent debate},
author={Du, Yilun and Li, Shuang and Torralba, Antonio and Tenenbaum, Joshua B and Mordatch, Igor},
journal={arXiv preprint arXiv:2305.14325},
year={2023}
}
```
This webpage template was recycled from
here
.
Accessibility
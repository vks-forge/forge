---
title: 'Learning to Break:'
id: learning-to-break
tags:
- ai-software-factory-architecture-58e4cc
- multi-agent-debate
- madke
- open-source-vs-proprietary
created: '2026-10-12T08:37:38.009559Z'
updated: '2026-10-12T08:37:55.068803Z'
source: https://arxiv.org/abs/2312.04854
source_domain: arxiv.org
fetched_at: '2026-10-12T08:37:38.007584Z'
fetch_provider: builtin
status: draft
type: note
tier: institutional
content_type: paper
deprecated: false
summary: Wang, Du, Yu, Chen et al. (Harbin Institute of Technology, Sun Yat-sen University,
  Zhejiang University; arXiv:2312.04854, Dec 2023, updated Jul 2024) introduce MADKE
  (Multi-Agent Debate with Knowledge-Enhanced), the direct baseline that the later
  Tool-MAD paper (2601.04742, also fetched in this batch) claims to improve on. MADKE
  addresses the cognitive islands problem, where debating agents have limited and
  different knowledge backgrounds, by injecting a shared retrieval knowledge pool
  into the debate and letting each agent adaptively decide per-round whether it needs
  to pull from that pool. Unlike Tool-MAD, MADKEs retrieval is static (built once
  before/at the start of debate) rather than iteratively re-queried per round based
  on the opponents argument. On six benchmark datasets MADKE achieves state-of-the-art
  results versus prior single-agent and multi-agent debate baselines; notably, MADKE
  running on the open-source Qwen1.5-72B-Chat model surpasses GPT-4 by +1.26% on average
  across the six datasets, demonstrating that knowledge-enhanced multi-agent debate
  architecture can let a smaller open-source model match or beat a much larger proprietary
  model's raw performance. This is a directly measured, open-source-reproducible (code
  released on GitHub) data point for the economic argument that multi-agent orchestration
  can substitute for scaling a single large model.
raw_file: raw/learning-to-break.pdf
doi: arXiv:2312.04854
---

*Suggested by [[tool-mad-a-multi-agent-debate-framework-for-fact-verification]] — MADKE is the direct baseline Tool-MAD claims to improve on with static vs iterative evidence retrieval*

Learning to Break:
Knowledge-Enhanced Reasoning in Multi-Agent Debate System
Haotian Wang1, Xiyuan Du1, Weijiang Yu2∗, Qianglong Chen3
Kun Zhu1, Zheng Chu1, Lian Yan1, Yi Guan1∗
1Harbin Institute of Technology
2Sun Yat-sen University
3 Zhejiang University
{wanght1998,weijiangyu8,chenqianglong.ai}@gmail.com, guanyi@hit.edu.cn
{xydu,kzhu,zchu}@ir.hit.edu.cn, yanlian0216@163.com
Abstract
Multi-agent debate system (MAD) imitating
the process of human discussion in pursuit of
truth, aims to align the correct cognition of
different agents for the optimal solution. It is
challenging to make various agents perform
right and highly consistent cognition due to
their limited and different knowledge back-
grounds (i.e., cognitive islands), which hinders
the search for the optimal solution. To address
the challenge, we propose a novel Multi-Agent
Debate with Knowledge-Enhanced framework
(MADKE) to promote the system to find the
solution. First, we involve a shared retrieval
knowledge pool in the debate process to solve
the problem of limited and different knowl-
edge backgrounds. Then, we propose an adap-
tive knowledge selection method to guarantee
the accuracy and personalization of knowledge.
This method allows agents to choose whether
to use external knowledge in each conversation
round according to their own needs. Our ex-
perimental results on six datasets show that our
method achieves state-of-the-art results com-
pared to existing single-agent and multi-agent
methods. Further analysis reveals that the in-
troduction of retrieval knowledge can help the
agent to break cognitive islands in the debate
process and effectively improve the consis-
tency and correctness of the model. Moreover,
MADKE using Qwen1.5-72B-Chat surpasses
GPT-4 by +1.26% on average in six datasets,
which validates that our method can help open-
source LLMs achieve or even surpass the per-
formance of GPT-4. Our code is available at
https://github.com/FutureForMe/MADKE.
1
Introduction
Multi-expert debates utilize multiple perspectives
and critical discussions to facilitate rapid error cor-
rection and the integration of diverse knowledge,
significantly improving the quality and scientific
rigour of decision-making (Slonim et al., 2021; Ke
∗Corresponding author.
Agent1’s Knowledge 
Space
Agent2’s 
Knowledge Space
Knowledge Space
 for Question
Knowledge Space
 for Question
Retrieval 
Knowledge Space
Knowledge Space
Knowledge Space
(a) Cognitive islands.
(b) Shared retrieval knowledge 
connects knowledge space.
Agent1’s Knowledge 
Space
Agent2’s 
Knowledge Space
Figure 1: The knowledge space of agents and required
knowledge space for answering questions. (a) Agents
have limited and different knowledge spaces, leading to
the cognitive islands problem. (b) Constructing a shared
knowledge pool by retrieving external knowledge re-
duces background knowledge differences and connects
the knowledge spaces of agents.
et al., 2024; Chen et al., 2023b). This promotes
interdisciplinary collaboration and the fusion of
knowledge across different fields, playing a crucial
role in medical consultations, judicial debates, and
policy-making (Smit et al., 2023; Hua et al., 2023;
Williams et al., 2023). Large language models
(LLMs) have demonstrated remarkable advantages
in various natural language processing (NLP) tasks
due to their efficient semantic understanding and
language generation capabilities (OpenAI, 2023;
Touvron et al., 2023; Pu et al., 2023). Employing
LLMs as the expert brain in multi-expert debates
for dialectical conversations and knowledge inte-
gration can simulate real expert dialogues more
effectively and ensure extensive knowledge cover-
age (Xiao et al., 2024).
Current research has developed LLM-based
multi-agent debate (MAD) systems (Qian et al.,
2023; Wang et al., 2024). They utilize LLMs as the
decision-making brains of the agents and achieve
information integration through collaborative or
competitive interactions during discussions, effec-
tively enhancing model consistency (Li et al., 2023;
Du et al., 2023; Xiong et al., 2023; Xu et al., 2023).
The success of these works largely relies on the
diversity of LLMs, which ensures the provision
arXiv:2312.04854v2  [cs.CL]  11 Jul 2024


---

Question: On what date in 1969 did Neil Armstrong first set foot on the moon? 
The answer is [July 11, 1969 ].
The answer is [July 20, 1969].
I don’t agree the other agent. 
The answer is [July 20, 1969]. 
I don't need knowledge.
Shared Knowledge Pool
Knowledge [1], [3] can 
help me.
Knowledge [1], [2] is 
helpful.
(a) Cognitive islands leads to consistent but wrong results.
(b) Adaptively introducing shared knowledge into debates.
The answer is [July 11, 1969]. 
The answer is [July 20, 1969]. 
The other agent is correct. The 
answer is [July 20, 1969]. 
Knowledge [1], [3] can 
help me.
Shared Knowledge Pool
The answer is [July 11, 1969 ].
The answer is [July 11, 1969].
Agent 1
Agent 1
Agent 1
Agent 1
Agent 2
Agent 2
Agent 2
Agent 2
Round 1
Round 2
Round 1
Round 2
Figure 2: Comparison on whether to introduce exter-
nal knowledge. (a) The cognitive islands problem in
debates often leads to consistent but wrong outcomes.
(b) Adaptively introducing shared knowledge guaran-
tees both accuracy and personalization, alleviating the
cognitive islands problem.
of varied perspectives and insights, facilitating a
comprehensive analysis of problems and avoiding
bias, thereby increasing the robustness and relia-
bility of the models (Chen et al., 2023a; Keskar
et al., 2019). However, this diversity can also lead
to differences in the internal knowledge activated
by the models (Xu et al., 2024), creating back-
ground knowledge disparities among agents and
causing cognitive islands issues, as illustrated in
Figure 1(a). Cognitive islands refer to the situ-
ation where agents, due to limited and differing
background knowledge, stubbornly adhere to incor-
rect viewpoints or easily change correct viewpoints
when their knowledge space is insufficient to an-
swer questions, making it difficult to achieve cor-
rect and consistent solutions. Specifically, as shown
in Figure 2(a), Agent1 initially holds an incorrect
viewpoint, while Agent2 is correct; during subse-
quent debates, Agent1 persists with the incorrect
viewpoint, and Agent2 changes its correct view-
point, resulting in incorrect reasoning outcomes.
Additionally, the hallucination (Huang et al., 2023;
Yin et al., 2023) of LLMs introduces factual errors
in the reasoning process, further exacerbating the
impact of cognitive islands. Thus, breaking the bar-
riers of cognitive islands among multiple agents is
crucial for improving the model’s cognitive consis-
tency and reasoning performance.
Retrieval-augmented generation (RAG) provides
LLMs with broader knowledge coverage and empir-
ical support by retrieving external knowledge (Izac-
ard et al., 2022; Feng et al., 2023).
There-
fore, we propose a novel multi-agent debate with
knowledge-enhanced framework (MADKE) to of-
fer agents a shared knowledge platform that re-
duces background knowledge differences. First,
we introduce retrieved external knowledge into the
multi-agent debate reasoning to connect the cog-
nitive spaces of different agents and mitigate the
cognitive islands problem, as illustrated in Figure
1(b). Further, to avoid misleading decisions caused
by noise in retrieved knowledge and the weaken-
ing of agent personalization, we propose an adap-
tive knowledge selection method. This method
allows agents to choose whether to use external
knowledge based on their needs before expressing
their views in each round, thereby ensuring the ac-
curacy and personalization of the knowledge, as
shown in Figure 2(b). We conducted experiments
using different LLMs across six datasets, and the
results showed that our model achieved excellent
performance, demonstrating strong applicability.
Further analysis revealed that introducing exter-
nal retrieval knowledge effectively mitigates the
cognitive islands problem in multi-agent debate
systems. Moreover, applying our method to the
Qwen1.5-72B-Chat model resulted in an average
improvement of +1.26% over GPT-4 across the six
datasets, indicating that our approach can signif-
icantly enhance the performance of open-source
LLMs to reach the level of more advanced models.
The contributions of this work are as follows:
• We proposed a novel multi-agent debate with
knowledge-enhanced framework that demon-
strated excellent performance across various
LLMs, showcasing strong applicability.
• We provided a shared knowledge pool for
agents in the debate, reducing background
knowledge disparities and connecting the
knowledge spaces of different agents, effec-
tively alleviating the cognitive islands prob-
lem.
• We introduced an adaptive knowledge selec-
tion method, allowing agents to choose shared
knowledge based on their needs before ex-
pressing their views, ensuring accuracy and
personalization of the knowledge.
• Experimental results showed that our method
achieved outstanding performance and demon-
strated good generalizability. Additionally,


---

this approach helped open-source LLMs reach
the performance levels of more advanced mod-
els.
2
Related Work
2.1
Multi-Agent Collaboration
The outstanding performance of LLMs (Wei et al.,
2022) has laid the groundwork for developing au-
tonomous agents (Gravitas, 2023). As an essen-
tial aspect of autonomous agents, multi-agent col-
laboration has received widespread attention and
is divided into cooperative and adversarial inter-
action (Xi et al., 2023). Cooperative interaction
requires the construction of agents with different
roles, each of which performs its own duties and
works together to complete the final task (Li et al.,
2023; Zhang et al., 2023). For example, Park et al.
(2023) demonstrated that generative agents could
produce believable individual and emergent social
behaviours. Further, Qian et al. (2023) carefully
designed agents with different roles to complete
the software development.
Adversarial interactive methods usually build
multiple agents and complete reasoning tasks in a
debate manner (Fu et al., 2023; Wang et al., 2023;
Xiong et al., 2023). Du et al. (2023) and Liang et al.
(2023) proposed using the form of multi-agent de-
bate to improve the consistency and reasoning capa-
bilities of language models. Chan et al. (2023) used
the multi-agent debate to evaluate the reply quality
of LLMs. Benefiting from the diversity generated
by language models, existing multi-agent debate
methods have achieved notable success. However,
this diversity, coupled with the issue of hallucina-
tions, can result in cognitive islands. In contrast to
existing approaches, we propose integrating shared
knowledge to connect the knowledge spaces be-
tween agents, thereby breaking down cognitive is-
lands.
2.2
Retrieval Augmented Models
Incorporating external knowledge has become a
pivotal strategy to fill knowledge gaps in LLMs, en-
hance their knowledge coverage, and mitigate hallu-
cinations (Shuster et al., 2021; Izacard et al., 2022;
Zou et al., 2024). Additionally, introducing exter-
nal knowledge relevant to the query via prompts
can improve the model’s reasoning capabilities(Shi
et al., 2023; Ram et al., 2023). Yao et al. (2022)
combined reasoning and action in LLMs, guiding
them to invoke external retrieval modules via a few-
shot approach. To further enhance retrieval capabil-
ities, multiple-round retrieval-enhanced reasoning
methods were proposed (He et al., 2022; Shao et al.,
2023; Jiang et al., 2023; Trivedi et al., 2023). Addi-
tionally, some works have utilized search engines
for knowledge retrieval, aiding LLMs in complex
reasoning tasks (Nakano et al., 2021; Liu et al.,
2023). Compared to existing methods, we fully
consider the importance of personalized knowledge
in multi-agent debates and propose an adaptive
knowledge selection method. This method allows
agents to autonomously choose relevant knowledge
from a shared knowledge pool, thereby filtering out
noisy knowledge and ensuring both accuracy and
personalization.
3
Method
In this work, we propose a multi-agent debate
framework based on knowledge enhanced to mit-
igate the challenges posed by cognitive islands.
The procedure is depicted in Algorithm 1, with an
overview of the methodology illustrated in Figure 3.
We introduce the construction and utilization meth-
ods of the shared knowledge pool in § 3.1 and detail
the multi-agent debate with knowledge-enhanced
framework in § 3.2.
3.1
Shared Knowledge Pool
Due to the limitations of the agents’ background
knowledge and the differences in background
knowledge among different agents, agents en-
counter cognitive islands during debates. Drawing
from existing methods of knowledge enhancement,
we construct a shared knowledge pool by retrieving
knowledge about queries, and allow agents to adap-
tively select this knowledge to ensure accuracy and
personalization of the knowledge.
3.1.1
Construction of Shared Knowledge Pool
To ensure the quality and timeliness of retrieved
knowledge, we selected Wikipedia and the Google
search engine to construct the shared knowledge
pool.
Wikipedia Retrieval.
To effectively retrieve
knowledge from the Wikipedia corpus, we utilize
the dense passage retriever (DPR) (Karpukhin et al.,
2020). DPR employs the twin-tower mechanism
for encoding questions and passages, which is both
straightforward to implement and yields superior
results. In the search results, we retained the top 5
most relevant passages.


---

… I don't need knowledge.
Based on the knowledge provided, 
Neil Armstrong first set foot on the 
moon on [July 11, 1969].
Based on the knowledge provided, Neil 
Armstrong first set foot on the moon 
during 11 mission on [July 20, 1969].
Based on the knowledge provided and other agent, Neil Armstrong first set foot on the moon on July 
20, 1969. This was during the Apollo 11 mission. Therefore, the answer is [July 20, 1969].
Based on the knowledge provided, the time should be local time. Neil Armstrong first set foot on the 
moon during 11 mission on July 20, 1969. Therefore the answer is [July 20, 1969].
Based on the responses from Debater1 and Debater 2, it is clear that Neil Armstrong first set foot on 
the moon on July 20, 1969 (local time), during the Apollo 11 mission. Therefore the final answer is 
[July 20, 1969].
[Yes]
Answer consistent, 
debate over.
[No] 
Answer inconsistent, 
debate continue.
…, the most helpful 
knowledge is [3].
…, the most helpful 
knowledges is [3], [12].
…, the most helpful 
knowledge is [3].
Shared Knowledge Pool
Shared Knowledge Pool
Shared Knowledge Pool
Question: On what date in 1969 did Neil Armstrong first set foot on the moon? 
Simultaneous-Talk
Orderly-Talk(One by One)
Summary
Debater No.1
Debater No.2
Judge
Summarizer
Role Definition
Figure 3: The framework of our multi-agent debate. Upon receiving the question, debaters initially present their
views in the simultaneous-talk stage, followed by orderly individual debates in the next stage. Before making each
point, they select relevant knowledge from the shared knowledge pool. A judge then assesses whether to conclude
the debate after each round, and a summarizer compiles the final answers post-debate.
Google Retrieval.
Similar to Luo et al. (2023),
we input queries into the Google search engine
and return up to the top 10 search results. Each
result contains fields such as a title, a brief descrip-
tion, page content, and page URL. Considering the
length of web page content and potential noise, we
add only brief descriptions to the shared knowl-
edge pool to assist agents in selecting the most
appropriate knowledge.
Based on the above retrieval method, we can con-
struct a shared knowledge pool for each question q,
with the specific formula as follows:
SKPool(q) = WR(q) ∪GSE(q)
(1)
where WR(·) represents the Wikipedia retriever
and GSE(·) represents the Google search engine
retrieval.
3.1.2
Adaptive Knowledge Selection
Knowledge retrieved often contains irrelevant noise
knowledge, which can negatively impact agents
and lead to incorrect reasoning outcomes. Addition-
ally, as agents may produce different viewpoints
throughout a debate, supplying identical knowl-
edge for each agent can impede their argumentative
thinking. Consequently, we propose an adaptive
knowledge selection method, which allows agents
to independently identify and select the most bene-
ficial knowledge from the shared knowledge pool
before generating their viewpoints. This method
filters out noise knowledge and provides personal-
ized knowledge for each agent, ensuring they can
engage in effective debates. The specific formula
is shown in Eq. (2). For further details, see Prompt
3.1.
Kr
i =
(
KnoSelect(q, SKPool(q))
r = 1
KnoSelect(q, s(r−1)
i
, SKPool(q))
r > 1
(2)
where r represents the debate round, s(r−1)
i
repre-
sents the stance of debater Di in r−1-th round, and
Kr
i represents the knowledges chosen by debater
Di before expressing their viewpoint in the r-th
round.
3.2
Knowledge-Enhanced Multi-Agent
Debate
We propose a knowledge-enhanced multi-agent de-
bate framework with the algorithm outlined in Al-
gorithm 1. By introducing shared knowledge, this
framework breaks down cognitive islands and con-
nects the knowledge spaces of different agents, ef-
fectively improving cognitive consistency and the
accuracy of reasoning.


---

Prompt 3.1: Adaptive Knowledge Selection
Please select knowledge from the knowledge pool that
will help you answer the question. If the knowledge pool
does not contain the information needed to answer the
question, add [No Found] at the end of your response.
If the knowledge pool has knowledge that can help you
answer the question, please return up to 3 of the most
helpful knowledge. Put the number in square brackets.
{knowledges}
{agent_history_answer} #Second round and beyond
Question: {question}
Answer: Let’s think step by step!
3.2.1
Role Definition
Our debate framework is structured around three
key roles: the debater, the judge, and the summa-
rizer. Each role has specific responsibilities, as
outlined below. See the Appendix A of role defini-
tion prompts.
Debater.
The debater has two primary duties:
First, based on the question, the debater must iden-
tify and select knowledge from the shared knowl-
edge pool to help them answer it. This process
aims to filter out irrelevant or misleading informa-
tion. Second, the debater needs to generate a new
round of responses based on the debate history and
selected knowledge.
Judge.
The responsibilities of the judge are rela-
tively simple yet pivotal. The judge is tasked with
determining whether the debaters agree with their
responses. If a consensus is reached, the judge is
responsible for promptly ending the debate. This
action is essential to prevent the debate that ex-
tended debates could transform correct responses
into incorrect ones.
Summarizer.
The role of the summarizer is to
summarize the answers given by the different de-
baters to form a final response after the debate.
Note that this role demands strict impartiality. We
require the summarizer not to have subjective opin-
ions but only to summarize the viewpoints of other
debaters.
3.2.2
Debate Process
Overall Process.
As illustrated in Figure 3, the
debate process is structured into three distinct
stages: simultaneous-talk, orderly-talk, and sum-
mary. During the simultaneous-talk stage, each
Algorithm 1 Knowledge-Enhanced Multi-Agent
Debate
Require: Complex reasoning questions, q
Require: Multiple
debaters
basen
on
LLM,
D
=
{D1, ..., Dm}
Require: Judge based on LLM, J
Require: Summarizer based on LLM, S
Require: Wikipedia Retriever WR
Require: Google Search Engine GSE
1: SKPool(q) = WR(q) ∪GSE(q)
2: for r in range(MaxDebateRound) do
3:
if r is 1 then
4:
for Di in D do
5:
Kr
i = KnoSelect(q, SKPool(q))
6:
sr
i = Di(q, Kr
i )
7:
end for
8:
else
9:
for Di in D do
10:
Kr
i = KnoSelect(q, s(r−1)
i
, SKPool(q))
11:
sr
i = Di(q, s(r−1)
1
, ..., s(r−1)
m
, Kr
i )
12:
end for
13:
end if
14:
if J(sr
1, ..., sr
m) is True then break
15:
end if
16: end for
17: ReaResult = S(sr
1, ..., sr
m)
18: return ReaResult
debater independently presents their views, uninflu-
enced by the responses of others. In the orderly-talk
stage, debaters, one after another, build upon the
views previously expressed. Each debater speaks
once per round, and after each round, the judge
evaluates whether to conclude the debate. At the
end of the debate, the summarizer will summa-
rize the final answer based on the views of all
debaters. Notably, before presenting their views,
each debater selects relevant knowledge from the
shared knowledge pool created by retrieving knowl-
edge from the Wikipedia corpus and Google engine
based on the question.
Simultaneous-Talk.
During the simultaneous-
talk, the primary duty of each debater is to in-
dependently formulate a response to the question.
This response should be as accurate as possible and
grounded in the available knowledge of their own
selection. The formula is shown in Eq (3). The
details in Prompt 3.2.
sr
i = Di(q, Kr
i )
(3)
where sr
i represents the stance of debater Di in the
r-th round.
Orderly-Talk.
In this stage, each debater is ex-
pected to consider the responses of the other de-
baters from the previous round as well as the knowl-
edge of their own choice. This process involves


---

Prompt 3.2: Simultaneous-Talk
Answer the question as accurately as possible based on
the information given, and put the answer in the form
[answer]. Here is an example:
{example}
(END OF EXAMPLE)
{knowledges}
Question: {question}
Answer: Let’s think step by step!
a discussion with the other debaters to get a final
answer collaboratively. This stage is critical for
integrating diverse viewpoints and knowledge into
a cohesive conclusion. The formula is shown in Eq
(4). The details in Prompt 3.3.
sr
i = Di(q, s(r−1)
1
, ..., s(r−1)
m
, Kr
i )
(4)
where s(r−1)
1
, ..., s(r−1)
m
represents the stances of
debater Di and the other debaters in the (r −1)-th
round.
Prompt 3.3: Orderly-Talk
There are a few other agents assigned the same task,
it’s your responsibility to discuss with them and think
critically. You can update your answer with other agents’
answers or given knowledges as advice, or you can not
update your answer. Please put the answer in the form
[answer].
{knowledges}
{answer_from_other_agents}
{your_historical_answer}
Question: {question}
Answer: Let’s think step by step!
Judge.
Upon completing each round of discus-
sion, the judge evaluates the debaters’ viewpoints
to decide whether to conclude the debate. The for-
mula is shown in Eq (5). For details, see Prompt
3.4.
JudgeResult = J(sr
1, ..., sr
m)
(5)
where
J(·)
represents
the
judge
agent,
JudgeResult
∈
{Y es, No} represents the
judgment result. Y es indicates a consensus has
been reached, and the debate ends. No indicates
no consensus has been reached, and the debate
continues.
Prompt 3.4: Judgement
The answer of the agents are typically denoted with the
[answer] format.
Your task is to extract each agent’s
answer and evaluate the consistency of their answers
to the question. If all agents have provided correct and
consistent answers, respond with [Yes]. If their answers
are inconsistent, respond with [No].
Please ensure to
encase your response - Yes or No - within square brackets.
Question: {question}
Agent Responses: {all_answers_from_agents}
Answer: Let’s think step by step!
Summary.
After the end of the debate, the re-
sponsibility of the summarizer is to summarize the
final answers from all the debaters’ responses. The
summarizer must carefully synthesize these var-
ied viewpoints into a coherent and comprehensive
conclusion. The formula is shown in Eq (6). For
details, see Prompt 3.5.
ReaResult = S(sr
1, ..., sr
m)
(6)
where S represents the summarizer agent, and
ReaResult represents the final result of the de-
bate.
Prompt 3.5: Summary
Please summarize the final answer from answer of all
agents. Place the final answer of question in the form of
[answer]. Here is some examples:
{examples}
(END OF EXAMPLE)
Question: {question}
{all_answers_from_agents}
Answer: Let’s think step by step!
4
Experiment
4.1
Dataset
We evaluate the effectiveness of our method on
three different types of datasets, including single-
hop reasoning:
TriviaQA (Joshi et al., 2017)
and NQ (Kwiatkowski et al., 2019), multi-hop
reasoning: HotpotQA (Yang et al., 2018) and
2WikiMQA (Ho et al., 2020), fact verification:
FEVER (Thorne et al., 2018). Additionally, to
further evaluate the model’s generalization in verti-
cal medical domains, similar to Xiong et al. (2024),


---

Dataset Name
Dataset Domain
Dataset Type
Answer Type
Samples
TriviaQA (Joshi et al., 2017)
Open
Single-Hop Reasoning
Generative
500
NQ (Kwiatkowski et al., 2019)
Open
Single-Hop Reasoning
Generative
500
HotpotQA (Yang et al., 2018)
Open
Multi-Hop Reasoning
Generative
500
2WikiMQA (Ho et al., 2020)
Open
Multi-Hop Reasoning
Generative
500
FEVER (Thorne et al., 2018)
Open
Fact Checking
Discriminant / 3 categories
500
MMLU-Med (Hendrycks et al., 2021)
Medicine
Multi-Choice
Discriminant / 4 categories
595
Table 1: Dataset statistics table.
we constructed MMLU-Med from six medical sub-
categories of the MMLU (Hendrycks et al., 2021)
dataset. Considering time and funding constraints,
we randomly sampled some data from each dataset
for experiments. The specific dataset statistics are
shown in Table 1. Details of the dataset are pro-
vided in the Appendix B.
4.2
Baseline
To compare the performance of our models fur-
ther, we selected some baselines from single-agent
reasoning and multi-agent debate methods and con-
ducted experiments using three backbones: GPT-
3.5-Turbo, Qwen1.5-32B-Chat, and Qwen1.5-72B-
Chat.
• Standard Prompting (Brown et al., 2020)
directly generates the final answer with a one-
shot demonstration to standardize the output
format.
• Chain-of-Thought Prompting (Kojima et al.,
2022) uses the magic prompt "let’s think step
by step" and one-shot CoT demonstration to
generate reasoning steps before the final an-
swer.
• Self Consistency (Wang et al., 2022) samples
a diverse set of reasoning paths and then se-
lects the most consistent answer by marginal-
izing all possible reasoning paths.
• Retrieval-Augmented Generation uses all
knowledge retrieved from the Google search
engine and Wikipedia to generate the final
answer.
• Multi-Agent Debate (Du et al., 2023) utilizes
multiple agents to propose and debate their
individual responses and reasoning processes
over multiple rounds to arrive at a final an-
swer.
4.3
Evaluation Metric
The evaluation metric of existing datasets mainly
uses extract match (EM) (Jiang et al., 2023). We
believe that since the answer categories are fixed
for discriminative answers, LLM can output the
answer in the correct format after given examples
in the prompt. Therefore, we use EM to evaluate
FEVER and MMLU-Med datasets. For generative
answers, EM is more stringent and cannot accu-
rately judge answers better. Therefore, for Triv-
iaQA, NQ, HotpotQA, and 2WikiMQA, in addi-
tion to using the F1 metric for evaluation, we also
extract answers from the response and use GPT-
4 (OpenAI, 2023) to evaluate the correctness based
on the ground truth answer (Zheng et al., 2023),
which is called GPT4 Score. See the Appendix C
for details.
To further evaluate cognitive islands during the
debate process, we used two metrics: the consistent
and correct ratio (Co2) and the consistency ratio
(Cons). The specific formulas are shown in Eq.
(7) - (8).
Co2 = # consistent & correct
N
(7)
Cons = # consistent
N
(8)
where N represents the total number of data.
4.4
Implementation Details
We use GPT-3.5-Turbo and GPT-4-Turbo by Azure
OpenAI API 2023-07-01-preview1 to complete our
experiments. Additionally, our experiments also
used the Qwen1.5-Chat series2 (Bai et al., 2023)
of open-source models. In order to ensure the di-
versity and stability of the debate process, we set
the temperature parameter to 0.5. The number of
agents in the experiment is 2, and the maximum
number of debate rounds is 3.
1https://learn.microsoft.com/en-us/azure/
ai-services/openai/reference
2https://huggingface.co/Qwen


---

Backbone
Model
TriviaQA
NQ
HotpotQA
2WikiMQA
FEVER
F1
GPT4 Score
F1
GPT4 Score
F1
GPT4 Score
F1
GPT4 Score
EM
GPT-4-Turbo
SP
0.828
0.902
0.459
0.692
0.472
0.566
0.265
0.284
0.608
GPT-3.5-Turbo
SP
0.761
0.778
0.390
0.532
0.331
0.384
0.190
0.210
0.548
CoT
0.715
0.772
0.418
0.588
0.333
0.410
0.165
0.190
0.556
SC
0.756
0.818
0.431
0.622
0.342
0.408
0.175
0.206
0.560
RAG
0.768
0.824
0.450
0.436
0.423
0.498
0.204
0.228
0.646
MAD
0.712
0.798
0.401
0.648
0.287
0.394
0.133
0.186
0.548
MADKE(Our)
0.728
0.830
0.453
0.736
0.405
0.542
0.205
0.274
0.612
Qwen1.5-32B-Chat
SP
0.581
0.632
0.295
0.462
0.311
0.384
0.207
0.22
0.536
CoT
0.587
0.644
0.276
0.452
0.315
0.382
0.220
0.228
0.546
SC
0.583
0.628
0.276
0.442
0.312
0.386
0.203
0.222
0.540
RAG
0.446
0.554
0.269
0.436
0.309
0.420
0.183
0.248
0.664
MAD
0.630
0.704
0.321
0.566
0.363
0.482
0.256
0.286
0.520
MADKE(Our)
0.763
0.838
0.475
0.724
0.450
0.570
0.258
0.314
0.646
Qwen1.5-72B-Chat
SP
0.665
0.706
0.378
0.550
0.332
0.428
0.226
0.26
0.596
CoT
0.715
0.776
0.406
0.648
0.431
0.514
0.275
0.324
0.625
SC
0.659
0.700
0.369
0.548
0.336
0.430
0.207
0.242
0.596
RAG
0.662
0.762
0.333
0.710
0.438
0.538
0.217
0.304
0.668
MAD
0.703
0.796
0.376
0.660
0.397
0.548
0.274
0.344
0.516
MADKE(Our)
0.787
0.874
0.479
0.748
0.495
0.622
0.284
0.350
0.686
Table 2: Comparative experimental results on all open-domain datasets. Our method surpasses GPT4 on specific
datasets. Excluding GPT4’s results, for each column of different backbone, the highest, the second figures are
highlighted by green and orange backgrounds. All the numbers are presented in %, and the total score is 100%.
Knowledge in the shared knowledge pool is
retrieved using the Google search engine and
Wikipedia corpus. For the Google search engine,
we use the Google SERP provided by Serper3. We
consider the Wikipedia dump on January 20, 2021,
and use the index provided by pyserini4 for knowl-
edge retrieval. The retrieval numbers of the Google
search engine and the Wikipedia corpus are 5 and
5.
5
Experiment Results
5.1
Main Results
The main results of our method and baseline meth-
ods are reported in Table 2. Our model achieved
competitive experimental results on five open-
domain datasets, proving the effectiveness of in-
tegrating external prior knowledge in enhancing
complex reasoning capabilities. Besides, based on
the results, we have the following key findings:
(i) Our model achieved superior performance
across all backbone settings compared to single-
agent and multi-agent baseline models.
Our
MADKE framework, built on Qwen1.5-72B-Chat,
shows an average increase of +4.6% in all metrics
compared to the state-of-the-art models across five
open-domain datasets. Specifically, on the Triv-
iaQA and HotpotQA datasets, the GPT-4 Score
3https://serper.dev/
4https://github.com/castorini/pyserini
increased by +7.8% and +7.4%, respectively. This
demonstrates that our multi-agent collaborative rea-
soning with the introduction of retrieved knowl-
edge has strong adaptability and effectiveness. By
incorporating high-quality knowledge and multi-
perspective reasoning analysis during the debate
process, our approach can more accurately ad-
dress complex problems, significantly enhancing
the model’s performance. Additionally, among all
the backbones, Qwen1.5-72B-Chat performed the
best, indicating that open-source models are grad-
ually catching up with closed-source models, pro-
gressively revealing their strong potential and com-
petitiveness.
(ii) Introducing shared knowledge can effec-
tively alleviate cognitive islands in debates. We
used the Co2 and the Cons to measure the mitiga-
tion of cognitive islands during debates, and the ex-
perimental results are shown in Table 3. The exper-
imental results show a slight decrease in the Cons
metric after introducing shared knowledge. For
example, the MADKE framework based on Qwen-
1.5-Chat showed an average reduction of -1.6%
across five datasets compared to the version with-
out knowledge. Introducing personalized knowl-
edge in the debate process enriches and broadens
the discussions, which can slightly affect consis-
tency. However, the Co2 metric increased by an
average of +7.8% compared to the version without
knowledge. The substantial improvement in the


---

Backbone
Model
TriviaQA
NQ
HotpotQA
2WikiMQA
FEVER
Co2
Cons
Co2
Cons
Co2
Cons
Co2
Cons
Co2
Cons
GPT-3.5-Turbo
w/o knowledge
0.800
0.922
0.592
0.818
0.432
0.648
0.238
0.558
0.312
0.442
w wiki knowledge
0.748
0.842
0.614
0.754
0.432
0.586
0.248
0.492
0.304
0.396
w google knowledge
0.784
0.852
0.58
0.738
0.470
0.602
0.250
0.486
0.294
0.394
w all knowledge
0.792
0.894
0.624
0.840
0.454
0.640
0.210
0.498
0.612
0.794
Qwen1.5-32B-Chat
w/o knowledge
0.686
0.958
0.522
0.944
0.474
0.930
0.256
0.832
0.600
0.982
w wiki knowledge
0.728
0.954
0.642
0.958
0.504
0.934
0.268
0.836
0.622
0.984
w google knowledge
0.838
0.984
0.696
0.972
0.546
0.942
0.322
0.840
0.640
0.980
w all knowledge
0.830
0.966
0.718
0.978
0.564
0.948
0.296
0.868
0.638
0.984
Qwen1.5-72B-Chat
w/o knowledge
0.788
0.996
0.652
0.990
0.536
0.978
0.272
0.966
0.612
0.966
w wiki knowledge
0.784
0.986
0.698
0.988
0.536
0.970
0.288
0.946
0.638
0.960
w google knowledge
0.858
0.990
0.734
0.988
0.612
0.966
0.308
0.944
0.622
0.944
w all knowledge
0.872
0.986
0.738
0.984
0.612
0.958
0.342
0.932
0.686
0.954
Table 3: The experimental results of our MADRA model under different retrieval knowledge for the Co2 and Cons
metrics. w/o and w indicate without and with knowledge. For each column of different backbone, the highest, the
second figures are highlighted by green and orange backgrounds. All the numbers are presented in % and the full
score is 100%.
Co2 metric far outweighs the minor impact on the
Cons metric. This further demonstrates that pro-
viding high-quality and personalized knowledge to
debaters helps them better understand and interpret
opposing viewpoints, effectively mitigating cogni-
tive islands and enhancing the overall quality of the
debate.
(iii) Our method has outperformed GPT-4 on
specific datasets. As shown in Table 2, our ap-
proach based on the Qwen1.5-72B-Chat model
outperformed GPT-4 in the GPT-4 Score metric
by +5.6%, +5.6%, +6.6%, and +7.8% on the NQ,
HotpotQA, 2WikiMQA, and FEVER datasets, re-
spectively. This demonstrates that organizing mul-
tiple agents in a debate format for collaborative
reasoning, combined with the introduction of accu-
rate and personalized prior knowledge during the
debate, can bridge the gap between smaller param-
eter models and GPT-4, and even surpass GPT-4’s
performance. This not only validates the effective-
ness of the multi-agent debate mechanism but also
provides new insights for the future application of
smaller parameter models across a broader range
of fields.
5.2
Ablation Study
We considered the effect of different retrieval
sources and the adaptive knowledge selection mod-
ule on model performance and conducted an ab-
lation study on all open-domain datasets to verify
their effectiveness.
5.2.1
Effect of Retrieve Source
We conducted ablation studies under four set-
tings: without using retrieval knowledge, using
only Wikipedia retrieval knowledge, using only
Google search engine retrieval knowledge, and us-
ing a combination of both. The experimental results
are shown in Figure 4.
Experimental results indicate that introducing
Wikipedia knowledge, Google search knowledge,
and both sources of knowledge led to an aver-
age improvement of +2.7%, +6.8%, and +8.1%
across five datasets compared to not introducing
any knowledge. Furthermore, the benefits of us-
ing Google search engine retrieval are more pro-
nounced than using the Wikipedia knowledge base.
This is because the Google search engine inher-
ently has sorting and filtering functions, resulting
in higher relevance and accuracy of the retrieval
results. In contrast, the Wikipedia knowledge base
stores Wikipedia page texts by cutting them into
segments of a certain length, so the retrieval results
often contain knowledge related to the question but
not directly answering it. This leads to lower bene-
fits from Wikipedia retrieval knowledge, although
it is still overall better than not using any retrieval
knowledge.
Additionally, the experimental results show that
combining retrieval knowledge from both the
Google search engine and Wikipedia yields the best
results. This is because the combined knowledge
contains more comprehensive knowledge, allow-
ing the model to better select useful knowledge to
assist in reasoning. In summary, the introduction


---

53.8
54.6
61.6
62.2
50
53
56
59
62
65
HotpotQA
27.8
30.6
33.2
35
24
26
28
30
32
34
36
38
2WikiMQA
65.6
70
73.6
74.8
60
63
66
69
72
75
78
NQ
79
78.8
86.4
87.4
76
78
80
82
84
86
88
90
TriviaQA
61.2
66.6
66.4
68.6
58
60
62
64
66
68
70
FEVER
n
 No Knowledge
n
 Only Wiki
n
 Only Google
n
 All Knowledge
Figure 4: The performance (EM for FEVER, GPT4 Score for others) of the MADKE model with the Qwen1.5-72B-
Chat backbone under different retrieval settings. No Knowledge, Only Wiki, Only Google, and All Knowledge,
respectively, indicate not using retrieval knowledge, using knowledge from the Wikipedia knowledge base, using
knowledge from the Google search engine, and using knowledge from both sources.
(a) ablation of AKS in wiki
(b) ablation of AKS in google
(c) ablation of AKS in all knowledge
Figure 5: The ablation experiment results (EM for FEVER, GPT4 Score for others) of the Adaptive Knowledge
Selection module based on Qwen1.5-72B-Chat model under different retrieval knowledge settings. with AKS and
w/o AKS indicate using and not using the Adaptive Knowledge Selection module, respectively.
and combination of different retrieval knowledge
significantly enhance the model’s reasoning perfor-
mance.
5.2.2
Importance of Adaptive Knowledge
Selection
To further investigate the importance of the adap-
tive knowledge selection module, we conducted an
ablation study based on Qwen1.5-72B-Chat across
five open-domain datasets using three retrieval set-
tings. The experimental results are shown in Figure
5.
The experimental results indicate that under all
three retrieval settings, the adaptive knowledge se-
lection module plays a crucial role in improving
model performance. This module filters out noise
knowledge and provides personalized knowledge to
the debating agents before they express their view-
points, effectively enhancing the consistency and
accuracy of the debate and, to some extent, mitigat-
ing cognitive islands. Specifically, for multi-hop
datasets like 2WikiMQA and HotpotQA, where
retrieval results rarely contain knowledge that di-
rectly supports answering the questions and often
includes much noise, the adaptive knowledge selec-
tion module has a more substantial impact, leading
to significant performance differences before and
after ablation. Additionally, the results also demon-
strate that this module has a positive effect on other
datasets, further proving its importance in enhanc-
ing the overall performance of the model.
5.3
Effect of Model Parameter Scale
To evaluate the impact of model parameters, we
conducted experiments using five different param-
eter scales of the Qwen1.5-Chat model on five
open-domain datasets. The experimental results
are shown in Figure 6.
From the experimental results, it can be observed
that the model performance improves as the model
parameter scale increases, validating the positive
correlation between parameter scale and perfor-
mance and further supporting the conclusions of
the scaling law (Kaplan et al., 2020). By comparing
our model with GPT-4’s experimental results, we
found that by adaptively introducing prior knowl-
edge in the debate, our method can achieve or even
surpass GPT-4’s performance when the parameter
scale reaches 32B.
Moreover, when the model parameters are 1.8B,
7B, and 14B, prior knowledge does not signifi-
cantly enhance model performance, indicating that


---

0
20
40
60
80
1.8B
7B
14B
32B
72B
GPT4 Score (%)
GPT4 Turbo
no knowledge
only wiki
only google
all knowledge
0
20
40
60
80
100
1.8B
7B
14B
32B
72B
GPT4 Score (%)
GPT4 Turbo
no knowledge
only wiki
only google
all knowledge
0
20
40
60
1.8B
7B
14B
32B
72B
GPT4 Score (%)
GPT4 Turbo
no knowledge
only wiki
only google
all knowledge
0
10
20
30
40
50
1.8B
7B
14B
32B
72B
GPT4 Score (%)
GPT4 Turbo
no knowledge
only wiki
only google
all knowledge
0
20
40
60
80
1.8B
7B
14B
32B
72B
EM (%)
GPT4 Turbo
no knowledge
only wiki
only google
all knowledge
(a) TriviaQA
(b) HotpotQA
(c) FEVER
(d) NQ
(e) 2WikiMQA
Figure 6: The performance of Qwen1.5-Chat series models with different parameter scales (1.8B, 7B, 14B, 32B and
72B) on all open-domain datasets using different retrieval knowledge.
prior knowledge does not have a notable impact on
debates in smaller models. However, as the model
parameters increase, the performance improvement
brought by introducing prior knowledge becomes
more apparent. This suggests that larger models
have a clearer self-awareness, and when the model
parameters exceed 32B, agents can accurately filter
out noise data from the retrieved knowledge and
select personalized knowledge that is beneficial to
them. By increasing the number of parameters in
the debate agents and introducing prior knowledge,
the model’s self-awareness can be further enhanced,
effectively mitigating the issue of cognitive islands
and accelerating the model’s application.
5.4
Parameter Sensitivity Study
To explore the impact of the number of agents
and the maximum debate rounds on model perfor-
mance, we conducted a parameter sensitivity study
based on GPT-3.5 Turbo using the TriviaQA and
HotpotQA datasets. When investigating the num-
ber of agents, we set the maximum debate rounds
to 3; when examining the maximum debate rounds,
we set the number of agents to 2.
We first studied the impact of the number of
agents and the maximum debate rounds on the av-
erage debate rounds, with the experimental results
shown in Figure 7. The results indicate that as the
maximum debate rounds increase, the average de-
bate rounds also increase. The increase is more sig-
nificant on multi-hop datasets compared to single-
hop datasets. This is because multi-hop reasoning
datasets are more challenging, and with more de-
(b) HotpotQA
(a) TriviaQA
0
1
2
3
2
3
4
5
6
Avg Round
Debate Round
Agent Number
0
1
2
3
2
3
4
5
6
Avg Round
Debate Round
Agent Number
Figure 7: Effect of the agent number and maximum
debate rounds on the average debate round.
65
70
75
80
85
2
3
4
5
6
Co2 (%)
Debate Round
Agent Number
(b) HotpotQA
(a) TriviaQA
25
35
45
55
2
3
4
5
6
Co2 (%)
Debate Round
Agent Number
Figure 8: The performance of different agent number
and maximum debate rounds on the Co2 metric.
bate rounds, agents continue to debate unresolved
issues, increasing in the average debate rounds.
Subsequently, we explored the impact of the num-
ber of agents and the maximum debate rounds on
the Co2 and Cons metrics, with the experimental re-
sults shown in Figures 8 and 9. The results demon-
strate that as the debate rounds increase, both the
Cons and Co2 of the debates improve. This sug-
gests that for more complex problems, increasing
the number of debate rounds enables the model
to reach more accurate and consistent conclusions,
thereby alleviating cognitive islands during the de-
bates.


---

(b) HotpotQA
(a) TriviaQA
70
80
90
100
2
3
4
5
6
Cons (%)
Debate Round
Agent Number
25
45
65
85
2
3
4
5
6
Cons (%)
Debate Round
Agent Number
Figure 9: The performance of different agent number
and maximum debate rounds on the Cons metric.
From the experimental results, it can be seen
that increasing the number of agents did not sig-
nificantly help with the average debate rounds,
Co2, and Cons metrics. Analyzing the experimen-
tal results reveals that as the number of agents
increases, debaters in the sequential debate pro-
cess tend to agree with the more frequently pre-
sented answers, reducing the independence and
diversity of the debate process. This lack of di-
versity prevents a significant improvement in the
model’s reasoning performance. The experimen-
tal analysis indicates that our model framework
is more suitable for real-world two-sided debate
scenarios. In this setting, agents can focus more
on high-quality knowledge exchange and effective
argumentation, thereby better-enhancing reasoning
performance and the reliability of the results. By
reducing the number of debaters, the model can
more efficiently process information, avoiding re-
dundancy and noise and improving the consistency
and correctness of the debate outcomes. Therefore,
a two-sided debate setting can better leverage the
model’s potential, leading to excellent performance
in practical applications.
5.5
Generalizability in Vertical Medical
Domain
To further evaluate the model’s performance on
vertical domain datasets, we extracted a subset
of medical-related data from the MMLU dataset,
named MMLU-Med, to assess our method. Ta-
ble ?? shows the experimental results of GPT-3.5
Turbo and Qwen1.5-72B-Chat. Note that to obtain
more relevant medical knowledge, we replaced the
Google search engine with a medical textbooks (Jin
et al., 2021) for retrieval.
We found that our model achieved the best re-
sults compared to the baseline model, indicating
that our model has strong generalization capabili-
ties in vertical domains and can be quickly trans-
ferred to other vertical fields in the future. How-
ever, our method still shows a significant perfor-
Backbone
Model
EM
GPT-4-Turbo
SP
0.861
GPT-3.5-Turbo
SP
0.655
CoT
0.681
SC
0.655
RAG
0.545
MAD
0.622
MADRA(Our)
0.697
Qwen1.5-72B-Chat
SP
0.659
CoT
0.640
SC
0.671
RAG
0.524
MAD
0.671
MADRA(Our)
0.709
Table 4: The experimental results on the MMLU-Med
dataset in the medical domain. Excluding GPT4’s re-
sults, for different backbone, the highest, the second fig-
ures are highlighted by green and orange backgrounds.
mance gap compared to GPT-4. This is primar-
ily because retrieving knowledge in vertical do-
mains is more challenging than in open domains,
resulting in lower relevance and higher noise in
the retrieved knowledge. The performance drop
in single-agent models with knowledge integration
(RAG) compared to models without knowledge
integration (SP) further supports this point. There-
fore, although our model has shown improvements
over the baseline, the extent of improvement is not
significant. In future research, we will focus on im-
proving the accuracy of vertical domain knowledge
retrieval to advance the application of our model in
vertical fields.
5.6
Token Consumption of Different Models
0
200
400
600
800
1000
Avg. Output Tokens
40
45
50
55
60
65
70
Avg. GPT4 Score (%)
SP
CoT
SC
RAG
MAD
MADRA
Figure 10: Output token consumption and performance
(GPT4 Score). Results are averaged over five open-
domain datasets.
In the computational cost of large models, the


---

cost of output tokens is greater than that of input
tokens. Therefore, we analyzed the output token
costs of our model and the baseline methods based
on the Qwen1.5-72B-Chat backbone, as shown in
Figure 10.
From the experimental results, our model incurs
higher computational costs than single-agent mod-
els, but it also achieves significant performance im-
provements, which justify these costs. Additionally,
we observed that our model reduced computational
overhead by -27.5% compared to the multi-agent
debate method (MAD) (Du et al., 2023), while im-
proving performance by +6.2%. This improvement
is due to introducing a judge agent, which assesses
whether the debaters have reached a consensus and
terminates the debate early if they have, thereby
significantly reducing the cost of output tokens. Un-
like the MAD method, which ends the debate based
on a maximum debate round limit, our approach
with the judge agent leads to more efficient debates.
By incorporating external prior knowledge, we fur-
ther enhance the consistency and correctness of the
debate outcomes, achieving better performance.
5.7
Case Study
To analyze the performance of agents during the de-
bate process, we randomly selected a case from the
HotpotQA dataset for analysis, as shown in Table 5.
In the first round of viewpoint expression, Debater
1, due to unclear self-awareness, did not use exter-
nal knowledge and produced an incorrect reasoning
answer. In the next round of debate, Debater 1 se-
lected knowledge related to their own viewpoint
(Screaming Trees) based on their previous stance
(Knowledge [8]), as well as knowledge related to
the correct answer (Knowledge [0]). By comparing
this retrieved knowledge and referencing the view-
points of other debaters, Debater 1 corrected their
erroneous stance and ultimately reached a consis-
tent and correct answer. This case demonstrates the
advantages of introducing prior knowledge, which
can alleviate cognitive islands during debates, en-
hance the overall performance of the model, and
help the model handle more complex reasoning
scenarios.
6
Conclusion and Future Work
In this paper, we propose a knowledge-enhanced
multi-agent debate framework (MADKE). First,
we introduce a shared knowledge pool to reduce
background knowledge discrepancies among dif-
ferent agents and connect their knowledge spaces.
Then, we propose an adaptive knowledge selection
method that enables agents to autonomously select
the required knowledge during the debate process,
effectively ensuring both accuracy and personal-
ization of the knowledge. Experimental results
on six datasets demonstrate that MADKE can sig-
nificantly mitigate the cognitive islands problem,
enhance cognitive consistency among agents, and
improve the accuracy of debate outcomes, achiev-
ing outstanding performance. Notably, MADKE
using Qwen1.5-72B-Chat outperformed GPT-4 by
an average of +1.26% across six datasets, highlight-
ing its effectiveness in enhancing the capabilities
of open-source large language models.
In future work, we plan to explore real-time
knowledge retrieval and effective knowledge se-
lection methods during the debate process. This
will enable agents to dynamically acquire the most
recent and relevant information to address rapidly
changing debate topics and needs. Furthermore, we
intend to introduce user interaction and feedback
mechanisms, allowing human users to participate
in the debate process and provide instant feedback.
By combining human wisdom with machine intel-
ligence, we aim to further enhance the quality of
the debates and the accuracy of the results, promot-
ing the application of this framework in real-world
scenarios.
References
Jinze Bai, Shuai Bai, Yunfei Chu, Zeyu Cui, Kai Dang,
Xiaodong Deng, Yang Fan, Wenbin Ge, Yu Han, Fei
Huang, Binyuan Hui, Luo Ji, Mei Li, Junyang Lin,
Runji Lin, Dayiheng Liu, Gao Liu, Chengqiang Lu,
Keming Lu, Jianxin Ma, Rui Men, Xingzhang Ren,
Xuancheng Ren, Chuanqi Tan, Sinan Tan, Jianhong
Tu, Peng Wang, Shijie Wang, Wei Wang, Sheng-
guang Wu, Benfeng Xu, Jin Xu, An Yang, Hao Yang,
Jian Yang, Shusheng Yang, Yang Yao, Bowen Yu,
Hongyi Yuan, Zheng Yuan, Jianwei Zhang, Xingx-
uan Zhang, Yichang Zhang, Zhenru Zhang, Chang
Zhou, Jingren Zhou, Xiaohuan Zhou, and Tianhang
Zhu. 2023. Qwen technical report. arXiv preprint
arXiv:2309.16609.
Tom Brown, Benjamin Mann, Nick Ryder, Melanie
Subbiah, Jared D Kaplan, Prafulla Dhariwal, Arvind
Neelakantan, Pranav Shyam, Girish Sastry, Amanda
Askell, Sandhini Agarwal, Ariel Herbert-Voss,
Gretchen Krueger, Tom Henighan, Rewon Child,
Aditya Ramesh, Daniel Ziegler, Jeffrey Wu, Clemens
Winter, Chris Hesse, Mark Chen, Eric Sigler, Ma-
teusz Litwin, Scott Gray, Benjamin Chess, Jack
Clark, Christopher Berner, Sam McCandlish, Alec


---

Question: Which band, Letters to Cleo or Screaming Trees, had more members?
Answer: Letters to Cleo
... On the other hand, the knowledge pool does not provide
specific information about the number of members in Screaming
Trees. Therefore, we cannot definitively determine if Letters to
Cleo or Screaming Trees had more members. [No Found]
... [1] "Letters to Cleo" - The knowledge provides infor-
mation about the band’s members, including Kay Hanley, Greg
McKenna, Michael Eisenstein, ...[3] "Screaming Trees" - The
knowledge states that Screaming Trees had four members: Mark
Lanegan, Gary Lee Conner, ...
First, let’s compare the number of members in each band.
Letters to Cleo is a band that typically consists of four members,
while Screaming Trees is a band that typically consists of five
members. Based on this information, Screaming Trees had
more members than Letters to Cleo. Therefore, the answer is
[Screaming Trees].
First, let’s gather the information about the bands. Letters
to Cleo is an alternative rock band from Boston, Massachusetts.
The band’s members are Kay Hanley, ... Based on the informa-
tion provided, Letters to Cleo had more members compared to
Screaming Trees. Therefore, the answer is [Letters to Cleo].
[NO].
Now, let’s analyze the knowledge to determine which band
had more members: From Knowledge [0], we can see that Letters
to Cleo had six members: Kay Hanley, Greg McKenna, Michael
Eisenstein, ... From Knowledge [8], we can see that Screaming
Trees had a lineup change, with Van Conner going on hiatus and
Donna Dresch filling in for him during performances...
[1] "Letters to Cleo" - The knowledge provides informa-
tion about the band’s members, including Kay Hanley, Greg
McKenna, Michael Eisenstein, Stacy Jones, Scott Riebling, and
Tom Polce. This information can be used to determine the
number of members in the band.[3] "Screaming Trees" - The
knowledge states that Screaming Trees had four members: Mark
Lanegan, Gary Lee Conner, Van Conner, and Barrett Martin.
First, let’s gather the information about the bands. Letters to Cleo is an alternative rock band from Boston, Massachusetts.
The band’s members are Kay Hanley, Greg McKenna, ... Based on the information provided, Screaming Trees had four members,
while Letters to Cleo had six members. Therefore, Letters to Cleo had more members than Screaming Trees. Therefore, the
answer is [Letters to Cleo].
First, let’s gather the information about the bands. Letters to Cleo is an alternative rock band from Boston, Massachusetts...
Based on the information provided by Agent_0, Letters to Cleo had six members, while Screaming Trees had four members.
Therefore, Letters to Cleo had more members than Screaming Trees. Therefore, the answer is [Letters to Cleo].
[Yes]
Based on the information provided by Agent 0 and Agent 1, it can be concluded that Letters to Cleo had more members
than Screaming Trees. Letters to Cleo had six members, while Screaming Trees had four members. Therefore, the final answer is
[Letters to Cleo].
Table 5: Case study of debate on HotpotQA dataset. The first row represents the question to be debated and the
ground-truth answer. The second row represents the Simultaneous Talk phase, the third row represents the Orderly
Talk phase, and the last row represents the summarizer phase where the summarizer provides a conclusion based on
the debate history. The grey part indicates where debaters adaptively select knowledge from the shared knowledge
pool before expressing their viewpoints. After each round of debate, the judge determines whether a consensus has
been reached.
Radford, Ilya Sutskever, and Dario Amodei. 2020.
Language models are few-shot learners.
In Ad-
vances in Neural Information Processing Systems,
volume 33, pages 1877–1901. Curran Associates,
Inc.
Chi-Min Chan, Weize Chen, Yusheng Su, Jianxuan Yu,
Wei Xue, Shanghang Zhang, Jie Fu, and Zhiyuan
Liu. 2023. Chateval: Towards better llm-based eval-
uators through multi-agent debate. arXiv preprint
arXiv:2308.07201.
Hailin Chen, Fangkai Jiao, Xingxuan Li, Chengwei Qin,
Mathieu Ravaut, Ruochen Zhao, Caiming Xiong, and
Shafiq Joty. 2023a. Chatgpt’s one-year anniversary:
Are open-source large language models catching up?
arXiv preprint arXiv:2311.16989.
Huaben Chen, Wenkang Ji, Lufeng Xu, and Shiyu Zhao.
2023b. Multi-agent consensus seeking via large lan-
guage models. arXiv preprint arXiv:2310.20151.
Yilun Du, Shuang Li, Antonio Torralba, Joshua B Tenen-
baum, and Igor Mordatch. 2023. Improving factual-
ity and reasoning in language models through multia-
gent debate. arXiv preprint arXiv:2305.14325.
Zhangyin Feng, Weitao Ma, Weijiang Yu, Lei Huang,
Haotian Wang, Qianglong Chen, Weihua Peng, Xi-
aocheng Feng, Bing Qin, et al. 2023. Trends in inte-
gration of knowledge and large language models: A
survey and taxonomy of methods, benchmarks, and
applications. arXiv preprint arXiv:2311.05876.
Yao Fu, Hao Peng, Tushar Khot, and Mirella Lapata.
2023. Improving language model negotiation with


---

self-play and in-context learning from ai feedback.
arXiv preprint arXiv:2305.10142.
Significant Gravitas. 2023. Auto-gpt: An autonomous
gpt-4 experiment,
2023.
URL https://github.
com/Significant-Gravitas/Auto-GPT.
Hangfeng He, Hongming Zhang, and Dan Roth. 2022.
Rethinking with retrieval: Faithful large language
model inference. arXiv preprint arXiv:2301.00303.
Dan Hendrycks, Collin Burns, Steven Basart, Andy Zou,
Mantas Mazeika, Dawn Song, and Jacob Steinhardt.
2021. Measuring massive multitask language under-
standing. In International Conference on Learning
Representations.
Xanh Ho, Anh-Khoa Duong Nguyen, Saku Sugawara,
and Akiko Aizawa. 2020. Constructing a multi-hop
qa dataset for comprehensive evaluation of reasoning
steps. In COLING, pages 6609–6625.
Wenyue Hua, Lizhou Fan, Lingyao Li, Kai Mei,
Jianchao Ji, Yingqiang Ge, Libby Hemphill, and
Yongfeng Zhang. 2023. War and peace (waragent):
Large language model-based multi-agent simulation
of world wars. arXiv preprint arXiv:2311.17227.
Lei Huang, Weijiang Yu, Weitao Ma, Weihong Zhong,
Zhangyin Feng, Haotian Wang, Qianglong Chen,
Weihua Peng, Xiaocheng Feng, Bing Qin, et al. 2023.
A survey on hallucination in large language models:
Principles, taxonomy, challenges, and open questions.
arXiv preprint arXiv:2311.05232.
Gautier Izacard, Patrick Lewis, Maria Lomeli, Lu-
cas Hosseini, Fabio Petroni, Timo Schick, Jane
Dwivedi-Yu, Armand Joulin, Sebastian Riedel, and
Edouard Grave. 2022. Few-shot learning with re-
trieval augmented language models. arXiv preprint
arXiv:2208.03299.
Zhengbao Jiang, Frank Xu, Luyu Gao, Zhiqing Sun,
Qian Liu, Jane Dwivedi-Yu, Yiming Yang, Jamie
Callan, and Graham Neubig. 2023. Active retrieval
augmented generation.
In EMNLP, pages 7969–
7992.
Di Jin, Eileen Pan, Nassim Oufattole, Wei-Hung Weng,
Hanyi Fang, and Peter Szolovits. 2021. What disease
does this patient have? a large-scale open domain
question answering dataset from medical exams. Ap-
plied Sciences, 11(14):6421.
Mandar Joshi, Eunsol Choi, Daniel S Weld, and Luke
Zettlemoyer. 2017. Triviaqa: A large scale distantly
supervised challenge dataset for reading comprehen-
sion. In ACL, pages 1601–1611.
Jared Kaplan, Sam McCandlish, Tom Henighan, Tom B
Brown, Benjamin Chess, Rewon Child, Scott Gray,
Alec Radford, Jeffrey Wu, and Dario Amodei. 2020.
Scaling laws for neural language models.
arXiv
preprint arXiv:2001.08361.
Vladimir Karpukhin, Barlas Oguz, Sewon Min, Patrick
Lewis, Ledell Wu, Sergey Edunov, Danqi Chen, and
Wen-tau Yih. 2020. Dense passage retrieval for open-
domain question answering. In EMNLP, pages 6769–
6781.
Yu He Ke, Rui Yang, Sui An Lie, Taylor Xin Yi Lim,
Hairil Rizal Abdullah, Daniel Shu Wei Ting, and Nan
Liu. 2024. Enhancing diagnostic accuracy through
multi-agent conversations: Using large language
models to mitigate cognitive bias. arXiv preprint
arXiv:2401.14589.
Nitish Shirish Keskar, Bryan McCann, Lav R Varshney,
Caiming Xiong, and Richard Socher. 2019. Ctrl: A
conditional transformer language model for control-
lable generation. arXiv preprint arXiv:1909.05858.
Takeshi Kojima, Shixiang Shane Gu, Machel Reid, Yu-
taka Matsuo, and Yusuke Iwasawa. 2022. Large lan-
guage models are zero-shot reasoners. In NeurIPS.
Tom Kwiatkowski, Jennimaria Palomaki, Olivia Red-
field, Michael Collins, Ankur Parikh, Chris Alberti,
Danielle Epstein, Illia Polosukhin, Jacob Devlin, Ken-
ton Lee, et al. 2019. Natural questions: a benchmark
for question answering research. Transactions of the
Association for Computational Linguistics, 7:452–
466.
Guohao Li, Hasan Abed Al Kader Hammoud, Hani
Itani, Dmitrii Khizbullin, and Bernard Ghanem. 2023.
Camel: Communicative agents for" mind" explo-
ration of large language model society. In NeurIPS.
Tian Liang, Zhiwei He, Wenxiang Jiao, Xing Wang,
Yan Wang, Rui Wang, Yujiu Yang, Zhaopeng Tu, and
Shuming Shi. 2023. Encouraging divergent thinking
in large language models through multi-agent debate.
arXiv preprint arXiv:2305.19118.
Xiao Liu, Hanyu Lai, Hao Yu, Yifan Xu, Aohan Zeng,
Zhengxiao Du, Peng Zhang, Yuxiao Dong, and Jie
Tang. 2023. Webglm: Towards an efficient web-
enhanced question answering system with human
preferences. In KDD, page 4549–4560.
Hongyin Luo, Tianhua Zhang, Yung-Sung Chuang,
Yuan Gong, Yoon Kim, Xixin Wu, Helen Meng, and
James Glass. 2023. Search augmented instruction
learning. In Findings of EMNLP, pages 3717–3729.
Reiichiro Nakano, Jacob Hilton, Suchir Balaji, Jeff Wu,
Long Ouyang, Christina Kim, Christopher Hesse,
Shantanu Jain, Vineet Kosaraju, William Saunders,
et al. 2021.
Webgpt: Browser-assisted question-
answering with human feedback.
arXiv preprint
arXiv:2112.09332.
OpenAI. 2023. Gpt-4 technical report.
Joon Sung Park, Joseph O’Brien, Carrie Jun Cai, Mered-
ith Ringel Morris, Percy Liang, and Michael S. Bern-
stein. 2023. Generative agents: Interactive simulacra
of human behavior. In UIST.


---

Xiao Pu, Mingqi Gao, and Xiaojun Wan. 2023.
Summarization is (almost) dead.
arXiv preprint
arXiv:2309.09558.
Chen Qian, Xin Cong, Cheng Yang, Weize Chen,
Yusheng Su, Juyuan Xu, Zhiyuan Liu, and Maosong
Sun. 2023. Communicative agents for software de-
velopment. arXiv preprint arXiv:2307.07924.
Ori Ram, Yoav Levine, Itay Dalmedigos, Dor Muhlgay,
Amnon Shashua, Kevin Leyton-Brown, and Yoav
Shoham. 2023. In-context retrieval-augmented lan-
guage models. Transactions of the Association for
Computational Linguistics.
Zhihong Shao, Yeyun Gong, Yelong Shen, Minlie
Huang, Nan Duan, and Weizhu Chen. 2023. Enhanc-
ing retrieval-augmented large language models with
iterative retrieval-generation synergy. In Findings of
EMNLP, pages 9248–9274.
Weijia Shi, Sewon Min, Michihiro Yasunaga, Min-
joon Seo, Rich James, Mike Lewis, Luke Zettle-
moyer, and Wen-tau Yih. 2023. Replug: Retrieval-
augmented black-box language models.
arXiv
preprint arXiv:2301.12652.
Kurt Shuster, Spencer Poff, Moya Chen, Douwe Kiela,
and Jason Weston. 2021. Retrieval augmentation
reduces hallucination in conversation. In Findings of
EMNLP, pages 3784–3803.
Noam Slonim, Yonatan Bilu, Carlos Alzate, Roy
Bar-Haim, Ben Bogin, Francesca Bonin, Leshem
Choshen, Edo Cohen-Karlik, Lena Dankin, Lilach
Edelstein, et al. 2021. An autonomous debating sys-
tem. Nature, 591(7850):379–384.
Andries Smit, Paul Duckworth, Nathan Grinsztajn,
Kale-ab Tessera, Thomas D Barrett, and Arnu Preto-
rius. 2023. Are we going mad? benchmarking multi-
agent debate between language models for medical
q&a. arXiv preprint arXiv:2311.17371.
James
Thorne,
Andreas
Vlachos,
Christos
Christodoulopoulos,
and
Arpit
Mittal.
2018.
Fever: a large-scale dataset for fact extraction and
verification. In NAACL, pages 809–819.
Hugo Touvron, Louis Martin, Kevin Stone, Peter Al-
bert, Amjad Almahairi, Yasmine Babaei, Nikolay
Bashlykov, Soumya Batra, Prajjwal Bhargava, Shruti
Bhosale, et al. 2023.
Llama 2:
Open founda-
tion and fine-tuned chat models.
arXiv preprint
arXiv:2307.09288.
Harsh Trivedi, Niranjan Balasubramanian, Tushar Khot,
and Ashish Sabharwal. 2023. Interleaving retrieval
with chain-of-thought reasoning for knowledge-
intensive multi-step questions. In ACL, pages 10014–
10037.
Lei Wang, Chen Ma, Xueyang Feng, Zeyu Zhang, Hao
Yang, Jingsen Zhang, Zhiyuan Chen, Jiakai Tang,
Xu Chen, Yankai Lin, et al. 2024. A survey on large
language model based autonomous agents. Frontiers
of Computer Science, 18(6):1–26.
Xuezhi Wang, Jason Wei, Dale Schuurmans, Quoc V Le,
Ed H Chi, Sharan Narang, Aakanksha Chowdhery,
and Denny Zhou. 2022. Self-consistency improves
chain of thought reasoning in language models. In
ICLR.
Zhenhailong Wang, Shaoguang Mao, Wenshan Wu,
Tao Ge, Furu Wei, and Heng Ji. 2023.
Unleash-
ing cognitive synergy in large language models:
A task-solving agent through multi-persona self-
collaboration. arXiv preprint arXiv:2307.05300.
Jason Wei, Yi Tay, Rishi Bommasani, Colin Raffel,
Barret Zoph, Sebastian Borgeaud, Dani Yogatama,
Maarten Bosma, Denny Zhou, Donald Metzler, et al.
2022. Emergent abilities of large language models.
Transactions on Machine Learning Research.
Ross Williams, Niyousha Hosseinichimeh, Aritra Ma-
jumdar, and Navid Ghaffarzadegan. 2023. Epidemic
modeling with generative agents.
arXiv preprint
arXiv:2307.04986.
Zhiheng Xi, Wenxiang Chen, Xin Guo, Wei He, Yiwen
Ding, Boyang Hong, Ming Zhang, Junzhe Wang,
Senjie Jin, Enyu Zhou, et al. 2023. The rise and
potential of large language model based agents: A
survey. arXiv preprint arXiv:2309.07864.
Ziyang Xiao, Dongxiang Zhang, Yangjun Wu, Lilin Xu,
Yuan Jessica Wang, Xiongwei Han, Xiaojin Fu, Tao
Zhong, Jia Zeng, Mingli Song, and Gang Chen. 2024.
Chain-of-experts: When LLMs meet complex opera-
tions research problems. In The Twelfth International
Conference on Learning Representations.
Guangzhi
Xiong,
Qiao
Jin,
Zhiyong
Lu,
and
Aidong Zhang. 2024.
Benchmarking retrieval-
augmented generation for medicine. arXiv preprint
arXiv:2402.13178.
Kai Xiong, Xiao Ding, Yixin Cao, Ting Liu, and Bing
Qin. 2023. Examining inter-consistency of large lan-
guage models collaboration: An in-depth analysis via
debate. In Findings of EMNLP, pages 7572–7590.
Xiaohan Xu, Ming Li, Chongyang Tao, Tao Shen,
Reynold Cheng, Jinyang Li, Can Xu, Dacheng Tao,
and Tianyi Zhou. 2024. A survey on knowledge dis-
tillation of large language models. arXiv preprint
arXiv:2402.13116.
Zhenran Xu, Senbao Shi, Baotian Hu, Jindi Yu, Dong-
fang Li, Min Zhang, and Yuxiang Wu. 2023. To-
wards reasoning in large language models via multi-
agent peer review collaboration.
arXiv preprint
arXiv:2311.08152.
Zhilin Yang, Peng Qi, Saizheng Zhang, Yoshua Bengio,
William Cohen, Ruslan Salakhutdinov, and Christo-
pher D Manning. 2018. Hotpotqa: A dataset for
diverse, explainable multi-hop question answering.
In EMNLP, pages 2369–2380.


---

Shunyu Yao, Jeffrey Zhao, Dian Yu, Nan Du, Izhak
Shafran, Karthik R Narasimhan, and Yuan Cao. 2022.
React: Synergizing reasoning and acting in language
models. In ICLR.
Zhangyue Yin, Qiushi Sun, Qipeng Guo, Jiawen Wu,
Xipeng Qiu, and Xuan-Jing Huang. 2023. Do large
language models know what they don’t know? In
Findings of the Association for Computational Lin-
guistics: ACL 2023, pages 8653–8665.
Ceyao Zhang, Kaijie Yang, Siyi Hu, Zihao Wang,
Guanghe Li, Yihang Sun, Cheng Zhang, Zhaowei
Zhang, Anji Liu, Song-Chun Zhu, et al. 2023. Proa-
gent: Building proactive cooperative ai with large
language models. arXiv preprint arXiv:2308.11339.
Lianmin Zheng, Wei-Lin Chiang, Ying Sheng, Siyuan
Zhuang, Zhanghao Wu, Yonghao Zhuang, Zi Lin,
Zhuohan Li, Dacheng Li, Eric Xing, Hao Zhang,
Joseph E. Gonzalez, and Ion Stoica. 2023. Judging
LLM-as-a-judge with MT-bench and chatbot arena.
In NeurIPS Datasets and Benchmarks Track.
Ao Zou, Wenning Hao, Dawei Jin, Shichen Zou,
Yu Zheng, Feiyan Sun, and Li Xiang. 2024. An ef-
ficient corpus indexer for dynamic corpora retrieval.
Expert Systems with Applications, 254:124306.
A
Role Definition Prompt
The definition of debater role is:
You are an intelligent, diplomatic, and
assertive debate agent. Your task is to
engage in intellectual debates with other
agents, striving to reach a consensus
on various topics. It’s crucial to main-
tain your stance when you are confident
about the correctness of your opinion.
However, if you identify an error in your
argument, you should promptly acknowl-
edge it and amend your stance with the
correct information. Your ultimate goal
is to contribute to an informed, balanced,
and accurate discussion.
The definition of judge role prompt is:
As a judge agent, your primary respon-
sibility is to impartially evaluate the re-
sponses of other agents for consistency.
Please ensure your judgments are objec-
tive, relying solely on the coherence and
alignment of the provided answers.
The definition of summarizer role prompt is:
You are an intelligent summarizer agent,
tasked with synthesizing the responses of
other agents into a concise and compre-
hensive final answer. Your role is not to
generate original responses, but to con-
dense the information provided by other
agents into a succinct summary.
B
Dataset Details
For different datasets, we give a brief introduc-
tion in this section. Table 1 shows the statistics of
datasets.
Single-Hop Reasoning
• TriviaQA (Joshi et al., 2017): A question-
answering dataset based on Wikipedia and
real web texts, which consists of human-
verified and machine-generated QA subsets.
• NQ (Kwiatkowski et al., 2019): A real user
QA dataset based on Wikipedia.
Multi-Hop Reasoning
• HotpotQA (Yang et al., 2018): A multi-hop
QA dataset based on English Wikipedia. Each
question requires reference to two golden para-
graphs to deduce the answer.
• 2WikiMultiHopQA (Ho et al., 2020): Similar
to HotpotQA, a QA dataset that requires multi-
step reasoning.
Fact Checking
• FEVER (Thorne et al., 2018): A publicly
available dataset for fact extraction and veri-
fication against textual source. These claims
were extracted from Wikipedia by human an-
notators.
Medical Reasoning
• MMLU-Med:
MMLU (Hendrycks et al.,
2021) is a multiple-choice dataset comprising
57 tasks, designed to evaluate models’ under-
standing and reasoning abilities concerning
world knowledge. We extracted 6 medical-
related subcategory datasets from it to form
MMLU-Med.


---

Question
groundtruth
predictive answer
EM
GPT4 Eval
Human Eval
①Who was the next British Prime Min-
ister after Arthur Balfour?
Henry Campbell Banner-
man
Henry Campbell Banner-
man
True
True
True
②Robert Kirkpatrick of California
grew the world’s biggest what?
Head of garlic
garlic head
False
True
True
③Precisely where were the Winter
Olympics of 1932 and 1980 both held?
Lake placid
Lake Placid, New York,
United States
False
True
True
④Who was the first person after Scott
to reach the South Pole overland?
Sir Edmund Hillary
Roald Amundsen and Ed-
mund Hillary
False
False
False
Table 6: Evaluation results of model responses using different evaluation metrics (EM, GPT4 Eval, and Human
Eval).
C
Evaluation Metric
In the context of large models, the evaluation of
generative tasks is indeed difficult. Some existing
works use EM evaluation metric for QA tasks. We
believe that this metric is relatively strict, and the
evaluation is not accurate enough. As shown in the
table 6.
Zheng et al. (2023) illustrate the advantages and
disadvantages of using GPT4 for evaluation. For
example, when evaluating two answers, there will
be sensitivity to location, and there may be some
bias. But, in the generative reasoning datasets of
this work, the answer to each question is relatively
short, and for the correctness of the evaluation, we
provide reference answers during the evaluation
process. The role of GPT4 Eval is defined as:
As a judge agent, your primary responsi-
bility is to impartially evaluate the eval-
uation answer for correct. Please en-
sure your judgments are objective, rely-
ing solely on the coherence and align-
ment of the provided answers.
The full prompt for the GPT4 evaluation answer
is shown in Prompt C.1.
Prompt C.1: GPT4 Eval
You need to judge the correctness of the evaluation answer
based on the question and the reference answer to the
question. The answer of the agents are typically denoted
with the [answer] format. Return [True] if the answer to be
evaluated is the correct answer to the question, otherwise
return [False]. Here are some examples:
{examples} (END OF EXAMPLES)
Question: {question}
Reference answers: {reference_answers}
Evaluation answer: {evaluation_answer}
Answer: Let’s think step by step!

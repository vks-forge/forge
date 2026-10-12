---
title: 'From Static to Dynamic: Benchmarking Real-World Code'
id: from-static-to-dynamic-benchmarking-real-world-code
tags:
- ai-software-factory-architecture-58e4cc
- code-review-benchmark
- pillar-1-gap-fill
created: '2026-10-12T08:59:47.558535Z'
updated: '2026-10-12T09:01:55.084671Z'
source: https://arxiv.org/pdf/2608.27442
source_domain: arxiv.org
fetched_at: '2026-10-12T08:59:47.557808Z'
fetch_provider: builtin
status: draft
type: note
tier: institutional
content_type: paper
deprecated: false
summary: 'MCR-Bench (Zheng, Wang, Wang, Duan, Zhang, Liu, Ma, Zheng; ACM Software
  Engineering ISSTA, arXiv 2608.27442, Oct 2026) is a real-world, multi-round, PR-level
  code review benchmark: 2,269 high-quality review tasks across 5 languages (Python,
  Java, JavaScript, TypeScript, C#) sourced from well-maintained open-source repos,
  designed to capture iterative multi-round review interactivity and cross-round defect-state
  tracking (persistence, resolution, reopening) that prior single-round/hunk-level
  benchmarks miss. This is defect-detection ground truth from real review discussions,
  not synthetic/planted errors, and is relevant baseline context for Pillar-1 claims
  even though it evaluates single-model defect detection rather than adversarial cross-model
  critique. Key numbers (Table 5, Precision/Recall/F1): best-performing model only
  slightly exceeds F1=0.55 overall (Claude Haiku 4.5: P=0.579/R=0.630/F1=0.551; GPT-5.2:
  P=0.622/R=0.561/F1=0.542); weaker models much lower (Qwen3 Max F1=0.357, Kimi K2
  F1=0.373, DeepSeek V3.2 F1=0.490). Authors state ''mainstream LLMs exhibit only
  modest performance on MCR-Bench, with F1 scores largely in the low-to-medium range...
  indicating persistent challenges in defect identification and contextual reasoning
  under multi-round code review settings.'' Performance drops further for TypeScript/C#
  (lower recall) versus Python/JavaScript. Separately-evaluated PR-level agentic-code-review
  (ACR) baselines (PR-Agent, Hybrid-Review) scored even lower, with ''generally low
  F1 scores and consistently low recall,'' showing existing production-style review
  agents struggle to capture defects whose evidence evolves across review rounds.
  This establishes an empirical ceiling: even specialized, state-of-the-art single-model
  code review systems catch roughly half of real-world PR defects at best when ground
  truth comes from actual review discussions rather than synthetic planted bugs --
  useful context for calibrating how much additional defect-catching headroom an adversarial
  cross-model layer could plausibly add.'
raw_file: raw/from-static-to-dynamic-benchmarking-real-world-code.pdf
doi: arXiv:2608.27442
---

From Static to Dynamic: Benchmarking Real-World Code
Review with MCR-Bench
DEWU ZHENG, Sun Yat-sen University, China
YANLIN WANG✉∗, Sun Yat-sen University, China
XIWEN WANG, Sun Yat-sen University, China
KEFENG DUAN, Sun Yat-sen University, China
HONGYU ZHANG, Chongqing University, China
XILIN LIU, Huawei Cloud Computing Technologies Co., Ltd., China
YUCHI MA, Huawei Cloud Computing Technologies Co., Ltd., China
ZIBIN ZHENG, Sun Yat-sen University, China
In real-world software development, code review typically involves iterative interactions between developers
and reviewers to improve software quality, making the process costly and time-consuming. Although recent
work explores large language models (LLMs) for automated code review, most approaches oversimplify code
review into a single-round, static decision task, which fails to capture the multi-round interactive nature
and the complex problem-solving processes inherent in realistic review scenarios. To bridge this gap, we
introduce MCR-Bench, the first defect state-aware benchmark designed for realistic multi-round code review.
MCR-Bench covers five commonly-used programming languages and consists of 2,269 real-world multi-round
code review tasks, each of which is annotated with fine-grained defect information and cross-round state
labels. Each task in MCR-Bench is equipped with fine-grained defect metadata (e.g., description, type, severity)
alongside dynamic state annotations, capturing the complete evolutionary trajectory of a defect throughout
the multi-round process. We obtain several findings through extensive experiments on MCR-Bench with
mainstream LLMs. (1) Limited overall capability: experiments reveal that mainstream LLMs exhibit limited
overall performance in defect detection and defect lifecycle state tracking, with performance degrading
significantly as the number of interaction rounds increases; (2) Defect-sensitive performance: LLMs’
performance varies substantially across different defect types and severity levels, with semantically complex
or low-salience defects being significantly more likely to be missed; (3) Underlying Failure Mechanisms:
our in-depth error analysis dissects the distinct drivers of false positives and false negatives, revealing critical
weaknesses such as cross-round temporal misalignment and inadequate long-range memory.
CCS Concepts: • Software and its engineering →Software defect analysis.
Additional Key Words and Phrases: code review, multi-round code review, large language models
∗Yanlin Wang is the corresponding author.
Authors’ Contact Information: Dewu Zheng, Sun Yat-sen University, Zhuhai Key Laboratory of Trusted Large Language
Models, Zhuhai, China, zhengdw5@mail2.sysu.edu.cn; Yanlin Wang, Sun Yat-sen University, Zhuhai Key Laboratory of
Trusted Large Language Models, Zhuhai, China, wangylin36@mail.sysu.edu.cn; Xiwen Wang, Sun Yat-sen University,
Zhuhai Key Laboratory of Trusted Large Language Models, Zhuhai, China, wangxw86@mail2.sysu.edu.cn; Kefeng Duan, Sun
Yat-sen University, Zhuhai Key Laboratory of Trusted Large Language Models, Zhuhai, China, duankf@mail2.sysu.edu.cn;
Hongyu Zhang, Chongqing University, Chongqing, China, hyzhang@cqu.edu.cn; Xilin Liu, Huawei Cloud Computing
Technologies Co., Ltd., Dongguan, China, liuxilin3@huawei.com; Yuchi Ma, Huawei Cloud Computing Technologies Co.,
Ltd., Dongguan, China, mayuchi1@huawei.com; Zibin Zheng, Sun Yat-sen University, Zhuhai Key Laboratory of Trusted
Large Language Models, Zhuhai, China, zhzibin@mail.sysu.edu.cn.
This work is licensed under a Creative Commons Attribution 4.0 International License.
© 2026 Copyright held by the owner/author(s).
ACM 2994-970X/2026/10-ARTISSTA128
https://doi.org/10.1145/3832219
Proc. ACM Softw. Eng., Vol. 3, No. ISSTA, Article ISSTA128. Publication date: October 2026.
arXiv:2608.27442v1  [cs.SE]  27 Aug 2026


---

ISSTA128:2
D. Zheng, Y. Wang, X. Wang, K. Duan, H. Zhang, X. Liu, Y. Ma, and Z. Zheng
ACM Reference Format:
Dewu Zheng, Yanlin Wang, Xiwen Wang, Kefeng Duan, Hongyu Zhang, Xilin Liu, Yuchi Ma, and Zibin Zheng.
2026. From Static to Dynamic: Benchmarking Real-World Code Review with MCR-Bench. Proc. ACM Softw.
Eng. 3, ISSTA, Article ISSTA128 (October 2026), 24 pages. https://doi.org/10.1145/3832219
1
Introduction
Code review stands as a cornerstone of software quality assurance [4, 27, 39], aiming to enhance
functional correctness and long-term maintainability before code integration. While pivotal, this
process is historically labor-intensive and difficult to scale [55, 68], which has motivated recent
efforts to leverage LLMs for automated code review [9, 19, 26, 31, 34, 48, 50, 69].
Although existing studies have extended their code review granularity from traditional diff
hunks [20, 25, 36, 38, 45] to Pull Request (PR) level [10, 16, 19, 69, 70] to better approximate
real-world development scenarios, they predominantly reduce the complex review process to a
single-round, static decision task. Such simplification neglects the fact that real-world code review
typically involves iterative interactions between developers and reviewers, and therefore fails to
capture two critical characteristics of real-world code review: multi-round review interactivity
and dynamic defect evolution [15, 58, 73].
As depicted in Figure 1, traditional review approaches (Figure 1a) are limited to operating at
the level of isolated diff hunks. More recent PR-level benchmarks (Figure 1b) [19, 69, 70] elevate
the evaluation granularity to the PR-level to better reflect realistic review practices; however, they
remain constrained to generating single-round feedback based on the initial PR state and fail to
support the continued tracking and validation of the identified defects. In practice, code reviews
(Figure 1c) typically proceed through multiple review rounds with successive commits [15]. Defects
raised in early rounds evolve as the code changes—being resolved or remaining open for further
discussion. In such dynamic settings, defect semantics depend critically on historical states and prior
feedback. Without explicitly modeling multi-round interactions and state transitions, LLMs cannot
reliably assess whether current changes address past review comments, limiting their effectiveness
in real-world applications.
Notably, empirical evidence from real-world Gerrit projects [24] shows that nearly half of code
changes involve multiple review rounds, with review time increasing from 0.33 days (single-round)
to 5.3 days (2–6 rounds) and 31.3 days (>6 rounds), highlighting the critical importance of modeling
multi-round interactions and defect evolution.
MCR-Bench. To bridge the gap and advance code review automation toward more realistic
interactive scenarios, we introduce MCR-Bench, the first benchmark dedicated to multi-round code
review, comprising 2,269 real review tasks across the five popular languages [43]: Python, Java,
JavaScript, TypeScript, and C#. Unlike existing benchmarks that focus primarily on static comment
generation, MCR-Bench is designed to evaluate LLMs’ ability to track defect states and maintain
contextual consistency under dynamic, multi-round interactions. To this end, we annotate each
review task with fine-grained ground-truth defect cards, which capture detailed defect descriptions,
locations, categories, and severity levels. More importantly, we explicitly record the lifecycle state
transitions of each defect across multiple review rounds (e.g., New →Open →Resolved).
Construction Process. To help ensure the quality of MCR-Bench, we design a rigorous multi-
stage data construction pipeline. Specifically, after performing high-quality repository selection and
PR data collection, we employ an LLM-based state-aware defect annotation pipeline to address the
challenge of defect tracking in multi-round code review. The pipeline follows a “local detection first,
global tracking later” strategy: it first identifies candidate defects within individual review rounds
and then performs cross-round merging and lifecycle tracking by leveraging the complete code
Proc. ACM Softw. Eng., Vol. 3, No. ISSTA, Article ISSTA128. Publication date: October 2026.


---

From Static to Dynamic: Benchmarking Real-World Code Review with MCR-Bench
ISSTA128:3
(a) Traditional Diff Hunk Review
(b) Current PR-level Code Review
(c) Real-world Multi-round PR-level Code Review (This Paper) 
src/services/user/profile_cache.py
def get_user_profile(user_id: str):
-  if user_id in _PROFILE_CACHE:
    # 4 lines of code omitted . . .
+  profile = _load_profile(user_id)
    # 3 lines of code omitted . . .
Review Comment for Diff Hunk
“Refactor looks clean and readable.
No further comments on this hunk.”
Review Comment for This PR
“One concern: _load_profile_from_db 
is expected to be called on every 
request”
Review Comment for The First Round
New  
| Cache check occurs after DB call.
New
| Missing tests for cache 
New
| Missing tests  API behavior.
src/services/user/profile_cache.py
def get_user_profile(user_id: str)
-  profile = _load_profile(user_id)
    # 3 lines of code omitted . . . 
+  if user_id in _PROFILE_CACHE:
    # 4 lines of code omitted . . . 
tests/services/user/test_profile_cache.py
+ def test_cache_query_db(mocker):
    # 10 lines of code omitted . . . 
Review Comment for The Second Round
Resolved  | Cache order fixed. 
OPEN
|  API behavior still unverified. 
OPEN
| Cache-miss test still missing.
tests/api/v1/test_user_handler.py
+ def test_user_handler(client):    
     # 5 lines of code omitted . . . 
tests/services/user/test_profile_cache.py
+ def test_cache_queries_db (mocker):
     # 8 lines of code omitted . . . 
Review Comment for The Final Round
Resolved  |  Cache order fixed. 
Resolved |  API behavior tested.
Resolved | cache-miss tests added.
LLM Input
Instructions
PR Information
Linked Issue(s)
Code Diff
LLM Input
Instructions
PR Information
Linked Issue(s)
Code Diff
Fig. 1. Comparison of traditional hunk-level review, current PR-level code review, and real-world multi-round
PR-level code review (this paper).
changes and review discussions to track defect state evolution throughout the PR lifecycle. Finally,
manual cross-validation is conducted to enhance the accuracy and consistency of the annotations.
Experiments & Findings We conduct an empirical evaluation of mainstream LLMs [3, 17,
35, 44, 53, 64, 67] on MCR-Bench to assess their capabilities in multi-round code review. Our
evaluation focuses on defect identification and lifecycle state tracking, along with an analysis of
common error patterns, yielding the following key findings. 1 Limited overall capability. Current
LLMs show modest performance on MCR-Bench, particularly in defect identification, and even
when defects are correctly identified, lifecycle state prediction remains a significant challenge.
In addition, LLMs’ performance degrades as the number of review rounds increases. 2 Defect-
sensitive performance. LLMs exhibit substantial variation in performance across defect types and
severity levels, with semantically complex or low-salience defects being significantly more prone
to omission. 3 Underlying Failure Mechanisms: In-depth error analysis attributes the high rates
of false positives and false negatives to specific cognitive deficiencies in multi-round contexts.
Models suffer from inadequate cross-round memory, leading to defect forgetting and temporal
misalignment, where models fail to correctly distinguish between historical, resolved, and newly
introduced issues.
Our contributions are summarized as follows:
• We introduce a state-aware benchmark for realistic multi-round code review. MCR-
Bench models defect state evolution across review rounds and supports evaluation of cross-round
defect identification and state tracking.
• We develop an automated data construction pipeline for multi-round code review. The
pipeline adopts a state-aware, multi-stage process that supports cross-round defect extraction,
merging, and lifecycle tracking.
• We evaluate the capability boundaries of mainstream LLMs in multi-round code review.
Based on MCR-Bench, we assess LLMs’ performance on defect identification and lifecycle state
prediction, revealing performance variations across interaction depth and defect characteristics.
• We construct a fine-grained taxonomy of failure root causes. We employ an open coding
process to false positive and false negative cases, resulting in a taxonomy that characterizes the
underlying causes of LLM errors in multi-round code review.
Proc. ACM Softw. Eng., Vol. 3, No. ISSTA, Article ISSTA128. Publication date: October 2026.


---

ISSTA128:4
D. Zheng, Y. Wang, X. Wang, K. Duan, H. Zhang, X. Liu, Y. Ma, and Z. Zheng
2
Related Work
Earlier code review benchmarks operate on localized code changes at different granularities, includ-
ing the function/method, diff-hunk, and commit/change levels. At the function/method level, Trans-
Review [57] benchmarks review-driven code transformation by learning typical code revisions from
real review activities, while AutoTransform [54] focuses on automated program transformation
to support code review, and T5-Review [56] applies pre-trained sequence-to-sequence models
to review-oriented code revision tasks. At the diff-hunk level, CodeReviewer [31] establishes a
large-scale benchmark over isolated code diffs for review tasks such as quality estimation, comment
generation and code refinement, while Hybrid-Review-Dataset [25] augments diff-hunk–level
evaluation with static-analysis signals to support review generation. At the commit/change level,
CodeAgent [51] evaluates agent-based code review capabilities over commit-level changes, includ-
ing inconsistency detection and revision suggestion.
With the rapid advancement of LLMs in code understanding and reasoning [14, 21, 46, 59–61, 71,
74, 75], recent benchmarks have shifted toward evaluating code review at the PR level [19, 22, 69, 70],
operating on complete PR contexts rather than isolated code changes. SWR-Bench [69] presents
a PR-centric code review benchmark constructed from manually verified GitHub pull requests,
providing full project context and structured ground-truth issues to enable objective evaluation of
review coverage and quality under realistic review settings. CodeFuse-CR-Bench [19] introduces
a comprehensiveness-aware benchmark for repository-level code review, where each instance
supplies rich, multi-faceted PR context—including associated issues, PR metadata, and repository
state—to support end-to-end evaluation using both rule-based checks and model-based quality
judgments. Sphinx [70] proposes a unified framework for PR review that combines context-rich
data generation with a checklist-based evaluation benchmark, enabling structured assessment of
review completeness and actionability beyond surface-level similarity metrics.
Despite these advances, most existing benchmarks remain confined to a single-round, static code
review paradigm, which fails to capture the iterative nature of real-world code review. In practice,
non-trivial code changes typically require multiple cycles of review →revision →revalidation before
being merged [24]. This static perspective obscures challenges unique to multi-round settings,
particularly defect state tracking (e.g., transitions from Open to Resolved or Reopened) and contextual
consistency across review rounds. As a result, existing benchmarks cannot adequately assess LLMs’
capabilities in real-world code review scenarios, emphasizing the urgent need for benchmarks
tailored to multi-round code review.
3
MCR-Bench Construction
3.1
Benchmark Overview
MCR-Bench is a multilingual code review benchmark designed to simulate multi-round review
interactions in real-world scenarios. It comprises 2,269 high-quality review tasks spanning the five
most popular languages on GitHub. To standardize the evaluation process, we instantiate each
review sample as a structured task instance. As illustrated in Figure 2, each task consists of two
main components: PR related information and the annotated ground truth.
PR related information. To faithfully reflect LLM performance in multi-round code review, we
leverage available PR histories as the basis for constructing evaluation inputs that mirror practical
scenarios. Specifically, our input comprises three components. Task description (Instructions)
specifies the code review task to be performed. Static PR information provides high-level back-
ground that remains unchanged across review rounds, including PR metadata (PR Information,
e.g., Repository, PR Title, and PR Description) and linked issue records (Linked Issue(s)).
Dynamic review information captures content that evolves across review rounds, including the
Proc. ACM Softw. Eng., Vol. 3, No. ISSTA, Article ISSTA128. Publication date: October 2026.


---

From Static to Dynamic: Benchmarking Real-World Code Review with MCR-Bench
ISSTA128:5
complete code diff for the current round (Code Diff) and the accumulated review discussions and
interactions up to that point (Timeline).
Task Instance Overview
Instruc(ons
Given a pull request and its lined issue, please provide review feedback.
PR Informa(on
Repository: huggingface/transformers
Title: [MMS] Fix mms
Number: 25267
Descrip0on: Fixes issue #25260. The 
problem is that the …[Too long truncated]
Linked Issue(s)
# Issue Number: 25260
# Descrip0on: ⚠ [Wav2Vec2-MMS] pipeline and from_pretrained fail to load the 
Wav2Vec2 MMS checkpoints
Code Diﬀ
src/transformers
modeling_u+ls.py
tests/models/wav2vec2
+41 -1
test_modeling_wav2.py
Timeline
IniNal PR
Round1 Comment
Round2 commit
Round6 commit
Round5 discussion
Ground-truth Defect Card(s)
Final approval
DEFECT CARD N
DEFECT CARD 3 
DEFECT CARD 2 
DEFECT CARD 1
Defect: Wav2Vec2-MMS failure due to un0ed weights before retrieval.
Attribute: 
State: NEW
Taxonomy: F.3
Severity: Major
Location: src/transformers/modeling_utils.py (lines: 2933)
Fig. 2. A task in MCR-Bench sourced from the
GitHub Project huggingface/transformers [52].
Ground truth. The evaluation reference for each
review round in MCR-Bench is represented as a
collection of Defect
Cards. To facilitate multi-
dimensional analysis, the information within each
card is organized into three categories: (1) Defect
Specification: comprising the natural language
Defect Description and precise Location (file
paths and line numbers) to uniquely identify the de-
fect; (2) Dynamic Lifecycle Status: recording the
defect’s State at the current review round (e.g., New,
Open, Resolved, or Reopened), which serves as the
primary ground truth for evaluating state tracking
capabilities; and (3) Supplementary Metadata: in-
cluding Defect Taxonomy and Severity, enabling
fine-grained performance analysis across different
defect characteristics.
3.2
Benchmark Construction Pipeline
As shown in Figure 3, MCR-Bench’s construction
pipeline consists of four main steps: (a) language and
repository selection, (b) pull request data collection,
(c) LLM-based state-aware defect annotation, and
(d) the manual cross-validation process.
3.2.1
Language and Repository Selection. To enhance the representativeness and reliability of
MCR-Bench, we first identify mainstream programming languages and then apply a strict, multi-
dimensional repository selection strategy to curate code review data that reflect real-world practice.
Programming Language Selection. Following the latest GitHub Octoverse report [43], we
select the five most active programming languages on GitHub—Python, Java, JavaScript, TypeScript,
and C#. These languages are widely used in modern software development and collectively cover a
broad range of application domains, enabling MCR-Bench to reflect contemporary engineering
practice and support generalizable evaluation [72].
Repository Selection. Based on the selected programming languages, our repository selection
process is designed to maintain the quality and industrial relevance of the source data. To identify
well-maintained real-world projects, we employ a set of multi-dimensional filtering criteria for
candidate GitHub repositories. Only repositories that satisfy all of the following conditions are
retained for subsequent benchmark construction:
(i) Project Maturity and Activity
• Community Recognition: Repositories must have more than 100 stars, serving as a coarse
indicator of community attention and adoption [23].
• Development Activity: Repositories must exhibit sustained commit activity over the past five
years, indicating ongoing development aligned with modern review practices.
• Maintenance Activity: Repositories must maintain an issue resolution rate above 40%, reflect-
ing active maintenance and effective issue handling [40].
(ii) Collaborative Development
Proc. ACM Softw. Eng., Vol. 3, No. ISSTA, Article ISSTA128. Publication date: October 2026.


---

ISSTA128:6
D. Zheng, Y. Wang, X. Wang, K. Duan, H. Zhang, X. Liu, Y. Ma, and Z. Zheng
（a）Language and Repository Selection
（b）Pull Request Data Collection
（c）LLM-based State-aware Defects Annotation Pipeline
（d）Cross-validation Process
Selected Languages
Highly Starred
Repos
Searching
Candidate Repos
Top 50 Starred Repos
For Each Language
Collecting
Pull Requests
Crawling
Raw PRs
Raw Pull Requests
Filtering
State
Target Repos
38 GitHub
Repositories
Filtering
Quality
Activation
License
Type
Revision
SZZ
Filtered PRs
Pull Requests
Pull Requests
Splitting
Splitting PR into
Review Tasks
Task Instances
Single-round 
Candidate
Defects Detection
Defects 
Detection
Detected Defects 
Phase I: Local Round-wise Candidate Defects Detection 
Phase II: Cross-round Defect Consolidation & Lifecycle Tracking
Integrated Defect Card For Ground-truth Defect
DEFECT ID
STATE
DESCRIPTION
1
NEW
Missing Tests For …
2
Resolved
Bug Fixed
Global 
Consolidation
Lifecycle
Tracking
Cross-validation
Manual cross-validation conducted by 
six experienced software developers.
Fig. 3. The Construction Pipeline of MCR-Bench
• Team-Based Development: We retain only repositories with more than 10 contributors to
capture realistic team-based collaboration and review dynamics [40].
• PR-Centric Development: Following prior work [45], repositories must contain at least 1,500
PRs, indicating sustained PR-based development and sufficient multi-round review data.
(iii) License Legality and Uniqueness
• License Compliance: Following existing license classification [7, 37], we retain only reposito-
ries under permissive licenses (e.g., MIT) to ensure legal compliance and reproducibility.
• Repository Uniqueness: Forked repositories are excluded to avoid duplicated or derivative
data, ensuring that review histories reflect original development activity [69].
3.2.2
Pull Request Data Collection. Based on the filtered repositories, we further process all PRs
within these repositories to obtain high-quality samples for multi-round code review evaluation.
To this end, we design and implement a filtering pipeline over the raw PR data (as illustrated
in Figure 3(b)), which progressively distills high-quality multi-round review instances. 1 State
Filtering. We retain only PRs with the Merged status, as merged PRs indicate that the code changes
have been reviewed and accepted by core maintainers and integrated into the project, providing a
basic guarantee of solution correctness. 2 Type and Scale Filtering. We retain PRs that modify
meaningful code logic while respecting model context constraints. Specifically, we remove PRs that
only affect non-code files (e.g., documentation, images) and exclude PRs with more than 10 initial
commits, as such changes are likely to exceed model context limits. 3 Multi-Round Interaction.
We enforce a strict multi-round interaction constraint, which is central to MCR-Bench. To capture
genuine dynamic review processes, we require retained PRs to exhibit an iterative < commit →
discussion →revision > loop. Specifically, authors must submit new commits in direct response
to reviewer feedback, rather than leaving comments without code changes. Additionally, we filter
out noise from automated bots to ensure all interactions reflect human-to-human collaboration.
4 Quality Control. Inspired by prior work [69], we apply SZZ-based quality control to detect
latent defects in merged PRs. Since merging does not necessarily guarantee defect-free code due to
potential human oversight, we use the SZZ-2 algorithm [49, 63] to retrospectively analyze whether
a PR is later identified as bug-inducing during subsequent development. PRs that are confirmed to
have introduced new bugs after merging are excluded from the dataset.
3.2.3
LLM-based State-aware Defects Annotation Pipeline. To enable scalable and consistent state-
aware annotation for multi-round code review, we design an automated pipeline (Figure 3(c)) [65].
The pipeline takes complete PR history, including round-level diffs, reviewer comments, and
Proc. ACM Softw. Eng., Vol. 3, No. ISSTA, Article ISSTA128. Publication date: October 2026.


---

From Static to Dynamic: Benchmarking Real-World Code Review with MCR-Bench
ISSTA128:7
subsequent developer revisions, as input and produces unified ground-truth Defect Cards with
lifecycle states across review rounds. It follows a divide-and-conquer strategy of “local detection
first, global tracking later”: it first extracts round-specific defect candidates from local review
contexts, and then consolidates them into cross-round defect annotations. This strategy avoids
directly annotating long and iterative review histories in a single pass, where round boundaries
and cross-round defect identities can become difficult to distinguish, thereby reducing annotation
reliability.
Phase I: Local Round-wise Candidate Defects Detection. The primary goal of Phase I is
to maximize recall by improving the coverage of potential defects at the round level. To mitigate
attention degradation caused by long contexts, we decompose the entire PR lifecycle into a sequence
of independent review task instances. For the 𝑡-th review round, the LLM is provided only with
the code diffs and review comments from this round, and is instructed to identify all reviewer-
raised defects, producing a set of round-specific candidate defects. The outputs of this stage are
intermediate defect candidates rather than final benchmark annotations: each candidate is treated
as a round-local and static defect instance, without cross-round identity linkage or lifecycle state
modeling.
Phase II: Cross-round Defect Consolidation and Lifecycle Tracking. Phase II transforms
the local candidates from Phase I into state-aware benchmark annotations at the PR level. We first
aggregate all candidate defects identified in Phase I into a global pool, and then leverage the semantic
reasoning capabilities of LLMs to identify and merge entries that refer to the same underlying defect
across different review rounds. This step yields a set of unified defect representations spanning
the full review process. Based on these unified defects, the model further reasons over subsequent
author commits, historical reviewer feedback, and prior defect mentions to infer the lifecycle state
of each defect at the end of every review round. In this way, the final annotation is not merely a
collection of isolated round-wise comments, but a coherent sequence of defect cards that explicitly
captures cross-round persistence, resolution, and reopening. In real-world code review practice,
defects typically evolve through the following lifecycle states:
• New: the defect is raised for the first time in the current review round.
• Open: the defect has been identified but remains unresolved up to the current review round.
• Resolved: the defect is addressed by code changes and verified within the current review round.
• Reopened: the defect was resolved in a previous round but reappears in a subsequent round.
Consistency Filtering. To improve the scalability and reliability of the LLM-based annotation
pipeline, we introduce an additional consistency filtering step, following common reliability-
oriented practices in prior work [1, 28, 69]. Specifically, we independently execute the annotation
pipeline three times for each task. A task is retained only if the generated defect cards are fully
consistent across all runs in terms of both lifecycle state transitions and semantic defect descriptions.
Any sample that exhibits discrepancies across runs, such as conflicting state predictions (e.g.,
Resolved versus Open), is treated as an uncertain case and discarded.
3.2.4
Cross-validation Process. After consistency filtering, we conduct manual cross-validation
to verify the retained high-confidence defect cards. Six developers with more than five years of
programming experience form the annotator pool and re-examine each retained multi-round code
review task. Specifically, each retained task instance is first assigned to two primary annotators for
independent verification. They separately inspect the generated defect cards and assess whether
the defect descriptions are accurate, whether the cross-round consolidation is rational, and whether
the lifecycle states correctly align with the corresponding code changes and review discussions.
Only annotations on which the two primary annotators agree are directly accepted. We measure
the agreement between the two primary annotators using Cohen’s kappa [11], obtaining a score
Proc. ACM Softw. Eng., Vol. 3, No. ISSTA, Article ISSTA128. Publication date: October 2026.


---

ISSTA128:8
D. Zheng, Y. Wang, X. Wang, K. Duan, H. Zhang, X. Liu, Y. Ma, and Z. Zheng
of 0.87, which indicates high agreement. When disagreements arise between the two primary
annotators, the task is escalated to a third annotator who serves as the arbitrator. The three
annotators then jointly examine the complete PR history, code changes, and review discussions,
and resolve discrepancies through discussion until a final consensus is reached. Only after this
consensus-based verification is the task accepted into the benchmark dataset.
4
MCR-Bench
4.1
Statistics of MCR-Bench
Fig. 4. Statistics of MCR-Bench: language distribution, review round distribution, and defect number statistics.
To profile the composition of MCR-Bench, we perform a multi-dimensional statistical analysis
on its 2,269 manually validated task instances. The analysis covers five aspects: programming
language distribution, interaction rounds distribution, defect statistics, defect severity, and defect
taxonomy.
Language Distribution. As shown in Figure 4(a), MCR-Bench spans five mainstream pro-
gramming languages with a relatively even distribution. Java accounts for 556 instances (24.50%),
followed by C# (454, 20.01%) and TypeScript (440, 19.39%), while Python and JavaScript contribute
comparable shares with 410 (18.07%) and 409 (18.03%) instances, respectively.
Interaction Round Distribution. Figure 4(b) illustrates the distribution of interaction rounds
across tasks. All tasks contain at least two review rounds. Among them, tasks with three rounds
(Round 3) constitute the largest proportion at 40.86%, followed by four-round (Round 4) and five-
round (Round 5) tasks, which account for 26.52% and 17.38%, respectively. Notably, the majority of
tasks involve three or more rounds of interaction, indicating that most samples in MCR-Bench
require models to handle long-range multi-round interactions rather than simple single-round
responses.
Statistics of Number of Defects Per Task. The violin plot in Figure 4(c) visualizes the distri-
bution of the number of defects per task. Across the entire dataset, the mean number of defects
per task is 2.37, the median is 2, and the maximum reaches 13 defects in a single task. Most tasks
contain between one and four defects. This moderate defect density ensures sufficient challenge for
evaluating model recall while avoiding excessive contextual complexity that could obscure review
signals.
Statistics of Defect Type Taxonomy. To enable a more in-depth analysis of LLM performance
across different defect types, we adopt a fine-grained taxonomy to categorize all annotated defects
in MCR-Bench. As shown in Table 1, defects are organized into two major groups: Functional
Proc. ACM Softw. Eng., Vol. 3, No. ISSTA, Article ISSTA128. Publication date: October 2026.


---

From Static to Dynamic: Benchmarking Real-World Code Review with MCR-Bench
ISSTA128:9
Table 1. Defect taxonomy and distribution in MCR-Bench.
ID
Name
Description
Ratio
E
Evolvability
Improvements that enhance future maintainability without changing
externally observable behavior.
–
E.1
Documentation
Changes to in-code information to improve human understanding.
–
E.1.1
Textual
Comments, identifier or name changes, README text, and error-message
wording.
19.19%
E.1.2
Language-Supported
Docstrings, type annotations, and language-supported documentation.
5.56%
E.2
Visual Representation
Layout or style changes for better readability.
10.25%
E.3
Structure
Changes to code organization or architecture.
–
E.3.1
Organization
Moving, splitting, merging, or extracting code.
9.61%
E.3.2
Solution Approach
Refactoring without altering externally observable semantics.
11.79%
E.4
Verification / Test
Requests to add or improve test cases.
8.98%
F
Functional
Changes that alter or fix software behavior or runtime properties.
–
F.1
Interface
API contracts and interactions between components.
5.19%
F.2
Logic
Algorithms, business rules, and control-flow correctness.
13.44%
F.3
Resource
Management of variables, resources, and state.
3.64%
F.4
Check
Guards for unhandled states and error conditions.
4.82%
F.5
Support
Interactions with external systems or dependencies.
3.16%
F.6
Performance
Efficiency and performance-related concerns.
3.74%
F.7
Security & Privacy
Security and privacy risks.
0.63%
defects, which relate to program behavior and correctness, and Evolvability defects, which concern
maintainability and long-term code quality. The taxonomy is adapted from established classification
frameworks in prior work [5, 15, 69], and we further extend it with test- and security-related
categories to improve granularity and better align with the broader software engineering literature.
• E.4 Verification / Test: This category covers review comments requesting the addition or
improvement of test cases, reflecting testing as a distinct concern in code review [18, 32].
• F.7 Security & Privacy: This category covers security vulnerabilities and privacy risks, distin-
guishing them from other functional defects in line with prior empirical studies [2, 8, 13].
As shown Table 1, overall, the distribution of defects in MCR-Bench broadly aligns with prior
code review datasets [5, 15, 69]. Functional defects mainly involve logic-related defects, followed
by interface-related problems and missing or insufficient checks, indicating that many reviews
focus on substantive correctness and robustness concerns. Evolvability defects primarily address
code readability, structure, and maintainability, with textual defects such as naming and comments
appearing frequently, alongside refactoring-oriented concerns related to solution structure and
design. These defect types capture the dual role of code review in identifying correctness defects
and improving long-term code quality and maintainability.
Statistics of Defect Severity. To examine the sensitivity of LLMs to defects of different sever-
ity levels during code review, we annotate all defects in MCR-Bench using a standard severity
classification scheme introduced in prior work [42].
As shown in Table 2, the distribution of defect severity in MCR-Bench broadly aligns with
observations from real-world code review practice, where review feedback predominantly targets
lower-risk defects, while higher-severity problems are identified less often but remain important [5,
58]. Specifically, defects labeled as Trivial, Minor, and Normal are commonly observed in MCR-
Bench and primarily relate to routine functional adjustments and code quality improvements. In
addition, MCR-Bench includes a range of higher-severity defects. Major defects capture problems
with notable impact on core functionality that are frequently identified during multi-round code
review, and although Blocker and Critical defects occur less often, they correspond to cases that
can hinder code integration or pose risks to system stability. Overall, this distribution covers both
Proc. ACM Softw. Eng., Vol. 3, No. ISSTA, Article ISSTA128. Publication date: October 2026.


---

ISSTA128:10
D. Zheng, Y. Wang, X. Wang, K. Duan, H. Zhang, X. Liu, Y. Ma, and Z. Zheng
commonly encountered, lower-risk defects and higher-severity defects with substantial impact,
enabling evaluation across a broad range of risk levels.
Table 2. Defect severity levels and their distribution in MCR-Bench.
Severity
Description
Ratio
Trivial
Cosmetic-only problems, such as misspellings or misaligned text.
22.26%
Minor
Causes a minor loss of functionality, or a defect for which an easy workaround is available.
24.54%
Normal
A regular defect that leads to partial loss of functionality under specific conditions.
29.73%
Major
Causes a major loss of functionality.
20.21%
Blocker
Blocks development and/or testing work; the change cannot proceed or be merged until the defect is fixed.
2.32%
Critical
Causes crashes, data loss, or severe memory leaks.
0.93%
4.2
Characteristics of MCR-Bench
(1) Multi-round, State-aware Code Review Benchmark. To the best of our knowledge, MCR-
Bench is the first benchmark that formulates code review as a dynamic, multi-round interaction
process at the PR level. As shown in Table 3, unlike existing benchmarks that primarily model
review as a single-round task, MCR-Bench captures the iterative nature of real-world code review,
with each task containing at least two review rounds and an average of 3.8 rounds. Beyond merely
defect identification, MCR-Bench continuously tracks defect state transitions across review rounds,
distinguishing newly introduced, open, resolved, and reappearing defects, and thus requires LLMs
to reason consistently over multi-round contexts.
(2) Rigorous Construction Pipeline with Multi-stage Verification. Unlike existing bench-
marks that are typically built from code diffs, MCR-Bench establishes a rigorous, multi-stage
construction framework tailored to multi-round review scenarios, especially our LLM-based defect
annotation pipeline. This pipeline follows a “local-first, global-later” strategy, where candidate
defects are first extracted from individual review rounds and then consolidated at the PR level
through cross-round defect merging and state tracking. To obtain reliable annotations, we indepen-
dently execute our two-stage LLM-based annotation pipeline three times per task and retain only
tasks whose resulting defect cards are fully consistent across runs, following a reliability-oriented
quality-control design commonly adopted in prior work [1, 28, 69]. Finally, all tasks undergo manual
cross-validation as a final verification step to resolve potential conflicts, further improving the
stability and accuracy of defect annotations across evolving contexts.
(3) Multi-language Benchmark with Structured Annotations and Rich Context and.
MCR-Bench is a multi-round code review benchmark that enables fine-grained analysis of LLM
performance across diverse defect characteristics. It covers five widely used programming languages:
Python, Java, JavaScript, TypeScript, and C#. Each defect instance in MCR-Bench is annotated with
structured defect categories, severity levels, and round-specific lifecycle states, enabling detailed
analysis of defect types, severity, and state evolution. Moreover, MCR-Bench operates at the PR
level with complete repository context, including linked issues and historical review interactions,
supporting realistic and context-rich evaluation of code review models.
5
Experimental Design
5.1
Research Questions
Our experiments intend to answer the following research questions (RQs):
• RQ1 (General Performance): How do mainstream LLMs perform on MCR-Bench?
Proc. ACM Softw. Eng., Vol. 3, No. ISSTA, Article ISSTA128. Publication date: October 2026.


---

From Static to Dynamic: Benchmarking Real-World Code Review with MCR-Bench
ISSTA128:11
Table 3. Comparison between popular code review benchmarks and MCR-Bench.
Dataset
Review
Granularity
#Review Rounds
#Tasks
#Languages
Context Scope
Min
Avg
Max
Trans-Review [57]
Method
1
1.0
1
1,719
1
None
AutoTransform [54]
Method
1
1.0
1
14,750
1
None
T5-Review [56]
Method
1
1.0
1
17,194
1
None
CodeReviewer [31]
Diff Hunk
1
1.0
1
10,000
9
None
CR-Agent-Dataset [51]
Commit
1
1.0
1
3,545
9
Related Source Code
Hybrid-Review-Dataset [25]
Diff Hunk
1
1.0
1
1,245
1
Related Source Code
SWR-Bench [69]
Pull Request
1
1.0
1
1,000
1
Complete Codebase
CodeFuse-CR-Bench [19]
Pull Request
1
1.0
1
601
1
Complete Codebase + Linked Issues
MCR-Bench
Pull Request
2
3.8
10
2,269
5
Complete Codebase + Linked
Issues + History Actions
• RQ2 (Performance Evolution across Rounds): How does LLM performance evolve as
the review process progresses?
• RQ3 (Root Cause Analysis): What are the primary factors contributing to model failures
(false positives and false negatives) in multi-round code review?
• RQ4 (Comment Quality): What is the quality of review comments generated by pure
LLM prompting and ACR baselines under practitioner-oriented criteria?
5.2
Studied Models and Baselines
Studied LLMs. To evaluate LLM performance in multi-round code review scenarios, we study a
diverse set of representative models drawn from both closed-source commercial systems and open-
source model families. The selected models span diverse training paradigms and context modeling
characteristics. Our evaluation includes three widely used commercial models—GPT-5.2, Claude-
Haiku-4.5, and Gemini-3-Flash [3, 17, 44]—as well as four open-source models—DeepSeek-V3.2,
Qwen3-Max, GLM-4.7, and Kimi-k2 [35, 53, 64, 67]. This selection enables a balanced evaluation
across industrial and open-source model ecosystems and provides a broad view of current LLM
capabilities in multi-round code review.
Studied ACR Baselines. We evaluate two representative automated code review (ACR) baselines,
PR-Agent and Hybrid-Review, which correspond to two common ACR designs: an agent-based
PR review pipeline and a static-analysis-assisted review generation pipeline. Existing PR-level
ACR methods are mostly designed for single-round review settings, and thus cannot be directly
applied to the multi-round, state-aware setting of MCR-Bench. We therefore select these two
representative baselines and make minimal necessary adaptations so that they can operate under
the evaluation protocol of MCR-Bench.
• PR-Agent [47] is an agent-based PR review baseline. Given a PR, it analyzes the code diff and
related PR context, and then generates review feedback through an agent-based review workflow.
• Hybrid-Review [25] is a static-analysis-assisted review generation baseline. It first collects static-
analysis warnings from the changed code and then uses these warnings as defect-related signals
to guide LLM-generated review comments.
5.3
Evaluation Metric
The unstructured nature of model-generated code review comments poses inherent evaluation
challenges, necessitating an empirical assessment of how well existing automatic metrics align
with human judgments. To this end, we survey commonly used evaluation metrics and conduct a
pre-study to analyze their agreement with human annotations, based on which we select the most
suitable metric for subsequent experiments.
Proc. ACM Softw. Eng., Vol. 3, No. ISSTA, Article ISSTA128. Publication date: October 2026.


---

ISSTA128:12
D. Zheng, Y. Wang, X. Wang, K. Duan, H. Zhang, X. Liu, Y. Ma, and Z. Zheng
Candidate Metrics. We investigate a diverse set of candidate metrics commonly used in prior
work, ranging from traditional lexical overlap metrics to LLM-based semantic and functional
evaluation approaches. Lexical overlap metrics such as BLEU-4 [7] and ROUGE-L [33] are widely
used in existing code review benchmarks for their simplicity [29–31, 41, 66], but they rely on
surface-level lexical or structural similarity. This reliance limits their ability to capture the semantic
correctness of review comments, particularly in multi-round settings where similar defects may
be expressed in varied ways or implied through context, leading to underestimation of valid
defect-identifying comments.
To address these limitations, recent studies have proposed LLM-based evaluation metrics that
leverage the reasoning and semantic understanding capabilities of LLMs. Broadly, these metrics
fall into two primary paradigms: LLM Scoring [19] and LLM-Hit-Judge [69]. LLM Scoring assigns a
quality score to a generated review comment by prompting a judge LLM with the code context
and the model output, where the score reflects the judge’s assessment of usefulness, relevance,
and clarity. In contrast, LLM-Hit-Judge focuses on defect-level correctness by verifying whether a
generated comment successfully identifies a specific ground-truth defect through binary judgment.
In our pre-study, we employ three models as judge LLMs—GPT-5.2-pro, Claude-Opus-4.5, and
Gemini-3-pro—to examine the robustness and representativeness of these LLM-based evaluation
metrics.
Pre-study Design and Human Annotation. To identify the evaluation metric that is most
consistent with human judgment, we randomly sample 10% of the generated review comments
produced by the selected LLMs on MCR-Bench as evaluation instances. We invite four senior de-
velopers, each with more than five years of programming experience, to serve as human annotators
and perform cross-validation on the sampled comments. For each instance, the annotators label the
true defect hit rate (Human Hit Rate), which serves as the ground truth for subsequent analysis.
Agreement Measurement. We then apply all candidate automatic evaluation metrics to the
same set of review comments. For lexical overlap metrics, scores are computed by comparing the
generated comments with the corresponding reference annotations. For LLM-based metrics, in
our pre-study, we employ three strong models as judge LLMs (GPT-5.2-pro, Claude-Opus-4.5, and
Gemini-3-pro). The resulting metric scores are then correlated with the Human Hit Rate to assess
their consistency with human judgments.
We use the Quadratic Weighted Kappa (QWK) [6, 12, 62] to quantify the agreement between the
scores produced by automatic evaluation metrics and the Human Hit Rate. QWK assigns lower
agreement scores when the discrepancy between human judgments and automatic metric scores is
larger, thereby reflecting how closely an automatic metric aligns with human evaluation.
Table 4. Agreement between automatic metrics
and Human Hit Rate measured by QWK on the
sampled MCR-Bench evaluation set.
Metric
QWK
ROUGE-L
0.21
BLEU-4
0.27
LLM Scoring (Claude Opus 4.5)
0.58
LLM Scoring (Gemini 3 Pro)
0.55
LLM Scoring (GPT-5.2 Pro)
0.60
LLM-Hit-Judge (Claude Opus 4.5)
0.70
LLM-Hit-Judge (Gemini 3 Pro)
0.67
LLM-Hit-Judge (GPT-5.2 Pro)
0.73
Pre-study Results. Table 4 reports the agree-
ment between different automatic evaluation met-
rics and the Human Hit Rate, measured by QWK.
Traditional text-overlap-based metrics, such as
ROUGE-L and BLEU-4, achieve low QWK scores
of 0.21 and 0.27, indicating limited agreement with
human judgments and a limited ability to reflect
human-annotated defect coverage at the hit-rate
level. In contrast, LLM-based evaluation metrics
show substantially higher agreement with human
judgments. LLM Scoring achieves QWK values rang-
ing from 0.55 to 0.60 across different judge models,
corresponding to moderate agreement, while the
defect-coverage-oriented LLM-Hit-Judge attains the highest QWK scores across all three judge
Proc. ACM Softw. Eng., Vol. 3, No. ISSTA, Article ISSTA128. Publication date: October 2026.


---

From Static to Dynamic: Benchmarking Real-World Code Review with MCR-Bench
ISSTA128:13
models, with a peak value of 0.73. Based on these results, we adopt LLM-Hit-Judge with GPT-
5.2-pro as the judge model as the primary evaluation metric in all subsequent experiments. For
completeness, we additionally report the raw scores of all studied metrics in our public repository.1
6
Experimental Results
Table 5. Performance across programming languages and overall results (Precision / Recall / F1).
Model
Python
Java
JavaScript
TypeScript
C#
Overall
Prec.
Rec.
F1
Prec.
Rec.
F1
Prec.
Rec.
F1
Prec.
Rec.
F1
Prec.
Rec.
F1
Prec.
Rec.
F1
Claude Haiku 4.5
0.556
0.619
0.540
0.561
0.643
0.548
0.640
0.664
0.599
0.552
0.594
0.520
0.587
0.631
0.548
0.579
0.630
0.551
DeepSeek V3.2
0.620
0.442
0.484
0.605
0.481
0.495
0.673
0.476
0.519
0.590
0.430
0.460
0.638
0.447
0.491
0.625
0.455
0.490
Gemini 3 Flash
0.649
0.548
0.554
0.594
0.562
0.529
0.653
0.564
0.553
0.571
0.491
0.486
0.638
0.540
0.538
0.621
0.541
0.532
GLM-4.7
0.597
0.446
0.476
0.604
0.465
0.491
0.626
0.464
0.489
0.553
0.402
0.425
0.602
0.432
0.467
0.596
0.442
0.470
GPT-5.2
0.651
0.563
0.563
0.582
0.574
0.527
0.682
0.566
0.573
0.584
0.545
0.516
0.609
0.557
0.533
0.622
0.561
0.542
Kimi K2
0.520
0.357
0.388
0.453
0.352
0.364
0.514
0.365
0.391
0.443
0.314
0.331
0.522
0.356
0.389
0.490
0.349
0.373
Qwen3 Max
0.539
0.386
0.411
0.507
0.412
0.414
0.544
0.401
0.422
0.506
0.367
0.388
0.199
0.140
0.153
0.459
0.341
0.357
6.1
General Performance (RQ1)
This subsection investigates the overall performance of mainstream LLMs on MCR-Bench in
multi-round code review scenarios. To thoroughly assess their capability in handling multi-round
code review tasks, we structure our evaluation around two core dimensions: (i) the ability of LLMs
to identify defects under multi-round code review settings, and (ii) their ability to track defect states
across successive review rounds. Based on these two dimensions, we further conduct in-depth
analyses to examine model behavior under different defect characteristics and to reveal common
strengths and limitations in multi-round code review settings.
6.1.1
Defect Detection Performance. Table 5 presents the performance of all studied LLMs on defect
identification across five programming languages. Overall, mainstream LLMs exhibit only modest
performance on MCR-Bench, with F1 scores largely in the low-to-medium range and the best-
performing model slightly exceeding 0.55, indicating persistent challenges in defect identification
and contextual reasoning under multi-round code review settings.
From a model-centric perspective, noticeable performance differences are observed across dif-
ferent LLMs. Claude Haiku 4.5 and GPT-5.2 consistently achieve higher F1 scores across most
programming languages, with relatively balanced precision and recall, reflecting more stable de-
fect identification behavior. In contrast, LLMs such as Qwen3-Max and Kimi-K2 tend to make
conservative predictions in multi-round code review, which leads to consistently low recall and,
consequently, lower overall F1 scores.
From a language-centric perspective, performance differences are observed across programming
languages. Models generally achieve higher F1 scores on Python and JavaScript, where relative
performance rankings remain more stable, compared to Java, TypeScript, and C#. For languages
such as TypeScript and C#, most models experience a pronounced drop in recall, and some perform
substantially worse than their overall averages.
6.1.2
Performance of PR-Level ACR Baselines. We further evaluate representative PR-level ACR
baselines under the defect detection setting of MCR-Bench, with results reported in Table 6. Overall,
both baselines achieve limited performance, with generally low F1 scores and consistently low
recall. This indicates that existing PR-level review baselines still struggle to capture defects whose
evidence evolves across review discussions and code revisions.
Comparison between ACR baselines. PR-Agent generally achieves higher overall F1 than
Hybrid-Review, likely because their designs provide different types of evidence for defect detection.
PR-Agent directly analyzes PR diffs and related PR context through an agent-based review workflow,
1https://github.com/DeepSoftwareAnalytics/MCR-bench
Proc. ACM Softw. Eng., Vol. 3, No. ISSTA, Article ISSTA128. Publication date: October 2026.


---

ISSTA128:14
D. Zheng, Y. Wang, X. Wang, K. Duan, H. Zhang, X. Liu, Y. Ma, and Z. Zheng
Table 6. Performance of baselines across programming languages and overall results (Precision / Recall / F1).
Baselines
Model
Python
Java
JavaScript
TypeScript
C#
Overall
Prec. Rec. F1
Prec. Rec. F1
Prec. Rec. F1
Prec. Rec. F1
Prec. Rec. F1
Prec. Rec. F1
PR-Agent
Claude Haiku 4.5
0.273 0.236 0.232
0.299 0.306 0.276
0.311 0.278 0.268
0.290 0.260 0.248
0.308 0.266 0.259
0.296 0.269 0.257
DeepSeek V3.2
0.462 0.389 0.391
0.508 0.527 0.466
0.474 0.422 0.407
0.463 0.421 0.403
0.489 0.423 0.414
0.479 0.436 0.416
Gemini 3 Flash
0.271 0.127 0.161
0.315 0.148 0.188
0.351 0.181 0.222
0.292 0.147 0.182
0.328 0.152 0.193
0.311 0.151 0.189
GPT-5.2
0.352 0.283 0.279
0.393 0.420 0.356
0.389 0.353 0.323
0.340 0.325 0.289
0.383 0.318 0.303
0.371 0.340 0.310
Kimi K2
0.381 0.283 0.301
0.488 0.411 0.410
0.456 0.345 0.364
0.413 0.310 0.325
0.436 0.313 0.333
0.435 0.332 0.347
Qwen3 Max
0.427 0.283 0.317
0.552 0.422 0.441
0.492 0.342 0.372
0.466 0.323 0.353
0.498 0.323 0.360
0.487 0.339 0.369
Hybrid-Review
Claude Haiku 4.5
0.252 0.233 0.220
0.251 0.289 0.246
0.288 0.283 0.260
0.249 0.252 0.227
0.313 0.266 0.260
0.270 0.265 0.243
DeepSeek V3.2
0.233 0.242 0.218
0.335 0.419 0.343
0.310 0.334 0.293
0.295 0.346 0.292
0.366 0.354 0.327
0.308 0.339 0.295
Gemini 3 Flash
0.257 0.119 0.151
0.260 0.122 0.154
0.308 0.155 0.192
0.258 0.127 0.160
0.291 0.134 0.170
0.275 0.131 0.165
GPT-5.2
0.255 0.281 0.236
0.313 0.437 0.328
0.299 0.348 0.285
0.248 0.328 0.250
0.314 0.321 0.275
0.286 0.343 0.275
Kimi K2
0.205 0.113 0.135
0.298 0.185 0.214
0.272 0.151 0.180
0.233 0.141 0.165
0.253 0.137 0.166
0.252 0.145 0.172
Qwen3 Max
0.196 0.161 0.161
0.273 0.277 0.253
0.249 0.216 0.210
0.220 0.203 0.190
0.335 0.250 0.260
0.254 0.221 0.215
while Hybrid-Review relies on static-analysis warnings to guide review generation. Such warnings
can help identify certain local code issues, but may provide limited evidence for defects whose
identification depends on evolving discussions, attempted fixes, or cross-round state changes,
leaving Hybrid-Review more constrained by low recall in MCR-Bench. Comparison with directly
prompted LLMs. Both ACR baselines generally obtain lower performance than the directly
prompted base LLMs in Table 5. This suggests that current ACR pipelines do not consistently turn
their PR-level review workflows into better multi-round defect detection. This limitation is likely
related to their original design goals: these pipelines are primarily designed for single-pass PR
review comment generation, where the focus is on producing useful feedback from the current diff
and local PR context, whereas MCR-Bench requires models to connect review discussions, code
revisions, and defect lifecycle states across rounds. As a result, pipeline-level context selection,
prompting, or intermediate processing may fail to preserve all defect-relevant signals.
6.1.3
Defect State Tracking Capability. Table 7 reports the accuracy of defect lifecycle state pre-
diction for each LLM, which is calculated exclusively on the subset of correctly identified defects
(True Positives). This is because predicting the lifecycle state is only meaningful when the defect
itself has been successfully identified by the LLM.
Table 7. Accuracy of different models across program-
ming languages and overall performance.
Model
Py
Java
JS
TS
C#
Overall
Claude Haiku 4.5
80.74%
82.77%
79.76%
78.36%
75.84%
79.69%
DeepSeek V3.2
72.53%
77.24%
73.12%
68.59%
69.34%
72.60%
GLM-4.7
61.39%
73.68%
61.69%
60.11%
61.25%
64.49%
GPT-5.2
70.40%
75.31%
66.60%
70.55%
71.04%
71.23%
Kimi K2
43.57%
48.97%
50.66%
45.00%
41.26%
45.95%
Qwen3 Max
47.26%
45.13%
44.41%
44.93%
40.82%
44.34%
From an LLM-centric perspective, Claude
Haiku 4.5 achieves the strongest performance
in defect lifecycle state prediction across all
programming languages, with an overall accu-
racy close to 80% and relatively stable results
across languages. GPT-5.2 and DeepSeek V3.2
follow, both reaching overall accuracies around
70%, but showing greater variation across differ-
ent languages. In contrast, the remaining LLMs
exhibit substantially lower accuracy on this task, reflecting a notable gap in multi-round state
reasoning capability.
From a language-centric perspective, models generally achieve higher lifecycle state prediction
accuracy on Python and Java than on JavaScript, TypeScript, and C#. This pattern is consistent
across LLMs, suggesting that state prediction performance varies with programming language
settings. For languages such as TypeScript and C#, most models struggle to accurately capture
signals of cross-round state transitions, leading to noticeably lower prediction accuracy.
It is worth noting that even under the prerequisite of correct defect identification, LLM per-
formance on lifecycle state prediction does not reach saturation. This observation indicates that
Proc. ACM Softw. Eng., Vol. 3, No. ISSTA, Article ISSTA128. Publication date: October 2026.


---

From Static to Dynamic: Benchmarking Real-World Code Review with MCR-Bench
ISSTA128:15
lifecycle state identification is not a superficial classification task, but rather depends on a model’s
integrated understanding of code changes, review comments, and historical context across multiple
rounds, thereby placing higher demands on cross-round reasoning ability.
Table 8. Hit Rate of different LLMs across taxonomy categories.
LLM
E.1.1
E.1.2
E.2
E.3.1
E.3.2
E.4
F.1
F.2
F.3
F.4
F.5
F.6
F.7
Claude Haiku 4.5
0.5899
0.7033
0.5945
0.5685
0.5923
0.5439
0.5805
0.6510
0.6436
0.6526
0.5170
0.5370
0.5714
DeepSeek V3.2
0.4165
0.4923
0.4377
0.4174
0.4097
0.3606
0.3702
0.4362
0.4078
0.4852
0.3693
0.3824
0.3333
Gemini 3 Flash
0.5065
0.5793
0.4957
0.4515
0.5091
0.4798
0.5000
0.5346
0.5498
0.5899
0.4500
0.4300
0.4737
GLM-4.7
0.3828
0.4361
0.4154
0.3619
0.3537
0.3589
0.3655
0.4428
0.3881
0.5123
0.4246
0.3512
0.4167
GPT-5.2
0.5161
0.6000
0.5094
0.4785
0.5008
0.4735
0.5292
0.5820
0.6029
0.6483
0.5028
0.5243
0.4872
Kimi K2
0.2807
0.3746
0.2061
0.1977
0.2748
0.2967
0.3552
0.4160
0.4363
0.4773
0.2924
0.3005
0.3714
Qwen3 Max
0.3072
0.4034
0.2030
0.2582
0.2939
0.3516
0.4211
0.4311
0.4743
0.5369
0.2899
0.3074
0.2766
Overall (Avg.)
0.4285
0.5127
0.4088
0.3905
0.4192
0.4093
0.4460
0.4991
0.5004
0.5575
0.4066
0.4047
0.4186
6.1.4
Deeper Analysis. To gain more insights into LLMs’ performance in multi-round code review
scenarios, we conduct deeper analyses beyond overall performance metrics. Specifically, we examine
performance from three perspectives: (1) LLMs’ defect identification capability across different
defect categories, (2) LLM performance across different defect severity levels, and (3) typical error
patterns in lifecycle state prediction.
Hit Rate by Defect Category. Table 8 reports the hit rate of each LLM across different defect
categories. Overall, LLMs’ performance varies substantially across categories, and the average hit
rate remains relatively low for many categories, indicating that defect identification difficulty is
highly imbalanced across defect types in multi-round code review.
From Table 8, several categories (e.g., E.1.2, F.3, and F.4) achieve relatively higher hit rates,
with average values close to or above 0.50, which may reflect that defects in these categories
are associated with clearer semantic cues in review discussions and are therefore comparatively
easier for LLMs to recognize. In contrast, categories such as E.2, E.3.1, and several F subtypes
exhibit noticeably lower average hit rates, pointing to ongoing challenges for LLMs in capturing
implicit logic or cross-round evolution characteristics associated with these defects. Notably, these
category-level performance differences are largely consistent across models: categories that are
easier or harder to identify tend to follow similar rankings for most LLMs, suggesting that the
observed disparities are more closely related to the semantic and structural properties of defect
categories than to idiosyncratic behaviors of individual models.
Table 9. Hit rates of LLMs across defect severity levels.
LLM
Trivial
Minor
Normal
Major
Blocker
Critical
Claude Haiku 4.5
0.5810
0.5609
0.5947
0.6707
0.6074
0.6607
DeepSeek V3.2
0.4216
0.3970
0.4143
0.4424
0.3858
0.4808
Gemini 3 Flash
0.4888
0.4815
0.4926
0.5761
0.5116
0.5472
GLM-4.7
0.3910
0.3523
0.3892
0.4608
0.3876
0.5000
GPT-5.2
0.4941
0.5069
0.5332
0.5964
0.4453
0.6667
Kimi K2
0.2149
0.2455
0.3522
0.4227
0.3440
0.3800
Qwen3 Max
0.2459
0.2857
0.3807
0.4439
0.2733
0.4247
Overall (Avg.)
0.4053
0.4043
0.4510
0.5161
0.4221
0.5229
Hit Rate by Defect Severity. As
shown in Table 9, LLM performance
varies across defect severity levels.
In general, LLMs achieve higher hit
rates on higher-severity defects (e.g.,
Major, Blocker, and Critical) than on
lower-severity ones (e.g., Minor and
Trivial). From the overall averages
(Overall Avg.), the hit rates for Ma-
jor and Critical defects exceed 0.5,
whereas performance on Minor and Trivial defects remains substantially lower, a pattern that
is largely consistent across different LLMs. Most models show relatively stable performance on
higher-severity defects but exhibit a clear decline in hit rate as severity decreases, with the drop
being most pronounced for Trivial defects.
To further analyze this observation, we manually inspected several randomly sampled cases across
different severity levels. We found that higher-severity defects usually have stronger behavioral
Proc. ACM Softw. Eng., Vol. 3, No. ISSTA, Article ISSTA128. Publication date: October 2026.


---

ISSTA128:16
D. Zheng, Y. Wang, X. Wang, K. Duan, H. Zhang, X. Liu, Y. Ma, and Z. Zheng
Table 10. Average F1 score of different LLMs across increasing review rounds.
LLM
R2
R3
R4
R5
R6
R7
R8
R9
R10
Claude Haiku 4.5
0.6495
0.6173
0.5359
0.5310
0.5313
0.4768
0.5227
0.5181
0.2857
DeepSeek V3.2
0.5291
0.5559
0.5359
0.5148
0.4714
0.3964
0.3449
0.3667
0.3333
Gemini 3 Flash
0.5983
0.5985
0.5554
0.5117
0.5371
0.5624
0.4910
0.3600
0.3333
GLM-4.7
0.5025
0.5093
0.5220
0.5334
0.4839
0.4827
0.4967
0.5333
0.3333
GPT-5.2
0.5995
0.5906
0.5659
0.5671
0.5067
0.6238
0.5000
0.6048
0.5000
Kimi K2
0.3946
0.3463
0.3571
0.3450
0.3509
0.3356
0.4410
0.3467
0.3333
Qwen3 Max
0.3927
0.3766
0.3580
0.3710
0.3624
0.3579
0.3654
0.3333
0.4444
impact and leave clearer signals in code changes, reviewer discussions, and subsequent revisions,
making them easier for LLMs to identify. In contrast, lower-severity issues are often more subtle
and depend on finer-grained semantic or convention-specific cues, making them easier to overlook.
State Prediction Error Patterns. Figure 5 illustrates the major error patterns in LLM predictions
for the lifecycle state identification task. As shown in Figure 5, the most prominent state prediction
error is confusing Resolved defects as New (38.29%). This is followed by misclassifying Open defects
as New (22.06%) and predicting Resolved defects as Open (18.20%). A comparable proportion of
errors also arises from predicting Open defects as Resolved (16.01%).
Fig. 5. Distribution of LLMs’ error patterns in multi-
round defect lifecycle state tracking.
As shown in Figure 5, the most prominent
error pattern is erroneously inferring Resolved
defects as New. This pattern suggests that mod-
els often fail to effectively leverage historical
context across review rounds and tend to mis-
interpret already resolved defects as newly in-
troduced defects, reflecting insufficient capabil-
ity in remembering and integrating whether a
defect has been fully addressed. Similarly, con-
fusion from Open to New is relatively common,
further indicating systematic difficulty in dis-
tinguishing persistent defects from newly in-
troduced ones.
In addition, bidirectional confusion between
Resolved and Open constitutes a substantial portion of errors. Such errors typically arise in cases
where a defect has been partially addressed but review discussions are still ongoing, suggesting that
models struggle to determine whether a defect has reached a fully resolved state. This highlights
that lifecycle state prediction depends not only on the outcome of a single code modification, but
also on a holistic understanding of review comments, subsequent feedback, and the adequacy of
code changes.
In contrast, errors involving the Reopened state occur at a lower frequency. This may be attributed
to the lower prevalence of the Reopened state in MCR-Bench and its relatively clear semantic
boundary, and also indicates that models are comparatively reliable at recognizing explicit reopening
signals. However, when finer distinctions between Reopened and other states are required, models
may still produce incorrect predictions.
6.2
Performance Evolution across Rounds (RQ2)
In this experiment, we investigate how interaction depth affects the performance of LLMs in multi-
round code review scenarios, with a particular focus on whether models experience performance
degradation under long-range interactions and whether they can maintain stable tracking of defects
and their lifecycle states as contextual information continuously accumulates. Note that, Round 1
Proc. ACM Softw. Eng., Vol. 3, No. ISSTA, Article ISSTA128. Publication date: October 2026.


---

From Static to Dynamic: Benchmarking Real-World Code Review with MCR-Bench
ISSTA128:17
Table 11. Error taxonomy of False Positives (FP) and False Negatives (FN) in multi-round code review.
Type
Error Category
Description
Prop.
FP
State–Temporal Mis-
alignment
Failure to align defect states with code versions, causing already resolved defects
to be repeatedly flagged as new.
32.5%
Over-reviewing
The model continues to produce review comments in the absence of real defects,
misclassifying suggestions or speculative concerns as defects.
27.8%
Lack
of
Domain
Knowledge
Insufficient understanding of project- or domain-specific conventions leads to
reasonable but non-general implementations being misidentified as defects.
22.4%
Version Compatibil-
ity Blindness
Ignoring language or runtime version constraints and backward-compatibility
requirements, the model suggests infeasible best-practice changes.
12.1%
Other
–
5.2%
FN
Long-range Depen-
dency Miss
Failure to capture cross-file dependencies or downstream impacts of local changes
results in missing real defects.
23.4%
Semantic
Defect
Blindness
Defects requiring semantic or specification-level reasoning are missed due to
shallow pattern matching.
22.3%
Cross-round Defect
Forgetting
The model fails to track unresolved defects across review rounds and stops
mentioning them prematurely.
25.1%
Over-optimistic Fix
Assumption
Partial fixes are incorrectly assumed to fully resolve defects, overlooking uncov-
ered edge cases or paths.
15.2%
Sycophancy
Over-reliance on developer claims without sufficient code verification leads to
missed defects.
6.5%
Other
–
7.5%
serves as the initial phase and inherently lacks the historical antecedents necessary to observe
defect evolution. Consequently, to strictly align with our focus on multi-round dynamics and state
transitions, we commence our performance analysis from Round 2 onward.
As shown in Table 10, the average F1 scores of different LLMs across review rounds R2–R10
illustrate how performance evolves over successive interactions. As the number of review rounds
increases, most LLMs exhibit varying degrees of performance degradation, indicating that long-
range multi-round interactions substantially increase the difficulty of defect identification and
state tracking. In earlier rounds (e.g., R2–R4), most LLMs maintain relatively stable performance;
however, as contextual information accumulates, performance begins to fluctuate noticeably and,
in some cases, degrades significantly in later rounds.
Additionally, performance under long-range interactions differs substantially across LLMs. Claude
Haiku 4.5 achieves strong results in early review rounds but exhibits a gradual degradation as
interaction depth increases, with a pronounced decline observed at R10. DeepSeek V3.2, Gem-
ini 3 Flash, and GLM-4.7 follow similar patterns, with F1 scores remaining at relatively low levels
in later rounds. In contrast, GPT-5.2 demonstrates stronger stability in deeper interactions, main-
taining comparatively higher F1 scores in later rounds such as R7 and R9. This pattern indicates
that GPT-5.2 holds relative advantages in cross-round state tracking and long-context reasoning.
Overall, the results show that mainstream LLMs face notable challenges in sustaining consistent
performance in long-range, multi-round code review scenarios. As the number of review rounds
increases, accumulated contextual noise and the dispersion of state-related cues substantially
increase reasoning difficulty, thereby imposing greater demands on LLMs’ long-term memory and
cross-round information integration capabilities.
6.3
Root Cause Analysis (RQ3)
In multi-round code review scenarios, LLM errors can be broadly categorized into two types: False
Positives (FP) and False Negatives (FN). These two error types represent distinct failure modes in
multi-round code review—over-reviewing and defect omission—with substantially different causes
and consequences. Specifically, FP errors occur when an LLM incorrectly predicts the presence of
a defect or continues to flag a defect that does not exist or has already been resolved. While FN
Proc. ACM Softw. Eng., Vol. 3, No. ISSTA, Article ISSTA128. Publication date: October 2026.


---

ISSTA128:18
D. Zheng, Y. Wang, X. Wang, K. Duan, H. Zhang, X. Liu, Y. Ma, and Z. Zheng
errors arise when an LLM fails to identify a defect that truly exists and remains unresolved, or
prematurely stops tracking a defect in subsequent review rounds.
Given the distinct nature of FP and FN errors, we analyze them separately and adopt an open
coding approach to construct a taxonomy of LLM failure causes in multi-round code review.
Specifically, we recruit four experienced programmers to manually analyze erroneous predictions
produced by LLMs on MCR-Bench using a two-stage open coding procedure, with FP and FN
errors analyzed separately throughout. In the first stage, we randomly sample 10% of FP and FN
errors for analysis. The annotators independently examine the corresponding code changes, review
discussions, and defect lifecycle information, assign descriptive labels to potential root causes, and
then consolidate semantically similar labels through group discussions to form preliminary FP
and FN taxonomies. In the second stage, all error instances are categorized based on the initial
taxonomy, with new categories introduced when novel patterns emerge and previously annotated
cases revisited to ensure consistency.
FP Error Analysis. Table 11 shows that FP errors mainly arise from several failure modes,
among which State–Temporal Misalignment constitutes the largest proportion (32.5%) and represents
the most critical root cause. This failure stems from the LLM’s inability to correctly align defect
states with code review process evolution: even after a defect is fixed in later commits, the LLM
may continue to rely on early-round comments or outdated code and label the defect as New or
reintroduce it. Such errors severely disrupt defect lifecycle tracking in multi-round settings, leading
to repeated counting of the same defect and cascading misjudgments in later rounds, and reflect
fundamental limitations in cross-round information integration and temporal reasoning.
Beyond state–temporal misalignment, the second prominent FP root cause is Over-reviewing
(27.8%), which stems not from cross-round memory failures but from biased defect judgment.
In the absence of sufficient evidence, LLMs tend to over-generate review comments or advisory
suggestions as actual defects, reflecting difficulties in distinguishing optional improvements from
mandatory fixes and in regulating review strictness. In addition, Lack of Domain Knowledge (22.4%)
and Version Compatibility Blindness (12.1%) constitute another source of FP errors, as limited aware-
ness of project-specific conventions or version constraints leads LLMs to flag context-dependent
implementations or suggest infeasible changes. Overall, FP errors are dominated by over-reviewing
under insufficient evidence and limited contextual understanding, highlighting systemic limitations
in review decision boundaries and multi-round state maintenance.
FN Error Analysis. As shown in Table 11, FN errors mainly stem from LLMs’ difficulties in
maintaining consistent defect awareness across multi-round code review. Among the identified
causes, Cross-round Defect Forgetting is the most prevalent (25.1%), where LLMs fail to continuously
track unresolved defects across successive rounds. Defects identified early but not fully fixed are
often prematurely dropped as attention shifts to newly introduced changes or discussions. This
pattern highlights fundamental limitations in long-range state maintenance and helps explain the
increasing miss rates observed as contextual information accumulates.
Beyond cross-round defect forgetting, FN errors are primarily driven by limitations in capturing
deeper semantic and long-range dependencies. Long-range Dependency Miss (23.4%) reflects diffi-
culties in reasoning about cross-file interactions and system-level effects, while Semantic Defect
Blindness (22.3%) indicates failures to identify defects that require semantic or specification-level
reasoning beyond surface patterns. In addition, Over-optimistic Fix Assumption (15.2%) reveals a bias
toward prematurely judging defects as resolved based on partial changes or developer responses,
which further amplifies missed detections in later rounds. Finally, Sycophancy (6.5%), though less
frequent, highlights a tendency for LLMs to overly trust developer statements without sufficient
code verification. Collectively, these error types underscore fundamental limitations in program
Proc. ACM Softw. Eng., Vol. 3, No. ISSTA, Article ISSTA128. Publication date: October 2026.


---

From Static to Dynamic: Benchmarking Real-World Code Review with MCR-Bench
ISSTA128:19
semantic modeling, long-range reasoning, and independent verification, which hinder reliable
defect identification in multi-round code review.
6.4
Comment Quality (RQ4)
Beyond defect detection and defect lifecycle state tracking, we further assess the quality of generated
review comments. Specifically, we adopt ClearCRC [9], a practitioner-oriented comment quality
analysis framework derived from developers’ expectations of clear code review comments. ClearCRC
evaluates each generated review comment along three dimensions: Relevance, which measures
whether a comment is well aligned with the code change and review issue under discussion;
Informativeness, which measures whether the comment provides sufficiently concrete and useful
information; and Expression, which measures whether the comment is clearly and understandably
phrased. Based on ClearCRC, we evaluate the quality of review comments generated by pure LLM
prompting and ACR baselines.
Table 12. ClearCRC-based quality evaluation results for generated review comments.
Model
Pure LLM
PR-Agent
Hybrid-Review
Rel.
Info.
Expr.
Avg.
Rel.
Info.
Expr.
Avg.
Rel.
Info.
Expr.
Avg.
Claude Haiku 4.5 0.7215 0.4329 0.9909 0.7151 0.6887 0.7076 0.8194 0.7386 0.3559 0.3828 0.6445 0.4611
DeepSeek V3.2
0.8891 0.5941 0.9553 0.8128 0.6624 0.6712 0.8684 0.7340 0.4654 0.4597 0.6599 0.5283
Gemini 3 Flash
0.8552 0.6407 0.7977 0.7646 0.3117 0.2175 0.5345 0.3546 0.2649 0.1659 0.4717 0.3008
GPT-5.2
0.8149 0.3598 0.9728 0.7158 0.7536 0.9302 0.9592 0.8810 0.6304 0.7968 0.8804 0.7692
Kimi K2
0.9216 0.5389 0.9467 0.8024 0.7773 0.6526 0.9236 0.7845 0.2940 0.2459 0.5274 0.3557
Qwen3 Max
0.8656 0.4795 0.9452 0.7634 0.7756 0.7379 0.8836 0.7990 0.3711 0.3558 0.5949 0.4406
Table 12 reports the ClearCRC-based quality evaluation results for generated review comments.
In the table, Rel., Info., and Expr. denote Relevance, Informativeness, and Expression, respectively, and
Avg. denotes their average. Overall, comment quality differs noticeably across generation settings
and backbone models. Pure LLM prompting and PR-Agent generally achieve higher average scores
than Hybrid-Review, while the best-performing setting varies by backbone model: pure LLM
prompting performs strongly for DeepSeek V3.2 and Kimi K2, whereas PR-Agent achieves the
highest averages for GPT-5.2 and Qwen3 Max.
At the dimension level, different settings show distinct quality profiles. Pure LLM prompting
often obtains high Expression scores but more uneven Informativeness scores, suggesting fluent but
not always sufficiently informative comments. PR-Agent tends to be more balanced for stronger
backbones, especially in Informativeness, while Hybrid-Review receives lower scores in most
settings. These results indicate that comment quality and defect identification accuracy capture
complementary aspects of automated code review, since higher-quality comments do not necessarily
imply stronger defect coverage.
7
Discussion
7.1
Potential Impacts
Benchmarking Multi-round Dynamics. MCR-Bench provides a state-aware evaluation frame-
work for modeling defect evolution across review rounds. By moving beyond single-round settings,
it enables the assessment of cross-round defect identification and lifecycle tracking in more realistic
multi-round review scenarios.
Implications for Future Automated Code Review Research. Our findings suggest that
future automated review methods should fully consider multi-round review scenarios during
design. In particular, the performance drop across later rounds and frequent errors such as defect
forgetting and temporal misalignment highlight the need for cross-round memory, historical context
Proc. ACM Softw. Eng., Vol. 3, No. ISSTA, Article ISSTA128. Publication date: October 2026.


---

ISSTA128:20
D. Zheng, Y. Wang, X. Wang, K. Duan, H. Zhang, X. Liu, Y. Ma, and Z. Zheng
grounding, and lifecycle-aware state tracking [76]. Moreover, the ACR baseline and ClearCRC
results indicate that pipeline complexity or fluent comments do not necessarily lead to stronger
defect detection, suggesting that future research should jointly consider defect identification, state
tracking, and comment quality.
7.2
Threats to Validity
Internal Threats. Internal threats mainly relate to LLM selection, consistency filtering, and human
annotation. First, the evaluated LLMs are limited in number. Although we include representative
closed-source and open-weight LLMs, the results may not generalize to all existing or future LLMs.
Second, consistency filtering may exclude some particularly difficult instances; however, we adopt
this design to improve annotation reliability, and the modest overall performance of current models
on MCR-Bench suggests that the retained benchmark remains challenging in practice. Third,
human annotation may involve subjective judgment. To mitigate this threat, we adopt a rigorous
cross-validation protocol with independent double annotation, arbitration by a third annotator
when disagreements arise, and a high inter-annotator agreement measured by Cohen’s kappa [11]
(0.87), thereby reducing individual bias and improving annotation reliability.
External Threats. External threats primarily concern the representativeness of real-world code
review scenarios and the coverage of evaluation metrics. As proprietary enterprise repositories are
generally not publicly accessible, MCR-Bench may not fully capture all aspects of enterprise-scale
development; however, we focus on large, actively maintained repositories that closely reflect indus-
trial coding practices and collaboration workflows. Another potential threat relates to the choice of
evaluation metrics. While our evaluation does not exhaustively include all metrics proposed in the
literature, we adopt a representative set of widely used and empirically validated metrics. Through
a pre-study, we verify that the selected evaluation criteria exhibit strong consistency with human
judgments, providing empirical support for their soundness and effectiveness.
8
Conclusion
In this paper, we introduce MCR-Bench, a new benchmark for real-world multi-round code review.
By modeling cross-round defect identification and defect lifecycle state transitions from practical
review workflows, MCR-Bench enables principled evaluation of LLMs’ abilities in defect discovery
and tracking under continuous review settings, addressing the limitations of prior single-round-
focused studies. Accordingly, MCR-Bench provides a more realistic evaluation foundation for code
review research and facilitates the development and assessment of more effective multi-round,
state-aware LLM-based review systems for practical software development workflows.
Acknowledgments
This work is supported by the National Natural Science Foundation of China (Grant No. 92582202,
No. 62302534), and GMCC-SYSU Joint Lab for Smart Applications.
9
Data Availability
To facilitate the replication study, we have released our code and the experimental data at https:
//github.com/DeepSoftwareAnalytics/MCR-bench.
References
[1] Toufique Ahmed, Premkumar Devanbu, Christoph Treude, and Michael Pradel. 2025. Can LLMs Replace Manual
Annotation of Software Engineering Artifacts?. In 2025 IEEE/ACM 22nd International Conference on Mining Software
Repositories (MSR). doi:10.1109/MSR66628.2025.00086
Proc. ACM Softw. Eng., Vol. 3, No. ISSTA, Article ISSTA128. Publication date: October 2026.


---

From Static to Dynamic: Benchmarking Real-World Code Review with MCR-Bench
ISSTA128:21
[2] Mahmoud Alfadel, Nicholas Alexandre Nagy, Diego Elias Costa, Rabe Abdalkareem, and Emad Shihab. 2023. Empirical
analysis of security-related code reviews in npm packages. J. Syst. Softw. 203, C (Sept. 2023), 19 pages. doi:10.1016/j.jss.
2023.111752
[3] Anthropic [n. d.]. https://www.anthropic.com
[4] Alberto Bacchelli and Christian Bird. 2013. Expectations, outcomes, and challenges of modern code review. In 2013
35th International Conference on Software Engineering (ICSE). IEEE, 712–721. doi:10.1109/ICSE.2013.6606617
[5] Moritz Beller, Alberto Bacchelli, Andy Zaidman, and Elmar Juergens. 2014. Modern code reviews in open-source projects:
which problems do they fix?. In Proceedings of the 11th Working Conference on Mining Software Repositories (Hyderabad,
India) (MSR 2014). Association for Computing Machinery, New York, NY, USA, 202–211. doi:10.1145/2597073.2597082
[6] Arie Ben-David. 2008. Comparison of classification accuracy using Cohen’s Weighted Kappa. Expert Systems with
Applications 34, 2 (2008), 825–832. doi:10.1016/j.eswa.2006.10.022
[7] Blue Oak Council [n. d.]. https://blueoakcouncil.org/
[8] Wachiraphan Charoenwet, Patanamon Thongtanunam, Van-Thuan Pham, and Christoph Treude. 2024. Toward
effective secure code reviews: an empirical study of security-related coding weaknesses. Empirical Software Engineering
29, 4 (2024), 88. doi:10.1007/s10664-024-10496-y
[9] Junkai Chen, Zhenhao Li, Qiheng Mao, Xing Hu, Kui Liu, and Xin Xia. 2025. Understanding Practitioners’ Expectations
on Clear Code Review Comments. Proceedings of the ACM on Software Engineering 2, ISSTA (2025), 1257–1279.
doi:10.1145/3728931
[10] Umut Cihan, Vahid Haratian, Arda İçöz, Mert Kaan Gül, Ömercan Devran, Emircan Furkan Bayendur, Baykal Mehmet
Uçar, and Eray Tüzün. 2025. Automated code review in practice. In 2025 IEEE/ACM 47th International Conference on
Software Engineering: Software Engineering in Practice (ICSE-SEIP). IEEE, 425–436. doi:10.1109/ICSE-SEIP66354.2025.
00043
[11] Jacob Cohen. 1960. A coefficient of agreement for nominal scales. Educational and Psychological Measurement 20, 1
(1960), 37–46. doi:10.1177/001316446002000104
[12] Jacob Cohen. 1968. Weighted kappa: Nominal scale agreement provision for scaled disagreement or partial credit.
Psychological Bulletin 70, 4 (1968), 213–220. doi:10.1037/h0026256
[13] Marco di Biase, Magiel Bruntink, and Alberto Bacchelli. 2016. A Security Perspective on Code Review: The Case of
Chromium. In 2016 IEEE 16th International Working Conference on Source Code Analysis and Manipulation (SCAM).
21–30. doi:10.1109/SCAM.2016.30
[14] Thomas Dohmke, Marco Iansiti, and Greg Richards. 2023. Sea change in software development: Economic and
productivity analysis of the ai-powered developer lifecycle. arXiv preprint arXiv:2306.15033 (2023). doi:10.48550/arXiv.
2306.15033
[15] Enrico Fregnan, Fernando Petrulio, and Alberto Bacchelli. 2022. The evolution of the code during review: an investiga-
tion on review changes. Empirical Softw. Engg. 27, 7 (Dec. 2022), 49 pages. doi:10.1007/s10664-022-10205-7
[16] Ismail Sergen Göçmen, Ahmed Salih Cezayir, and Eray Tüzün. 2025. Enhanced code reviews using pull request based
change impact analysis. Empirical Software Engineering 30, 3 (2025), 64. doi:10.1007/s10664-024-10600-2
[17] Google [n. d.]. https://gemini.google/
[18] Sanuri Gunawardena, Ewan Tempero, and Kelly Blincoe. 2023. Concerns identified in code review: A fine-grained,
faceted classification. Information and Software Technology 153 (2023), 107054. doi:10.1016/j.infsof.2022.107054
[19] Hanyang Guo, Xunjin Zheng, Zihan Liao, Hang Yu, Peng Di, Ziyin Zhang, and Hong-Ning Dai. 2025. CodeFuse-CR-
Bench: A Comprehensiveness-aware Benchmark for End-to-End Code Review Evaluation in Python Projects. arXiv
preprint arXiv:2509.14856 (2025). doi:10.48550/arXiv.2509.14856
[20] Hyunsun Hong and Jongmoon Baik. 2025. Retrieval-Augmented Code Review Comment Generation. arXiv preprint
arXiv:2506.11591 (2025). doi:10.48550/arXiv.2506.11591
[21] Sirui Hong, Mingchen Zhuge, Jonathan Chen, Xiawu Zheng, Yuheng Cheng, Jinlin Wang, Ceyao Zhang, Zili Wang,
Steven Ka Shing Yau, Zijuan Lin, Liyang Zhou, Chenyu Ran, Lingfeng Xiao, Chenglin Wu, and Jürgen Schmidhuber.
2024. MetaGPT: Meta Programming for a Multi-Agent Collaborative Framework. In The Twelfth International Conference
on Learning Representations. https://openreview.net/forum?id=VtmBAGCN7o
[22] Xinyi Hou, Yanjie Zhao, Yue Liu, Zhou Yang, Kailong Wang, Li Li, Xiapu Luo, David Lo, John Grundy, and Haoyu
Wang. 2024. Large language models for software engineering: A systematic literature review. ACM Transactions on
Software Engineering and Methodology 33, 8 (2024), 1–79. doi:10.1145/3695988
[23] Yan Hu, Jun Zhang, Xiaomei Bai, Shuo Yu, and Zhuo Yang. 2016. Influence analysis of GitHub repositories. SpringerPlus
5, 1 (2016), 1268. doi:10.1186/s40064-016-2897-7
[24] Yuan Huang, Xingjian Liang, Zhihao Chen, Nan Jia, Xiapu Luo, Xiangping Chen, Zibin Zheng, and Xiaocong Zhou. 2022.
Reviewing rounds prediction for code patches. Empirical Softw. Engg. 27, 1 (Jan. 2022), 40 pages. doi:10.1007/s10664-
021-10035-z
Proc. ACM Softw. Eng., Vol. 3, No. ISSTA, Article ISSTA128. Publication date: October 2026.


---

ISSTA128:22
D. Zheng, Y. Wang, X. Wang, K. Duan, H. Zhang, X. Liu, Y. Ma, and Z. Zheng
[25] Imen Jaoua, Oussama Ben Sghaier, and Houari Sahraoui. 2025. Combining Large Language Models with Static Analyzers
for Code Review Generation. In 2025 IEEE/ACM 22nd International Conference on Mining Software Repositories (MSR).
IEEE, 174–186. doi:10.1109/MSR66628.2025.00038
[26] Yanjie Jiang, Hui Liu, Tianyi Chen, Fu Fan, Chunhao Dong, Kui Liu, and Lu Zhang. 2025. Deep Assessment of Code
Review Generation Approaches: Beyond Lexical Similarity. arXiv preprint arXiv:2501.05176 (2025). doi:10.48550/arXiv.
2501.05176
[27] Atieh Khanjani and Riza Sulaiman. 2011. The process of quality assurance under open source software development.
In 2011 IEEE Symposium on Computers & Informatics. IEEE, 548–552. doi:10.1109/ISCI.2011.5958975
[28] Haonan Li, Yu Hao, Yizhuo Zhai, and Zhiyun Qian. 2024. Enhancing Static Analysis for Practical Bug Detection:
An LLM-Integrated Approach. Proceedings of the ACM on Programming Languages 8, OOPSLA1 (2024), 474–499.
doi:10.1145/3649828
[29] Shuochuan Li, Dong Wang, Patanamon Thongtanunam, Zan Wang, Jiuqiao Yu, and Junjie Chen. 2026. Issue-Oriented
Agent-Based Framework for Automated Review Comment Generation. ACM Transactions on Software Engineering and
Methodology (2026). doi:10.1145/3817606
[30] Yingling Li, Yuhan Wu, Zi’ao Wang, Lei Huang, Junjie Wang, Jianping Li, and Minying Huang. 2025. CodeDoctor:
multi-category code review comment generation. 32, 1 (Feb. 2025), 32 pages. doi:10.1007/s10515-025-00491-y
[31] Zhiyu Li, Shuai Lu, Daya Guo, Nan Duan, Shailesh Jannu, Grant Jenks, Deep Majumder, Jared Green, Alexey Svy-
atkovskiy, Shengyu Fu, et al. 2022. Automating code review activities by large-scale pre-training. In Proceedings of the
30th ACM Joint European Software Engineering Conference and Symposium on the Foundations of Software Engineering.
1035–1047. doi:10.1145/3540250.3549081
[32] Zhixing Li, Yue Yu, Gang Yin, Tao Wang, Qiang Fan, and Huaimin Wang. 2017. Automatic Classification of Review
Comments in Pull-based Development Model. In International Conference on Software Engineering and Knowledge
Engineering. doi:10.18293/SEKE2017-039
[33] Chin-Yew Lin. 2004. Rouge: A package for automatic evaluation of summaries. In Text summarization branches out.
74–81.
[34] Hong-Yi Lin, Chunhua Liu, Haoyu Gao, Patanamon Thongtanunam, and Christoph Treude. 2025. Codereviewqa: The
code review comprehension assessment for large language models. In Findings of the Association for Computational
Linguistics: ACL 2025. 9138–9166. doi:10.18653/v1/2025.findings-acl.476
[35] Aixin Liu, Aoxue Mei, Bangcai Lin, Bing Xue, Bingxuan Wang, Bingzheng Xu, Bochao Wu, Bowei Zhang, Chaofan
Lin, Chen Dong, et al. 2025. Deepseek-v3. 2: Pushing the frontier of open large language models. arXiv preprint
arXiv:2512.02556 (2025). doi:10.48550/arXiv.2512.02556
[36] Fang Liu, Simiao Liu, Yinghao Zhu, Xiaoli Lian, and Li Zhang. 2025. SecureReviewer: Enhancing Large Language
Models for Secure Code Review through Secure-aware Fine-tuning. arXiv preprint arXiv:2510.26457 (2025). doi:10.
48550/arXiv.2510.26457
[37] Anton Lozhkov, Raymond Li, Loubna Ben Allal, Federico Cassano, Joel Lamy-Poirier, Nouamane Tazi, Ao Tang,
Dmytro Pykhtar, Jiawei Liu, Yuxiang Wei, et al. 2024. Starcoder 2 and the stack v2: The next generation. arXiv preprint
arXiv:2402.19173 (2024). doi:10.48550/arXiv.2402.19173
[38] Junyi Lu, Lei Yu, Xiaojia Li, Li Yang, and Chun Zuo. 2023. Llama-reviewer: Advancing code review automation with
large language models through parameter-efficient fine-tuning. In 2023 IEEE 34th International Symposium on Software
Reliability Engineering (ISSRE). IEEE, 647–658. doi:10.1109/ISSRE59848.2023.00026
[39] Shane McIntosh, Yasutaka Kamei, Bram Adams, and Ahmed E Hassan. 2016. An empirical study of the impact of modern
code review practices on software quality. Empirical Software Engineering 21, 5 (2016), 2146–2189. doi:10.1007/s10664-
015-9381-9
[40] Qianru Meng, Zhaochun Ren, and Joost Visser. 2025. ReleaseEval: A Benchmark for Evaluating Language Models in
Automated Release Note Generation. arXiv preprint arXiv:2511.02713 (2025). doi:10.48550/arXiv.2511.02713
[41] Qianru Meng, Xiao Zhang, Zhaochen Ren, and Joost Visser. 2025. When More Retrieval Hurts: Retrieval-Augmented
Code Review Generation. arXiv preprint arXiv:2511.05302 (2025). doi:10.48550/arXiv.2511.05302
[42] Mathieu Nayrolles and Abdelwahab Hamou-Lhadj. 2018. Towards a classification of bugs to facilitate software
maintainability tasks. In Proceedings of the 1st International Workshop on Software Qualities and Their Dependencies
(Gothenburg, Sweden) (SQUADE ’18). Association for Computing Machinery, New York, NY, USA, 25–32. doi:10.1145/
3194095.3194101
[43] Octoverse 2025 [n. d.]. https://octoverse.github.com/
[44] OpenAI. [n. d.]. GPT-5 System Card. https://cdn.openai.com/gpt-5-system-card.pdf
[45] Yun Peng, Kisub Kim, Linghan Meng, and Kui Liu. 2025. iCodeReviewer: Improving Secure Code Review with Mixture
of Prompts. In 2025 40th IEEE/ACM International Conference on Automated Software Engineering (ASE). IEEE, 3204–3215.
doi:10.1109/ASE63991.2025.00264
Proc. ACM Softw. Eng., Vol. 3, No. ISSTA, Article ISSTA128. Publication date: October 2026.


---

From Static to Dynamic: Benchmarking Real-World Code Review with MCR-Bench
ISSTA128:23
[46] Chen Qian, Wei Liu, Hongzhang Liu, Nuo Chen, Yufan Dang, Jiahao Li, Cheng Yang, Weize Chen, Yusheng Su, Xin
Cong, Juyuan Xu, Dahai Li, Zhiyuan Liu, and Maosong Sun. 2024. ChatDev: Communicative Agents for Software
Development. In Proceedings of the 62nd Annual Meeting of the Association for Computational Linguistics (Volume 1:
Long Papers). Association for Computational Linguistics, 15174–15186. doi:10.18653/v1/2024.acl-long.810
[47] Qodana AI/PR-Agent [n. d.]. https://github.com/qodo-ai/pr-agent
[48] Xiaoxue Ren, Chaoqun Dai, Qiao Huang, Ye Wang, Chao Liu, and Bo Jiang. 2025. Hydra-Reviewer: A holistic multi-
agent system for automatic code review comment generation. IEEE Transactions on Software Engineering (2025).
doi:10.1109/TSE.2025.3621462
[49] Giovanni Rosa, Luca Pascarella, Simone Scalabrino, Rosalia Tufano, Gabriele Bavota, Michele Lanza, and Rocco Oliveto.
2023. A comprehensive evaluation of SZZ Variants through a developer-informed oracle. Journal of Systems and
Software 202 (2023), 111729. doi:10.1016/j.jss.2023.111729
[50] Tao Sun, Jian Xu, Yuanpeng Li, Zhao Yan, Ge Zhang, Lintao Xie, Lu Geng, Zheng Wang, Yueyan Chen, Qin Lin, et al.
2025. Bitsai-cr: Automated code review via llm in practice. In Proceedings of the 33rd ACM International Conference on
the Foundations of Software Engineering. 274–285. doi:10.1145/3696630.3728552
[51] Xunzhu Tang, Kisub Kim, Yewei Song, Cedric Lothritz, Bei Li, Saad Ezzini, Haoye Tian, Jacques Klein, and Tegawendé F.
Bissyandé. 2024. CodeAgent: Autonomous Communicative Agents for Code Review. In Proceedings of the 2024
Conference on Empirical Methods in Natural Language Processing. Association for Computational Linguistics, 11279–
11313. doi:10.18653/v1/2024.emnlp-main.632
[52] Task instance source from huggingface/transformers. [n. d.]. https://github.com/huggingface/transformers/pull/25267
[53] Kimi Team, Yifan Bai, Yiping Bao, Guanduo Chen, Jiahao Chen, Ningxin Chen, Ruijue Chen, Yanru Chen, Yuankun
Chen, Yutian Chen, et al. 2025. Kimi k2: Open agentic intelligence. arXiv preprint arXiv:2507.20534 (2025). doi:10.
48550/arXiv.2507.20534
[54] Patanamon Thongtanunam, Chanathip Pornprasit, and Chakkrit Tantithamthavorn. 2022. Autotransform: Automated
code transformation to support modern code review process. In Proceedings of the 44th international conference on
software engineering. 237–248. doi:10.1145/3510003.3510067
[55] Rosalia Tufano, Ozren Dabić, Antonio Mastropaolo, Matteo Ciniselli, and Gabriele Bavota. 2024. Code review automa-
tion: strengths and weaknesses of the state of the art. IEEE Transactions on Software Engineering 50, 2 (2024), 338–353.
doi:10.1109/TSE.2023.3348172
[56] Rosalia Tufano, Simone Masiero, Antonio Mastropaolo, Luca Pascarella, Denys Poshyvanyk, and Gabriele Bavota.
2022. Using pre-trained models to boost code review automation. In Proceedings of the 44th international conference on
software engineering. 2291–2302. doi:10.1145/3510003.3510621
[57] Rosalia Tufano, Luca Pascarella, Michele Tufano, Denys Poshyvanyk, and Gabriele Bavota. 2021. Towards automating
code review activities. In 2021 IEEE/ACM 43rd International Conference on Software Engineering (ICSE). IEEE, 163–174.
doi:10.1109/ICSE43902.2021.00027
[58] Asif Kamal Turzo and Amiangshu Bosu. 2023. What makes a code review useful to OpenDev developers? An empirical
investigation. Empirical Softw. Engg. 29, 1 (Nov. 2023), 38 pages. doi:10.1007/s10664-023-10411-x
[59] Ashish Vaswani, Noam Shazeer, Niki Parmar, Jakob Uszkoreit, Llion Jones, Aidan N Gomez, Łukasz Kaiser, and
Illia Polosukhin. 2017. Attention is all you need. Advances in neural information processing systems 30 (2017).
doi:10.5555/3295222.3295349
[60] Yanlin Wang, Kefeng Duan, Dewu Zheng, Ensheng Shi, Fengji Zhang, Yanli Wang, Jiachi Chen, Xilin Liu, Yuchi Ma,
Hongyu Zhang, Qianxiang Wang, and Zibin Zheng. 2025. Towards an Understanding of Context Utilization in Code
Intelligence. arXiv preprint arXiv:2504.08734 (2025). Accepted by ACM Computing Surveys. doi:10.48550/arXiv.2504.
08734
[61] Yanlin Wang, Suiquan Wang, Yanli Wang, Bowen Zhang, Daya Guo, Jiachi Chen, and Zibin Zheng. 2026. RepoReasoner:
Evaluating Repository-Level Code Reasoning Ability of Long-Context Language Models. In Proceedings of the ACM on
Software Engineering. FSE 2026. doi:10.48550/arXiv.2607.25996
[62] Matthijs Warrens. 2012. Cohen’s quadratically weighted kappa is higher than linearly weighted kappa for tridiagonal
agreement tables. Statistical Methodology 9 (05 2012), 440–444. doi:10.1016/j.stamet.2011.08.006
[63] Chadd Williams and Jaime Spacco. 2008. SZZ revisited: verifying when changes induce fixes. In Proceedings of the
2008 Workshop on Defects in Large Software Systems (Seattle, Washington) (DEFECTS ’08). Association for Computing
Machinery, New York, NY, USA, 32–36. doi:10.1145/1390817.1390826
[64] An Yang, Anfeng Li, Baosong Yang, Beichen Zhang, Binyuan Hui, Bo Zheng, Bowen Yu, Chang Gao, Chengen Huang,
Chenxu Lv, et al. 2025. Qwen3 technical report. arXiv preprint arXiv:2505.09388 (2025). doi:10.48550/arXiv.2505.09388
[65] Kang Yang, Xinjun Mao, Shangwen Wang, Yanlin Wang, Tanghaoran Zhang, Bo Lin, Yihao Qin, Zhang Zhang, Yao
Lu, and Kamal Al-Sabahi. 2025. Large Language Models are Qualified Benchmark Builders: Rebuilding Pre-Training
Datasets for Advancing Code Intelligence Tasks. In Proceedings of the 33rd IEEE/ACM International Conference on
Program Comprehension. ICPC 2025. doi:10.48550/arXiv.2504.19444
Proc. ACM Softw. Eng., Vol. 3, No. ISSTA, Article ISSTA128. Publication date: October 2026.


---

ISSTA128:24
D. Zheng, Y. Wang, X. Wang, K. Duan, H. Zhang, X. Liu, Y. Ma, and Z. Zheng
[66] Ying Yin, Yuhai Zhao, Yiming Sun, and Chen Chen. 2023. Automatic Code Review by Learning the Structure Information
of Code Graph. Sensors 23, 5 (2023). doi:10.3390/s23052551
[67] z.ai/GLM [n. d.]. https://z.ai/blog/glm-4.7
[68] Farida El Zanaty, Toshiki Hirao, Shane McIntosh, Akinori Ihara, and Kenichi Matsumoto. 2018. An empirical study of
design discussions in code review. In Proceedings of the 12th ACM/IEEE International Symposium on Empirical Software
Engineering and Measurement (Oulu, Finland) (ESEM ’18). Association for Computing Machinery, New York, NY, USA,
Article 11, 10 pages. doi:10.1145/3239235.3239525
[69] Zhengran Zeng, Ruikai Shi, Keke Han, Yixin Li, Kaicheng Sun, Yidong Wang, Zhuohao Yu, Rui Xie, Wei Ye, and Shikun
Zhang. 2025. SWR-Bench: Assessing LLM Performance in Real-World Code Review Comment Generation. arXiv
preprint arXiv:2509.01494 (2025). doi:10.48550/arXiv.2509.01494
[70] Daoan Zhang, Shuo Zhang, Zijian Jin, Jiebo Luo, Shengyu Fu, and Elsie Nallipogu. 2026. Sphinx: Benchmarking and
Modeling for LLM-Driven Pull Request Review. arXiv preprint arXiv:2601.04252 (2026). doi:10.48550/arXiv.2601.04252
[71] Lei Zhang, Yongda Yu, Minghui Yu, Xinxin Guo, Zhengqi Zhuang, G. Rong, Dong Shao, Haifeng Shen, Hongyu Kuang,
Zhengfeng Li, Boge Wang, Guoan Zhang, Bangyu Xiang, and Xiaobing Xu. 2026. AACR-Bench: Evaluating Automatic
Code Review with Holistic Repository-Level Context. arXiv preprint arXiv:2601.19494 (2026). doi:10.48550/arXiv.2601.
19494
[72] Dewu Zheng, Yanlin Wang, Ensheng Shi, Xilin Liu, Yuchi Ma, Hongyu Zhang, and Zibin Zheng. 2026. Top General
Performance = Top Domain Performance? DomainCodeBench: A Multi-domain Code Generation Benchmark. In
Proceedings of the 48th IEEE/ACM International Conference on Software Engineering. ICSE 2026. doi:10.48550/arXiv.2412.
18573
[73] Dewu Zheng, Yanlin Wang, Ensheng Shi, Ruikai Zhang, Yuchi Ma, Hongyu Zhang, and Zibin Zheng. 2025. HumanEvo:
An Evolution-aware Benchmark for More Realistic Evaluation of Repository-level Code Generation. In Proceedings of
the 47th IEEE/ACM International Conference on Software Engineering. ICSE 2025. doi:10.48550/arXiv.2406.06918
[74] Zibin Zheng, Kaiwen Ning, Yanlin Wang, Jingwen Zhang, Dewu Zheng, Mingxi Ye, and Jiachi Chen. 2023. A survey of
large language models for code: Evolution, benchmarking, and future trends. arXiv preprint arXiv:2311.10372 (2023).
doi:10.48550/arXiv.2311.10372
[75] Zibin Zheng, Kaiwen Ning, Qingyuan Zhong, Jiachi Chen, Wenqing Chen, Lianghong Guo, Weicheng Wang, and
Yanlin Wang. 2025. Towards an understanding of large language models in software engineering tasks. Empirical
Software Engineering 30, 2 (2025), 50. doi:10.1007/s10664-024-10602-0
[76] Wanjun Zhong, Lianghong Guo, Qiqi Gao, He Ye, and Yanlin Wang. 2023. MemoryBank: Enhancing Large Language
Models with Long-Term Memory. arXiv preprint arXiv:2305.10250 (2023). doi:10.48550/arXiv.2305.10250
Received 2026-01-30; accepted 2026-06-25
Proc. ACM Softw. Eng., Vol. 3, No. ISSTA, Article ISSTA128. Publication date: October 2026.

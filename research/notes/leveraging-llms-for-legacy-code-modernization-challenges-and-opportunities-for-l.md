---
title: 'Leveraging LLMs for Legacy Code Modernization: Challenges and Opportunities
  for LLM-Generated Documentation'
id: leveraging-llms-for-legacy-code-modernization-challenges-and-opportunities-for-l
tags:
- ai-software-factory-architecture-58e4cc
- reverse-engineering
- legacy-code
- evals
- hallucination-mitigation
created: '2026-10-12T08:27:54.312155Z'
updated: '2026-10-12T08:32:38.912113Z'
source: https://arxiv.org/html/2411.14971v1
source_domain: arxiv.org
fetched_at: '2026-10-12T08:27:54.301934Z'
fetch_provider: builtin
status: draft
type: note
tier: institutional
content_type: paper
deprecated: false
summary: 'MITRE Corporation paper (arXiv:2411.14971, Nov 2024, 20 authors, cdiggs@mitre.org)
  empirically testing LLM-generated line-wise documentation for two real-world legacy
  codebases: a MUMPS electronic-health-record system (WorldVistA VistA, Incomplete
  Records Tracking module: 5,107 lines of code, 235 developer comments, 78 files)
  and IBM mainframe Assembly Language Code (Walmart''s open-source zFAM z/OS File
  Access Manager: 13,344 lines of code, 7,097 developer comments, 12 files). Tested
  four LLMs (Claude 3.0 Sonnet 200k context, Llama 3 Instruct 70B 8k context, Mixtral
  8x7B 32k context, GPT-4 Turbo Preview 128k context) using a novel prompting strategy:
  ground-truth comments are replaced with unique placeholder IDs (<BLOCK_COMMENT [id]>/<INLINE_COMMENT
  [id]>) before prompting, forcing structured JSON output per-ID — explicitly designed
  to prevent the LLM from rewriting code while documenting it and to reduce hallucinated
  identifier creation. A greedy chunking algorithm packs code into context windows
  while avoiding breaking logical structures (merges smallest chunk with neighbors
  unless resulting chunk exceeds half the model''s context window).


  Human SME evaluation (4 MUMPS reviewers combined 16+ years experience; 5 ALC reviewers
  with mainframe experience) used a 4-point rubric across hallucination, readability,
  completeness, usefulness, producing 3,093 MUMPS and 2,268 ALC ratings. Key finding
  directly bearing on the Zero-Hallucination pillar: LLM-generated comments were found
  ''generally hallucination-free, complete, readable, and useful'' relative to human
  ground-truth comments, scoring >8/10 on readability and hallucination-freedom for
  MUMPS, though performance degraded sharply on ALC (only readability scored >7/10,
  at 7.28-7.65 for Llama3/GPT-4 Turbo; other dimensions fell short) — direct evidence
  that LLM code-understanding quality is NOT uniform across legacy languages and that
  lower-resource/more esoteric languages (assembly vs. MUMPS) produce materially worse
  automated documentation. Critically for the rigid-evals pillar: NO automated metric
  (cyclomatic/Halstead complexity, BLEU, ROUGE, CHRF, cosine similarity via OpenAI
  text-embedding-3-small, Flesch/Gunning-Fog readability) correlated strongly with
  human-judged comment quality — the best correlation found was only 0.34 (cosine
  similarity vs. usefulness), and most significant correlations were below 0.25. This
  is strong evidence that proxy metrics like BLEU/ROUGE are insufficient for evaluating
  LLM-generated documentation quality in production legacy-modernization pipelines,
  implying human-in-the-loop or more sophisticated eval design is still required.
  Inter-rater reliability was moderate-to-high for MUMPS (ICC 0.73-0.89 across dimensions)
  but notably lower for ALC (0.12-0.22), suggesting assembly-code documentation quality
  is inherently harder to even judge consistently. LONG/DENSE SOURCE (10,998 words)
  — flagging for potential source-analyst delegation given methodological and numeric
  density.'
---

Leveraging LLMs for Legacy Code Modernization: Challenges and Opportunities for LLM-Generated Documentation
Title:
Content selection saved. Describe the issue below:
Description:
arXiv is now an independent nonprofit!
Learn more
×
License: CC BY-NC-ND 4.0
arXiv:2411.14971v1 [cs.LG] 22 Nov 2024
Leveraging LLMs for Legacy Code Modernization: Challenges and Opportunities for LLM-Generated Documentation
Colin Diggs, Michael Doyle, Amit Madan, Siggy Scott,
Emily Escamilla, Jacob Zimmer, Naveed Nekoo,
Paul Ursino, Michael Bartholf, Zachary Robin, Anand Patel,
Chris Glasz, William Macke, Paul Kirk, Jasper Phillips,
Arun Sridharan, Doug Wendt, Scott Rosen,
Nitin Naik, Justin F. Brunelle, Samruddhi Thaker
§
Affiliation:
The MITRE Corporation
McLean, VA
cdiggs@mitre.org
Abstract
Legacy software systems, written in outdated languages like MUMPS and mainframe assembly, pose challenges in efficiency, maintenance, staffing, and security. While LLMs offer promise for modernizing these systems, their ability to understand legacy languages is largely unknown. This paper investigates the utilization of LLMs to generate documentation for legacy code using two datasets: an electronic health records (EHR) system in MUMPS and open-source applications in IBM mainframe Assembly Language Code (ALC). We propose a prompting strategy for generating line-wise code comments and a rubric to evaluate their completeness, readability, usefulness, and hallucination. Our study assesses the correlation between human evaluations and automated metrics, such as code complexity and reference-based metrics. We find that LLM-generated comments for MUMPS and ALC are generally hallucination-free, complete, readable, and useful compared to ground-truth comments, though ALC poses challenges. However, no automated metrics strongly correlate with comment quality to predict or measure LLM performance. Our findings highlight the limitations of current automated measures and the need for better evaluation metrics for LLM-generated documentation in legacy systems.
Index Terms:
artificial intelligence, large language models, legacy software, documentation, modernization
§
§
footnotetext:
Due to the size of the team, we list everyone here but see the first author’s contact information below as the corresponding author
I
Introduction
Legacy systems are systems that contain outdated computer software. These systems are often written in antiquated languages like COBOL, MUMPS, or historical dialects of mainframe assembly which make maintenance and further development challenging. In the U.S. federal government, a large fraction of legacy systems range in age from 30 to more than 60 years old
[
1
]
, posing significant efficiency, maintenance, staffing, and security challenges. Modernization of legacy systems aims to improve maintainability of development of these critical systems. However, the work of modernizing legacy software systems has become well-known as a “wicked problem” that has largely defied decades of well-meaning initiatives and policies
[
2
,
3
]
.
With the advent of large language model (LLM) approaches to code synthesis and translation, there is widespread optimism that artificial intelligence is poised to increase efficiency and reduce the risks of software modernization
[
4
,
5
]
. However, it is not yet clear whether the code-understanding abilities of LLMs are mature enough to have a significant impact on the problem
[
6
,
7
,
8
,
9
]
. Many shortcomings of LLMs have been demonstrated on software understanding—which include tasks like documentation generation, code translation, and code synthesis—even on clean code and mainstream languages
[
10
,
11
,
12
,
13
]
. Developers and decision makers are justifiably uneasy about adopting these tools into modernization workflows for complex, real-world legacy systems—many of which fill safety-critical roles where the introduction of inadvertent bugs or functionality changes can raise significant risks.
Studies on LLM-based direct code translation reveal limitations even for modern languages such as C, Java, and Python
[
14
]
. There is a gap in the literature for similar studies with legacy languages
[
14
]
. As such, direct translations by LLMs cannot be trusted for the modernization of critical legacy systems with no tolerance for error. However, in the emerging landscape of LLM-based code understanding tasks, documentation generation, or code summarization, emerges as a compelling modernization strategy. Even in cases where LLM-driven code
translation
might not be trustworthy, automatically generated documentation may accelerate code understanding to facilitate translation, refactoring, and maintenance if it can be generated consistently and accurately. While documentation generation methods have advanced greatly in recent years
[
15
,
16
,
17
]
, they have been trained and evaluated primarily on mainstream languages like C, Python, and Java, and on relatively short, simple programs with limited complexity
[
18
]
. This makes it difficult to infer whether results on mainstream benchmarks will generalize in useful ways to legacy software—which is often written in niche or antiquated languages while also exhibiting extreme complexity.
Here we study the performance of an LLM-based approach at generating documentation for legacy languages, focusing on two real-world legacy datasets: an electronic health records (EHR) system written in the MUMPS
1
1
1
Massachusetts General Hospital Utility Multi-Programming System—a high-level language and database developed in the 1960s for managing patient medical records
[
19
]
language, and a set of open-source applications in IBM mainframe assembly language code (ALC).
2
2
2
In the IBM mainframe industry, assembly code is routinely referred to by the longer name “assembly language code.”
Using LLMs to generate documentation raises two immediate challenges. First, no standard prompting strategy has emerged in the community for reliably generating line-wise code comments. Our preliminary efforts, for example, found that direct LLM prompting often generates incomplete output, and may perform undesired operations such as modifying the code before generating comments for it. Second, no widely accepted evaluation metrics exist for measuring the quality of documentation of code via comments. Evaluating generated comments is fundamentally important for industrial applications, where the quality of the output determines whether an automated tool is ready to be used on production codebases. Manual human evaluation of large numbers of comments is costly, but evaluation must be performed on each new system (even on mainstream languages, the quality and reliability of generated documentation can vary dramatically across codebases
[
18
,
20
]
). There is thus a need for automated metrics of documentation quality that can be used to test and develop documentation generation tools.
In this work, we address these problems by testing comment-generation and evaluation strategies, with the objective of providing baseline results to understand the ability of mainstream LLMs to assist in documenting legacy code:
•
Our
prompting strategy
for generating line-wise code comments with LLMs avoids the problems of incomplete comment generation and undesired code modification. We evaluate its performance in terms of a novel
scoring rubric
that measures human perceptions of completeness, readability, usefulness, and hallucination—developed in close collaboration with subject-matter experts (SMEs) with many years of legacy code experience.
•
We then measure the efficacy of three classes of metrics that can be automatically computed at scale without manual human evaluation to see how well they predict or measure (human-rated) documentation quality:
–
static code complexity
metrics (e.g., cyclomatic and Halstead complexity),
–
runtime metrics
on the LLMs themselves (e.g., processing time), and
–
mainstream
reference-based metrics
(e.g., BLEU and ROUGE) that make use of human-written ground truth comments.
Ultimately, we hope this line of inquiry can provide organizations with a framework that can be used to decide whether a given model will perform well enough on their unique codebases to provide value through (partial) automation of software modernization efforts.
II
Background
Legacy software poses unique economic and technical challenges. Here we discuss the problem of software modernization and the prospects of LLM-based solutions. We give special attention to machine-assisted documentation generation and the lack of effective methods for evaluating the quality of generated documentation.
II-A
Legacy Software
Government agencies need to migrate their obsolete IT to less expensive, more agile systems that mitigate security risk, and provide more efficient and impactful service delivery for taxpayers. The U.S. federal government has been trying to overhaul its IT infrastructure for decades. Agencies are falling short in their IT modernization initiatives, spending almost 80% of their IT budgets on operations and maintenance, compared with around half in the private sector
[
3
]
. According to the Government Accountability Office (GAO), eight of the ten critical federal IT legacy systems that were most in need of modernization did not have documented plans for modernizing their systems or had incomplete plans
[
21
]
.
These legacy systems support important missions like wartime readiness and the operation of dams and power plants. They also host sensitive taxpayer and student data. The GAO has reported on these systems since 2016, highlighting security risks, unmet mission needs, and the increased maintenance costs associated with outdated systems. Most recently, GAO reported that the Internal Revenue Service (IRS) has systems that are more than 60 years old, with some operating software that is up to 15 versions out of date
[
22
,
1
,
23
]
. The recent Federal Aviation Administration (FAA) systems outage that canceled 1,300 flights and delayed more than 10,000 in a single day
3
3
3
CNN, “FAA is years away from upgrading the system that grounded all US flights,” January 3rd, 2023—
https://www.cnn.com/2023/01/12/tech/faa-notam-system-outage/index.html
.
highlights both the criticality of these legacy systems and the impact that a single outage can have on our transportation network and on the daily lives of thousands of individuals.
Traditional approaches to converting legacy code into validated, modernized analogues often involve complex rules and pattern-matching approaches that are costly to develop
[
24
]
. As Zaystev et al. observe, even the creation of parsers, compilers, and other tools needed to begin a legacy conversion project can take years
[
25
]
. While some traditional rule-based and symbolic conversion tools exist and offer formal guarantees that their output is functionally correct, these tools can typically only be applied to very narrow cases and domain-specific applications
[
26
]
.
A study by Pietrini et al. details the complexities of modernizing a critical system from legacy and modern Fortran code to Python
[
14
]
. They identified that manual translation of legacy code is a time-consuming and error-prone process and that there is a conspicuous gap in both the research and tools available for the automated translation of legacy languages to modern languages. To address this gap, Pietrini et al. leveraged GPT-4 for direct translation of the Fortran code into Python. One of the noteable challenges identified by Pietrini et al. was the lack of documentation in the legacy code which made it challenging to determine the validity of the translated code. The importance of documentation in the modernization of legacy systems motivates our experiment to leverage LLMs to generate documentation for legacy systems.
II-B
LLM-Based Code Understanding
But even on mainstream languages, LLM-based code translation and synthesis models show significant limitations upon closer inspection.
On many code-related tasks, LLMs introduce simple bugs and incorrect information at high rates
[
10
]
. A recent evaluation by Pan et al. on 1,700 different open-source code examples, for instance, found that LLM translation among C, C++, Go, Java, and Python could produce code that passed unit tests at most 47.3% of the time and only 2.1% in the worst-performing model
[
27
]
. Based on this data, they propose a taxonomy of 15 categories of translation bugs that LLMs are prone to. Additionally, as Kabir et al. show in their study of StackOverflow answers, human reviewers may fail to detect a large fraction of these errors
[
11
]
. In practical (human-machine teaming) terms, efforts to study the impact of LLM-based systems on developer productivity have yet to reliably demonstrate beneficial effects
[
12
,
13
]
. Wu et al., meanwhile, show that code synthesis performance plummets when tasks deviate from historical training data
[
28
]
—an especially worrying observation in the context of legacy systems, which often involve rare languages and unusual coding patterns that are not reflected in public training data.
There is a significant literature gap around the evaluation of LLM-based code understanding for legacy languages, as research in this area is still at an early stage. Perhaps with the exception of neural decompilation (i.e., converting assembly into higher-level languages)
[
29
,
30
,
31
]
, few benchmarks or quantitative results are available for legacy languages. Results that do exist are often reported on open-source datasets which tend to involve much shorter and simpler programs than real-world legacy code.
II-C
Documentation Generation
Ensuring the validity of the modernization of legacy systems requires robust understanding of the existing code
[
14
]
. In the absence of SMEs, proper documentation provides insight into existing functionality. As such, creating documentation is an important subtask of software modernization. Legacy codebases often lack accurate and sufficient documentation to support the efficient creation of downstream models, onboarding materials, requirements, and translated or refactored code.
While using LLMs to directly translate or generate code into modern languages suffers from the limitations we have described above, there is reason to believe that the code-understanding abilities of foundational models may still be useful to developers as they conduct complex code modernization projects. Documentation generation is one such task where LLM-based tools may be useful in a human-machine teaming setting. Documentation generation involves creating inline comments, higher-level comment blocks, and summaries from source code. Due to the critical nature of legacy systems and low tolerance for error, documentation is necessary to ensure the validity of code translation and other modernization tasks.
II-C
1
Template-Based Methods
Traditional approaches based on manual templates
[
32
,
33
,
34
]
and information retrieval
[
35
]
can achieve a certain degree of automated generation for high-level languages like Java. But these methods rely heavily on variable names, object-oriented structure, and direct access to huge databases of related code (such as all of GitHub) to recast source code into natural language.
II-C
2
Neural Methods
More recently, a variety of neural approaches to documentation generation have been developed that improve on rule- and information retrieval (IR)-based methods—see surveys by Zhang et al.
[
36
]
and Zhu et al.
[
37
]
. Notable examples have been based on long-term short-term networks (LSTMs)
[
38
,
39
,
40
]
, deep reinforcement learning
[
17
]
, and graph neural networks
[
16
]
. Some methods represent code as tokens, much like natural language—treating documentation generation as a machine-translation problem. Other approaches leverage abstract syntax tree (AST) representations to integrate explicit syntactic information into a model’s input
[
15
,
39
,
41
]
. While several approaches have applied neural attention mechanisms such as transformers to the documentation-generation problem
[
38
,
40
]
, researchers have generally trained these models from scratch on each new dataset.
II-C
3
Foundation Models
The advent of (reusable) foundation models
[
42
]
have offered a third major methodological shift in the documentation generation literature. Gu et al. provide a preliminary example, in which they create a combined foundation model by using CodeBERT as an encoder for code snippets and GPT-2 as a decoder to generate comments (where they add a trainable Gaussian noise layer in between to convert embeddings outputted by the former into input for the latter)
[
43
]
.
LLMs have been found to produce documentation that is similar to or better than original, developer-created documentation
[
44
,
45
]
. Codex, a GPT-3 model trained on GitHub data, generated documentation that was similar in quality to developer-created documentation
[
44
]
. Non-specialized LLMs (GPT-3, GPT-4, Bard, LLama 2) outperformed original documentation for both inline and function-level documentation
[
45
]
. In modernization efforts, access to experts in both the legacy and the target languages may be limited, so documentation must be applicable to non-experts. Students found that function-level code explanations generated by an LLM were more understandable and accurate than explanations created by their peers
[
46
]
. Thus, LLMs are capable of creating code documentation that benefits non-experts.
However, it is notable that performance varies across languages
[
44
]
. Some proposals for LLM usage focus on using AI-assisted UIs to generate code explanations on demand, rather than integrating documentation directly into the codebase—thereby possibly reducing the negative impact that hallucinations may incur
[
47
]
. Regardless, existing studies assess LLM performance on simple functions and modern lanugages (e.g. JavaScript, Java, PHP, Python)
[
44
,
46
,
45
,
47
]
. This study addresses a research gap in documentation generation for real-world complex code written in legacy languages (e.g. MUMPS and ALC).
II-D
Evaluating Documentation
As with other code understanding tasks, neural and LLM models for documentation generation continue to exhibit limitations. For example, while they eliminate the narrow reliance that earlier template-based approaches have on specific keywords and variable names, it has been shown that neural models still rely heavily on textual cues in source code to generate documentation
[
48
]
.
4
4
4
Though see Macke & Doyle for evidence that the presence or absence of comments in the input to code generation systems has little impact on the output
[
49
]
.
But evaluating documentation quality is a difficult and multi-dimensional problem, and
automating
such evaluations so they can be scaled up to large datasets has proved especially difficult
[
50
]
. Researchers currently rely primarily on manual human evaluation, typically using ad-hoc rubrics that vary from author to author
[
51
,
52
,
20
]
, sometimes in combination with reference-based metrics such as ROUGE-N or BLEU. The latter have been shown to correlate poorly with human evaluations, however
[
51
,
52
,
20
]
. Tang et al.
[
50
]
review some 32 dimensions of documentation quality that have been used in human evaluations, some of which can be integrated into automated approaches for specific kinds of evaluation (such as mapping code examples to associated documentation passages). Overall, however, there is no well-established methodology for evaluating documentation quality.
III
Methods
At a high level, we applied four LLMs to our datasets to generate comments for each line of code, and then asked human experts to review both the generated comments and the original comments in the codebase for quality. Our first methodological focus is on the comment-generation strategy for ALC and MUMPS: here we will walk through the chunking strategy, prompting method, and parameters used in our experiments, as well as the datasets the themselves. The next focus area is the evaluation approach—where we will describe the human-review rubric and the automated metrics that we tested for their ability to predict comment quality.
III-A
Models and Generation Method
We implemented our comment-generation methods using the open-source Janus framework for LLM-based code modernization.
5
5
5
https://github.com/janus-llm/janus-llm
We focused our experiments on
line-wise comments
—that is, comments that are associated with a specific line of code (appearing either as a block comment immediately preceding the line, or as an inline comment at the end of the line). Our focus on line-wise comments is motivated by the experience of SMEs with many years of experience maintaining legacy systems implemented on IBM Z-series mainframes. These experts report to us that the obscurity of low-level logic in legacy software hinders the ability to understand code, model it for refactoring efforts, and to train and onboard new developers. Better line-wise comments could mitigate this problem. Broadly, our approach begins by chunking code into syntactically unbroken segments that are small enough to fit into each LLM’s context window. Then we use a prompting strategy that replaces ground-truth (human-written) comments with placeholder identifiers, and asks an LLM to produce comments for each placeholder in a JSON-structured output format. This strategy prevents the LLM from modifying or hallucinating new code while it adds documentation.
III-A
1
Chunking strategy
The choice of method for chunking, or partitioning a source file into pieces to feed into an LLM’s context window can in some cases significantly impact the quality of the output. In general, the problem of determining what portion of a codebase should be included to maximize the quality of output is a potentially complex document segmentation or information retrieval problem. Here, we adopt a segmentation strategy to pack as much code as possible into the context window while limiting the division of logical structures. To achieve this, we adopt a greedy chunking algorithm to partition each source file. The algorithm begins by making each subroutine into a chunk, and then recursively merges the smallest chunk with its neighbors whenever doing so does not yield a chunk larger than half of the model’s context window (reserving half the context window for the generated output). The result is that different models receive smaller or larger inputs, depending on what their context window can support.
III-A
2
Prompt Template
In preliminary experimentation, we found that a naïve prompting strategy of feeding code into an LLM and asking it to add comments to every line was ineffective, as the models would often alter the code to generate documentation—a task outside the scope of the prompt. This was especially a problem in MUMPS, which idiomatically may exhibit some 5–6 separate logical statements on a single line: the LLM would often rewrite the code to be several lines of code, generating 5–6 separate comments for new lines where a human wrote only one. Code-rewriting during comment generation makes it difficult to preserve a 1-to-1 mapping between generated code and ground truth, human-provided comments.
To resolve this, we devised a novel prompting strategy to discourage the models from altering code:
•
First we replace all of the human-written (ground truth) comments in each file with placeholder. The placeholders have the form
<BLOCK_COMMENT [id]>
and
<INLINE_COMMENT [id]>
, where
[id]
is a unique alphanumeric identifier.
•
We then prompted each LLM to generate structured output in JSON format, providing a comment associated with each id.
The prompt template is given in Figure
1
, and an illustration of the comment replacement process and JSON output is shown in Figure
2
. We found that providing markers allowed the LLM to more accurately identify the location of interest. Using unique, randomly generated identifiers also mitigated hallucination that might occur with an LLM creating its own unique identifiers. Requesting structured output, such as JSON-formatted output, provides two benefits: reduced likelihood of the LLM improvising beyond the input and instructions, and streamlined integration with downstream processes
[
53
]
. Requesting JSON-formatted output also allowed us to easily map the unique identifiers with the comments generated from each of the twelve LLMs.
Fig. 1:
The prompt template we used for line-wise comment generation.
Fig. 2:
Pre-processing procedure to replace existing in-line comments with unique identifiers.
III-A
3
Models & Parameters
Due to the time required for human evaluation of automated documentation generation, we focus our experiments on four models: Claude 3.0 Sonnet, Llama 3, Mixtral, and GPT-4. The context windows for these models are shown in Table
I
. The generated comments we obtain from these models were then evaluated for complexity and quality by human evaluators and several automated metrics described below. We did not perform hyperparameter tuning on the models, but used a temperature value of 0.7 across all models for consistent comparison.
One challenge the models present is incomplete output—sometimes the JSON output from the model fails to produce a comment for all of the placeholders in the input. In this situation, we execute the model multiple times until a comment has been generated for every placeholder. While this approach resulted in additional processing time, it prevented outright failure. We include retries of this kind when measuring the cost and execution time of the models.
Family
Name
Context Window
Anthropic
Claude 3.0 Sonnet
200k tokens
Meta Llama
Llama 3 Instruct (70B)
8k tokens
Mistral
Mixtral 8*7B
32k tokens
OpenAI
GPT-4 Turbo Preview
128k tokens
TABLE I:
The LLMs used for these experiments.
III-B
Datasets
There is a lack of quality benchmark datasets which makes the development of advanced documentation generation techniques difficult
[
18
]
. This challenge is compounded for
legacy
software, which is often written in rare or domain-specific languages. Open-source examples of code in these languages, are often relatively small and simple programs, and may lack the enormous complexity and technical debt that often plague real-world legacy systems. In the absence of a benchmark dataset of legacy code, we created two datasets that are representative of real-world legacy systems: one for MUMPS and one for ALC. We will describe how files from these corpora are chunked into segments to be loaded into LLMs below, in Section
III-A
.
III-B
1
MUMPS Corpus
We used the WorldVistA MUMPS implementation of VistA for our MUMPS dataset, with a particular focus on the Incomplete Records Tracking module. VistA is the name given to the EHR modules that make up the healthcare information technology system of the Veterans Health Administration. The open-source version of VistA
6
6
6
https://github.com/WorldVistA/VistA
, which consists of 175 modules, 36,000+ routines (files), and nearly 400,000 subroutines, is maintained by the Open Source Electronic Health Record Alliance (OSEHRA). From OSEHRA VistA, we selected the Incomplete Record Tracking module as representative of an average module in terms of the number of comments, routines, and subroutines it contains. The Incomplete Record Tracking module consists of 78 files, containing many of the conventions and styles found within older and newer MUMPS code. It is also a complete software module, making it a better candidate for summarization tasks than a random sample of all files within the entire codebase. For this reason, we consider Incomplete Record Tracking a representative module of the VistA codebase for our experimentation. In total, the MUMPS corpus contains 5,107 lines of code and 235 developer comments across 78 files.
III-B
2
ALC Corpus
We used the zFAM repository of the open-source Walmart codebase
7
7
7
https://github.com/walmartlabs/zFAM
for our ALC dataset. The zFAM repository is a z/OS-based File Access Manager used to store text or binary contents. The codebase contains many of the characteristics of real-world ALC codebases including complexity and program size. As such, it was selected as a representative sample of ALC code for our experimentation. In total, the ALC corpus contains 13,344 lines of code and 7,097 developer comments across 12 files.
III-C
Evaluating the Prompting Strategy
We employed a diverse set of metrics to measure and/or predict aspects the generated comments for various features. For this study we took human-evaluation scores as a proxy for ground truth comment quality. Secondarily, we consider several families of metrics that can be computed automatically—quantifying code complexity, assessing the quality of generated comments, and calculating the cost of comment generation for each model.
III-C
1
Human Evaluation
To measure the quality of the LLM generated output, we enlisted SMEs to evaluate both the comments produced by each LLM and the original (human-written) ground truth comments. For the MUMPS-language corpus, we had four human reviewers. All four reviewers had a professional background in healthcare IT and a combined 16+ years of experience with the MUMPS language . For the ALC corpus, we enlisted five reviewers, all of whom have worked extensively with IBM Z-series mainframes and legacy code (some with decades of experience). We used Label Studio
[
54
]
to present these SMEs with the rubric show in Table
II
to grade the LLM output using a 4-point scale across four categories: hallucination, readability, completeness, and usefulness.
Of the 235 developer comments in the MUMPS dataset, 177 unique source comments were evaluated by the SMEs. Of the 893 LLM-generated comments produced, 742 unique generated comments were evaluated by the SMEs. In total, the SMEs produced a total of 3,093 evaluations for the MUMPS dataset. For the ALC dataset, 127 of the 7,097 developer comments and 544 of the 21,698 LLM-generated comments were evaluated by the SMEs. In total, the SMEs produced a total of 2,268 evaluations for the ALC dataset. Across the five comment sources (four LLMs and one set of ground-truth comments), an approximately equal number of comments were reviewed from each source.
8
8
8
The number of comments evaluated by each reviewer were not exactly equal, because some reviewers did not complete their review assignments and reviewed slightly fewer or more comments for some sources.
For MUMPS, 2,392 comment reviews (about 77%) overlapped with all four reviewers, and only 43 (about 1%) were reviewed by one reviewer —providing a set of common ratings that we use to calculate inter-rater reliability. On ALC, 600 comment reviews (about 26%) were rated by all five reviewers and only 143 (about 6%) by one reviewer.
Metric
Description
Grade Scale
Hallucination
Does the comment provide true information?
4: The comment provides only true information
3: The comment provides mostly true information
2: The comment provides mostly untrue information
1: The comment is completely untrue
Readability
Is the comment clear to read?
4: The comment is well-written
3: The comment has few problems
2: The comment has many problems
1: The comment is unreadable
Completeness
Does the comment address all capabilities of the relevant source code?
4: All essential functionality is documented
3: Most essential functionality is documented
2: Little essential functionality is documented
1: No essential functionality is documented
Usefulness
Is the comment useful?
4: The comment helps an expert programmer understand the code better
3: The comment helps an average programmer understand the code better
2: The comment documents only trivial functionality
1: The comment is not useful at any level
TABLE II:
The rubric created for human evaluation of LLM generated output.
III-C
2
Quantifying Code Complexity
We used the common complexity metrics of cyclomatic complexity, Halstead complexity measures, and maintainability index to quantify code complexity. Cyclomatic Complexity is a quantitative measure of the complexity of the structure and flow of control through the program, while Halstead complexity measures are a series of metrics related to the difficulty of the program to write or understand including program length, volume, difficulty, and effort. The maintainability index is calculated from the cyclomatic complexity and Halstead complexity measures and is inversely related to complexity. Therefore, more complex code, as determined by the complexity metrics, will result in a lower maintainability index while less complex code will result in a higher maintainability index.
In addition to common complexity metrics, we used the prevalence of pain points to indicate complexity for the MUMPS dataset. Pain points are the aspects or features of the coding language that make understanding the code or following the flow of control challenging including syntax and the language’s ecosystem. We measured the prevalence of six MUMPS pain points: indirection, kill/goto, terse lines, local variables, variables matching the names of built-in functions, and mathematical expressions. Indirection and goto commands make flow of control difficult to follow while kill commands, local variables, global variables, and the use of reserve words as variables make variable tracking challenging. For this experiment, we created a custom parser to measure the prevalence of pain points. The pain points were normalized by lines of code and the metrics were averaged to create a pain point metric for each file sampled from the MUMPS dataset.
III-C
3
Assessing Quality of Generated Comments
To measure the quality of the LLM generated output, we used popular reference-based metrics ROUGE
[
55
]
,
CHR
​
F
\mathrm{CHR}F
[
56
]
, and BLEU
[
57
]
as well as a cosine similarity score. Reference-based metrics calculate the similarity between the LLM output and defined references to measure the accuracy of the output. For this experiment, reference-based metrics compared the LLM-generated comment to the original source comment for both the MUMPS and ALC datasets. For the cosine similarity, we used OpenAI’s
text-embedding-3-small
model to convert the generated and reference texts to 1,536-dimensional embeddings vectors
H
⁡
(
o
)
H(o)
and
H
⁡
(
r
)
H(r)
, respectively, before taking the cosine of the angle between them.
In addition to evaluating the accuracy of the generated comments using reference-based metrics, the comments must also be readable to effectively support modernization efforts. To measure the readability of LLM output, we used Flesch Reading Ease and Gunning-Fog metrics. These metrics assess the readability of the output based on the number and complexity of the words in the text.
Metric
Expression
Variables
Code Complexity
Cyclomatic complexity
M
=
E
−
N
+
2
​
P
M=E-N+2P
E
E
= edges,
N
N
= nodes,
P
P
= connected components
Halstead Difficulty
D
=
η
1
2
​
N
2
η
2
\displaystyle D=\frac{\eta_{1}}{2}\frac{N_{2}}{\eta_{2}}
η
1
\eta_{1}
= distinct operators,
η
2
\eta_{2}
= distinct operands,
N
2
N_{2}
= total operands
Halstead Effort
E
=
D
×
V
E=D\times V
D
D
= difficulty,
V
V
= volume
Halstead Volume
V
=
(
N
1
+
N
2
)
​
log
2
⁡
(
η
1
+
η
2
)
V=(N_{1}+N_{2})\log_{2}(\eta_{1}+\eta_{2})
N
1
N_{1}
= total operators
Maintainability
M
=
171
−
5.2
∗
ln
⁡
(
V
)
−
0.23
∗
(
M
)
−
16.2
∗
ln
⁡
(
L
)
M=171-5.2*\ln(V)-0.23*(M)-16.2*\ln(L)
V
V
= Halstead volume,
M
M
= cyclomatic complexity,
L
L
= total lines of code
Automated Quality
Flesch
206.835
−
1.015
​
(
W
S
)
−
84.6
​
(
Y
W
)
\displaystyle 206.835-1.015\left(\frac{W}{S}\right)-84.6\left(\frac{Y}{W}\right)
W
W
= total words,
S
S
= total sentences,
Y
Y
= total syllables
Gunning Fog
0.4
​
[
(
W
S
)
+
100
​
(
C
W
)
]
\displaystyle 0.4\left[\left(\frac{W}{S}\right)+100\left(\frac{C}{W}\right)\right]
C
C
= complex words
Reference-based Quality
ROUGE-N
∑
S
∈
R
∑
g
∈
S
C
​
o
​
u
​
n
​
t
m
​
a
​
t
​
c
​
h
​
(
g
)
∑
S
∈
R
∑
g
∈
S
C
​
o
​
u
​
n
​
t
​
(
g
)
\displaystyle\frac{\displaystyle\sum_{S\in R}\sum_{g\in S}Count_{match}(g)}{\displaystyle\sum_{S\in R}\sum_{g\in S}Count(g)}
R
R
= reference texts,
S
S
= sentence,
g
g
= an n-gram in
S
S
BLEU
min
⁡
(
1
,
|
O
|
|
R
|
)
​
∏
i
=
1
4
p
n
w
n
\displaystyle\min\left(1,\frac{|O|}{|R|}\right)\prod_{i=1}^{4}p_{n}^{w_{n}}
O
O
= output text,
R
R
= reference text,
p
n
w
n
p_{n}^{w_{n}}
= weighted
n
n
-gram precision
CHR
​
F
\mathrm{CHR}F
CHR
​
F
=
(
1
−
β
2
)
​
CHR
​
P
⋅
CHR
​
R
β
2
​
CHR
​
P
+
CHR
​
R
\displaystyle\mathrm{CHR}F=\frac{(1-\beta^{2})\mathrm{CHR}P\cdot\mathrm{CHR}R}{\beta^{2}\mathrm{CHR}P+\mathrm{CHR}R}
β
2
\beta^{2}
= weight ,
CHR
​
P
\mathrm{CHR}P
= character precision.
CHR
​
R
\mathrm{CHR}R
= character recall
Similarity
cos
⁡
(
θ
)
=
H
⁡
(
o
)
⋅
H
⁡
(
r
)
|
H
⁡
(
o
)
|
​
|
H
⁡
(
r
)
|
\displaystyle\cos(\theta)=\frac{\displaystyle H(o)\cdot H(r)}{\displaystyle|H(o)||H(r)|}
H
⁡
(
o
)
H(o)
= embedding of the output,
H
⁡
(
r
)
H(r)
= embedding of the reference text
TABLE III:
Automated code complexity metrics, automated comment quality metrics, and and reference-based comment quality metrics used in this study.
III-C
4
Calculating Cost of Comment Generation
In addition to the quality of generated comments, the time and monetary costs of comment generation are key factors to consider in the utilization of LLMs in code modernization efforts. During the execution of the comment generation task, we captured cost metrics for each LLM including monetary cost (which is proportional to the number of input and output tokens processed, each of which has their own price set by cloud providers), number of retries, processing time (which includes processing spent on retries), and number of failed generations. These metrics convey the cost and time expenditure required for each LLM to generate comments for the datasets.
III-D
Hypotheses
We investigated three hypotheses to determine the ability of automated measures to accurately determine the quality of LLM-generated comments for legacy software languages, namely MUMPS and ALC. Our first hypothesis evaluates our prompting strategy (describd below) in terms of a human-evaluation scoring rubric.
Hypothesis 1
On legacy software,
human evaluators
will find that comments generated by LLMs are hallucination-free, complete, readable, and useful in terms of a) comparison to human-written comments and b) having high absolute scores with ratings greater than 7 out of 10 on average.
The second two hypotheses dig into different classes of automated metrics to test their ability to predict the (human-scored) quality of LLM-generated documentation—either by examining the complexity of the codebase and generation task themselves, or the content of the produced comments.
Hypothesis 2
Automated measures of
software complexity
and the
cost
of generating comments for legacy software will
not
correlate well with human evaluation of the generated documentation quality.
Hypothesis 3
On legacy software, automated and
reference-based quality metrics
for generated documentation such as reading level,
CHR
​
F
\mathrm{CHR}F
, BLEU, and ROUGE will
not
correlate with human evaluations of the documentation quality.
IV
Results
We present the results of our human evaluation of LLMs ability to perform line-wise comment generation on legacy software, and then examine the ability of automated and reference-based metrics to predict that performance.
IV-A
Human Evaluation of Comments
On the MUMPS benchmark, we observed moderate to good
[
58
]
inter-rater reliability among human evaluators, as measured by intraclass correlation (ICC) (
I
​
C
​
C
​
(
2
,
k
)
ICC(2,k)
=0.73 [0.63, 0.8] for hallucination, 0.65 [0.6, 0.69] for readability, 0.89 [0.87, 0.91] for completeness, and 0.85 [0.81, 0.88] for usefulness, where square brackets indicate 95% confidence intervals).
On the ALC benchmark, however, we see poor inter-rater reliability (
I
​
C
​
C
​
(
2
,
k
)
ICC(2,k)
=0.22 [-0.1, 0.48] for hallucination, 0.16 [0, 0.31] for readability, 0.21 [-0.15, 0.48] for completeness, and 0.12 [0.17, 0.37] for usefulness). These results indicate differences in opinion among reviewers and highlight a challenge for modernization: comment quality is difficult to measure and even highly experience experts, like our reviewers, may have varying ideas on the qualities that make a useful/readable/etc. comment.
The evaluation results for the ground truth and all four models are shown in Figure
3
. In most cases, comments generated for the MUMPS dataset are rated considerably higher on average by SMEs than comments generated for ALC. Compared to the original (human-written) ground-truth comments (shown in the blue, leftmost bar within each group), our SMEs rated comments generated by the four LLMs relatively favorably across the four scales. Only a few large performance gaps occur—Mixtral and Llama3 fair poorly on generating useful and complete MUMPS code, for instance, while the other two models perform similarly to the ground truth. We find that human reviewers are especially conservative in judging the usefulness of comments. Readability is an area where LLM-generated comments are strong, particularly on MUMPS, where all models outperform ground truth by a noteworthy margin. This is perhaps not surprising when we consider that real-world comments written by humans are often sparse and obscure. On both datasets, we observe a measurable tendency for the LLMs to hallucinate (i.e. to generate factually incorrect comments). GPT-4 Turbo nonetheless achieves an average rating of 9.1 out of 10 for factualness on the MUMPS code, and Llama3 comes close to the factualness level of ground-truth comments on ALC (6.53/10 vs 7.31/10, respectively).
Comparison to ground truth is an imperfect metric for source code, however, because each dataset’s original corpus of human-written comments are not necessarily of good quality. In terms of absolute scores, the LLMs perform well overall (that is, achieving greater than 8 out of 10) on creating readable and hallucination-free documentation for MUMPS, and moderately well (greater than 7 out of 10 for Claude and GPT 4 Turbo) at providing complete documentation. Only Claude Sonnet achieved greater than 7 out of 10 on usefulness ratings, however. On our ALC dataset the picture is different: only on readability do we see any LLM-generated comments rated above 7/10 (Llama3 and GPT-4 Turbo at 7.28 and 7.65, respectively).
In summary, our SME reviewers found that LLMs create comments that are highly readable and factual on MUMPS, and that generally rate similarly to human-written ground truth comments in both languages—but that the ALC comments are low quality overall. We find
Hypothesis
1
(a) to be confirmed
for both ALC and MUMPS across the four LLMs used in the experimentation, human evaluation finds that comments generated by LLMs tend to be nearly as hallucination-free, complete, readable, and (with some exceptions) as useful as human-written comments. But we find
Hypothesis
1
(b) to be confirmed only for MUMPS and
not
for ALC
.By absolute scores, the LLM-generated comments achieve poor ratings almost across the board on ALC. This performance disparity may be attributed to the complexity of the ALC language, further exacerbated by the challenges SMEs faced in defining what constitutes a high-quality ALC comment. ALC diverges structurally and syntactically from contemporary programming languages, whereas MUMPS shows a closer alignment with modern language constructs. This highlights the potential of LLM generated documentation for legacy software modernization efforts as well as the challenges surrounding evaluation to determine the quality of generated documentation at scale.
Fig. 3:
Mean human evaluation scores for code comments generated by different LLMs (with 95% confidence intervals on the mean), for the MUMPS (WorldVistA) dataset on the left and ALC (zFAM) datasets on the right.
We do not observe a relationship between context-window size and the performance of the four models under study. While our chunking strategy provides input of various sizes in accordance with the varibale context-window sizes of the models (ex. 32k for Mixtral versus 200k for Claude Sonnet), this additional information appears to have had little impact on the human-rated quality of resulting line-wise comments. We anticipate that context will play a more critical role in higher-level software documentation (such as code summarization for full subroutines and modules), where being able to describe relationships between distributed pieces of code is more important.
IV-B
Complexity and Cost Metrics
Human evaluation alone is costly and, as such, is insufficient to adapt LLM-based comment generation techniques to new real-world applications. If automated or semi-automated metrics are able to assist in verifying a system’s performance in new settings, it would go a long way to making these tools easier to adopt.
We find, however, that the various complexity and cost metrics that we present in this study—while easy to compute—correlate poorly with human evaluations of comment quality. Table
IV
shows Pearson correlation coefficients for these metrics on both datasets. Many metrics show no statistically significant
9
9
9
As we were only interested in a general view of the potential of these metrics to correlate with comment quality, we did not perform a Bonferroni correction on these results to control for the inflated risk of Type-II errors. Strong conclusions should not be drawn here, then, about individual correlation values.
(
p
<
0.05
p<0.05
) correlation with hallucination, completeness, readability, or usefulness. The absolute value of the correlations that are significant are all beneath 0.25—except for the inverse correlation between processing time and usefulness, which has a correlation of -0.33. Interestingly, this suggests that the longer an LLM spends generating a comment, the less useful it is (up to a weak correlation). This effect seems to be independent of the number of retries, which (while retries are included in processing time) shows no significant correlation by itself. Overall we find
Hypothesis
2
to be confirmed
for both ALC and MUMPS across the four LLMs used in the experimentation: automated metrics of both static complexity and runtime cost correlate poorly with the quality of comments produced by LLMs. While larger sample sizes might lead to more of the correlations we measured becoming statistically significant, we still observe low correlation strengths across the board (even in significant cases). This may partly be due to the variability across SME opinions that we observed in the ICC figures above for ALC—but it also likely reflects the deep difficulty of understanding and summarizing legacy assembly instructions in ways that are useful to humans.
Dataset
Metric
Hallucination
Completeness
Readability
Usefulness
Walmart ALC
Cost
0.06
0.09
0.21
0.06
Cyclomatic Complexity
-0.01
-0.02
-0.02
0.05
Difficulty
-0.02
-0.01
0.05
0.04
Effort
-0.01
-0.02
-0.01
0.05
Maintainability
-0.02
0.00
0.07
0.00
Processing Time
-0.11
-0.03
-0.09
-0.05
Retries
0.07
0.02
0.06
-0.07
Volume
-0.01
-0.02
-0.01
0.05
MUMPS
Cost
0.02
-0.01
0.03
0.01
Cyclomatic Complexity
-0.10*
-0.16*
-0.24*
-0.09*
Difficulty
-0.09*
-0.22*
-0.20*
-0.16*
Effort
-0.08
-0.21*
-0.19*
-0.16*
Maintainability
-0.09
-0.15*
-0.21*
-0.09*
Pain Point Indirection
-0.07
-0.23*
-0.15*
-0.17*
Pain Point Kill Goto
-0.07
-0.25*
-0.13*
-0.18*
Pain Point Lines of Code
-0.08
-0.18*
-0.17*
-0.13*
Pain Point Locals
-0.09*
-0.21*
-0.18*
-0.15*
Pain Point Math
-0.06
-0.10*
-0.04
-0.10*
Pain Point Terse
-0.08
-0.19*
-0.17*
-0.12*
Pain Point Variables Matching Functions
-0.09*
0.02
0.02
0.00
Processing Time
-0.11*
-0.16*
-0.04
-0.13*
TABLE IV:
Correlations between automated complexity, pain-point, and runtime cost metrics and human-evaluation scores on the Walmart ALC (top) and MUMPS (bottom) datasets. Negative values indicate that higher values of the metric are associated with lower scores, and values further from zero indicate stronger relationships. Bolded values with asterisks indicate statistically significant correlations.
IV-C
Quality Metrics
Reference-based metrics occupy a middle ground between cheap and easy-to-compute automated measures and the full expense of 100% human evaluation. In practice, organizations may use a small corpus of human-generated ground truth along with reference-based metrics to evaluate LLM-based comment generation tools on their codebase. Once the ground truth is created, these metrics can be run automatically against any number of new models or hyperparameter configurations—allowing accelerated research into ways to improve comment generation.
Unfortunately, we find that neither fully automated quality metrics nor reference-based metrics correlate well with human evaluations of quality. As shown in Table
V
, of the statistically significant correlations, only a handful achieve a Pearson correlation of greater than 0.25. The highest correlation is between the cosine similarity score and usefulness—at a correlation of just 0.34. Overall this similarity metric has the most robust performance aross the four human-evaluation categories, and thus is the most interesting prospect going forward for a reference-based quality metric. We observe that comments that have higher complexity in terms of Flesch and Gunning-Fog readability measures tend to be a little bit more complete (0.17 and 0.20, respectively)—but these comments tend to exhibit a similar increase in hallucinations (0.24 and 0.26). Overall, because all of these correlations are small in magnitude, we find
Hypothesis
3
to be confirmed
for both ALC and MUMPS across the four LLMs used in the experimentation: automated and reference-based measures of generated comment quality are poor predictors of their true quality as rated by human subject-matter experts.
Dataset
Metric
Hallucination
Completeness
Readability
Usefulness
Walmart ALC
BLEU
0.13
0.15*
0.03
0.02
Flesch
0.24*
0.17*
-0.13
-0.01
Gunning Fog
0.26*
0.20*
-0.11
0.01
CHRF
0.24*
0.27*
0.07
0.11
ROUGE
0.11
0.10
0.02
-0.04
Similarity Score
0.31*
0.33*
0.10
0.23*
MUMPS
BLEU
0.03
0.11*
0.05
0.09*
Flesch
-0.01
-0.10*
-0.10*
-0.06*
Gunning Fog
-0.02
-0.09*
-0.11*
-0.06
CHRF
0.06*
0.23*
0.09*
0.22*
ROUGE
0.09*
0.14*
0.06
0.16*
Similarity Score
0.19*
0.32*
0.13*
0.34*
TABLE V:
Correlations between automated and reference-based LLM quality metrics and human-evaluation scores on the Walmart ALC (top) and MUMPS (bottom) datasets. Negative values indicate that higher values of the metric are associated with lower scores, and values further from zero indicate stronger relationships. Bolded values with asterisks indicate statistically significant correlations.
V
Discussion
Legacy code modernization is an exceedingly demanding task that has a reputation for being difficult for any organization to achieve successfully (let alone in-budget!). The market contains many vendors promising solutions that can accelerate modernization, and the growing body of evidence around LLM-based software understanding suggests that rapid progress can be expected over the next few years. But, based on our experience with real-world IT decision makers and legacy software SMEs, we recognize that there is a growing need for methods of evaluating whether or not new tools pose opportunities to automate and accelerate modernization efforts.
Documentation generation—and more specifically the generation of line-wise comments that we study here—plays one small part in the broader modernization lifecycle (which itself may involve many decisions about when to translate, refactor, rewrite, or re-deploy and containerize various legacy components). What kind of evidence do organizations and developers need in order to justify placing their trust and resources in a modernization workflow that includes generative LLM components for tasks such as automated documentation?
When it comes to the practical use of comment-generation tools, developers are waiting to see how the technology matures. Research has often cited a lack of good benchmark datasets as a challenge in the documentation-generation field
[
18
]
. Additionally, there is a tendency for model performance to vary greatly across different datasets—such that performance results on one benchmark are likely to generalize poorly to new codebases
[
20
]
. The popular benchmarks that do exist are focused exclusively on mainstream languages (especially Java)—with, again, a gap in the literature when it comes to their performance on legacy languages and codebases. In a wide-ranging study of practitioner perceptions of automated comment generation, Hu et al. find that software developers cite concerns that such tools will be limited to restating “what the code does,” and will perform poorly at the most valuable aspects of documentation—such as describing
why
the code works the way it does, how it can be used, and how it connects to other aspects of the system
[
59
]
. They also find that practitioners are especially skeptical of n-gram-based performance metrics for documentation, such as BLEU, ROUGE, and
CHR
​
F
\mathrm{CHR}F
[
57
,
55
,
56
]
. Reference-based metrics like these originate in the machine translation and text summarization community
[
60
]
as a means of quantifying similarity to human-written ground truth—but similarity alone does not seem sufficient to quantify documentation quality.
V-A
Conclusions
This paper evaluated the performance of LLMs for code understanding (specifically line-level code summarization) on legacy software. Broadly, we find reason to be optimistic. Even though MUMPS and mainframe assembly are aging languages with small, niche communities and relatively little publicly available code for foundation models to be trained on, we found that mainstream LLMs generate comments of comparable quality to ones that are written by human developers (Hypothesis 1(a)). We found that LLM generation of MUMPS comments performs rather well across the board, but that writing comments for ALC is challenging both for humans and machines (Hypothesis 1(b)). We speculate that the performance difference between ALC and MUMPS arises because MUMPS’ structure and flow are more similar to modern languages, whereas ALC’s structure and flow differ significantly from them.
The question that practitioners have, however, is how these automation techniques can be expected to perform on their proprietary code. No set of academic benchmarks can fully answer this question, and organizations will need to conduct some degree of experimentation or measurement on their own systems to test out the feasibility and validate the results of automation. Turning our attention to code complexity metrics and LLM runtime cost metrics—which can be measured fully automatically with no ground truth comments to compare against—we found that none of them correlate strongly with any of the four dimensions of our human evaluation of comment quality (Hypothesis 2). These correlations were especially weak on ALC code. Looking further at direct measures of comment quality like reading level, BLEU, and ROUGE (among others), we again found no strong correlations with human assessments of comments (Hypothesis 3)—though here we do see a number of metrics that correlate significantly even on ALC code.
V-B
Future Work
The comment generation method we tested here using out-of-the-box foundation models was effective at solving the initial problems of incomplete and mutated output, but there are many avenues that could be taken to improve comment quality. Industry players are already demonstrating the benefits of domain-specific fine tuning for code modernization tasks (ex. for COBOL
[
61
]
), and we would like to investigate how (parameter-efficient) fine tuning can improve performance on especially difficult instances of code modernization
[
62
]
. Getting access to realistic legacy code to fine tune on is a barrier in the field, however, as open-source repositories exhibiting realistically complex code in legacy languages are not common. Continuing to test methods of this kind on a broader set of legacy code benchmark is thus vitally important for the field, especially since there is strong evidence that performance of ML models on code understanding tasks varies greatly across codebases and the results we present here do not guarantee similar results on specific legacy systems
[
20
]
.
Another significant set of design decisions we made here surround our greedy chunking strategy for feeding code into LLMs with different context window sizes. Little evidence has been published around what kind of chunking strategies work best for source-code-related tasks. We expect to study alternative chunking strategies in our future work.
On the metrics side, our results reiterate an
alignment problem
that has been a growing concern in the literature the past few years
[
51
,
52
,
20
]
: we do not have good automated or semi-automated metrics for evaluating the quality of LLM-generated documentation. To date, the only way to provide confidence in the correctness of generated documentation is to have a human expert spend great amounts of time reading and verifying large amounts of the system’s output. A few efforts have begun to examine alternate metrics to close this gap, perhaps based on machine learning
[
63
,
64
]
, but much further investigation is needed especially in the IT modernization sphere, where legacy systems pose unique challenges that are not well-represented in open-source benchmarks.
Acknowledgment
©The MITRE Corporation. All Rights Reserved. Approved for Public Release; Distribution Unlimited. Public Release Case Number 24-3245.
References
[1]
U.S. Government Accountability Office , “Information Technology: Agencies need to develop modernization plans for critical legacy systems,”
[2]
A. Alexandrova, L. Rapanotti, and I. Horrocks, “The legacy problem in government agencies: An exploratory study,” in
Proceedings of the 16th Annual International Conference on Digital Government Research
. ACM, May 2015, pp. 150–159.
[3]
E. Egan, “Federal IT Modernization Needs a Strategy and More Money,”
https://itif.org/publications/2022/05/31/federal-it-modernization-needs-strategy-and-more-money/
, 2022.
[4]
D. L. Giudice, “The future of GenAI will rocket fuel modernisation of core legacy systems,” Jul. 2024. [Online]. Available:
https://www.ftadviser.com/platforms/2024/07/16/the-future-of-genai-will-rocket-fuel-modernisation-of-core-legacy-systems/
[5]
S. Aulbach, “Ai-powered application rewrite: Revolutionizing legacy code transformation,” 2024. [Online]. Available:
https://www2.deloitte.com/us/en/pages/consulting/articles/ai-powered-application-rewrite-revolutionizing-legacy-code-transformation.html
[6]
M. Chen, J. Tworek, H. Jun, Q. Yuan, H. P. d. O. Pinto
et al.
, “Evaluating large language models trained on code,”
arXiv:2107.03374
, Jul. 2021.
[7]
S. Greengard, “AI rewrites coding,”
Communications of the ACM
, vol. 66, no. 4, pp. 12–14, Apr. 2023.
[8]
A. Fan, B. Gokkaya, M. Harman, M. Lyubarskiy, S. Sengupta, S. Yoo, and J. M. Zhang, “Large language models for software engineering: Survey and open problems,” in
2023 IEEE/ACM International Conference on Software Engineering: Future of Software Engineering (ICSE-FoSE)
. IEEE, May 2023, pp. 31–53.
[9]
D. KC and C. T. Morrison, “Neural machine translation for code generation,”
arXiv:2305.13504
, May 2023.
[10]
K. Jesse, T. Ahmed, P. T. Devanbu, and E. Morgan, “Large language models and simple, stupid bugs,” in
2023 IEEE/ACM 20th International Conference on Mining Software Repositories (MSR)
. IEEE, May 2023, pp. 563–575.
[11]
S. Kabir, D. N. Udo-Imeh, B. Kou, and T. Zhang, “Is Stack Overflow obsolete? An empirical study of the characteristics of ChatGPT answers to Stack Overflow questions,” in
Proceedings of the CHI Conference on Human Factors in Computing Systems
. ACM, May 2024, pp. 1–17.
[12]
P. Vaithilingam, T. Zhang, and E. L. Glassman, “Expectation vs. experience: Evaluating the usability of code generation tools powered by large language models,” in
CHI Conference on Human Factors in Computing Systems Extended Abstracts
. ACM, Apr. 2022, pp. 1–7.
[13]
J. D. Weisz, M. Muller, S. I. Ross, F. Martinez, S. Houde, M. Agarwal, K. Talamadupula, and J. T. Richards, “Better together? an evaluation of ai-supported code translation,” in
27th International Conference on Intelligent User Interfaces
, 2022, pp. 369–391.
[14]
R. Pietrini, M. Paolanti, and E. Frontoni, “Bridging Eras: Transforming Fortran legacies into Python with the power of large language models,” in
2024 IEEE 3rd International Conference on Computing and Machine Intelligence (ICMI)
. IEEE, Apr. 2024.
[15]
A. LeClair, S. Jiang, and C. McMillan, “A neural model for generating natural language summaries of program subroutines,” in
2019 IEEE/ACM 41st International Conference on Software Engineering (ICSE)
. IEEE, May 2019, pp. 795–806.
[16]
A. LeClair, S. Haque, L. Wu, and C. McMillan, “Improved code summarization via a graph neural network,” in
Proceedings of the 28th International Conference on Program Comprehension
. ACM, Jul. 2020, pp. 184–195.
[17]
Y. Wan, Z. Zhao, M. Yang, G. Xu, H. Ying
et al.
, “Improving automatic source code summarization via deep reinforcement learning,” in
Proceedings of the 33rd ACM/IEEE International Conference on Automated Software Engineering
. ACM, Sep. 2018, pp. 397–407.
[18]
A. LeClair and C. McMillan, “Recommendations for datasets for source code summarization,” in
Proceedings of the 2019 Conference of the North
. Association for Computational Linguistics, 2019, pp. 3931–3937.
[19]
D. D. Sherertz, “The evolution of a language standard: MUMPS in the 1980s,” in
Proceedings of the ACM 1980 annual conference
. ACM Press, 1980, pp. 101–104.
[20]
S. Stapleton, Y. Gambhir, A. LeClair, Z. Eberhart, W. Weimer, K. Leach, and Y. Huang, “A human study of comprehension and code summarization,” in
Proceedings of the 28th International Conference on Program Comprehension
. ACM, Jul. 2020, pp. 2–13.
[21]
U.S. Government Accountability Office , “Information technology: Agencies need to continue addressing critical legacy systems,”
[22]
——, “Information Technology: Federal agencies need to address aging legacy systems,”
[23]
U.S. Government Accountability Office, “Information technology: IRS needs to complete modernization plans and fully address cloud computing requirements,”
[24]
P. H. Newcomb and R. Couch, “Chapter 12 - Veterans Health Administration’s VistA MUMPS modernization pilot**© 2010. The Software Revolution, Inc. all rights reserved.” in
Information Systems Transformation
, W. M. Ulrich and P. H. Newcomb, Eds. Morgan Kaufmann, 2010, pp. 301–345.
[25]
V. Zaytsev, “Open challenges in incremental coverage of legacy software languages,” in
Proceedings of the 3rd ACM SIGPLAN International Workshop on Programming Experience
. ACM, Oct. 2017, pp. 1–6.
[26]
S. Bhatia, J. Qiu, N. Hasabnis, S. A. Seshia, and A. Cheung, “Verified code transpilation with LLMs,”
arXiv:2406.03003
, Jun. 2024.
[27]
R. Pan, A. R. Ibrahimzada, R. Krishna, D. Sankar, L. P. Wassi
et al.
, “Lost in translation: A study of bugs introduced by large language models while translating code,” in
Proceedings of the IEEE/ACM 46th International Conference on Software Engineering
. ACM, Apr. 2024, pp. 1–13.
[28]
Z. Wu, L. Qiu, A. Ross, E. Akyürek, B. Chen
et al.
, “Reasoning or reciting? Exploring the capabilities and limitations of language models through counterfactual tasks,”
arXiv:2307.02477
, Mar. 2024.
[29]
R. Liang, Y. Cao, P. Hu, and K. Chen, “Neutron: an attention-based neural decompiler,”
Cybersecurity
, vol. 4, no. 1, p. 5, Dec. 2021.
[30]
C. Fu, H. Chen, H. Liu, X. Chen, Y. Tian
et al.
, “A Neural-based program decompiler,”
Advances in Neural Information Processing Systems
, Jun. 2019. [Online]. Available:
http://arxiv.org/abs/1906.12029
[31]
O. Katz, Y. Olshaker, Y. Goldberg, and E. Yahav, “Towards neural decompilation,”
arXiv:1905.08325
, May 2019.
[32]
P. W. McBurney and C. McMillan, “Automatic source code summarization of context for Java methods,”
IEEE Transactions on Software Engineering
, vol. 42, no. 2, pp. 103–119, Feb. 2016.
[33]
L. Moreno, J. Aponte, G. Sridhara, A. Marcus, L. Pollock, and K. Vijay-Shanker, “Automatic generation of natural language summaries for Java classes,” in
2013 21st International Conference on Program Comprehension (ICPC)
. IEEE, May 2013, pp. 23–32.
[34]
G. Sridhara, E. Hill, D. Muppaneni, L. Pollock, and K. Vijay-Shanker, “Towards automatically generating summary comments for Java methods,” in
Proceedings of the IEEE/ACM international conference on Automated software engineering
. ACM, Sep. 2010, pp. 43–52.
[35]
E. Wong, Taiyue Liu, and L. Tan, “CloCom: Mining existing source code for automatic comment generation,” in
2015 IEEE 22nd International Conference on Software Analysis, Evolution, and Reengineering (SANER)
. IEEE, Mar. 2015, pp. 380–389.
[36]
C. Zhang, J. Wang, Q. Zhou, T. Xu, K. Tang, H. Gui, and F. Liu, “A survey of automatic source code summarization,”
Symmetry
, vol. 14, no. 3, p. 471, Feb. 2022.
[37]
Y. Zhu and M. Pan, “Automatic code summarization: A systematic literature review,”
arXiv:1909.04352
, Oct. 2019.
[38]
C. Lin, Z. Ouyang, J. Zhuang, J. Chen, H. Li, and R. Wu, “Improving code summarization with block-wise abstract syntax tree splitting,” in
2021 IEEE/ACM 29th International Conference on Program Comprehension (ICPC)
. IEEE, May 2021, pp. 184–195.
[39]
X. Hu, G. Li, X. Xia, D. Lo, and Z. Jin, “Deep code comment generation with hybrid lexical and syntactical information,”
Empirical Software Engineering
, vol. 25, no. 3, pp. 2179–2217, May 2020.
[40]
S. Iyer, I. Konstas, A. Cheung, and L. Zettlemoyer, “Summarizing source code using a neural attention model,” in
Proceedings of the 54th Annual Meeting of the Association for Computational Linguistics (Volume 1: Long Papers)
. Berlin, Germany: Association for Computational Linguistics, 2016, pp. 2073–2083.
[41]
S. Gao, C. Gao, Y. He, J. Zeng, L. Nie
et al.
, “Code structure–Guided transformer for source code summarization,”
ACM Transactions on Software Engineering and Methodology
, vol. 32, no. 1, pp. 1–32, Jan. 2023.
[42]
R. Bommasani, D. A. Hudson, E. Adeli, R. Altman, S. Arora
et al.
, “On the opportunities and risks of foundation models,”
arXiv:2108.07258
, Jul. 2022.
[43]
J. Gu, P. Salza, and H. C. Gall, “Assemble foundation models for automatic code summarization,” in
2022 IEEE International Conference on Software Analysis, Evolution and Reengineering (SANER)
. IEEE, Mar. 2022, pp. 935–946.
[44]
J. Y. Khan and G. Uddin, “Automatic code documentation generation using GPT-3,” Sep. 2022.
[45]
S. S. Dvivedi, V. Vijay, S. L. R. Pujari, S. Lodh, and D. Kumar, “A comparative analysis of large language models for code documentation generation,” in
Proceedings of the 1st ACM International Conference on AI-Powered Software
. ACM, Jul. 2024, pp. 65–73.
[46]
J. Leinonen, P. Denny, S. MacNeil, S. Sarsa, S. Bernstein, J. Kim, A. Tran, and A. Hellas, “Comparing code explanations created by students and large language models,” in
Proceedings of the 2023 Conference on Innovation and Technology in Computer Science Education V. 1
. ACM, Jun. 2023, pp. 124–130.
[47]
D. Nam, A. Macvean, V. Hellendoorn, B. Vasilescu, and B. Myers, “Using an LLM to help with code understanding,” in
Proceedings of the IEEE/ACM 46th International Conference on Software Engineering
. ACM, Apr. 2024, pp. 1–13.
[48]
A. N. Sontakke, M. Patwardhan, L. Vig, R. K. Medicherla, R. Naik, and G. Shroff, “Code summarization: Do transformers really understand code?” in
Deep Learning for Code Workshop
, 2022. [Online]. Available:
https://openreview.net/forum?id=rI5ll2_-1Zc
[49]
W. Macke and M. Doyle, “Testing the effect of code documentation on large language model code understanding,” in
Findings of the Association for Computational Linguistics: NAACL 2024
. Association for Computational Linguistics, 2024, pp. 1044–1050.
[50]
H. Tang and S. Nadi, “Evaluating software documentation quality,” in
2023 IEEE/ACM 20th International Conference on Mining Software Repositories (MSR)
. IEEE, May 2023, pp. 67–78.
[51]
X. Hu, Q. Chen, H. Wang, X. Xia, D. Lo, and T. Zimmermann, “Correlating automated and human evaluation of code documentation generation quality,”
ACM Transactions on Software Engineering and Methodology (TOSEM)
, vol. 31, no. 4, pp. 1–28, Oct. 2022.
[52]
E. Shi, Y. Wang, L. Du, J. Chen, S. Han, H. Zhang, D. Zhang, and H. Sun, “On the evaluation of neural code summarization,” in
Proceedings of the 44th International Conference on Software Engineering
. ACM, May 2022, pp. 1597–1608.
[53]
M. X. Liu, F. Liu, A. J. Fiannaca, T. Koo, L. Dixon, M. Terry, and C. J. Cai, “”We Need Structured Output”: Towards user-centered constraints on large language model output,” in
Extended Abstracts of the CHI Conference on Human Factors in Computing Systems
, May 2024, pp. 1–9.
[54]
M. Tkachenko, M. Malyuk, A. Holmanyuk, and N. Liubimov, “Label Studio: Data labeling software,” 2020-2022, open source software available from https://github.com/heartexlabs/label-studio. [Online]. Available:
https://github.com/heartexlabs/label-studio
[55]
C.-Y. Lin, “ROUGE: A package for automatic evaluation of summaries,” in
Text Summarization Branches Out
. Association for Computational Linguistics, 2004, pp. 74–81.
[56]
M. Popović, “chrF: Character n-gram F-score for automatic MT evaluation,” in
Proceedings of the Tenth Workshop on Statistical Machine Translation
. Association for Computational Linguistics, 2015, pp. 392–395.
[57]
K. Papineni, S. Roukos, T. Ward, and W.-J. Zhu, “BLEU: A method for automatic evaluation of machine translation,” in
Proceedings of the 40th Annual Meeting on Association for Computational Linguistics - ACL ’02
. Association for Computational Linguistics, 2001, p. 311.
[58]
T. K. Koo and M. Y. Li, “A guideline of selecting and reporting intraclass correlation coefficients for reliability research,”
Journal of Chiropractic Medicine
, vol. 15, no. 2, pp. 155–163, Jun. 2016.
[59]
X. Hu, X. Xia, D. Lo, Z. Wan, Q. Chen, and T. Zimmermann, “Practitioners’ expectations on automated code comment generation,” in
Proceedings of the 44th International Conference on Software Engineering
. ACM, May 2022, pp. 1693–1705.
[60]
Z. Li, X. Xu, T. Shen, C. Xu, J.-C. Gu
et al.
, “Leveraging large language models for NLG evaluation: Advances and challenges,”
arXiv:2401.07103
, Jun. 2024.
[61]
IBM, “Ibm unveils watsonx generative AI capabilities to accelerate mainframe application modernization,” 2023. [Online]. Available:
https://newsroom.ibm.com/2023-08-22-IBM-Unveils-watsonx-Generative-AI-Capabilities-to-Accelerate-Mainframe-Application-Modernization
[62]
Z. Han, C. Gao, J. Liu, S. Q. Zhang
et al.
, “Parameter-efficient fine-tuning for large models: A comprehensive survey,”
arXiv:2403.14608
, 2024.
[63]
S. Haque, Z. Eberhart, A. Bansal, and C. McMillan, “Semantic similarity metrics for evaluating source code summarization,” in
Proceedings of the 30th IEEE/ACM International Conference on Program Comprehension
. ACM, May 2022, pp. 36–47.
[64]
A. Mastropaolo, M. Ciniselli, M. D. Penta, and G. Bavota, “Evaluating code summarization techniques: A new metric and an empirical characterization,”
arXiv:2312.15475
, Dec. 2023.
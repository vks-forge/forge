---
title: Detecting and Correcting Hallucinations in LLM-Generated Code
id: detecting-and-correcting-hallucinations-in-llm-generated-code
tags:
- ai-software-factory-architecture-58e4cc
- zero-hallucination
- deterministic-verification
- primary-source
created: '2026-10-12T08:30:09.340725Z'
updated: '2026-10-12T08:36:19.663650Z'
source: https://arxiv.org/abs/2601.19106
source_domain: arxiv.org
fetched_at: '2026-10-12T08:30:09.338626Z'
fetch_provider: builtin
status: draft
type: note
tier: institutional
content_type: paper
deprecated: false
summary: FORGE 2026 paper (Khati, Rodriguez-Cardenas, Pantzer, Poshyvanyk; William
  & Mary; arXiv 2601.19106, DOI 10.1145/3793655.3793725 — fetched as open-access substitute
  for the paywalled ACM version) presenting a deterministic, non-LLM post-processing
  framework for detecting and auto-correcting 'Knowledge Conflicting Hallucinations'
  (KCHs) in LLM-generated code — subtle semantic errors like non-existent API parameters/function
  names (e.g. pandas pd.read_exel()) that pass linters but fail at runtime. The method
  parses generated code into an AST and validates it against a dynamically-generated
  Knowledge Base built via live library introspection (not training data), applying
  deterministic rules to catch both API-level and identifier-level conflicts, explicitly
  positioned as an alternative to unreliable probabilistic/LLM-in-the-loop repair.
  On a manually curated 200-snippet Python dataset the framework achieved 100% precision,
  87.6% recall (F1 = 0.934), and auto-corrected 77.0% of identified hallucinations.
  Directly relevant evidence for 'zero-hallucination' tooling that is deterministic
  rather than another LLM judging an LLM.
raw_file: raw/detecting-and-correcting-hallucinations-in-llm-generated-code.pdf
doi: arXiv:2601.19106
citation_count: 4
venue: FORGE@ICSE
---

Detecting and Correcting Hallucinations in LLM-Generated Code
via Deterministic AST Analysis
Dipin Khati
dkhati@wm.edu
William & Mary
Williamsburg, Virginia
USA
Daniel
Rodriguez-Cardenas
dhrodriguezcar@wm.edu
William & Mary
Williamsburg, Virginia
USA
Paul Pantzer
pwpantzer@wm.edu
William & Mary
Williamsburg, Virginia
USA
Denys Poshyvanyk
dposhyvanyk@wm.edu
William & Mary
Williamsburg, Virginia
USA
Abstract
Large Language Models (LLMs) for code generation boost produc-
tivity but frequently introduce Knowledge Conflicting Hallucina-
tions (KCHs), subtle, semantic errors, such as non-existent API
parameters, that evade linters and cause runtime failures. Existing
mitigations like constrained decoding or non-deterministic LLM-
in-the-loop repair are often unreliable for these errors. This paper
investigates whether a deterministic, static-analysis framework
can reliably detect and auto-correct KCHs. We propose a post-
processing framework that parses generated code into an Abstract
Syntax Tree (AST) and validate it against a dynamically-generated
Knowledge Base (KB) built via library introspection. This non-
executing approach uses deterministic rules to find and fix both
API and identifier-level conflicts. On a manually-curated dataset
of 200 Python snippets, our framework detected KCHs with 100%
precision and 87.6% recall (0.934 F1-score), and successfully auto-
corrected 77.0% of all identified hallucinations. Our findings demon-
strate that this deterministic post-processing approach is a viable
and reliable alternative to probabilistic repair, offering a clear path
toward trustworthy code generation.
CCS Concepts
• Software and its engineering →Software development tech-
niques; Software development techniques; • Computing method-
ologies →Artificial intelligence.
Keywords
Hallucinations, LLMs for Code, Knowledge Conflicting Hallucina-
tions
ACM Reference Format:
Dipin Khati, Daniel Rodriguez-Cardenas, Paul Pantzer, and Denys Poshy-
vanyk. 2026. Detecting and Correcting Hallucinations in LLM-Generated
Code via Deterministic AST Analysis . In 2026 IEEE/ACM Third International
Conference on AI Foundation Models and Software Engineering (FORGE ’26),
April 12–13, 2026, Rio de Janeiro, Brazil. ACM, New York, NY, USA, 5 pages.
https://doi.org/10.1145/3793655.3793725
This work is licensed under a Creative Commons Attribution-NonCommercial-
NoDerivatives 4.0 International License.
FORGE ’26, Rio de Janeiro, Brazil
© 2026 Copyright held by the owner/author(s).
ACM ISBN 979-8-4007-2477-0/2026/04
https://doi.org/10.1145/3793655.3793725
1
Introduction
LLMs have fundamentally reshaped the software development life
cycle. For millions of developers, tools like GitHub Copilot now
integrate deeply into daily workflow, acting as collaborative part-
ners that demonstrably boost productivity by generating complex
functions from a simple natural language comment [7]. However,
this new productivity introduces a subtle and frustrating class of
errors that can erode developer trust [2]. Empirical studies on LLM-
generated code confirm that models frequently produce outputs
that appear syntactically correct but fail at runtime [11, 12]. For
example, when generating a pandas script, a model may call pd.
read_exel(’data.csv’), which both invents a function name and
mismatches the intended file type [6]. This failure often presents as
a block of code that looks clean, seems idiomatic, and even follows
local variable naming conventions. But when executed, the program
crashes, citing an “unexpected keyword argument” or an “unde-
fined variable.” A linter, for instance, will not catch these errors;
it’s not simple typo. These errors, in fact, represent a frequent and
well-documented LLM bug pattern [11–13], a failure that reveals a
deep structural error also known as hallucination.
This deep structural error, or hallucination, falls into a category
that recent work defines as KCH [6]. This specific failure occurs
when generated code flat-out contradicts the established, factual
knowledge of a programming language or its libraries. For example,
a model might seem to understand a library but confidently invents
a parameter name that remains semantically plausible but factually
incorrect. These errors represent the worst of both worlds. They do
not constitute syntax errors; an invented parameter, for example,
often results in perfectly valid syntax. Instead, they constitute deep
semantic errors that only reveal themselves at runtime, making
them incredibly costly to find in a complex application. This KCH
category encompasses two major problems: API Knowledge Con-
flicts, which involve using a deprecated function or non-existent
parameter, and Identifier Knowledge Conflicts, where the model
misuses a variable it defined itself, such as defining max_len_str
but later calling max_len_len_str [6].
As this kind of subtly broken, “plausible-but-wrong” code quietly
filters into production repositories [4], the research community has
scrambled to tackle the problem. However, the most prominent
academic solutions focus on prevention rather than cure, primarily
through constrained decoding techniques. Tools such as PICARD
[10] and Synchromesh [8] show real promise, forcing the LLM to
only output tokens that fit a strict formal grammar. They do a solid
job of ensuring syntactically valid code, eliminating errors such as
missing brackets. But they remain blind to our specific problem.
arXiv:2601.19106v1  [cs.SE]  27 Jan 2026


---

FORGE ’26, April 12–13, 2026, Rio de Janeiro, Brazil
Trovato et al.
A function call with an invented parameter remains syntactically
perfect, so these tools allow its generation, even when it contains
deep semantic errors.
Other approaches pivot from prevention to repair. The most
common repair method relies on an “LLM-in-the-loop,” where a
static analysis tool finds an error and feeds its report back to the
LLM to "fix the problem" [1, 9]. This approach, however, amounts
to a non-deterministic gamble; it relies on the very model that
hallucinated to suddenly understand its own subtle, factual error.
A more recent technique, “Structural Trimming,” also uses a post-
processing AST parser but focuses explicitly on deletion [14]. This
method identifies the “anchor” of a hallucination and simply prunes
the offending code block. While this presents a powerful idea for
mitigating security vulnerabilities, it fails to solve the developer’s
core problem. It leaves behind an incomplete function. It does not
resolve the error; it merely removes it.
This clear gap in the research leads us to our core research
questions:
RQ1 Can we use classic static analysis techniques to deterministi-
cally detect the semantic, knowledge-conflicting hallucina-
tions that LLMs produce?
RQ2 Can such a technique go beyond detection and auto-correct
these specific errors in a post-processing step?
To this end, we propose a lightweight, deterministic parser
that resolves these hallucinations by trusting the code’s concrete
structure. The framework functions by parsing the generated code
into its AST, which provides a verifiable, logical map of the pro-
gram. This map allows our framework to deterministically cross-
reference every variable used against every variable defined in its
scope, and to validate every API call against a "ground-truth" file
of library signatures. For a developer, this means that frustrating
runtime-crashing errors can be caught and fixed *before* execu-
tion, saving significant debugging time and rebuilding trust in the
generated code.
We evaluated our framework on a curated dataset of 200 samples
designed to test KCHs in multiple target libraries. The framework
achieves a precision of 100% in detecting hallucinations, indicating
zero false positives, and a fix accuracy of 77.0% in automatically cor-
recting them. These results demonstrate that a static, deterministic
approach can effectively detect and fix KCH to promote trustworthy
code generation without relying on probabilistic post-hoc filtering.
While prior post-processing tools have used ASTs for pruning
or formatting, our work is, to our knowledge, the first to apply a
deterministic AST–KB combination for hallucination correction.
Our approach offers a reliable, interpretable, and non-probabilistic
mechanism for mitigating KCHs in code produced by large language
models. Additionally, our tool is standalone and can also be used on
any codebase to scan for KCHs, even on human-written code. All
data, code, and experimental configurations are publicly available
in our replication package [3].
2
Methodology
We introduce a deterministic, post-generation framework to detect
and correct KCHs in code. Our design is entirely static and non-
executing: code is analyzed via ASTs, validated against a versioned
KB built from the libraries themselves, and repaired through local-
ized AST edits. This yields reproducible decisions and interpretable
corrections without running the code.
2.1
Static Analysis Layer
The framework starts with a code-generated snippet as illustrated
in Figure 1- 1 . The Static Analysis Layer (Fig. 1- 2 ) parses the code
snippet into an AST. From this tree, we extract critical structural
features: (i) all import statements and alias mappings (e.g., import
pandas as pd), (ii) fully qualified call sites (e.g., pd.read_csv), (iii)
“bare” function calls lacking a module qualifier (e.g., loads), and
(iv) call arguments, especially string literals that imply intent (e.g.,
.csv). This AST-level analysis precisely identifies all references to
libraries, functions, and objects, regardless of formatting.
2.2
Dynamic Knowledge Base
The imported import statements are fed into the Dynamic Knowl-
edge Base (Fig. 1- 3 ). Our KB is not a fixed whitelist; it synthe-
sizes knowledge via introspection. When encountering an import
pandas statement, a builder utility imports the library, enumerates
its public callables, and (for pandas) records common DataFrame
and Series methods. The KB stores: (i) valid function/method
names, (ii) common aliases (np, pd), and (iii) lightweight semantic
preferences (e.g., requests.get for retrieval). The KB is versioned
with the library’s __version__ field to ensure reproducibility.
2.3
Deterministic Validation
The Deterministic Validation(Fig. 1- 4 ) layer validates each ex-
tracted function call against the populated KB. Issues are flagged
in three categories:
(1) Unknown API: The callee (e.g., pd.read_exel) is missing
from the KB. We suggest the closest match by edit distance.
(2) Bare Critical Call: A call (e.g., read_csv) appears without
its required module alias. This is flagged for correction.
(3) Semantic Inconsistency: Syntactically valid code contra-
dicts static cues. We use two cues: (a) Argument Shape, where
a .csv file extension mismatches pd.read_excel, and (b)
Intent Synonyms (e.g., "average" ⇒np.mean).
The validation process runs in 𝑂(𝑛· 𝑚) time, where 𝑛is the
number of call sites and 𝑚is the number of API entries, making it
tractable even for large libraries.
2.4
Automated Correction
Identified issues are resolved through Automated Correction
(Fig. 1- 5 ), which applies localized AST edits. Misspellings are re-
placed with the closest valid symbol from the KB. Contextual mis-
matches are rewritten (e.g. pd.read_excel(’f.csv’) →pd.read_csv(’f.
csv’)). Bare calls trigger the insertion of missing imports with canon-
ical aliases (e.g. import pandas as pd) at the top of the file. The
modified AST is then deterministically unparsed back to source
code.
2.5
Evaluation
Finally, our framework is evaluated in the dataset from §2.6 (Fig. 1-
6 ). We report two primary metrics:


---

Detecting and Correcting Hallucinations in LLM-Generated Code via Deterministic AST Analysis
FORGE ’26, April 12–13, 2026, Rio de Janeiro, Brazil
Figure 1: Hallucination Detection and Correction Framework
(1) Hallucination Detection Accuracy: The detector’s ability
to identify KCHs, treated as a binary classification problem,
and reported using Precision, Recall, and F1-score.
(2) Hallucination Fix Accuracy: For snippets correctly identi-
fied as hallucinated, we measure the "fix accuracy," a binary
score for whether our correction module produces function-
ally correct, runnable code.
The entire detection and correction pipeline is highly efficient;
in our experiments, the end-to-end analysis of all 200 samples
completed in under 0.2 seconds on a single laptop CPU.
2.6
Dataset Construction
We construct our evaluation set of 200 total Python1 samples
by prompting GPT-5 with task-oriented instructions for five target
libraries: numpy, pandas, requests, matplotlib, and json. The dataset
is composed of 161 hallucinated samples and 39 clean (valid)
samples. The 161 hallucinated samples are curated examples of
the KCHs our system targets, falling into three main categories: (i)
Mis-typed API calls (e.g., pd.read_exel), (ii) Missing imports
(e.g., read_csv), and (iii) Contextual mismatches (e.g., using pd.
read_excel to load a .csv file). The introspection-based design of
the framework allows new libraries to be easily added.
3
Results
We evaluated our framework on the curated 200-sample dataset
described in §2.6. The results of this evaluation, divided into our two
main tasks of detection and correction, show significant promise
for our deterministic approach.
Detection Performance. To answer our RQ1, we determine
whether KCHs could be detected deterministically. The overall de-
tection performance was strong, with 90% accuracy and a 93.4%
F1-Score. The most critical finding is the framework’s 100% Pre-
cision, which produced zero false positives and validated all 39
clean samples(Table 1). This perfect precision confirms the relia-
bility of the tool for developers. The overall 87.6% Recall reflects
1The approach generalizes to any language with an AST representation and accessible
reflection APIs, such as Java or TypeScript.
Table 1: Confusion Matrix (Positive = Hallucinated)
Actual
Predicted
Hallucinated
Not Hallucinated
Actual Total
Hallucinated
141 (TP)
20 (FN)
161
Not Hallucinated
0 (FP)
39 (TN)
39
Predicted Total
141
59
200
Table 2: Hallucination Correction Performance (N=161)
Category
Count
Percentage
Total Hallucinated Samples (Identified)
161
100.0%
Successfully Corrected
124
77.0%
Uncorrected
37
23.0%
variance in our detailed analysis (Table 3 and 4). Although detec-
tion was near-perfect for Missing Imports (97.9%) and numpy
(100.0%), it was lowest for Contextual Mismatches (33.3%) and
matplotlib.pyplot (72.2%), which account for our 20 False Nega-
tives.
RQ1 Our framework detected KCHs with 100 % precision, produc-
ing zero false positives and confirming its reliability for developers.
Correction Performance. Our second research question (RQ2)
asked if these detected errors could be automatically corrected. Our
framework achieved a high overall Fix Accuracy of 77.0% (Table 2),
successfully repairing 124 of the 161 hallucinated snippets. This suc-
cess, however, varied significantly by KCH type and library (Tables
3 and 4). The fix rate was highest for Missing Imports (97.9%) but
dropped for Mis-typed APIs (70.0%) and pandas (56.2%), account-
ing for our 37 uncorrected samples. This high-level success still
strongly suggests our deterministic approach is a viable strategy
for handling the majority of common KCHs. The high performance
on Missing Imports and Mis-typed APIs is particularly notable,
as it proves our framework’s ability to resolve the most frequent
and repetitive categories of KCHs.


---

FORGE ’26, April 12–13, 2026, Rio de Janeiro, Brazil
Trovato et al.
RQ2 Our framework successfully and automatically corrected 77.0%
(124 of 161) of all identified hallucinations.
Table 3: Detection and Correction Performance by KCH Type
Hallucination Type
Smpl.
Detect. Rate
Corr. Acc.
Missing Imports
48
97.9%
97.9%
Mis-typed API Calls
110
84.5%
70.0%
Contextual Mismatches
3
33.3%
0.0%
Table 4: Detection and Correction Performance by Library
Library
Detect. Rate
Corr. Acc.
numpy
100.0%
93.8%
pandas
85.1%
56.2%
matplotlib.pyplot
72.2%
65.5%
json
100.0%
81.2%
requests
100.0%
93.9%
4
Discussion and Future Work
Our results strongly support our hypothesis that a deterministic
static framework can effectively resolve KCHs. The 100% preci-
sion in detection is the most critical finding, demonstrating that
our framework operates without the “alert fatigue” of false posi-
tives. This result, combined with a 77.0% automatic fix rate, posi-
tions our framework as a distinct and viable alternative to existing
mitigations. Unlike prevention-based tools [8, 10] that miss these
syntactically-valid semantic errors, or non-deterministic “LLM-in-
the-loop” repair [1, 9], our method provides a reliable fix. Traditional
static analyzers like mypy[5] validate type correctness (e.g., int +
str) using static stubs; they often fail to capture the deep seman-
tic hallucinations inherent to LLMs ( e.g., Does the API function
pd.read_exel actually exist in pandas?). Additionally, it extends
post-processing AST approaches such as “Structural Trimming”
[14] by focusing on resolution for correctness, not just deletion for
safety.
A manual analysis of our 37 failed cases (20 false negatives, 17
failed corrections) reveals clear limitations. The false negatives were
mostly mis-typed (e.g., plt.plotx instead of plt.plot) or bare
calls (e.g., plot(data, data) instead of plt.plot(data, data)),
concentrated in matplotlib.pyplot. The 17 failed corrections,
worst in pandas (56.2% accuracy), exposed a deeper challenge:
our framework often corrected a surface-level typo (e.g., np.arrya
→np.array) while missing the semantic error (intent required
np.mean). This confirms the limits of string matching and the need
for semantic-intent analysis.
We must acknowledge the limitations of this study. Our 200-
sample dataset, while manually curated, is not exhaustive, and
its error distribution may not reflect real-world prevalence. The
framework’s Knowledge Base was limited to five Python libraries,
and our results do not guarantee generalizability. Our framework
currently focuses on single-file, function-level analysis and does
not yet handle multi-module dataflows or deep semantic intent
inference; however, these are promising extensions rather than
fundamental barriers. Finally, our approach deliberately targets
KCHs and does not attempt to solve more complex, multi-line
logical errors, which remain an important open challenge.
Our results, particularly the 100% precision in detection, vali-
date our deterministic static framework as a reliable foundation for
practical developer tools. In the near term, we envision integrating
this system as a lightweight semantic linter within IDEs such as VS
Code. As the LLM generates code, the analyzer would validate each
call in real time, automatically correcting high-confidence halluci-
nations and flagging ambiguous ones for developer review. This
hybrid human-in-the-loop approach could significantly improve
trust and productivity.
To ensure generalizability beyond our initial study, we envision
developing an automated ingestion pipeline. Instead of manual rule-
writing, this pipeline uses structured scrapers and LLM-assisted
parsers to extract AST-compatible signatures directly from official
documentation and source code for any new library. This allows
the KB to evolve continuously, maintaining accuracy across version
updates (e.g., pandas 2.0 →3.0) and supporting large-scale CI/CD
integration.
Together, these directions outline a practical evolution from a
research prototype into an integrated toolchain for trustworthy,
self-correcting code generation.
5
Related Work
Research into LLM-generated code errors has moved from initial
taxonomies that identified bugs like "Hallucinated Objects" [11] to
more specific analyzes of "Knowledge Conflicting Hallucinations"
[6] and definitions to test a novel repair strategy.
Current mitigation techniques fall into three categories, none
of which fully solve the KCH problem. Prevention methods, such
as PICARD [10] or Synchromesh [8], enforce syntactic correctness
during generation but remain blind to semantic fact-conflicting
errors. LLM-based repair uses a feedback loop, which is inherently
non-deterministic [1, 9]. Finally, deletion-based repair like "Struc-
tural Trimming" [14] also uses an AST parser, but its goal is to
prune the hallucinated code for safety. Our approach differs from
all three: we propose a deterministic post-processing parser that
focuses on resolution, using the AST to correct the hallucination,
not just to prevent, delete, or ask for a new fix.
6
Conclusions
This paper presents a deterministic, rule-based framework for de-
tecting and repairing KCHs in LLM-generated code. Our empirical
evaluation demonstrates that a non-probabilistic approach, leverag-
ing AST analysis and a structured Knowledge Base, offers a highly
reliable alternative to LLM-in-the-loop repair. By achieving 100%
precision in detection and an auto-correction rate of 77.0%, we show
that a significant class of semantic errors can be resolved without
the risk of introducing new hallucinations. Ultimately, these results
show that integrating static, deterministic logic into the generative
pipeline is a viable path toward establishing the trust and struc-
tural integrity required for production-level AI-assisted software
engineering.


---

Detecting and Correcting Hallucinations in LLM-Generated Code via Deterministic AST Analysis
FORGE ’26, April 12–13, 2026, Rio de Janeiro, Brazil
References
[1] Scott Blyth, Sherlock A. Licorish, Christoph Treude, and Markus Wagner. 2025.
Static Analysis as a Feedback Loop: Enhancing LLM-Generated Code Beyond
Correctness. arXiv:cs.SE/2508.14419 https://arxiv.org/abs/2508.14419
[2] Dipin Khati, Yijin Liu, David N. Palacio, Yixuan Zhang, and Denys Poshyvanyk.
2025. Mapping the Trust Terrain: LLMs in Software Engineering - Insights and
Perspectives. ACM Trans. Softw. Eng. Methodol. (Oct. 2025). https://doi.org/10.
1145/3771282
[3] SEMERU Lab. 2025. Hallucinations-in-code. https://github.com/WM-SEMERU/
Hallucinations-in-Code. Accessed: 2025-10-19.
[4] Yunseo Lee, John Youngeun Song, Dongsun Kim, Jindae Kim, Mijung Kim, et al.
2025. Hallucination by Code Generation LLMs: Taxonomy, Benchmarks, Mitiga-
tion, and Challenges. arXiv:cs.SE/2504.20799 https://arxiv.org/abs/2504.20799
[5] Jukka Lehtosalo et al. 2025. python/mypy: Optional static typing for Python.
https://github.com/python/mypy
[6] Fang Liu, Yang Liu, Lin Shi, Houkun Huang, Ruifeng Wang, et al. 2024. Ex-
ploring and Evaluating Hallucinations in LLM-Powered Code Generation.
arXiv:cs.SE/2404.00971 https://arxiv.org/abs/2404.00971
[7] Sida Peng, Eirini Kalliamvakou, Peter Cihon, and Mert Demirer. 2023. The
Impact of AI on Developer Productivity: Evidence from GitHub Copilot.
arXiv:cs.SE/2302.06590 https://arxiv.org/abs/2302.06590
[8] Gabriel Poesia, Oleksandr Polozov, Vu Le, Ashish Tiwari, Gustavo Soares, et al.
2022. Synchromesh: Reliable code generation from pre-trained language models.
arXiv:cs.LG/2201.11227 https://arxiv.org/abs/2201.11227
[9] Ravin Ravi, Dylan Bradshaw, Stefano Ruberto, Gunel Jahangirova, and Valerio
Terragni. 2025. LLMLOOP: Improving LLM-Generated Code and Tests through
Automated Iterative Feedback Loops. https://doi.org/10.1109/ICSME64153.2025.
00109
[10] Torsten Scholak, Nathan Schucher, and Dzmitry Bahdanau. 2021. PICARD:
Parsing Incrementally for Constrained Auto-Regressive Decoding from Language
Models. In Proceedings of the 2021 Conference on Empirical Methods in Natural
Language Processing, Marie-Francine Moens, Xuanjing Huang, Lucia Specia, and
Scott Wen-tau Yih (Eds.). Association for Computational Linguistics, Online and
Punta Cana, Dominican Republic, 9895–9901. https://doi.org/10.18653/v1/2021.
emnlp-main.779
[11] Florian Tambon, Arghavan Moradi Dakhel, Amin Nikanjam, Foutse Khomh,
Michel C. Desmarais, et al. 2024. Bugs in Large Language Models Generated Code:
An Empirical Study. arXiv:cs.SE/2403.08937 https://arxiv.org/abs/2403.08937
[12] Zhijie Wang, Zijie Zhou, Da Song, Yuheng Huang, Shengmai Chen, et al. 2025.
Towards Understanding the Characteristics of Code Generation Errors Made by
Large Language Models. arXiv:cs.SE/2406.08731 https://arxiv.org/abs/2406.08731
[13] Hao Wen, Yueheng Zhu, Chao Liu, Xiaoxue Ren, Weiwei Du, et al. 2025. Fixing
Function-Level Code Generation Errors for Foundation Large Language Models.
arXiv:cs.SE/2409.00676 https://arxiv.org/abs/2409.00676
[14] Yage Zhang. 2025. Cutting the Root of Hallucination: Structural Trimming
for Vulnerability Mitigation in Code LLMs. In Second Conference on Language
Modeling. https://openreview.net/forum?id=dU4Y2sNfJ2

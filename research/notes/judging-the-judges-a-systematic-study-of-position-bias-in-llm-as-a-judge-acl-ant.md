---
title: 'Judging the Judges: A Systematic Study of Position Bias in LLM-as-a-Judge
  - ACL Anthology'
id: judging-the-judges-a-systematic-study-of-position-bias-in-llm-as-a-judge-acl-ant
tags:
- ai-software-factory-architecture-58e4cc
- llm-judge-bias
- position-bias
- primary-source
- peer-reviewed
created: '2026-10-12T08:42:03.076022Z'
updated: '2026-10-12T08:44:24.309194Z'
source: https://aclanthology.org/2025.ijcnlp-long.18
source_domain: aclanthology.org
fetched_at: '2026-10-12T08:42:03.073086Z'
fetch_provider: builtin
status: draft
type: note
tier: unknown
content_type: unknown
deprecated: false
summary: 'Primary source (ACL Anthology abstract/metadata page; full PDF available
  at the linked URL but not separately fetched): Shi, Ma, Liang, Diao, Ma, Vosoughi
  (Dartmouth College), ''Judging the Judges: A Systematic Study of Position Bias in
  LLM-as-a-Judge,'' IJCNLP-AACL 2025, pp. 292-314, Mumbai, Dec 2025, DOI 10.18653/v1/2025.ijcnlp-long.18
  -- the exact paper machinelearningmastery.com cites for the ''IJCNLP 2025, 15 judges,
  ~150,000 instances'' position-bias statistic in this batch. Directly load-bearing
  for pillar 1 (rigid evals / adversarial model review). Evaluates position bias (tendency
  to favor a solution based on its position within the prompt, independent of content)
  in both pairwise and list-wise comparison settings, introducing three new metrics:
  repetition stability, position consistency, and preference fairness. Experimental
  scale: 15 LLM judges evaluated across MTBench and DevBench spanning 22 tasks and
  approximately 40 solution-generating models, producing over 150,000 total evaluation
  instances -- the largest-scale systematic position-bias study cited in this research
  batch. Identifies three contributing-factor categories: Judge-Level, Candidate-Level,
  and Task-Level factors. Core findings: position bias is confirmed to not be due
  to random chance and varies significantly across judges and tasks (i.e. it is a
  judge-specific and task-specific property, not a uniform correction factor); position
  bias is only weakly influenced by the length of prompt components but is strongly
  affected by the quality gap between the two compared solutions (meaning position
  bias is most dangerous precisely when candidate solutions are close in quality --
  the exact situation where accurate discrimination matters most for a software factory''s
  code-quality gating). An agreement/disagreement analysis among the 15 judges provides
  insight into the distribution of judging difficulty across the dataset, suggesting
  dataset/benchmark-design improvements are possible to isolate genuinely hard cases
  from bias-induced disagreement.'
doi: 10.18653/v1/2025.ijcnlp-long.18
citation_count: 25
venue: International Joint Conference on Natural Language Processing and Conference
  of the Asia-Pacific Chapter of the Association for Computational Linguistics (IJCNLP-AACL)
is_retracted: false
---

*Suggested by [[llm-evaluation-frameworks-compared-how-to-actually-measure-what-your-model-does]] — cited as the IJCNLP 2025 systematic study of position bias in LLM judges*

Judging the Judges: A Systematic Study of Position Bias in LLM-as-a-Judge - ACL Anthology
Judging the Judges: A Systematic Study of Position Bias in
LLM
-as-a-Judge
Lin Shi
,
Chiyu Ma
,
Wenhua Liang
,
Xingjian Diao
,
Weicheng Ma
,
Soroush Vosoughi
Correct Metadata for
Use this form to create a GitHub issue with structured data describing the correction. You will need a GitHub account.
Once you create that issue, the correction will be reviewed by a staff member.
⚠️ Mobile Users: Submitting this form to create a new issue will only work with github.com, not the GitHub Mobile app.
Important
: The Anthology treat PDFs as authoritative. Please use this form only to correct data
that is out of line with the PDF. See
our corrections
guidelines
if you need to change the PDF.
Title
Adjust the title. Retain tags such as
<fixed-case>.
Authors
Adjust author names and order to match the
PDF.
Add Author
Abstract
Correct abstract if needed. Retain XML formatting tags such as <tex-math>. You may use <b>...</b> for
bold
, <i>...</i> for
italic
, <u>...</u> for
underline
, <sc>...</sc> for
small-caps
, <tt>...<tt> for
typewriter text
, <url>...</url> for URLs, <a href=...> for hyperlinks, and <par/> for paragraph breaks.
Verification against PDF
Ensure that the new title/authors match the snapshot below. (If there
is no snapshot or it is too small, consult
the PDF
.)
Authors concatenated from the text boxes above:
ALL author names match the snapshot above—including
middle initials, hyphens, and accents.
Create GitHub issue for staff review
Abstract
LLM-as-a-Judge has emerged as a promising alternative to human evaluators across various tasks, yet inherent biases—particularly position bias, the tendency to favor solutions based on their position within the prompt—compromise its reliability. This exploratory study evaluates position bias in LLM judges across pairwise and list-wise comparison settings, introducing three metrics: repetition stability, position consistency, and preference fairness. Our experiments, involving 15 LLM judges across MTBench and DevBench with 22 tasks and approximately 40 solution-generating models, result in over 150,000 evaluation instances. We identify Judge-Level, Candidate-Level, and Task-Level factors contributing to bias. The findings confirm that position bias is not due to random chance and varies significantly across judges and tasks. While position bias is weakly influenced by the length of prompt components, it is strongly affected by the quality gap between solutions. Our agreement and disagreement analysis among judges further provides insights into the distribution of judging difficulty across the dataset, and highlights the potential for dataset modifications.
Anthology ID:
2025.ijcnlp-long.18
Volume:
Proceedings of the 14th International Joint Conference on Natural Language Processing and the 4th Conference of the Asia-Pacific Chapter of the Association for Computational Linguistics
Month:
December
Year:
2025
Address:
Mumbai, India
Editors:
Kentaro Inui
,
Sakriani Sakti
,
Haofen Wang
,
Derek F. Wong
,
Pushpak Bhattacharyya
,
Biplab Banerjee
,
Asif Ekbal
,
Tanmoy Chakraborty
,
Dhirendra Pratap Singh
Venues:
IJCNLP
|
AACL
SIG:
Publisher:
The Asian Federation of Natural Language Processing and The Association for Computational Linguistics
Note:
Pages:
292–314
Language:
URL:
https://aclanthology.org/2025.ijcnlp-long.18/
DOI:
10.18653/v1/2025.ijcnlp-long.18
Bibkey:
shi-etal-2025-judging
Cite (ACL):
Lin Shi, Chiyu Ma, Wenhua Liang, Xingjian Diao, Weicheng Ma, and Soroush Vosoughi. 2025.
Judging the Judges: A Systematic Study of Position Bias in LLM-as-a-Judge
. In
Proceedings of the 14th International Joint Conference on Natural Language Processing and the 4th Conference of the Asia-Pacific Chapter of the Association for Computational Linguistics
, pages 292–314, Mumbai, India. The Asian Federation of Natural Language Processing and The Association for Computational Linguistics.
Cite (Informal):
Judging the Judges: A Systematic Study of Position Bias in LLM-as-a-Judge
(Shi et al., IJCNLP-AACL 2025)
Copy Citation:
BibTeX
Markdown
MODS XML
Endnote
More
options…
PDF:
https://aclanthology.org/2025.ijcnlp-long.18.pdf
PDF
Cite
Search
Fix data
Export citation
BibTeX
MODS XML
Endnote
Preformatted
```
@inproceedings{shi-etal-2025-judging,
    title = "Judging the Judges: A Systematic Study of Position Bias in {LLM}-as-a-Judge",
    author = "Shi, Lin  and
      Ma, Chiyu  and
      Liang, Wenhua  and
      Diao, Xingjian  and
      Ma, Weicheng  and
      Vosoughi, Soroush",
    editor = "Inui, Kentaro  and
      Sakti, Sakriani  and
      Wang, Haofen  and
      Wong, Derek F.  and
      Bhattacharyya, Pushpak  and
      Banerjee, Biplab  and
      Ekbal, Asif  and
      Chakraborty, Tanmoy  and
      Singh, Dhirendra Pratap",
    booktitle = "Proceedings of the 14th International Joint Conference on Natural Language Processing and the 4th Conference of the Asia-Pacific Chapter of the Association for Computational Linguistics",
    month = dec,
    year = "2025",
    address = "Mumbai, India",
    publisher = "The Asian Federation of Natural Language Processing and The Association for Computational Linguistics",
    url = "https://aclanthology.org/2025.ijcnlp-long.18/",
    doi = "10.18653/v1/2025.ijcnlp-long.18",
    pages = "292--314",
    ISBN = "979-8-89176-298-5",
    abstract = "LLM-as-a-Judge has emerged as a promising alternative to human evaluators across various tasks, yet inherent biases{---}particularly position bias, the tendency to favor solutions based on their position within the prompt{---}compromise its reliability. This exploratory study evaluates position bias in LLM judges across pairwise and list-wise comparison settings, introducing three metrics: repetition stability, position consistency, and preference fairness. Our experiments, involving 15 LLM judges across MTBench and DevBench with 22 tasks and approximately 40 solution-generating models, result in over 150,000 evaluation instances. We identify Judge-Level, Candidate-Level, and Task-Level factors contributing to bias. The findings confirm that position bias is not due to random chance and varies significantly across judges and tasks. While position bias is weakly influenced by the length of prompt components, it is strongly affected by the quality gap between solutions. Our agreement and disagreement analysis among judges further provides insights into the distribution of judging difficulty across the dataset, and highlights the potential for dataset modifications."
}
```
Download as
File
Copy to Clipboard
```
<?xml version="1.0" encoding="UTF-8"?>
<modsCollection xmlns="http://www.loc.gov/mods/v3">
<mods ID="shi-etal-2025-judging">
    <titleInfo>
        <title>Judging the Judges: A Systematic Study of Position Bias in LLM-as-a-Judge</title>
    </titleInfo>
    <name type="personal">
        <namePart type="given">Lin</namePart>
        <namePart type="family">Shi</namePart>
        <role>
            <roleTerm authority="marcrelator" type="text">author</roleTerm>
        </role>
    </name>
    <name type="personal">
        <namePart type="given">Chiyu</namePart>
        <namePart type="family">Ma</namePart>
        <role>
            <roleTerm authority="marcrelator" type="text">author</roleTerm>
        </role>
    </name>
    <name type="personal">
        <namePart type="given">Wenhua</namePart>
        <namePart type="family">Liang</namePart>
        <role>
            <roleTerm authority="marcrelator" type="text">author</roleTerm>
        </role>
    </name>
    <name type="personal">
        <namePart type="given">Xingjian</namePart>
        <namePart type="family">Diao</namePart>
        <role>
            <roleTerm authority="marcrelator" type="text">author</roleTerm>
        </role>
    </name>
    <name type="personal">
        <namePart type="given">Weicheng</namePart>
        <namePart type="family">Ma</namePart>
        <role>
            <roleTerm authority="marcrelator" type="text">author</roleTerm>
        </role>
    </name>
    <name type="personal">
        <namePart type="given">Soroush</namePart>
        <namePart type="family">Vosoughi</namePart>
        <role>
            <roleTerm authority="marcrelator" type="text">author</roleTerm>
        </role>
    </name>
    <originInfo>
        <dateIssued>2025-12</dateIssued>
    </originInfo>
    <typeOfResource>text</typeOfResource>
    <relatedItem type="host">
        <titleInfo>
            <title>Proceedings of the 14th International Joint Conference on Natural Language Processing and the 4th Conference of the Asia-Pacific Chapter of the Association for Computational Linguistics</title>
        </titleInfo>
        <name type="personal">
            <namePart type="given">Kentaro</namePart>
            <namePart type="family">Inui</namePart>
            <role>
                <roleTerm authority="marcrelator" type="text">editor</roleTerm>
            </role>
        </name>
        <name type="personal">
            <namePart type="given">Sakriani</namePart>
            <namePart type="family">Sakti</namePart>
            <role>
                <roleTerm authority="marcrelator" type="text">editor</roleTerm>
            </role>
        </name>
        <name type="personal">
            <namePart type="given">Haofen</namePart>
            <namePart type="family">Wang</namePart>
            <role>
                <roleTerm authority="marcrelator" type="text">editor</roleTerm>
            </role>
        </name>
        <name type="personal">
            <namePart type="given">Derek</namePart>
            <namePart type="given">F</namePart>
            <namePart type="family">Wong</namePart>
            <role>
                <roleTerm authority="marcrelator" type="text">editor</roleTerm>
            </role>
        </name>
        <name type="personal">
            <namePart type="given">Pushpak</namePart>
            <namePart type="family">Bhattacharyya</namePart>
            <role>
                <roleTerm authority="marcrelator" type="text">editor</roleTerm>
            </role>
        </name>
        <name type="personal">
            <namePart type="given">Biplab</namePart>
            <namePart type="family">Banerjee</namePart>
            <role>
                <roleTerm authority="marcrelator" type="text">editor</roleTerm>
            </role>
        </name>
        <name type="personal">
            <namePart type="given">Asif</namePart>
            <namePart type="family">Ekbal</namePart>
            <role>
                <roleTerm authority="marcrelator" type="text">editor</roleTerm>
            </role>
        </name>
        <name type="personal">
            <namePart type="given">Tanmoy</namePart>
            <namePart type="family">Chakraborty</namePart>
            <role>
                <roleTerm authority="marcrelator" type="text">editor</roleTerm>
            </role>
        </name>
        <name type="personal">
            <namePart type="given">Dhirendra</namePart>
            <namePart type="given">Pratap</namePart>
            <namePart type="family">Singh</namePart>
            <role>
                <roleTerm authority="marcrelator" type="text">editor</roleTerm>
            </role>
        </name>
        <originInfo>
            <publisher>The Asian Federation of Natural Language Processing and The Association for Computational Linguistics</publisher>
            <place>
                <placeTerm type="text">Mumbai, India</placeTerm>
            </place>
        </originInfo>
        <genre authority="marcgt">conference publication</genre>
        <identifier type="isbn">979-8-89176-298-5</identifier>
    </relatedItem>
    <abstract>LLM-as-a-Judge has emerged as a promising alternative to human evaluators across various tasks, yet inherent biases—particularly position bias, the tendency to favor solutions based on their position within the prompt—compromise its reliability. This exploratory study evaluates position bias in LLM judges across pairwise and list-wise comparison settings, introducing three metrics: repetition stability, position consistency, and preference fairness. Our experiments, involving 15 LLM judges across MTBench and DevBench with 22 tasks and approximately 40 solution-generating models, result in over 150,000 evaluation instances. We identify Judge-Level, Candidate-Level, and Task-Level factors contributing to bias. The findings confirm that position bias is not due to random chance and varies significantly across judges and tasks. While position bias is weakly influenced by the length of prompt components, it is strongly affected by the quality gap between solutions. Our agreement and disagreement analysis among judges further provides insights into the distribution of judging difficulty across the dataset, and highlights the potential for dataset modifications.</abstract>
    <identifier type="citekey">shi-etal-2025-judging</identifier>
    <identifier type="doi">10.18653/v1/2025.ijcnlp-long.18</identifier>
    <location>
        <url>https://aclanthology.org/2025.ijcnlp-long.18/</url>
    </location>
    <part>
        <date>2025-12</date>
        <extent unit="page">
            <start>292</start>
            <end>314</end>
        </extent>
    </part>
</mods>
</modsCollection>
```
Download as
File
Copy to Clipboard
```
%0 Conference Proceedings
%T Judging the Judges: A Systematic Study of Position Bias in LLM-as-a-Judge
%A Shi, Lin
%A Ma, Chiyu
%A Liang, Wenhua
%A Diao, Xingjian
%A Ma, Weicheng
%A Vosoughi, Soroush
%Y Inui, Kentaro
%Y Sakti, Sakriani
%Y Wang, Haofen
%Y Wong, Derek F.
%Y Bhattacharyya, Pushpak
%Y Banerjee, Biplab
%Y Ekbal, Asif
%Y Chakraborty, Tanmoy
%Y Singh, Dhirendra Pratap
%S Proceedings of the 14th International Joint Conference on Natural Language Processing and the 4th Conference of the Asia-Pacific Chapter of the Association for Computational Linguistics
%D 2025
%8 December
%I The Asian Federation of Natural Language Processing and The Association for Computational Linguistics
%C Mumbai, India
%@ 979-8-89176-298-5
%F shi-etal-2025-judging
%X LLM-as-a-Judge has emerged as a promising alternative to human evaluators across various tasks, yet inherent biases—particularly position bias, the tendency to favor solutions based on their position within the prompt—compromise its reliability. This exploratory study evaluates position bias in LLM judges across pairwise and list-wise comparison settings, introducing three metrics: repetition stability, position consistency, and preference fairness. Our experiments, involving 15 LLM judges across MTBench and DevBench with 22 tasks and approximately 40 solution-generating models, result in over 150,000 evaluation instances. We identify Judge-Level, Candidate-Level, and Task-Level factors contributing to bias. The findings confirm that position bias is not due to random chance and varies significantly across judges and tasks. While position bias is weakly influenced by the length of prompt components, it is strongly affected by the quality gap between solutions. Our agreement and disagreement analysis among judges further provides insights into the distribution of judging difficulty across the dataset, and highlights the potential for dataset modifications.
%R 10.18653/v1/2025.ijcnlp-long.18
%U https://aclanthology.org/2025.ijcnlp-long.18/
%U https://doi.org/10.18653/v1/2025.ijcnlp-long.18
%P 292-314
```
Download as
File
Copy to Clipboard
Markdown (Informal)
[Judging the Judges: A Systematic Study of Position Bias in LLM-as-a-Judge](https://aclanthology.org/2025.ijcnlp-long.18/) (Shi et al., IJCNLP-AACL 2025)
Judging the Judges: A Systematic Study of Position Bias in LLM-as-a-Judge
(Shi et al., IJCNLP-AACL 2025)
ACL
Lin Shi, Chiyu Ma, Wenhua Liang, Xingjian Diao, Weicheng Ma, and Soroush Vosoughi. 2025.
Judging the Judges: A Systematic Study of Position Bias in LLM-as-a-Judge
. In
Proceedings of the 14th International Joint Conference on Natural Language Processing and the 4th Conference of the Asia-Pacific Chapter of the Association for Computational Linguistics
, pages 292–314, Mumbai, India. The Asian Federation of Natural Language Processing and The Association for Computational Linguistics.
Copy Markdown to
Clipboard
Copy ACL to
Clipboard
---
title: 'Agent Skill Evolution: How Revisions Affect Coding Agents'
id: agent-skill-evolution-how-revisions-affect-coding-agents
tags:
- ai-software-factory-architecture-58e4cc
- agent-skills
- evals
- empirical-study
- cost-optimization
created: '2026-10-12T08:27:31.891147Z'
updated: '2026-10-12T08:30:09.985142Z'
source: https://arxiv.org/html/2610.04832v1
source_domain: arxiv.org
fetched_at: '2026-10-12T08:27:31.889048Z'
fetch_provider: builtin
status: draft
type: note
tier: institutional
content_type: paper
deprecated: false
summary: 'Large-scale empirical study (arXiv 2610.04832v1, Oct 2026, Univ. of Arizona/CSU
  Long Beach/NTU/CAS/Wuhan Univ./ECU) of how Agent Skill (SKILL.md) revisions causally
  affect coding-agent behavior, cost, and correctness. Reconstructed revision histories
  for 3,159 Skills across 856 repositories from the SkillMD-138K public snapshot (138,133
  SKILL.md files, 20,556 repos), built 396 probes from real added/deleted directives,
  and ran them on 21 models (16 open-weight 3.8B-32B plus 5 closed: Claude Sonnet
  3.5/3.7/4.5, Haiku 4.5, GPT-5.5) and on 4 agents in a network-less sandbox using
  the mini-SWE-agent scaffold.


  Key findings directly bearing on the Skills/SOP and rigid-evals pillars: (1) 55.0%
  of revisions add/delete a MUST/NEVER constraint, conditional rule, or numbered step
  — most Skill maintenance is rule-level, not prose. (2) An added rule (naming a concrete
  command/path/identifier) raises single-answer compliance by +0.41 on average across
  16 open models (e.g. Qwen 2.5-7B: 0.253->0.649, delta +0.395); the gain is concentrated
  in rules naming a token the old Skill never mentioned (+0.51 to +0.66) versus tokens
  already present (+0.08). Unrelated text of equal length added no effect, confirming
  the rule content itself — not length or noise — drives compliance. (3) In the sandbox,
  the four agents'' required-action rate rose by +0.23 on average (Devstral-Small
  gained most, +0.36; Claude Sonnet 4.5 +0.19 from a 0.62 baseline), and blind-human-judged
  final correctness rose +0.10 on average (+0.13 for Qwen models, +0.06 inconclusive
  for Sonnet 4.5). (4) Deleting a rule lowers compliance by 0.27-0.33, about three-quarters
  the magnitude of adding one; deleting a ''replaced'' rule costs -0.58 vs -0.12 for
  deleting a duplicate. (5) Real-world progressive-disclosure (on-demand Skill loading,
  as used by Anthropic''s actual Skills architecture) only preserves about 51% of
  the agent action-gain on average (38% for open models) versus having the Skill preloaded
  — meaningful evidence that progressive disclosure trades effectiveness for token
  savings. (6) Cost: a revision adds 17-27% more input tokens per request but shortens
  the output (model told which command to run hedges less), and inside an agent episode
  the paper could not detect added marginal cost from a revision, while loading the
  Skill body AT ALL (carrying cost, old vs ''none'') raises episode tokens by 37-57%,
  and on average 50%. One rule-model pair in five (20%) adds tokens with zero detected
  compliance gain — direct empirical evidence of wasted token spend from over-specified
  Skills, relevant to the Cost & Resource Optimization pillar. (7) Skill revisions
  couple with harness-configuration changes (CLAUDE.md +2.1pp, AGENTS.md +2.0pp, Cursor/Codex
  configs +1.9pp) more often than size-matched non-Skill commits (23.0% vs 18.5%),
  and creating a new Skill couples even more tightly (36.7% vs 21.8%) — evidence that
  Skills and harness config co-evolve and should be versioned/reviewed together. Model-related
  motives are almost never documented in commit messages (only 0.4% name a model version).
  LONG/DENSE SOURCE (13,591 words, heavy statistical apparatus) — flagging for potential
  source-analyst delegation given the density of numeric findings.'
---

Agent Skill Evolution: How Revisions Affect Coding Agents
Title:
Content selection saved. Describe the issue below:
Description:
arXiv is now an independent nonprofit!
Learn more
×
License: arXiv.org perpetual non-exclusive license
arXiv:2610.04832v1 [cs.SE] 04 Oct 2026
Agent Skill Evolution: How Revisions Affect Coding Agents
CCS:
Software and its engineering Software evolution
CCS:
Software and its engineering Empirical software validation
CCS:
Computing methodologies Natural language processing
Jiajie Wang
Affiliation:
The University of Arizona
,
USA
,
Yutong Zhao
Affiliation:
California State University, Long Beach
,
USA
,
Tianlin Li
Affiliation:
Nanyang Technological University
,
Singapore
,
Huashan Chen
Affiliation:
Institute of Information Engineering, Chinese Academy of Science
,
China
,
Jinfu Chen
Affiliation:
Wuhan University
,
China
,
Kebin Peng
Affiliation:
East Carolina University
,
USA
and
Sen He
Affiliation:
The University of Arizona
,
USA
Abstract.
Agent Skills, the
SKILL.md
files that tell an LLM coding agent how a project works, are revised like code, yet what a revision
does to the agent is unknown. From 2,608 first/last revision pairs of 3,159 Skills, we characterize how Skills evolve and how they
change together with the configuration of the agent’s harness. We then focus on
rule changes
, revisions that add or remove a rule we
can check automatically, such as “run
allium check
”. We measure their effect on 21 models in single answers and on four agents in
a sandbox, and their cost on 20 of these models and the four agents. Most revisions (55%) change a rule or procedure, and commits that revise a Skill change harness files such as
CLAUDE.md
more often than other commits of the same size. Across 16 open-weight models, an added rule raises compliance in a single
answer by +0.41 on average. Across the four agents, the rate at which the agent takes the required action rises by +0.23 on
average (+0.16 to +0.36), and for the three agents that blind judges assessed, final correctness rises by +0.10 on average
(+0.06 to +0.14). The gain comes mainly from rules
that name a command or path the old Skill did not mention. Real tools load a Skill’s body only when the agent decides it needs it. In
that setting the four agents keep about half of the action gain on average (51%), and the three open models about
38%. A revision adds 18–19% input tokens to a single answer and no detectable cost to an agent episode, while loading
a Skill’s body raises the tokens of an episode by 50% on average.
Keywords:
LLM agents, agent skills, software maintenance, empirical study
1.
Introduction
In the agent literature, a
skill
is a reusable procedure that an agent retrieves and applies, stored as code, as natural-language
instructions, or as a packaged directory
(
Wang et al., 2024
;
Li, 2026
)
. An
Agent Skill
is the packaged form introduced by
Anthropic and released as an open standard: a folder whose
SKILL.md
file starts with a name and a description in YAML
frontmatter
, a short header block, followed by Markdown instructions and optionally by scripts and reference
files
(
Zhang et al., 2025
;
Agent Skills, 2026a
)
. A Skill reaches the model through a
harness
, the software layer around a
language model that supplies its tools, manages the context the model sees, and runs the loop that chains its actions. Model and harness
together form the agent
(
Anthropic, 2026b
;
Grace et al., 2026
)
. The repository files that configure a harness, such as
CLAUDE.md
,
AGENTS.md
, settings, hooks and MCP configuration, we call
harness configuration
. Harnesses load Skills
in stages, by
progressive disclosure
. Each Skill’s name and description sit in the system prompt, the body enters the context when
the Skill is activated, and bundled files are read or run only when needed
(
Anthropic, 2026a
;
Agent Skills, 2026b
)
. Public
registries list well over a hundred thousand Skills, and evaluations disagree. Curated Skills raise pass rates on one
benchmark
(
Li et al., 2026
)
but barely on another
(
Han et al., 2026
)
, Skills distilled from agent trajectories add only a few
points over no Skill
(
Jiang et al., 2026
)
, and the token overhead can be severe
(
Dong et al., 2026
)
.
Most of that work evaluates a Skill at one version
(
Li et al., 2026
;
Han et al., 2026
;
Liu et al., 2026
;
Zhou et al., 2026
)
. Yet Skills are files in a repository, and maintainers revise them like other files.
They change commands, delete stale sections and add checklists. Among the Skills we study, the first and last observed versions are a
median of two revision commits apart, and 60% of revised Skills end longer than they started. Every edit changes what the agent is
told and how many tokens it reads.
Yet the evolution of Agent Skills and its effects on agents remain understudied.
To address this gap, we conduct, to the best of our knowledge, the first large-scale empirical study of Agent Skill evolution and its
effects on agents. We study the rules that maintainers added or removed in real revisions, and we compare the old and new Skill on the same
request and model. We use
revision
for the cumulative change between the first and the
last observed version of a Skill, which may span several
revision commits
. We study
rule changes
, revisions that add or
delete a concrete, mechanically checkable rule that names a command, path or identifier. We call the line that states such a rule a
directive
. We aim to exclude rewording of an existing rule; line-level extraction still admits some restated rules, which
§
5.1.3
measures separately. Models run without thinking modes, and single-step prompts are capped
at 8,192 tokens of usable input (§
3.3
, §
3.4
). Each probe is a request built so that the rule applies, and
we measure what a revision does when its rule is needed. We ask three research questions. RQ1 comes first because it shows that most revisions
change a rule or procedure and that Skills change together with harness configuration. RQ2 and RQ3 then measure what a narrower class of
rule changes does, rules that name a command, path or identifier.
RQ1: How do Agent Skills co-evolve with their harness?
Revised Skills change often, and most revisions
change a rule or procedure. Executable references increase in a small fraction of Skills. Matched by repository and commit-size band,
commits that revise a Skill change harness configuration more often than other commits, chiefly
CLAUDE.md
,
AGENTS.md
and
agent and command definitions, and commits that create a Skill do so more often still. Few revisions document a model-related motive. Over
a third of revision commits carry an AI-agent or bot signature, a share close to that of other commits.
RQ2: How does Skill evolution affect task effectiveness?
An added rule raises compliance in single answers on all 21 models, and
stating the rule adds compliance beyond naming its token. The gain comes mainly from rules that name a command or path the old Skill did
not mention. Seeing that token elsewhere in the context or the repository does not replace the rule. In a sandbox, agents take
the required action more often, even when every file the old Skill names still exists, and blind judges see modestly higher final
correctness. Older and newer model generations gain similarly. Effects are smaller in
the agent settings we test. With on-demand loading the four agents keep about 51% of the action gain on average. Claude Sonnet 4.5’s
gain is +0.19 under both loading modes, and three open models keep about 38%.
RQ3: How does Skill evolution affect cost?
A revision lengthens the prompt but shortens the answer. Inside an agent episode we
could not detect extra cost from the revision, while loading the Skill body at all adds 37 to 57% more tokens. One
rule–model pair in five adds tokens without a detectable gain.
This work makes the following contributions:
•
We conduct a large-scale empirical study of Agent Skill evolution: we reconstruct the revision histories of 3,159 Skills in
856 repositories and characterize how their content, executable references and harness configuration change, and who writes the
revisions.
•
We measure the effects of Skill evolution on effectiveness on 21 models (16 open-weight and five closed) and on cost on 20 of
them, plus an open coding-agent model, from single-step answers to multi-step agents in a sandbox, with control experiments and blind human judgement of
outcomes.
•
We make available a dataset of 3,159 Agent Skills with their revision histories, 396 probes derived from real revisions, an
executable benchmark of 80 tasks and the human judgements, together with a replication package (Data Availability).
2.
Related Work
2.1.
Studies on Agent Skills
Several recent studies examine Skills directly. Dong et al.
(
Dong et al., 2026
)
attribute agent failures to specific loaded Skills
with a differential design and trace most context-overhead failures to mandatory Skill-body text. Jiang et al.
(
Jiang et al., 2026
)
find that a distilled
SKILL.md
beats workflow memory built from the same trajectories by six points and that Skills act mostly as
procedural anchors
(65.7% of cases) rather than as
knowledge injection
(4.5%). Wang et al.
(
Wang et al., 2026
)
show that coordinated wording in a
prompt and a Skill description can steer which Skill is selected, and Zhou et al.
(
Zhou et al., 2026
)
pair with- and without-Skill
traces on 49 SWE-Skills-Bench tasks and find that Skills reshape behaviour while the pass rate barely moves. Yang and Ding
(
Yang and Ding, 2026
)
place
SKILL.md
in the prompt as the controlled variable with an irrelevant-Skill control of approximately equal byte length (
±
\pm
5%), and Gao et al.
(
Gao et al., 2026
)
find that over 60% of Skill body text is not actionable. Zhang et al.
(
Zhang et al., 2026
)
find reuse defects in most of 138,133
public
SKILL.md
files. These studies compare a Skill with its absence, or analyse it, at one version. Work on skill libraries
studies how an agent adds and refines its own skills
(
Wang et al., 2024
;
Li, 2026
)
.
2.2.
Studies on Agent Harnesses
Chatlatanagulchai et al.
(
Chatlatanagulchai et al., 2026
)
studied 2,303 agent context files in 1,925 repositories and found that
they evolve like configuration code, through frequent small additions. Mohsenimofidi et al.
(
Mohsenimofidi et al., 2026
)
and Jiang and
Nam
(
Jiang and Nam, 2026
)
characterized how
AGENTS.md
files and Cursor rules present project context, and Galster
et al.
(
Galster et al., 2026
)
found that context files dominate agent configuration in 2,853 repositories while Skills remain rare
and mostly hold static instructions rather than executable scripts. Hereiz et al.
(
Hereiz et al., 2026
)
found that instruction files and scripts inside plugin Skills co-evolve, and prompts embedded in
code change primarily through additions and modifications
(
Tafreshipour et al., 2025
)
. Earlier, infrastructure-as-code files were found to co-evolve with the
source code they configure
(
Jiang and Adams, 2015
)
and to exhibit configuration smells
(
Sharma et al., 2016
)
, and we ask the same
question of Skills and harness configuration. On effect,
Gloaguen et al.
(
Gloaguen et al., 2026
)
found that context files do not generally raise task success but add over 20% inference cost,
and McMillan
(
McMillan, 2026
)
detected no effect of file structure on adherence. Ben Sghaier et al.
(
Ben Sghaier et al., 2026
)
held the model fixed across 35 harness
releases and found that tokens per task rose by over 70% with no significant gain in resolve rate. Most prior work compares a configuration
file with its absence or treats the harness as one unit; we measure what one revision of a Skill changes in an agent’s effectiveness and
cost.
2.3.
Studies on Agentic Cost
Kapoor et al.
(
Kapoor et al., 2025
)
argued that agent evaluations must be cost-controlled, and Erol et al.
(
Erol et al., 2026
)
formalized cost-of-pass, the expected cost of one correct solution. Input tokens drive the cost of SWE-bench trajectories, which vary up to 30-fold
on the same task
(
Bai et al., 2026
)
and snowball over turns
(
Fan et al., 2025
)
, and several studies cut cost by shortening
trajectories
(
Lindenbauer et al., 2025
;
Xiao et al., 2026
;
Gao and Peng, 2026
)
.
3.
Study Design
Figure
1
shows the pipeline, and Figure
2
follows one revision through it. We rebuild the revision history
of each sampled
SKILL.md
file and pair its first and last versions (§
3.1
). RQ1 characterizes these pairs, the
commits behind them and the harness files changed with them. From each pair we extract the directives a maintainer added or deleted and
turn each into a
probe
, a user request that needs the directive, with a string check for it (§
3.2
). We present every
probe with the Skill’s name and description alone and with the old or the new body, to 21 models in single answers and to agents that act
over many steps, among them four agents in a sandbox (§
3.3
). We then score effectiveness at three levels and count tokens
and time (§
3.4
). RQ2 compares effectiveness and RQ3 cost between the old and the new version.
Figure 1.
Study design.
Flow diagram of the study. The SkillMD-138K snapshot leads to revision histories, then to added and deleted directives,
then to probes, which are run on the models under the none, old and new conditions. Revision histories feed RQ1; probes and model runs feed
RQ2 on effectiveness and RQ3 on cost.
3.1.
Dataset Construction
We start from SkillMD-138K
(
Zhang, 2026
;
Zhang et al., 2026
)
, a public snapshot of 138,133
SKILL.md
files from 20,556
repositories, found through a Skill registry (by our count, 90% of files), GitHub code search
(
GitHub, 2026
)
(5%) and direct clones (4%; 1% lack a
recorded channel). The snapshot has no history, so we rebuild it. We draw 1,500 repositories in star-stratified batches
(7,959
SKILL.md
files, at most 40 per repository), make a blobless clone of each within a fixed time budget, and follow
every
SKILL.md
through
git log --follow
, so renames and moves are tracked. A
version
is the file’s content at one
commit that touches it, so a Skill with
v
v
versions has
v
−
1
v-1
revision commits after the commit that creates it. We keep files with at
least two versions, 40% of the sampled files. Files in repositories we could not clone within the budget count as unrevised, so
this share is a lower bound.
For the version-pair analyses we keep those whose first and last texts differ (Table
1
). A first/last pair spans a median
of three versions, that is, two revision commits (five versions behind our probes).
Table 1.
Dataset construction at a glance (counts in parentheses: repositories unless stated), with every hand-labelled sample used in the paper.
Stage
Count
SkillMD-138K snapshot:
SKILL.md
files
138,133 (20,556)
Sampled repositories:
SKILL.md
files (at most 40 each)
7,959 (1,500)
Skills with at least two versions
3,159 (856)
first/last pairs whose text differs
2,608
revision commits
6,957
High-star set: first/last pairs (no 40-file cap)
4,726 (146)
Lines added across the pairs
143,196
imperatives / naming a backticked token
12,564 / 4,041
directive candidates (at most three per Skill)
2,300
added-directive probes passing the filter
396 (200)
main set, all 16 open-weight models
300
Deleted-directive / dilution probes
245 / 1,349
Executable sandbox tasks
80 (57)
Human labels: responses (two annotators, adjudication)
240
commits (intent) / deleted directives (reason)
120 / 64
later commit–rule pairs (need) / added lines (classifier / extractor)
100 / 200 / 250
sandbox artifacts (two annotators per round, adjudication)
144 + 336
Skill selection criteria
Repositories whose Skills have a revision history are more popular than the snapshot as a whole (Table S4; median 30
stars against 0). No repository in the main set has more than 375 stars, because larger clones exceeded our time
budget, so we cloned a separate
high-star set
with a longer budget. It holds 146 repositories above 1,000 stars (median
4,872), sampled in three star bands from the same snapshot, on which we repeat the RQ1 description and the central RQ2 comparison.
Commit labels
Three LLMs of different families or sizes (Qwen 3.5-4B, phi-4, Qwen 3.5-27B) label each of the 6,957 revision commits with
one of nine intent categories, and we keep the majority label. An annotator labelled a sample of 120 commits by hand. The majority
label agrees with the annotator at
κ
=
0.61
\kappa=0.61
(single LLMs 0.43–0.60), so we report shares from the annotator’s
labels. Agent
authorship is read from commit metadata, namely co-author trailers, tool footers and bot accounts.
3.2.
Probe Construction
From a revision to a probe
Figure
2
follows one revision through four steps.
(1) Directive.
Our unit of analysis is a directive, a line a maintainer added or deleted that expresses an imperative and names a
concrete token (a command, flag, path or identifier) in backticks. A regular-expression pass selects such lines, at most three per Skill
(Table
1
). In the figure, line 21 of the new version adds “
Must read
:
knowledge/projects/_index.md
”.
(2) Request and check.
An LLM (Qwen 3.5-27B, greedy decoding) writes a realistic user request whose correct handling needs the
directive without mentioning it, and copies from the directive the strings that a compliant answer must contain (here the index path) or
must not contain. A filter keeps a probe if these strings occur verbatim in the directive, are absent from the request, are not generic
and do not contradict each other.
(3) Conditions.
The probe is presented under
none
,
old
and
new
(§
3.4
). The
estimand
, the quantity we estimate, is the new-minus-old difference on the same probe.
(4) Grading.
A response complies if its code spans (the whole response if it has none) contain every required string,
case-insensitively, and no forbidden string outside a negated context, a verifiable-instruction test in the sense of IFEval
(
Zhou et al., 2023
)
.
In the example, no model complies under none or with the old version, and 43 of 80 samples comply with the new one.
Old
: first version, commit
25c8fe4
(Jan 2026)
New
: last of 4 versions, commit
e77d641
(Mar 2026)
2
~
name: NoteOrganizer
2
~
name: note-organizer
23
-
2. **Consult Rules**: Read the rule files located in `
Ag
.cursor/rules/
`
[...]
26
-
- `
Ag
programming_notes.mdc
`: For notes about coding, algorithms, etc.
20
~
2. **Load Project Memory**:
[...]
21
+
- **Must read**: `
Ag
knowledge/projects/_index.md
`(project index)
←
\leftarrow
probe
24
~
> **Important**: Must use
Ag
Read
tool
[...]
39
~
7. **Update Changelog**: Add an entry to `
Ag
knowledge/logs/changelog.md
`with timestamp, operation type, and description in Chinese.
47
~
9. **Update Changelog**: Add entry to `
Ag
knowledge/logs/_changelog.md
`following the changelog skill format.
Ag
+
added directive
Ag
-
deleted directive
Ag
~
other: reworded, restructured, prose
Ag
executable surface: path, command, tool, loading field
Request
(generated; never mentions the directive)
I need to save a new note about the Q4 marketing strategy. Please categorize it into the correct project folder based on our current project structure.
Check
response must contain
knowledge/projects/_index.md
Result
compliant samples, none / old / new:
Qwen 3.5-9B 0/5, 0/5, 5/5;  all 16 models 0/80, 0/80, 43/80
Figure 2.
An illustrative revision of a real Skill (note-organizer in Kang-chen/kownledgeBase) and the probe built from its added directive on line 21. Grading is a literal string test.
Side-by-side excerpt of the first and last version of a real SKILL.md file, with added, deleted and reworded lines marked, followed by the generated user request, the string the response must contain, and how many sampled answers comply under each condition.
Probe types and population
Besides the 396 added-directive probes (200 repositories) we build 245
deleted-directive
probes, with the two
versions in reverse order, and 1,349
dilution
probes around a directive line identical in both versions, which test whether
the rest of a revision changes compliance with a rule it leaves alone. Retained directives are less often prohibitions (22% against 32%), conditional rules
(25% against 32%) or permission guardrails than rejected ones (Table S5). The Skills behind the probes are
revised more than the average Skill (median net growth +123 against +18 words, 4 against 2 revision
commits; Table S6). Every effect is conditional on requests that need the rule.
Grader validation
A string check can pass a response that names the right identifier but uses it wrongly, and fail one that follows the rule in other words.
Two annotators, blind to model and condition, independently judged a stratified sample of 240 responses (Table S2) on two
questions. Does the response follow the directive, and does it complete the task? Where both gave a yes or no, they agree at
κ
=
0.86
\kappa=0.86
on the first question (197 responses) and
κ
=
0.72
\kappa=0.72
on the second (163). Against the directive-following
labels the grader has precision 0.97–0.98 and recall 0.73 and 0.82 (annotators 1 and 2), and on the 120
added-directive responses its recall falls from 0.79 under the old version to 0.65 under the new one (annotator 1). Re-weighted
from this stratified sample to all main-set answers, both annotators’ labels give a larger gain in directive following (about +0.52)
than the string check gives on the same answers (+0.41). The adjudicator resolved the 100 responses without an agreed task-correctness label
(23 conflicting labels, 77 marked unclear by at least one annotator). This sample validates the Level-1 measure, and the primary
outcome evidence is the blind human judgement of agent artifacts in the sandbox (Table
5
). Three software engineers (two with
master’s-level and one with doctoral-level training) labelled this sample and the first sandbox round, two independently and one
adjudicating. Two further annotators, a machine-learning researcher and a doctoral-level researcher, labelled the second sandbox round.
No annotator or adjudicator in this study is an author of this paper or of the studied Skills. Claude Sonnet 4.5 (
claude-sonnet-4-5-20250929
, temperature 0) assigns
each deleted directive one of six deletion reasons. An annotator re-labelled 64 of them, and we report the hand-checked labels
(§
5.1.4
).
3.3.
Model and Agent Settings
Models.
We select open-weight and proprietary models that cover several vendors, sizes and release dates. The 16 open-weight
instruction-tuned models span 3.8B to 32B parameters and six families (Llama, Mistral, OLMo, Phi, Qwen, and Gemma). All but one belong to six
generation
ladders
. Each ladder holds successive releases of one family, so a comparison of generations never mixes in a change of vendor. This is
why we keep older releases such as Mistral 7B-v0.2. Gemma is evaluated only for breadth. Small open models let us run every model on every probe locally, and open
weights with fixed decoding settings make the runs reproducible. The five closed models are three Claude Sonnet releases (3.5, 3.7 and
4.5), Claude Haiku 4.5 and GPT-5.5, run on the 160-probe subset (§
3.4
). In the sandbox we add Devstral-Small-2507, a 24B
open model from Mistral trained for coding agents, served with FP8 weights and cache. Other open models run in bf16. We disable thinking
(Qwen 3 and 3.5) and set GPT-5.5’s reasoning effort to
none
, so that every model answers under the same output budget. All runs use
temperature 0.7, with five samples per condition in single-step answers (three for closed models). In the sandbox we run three episodes
per cell, six for the Qwen models under on-demand loading and one for Sonnet 4.5. Table S1 shows which model ran in which
experiment.
Agent settings.
An agent is a model together with its harness
(
Grace et al., 2026
)
, so we name the harness in every agent
setting.
Single-step
: the prompt always names the Skill by its frontmatter name and description, as a harness lists installed
Skills, and the old and new conditions add the body, as a harness does when it activates the Skill
(
Anthropic, 2026a
;
Agent Skills, 2026b
)
.
Like
(
Yang and Ding, 2026
)
, we place only
SKILL.md
in the prompt, but the model answers once, without the retry of
(
Yang and Ding, 2026
)
or the tools of
(
Liu et al., 2026
)
.
Multi-step
: a read-only tool agent lists, searches and reads the repository for up to eight turns, and an executing agent under the
published mini-SWE-agent scaffold
(
Yang et al., 2024
;
Lieret et al., 2025
)
writes files and runs shell commands for up to twelve turns in a
network-less sandbox holding the repository at the new version’s commit (§
5.2.2
). We also let the agent decide whether to read
the Skill (§
5.2.4
), and pose single-step probes inside long contexts that resemble an agent’s (§
5.1.7
).
3.4.
Evaluation Metrics
Effectiveness
has three levels.
Directive compliance
in one answer is Level 1 (string check), the
required action
of
an executing agent is Level 2, and
final correctness
of the produced artifact is Level 3. Level 1 covers every model but also
credits an answer that repeats a token it was shown, so it includes
information exposure
as well as
directive following
. Let
i
i
index probes (in the sandbox, tasks) and
c
∈
{
none
,
old
,
new
}
c\in\{\text{none},\text{old},\text{new}\}
the Skill condition. Every condition gives the
Skill’s name and description. Under
none
the prompt has nothing more. Under
old
and
new
it also has the body of the old
or the new version. Let
r
=
1
,
…
,
R
r=1,\dots,R
index the repeated samples of one probe under one condition (
R
=
5
R=5
in single-step answers,
R
=
3
R=3
for closed models; in the
sandbox
r
r
indexes episodes).
s
i
​
c
​
r
∈
{
0
,
1
}
s_{icr}\in\{0,1\}
is 1 when sample
r
r
passes the check of the level being measured, and
N
N
is the number
of probes a model answers. Then
(1)
y
i
​
c
=
1
R
​
∑
r
=
1
R
s
i
​
c
​
r
,
E
c
=
1
N
​
∑
i
=
1
N
y
i
​
c
,
Δ
​
E
=
E
new
−
E
old
,
y_{ic}=\frac{1}{R}\sum_{r=1}^{R}s_{icr},\qquad E_{c}=\frac{1}{N}\sum_{i=1}^{N}y_{ic},\qquad\Delta E=E_{\text{new}}-E_{\text{old}},
where
y
i
​
c
y_{ic}
is the pass rate of probe
i
i
under condition
c
c
,
E
c
E_{c}
the model’s mean pass rate under condition
c
c
, and
Δ
​
E
\Delta E
the
effect of a revision, computed from the same probes under both versions.
Tokens.
I
i
​
c
​
r
I_{icr}
and
O
i
​
c
​
r
O_{icr}
are the input and output
tokens of sample
r
r
(under the model’s own tokenizer), and
(2)
T
c
in
=
1
N
​
∑
i
=
1
N
1
R
​
∑
r
=
1
R
I
i
​
c
​
r
,
T
c
out
=
1
N
​
∑
i
=
1
N
1
R
​
∑
r
=
1
R
O
i
​
c
​
r
,
T^{\text{in}}_{c}=\frac{1}{N}\sum_{i=1}^{N}\frac{1}{R}\sum_{r=1}^{R}I_{icr},\qquad T^{\text{out}}_{c}=\frac{1}{N}\sum_{i=1}^{N}\frac{1}{R}\sum_{r=1}^{R}O_{icr},
are the mean input and output tokens per response under condition
c
c
.
Δ
​
T
in
=
T
new
in
−
T
old
in
\Delta T^{\text{in}}=T^{\text{in}}_{\text{new}}-T^{\text{in}}_{\text{old}}
and
Δ
​
T
out
=
T
new
out
−
T
old
out
\Delta T^{\text{out}}=T^{\text{out}}_{\text{new}}-T^{\text{out}}_{\text{old}}
are the
marginal cost
of a revision. The same
differences between old and none are the
carrying cost
of a Skill body. We report the relative input change
Δ
​
T
in
/
T
old
in
\Delta T^{\text{in}}/T^{\text{in}}_{\text{old}}
, the output change
Δ
​
T
out
\Delta T^{\text{out}}
, and
Δ
​
T
/
Δ
​
E
=
(
Δ
​
T
in
+
Δ
​
T
out
)
/
Δ
​
E
\Delta T/\Delta E=(\Delta T^{\text{in}}+\Delta T^{\text{out}})/\Delta E
, the added tokens per additional compliant response. In agent
episodes tokens are summed over turns.
Latency
is the mean wall-clock time per request, measured locally at batch size one.
Statistics.
Differences are paired over probes, with 95% confidence intervals from a repository-clustered bootstrap (4,000
resamples), which resamples whole repositories so that probes from one repository stay together. Holm correction adjusts p-values for the
number of tests in a family. For claims of no difference we report a
data-derived bound
, the larger absolute endpoint of the 90%
interval. Differences larger than this bound are unlikely given the data, but the bound is not a margin fixed in advance.
Probe sets.
We built probes in two batches (317, then 79). All 16 open-weight models answer the same
N
=
300
N=300
probes, the
main set
. It holds the 245 first-batch probes whose three conditions fit every open model’s usable input (its context
window, capped at 8,192 tokens; 4,096 for OLMo-2) and 55 drawn at random (seed 0) from the 59 second-batch probes
that also fit. The closed models, the latency runs and the long-context runs use a
160-probe subset
drawn at random from the first
batch. The control experiments (§
5.1.2
) run on four models with 8,192-token windows and use the 292 first-batch probes
whose six prompt variants fit them. Without OLMo-2’s limit, this set is larger than the 245 first-batch probes of the main set.
4.
RQ1: How Do Agent Skills Co-Evolve with Their Harness?
Motivation and Approach
A Skill reaches the model through a harness and points the agent to files, scripts and tools. If Skills co-evolve with their harness, a
Skill revision should change what the Skill asks the harness to read or run, and its commit should change harness configuration more often
than comparable commits. For the 3,159 Skills we measure what each revision changes (§
4.1
) and how the executable
references of a Skill change (§
4.2
). We then compare how often harness configuration changes in the same commit as a Skill
against commits matched by repository and commit-size band (§
4.3
). We also read the documented motive and the authorship of
each revision commit.
Measures.
A rule-based classifier assigns each added or deleted line to one of ten content types by its Markdown form. The types
are code (fenced block), heading, table row, link or sub-document reference, numbered step, MUST/NEVER constraint, conditional bullet,
other bullet, formatting, and otherwise prose. Regular expressions over backticked spans extract the
executable surface
, namely
repository paths, shell commands, agent tool names, frontmatter fields that control loading (e.g.,
allowed-tools
) and “before X,
read or run Y” preconditions. On 200 hand-labelled added lines the classifier agrees with the annotator at
κ
=
0.70
\kappa=0.70
(accuracy
0.76). It over-assigns code (precision 0.55) and misses most MUST/NEVER and conditional lines (recall 0.18, 0.19).
On the same lines plus 50 that it flags (ten per reference type), the extractor is precise for paths and commands (1.00,
0.93) but sees only backticked spans (recall 0.21, 0.13), so we report the references it detects. Tool-name counts are
unreliable (precision 0.15), so we do not report them. A file counts as harness configuration if it matches an agent-configuration
pattern (
CLAUDE.md
,
AGENTS.md
,
.claude/
and other agents’ directories, Copilot instructions, MCP configuration
and plugin manifests; Table S39). For every commit that touches a Skill we list the other files it changes and compare it with up to 20 random commits of
the same repository that touch no Skill. Skill commits change more files (median 7 against 2), so we compare
within repository and within bands of files changed, weighting by Skill commits.
4.1.
Most revisions change a rule or procedure
Among the Skills that have a revision history (40% of the sampled files), revisions come often and in bursts (Table S7). Consecutive versions are a median of under three days apart,
and 66% of revision commits come more than a week after the first version. Although 60% of revised Skills end longer,
the median net growth is +18 words (Table S6). Most revisions change a rule or procedure (Figure
3
a). Of the 2,608 revisions,
55.0% add or delete at least one MUST/NEVER constraint, conditional rule or numbered step,
19% change examples or code but no rule or procedure, and 14% change only prose. By words, prose is the largest
addition, and code shrinks in net only because of a few large Skills (Figure S1, Table S8).
Documented motives and authorship
The repository history rarely documents a model-related motive. Only 0.4% of commit subjects name a model version, 4.2%
of 120 hand-labelled commits target a model or platform, and 3.3% of pairs add or change a versioned model name or a
model
field. These counts cover documented motives only (§
7.1
). Most commits add content (28%), follow a
change in code or tooling (20%), or correct an error (18%). An AI-agent or bot signature appears on 37.6% of
revision commits, against 40.5% of other commits in the same repositories and period.
Figure 3.
How Skills and their harness change. (a) Each first/last pair counts once, under the first type in the order shown that it adds
or deletes a line of. Rule or procedure means a MUST/NEVER constraint, conditional rule or numbered step, as detected by the classifier
(§
4
). (b) Share of the 6,955 Skill revision commits (filled) and of other commits of the same repository and size (open)
that also change each harness file;
Δ
\Delta
in points, grey where the 95% CI includes 0 (Table S39).
Two horizontal charts side by side. Left: share of revisions by the first type of change they contain, led by rule or
procedure changes at 55 percent, then examples or code and prose only. Right: for each kind of harness file, the share of Skill revision
commits and of comparable other commits that also change it, with the difference in percentage points.
4.2.
Few Skills gain executable references
Each executable reference type rises on average from first to last version, but from a small base (Table
2
), about
0.44 more paths and 0.25 more commands against 101 more words per Skill. Most Skills leave their executable surface
unchanged. Skills get longer, but the share of paths and commands in them does not grow. The count per
1,000 words shows no detectable change (+0.43 [
−
-
0.10, +0.89]). The same holds in the high-star set (+0.08
[
−
-
0.21, +0.66]) and with a higher-recall extractor that reads unquoted paths and commands (Table S10). The
user-invocable
field, which
turns a Skill into a command the user can call, rises from 2.2% to 5.9% of Skills, and doubles (3.3% to
6.7%) among the 1,718 Skills first written after the field appeared.
Table 2.
Executable surface of a Skill in its first and last version (2,608 pairs). First, Last: per-Skill mean count;
Δ
\Delta
:
mean per-Skill change with a repository-clustered 95% CI; Up / down: share of Skills whose count rose / fell. Counts are the references
the extractor detects in backticked spans.
Count per Skill
First
Last
Δ
\Delta
[95% CI]
Up / down
Repository paths referenced
1.24
1.68
+0.44 [+0.28, +0.62]
18% / 6%
of which scripts
0.27
0.35
+0.08 [+0.02, +0.15]
6% / 3%
of which reference documents
0.69
0.94
+0.25 [+0.13, +0.40]
10% / 3%
Shell commands
0.51
0.76
+0.25 [+0.16, +0.35]
12% / 4%
“Before X, read/run Y” steps
0.05
0.07
+0.02 [+0.01, +0.03]
3% / 1%
Frontmatter control fields
0.24
0.32
+0.08 [+0.02, +0.14]
8% / 3%
Words
927.53
1028.62
+101.09 [+46.11, +157.09]
60% / 24%
4.3.
Skill revisions touch harness files more often
Of the 6,955 commits that revise a Skill in the 855 repositories we could re-clone, 29% also change a
harness-configuration file, against 10% of other commits in the same repositories. Much of this gap reflects commit size.
Matched on repository and files changed, 23.0% of revision commits and 18.5% of other commits change harness configuration, a
difference of +4.5 points [+1.6, +7.3] (Figure
3
b). The excess comes from
CLAUDE.md
(+2.1),
AGENTS.md
(+2.0), the configuration of other agents such as Cursor and Codex (+1.9), and Claude Code agent definitions
(+1.4) and command definitions (+1.4). Settings, hooks and MCP configuration change about as often as in other commits, and
plugin manifests no more often. Creating a Skill is coupled more tightly. Of the creation commits, 36.7% change harness configuration,
against 21.8% of matched commits (+14.8 [+9.4, +20.4]), across plugin manifests, settings and agent instructions
(Table S39). A Skill commit also changes the Skill’s own scripts and references +25 points more often than a
matched commit (Table S9). These are associations within commits, and Hereiz et al.
(
Hereiz et al., 2026
)
report a similar
coupling inside plugin Skills.
Insight.
Skills change together with harness configuration. Revised Skills change often, mostly in their rules or procedures, and the
harness files around them change in the same commits more often than in comparable commits. Model-related motives are rarely documented.
5.
RQ2: How Does Skill Evolution Affect Task Effectiveness?
Motivation and Approach
A maintainer revises a Skill to change an agent’s behaviour, which can affect task effectiveness. We study rule changes, a narrower class within the 55.0% of revisions that RQ1’s classifier marks as changing a rule or
procedure; that classifier misses most MUST/NEVER and conditional lines (recall 0.18 and 0.19). Of the 2,608
revisions, 1,074 (41%) add at least one directive that names a command, path or identifier. We focus on such rules because revisions
that change only prose or only examples barely move compliance with a Skill’s existing rules. On the 154 dilution probes
whose revision changes only prose or examples, four models (Qwen 2.5-7B, Qwen 3-8B, Qwen 3.5-9B and Phi-4-mini) change compliance by
+0.017 [+0.002, +0.034], within an equivalence margin of 0.08 fixed before the run (per-model data-derived bounds at most
0.06), while the Skill body itself adds +0.57 over none (Table S12). We measure
effectiveness at the three levels of §
3.4
and supplement the string check with a token-only control, action traces and blind
judgements. Figure
4
summarizes every setting of §
5.1
(single answers) and §
5.2
(agents). Effects are smaller in the agent settings we test than in single answers. On the same 36 tasks, final
correctness rises by less than the action rate, though not significantly (§
5.2.3
).
Forest plot of new-minus-old differences with 95 percent confidence intervals in three panels: directive compliance in one answer, the required action of an executing agent, and human-judged final correctness. Each row is one setting, with model means and single models marked differently.
Figure 4.
New minus old in each setting. The three panels measure different constructs on their own axes and are not directly comparable; compliance (A) includes information exposure. CIs: repository-clustered bootstrap.
n
n
: (a) 300 probes; (b) 65–87 per model (by context window); (c) the 144 of 147 probes answered by all five; (d) 40; (e, f) 149; (B) 80 tasks; (C) 151 and 72 judged pairs. Orange rows: (g) the rule against a sentence naming only its token (292 probes); (l) the 35 tasks where Qwen 3.5-27B’s old agent had seen the token.
Forest plot of new-minus-old differences with 95 percent confidence intervals in three panels: directive compliance in one answer, the required action of an executing agent, and human-judged final correctness. Each row is one setting, with model means and single models marked differently.
5.1.
Single-Step Setting
One model answers one request under each of three conditions: none, the old version and the new version (§
3.3
).
5.1.1.
Every model follows an added rule more often
All 16 open-weight models follow the added rule more often, by a similar amount (Table
3
). We also ran the 147 probes of the 160-probe subset that fit every open model except the
4,096-token OLMo-2 (for GPT-5.5, the 144 it answered in both versions; Table S25). On them, per-model gains range from
+0.42 to +0.45 for the five closed models and from +0.35 to +0.46 for the
open models. In the high-star set the per-model gains of the 16 models range from +0.36 to +0.54 (65–87 probes
per model, by context window; Table S33). The gain does not differ detectably by the RQ1 characteristics of a revision, such as
its commit intent, a change in its executable references or a harness change in the same commits (smallest Holm-adjusted
p
=
0.24
p=0.24
; Table S13).
Table 3.
Compliance with the added rule under the old and new version, one answer, every model on the same
N
=
300
N=300
probes.
Δ
\Delta
: new
−
-
old with repository-clustered 95% CI (all
p
<
0.001
p<0.001
); the last two columns split
Δ
\Delta
by whether the checked token is
new (193 probes) or already in the old version (107);
∘
: CI includes 0.
Δ
\Delta
by token
Family
Model
Released
Old
New
Δ
\Delta
95% CI
new
present
Qwen
2.5-7B
2024-09
0.253
0.649
+0.395
[+0.335, +0.455]
+0.58
+0.07
Qwen
3-8B
2025-04
0.280
0.719
+0.439
[+0.366, +0.510]
+0.66
+0.04
∘
Qwen
3.5-9B
2026-02
0.276
0.701
+0.425
[+0.361, +0.488]
+0.62
+0.08
Qwen
2.5-32B
2024-09
0.270
0.703
+0.433
[+0.365, +0.502]
+0.62
+0.10
Qwen
3-32B
2025-04
0.279
0.725
+0.446
[+0.379, +0.513]
+0.65
+0.08
Qwen
3.5-27B
2026-02
0.279
0.710
+0.431
[+0.362, +0.500]
+0.61
+0.10
Phi
3-mini
2024-04
0.217
0.613
+0.396
[+0.334, +0.456]
+0.56
+0.10
Phi
3.5-mini
2024-08
0.232
0.622
+0.390
[+0.335, +0.444]
+0.55
+0.10
Phi
4-mini
2025-02
0.249
0.624
+0.375
[+0.310, +0.439]
+0.55
+0.07
∘
Mistral
7B-v0.2
2023-12
0.247
0.634
+0.387
[+0.327, +0.448]
+0.56
+0.08
Mistral
7B-v0.3
2024-05
0.245
0.641
+0.396
[+0.333, +0.460]
+0.59
+0.05
∘
Llama
3-8B
2024-04
0.249
0.657
+0.408
[+0.343, +0.473]
+0.59
+0.09
Llama
3.1-8B
2024-07
0.270
0.687
+0.417
[+0.347, +0.486]
+0.63
+0.04
∘
OLMo
2-7B
2024-11
0.210
0.554
+0.344
[+0.288, +0.401]
+0.51
+0.05
∘
OLMo
3-7B
2025-11
0.230
0.585
+0.355
[+0.296, +0.416]
+0.51
+0.08
Gemma
2-9B
2024-06
0.242
0.690
+0.448
[+0.381, +0.517]
+0.63
+0.11
5.1.2.
Stating a rule beats naming its token
A first/last pair can differ in many lines, and an answer can pass the check by naming the token. Figure
5
separates these
with four extra versions of each Skill on the same probes. They are the old version plus only the added rule line, the new version without
it, the old version plus unrelated Skill text as long as the revision’s growth, and the old version plus one sentence that names the token
without stating a rule.
Figure 5.
Control conditions on the added-directive probes. Each row is A
−
-
B as named under it (positive: A complies more). Cell: mean
paired difference in compliance with its repository-clustered 95% CI. Colour runs from cool for small estimates to warm for large ones (0 to 0.45); hatched: CI includes 0. The first row re-estimates the full revision in this run.
n
n
: the 292 of 317 probes whose six prompt variants fit 8,192 tokens for each of the four control models (more than the 245 first-batch probes of the main set, which must also fit OLMo-2’s 4,096 tokens).
Heat map with one column per control model and one row per contrast between prompt variants, such as the old version plus only the added rule against the old version. Each cell shows the mean paired difference in compliance and its confidence interval, coloured from cool blue for small differences to warm red for large ones; cells whose interval includes zero are hatched.
On all four control models (Phi-3-mini, Phi-4-mini, Qwen 2.5-7B and Qwen 3.5-9B), the rule line carries most of the revision. Adding only
the rule line to the old Skill gives about two thirds of the full effect. Removing it from the new Skill lowers compliance by about
0.21. On 300 further probes built the same way around a directive line identical in both versions, removing that line
lowers compliance by a similar 0.24 (five open models).
Unrelated text of the same length has no detectable effect. Stating the rule adds +0.15 [+0.12, +0.19] beyond naming its token. On the
88 probes whose token the old version already contains, it adds +0.04 [+0.02, +0.07]. The conditions overlap,
because the rule line contains the token (§
7.1
).
5.1.3.
The gain comes from tokens new to the Skill
For each probe we know whether its token already appeared in the old version (Table S11). A new token lifts compliance by
+0.51 to +0.66 from an old-version baseline of 0.05. An already-present one starts much higher (0.61) and lifts it by
+0.08 [+0.03, +0.12] pooled over models (107 probes), so part of the difference may be
headroom
, the room left above a
high old-version rate. In a random sample of 30 of the 107 already-present cases, 18 restate a rule (e.g., moved from a table to a list) and
7 add a rule about a token earlier shown only in an example. These 7 rules show no detectable gain (+0.04 [
−
-
0.01, +0.08]; 7 rules
×
\times
16 models). A new
rule is also applied where it is not needed. On 260 requests for the same Skills that do not need the rule (written by the same
generator and screened by Qwen 3-32B), all six models we ran (Llama 3.1-8B, Mistral 7B-v0.3, Phi-4-mini, Qwen 3.5-9B and 27B, Gemma 2-9B)
use its token +0.02 to +0.06 more often under the new version (Table S32), against +0.38 to +0.45 where it is needed.
5.1.4.
Deleting a rule lowers compliance with it
Removing a rule lowers compliance with it by 0.27–0.33 on each of eight models (six Qwen models, Phi-4-mini and OLMo-2;
Table S15), about three quarters of what adding one does. By hand-checked reason (exploratory; Table S16), deleting a duplicate
changes compliance by
−
-
0.12 (
n
=
27
n=27
) and deleting a replaced rule by
−
-
0.58 (
n
=
24
n=24
).
5.1.5.
Older and newer model generations gain similarly
A maintainer edits a Skill against the model they use, while users may run an older or smaller one. For every pair of generations within a
family we compute the interaction, the older model’s gain minus the newer one’s (12 comparisons; Table S17). No
generation difference is significant after Holm correction. The data-derived bound is 0.077, about a fifth of the main effect
(Table S18). It is 0.062 along the Sonnet ladder (Table S26) and 0.071 for the directive-following
part. In a separate family of tests restricted to probes with a new token, one step differs (Qwen 2.5-7B to 3-8B,
−
-
0.083, Holm-adjusted
p
=
0.018
p=0.018
), where the older model gains less.
5.1.6.
Gains shrink when the Skill fills the window
The benefit of a new rule declines with
Skill occupancy
, the ratio of Skill tokens to a model’s usable context, as models degrade
with input length
(
Levy et al., 2024
)
. Across occupancy groups it falls from
0.424
0.424
at low occupancy to
0.270
0.270
when the Skill fills
three quarters of the window (Table S19). Below that, growth alone barely matters, and a growing document around an unchanged line has
no detectable effect (Table S20).
5.1.7.
Part of the gain survives in long contexts
An agent’s context also carries a system prompt, tool schemas and a history. We placed probes of the 160-probe subset inside such a
context, beyond the 8,192-token cap of short answers, and let the model answer once. The context holds a coding-agent system prompt with
fourteen tool schemas, the Skill where a harness would put it, and a prior exchange in which the agent explores the probe’s repository,
followed by the request. Four open models
whose context windows hold them (Llama 3.1-8B, OLMo 3-7B, Phi-4-mini, Qwen 3.5-9B) answer the 149 probes whose prompts fit all four
windows. In contexts of about 15k and 40k tokens the new version raises compliance by +0.07 to +0.28 (8 of
8 model–length cells significant), against +0.37 to +0.42 in a short single answer on the same probes. About three fifths of the
short-answer effect survives at 15k tokens (95% CI 53–72%) and about two fifths at 40k
(29–46%). Where the context already shows the token but the old Skill lacks it (28 probes), the revision still
adds +0.31 [+0.20, +0.42].
5.2.
Multi-Step Setting
We repeat the comparison with a read-only tool agent, an agent that executes commands in a sandbox, and the same agent loading the
Skill on demand. In each setting the Skill file is
removed from the checkout, so the only Skill the agent sees is the one we give it.
5.2.1.
Read-only agents follow the new rule more often
On 40 probes drawn at random from the first batch (half of them prohibitions), agents that may list and read repository files for up to
eight turns comply more often with the new version. The gain is +0.18 to +0.33 on three open models (Qwen 2.5-7B,
Qwen 3.5-9B and Phi-4-mini; Table S27), significant for each.
5.2.2.
Sandbox agents take the required action more often
We built an executable benchmark of 80 tasks whose added rule names a command, flag, file or identifier that exists in the
repository at the new version’s commit (57 repositories; Table S29), and the agent is asked to carry the request out. We accept at
three levels.
Action
means that the required command was executed with its target present, the required file was read or created,
or a written file contains the required identifier.
Execution
also requires that the command exits 0 and that written files parse.
Final correctness
is a per-task check, written for the 36 tasks where it could be, that the artifact has the content the
request asks for. The grader never reads the answer text, and every condition gives the Skill’s name and description, so the conditions
differ only in the body. The protocol is the unmodified mini-SWE-agent scaffold
(
Yang et al., 2024
;
Lieret et al., 2025
)
(its own prompt and
bash action format, twelve steps) in our network-less sandbox, with Qwen 3.5-9B and 27B, Devstral-Small-2507 and Claude Sonnet 4.5 on all
80 tasks.
Table 4.
Sandbox under mini-SWE-agent
(
Yang et al., 2024
;
Lieret et al., 2025
)
, three runs per cell (one for Sonnet 4.5). Action: rate under none (name and description only), old and new on all 80 tasks. Execution: the 28 tasks that are not read-only. Final: automated final correctness on the 36 tasks with a final check. Repository-clustered 95% CIs.
Qwen 3.5-9B
Qwen 3.5-27B
Devstral Small
Claude Sonnet 4.5
Action: none / old / new
0.32 / 0.42 / 0.58
0.40 / 0.42 / 0.62
0.34 / 0.44 / 0.80
0.49 / 0.62 / 0.81
new
−
-
old [95% CI]
+0.16 [+0.06, +0.25]
+0.20 [+0.11, +0.29]
+0.36 [+0.24, +0.48]
+0.19 [+0.08, +0.31]
Execution: old
→
\to
new
0.20
→
\to
0.33
0.19
→
\to
0.38
0.49
→
\to
0.74
0.64
→
\to
0.79
Δ
\Delta
[95% CI]
+0.13 [
−
-
0.04, +0.31]
+0.19 [+0.05, +0.36]
+0.25 [+0.08, +0.45]
+0.14 [
−
-
0.10, +0.40]
Final: old
→
\to
new
0.19
→
\to
0.28
0.16
→
\to
0.31
0.39
→
\to
0.63
0.67
→
\to
0.69
Δ
\Delta
[95% CI]
+0.08 [
−
-
0.06, +0.24]
+0.15 [+0.02, +0.29]
+0.24 [+0.07, +0.44]
+0.03 [
−
-
0.18, +0.25]
With the new version every agent takes the required action more often (Table
4
), by +0.23 [+0.15, +0.31] on average
over the four agents. Devstral, an open model trained for coding agents, gains most (+0.36), and Sonnet 4.5 gains +0.19 from a higher
starting point (0.62 under the old version).
Stale references.
The sandbox holds the repository at the new version’s commit, so an old Skill can name files that a later code
change removed, as
changelog.md
became
_changelog.md
in Figure
2
. Part of the gain may then be that of a
current Skill over a stale one, which is also what a maintainer who updates a Skill obtains. On the 62 tasks where every path,
script, command and build target that the old Skill names still exists at the new commit, the action gain pooled over the four agents is
+0.22 [+0.14, +0.30] (per agent +0.13 to +0.35), against +0.23 on all 80 tasks. It differs from that on the
18 tasks with a missing reference by
−
-
0.05 [
−
-
0.24, +0.16].
Information already available.
Every task’s required token exists in the repository, and old-version agents see it in their own
command output in 42–50% of episodes on the 57 tasks whose old version lacks it. Where Qwen 3.5-27B’s old-version
agent saw the token, the new version still raises its action rate by +0.19 [+0.08, +0.29]. Where the old Skill already contained the token (23
tasks), we detect no action gain (Qwen 3.5-9B: +0.00, 27B: +0.06, Sonnet 4.5:
−
-
0.13).
Behaviour.
With a Skill body, agents list directories less often, and with the new version they run fewer
commands (Table S30).
5.2.3.
Human-judged correctness rises for two open models
Table 5.
Human-judged final correctness, blind to model and version (one run per model, task and version). Left: the 36 tasks with a final check; right: all 80 tasks. Pairs with an artifact still unclear after adjudication are dropped: 3 of 72 in the first round (36 tasks, Qwen) and 14 of 168 in the second (44 tasks for Qwen, 80 for Sonnet 4.5). New
−
-
old with repository-clustered 95% CIs.
36 tasks (adjudicated)
All 80 tasks
Model
Pairs
Old
→
\to
New
Human
Δ
\Delta
[95% CI]
Pairs
Old
→
\to
New
Human
Δ
\Delta
[95% CI]
Qwen 3.5-9B
34
0.21
→
\to
0.35
+0.15 [
−
-
0.03, +0.34]
76
0.36
→
\to
0.50
+0.14 [+0.03, +0.26]
Qwen 3.5-27B
35
0.23
→
\to
0.34
+0.11 [
−
-
0.03, +0.26]
75
0.39
→
\to
0.49
+0.11 [+0.01, +0.20]
Qwen, pooled
69
0.22
→
\to
0.35
+0.13 [+0.03, +0.26]
151
0.37
→
\to
0.50
+0.13 [+0.05, +0.20]
Claude Sonnet 4.5
–
–
–
72
0.60
→
\to
0.65
+0.06 [
−
-
0.06, +0.18]
Table
5
is our primary outcome evidence. Annotators blind to model and version judged one pre-drawn run per model, task and
version in two rounds. Two annotators judged 36 tasks for the two Qwen models (
κ
=
0.96
\kappa=0.96
where both gave yes or no), two further
annotators the other 44 tasks and all 80 for Sonnet 4.5 (
κ
=
0.90
\kappa=0.90
), and an adjudicator, also blind, resolved unresolved artifacts
from their full content (annotators: §
3.2
). Over all 80 tasks, final correctness rises by +0.13 [+0.05, +0.20] for the
two Qwen models, significantly for each (+0.09 to +0.16 however the still unclear artifacts are assigned). For Sonnet 4.5 it
rises by +0.06 [
−
-
0.06, +0.18], an estimate with too few pairs to be conclusive (§
7.1
). Pooled over the three judged
agents it rises by +0.10 [+0.04, +0.17]. The automated final check, available for 36 tasks, also rises for the open models,
including Devstral (+0.24 [+0.07, +0.44]), which was not judged by humans, and does not move for Sonnet 4.5. On these 36 tasks
final correctness rises by less than the action rate, but the differences are not significant (+0.03 to +0.08).
5.2.4.
On-demand loading keeps about half of the action gain
This setting lets the agent decide whether to read the Skill body; our sandbox shows only the first and last 2,000 characters of a read
(§
5.2.5
). Real tools list a Skill by name and description and load its body only when the agent decides it needs
it. We re-ran the sandbox with only the version’s name and description in the prompt and the body at its path in the checkout. Averaged
over the four agents, the action gain falls from +0.23 to +0.12 [+0.06, +0.18]. About 51% of it survives (95% CI
28–75%). Sonnet 4.5’s action gain is +0.19 under both loading modes. On demand its old Skill works worse (automated
final correctness 0.50 against 0.67 preloaded) while the new one works about as well (0.69), so final
correctness rises by +0.19 [+0.03, +0.39] on the 36 tasks with a check. The three open models keep about
38% of their gain (95% CI 16–61%). Qwen 3.5-27B drops from +0.20 to +0.08, 9B from +0.16 to
+0.07, and Devstral from +0.36 to +0.13. Sonnet 4.5 and Qwen 3.5-27B read the Skill at similar rates.
5.2.5.
Agents that read the rule do not always act on it
The two agents open the Skill in 89% (Qwen 3.5-27B) and 88% (Sonnet 4.5) of new-version episodes. Our sandbox shows the first and last 2,000 characters of a command’s output, so a
read displays the added rule in only 71% and 69% of reads. Once the rule was displayed, Sonnet
took the required action in 88% [77, 97] of episodes and Qwen in 61% [48,
74]. The task-paired difference is +0.24 [+0.12, +0.36]. With the body in the prompt the two act on the rule in 81% and 62%
of episodes, so the gap is not specific to on-demand loading. Qwen’s on-demand drop thus does not come from lower uptake once the rule is seen.
Insight.
An added rule changes behaviour mainly when it names a command or path that the old Skill did not mention, and agents act on such
a rule rather than only repeating its token. How much of the gain an agent keeps depends on whether and how it loads the Skill.
6.
RQ3: How Does Skill Evolution Affect Cost?
Motivation and Approach
When the Skill body is in the context, every added line is read again on every turn, so a revision adds tokens even when it helps. We separate two costs. The
marginal
cost
of a revision is what the new version costs beyond the old one. The
carrying cost
of a Skill body is what the old version
costs beyond none, the name and description alone. We measure both in tokens (§
3.4
), first for the rule changes that RQ2
studies, in single-step answers (§
6.1
) and multi-step agent episodes (§
6.2
), and then for every type
of revision (§
6.3
), and latency for single requests. For closed models we report token cost for the four Claude
models, whose reported usage we could match to our prompts.
6.1.
Single-Step Setting
6.1.1.
A revision adds input tokens but shortens the answer
Input grows because the new version is longer (Table
6
), and
output
shrinks
, because a model told which command to run answers more concisely than one that hedges. In
juxt/allium
, a
rule to run
allium check
shrinks the answer from 201 to 81 tokens and raises compliance from 0.07 to 0.99. The marginal cost of a revision is therefore almost entirely input. Counting input and output, a request
uses 17% more tokens on the open models and 24 to 27% more on the four Claude models
(Table
7
). At list prices, where output costs three to five times more than input, the bill rises less
(Table S31). Latency does not follow tokens. Measured locally at batch size one on three open models, the new version changes mean
latency by
−
7.2
%
-7.2\%
to
−
1.6
%
-1.6\%
(Table S24), because decoding dominates and the answer gets shorter.
Table 6.
Mean tokens per request for the revisions of Table
3
, under each model’s tokenizer.
Δ
​
T
/
Δ
​
E
\Delta T/\Delta E
: added input and output tokens per additional compliant response.
Input tokens
Output tokens
Family
Model
Old
New
Δ
\Delta
Old
New
Δ
\Delta
Δ
​
T
/
Δ
​
E
\Delta T/\Delta E
Qwen
2.5-7B
1,522
1,811
+19%
160
149
−
-
11
703
Qwen
3-8B
1,522
1,811
+19%
137
128
−
-
8
640
Qwen
3.5-9B
1,592
1,885
+18%
173
159
−
-
15
655
Qwen
2.5-32B
1,522
1,811
+19%
168
155
−
-
14
636
Qwen
3-32B
1,522
1,811
+19%
126
120
−
-
7
633
Qwen
3.5-27B
1,592
1,885
+18%
191
174
−
-
17
640
Phi
3-mini
1,896
2,252
+19%
141
122
−
-
19
850
Phi
3.5-mini
1,896
2,252
+19%
206
191
−
-
15
873
Phi
4-mini
1,510
1,797
+19%
136
125
−
-
12
733
Mistral
7B-v0.2
1,888
2,240
+19%
207
201
−
-
6
891
Mistral
7B-v0.3
1,888
2,240
+19%
195
188
−
-
7
871
Llama
3-8B
1,509
1,798
+19%
162
155
−
-
7
692
Llama
3.1-8B
1,509
1,798
+19%
160
151
−
-
9
670
OLMo
2-7B
1,509
1,802
+19%
219
217
−
-
2
844
OLMo
3-7B
1,509
1,802
+19%
213
204
−
-
9
800
Gemma
2-9B
1,642
1,945
+18%
114
103
−
-
11
652
6.1.2.
One rule–model pair in five adds tokens with no detected gain
For each added rule and each model, a rule–model pair, we checked whether compliance changed and whether tokens increased. With five
samples per condition, compliance moves in steps of 0.2. Compliance improves in 58% of pairs. In 20%, the prompt grows
but we detect no change in compliance, and we call these
overhead candidates
(repository-clustered 95% CI 16.1–24.2%;
18–27% under six alternative thresholds). In 17% neither compliance nor cost changes, and in 5% compliance
falls. Of the 55 rules that at least half the models classify as overhead, 27 are
already followed
, meaning that the
models did what the rule says without it (mean old compliance at least 0.5). The other 28 are
ineffective
, ignored whether
present or not. The first are candidates for review and warrant controlled removal tests before deletion; the second call for rewriting.
6.2.
Multi-Step Setting
Table 7.
Marginal cost of a revision (new
−
-
old) and carrying cost of a Skill body (old
−
-
none) in a single answer, a long-context single answer (§
5.1.7
) and a sandbox episode under mini-SWE-agent, where the body is re-sent every turn (Qwen 3.5-9B and 27B, Devstral and Sonnet 4.5). Latency: local, batch size one.
†
Every 95% CI spans 0.
Setting
Unit
Revision
Skill body
Single answer, 16 open models
input + output tokens
+17%
–
Single answer, 4 Claude models
input + output tokens
+24 to +27%
–
Single answer, 3 open models
latency
−
-
7.2 to
−
-
1.6%
–
Long context (15k–40k), 4 models
input tokens
+1.1 to +3.5%
–
Sandbox episode, 4 agents
tokens per episode
−
-
2.3 to +3.0%
†
+37 to +57%
6.2.1.
A revision adds no detectable cost per episode
Over the 80 sandbox tasks, the new version changes the tokens of an episode by
−
-
2.3 to +3.0% across the four agents
(+0.8% on average). Every interval spans zero and lies within
−
-
14 to +12%, so an increase of more than about
+12% is excluded. The longer prompt is offset by fewer steps (§
5.2.2
).
6.2.2.
Carrying a Skill body costs far more than revising it
The old version costs 37 to 57% more tokens per episode than none (50% on
average over the four agents). The body is re-sent on every turn, and agents with a Skill body take fewer turns (§
5.2.2
),
but their episodes still use more tokens (per-episode list-price costs: Table S29).
6.3.
Every revision type adds input, prose-only the least
Counting the Skill text our prompts insert with each open model’s tokenizer over all 2,608 revisions (input only, no model run;
Table S23), a revision that changes a rule or procedure adds a median of +248 tokens and one that changes only prose
+6. On the 154 dilution probes of RQ2, revisions that change only prose or examples add +34 input and +2 output
tokens per request.
Insight.
The cost of a revision is mostly added input. In a single answer it adds 18–19% input tokens and shortens the answer
only slightly; in an agent episode fewer steps leave no detectable change. Loading the Skill body costs far more. For one rule–model pair
in five we detect no gain in compliance, only the added tokens.
7.
Discussion
7.1.
Threats to Validity
Construct validity
Level-1 compliance checks the rule’s own token, so it includes information exposure and credits an answer that repeats a token it was
shown. The control conditions separate exposure from directive following (§
5.1.2
), but the rule line contains the token, so
the conditions overlap and do not split the effect exactly. The same holds for the split by whether the old Skill named the token
(§
5.1.3
). In the validation sample the check misses more compliant answers under the new version, and annotators saw a larger
gain than the check (§
3.2
). Table S3 adds sensitivity analyses, including one with a further annotator’s judgements. At five
samples per condition, equal old and new compliance is compatible with a small real change, so an overhead candidate is not shown to have
no effect. Subsets defined by old-version behaviour (§
5.2.2
) are descriptive. The automated final check inspects artifacts
rather than running tests and agrees with blind annotators only moderately (
κ
=
0.50
\kappa=0.50
–0.55), so the outcome claim rests on
blind human judgement.
Internal validity
Under right truncation, which cuts the end of an over-long prompt, a prompt longer than a model’s usable input loses the user request
(618 of 12,672 probe–model prompts). We therefore score all 16 open-weight models on the same 300 probes with the
request intact, and using all 304 eligible probes changes the main result only from 0.405 to 0.401. Fork duplication does
not inflate the counts (six first and no last versions are byte-identical across repositories). Other ways of delivering the body change
the single-step gain by a few points at most, and an in-house sandbox harness gives gains of the same sign (Table S28). Probes are generated by Qwen 3.5-27B, and Qwen models gain
slightly more on them than the other 10 models (+0.43 against +0.39, difference +0.04 [+0.02, +0.06]). On 150 probes whose
requests Phi-4 wrote, the 10 non-Qwen models gain +0.26 to +0.42, and three Qwen models gain +0.035 more than the others
(+0.028 on the main set, a change of +0.007 [
−
-
0.029, +0.042]; Table S34).
Maintainer intent
Maintainers may revise a Skill because of a new model or harness without saying so, so our RQ1 counts cover only documented motives. RQ2
tests whether revisions work across model generations rather than why they were made.
External validity
Our findings apply to concrete, mechanically checkable rules. The literal filter keeps 17% of candidate directives and
under-represents prohibitions, conditional rules and permission guardrails (Table S5), which a string check cannot grade. Open
models span 3.8B–32B parameters, the closed models come from two vendors, and models answered without reasoning. Reasoning models
may follow rules differently. The sandbox uses one published scaffold rather than production agents, and it shows only
the first and last 2,000 characters of a command’s output, so on-demand gains for long Skills are likely lower than under harnesses that
display whole files. The corpus skews to moderately popular repositories (none above 375 stars in the main corpus), and the
high-star set (§
3.1
) covers 146 repositories above 1,000 stars with fewer probes. Most “old” versions post-date
the older models, so authorship time and generation are not fully crossed.
Statistical conclusion validity
The generation result is a negative finding. Its data-derived bound is about a fifth of the main effect, and smaller interactions remain
possible. The Sonnet 4.5 outcome estimate is underpowered. With 72 pairs, the power to detect an effect as large as the Qwen effect
(+0.13) is about 0.5 (minimum detectable effect 0.18), and about 125 pairs would give 80% power.
7.2.
Implications for Skill Maintainers
Every effect in RQ2 is conditional on a request that needs the rule. To estimate how often real work does, we sampled 1,454
in-scope commit–rule pairs, up to 30 later commits per added rule that touch the Skill’s files or the paths it names (120 rules, 74
repositories). An annotator labelled 100 of these pairs by hand, drawn stratified by the judgement of
Qwen 3-32B (greedy decoding) on whether completing the commit needs the rule, and reweighted them to all 1,454 pairs. Of these
commits, 25% need the rule (95% CI 14–40%; 18–46% by how unclear pairs are counted; Table S36).
Automated proxies under-count (Table S35). As a scenario, suppose that the conditional effects hold unchanged on in-scope requests that
need the rule and are zero on those that do not. An in-scope request would then gain about 0.10 in single-answer compliance
(0.25
×
\times
0.41; 95% CI of the product 0.05–0.17) and about 0.06 in the required action of the four
sandbox agents (0.25
×
\times
0.23), while every request reads the revision’s tokens. Three practices follow for maintainers.
Add a rule when it gives the agent information the Skill lacks. Before deleting a rule, check that the agent should no longer follow it,
since deletions are followed too. Size a Skill for the smallest model that will read it, since the model’s release year matters less.
7.3.
Relation to Prior Findings
Jiang et al.
(
Jiang et al., 2026
)
find that Skills act mostly as procedural anchors rather than as knowledge injection. For a single
revision, we find the gain concentrated in rules whose token the old Skill did not mention, which we read as new information. Dong
et al.
(
Dong et al., 2026
)
find that Skills induce excessive verification, whereas our agents explore less.
8.
Conclusion and Future Work
Revised Skills change often, mostly in their rules, and harness configuration changes with them. Added rules change what agents do,
mainly when they name a command or path the old Skill did not mention, with similar gains across model generations and smaller gains
under on-demand loading. In the sandbox, agents take the required action more often, and blind judges see modestly higher final
correctness. Stating a rule adds compliance beyond naming its token, unrelated text of the same length has no detectable effect,
and deleting a rule lowers compliance by about three quarters of what adding one gains. A revision adds mostly input tokens and no
detectable cost per episode, while loading the Skill body costs far more.
We see five directions for future work. First, graders that judge agent behaviour, such as whether a forbidden command ran, could
grade the prohibitions, conditional rules and permission guardrails that a string check cannot. Second, natural task streams would
give the net effect of a revision, since about 25% of later in-scope commits need the added rule (§
7.2
).
Third, production harnesses and reasoning models may load and follow Skills differently from those we tested. Fourth, a
pre-merge check could run a revision’s probes and flag rules that add tokens with no detected gain. Fifth, Skills first written after
the newer models would separate authorship time from model generation, which our corpus does not fully cross. Each direction can start from the probe and task manifests, per-sample results and
blind judgements in our replication package (§
9
).
9.
Data Availability
Replication package:
https://figshare.com/s/1fd1668be2b3b5081ad6
, with the supplementary tables (
supplement.pdf
),
probe and task manifests, per-sample results and the scripts behind every table and figure.
References
Agent Skills (2026a)
Agent Skills
Agent skills specification
.
Note:
https://agentskills.io/specification
Accessed 2026-10-01
Cited by:
§1
.
Agent Skills (2026b)
Agent Skills
How to add skills support to your agent
.
Note:
https://agentskills.io/client-implementation/adding-skills-support
Accessed 2026-10-01
Cited by:
§1
,
§3.3
.
Anthropic (2026a)
Anthropic
Agent skills
.
Note:
Claude Platform Docs,
https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview
Accessed 2026-10-01
Cited by:
§1
,
§3.3
.
Anthropic (2026b)
Anthropic
Glossary
.
Note:
Claude Code Docs,
https://code.claude.com/docs/en/glossary
Entry “Agentic harness”; accessed 2026-10-01
Cited by:
§1
.
Bai
et al.
(2026)
L. Bai, Z. Huang, X. Wang, J. Sun, R. Mihalcea, E. Brynjolfsson, A. Pentland, and J. Pei
How do AI agents spend your money? Analyzing and predicting token consumption in agentic coding tasks
.
External Links:
2604.22750
Cited by:
§2.3
.
Ben Sghaier
et al.
(2026)
O. Ben Sghaier, H. Li, B. Adams, and A. E. Hassan
Don’t blame the large language model: how agent harness evolution shapes coding agent quality
.
External Links:
2607.03691
Cited by:
§2.2
.
Chatlatanagulchai
et al.
(2026)
W. Chatlatanagulchai, H. Li, Y. Kashiwa, B. Reid, K. Thonglek, P. Leelaprute, A. Rungsawang, B. Manaskasemsak, B. Adams, A. E. Hassan, and H. Iida
Agent READMEs: an empirical study of context files for agentic coding
.
Note:
ACM Transactions on Software Engineering and Methodology, Just Accepted
External Links:
Document
Cited by:
§2.2
.
Dong
et al.
(2026)
G. Dong, Y. Gao, L. Li, T. Xu, Y. Hua, and F. Yang
Agent skills can be harmful: an empirical study of skill-induced failures in LLM agents
.
External Links:
2608.11888
Cited by:
§1
,
§2.1
,
§7.3
.
Erol
et al.
(2026)
M. H. Erol, B. El, M. Suzgun, M. Yuksekgonul, and J. Zou
Cost-of-pass: an economic framework for evaluating language models
.
Note:
International Conference on Learning Representations (ICLR 2026)
External Links:
Link
Cited by:
§2.3
.
Fan
et al.
(2025)
Z. Fan, K. Vasilevski, D. Lin, B. Chen, Y. Chen, Z. Zhong, J. M. Zhang, P. He, and A. E. Hassan
SWE-Effi: re-evaluating software AI agent system effectiveness under resource constraints
.
External Links:
2509.09853
Cited by:
§2.3
.
Galster
et al.
(2026)
M. Galster, S. Mohsenimofidi, J. L. Lulla, M. A. Abubakar, C. Treude, and S. Baltes
Configuring agentic AI coding tools: an exploratory study
.
In
Proceedings of the 3rd ACM International Conference on AI-Powered Software (AIware)
,
New York, NY, USA
,
pp. 11–20
.
External Links:
Document
Cited by:
§2.2
.
Gao and Peng (2026)
P. Gao and C. Peng
More with less: an empirical study of turn-control strategies for efficient coding agents
.
In
Proceedings of the IEEE/ACM 48th International Conference on Software Engineering (ICSE)
,
New York, NY, USA
,
pp. 956–967
.
External Links:
Document
Cited by:
§2.3
.
Gao
et al.
(2026)
Y. Gao, Z. Li, Y. Yuan, Z. Ji, P. Ma, and S. Wang
SkillReducer: optimizing LLM agent skills for token efficiency
.
External Links:
2603.29919
Cited by:
§2.1
.
GitHub (2026)
GitHub
GitHub
.
Note:
https://github.com
Accessed August 2026
Cited by:
§3.1
.
Gloaguen
et al.
(2026)
T. Gloaguen, N. Mündler, M. Müller, V. Raychev, and M. Vechev
Evaluating AGENTS.md: are repository-level context files helpful for coding agents?
.
External Links:
2602.11988
Cited by:
§2.2
.
Grace
et al.
(2026)
M. Grace, J. Hadfield, R. Olivares, and J. De Jonghe
Demystifying evals for AI agents
.
Note:
Anthropic Engineering Blog,
https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
Published 9 Jan 2026; accessed 2026-10-01
Cited by:
§1
,
§3.3
.
Han
et al.
(2026)
T. Han, Y. Zhang, W. Song, C. Fang, Z. Chen, Y. Sun, and L. Hu
SWE-Skills-Bench: do agent skills actually help in real-world software engineering?
.
External Links:
2603.15401
Cited by:
§1
,
§1
.
Hereiz
et al.
(2026)
A. Hereiz, Y. Lyu, H. Li, B. Adams, and A. E. Hassan
On the maintenance and co-evolution of agent plugins: an empirical study of Claude Code plugin marketplaces
.
External Links:
2608.28497
Cited by:
§2.2
,
§4.3
.
Jiang and Nam (2026)
S. Jiang and D. Nam
Beyond the prompt: an empirical study of cursor rules
.
In
Proceedings of the 23rd International Conference on Mining Software Repositories (MSR)
,
New York, NY, USA
,
pp. 397–409
.
External Links:
Document
Cited by:
§2.2
.
Jiang and Adams (2015)
Y. Jiang and B. Adams
Co-evolution of infrastructure and source code: an empirical study
.
In
Proceedings of the 12th Working Conference on Mining Software Repositories (MSR)
,
Florence, Italy
,
pp. 45–55
.
External Links:
Document
Cited by:
§2.2
.
Jiang
et al.
(2026)
Z. Jiang, F. Huang, H. Xing, X. Wu, Y. Gao, R. Cao, M. Wang, S. Liu, and Y. Li
Demystifying agent skills: why they work—until they don’t
.
External Links:
2608.14036
Cited by:
§1
,
§2.1
,
§7.3
.
Kapoor
et al.
(2025)
S. Kapoor, B. Stroebl, Z. S. Siegel, N. Nadgir, and A. Narayanan
AI agents that matter
.
Note:
Transactions on Machine Learning Research
External Links:
Link
Cited by:
§2.3
.
Levy
et al.
(2024)
M. Levy, A. Jacoby, and Y. Goldberg
Same task, more tokens: the impact of input length on the reasoning performance of large language models
.
In
Proceedings of the 62nd Annual Meeting of the Association for Computational Linguistics (Volume 1: Long Papers)
,
Bangkok, Thailand
,
pp. 15339–15353
.
External Links:
Document
Cited by:
§5.1.6
.
Li
et al.
(2026)
X. Li, Y. Liu, W. Chen,
et al.
SkillsBench: benchmarking how well agent skills work across diverse tasks
.
External Links:
2602.12670
Cited by:
§1
,
§1
.
Li (2026)
Y. Li
Dynamic agent skills: a lifecycle survey and taxonomy of evolving skill libraries
.
Note:
Transactions on Machine Learning Research
External Links:
Link
,
2607.10113
Cited by:
§1
,
§2.1
.
Lieret
et al.
(2025)
K. Lieret, C. E. Jimenez, and the SWE-agent team
mini-SWE-agent: the 100 line AI agent that solves GitHub issues or helps you in your command line
.
Note:
https://github.com/SWE-agent/mini-swe-agent
Version 2.4.6
Cited by:
§3.3
,
§5.2.2
,
Table 4
.
Lindenbauer
et al.
(2025)
T. Lindenbauer, I. Slinko, L. Felder, E. Bogomolov, and Y. Zharov
The complexity trap: simple observation masking is as efficient as LLM summarization for agent context management
.
Note:
4th Deep Learning for Code Workshop (DL4C) at NeurIPS 2025
External Links:
Link
,
2508.21433
Cited by:
§2.3
.
Liu
et al.
(2026)
Y. Liu, J. Ji, L. An, T. Jaakkola, Y. Zhang, and S. Chang
How well do agentic skills work in the wild: benchmarking LLM skill usage in realistic settings
.
External Links:
2604.04323
Cited by:
§1
,
§3.3
.
McMillan (2026)
D. McMillan
Instruction adherence in coding agent configuration files: a factorial study of four file-structure variables
.
External Links:
2605.10039
Cited by:
§2.2
.
Mohsenimofidi
et al.
(2026)
S. Mohsenimofidi, M. Galster, C. Treude, and S. Baltes
Context engineering for AI agents in open-source software
.
In
Proceedings of the 23rd International Conference on Mining Software Repositories (MSR)
,
New York, NY, USA
,
pp. 194–198
.
External Links:
Document
Cited by:
§2.2
.
Sharma
et al.
(2016)
T. Sharma, M. Fragkoulis, and D. Spinellis
Does your configuration code smell?
.
In
Proceedings of the 13th International Conference on Mining Software Repositories (MSR)
,
New York, NY, USA
,
pp. 189–200
.
External Links:
Document
Cited by:
§2.2
.
Tafreshipour
et al.
(2025)
M. Tafreshipour, A. Imani, E. Huang, E. S. de Almeida, T. Zimmermann, and I. Ahmed
Prompting in the wild: an empirical study of prompt evolution in software repositories
.
In
Proceedings of the 22nd IEEE/ACM International Conference on Mining Software Repositories (MSR)
,
Ottawa, ON, Canada
,
pp. 686–698
.
External Links:
Document
Cited by:
§2.2
.
Wang
et al.
(2024)
G. Wang, Y. Xie, Y. Jiang, A. Mandlekar, C. Xiao, Y. Zhu, L. Fan, and A. Anandkumar
Voyager: an open-ended embodied agent with large language models
.
Note:
Transactions on Machine Learning Research
External Links:
Link
Cited by:
§1
,
§2.1
.
Wang
et al.
(2026)
Q. Wang, Y. Zhang, Z. Chen, Y. Sun, J. Yu, and X. Zhang
Implicit manipulation for skill selection in LLM agents with semantic matching
.
External Links:
2609.02035
Cited by:
§2.1
.
Xiao
et al.
(2026)
Y. Xiao, P. Gao, C. Peng, and Y. Xiong
Reducing cost of LLM agents with trajectory reduction
.
Proceedings of the ACM on Software Engineering
3
(
FSE
),
pp. 1241–1263
.
External Links:
Document
Cited by:
§2.3
.
Yang
et al.
(2024)
J. Yang, C. E. Jimenez, A. Wettig, K. Lieret, S. Yao, K. Narasimhan, and O. Press
SWE-agent: agent-computer interfaces enable automated software engineering
.
In
Advances in Neural Information Processing Systems 37 (NeurIPS 2024)
,
Vancouver, BC, Canada
,
pp. 50528–50652
.
External Links:
Document
Cited by:
§3.3
,
§5.2.2
,
Table 4
.
Yang and Ding (2026)
Z. Yang and F. Ding
Signal or noise? A benchmark study of agent skills in web development
.
External Links:
2608.23067
Cited by:
§2.1
,
§3.3
.
Zhang
et al.
(2025)
B. Zhang, K. Lazuka, and M. Murag
Equipping agents for the real world with agent skills
.
Anthropic
.
Note:
Anthropic Engineering Blog,
https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
Published 16 Oct 2025; updated 18 Dec 2025; accessed 2026-10-01
Cited by:
§1
.
Zhang
et al.
(2026)
C. Zhang, Y. Liu, X. Chen, and P. Ji
What keeps agent skills from being reusable? Evidence from 138K SKILL.md files
.
External Links:
2608.08453
Cited by:
§2.1
,
§3.1
.
Zhang (2026)
C. Zhang
SkillMD-138K
.
Note:
Hugging Face dataset
https://huggingface.co/datasets/FayeZC/SkillMD-138K
, CC-BY-4.0Accessed August 2026
Cited by:
§3.1
.
Zhou
et al.
(2023)
J. Zhou, T. Lu, S. Mishra, S. Brahma, S. Basu, Y. Luan, D. Zhou, and L. Hou
Instruction-following evaluation for large language models
.
External Links:
2311.07911
Cited by:
§3.2
.
Zhou
et al.
(2026)
X. Zhou, J. Liu, L. Li, R. A. Rossi, and X. Hu
Counterfactual trace auditing of LLM agent skills
.
External Links:
2605.11946
Cited by:
§1
,
§2.1
.
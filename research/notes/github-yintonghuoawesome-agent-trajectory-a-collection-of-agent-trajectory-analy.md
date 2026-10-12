---
title: 'GitHub - YintongHuo/awesome-agent-trajectory: A collection of agent trajectory
  analysis techniques and benchmark · GitHub'
id: github-yintonghuoawesome-agent-trajectory-a-collection-of-agent-trajectory-analy
tags:
- ai-software-factory-architecture-58e4cc
- source-hub
- agent-trace-analysis
created: '2026-10-12T08:31:47.771817Z'
updated: '2026-10-12T08:36:21.357920Z'
source: https://github.com/YintongHuo/awesome-agent-trajectory
source_domain: github.com
fetched_at: '2026-10-12T08:31:47.769392Z'
fetch_provider: builtin
status: draft
type: note
tier: ground_truth
content_type: code
deprecated: false
summary: 'Curated GitHub awesome-list (YintongHuo/awesome-agent-trajectory, maintained
  by Dr. Yintong Huo and Minxing Wang, SMU; 97 stars) indexing papers, tools, and
  benchmarks on analyzing, diagnosing, and learning from LLM agent execution trajectories.
  Organized into: surveys/position papers; empirical characterization studies; failure
  localization/attribution/diagnosis; runtime intervention/recovery/repair; learning
  and optimization from trajectories; anomaly detection and failure forecasting; trajectory
  quality assessment; trajectory representation; human-centered analysis/visualization;
  and benchmarks/datasets (coding agents, general/mixed agents, deep-research agents,
  evaluation methodology). Most directly relevant entries to probabilistic skill-sequence
  prediction: ProMAS (arXiv 2026, models multi-agent execution as Markov transition
  dynamics to forecast failures before task completion); Trace2Skill (arXiv 2026,
  distills trajectory-local lessons from execution traces into transferable, reusable
  agent skills); Trajectory-Informed Memory Generation (arXiv 2026, converts prior
  trajectories into reusable memories guiding future agent decisions); GRADE (arXiv
  2026, two-layer graph of execution + dependency edges to predict failure likelihood
  and localize faulting steps); and TraceLab (a real-world dataset of ~4,300 coding-agent
  sessions / ~350k LLM steps from day-to-day Claude Code and Codex usage). This is
  a link-index/source-hub repository, not itself a citable primary source — its value
  is as a map of the trajectory-analysis research landscape for sourcing primary papers.'
utility_score: 14.0
---

GitHub - YintongHuo/awesome-agent-trajectory: A collection of agent trajectory analysis techniques and benchmark · GitHub
Skip to content
You signed in with another tab or window.
Reload
to refresh your session.
You signed out in another tab or window.
Reload
to refresh your session.
You switched accounts on another tab or window.
Reload
to refresh your session.
Dismiss alert
main
Branches
Tags
Go to file
Code
Open more actions menu
Latest commit
History
30 Commits
30 Commits
Folders and files
Name
Name
Last commit message
Last commit date
LICENSE
LICENSE
README.md
README.md
cover.jpeg
cover.jpeg
View all files
Repository files navigation
Awesome-Agent-Trajectory
Your all-in-one guide to agent trajectories.
Trajectories are the source code of the agentic era.
An
Agent Trajectory
is the step-by-step record of an autonomous agent's execution. It captures the agent's internal reasoning (thoughts, planning, reflections), the actions it took (tool calls, API payloads, bash commands), and the environment’s responses (observations, errors, system state changes). Trajectories are becoming the first-hand asset for debugging, evaluating, training, and auditing AI agents.
This repository is a curated collection of papers, tools, and benchmarks on
analyzing, diagnosing, and learning from LLM agent trajectories
.
This list tracks work across the trajectory-analysis pipeline:
Characterizing
how agents behave and where they tend to fail
Localizing and attributing
failures to a specific agent, step, or root cause
Intervening and recovering
from failures at runtime
Learning and optimizing
future behavior from past trajectories
Detecting anomalies
and forecasting failure before it happens
Assessing the quality
of individual steps or whole trajectories
Representing
trajectories as structured, traceable objects
Supporting humans
in inspecting, visualizing, and explaining agent behavior
Benchmarking
all of the above with labeled datasets
Contributions, discussions, and collaborations are welcome! | see
Contributing
.
Updating History
This repository is under active maintenance!
[Aug 26] Updating TraceLab, TrajSpec
Table of Contents
Surveys and Position Papers
Empirical Study/Characterization
Failure Localization, Attribution, and Diagnosis
Runtime Intervention, Recovery, and Repair
Learning and Optimization from Trajectories
Anomaly Detection and Failure Forecasting
Trajectory Quality Assessment
Trajectory Representation
Human-Centered Analysis, Visualization, and Explainability
Benchmarks and Datasets
Coding Agents
General Agents/Mixed
Deep-Research Agents
Evaluation Methodology
Surveys and Position Papers
Literature surveys and forward-looking position/vision papers that map the trajectory-analysis landscape or propose research agendas for it.
(TSE 2026) Agent System Operations: Categorization, Challenges, and Future Directions
[
Paper
]
| Defines AgentOps around monitoring, anomaly detection, root-cause
localization, and resolution, with intra-agent and inter-agent anomaly
taxonomies.
`survey`
`agentops`
`agent-debugging`
(arXiv 2026) A Survey for LLM Agent Trajectory Analysis: From Failure Attribution to Enhancement
[
Paper
]
| Reviews trajectory-based failure taxonomy, attribution, enhancement,
debugging tools, and benchmarks.
`survey`
`trajectory-analysis`
(arXiv 2026) Beyond Individual Intelligence: Surveying Collaboration, Failure Attribution, and Self-Evolution in LLM-based Multi-Agent Systems
[
Paper
]
| Organizes the field around four causally linked stages in the agent lifecycle, providing taxonomies for each stage and a cross-stage research agenda for closed-loop, self-improving multi-agent systems.
`survey`
`multi-agent`
`failure-attribution`
(ICSME 2026) Towards Log Analysis for Reliability Engineering of Agentic Systems
[
Paper
]
| Vision paper outlining a research agenda to re-engineer the conventional log-analysis pipeline for agentic systems, proposing research streams toward observability-driven reliability engineering.
`position-paper`
`observability`
`log-analysis`
Empirical Study/Characterization
Empirical research that describes how agents behave and identifies recurring trajectory structures, strategies, and failure patterns.
(ASE 2025 Distinguished Paper Award) Understanding Software Engineering Agents: A Study of Thought-Action-Result Trajectories
[
Paper
]
| Studies 120 trajectories and 2,822 LLM interactions, identifying recurring motifs, anti-patterns, token-use patterns, and feedback-integration agentic coding behavior.
`coding agents`
`thought-action-result`
(ASE-NIER 2025) Exploring autonomous agents: A closer look at why they fail when completing tasks
[
Paper
]
| Develops a three-tier taxonomy that characterizes autonomous-agent failures across task-planning, task-execution, and response-generation phases.
`general-agent`
`failure-taxonomy`
`phase-analysis`
(NeurIPS Dataset&Benchmark 2025) Why Do Multi-Agent LLM Systems Fail?
[
Paper
]
| Analyzes recurring failure modes in multi-agent systems and develops a taxonomy spanning agent design, coordination, and verification.
`multi-agent`
`failure-taxonomy`
(arXiv 2025) Beyond Final Code: A Process-Oriented Error Analysis of Software Development Agents in Real-World GitHub Scenarios
[
Paper
]
| Examines intermediate development behavior beyond final code patches.
`coding-agent`
`error-taxonomy`
`process-analysis`
(arXiv 2025) Demystifying the Lifecycle of Failures in Platform-Orchestrated Agentic Workflows
[
Paper
]
| Characterizes how failures originate, propagate, and become visible across orchestrated agent workflows.
`workflow-agent`
`failure-lifecycle`
`error-propagation`
(arXiv 2025) Understanding Code Agent Behaviour: An Empirical Study of Success and Failure Trajectories
[
Paper
]
| Comparatively studies success and failure trajectories, identifying strategies like defensive programming and context gathering that distinguish successful runs.
`coding-agent`
`comparative-study`
(ASE 2026) Evaluating Plan Compliance in Autonomous Programming Agents
[
Paper
]
| Systematically analyzes 16,991 SWE-agent trajectories, finding that plan quality and reminders substantially affect compliance and task success.
`coding-agent`
`plan-compliance`
(OOPSLA 2026) Process-Centric Analysis of Agentic Software Systems
[
Paper
]
| Introduces Graphectory to encode temporal and semantic relations in agentic trajectories.
`process-analysis`
`trajectory-representation`
(arXiv 2026) Failure as a Process: An Anatomy of CLI Coding Agent Trajectories
[
Paper
]
| Studies failure as a developing process across CLI-agent trajectories.
`CLI-agent`
`process-analysis`
(arXiv 2026) Beyond Resolution Rates: Behavioral Drivers of Coding Agent Success and Failure
[
Paper
]
| Investigates trajectory-level behaviors associated with successful and unsuccessful issue resolution.
`coding-agent`
`behavioral-analysis`
`success-factors`
(arXiv 2026) AgentLens: Revealing The Lucky Pass Problem in SWE-Agent Evaluation
[
Paper
]
| Shows that 10.7% of passing SWE-agent trajectories are "Lucky Passes".
`coding-agent`
`process-assessment`
Failure Localization, Attribution, and Diagnosis
Methods that identify where a trajectory failed, which component was responsible, and why the failure occurred.
(ICML 2025 Spotlight) Which Agent Causes Task Failures and When? On Automated Failure Attribution of LLM Multi-Agent Systems
[
Paper
]
| Formalizes automated failure attribution at both the agent and step levels and introduces the Who&When benchmark.
`multi-agent`
`failure-attribution`
`temporal-localization`
(EMNLP 2025 System Demonstrations) AgentDiagnose: An Open Toolkit for Diagnosing LLM Agent Trajectories
[
Paper
]
| Provides an open, modular toolkit that scores trajectories on five agentic competencies and visualizes decision-making, going beyond simple execution replay.
`general-agent`
`diagnosis`
`toolkit`
(NeurIPS 2025 LLM Evaluation Workshop) Where Did It All Go Wrong? A Hierarchical Look into Multi-Agent Error Attribution
[
Paper
]
| Introduces ECHO, combining hierarchical context representation and consensus voting to perform error attribution across workflow, agent, and step levels.
`multi-agent`
`hierarchical-attribution`
`root-cause-analysis`
(arXiv 2025) GraphTracer: Graph-Guided Failure Tracing in LLM Agents for Robust Multi-Turn Deep Search
[
Paper
]
| Builds Information Dependency Graphs to trace failures through information flow rather than temporal order, distinguishing symptoms from root causes across agent interactions.
`multi-agent`
`graph-analysis`
`failure-tracing`
(arXiv 2025) Abduct, Act, Predict: Scaffolding Causal Inference for Automated Failure Attribution in Multi-Agent Systems
[
Paper
]
| Uses abductive reasoning, interventions, and predictions to causally attribute multi-agent failures.
`multi-agent`
`causal-inference`
`abductive-reasoning`
(ICLR 2026) AgenTracer: Who Is Inducing Failure in the LLM Agentic Systems?
[
Paper
]
| Trains an AgenTracer-8B via counterfactual replay and programmed fault injection to attribute failures to responsible agents or trajectory segments.
`multi-agent-system`
`automated labeling pipeline`
`reinforcement-learning`
(FSE 2026) Who Is Introducing the Failure? Automatically Attributing Failures of Multi-Agent Systems via Spectrum Analysis
[
Paper
]
| Adapts spectrum-based fault-localization from software testing (FAMAS) to score which agent actions are most suspicious across repeated trajectory executions.
`multi-agent`
`SBFL`
`general-agent`
(ACL 2026) Seeing the Whole Elephant: A Benchmark for Failure Attribution in LLM-based Multi-Agent Systems
[
Paper
]
| Introduces TraceElephant, a benchmark and evaluation framework that captures complete multi-agent execution traces for assessing failure attribution across agents, interactions, and time steps.
`multi-agent`
`benchmarking`
(EACL 2026) RAFFLES: Reasoning-Based Attribution of Faults for LLM Systems
[
Paper
]
| Presents an offline evaluation architecture that combines structured reasoning with iterative refinement to attribute system-level failures to faulty agents and execution steps.
`general-agent`
`Judge-Evaluator system`
`iterative reasoning`
(arXiv 2026) TrajAudit: Automated Failure Diagnosis for Agentic Coding Systems
[
Paper
]
| Uses an investigator agent with context-reduction mechanisms to localize the earliest decisive error step in repository-level coding-agent trajectories and generate diagnostic justifications.
`coding-agent`
`long trajectory`
`context-folding`
(arXiv 2026) AgentRx: Diagnosing AI Agent Failures from Execution Trajectories
[
Paper
]
| Synthesizes and checks step-wise constraints to diagnose root causes and pinpoint the earliest unrecoverable point in failed executions.
`general-agent`
`root-cause-analysis`
`failure-localization`
(Findings of ACL 2026) Towards Self-Improving Error Diagnosis in Multi-Agent Systems
[
Paper
]
| Introduces ErrorProbe, which detects local anomalies via failure-taxonomy-conditioned prompting, traces backward from the symptom to prune irrelevant context, then has a multi-agent verifier team (Strategist, Investigator, Arbiter) validate error hypotheses through tool-grounded execution, updating an episodic memory only when a hypothesis is confirmed by executable evidence, without requiring manual annotation.
`multi-agent`
`failure-attribution`
`experience-bank`
(arXiv 2026) MASPrism: Lightweight Failure Attribution for Multi-Agent Systems Using Prefill-Stage Signals
[
Paper
]
| Runs a completed trace through a small LM in two prefill-only passes to flag and re-rank candidate failure steps using token-level negative log-likelihood and attention signals, giving a ~6.7x speedup over single-pass prompting.
`multi-agent`
`failure-attribution`
`prefill-signals`
(Preprint 2026) Diagnosing with Insights: Structured Analysis of Agent Failures via Behavioral Abstractions
[
Paper
]
| Abstracts a completed trajectory into a reasoning-action graph and checks it against taxonomy-derived formal invariants to pinpoint both the failing step and its failure type.
`multi-agent`
`graph-based`
`root-cause-analysis`
(arXiv 2026) Who Broke the System? Failure Localization in LLM-Based Multi-Agent Systems
[
Paper
]
| Introduces AgentLocate, which combines an LLM-based judge with multi-perspective verification by independent evaluators and confidence-aware aggregation, then adapts the judge via lightweight fine-tuning to attribute failures to both the responsible agent and the earliest decisive step.
`multi-agent`
`failure-attribution`
`llm-as-judge`
(arXiv 2026) VerifyMAS: Hypothesis Verification for Failure Attribution in LLM Multi-Agent Systems
[
Paper
]
| Reframes failure attribution as error-first hypothesis verification against full trajectories rather than direct agent-error prediction, decomposing it into trajectory-level error validation and fine-grained agent localization via a fine-tuned LLM verifier.
`multi-agent`
`failure-attribution`
`hypothesis-verification`
(arXiv 2026) StepFinder: A Temporal Semantic Framework for Failure Attribution in Multi-Agent Systems
[
Paper
]
| Encodes execution logs into temporal semantic sequences with an LLM, then uses lightweight temporal modeling and attention over the sequence to score and localize the root-cause step, cutting inference time by 79% versus the fastest LLM-based baseline.
`multi-agent`
`failure-attribution`
`temporal-modeling`
(arXiv 2026) Detect Before You Attribute: Cascade Failure Attribution for Multi-Agent Systems
[
Paper
]
| A extensible plug-and-play detection filter for LLM-based failure attribution.
`cascading failure`
`detect-before-attribute`
Runtime Intervention, Recovery, and Repair
Methods that modify an ongoing or failed execution to prevent, recover from, or repair a failure.
(CHI 2025) Interactive Debugging and Steering of Multi-Agent AI Systems
[
Paper
]
| Introduces AGDebugger, an interface for inspecting, editing, resetting, and steering messages in multi-agent executions.
`multi-agent`
`interactive-debugging`
`runtime-steering`
(AIWare 2026) Wink: Recovering from Misbehaviors in Coding Agents
[
Paper
]
| Detects problematic coding-agent behavior (specification drift, reasoning problems, tool-call failures) and issues targeted course-correction guidance to recover the current execution.
`coding-agent`
`recovery`
`runtime-intervention`
(arXiv 2025) DoVer: Intervention-Driven Auto-Debugging for LLM Multi-Agent Systems
[
Paper
] [
Code
]
| Diagnoses failures by actively intervening on agent interactions (editing messages, altering plans) rather than relying on log-only hypotheses, and uses the resulting evidence to guide repair.
`multi-agent`
`intervention`
`auto-debugging`
(CHI 2026 Extended Abstracts) XAgen: An Explainability Tool for Identifying and Correcting Failures in Multi-Agent Workflows
[
Paper
]
| Connects failure explanations (log visualization, human-in-the-loop feedback, LLM-as-a-judge error detection) to interactive correction of multi-agent workflows.
`multi-agent`
`explainability`
`workflow-repair`
(FSE Companion 2026) Efficient Failure Management for Multi-Agent Systems with Reasoning Trace Representation
[
Paper
]
| Proposes EAGER, which uses unsupervised reasoning-scoped contrastive learning over intra-agent reasoning and inter-agent coordination traces to enable realtime step-wise failure detection, diagnosis, and reflexive mitigation guided by historical failure patterns.
`multi-agent`
`reasoning-trace`
`runtime-intervention`
(arXiv 2026) REFLECT: Intervention-Supported Error Attribution for Silent Failures in LLM Agent Traces
[
Paper
]
| Diagnoses a candidate error step, tests it through controlled replay with a diagnosis-specific patch, and uses the verified outcome flip as contrastive evidence to refine the final attribution.
`general-agent`
`intervention`
`silent-failure`
(Findings of ACL 2026) Metacognitive Self-Correction for Multi-Agent System via Prototype-Guided Next-Execution Reconstruction
[
Paper
]
| Introduces MASC, which reframes step-level error detection as history-conditioned anomaly scoring via next-execution reconstruction and a prototype prior over normal-step embeddings, then triggers a correction agent to revise the flagged step's output before it propagates downstream.
`multi-agent`
`anomaly-detection`
`self-correction`
Learning and Optimization from Trajectories
Methods that use historical trajectories to improve subsequent agent executions.
(arXiv 2025) SCOPE: Prompt Evolution for Enhancing Agent Effectiveness
[
Paper
]
| Uses trajectory feedback to evolve prompts and improve future agent performance.
`general-agent`
`prompt-optimization`
`self-evolution`
(arXiv 2025) Maestro: Joint Graph & Config Optimization for Reliable AI Agents
[
Paper
]
| Jointly optimizes workflow topology and agent configuration using execution evidence.
`workflow-agent`
`graph-optimization`
`configuration`
(FSE 2026) Improving the Efficiency of LLM Agent Systems through Trajectory Reduction
[
Paper
] [
Code
]
| Introduces AgentDiet to remove low-value interactions, reducing token costs while preserving performance.
`general-agent`
`trajectory-reduction`
`efficiency`
(ICSE 2026 Distinguished Paper Award) SEAlign: Alignment Training for Software Engineering Agent
[
Paper
]
| Uses Monte Carlo Tree Search over software-engineering execution data plus preference optimization to align agents with effective development behavior.
`coding-agent`
`alignment-training`
`trajectory-learning`
(ACL 2026) ReCreate: Reasoning and Creating Domain Agents Driven by Experience
[
Paper
]
| Uses accumulated execution experience to construct and refine domain-specific agents.
`general-agent`
`experience-learning`
`agent-construction`
(arXiv 2026) Trajectory-Informed Memory Generation for Self-Improving Agent Systems
[
Paper
]
| Converts prior trajectories into reusable memories that guide future agent decisions.
`general-agent`
`memory`
`self-improvement`
(arXiv 2026) Trace2Skill: Distill Trajectory-Local Lessons into Transferable Agent Skills
[
Paper
]
| Extracts local lessons from execution traces and converts them into reusable skills.
`general-agent`
`skill-distillation`
`experience-learning`
(arXiv 2026) AgentDevel: Reframing Self-Evolving LLM Agents as Release Engineering
[
Paper
]
| Treats agent evolution as a controlled release process driven by execution evidence and regression evaluation.
`general-agent`
`self-evolution`
`release-engineering`
(arXiv 2026) PIVOT: Bridging Planning and Execution in LLM Agents via Trajectory Refinement
[
Paper
]
| Iteratively refines trajectories through a Plan-Inspect-eVOlve-Verify loop that executes candidate plans, computes textual gradients encoding plan-execution discrepancies, and applies them to produce improved trajectories with a monotonic acceptance guarantee.
`general-agent`
`trajectory-refinement`
`self-improvement`
(arXiv 2026) Bug Report Specification Refinement with Trajectory Guidance for Automated Program Repair
[
Paper
]
| Extracts specification evidence from the trajectory of an unverified trajectory-collection run, organizes it into a hierarchical representation, and reviews it against the pre-fix repository to generate a refined bug report that guides downstream repair agents.
`coding-agent`
`trajectory-derived-specification`
.
`program-repair`
Anomaly Detection and Failure Forecasting
Methods that detect abnormal behavior or estimate whether an ongoing trajectory is becoming likely to fail.
(arXiv 2025) Automatic Failure Attribution and Critical Step Prediction Method for Multi-Agent Systems Based on Causal Inference
[
Paper
]
| Uses sequence-aware trajectory features to detect anomalous agent behavior during execution.
`multi-agent`
`causal-inference`
`critical-step-prediction`
(arXiv 2026) ProMAS: Proactive Error Forecasting for Multi-Agent Systems Using Markov Transition Dynamics
[
Paper
]
| Models multi-agent execution as state transitions to forecast failures before task completion.
`multi-agent`
`anomaly-detection`
`failure-forecasting`
Trajectory Quality Assessment
Methods that score the quality/rewarding of individual steps or whole trajectories.
(arXiv 2026) AgentEval: DAG-Structured Step-Level Evaluation for Agentic Workflows with Error Propagation Tracking
[
Paper
]
| Evaluates workflow steps over a dependency graph while accounting for errors propagated from upstream actions.
`workflow-agent`
`step-evaluation`
`DAG`
(arXiv 2026) AgentProcessBench: Diagnosing Step-Level Process Quality in Tool-Using Agents
[
Paper
]
| Introduces human-annotated trajectories and methods for evaluating the quality of individual reasoning and tool-use steps.
`tool-agent`
`process-quality`
`benchmark`
(arXiv 2026) MAESTRO: Multi-Agent Evaluation Suite for Testing, Reliability, and Observability
[
Paper
]
| Provides evaluation dimensions and testing infrastructure for multi-agent reliability and observability.
`multi-agent`
`evaluation`
`testing infrastructure`
(arXiv 2026) Signals: Trajectory Sampling and Triage for Agentic Interactions
[
Paper
]
| Prioritizes trajectories for inspection by sampling and ranking potentially informative agent interactions.
`general-agent`
`trajectory-triage`
`sampling`
(arXiv 2026) ARCO: Adaptive Rubric with Co-Evolution for Multi-Step LLM-Based Agents
[
Paper
]
| Introduces a co-evolution framework that jointly improves an agent and a hierarchical rubric model to provide interpretable step-level process rewards for multi-step trajectories.
`general-agent`
`rubric-evaluation`
`step-level-reward`
(arXiv 2026) AdaRubric: Task-Adaptive Rubrics for Reliable LLM Agent Evaluation and Reward Learning
[
Paper
]
| Dynamically generates task-specific rubrics to evaluate agent trajectories step by step and produce confidence-weighted preference data for reward learning.
`general-agent`
`rubric-evaluation`
`reward-learning`
(arXiv 2026) Agent Step Value: State-Transition Measurement with State-Grounded LLM Evaluators
[
Paper
]
| Measures the value of each agent action by evaluating the change it induces between consecutive environment states with state-grounded LLM evaluators.
`general-agent`
`step-value`
`state-grounded-evaluation`
(ACL-Findings 2026) ToolPRMBench: Evaluating and Advancing Process Reward Models for Tool-using Agents
[
Paper
]
| Introduces a large-scale benchmark of structured, step-level test cases for evaluating and advancing process reward models in tool-using agent scenarios.
`tool-agent`
`process-reward-model`
`benchmark`
(arXiv 2026) Beyond the Final Answer: Evaluating the Reasoning Trajectories of Tool-Augmented Agents
[
Paper
]
| Introduces TRACE, a reference-free framework that builds a progressive evidence bank from an agent's reasoning steps to score trajectory efficiency, hallucination, and adaptivity without requiring ground-truth trajectory annotations.
`tool-agent`
`reference-free-evaluation`
`trajectory-triage`
Trajectory Representation
Methods for structuring, abstracting, and exposing an agent’s internal state and external interactions.
(PACMI 2025) AgentSight: System-Level Observability for AI Agents Using eBPF
[
Paper
]
| Applies system-level telemetry to observe agent interactions with tools, processes, and runtime environments.
`observability`
`ebpf`
(arXiv 2026) CodeTracer: Towards Traceable Agent States
[
Paper
]
| Introduces explicit representations of coding-agent states to support stage- and step-level failure tracing.
`coding-agent`
`state-representation`
(arXiv 2026) From Flat Logs to Causal Graphs: Hierarchical Failure Attribution for LLM-Based Multi-Agent Systems
[
Paper
]
| Converts sequential execution logs into hierarchical causal structures for downstream failure analysis.
`multi-agent`
`causal-graph`
`hierarchical-graph`
(arXiv 2026) GRADE: Graph Representation of LLM Agent Dependency and Execution
[
Paper
]
| Models an agent run as a two-layer graph with execution edges and dependency edges graded, to predict failure likelihood and localize the faulting step.
`general-agent`
`graph-representation`
`dependency-tracing`
Human-Centered Analysis, Visualization, and Explainability
Systems that help people inspect, understand, annotate, compare, or control agent trajectories.
(AAAI 2025 Demonstration) Agent Trajectory Explorer: Visualizing and Providing Feedback on Agent Trajectories
[
Paper
]
| Renders trajectories as navigable thought-action-observation turns and provides an interface for visualizing, annotating, and communicating feedback about agent behavior.
`general-agent`
`visualization`
`human-feedback`
(CHI 2026) DiLLS: Interactive Diagnosis of LLM-Based Multi-Agent Systems via Layered Summary of Agent Behaviors
[
Paper
]
| Uses layered behavioral summaries to help users navigate and diagnose complex multi-agent executions.
`multi-agent`
`interactive-diagnosis`
`summarization`
(arXiv 2026) From Features to Actions: Explainability in Traditional and Agentic AI Systems
[
Paper
]
| Examines how explainability changes when predictions are replaced by sequential, tool-mediated agent actions.
`general-agent`
`explainability`
`conceptual-analysis`
Trajectory Benchmarks and Datasets
Benchmarks are organized by task domain.
Coding Agents
RootSE Bench
[
Paper
] [
HuggingFace
]
| Agentic coding trajectories from diverse coding applications (102 instances, 5,000+ execution steps across 35 repositories) annotated with erroneous-step and diagnostic justification.
`coding-trajectory`
`failure attribution`
`multi-language`
AgentProcessBench
[
Paper
] [
HuggingFace
]
| Human-annotated tool-using trajectories (1,000 trajectories, 8,509 step annotations) for evaluating step-level process quality.
`tool-agent`
`step-annotation`
`process-assessment`
CodeTraceBench
[
Paper
] [
HuggingFace
]
| Coding-agent trajectories (1,000 human-verified) with stage-level annotations for diagnosis.
`stage-annotation`
`failure-localization`
TraceLab
[
Paper
] [
Dataset
]
| A trace of roughly 4,300 coding-agent sessions, containing about 350k LLM steps from our own day-to-day use of Claude Code and Codex.
`day-to-day programming`
`real-world workflow`
General Agents/Mixed
Who&When
[
Paper
]
| 127 multi-agent trajectories annotated with the responsible agent and the time at which the failure was introduced.
`multi-agent`
`agent-attribution`
`temporal-localization`
TRAIL
[
Paper
] [
HuggingFace
]
| 148 GAIA/SWE-Bench-derived agent traces with 841 annotated errors, for reasoning-trace analysis and agentic issue localization.
`multi-agent`
`issue-localization`
`reasoning-trace`
AgentErrorBench
[
Paper
]
| 200 multi-agent/embodied executions (ALFWorld, GAIA, WebShop) annotated under the AgentErrorTaxonomy for failure analysis and attribution.
`multi-agent`
`failure-attribution`
`benchmark`
MP-Bench
[
Paper
]
| Multi-perspective attribution data (289 instances) containing per-annotator failure-reason and ideal-action annotations.
`multi-agent`
`multi-perspective`
`ideal-action`
Aegis
[
Paper
]
| 9,533 trajectories across diverse MAS architectures and task domains, automatically labeled with faulty agents and error modes via an LLM-based error injector, supporting SFT, RL, and contrastive-learning training paradigms.
`multi-agent`
`failure-attribution`
`automated-annotation`
ClawBench
[
Paper
] [
Code
] [
Data
]
| Real-world browser-agent benchmark releasing five-layer run artifacts: MP4 replay, screenshots, HTTP requests, browser actions, and agent messages.
`browser-agent`
`multimodal-trajectory`
`real-world-benchmark`
LongRCA Bench
[
Paper
] [
Data
]
| 1,140 failed trajectories from five task domains, labeled with error agent and error steps.
`multi-task`
`error-step`
`MAS`
Deep-Research Agents
TELBench
[
Paper
] [
HuggingFace
]
| Expert-verified deep-research trajectories (2,790 real traces) segmented into semantic spans, with a 1,000-instance benchmark of harmful-error annotations.
`deep-research-agent`
`span-localization`
Evaluation Methodology
Benchmarks and resources that audit the reliability of evaluation itself, rather than annotating agent trajectories for failure attribution.
AuditRepairBench
[
Paper
]
| Paired-execution trace corpus (576,000 registered cells, 96,000 executed) for auditing evaluator-channel-induced ranking instability on agent-repair leaderboards.
`agent-repair`
`evaluator-bias`
`leaderboard-robustness`
Contributing
Contributions are welcome! To add a paper, tool, or benchmark:
Open a pull request. Add an entry to the most relevant section, following the existing format:
`- **(Venue Year) Title** [[Paper](link)] [[Code](link)] [[Data](link)]`
followed by a one-sentence description and lowercase, hyphenated topic tags.
Contacting
For any enquiries, please contact Dr. Yintong Huo (
ythuo@smu.edu.sg
) or Minxing Wang (
mx.wang.2026@phdcs.smu.edu.sg
). We welcome any discussions and suggestions :)
License
CC0
| to the extent possible under law, this list is released into the public domain.
About
A collection of agent trajectory analysis techniques and benchmark
Topics
agent-trajectory
agentic-ai
ai-agents
awesome-list
llm-agents
trajectory-analysis
Resources
Readme
MIT license
Activity
Stars
97
stars
Watchers
3
watching
Forks
4
forks
Report repository
Releases
Packages
Contributors
You can’t perform that action at this time.
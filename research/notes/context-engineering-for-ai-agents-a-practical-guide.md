---
title: 'Context Engineering for AI Agents: A Practical Guide'
id: context-engineering-for-ai-agents-a-practical-guide
tags:
- ai-software-factory-architecture-58e4cc
- context-engineering
created: '2026-10-12T08:28:24.155824Z'
source: https://mastra.ai/articles/context-engineering
source_domain: mastra.ai
fetched_at: '2026-10-12T08:28:24.150624Z'
fetch_provider: builtin
status: draft
type: note
tier: unknown
content_type: unknown
deprecated: false
---

Context Engineering for AI Agents: A Practical Guide
Articles
/
Foundations
Context engineering for AI agents: a practical guide
Learn what context engineering is, how it differs from prompt engineering, and the strategies for managing context in production agent systems.
Written by
Aron Schuhmann
Reviewed by
Sam Bhagwat
Aug 7, 2026
·
21 min read
On this page
Toggle
You wired up an agent that answered perfectly in testing, then watched it forget instructions, cite stale data, and burn tokens once real conversations ran long. The prompt did not change. What changed was everything else the model saw: tool outputs, retrieved documents, conversation history, and accumulated state. That surrounding information is context, and managing it deliberately is context engineering.
Andrej Karpathy popularized the framing that an LLM behaves like a CPU while its
context window
acts as RAM. Your job is to load the right working set into that limited memory at every step.
Anthropic reported
that multi-agent setups with isolated contexts outperformed single-agent systems on complex research tasks. Building capable agents turned out to be less about wording and more about curation.
This guide covers what is context engineering in AI, how it compares with prompt engineering, the core strategies for managing context, and how to evaluate whether your agent is getting what it needs.
What is context engineering?
Context engineering is the practice of curating and maintaining the optimal set of tokens an LLM sees during inference. That includes the initial prompt, but also the tool definitions, retrieved documents, memory, message history, and structured inputs you pass in. The goal is to find the smallest set of high-signal tokens that reliably produces the behavior you want.
The term rose to prominence as teams moved from single-shot prompts to agents running over many turns. Shopify CEO
Tobi Lutke
described it as the art of providing all the context needed for a task to be plausibly solvable. That reframing matters. It shifts the work from wordsmithing toward system design.
It is now a defining concern across AI engineering broadly, shaping how teams think about every LLM call in a pipeline.
Context vs. the context window
Your context and your context window are related but distinct. The context window is the fixed token capacity a model can attend to in a single inference call. Context is the actual information you choose to place inside that window. One is a hard constraint set by the model. The other is a design decision you make on every turn.
That distinction drives most practical decisions in agentic systems. You rarely have room for everything relevant, so you decide what earns a slot. As an agent runs in a loop, it generates more data that could matter next, and you refine that pool continuously rather than once.
What context includes in machine learning systems
When you build with LLMs, context spans several categories that each need handling:
Instructions:
system prompts, few-shot examples, and tool descriptions
Knowledge:
facts, retrieved documents, and memories
Tool feedback:
the results the agent pulls back mid-task
Each category competes for the same finite window, and each plays a distinct role in how machine learning models produce useful output.
Grouping context this way helps you reason about tradeoffs. Instructions steer behavior, knowledge grounds answers, and tool feedback drives the next decision. When you treat all three as one undifferentiated blob, you lose the ability to tune them independently, which is where most context management problems begin.
Context engineering vs. prompt engineering
If you have done prompt engineering, you already know part of this work. Prompt engineering focuses on writing and organizing instructions, especially the system prompt, to get good one-shot results. It remains a real skill, and it sits inside the larger discipline rather than being replaced by it.
Context engineering is the natural progression. A prompt is discrete: you write it once and reuse it. Context is iterative: the curation step repeats every time you decide what to pass the model. As generative AI applications moved from single-shot prompts to multi-turn agents, teams needed strategies for the whole state, not just the opening instruction.
The table below contrasts the two approaches so you can see where each applies.
Dimension
Prompt engineering
Context engineering
Primary focus
Wording of instructions
Full set of tokens at inference
Scope
System and user prompts
Prompts, tools, memory, retrieval, state
Cadence
Written once, reused
Curated on every turn
Failure mode
Ambiguous instructions
Context rot, distraction, clash
Best fit
Single-shot tasks
Multi-turn agents
A useful way to hold both in mind: prompt engineering asks what you should say, and context engineering asks what the model should see. The second question subsumes the first once your system runs autonomously.
Why context engineering matters for capable agents
Your agents fail in ways that traditional software does not, and most of those failures trace back to context. The classic principle applies here: garbage in, garbage out. A model can return a confident, well-formatted answer that is wrong because it attended to stale or conflicting information.
Getting context right is how you prevent that class of bug before it reaches users. Even as context windows grow, larger is not automatically better.
Models draw on a limited attention budget, and every token you add spends some of it. Treating context as a precious, finite resource is the mental shift that separates agents that hold up in production from demos that fall apart on turn twenty.
The context window challenge and token limits
You hit context window limits faster than you expect once tool outputs start accumulating. A single verbose search result or a large file dump can consume thousands of tokens, and agents call tools repeatedly. Cost and latency climb with every token, so an unmanaged window is both a correctness problem and a budget problem.
The underlying cause is architectural. Transformers let every token attend to every other token, producing n² pairwise relationships. As sequences grow, the LLM stretches its attention thinner, and precision on retrieval and long-range reasoning degrades. This is a gradient, not a cliff, but the gradient is real and shows up in production.
Context rot and degradation over long runs
You will eventually meet context rot: as the token count rises, the model’s ability to accurately recall retrieved information from the window drops. Needle-in-a-haystack benchmarks surface this clearly. Every model exhibits some degradation, though the severity varies, so the safe assumption is that more tokens can mean worse recall.
Several named context failures compound over long runs:
Context poisoning:
a hallucination enters the window and gets treated as fact
Context distraction:
accumulated history overwhelms the model’s training
Context confusion:
superfluous content sways the answer
Context clash:
parts of the context disagree with each other
The anatomy of effective context
You gain the most control by treating each component of context as its own tuning surface. Good context engineering means finding the minimal high-signal set for each part, then assembling them so the model sees a coherent whole. The sections below walk through the components you control on every turn.
Prompt design and instructions
Your instructions should sit at the right altitude: specific enough to guide behavior, general enough to leave the model room to reason. Two failure modes bracket that zone. Hardcoded if-else logic makes prompts brittle and hard to maintain. Vague high-level guidance leaves the LLM without concrete signals for the output you want.
You should organize system instructions into clear sections using headers or tags for background, instructions, tool guidance, and output format. A minimal example looks like this:
```
## Background
You are a research planning agent...
## Instructions
- Break user queries into 2-5 subtasks
- Assign each subtask a priority from 1 to 5
## Output format
Return a JSON object with fields: id, query, priority, date_range
```
Start with a lean prompt on your strongest model, then add examples targeting the specific failures you observe.
User input and output schemas
You shape the user’s input as much as you receive it. Wrapping raw input in delimiters removes ambiguity about where the query starts and what you expect back. This small structuring step prevents a surprising amount of confusion when inputs contain their own formatting or instructions.
Structured output matters just as much when one agent feeds the next. Passing a schema or a JSON object example tells the model exactly what fields and types to return. Without that, an agent might grade priority on a 1-to-10 scale when the next step expects 1-to-5, breaking the handoff. Most frameworks provide this capability natively.
Tools and tool definitions
Your tools define the contract between the agent and its environment, so they deserve the same care as a public API. Each tool should be self-contained, robust to error, and unambiguous about when to use it. Return token-efficient results, because verbose tool output is one of the fastest ways to flood a window.
The most common failure here is a bloated tool set with overlapping functions. If a human engineer cannot say with confidence which tool fits a situation, the agent will not do better. Curating a minimal viable tool set improves selection accuracy and makes long-run context easier to prune later.
Memory and conversation history
You manage two kinds of memory. Short-term memory holds the current session’s conversation history and working state. Long-term memory persists facts and preferences across sessions, often in a vector database or knowledge graphs. Both feed context, and both need selective retrieval so you surface only what the current task requires.
Memory selection is genuinely hard. Pull too little and the agent forgets. Pull too much and you invite distraction or an awkward injection of irrelevant detail. Working memory patterns, where an agent maintains a compact running summary, help keep the active set tight while longer records stay retrievable on demand.
Mastra's guide to agent memory
breaks down these tradeoffs across short-term buffers, working memory, and long-term recall.
Retrieved knowledge and grounding
RAG grounds your agent in external data it was never trained on. A typical retrieval augmented generation pipeline splits documents through chunking, converts chunks to embeddings, and stores them for semantic search. At query time you retrieve the closest matches and place them in context so the model answers from real sources rather than guessing.
Retrieval quality is a core context engineering challenge, not a solved one. Indexing code or documents is not the same as retrieving the right context. Production retrieval systems often combine keyword search, vector similarity, and a reranking step, because semantic matching alone becomes unreliable as your corpus grows.
Core context engineering strategies
You can organize almost every context tactic into four buckets: write, select, compress, and isolate. This framing, popularized by the LangChain team, gives you a checklist for where to intervene when an agent’s context gets unwieldy. Each strategy targets a different phase of the agent’s loop.
Write context
You save information outside the window so the agent can use it later. Scratchpads are the simplest form: the agent writes notes to a file or a state field mid-task and reads them back when needed. This keeps the active window lean while preserving anything the agent might reference later.
Memories extend the same idea across sessions. You can have an agent reflect after each turn and persist what it learned, then retrieve those notes on future runs. Many code assistants use a small always-loaded rules file for procedural memory, which is a lightweight write strategy you can adopt immediately.
Select context
You pull the right information into the window at each step. For scratchpads and state, you decide which fields to expose per turn. For memory collections, you retrieve the entries relevant to the current task, which grows harder as the collection grows.
Tool selection is a form of context selection too. When an agent has many tools, applying retrieval over tool descriptions surfaces only the relevant few, and
research has shown
this can improve tool selection accuracy several times over. The same discipline you apply to documents applies to tools.
Compress context
You keep only the tokens a task actually needs. Summarization is the common lever: when a conversation nears the window limit, you distill it into a high-fidelity summary and continue from there. Coding assistants that auto-compact long sessions demonstrate this at scale.
Trimming is the blunter cousin of summarization. Rather than distilling with an LLM, you filter or prune with heuristics, such as dropping the oldest messages or clearing raw tool results once they have been consumed. Trimming is cheap and safe when you know which content has outlived its usefulness.
Isolate context
You split context so no single window has to hold everything. Sub-agents are the most common approach: each handles a focused sub-task with its own clean window and returns a condensed summary to a coordinating agent. Detailed exploration stays contained, and the lead agent synthesizes distilled results.
State objects and sandboxed environments isolate context too. You can store token-heavy tool outputs in a state field and expose them to the model only when required. Code-based agents can hold large objects as variables in a sandbox, passing back only the values that matter, which keeps binary or bulky data out of the window entirely.
Context retrieval and agentic search
Your retrieval strategy shapes how much the agent knows at any moment. Early agentic apps leaned on embedding-based retrieval computed before inference. The field is now shifting toward runtime approaches where the agent decides what to load as it works, closer to how a person navigates a filesystem than how a search index returns matches.
Enabling dynamic knowledge access
You give an agent dynamic access by handing it lightweight references rather than the full payload. File paths, stored queries, and links let the agent load data on demand instead of pre-loading everything. Metadata on those references carries signal too: a filename, a folder, or a timestamp hints at relevance before the agent ever opens the file.
This mirrors human cognition. You do not memorize an entire codebase. You keep an index and retrieve on demand. Letting agents explore progressively means each interaction yields context that informs the next decision, so the agent assembles understanding layer by layer while keeping the working window focused.
Query augmentation and just-in-time retrieval
Query augmentation improves what you retrieve before you retrieve it. Giving the agent the current date and time, for example, lets it infer accurate date ranges instead of guessing, which sharpens every downstream search. Small context additions like this often produce outsized gains in retrieval quality.
Just-in-time retrieval trades speed for freshness. Runtime exploration is slower than serving pre-computed results, but it avoids stale indexes and lets the agent chase only what the task demands. Many strong agents use a hybrid: drop a small stable set into context up front, then explore autonomously for the rest.
Databases and data formats for retrieval
Your storage choices shape retrieval quality. A vector database supports semantic search over embeddings and suits fuzzy, meaning-based lookups. Knowledge graphs capture explicit relationships and suit queries where structure matters. Plain files and SQL still earn their place when access patterns are predictable and exact matches beat similarity.
Data format decisions cascade into cost and response time. Verbose formats inflate token counts on every retrieval, so trimming fields and returning compact records pays off across thousands of calls. Caching frequent lookups avoids regenerating results you already have, which lowers both cost and latency.
Context engineering with Mastra
If you build AI agents in TypeScript,
Mastra
gives you the primitives context engineering depends on in one open-source framework. Its memory system separates working memory from long-term recall, so you keep the active window lean while persisting facts across sessions. Its workflow engine lets you chain and branch steps, which is the backbone of compaction and sub-agent isolation.
Mastra Studio surfaces an agent’s tools, memory, and workflow steps so you can inspect the context each step assembles.
Retrieval and model access come built in. The retrieval pipeline handles chunking and reranking, while the model router reaches
90+
providers through one interface, so you can pick a cheap model for compaction and a stronger one for reasoning. Traces and evals ship alongside, closing the loop between assembling context and measuring it.
Memory gets the same treatment.
Mastra’s Observational Memory
compresses conversation history into dense observation logs instead of replaying raw messages, so a small context window keeps long-run coherence without restuffing the same history into the prompt on every turn. It scores 94.87% on LongMemEval, the highest recorded result on that benchmark.
Build your first context-aware TypeScript agent on
Mastra
.
Managing context for long-horizon tasks
Your hardest context problems appear on long-horizon tasks, where the token count needed to finish exceeds the window several times over. Large migrations or multi-hour research runs cannot fit in a single window, so you need techniques that preserve coherence across resets.
A monitoring loop lets a long-running agent track progress and refresh its working context as a task unfolds.
Three approaches carry most of the load:
Compaction and summarization:
distill a long conversation into a compact summary and reinitialize a fresh window
Sub-agent isolation:
run focused work in clean windows and return only distilled results
Persistent state:
write intermediate results to a durable store and read them back after resets
Compaction and summarization
You take a conversation nearing the window limit, summarize it, and reinitialize a fresh window with that summary. Done well, this preserves architectural decisions, open bugs, and key implementation details while discarding redundant tool output. The agent continues with minimal loss of coherence.
The art lies in what you keep versus discard. Overly aggressive compaction drops subtle context whose importance only surfaces later. A practical approach is to maximize recall first, capturing everything potentially relevant, then tune for precision by removing clearly superfluous content like consumed tool results.
Sub-agents and context isolation
You run focused work in clean windows and return only distilled summaries to a coordinating agent. A lead agent holds the high-level plan while each sub-agent explores deeply, sometimes spending tens of thousands of tokens, and hands back one or two thousand.
Anthropic reported
that multi-agent setups with isolated contexts outperformed single-agent systems on complex research.
The tradeoff is real. Multi-agent architectures can use many times more tokens than a single chat, and they demand careful planning to divide work and coordinate results. Reach for isolation when parallel exploration genuinely pays off, not as a default for every task.
Persisting state across turns
You keep an agent coherent across summarization steps and session boundaries by writing to a durable store. Structured note-taking, where the agent writes results and reads them back after a reset, lets it track objectives across thousands of steps. This is how agents sustain multi-hour tasks that no single window could hold.
Your runtime state object is the workhorse here. A well-designed schema lets you write intermediate results to specific fields, expose only the message list to the model each turn, and keep everything else retrievable but out of the way. State becomes both your scratchpad and your isolation boundary.
Context engineering in practice: building an agent
You can see these ideas converge in a concrete build. Consider a multi-agent research assistant where a planning agent breaks a user query into search subtasks. This single component exercises nearly every context concern, from instructions to structured output to retrieval, which makes it a good worked example.
A planning agent decomposes a query and routes subtasks to specialized agents, each with its own scoped context.
The planner’s instructions do far more than state a goal. They define the exact fields each subtask must contain, give an ID convention, and constrain priority to a 1-to-5 scale. They also provide a JSON object example so outputs stay consistent. Omitting the scale detail alone would let the model invent its own, breaking the handoff to the next step.
The output schema ties the workflow together. Because the planner emits a parseable schema, downstream search agents consume its results without guesswork. Injecting the current date and time into context lets the planner infer accurate date ranges, so searches target the right window instead of guessing at “last week.”
The build also shows where compression earns its keep. Caching subqueries for repeated user queries lets the system skip regenerating a plan it already has, cutting both cost and response time. That is context engineering as an efficiency lever, not only a correctness one. It chooses the right context for the goal rather than reflexively calling the LLM again.
Evaluating and debugging context in agent runs
You cannot improve context you cannot see. Because agents run non-deterministically across many steps, the only reliable way to know whether your context engineering helps or hurts is to trace what actually reached the model and measure the result. Evaluation is the feedback loop that turns guesswork into iteration.
Tracing what context reaches the model
Your first requirement is visibility into every step. Tracing captures each model call, tool invocation, and workflow step as a span, recording the inputs, outputs, token counts, and timing.
Tools like
LangSmith
log each model call alongside the context that produced it, giving you a searchable record of what the model actually saw. With that trace you can see the exact context assembled at each turn, which is where most context bugs hide.
An agent trace groups every model call and tool invocation under one run, exposing the context and token usage at each step.
Token accounting matters as much as the sequence. When a run balloons in cost or slows down, the trace shows which tool output or retrieved document flooded the window. That lets you target compression exactly where it pays off instead of trimming blindly across the whole pipeline.
Evals for context quality
Evals tell you whether a context change improved behavior or quietly regressed it. Running your agent against a fixed dataset with scorers gives you a pass-fail signal on every change, so you catch a summarization tweak that drops recall before users do.
LangSmith
provides hosted eval runners that score agent trajectories against rubrics you define, making it straightforward to track regressions across deploys. Without evals, you are tuning context on vibes.
You should design evals around the failures context causes. Score for hallucinations to catch context poisoning, for faithfulness to retrieved sources, and for whether the agent used the right tool. LangSmith’s annotation queues let reviewers grade full multi-turn trajectories, not just single answers, which surfaces the degradation that only appears over long runs.
Guardrails for prompt injection and output sanitization
Your context is an attack surface. Untrusted content pulled into the window through retrieval or tool output can carry prompt injection that hijacks the agent’s behavior. You should treat every external input as suspect and sanitize both what enters the context and what the agent emits.
Mastra supports input and output processors that let you filter and validate content as it flows through an agent, which gives you a place to enforce these guardrails. Pairing that with tracing means you can confirm a malicious payload was caught rather than silently passed to the model.
Tools and frameworks for context engineering
You have a growing set of frameworks that treat context as a first-class concern. LangGraph exposes low-level control over state, letting you define exactly what each node reads and writes. LangGraph pairs with LangSmith for tracing and evaluation, so you can inspect every context snapshot alongside the score it produced.
This combination suits teams that want fine-grained orchestration and work primarily in Python.
Mastra
covers the same territory for TypeScript teams, bundling memory, workflows, retrieval, and observability so you do not stitch separate tools together. Beyond full frameworks, the
Model Context Protocol
(
MCP
) standardizes how agents connect to external data sources, so you can expose context providers once and reuse them across clients.
When you evaluate your options, prioritize a few things:
Tracing and evals:
you cannot engineer context you cannot observe
Memory primitives:
both short-term and long-term recall should be built in
Deployment flexibility:
your framework should deploy wherever your stack runs
The right choice depends on your stack and how much control you want. Low-level frameworks give you precision at the cost of setup. Higher-level ones trade some control for speed.
Wrapping up
Context engineering comes down to a single discipline: decide, on every turn, the smallest set of high-signal tokens that gets your agent to the right outcome. Start by tracing what reaches the model, apply, write, select, compress, and isolate where the trace shows waste, and measure each change with evals.
For depth on these patterns,
Principles of Building AI Agents
treats context and observability as core production concerns.
Frequently asked questions
What are the pillars of context engineering?
The core pillars are writing context outside the window, selecting the right information into it, compressing what is kept, and isolating work across separate windows. On top of these sit component-level concerns: system instructions, tool definitions, memory, and retrieved knowledge. Together they let you keep the model’s limited attention budget focused on high-signal tokens for each step of a task.
What is an example of context engineering?
A research planning agent is a clear example. Its instructions define exact output fields, constrain priority to a 1-to-5 scale, and include a JSON schema so downstream agents can parse results. Injecting the current date lets it infer accurate search ranges, and caching prior subqueries avoids regenerating plans. Every choice curates what the model sees.
How is context engineering different from RAG?
RAG is one technique within context engineering. Retrieval augmented generation fetches relevant documents and places them in the window so the model answers from real sources. Context engineering is the broader discipline that decides what to retrieve, alongside how to handle instructions, tools, memory, compression, and isolation. Retrieval answers the knowledge question, context engineering governs the entire context state.
How do you manage context window limitations in production agents?
You manage window limits with a mix of strategies. Compaction summarizes long conversations into a fresh window. Trimming drops consumed tool results and old messages. Sub-agents isolate deep work in separate windows and return distilled summaries. Just-in-time retrieval loads data on demand rather than pre-loading everything. Tracing token usage shows exactly where to apply each lever.
When should you compress versus isolate context?
Compress when the work is one continuous conversation that needs coherence, such as an iterative coding session. Summarization preserves the thread while shrinking tokens. Isolate when sub-tasks are independent and parallelizable, such as researching several topics at once. Sub-agents with clean windows explore each in depth and return summaries. Isolation costs more tokens overall, so reserve it for genuine parallelism.
How does memory fit into a context engineering strategy?
Memory supplies context across turns and sessions. Short-term memory holds the current conversation and working state, feeding the active window each turn. Long-term memory persists facts and preferences in a store you retrieve from selectively. The engineering challenge is selection: surface only what the current task needs, since pulling too much invites distraction and pulling too little causes the agent to forget.
How do you evaluate whether an agent is getting the right context?
Start with tracing to capture the exact context assembled at each step, including inputs, outputs, and token counts. Then run evals against a fixed dataset with scorers for hallucinations, faithfulness to sources, and correct tool use. LangSmith makes it straightforward to grade full multi-turn trajectories, not just single answers, so you catch degradation that only appears over long runs.
What tools help implement context engineering in TypeScript?
You have several options depending on how much control you want. Look for a framework that bundles memory, a RAG pipeline, a workflow engine, model routing, and built-in tracing and evals. Support for MCP servers is also valuable for exposing tools and resources across clients. The key is choosing a tool where you can write, select, compress, and isolate context without stitching separate libraries together.
Share on
X
or
LinkedIn
Aron Schuhmann
Head of Demand Generation
Aron Schuhmann is the Head of Demand Generation at Mastra. A career-long B2B SaaS marketer, he has worked at the intersection of AI and developer tools since 2015, serving as an early growth and demand-generation hire at MightyAI (acquired by Uber), Gatsby (acquired by Netlify), and OctoAI (acquired by NVIDIA).
All articles by
Aron Schuhmann
→
Sam Bhagwat
CEO
Sam Bhagwat is the founder and CEO of Mastra. He co-founded Gatsby, which was used by hundreds of thousands of developers. A Stanford graduate and veteran of web development, he authored 'Principles of Building AI Agents' (2025).
All articles by
Sam Bhagwat
→
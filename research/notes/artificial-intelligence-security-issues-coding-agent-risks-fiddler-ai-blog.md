---
title: 'Artificial Intelligence Security Issues: Coding Agent Risks | Fiddler AI Blog'
id: artificial-intelligence-security-issues-coding-agent-risks-fiddler-ai-blog
tags:
- ai-software-factory-architecture-58e4cc
- zero-hallucination
- agent-sandboxing
- security-governance
created: '2026-10-12T08:28:51.747186Z'
updated: '2026-10-12T08:33:13.710422Z'
source: https://www.fiddler.ai/blog/artificial-intelligence-security-issues
source_domain: www.fiddler.ai
fetched_at: '2026-10-12T08:28:51.745508Z'
fetch_provider: builtin
status: draft
type: note
tier: unknown
content_type: unknown
deprecated: false
summary: 'Fiddler AI vendor blog arguing autonomous coding agents break traditional
  human-in-the-loop security assumptions since the agent is both author and reviewer.
  Identifies five agent-specific risk categories traditional tools miss: (1) credential/secret
  exposure in generated code/commits (cites GitGuardian State of Secrets Sprawl 2024);
  (2) prompt injection through code context -- malicious instructions embedded in
  comments, READMEs, issue descriptions (cites Simon Willison 2022, OWASP Top 10 for
  LLM Apps, and arXiv:2601.17548 on agentic coding assistant prompt injection); (3)
  unauthorized tool invocations absent scoped allowlists (cites NIST AI RMF 1.0);
  (4) unauditable decision chains -- no commit-message-equivalent record of agent
  reasoning; (5) shadow agent proliferation -- informal agent deployments with personal
  access tokens (cites OWASP Top 10 for Agentic Applications 2026). Recommends treating
  coding agents as non-human IAM identities with scoped/rotatable credentials, pre-LLM
  and post-execution guardrails (secret/PII redaction, prompt-injection blocking),
  span-level tracing of every tool call/LLM call/sub-agent decision, and a governance
  checklist (inventory agents, assign NHIs, allowlist tools, instrument telemetry,
  deploy guardrails, monitor behavioral anomalies, maintain auditable traces). Cites
  a directional estimate of ~$260K/year at 500K traces/day for external evaluation
  API costs as the ''AI Trust Tax'' Fiddler''s in-environment Trust Models avoid.'
---

Artificial Intelligence Security Issues: Coding Agent Risks | Fiddler AI Blog
Blog
/
Takes
/
How Autonomous Coding Agents Are Reshaping Artificial Intelligence Security Issues
Published on
May 22, 2026
Last Updated
July 1, 2026
How Autonomous Coding Agents Are Reshaping Artificial Intelligence Security Issues
Fiddler Team
Table of Contents
Takes
Key Takeaways
Autonomous coding agents introduce artificial intelligence security issues that traditional vulnerability scanners and code review tools were never designed to catch.
Treating AI agents as non-human identities with scoped credentials, audit trails, and enforceable policies is the foundation of enterprise agent governance.
Real-time observability across the full agentic hierarchy, from orchestrator to individual tool calls, is required to detect and contain threats before they escalate.
Governance must precede autonomy; organizations that bolt security onto agents after deployment inherit compounding risk with every production release.
Why Traditional Security Models Break Down With Coding Agents
Autonomous coding agents are not code-assist tools. A code-assist tool suggests completions inside an IDE. It waits for a developer to accept, reject, or modify each suggestion. An autonomous coding agent operates differently. It receives a high-level objective, decomposes it into subtasks, invokes tools, writes code, installs dependencies, and can push changes to a repository or deploy to staging without a human reviewing each step.
Traditional
AI security
assumes a human is in the loop at critical decision points. Code review, dependency approval, credential management, and deployment authorization all rely on a person evaluating risk before an action takes effect. Coding agents collapse that assumption, making the agent both author and reviewer.
Consider a concrete failure scenario. A coding agent tasked with building a microservice pulls in an unvetted third-party library. During integration, the agent reads environment variables to configure a database connection. It embeds a connection string containing production credentials directly into a configuration file. It then commits and pushes the change to a staging branch. No human reviewed the dependency choice, the credential handling, or the deployment. Each of these decisions would normally pass through at least one human checkpoint.
The attack surface expands from static code artifacts to dynamic agent behavior. Traditional static analysis tools scan code for known vulnerability patterns. They do not model the decisions an agent made to produce that code. The OWASP Foundation [1] has begun cataloging risks specific to LLM applications, but the behavioral dimension of autonomous agents remains an unaddressed risk in most enterprise security programs.
Five Agent Risks that Traditional Security Tools Cannot Catch
The security risks that generative AI introduces go beyond traditional threat models. Coding agents create five distinct categories of risk.
Credential And Secret Exposure
Coding agents routinely need access to APIs, databases, cloud services, and internal tooling. When an agent retrieves credentials from environment variables, secret stores, or configuration files, it can inadvertently embed them in generated code, log outputs, or commit messages. Unlike a human developer who recognizes that a connection string should never appear in plaintext, an agent treats all text as context. The GitGuardian report [2] found that secrets exposure in repositories continues to grow year over year. Autonomous agents accelerate this trend by generating and committing code at machine speed with no inherent awareness of what constitutes sensitive data.
Prompt Injection Through Code Context
Coding agents consume large volumes of context: repository files, documentation, issue trackers, and pull request comments. An attacker can embed malicious instructions inside a code comment, a README file, or an issue description. When the agent ingests this context, it may interpret the injected instructions as part of its task. This is prompt injection applied to the software development lifecycle. Prompt injection research [6] and work by Simon Willison [3] have documented how indirect prompt injection can redirect LLM behavior through poisoned context. In a coding agent scenario, this can result in the agent executing unauthorized commands or exfiltrating data through generated code. Understanding these
LLM risks
is essential for any team deploying coding agents.
Unauthorized Tool Invocations
Coding agents interact with external tools: package managers, cloud CLIs, CI/CD pipelines, and deployment systems. If an agent's tool permissions are not scoped, it can invoke any tool it has access to. An agent instructed to update a test suite could, without proper constraints, trigger a production deployment. The NIST framework [4] emphasizes the importance of constraining AI system actions to their intended scope. For coding agents, this means defining explicit allowlists for tool invocations.
Unauditable Decision Chains
When a human developer makes a series of decisions, the reasoning is often captured in commit messages, pull request descriptions, and code review threads. Coding agents make hundreds of decisions per session with no equivalent record. Why did the agent choose one library over another? Why did it restructure a module? Why did it skip a test? Without full tracing of the agent's decision chain, security teams cannot reconstruct what happened during an incident. This lack of auditability is a governance failure, not just a security one.
Shadow Agent Proliferation
Development teams are already deploying coding agents informally. Engineers experiment with different agent frameworks, connect them to internal repositories, and run them with personal access tokens. This mirrors the shadow IT problem enterprises faced a decade ago with cloud services. The OWASP Top 10 [5] for agentic applications highlights the risks of unregistered agents. Organizations that lack a central registry of active agents cannot enforce consistent policies, rotate credentials, or audit behavior. The proliferation of unregistered agents creates blind spots that compound over time. Teams that have experienced
rogue agents
in enterprise deployments understand these risks firsthand.
From Security To Governance: The Right Frame For Coding Agent Risk
Security tooling alone is insufficient. Vulnerability scanners, secret detectors, and static analysis tools address specific threat categories. They do not answer the three questions that enterprise leaders need resolved before expanding agent autonomy.
Is the agent performing as expected?
Is the agent operating safely?
Is the cost of oversight justified by the value delivered?
These are governance questions that require a framework connecting policy definition, behavioral monitoring, and audit trails into a unified system. AI security is a critical component of that framework, but it is a subset of AI governance, not a replacement for it.
The Fiddler AI Observability and Security Platform provides the infrastructure for this governance-first approach. Every tool invocation, LLM call, and sub-agent decision is recorded as a span-level trace, giving teams the decision chain reconstruction that coding agent incidents require. Pre-LLM guardrails intercept inputs before they reach the model, blocking prompt injection attempts embedded in code context. Post-execution guardrails inspect outputs before they are returned or acted upon, redacting credentials, PII, and secrets from generated code before it reaches a repository.
A simplified guardrail configuration for a coding agent might look like this:
```
# Example: Post-execution guardrail policy for a coding agent
guardrail_config = {
    "name": "coding-agent-output-scan",
    "stage": "post_execution",
    "checks": [
        {"type": "secret_detection", "action": "redact"},
        {"type": "pii_detection", "action": "redact"},
        {"type": "prompt_injection", "action": "block"}
    ],
    "scope": ["generated_code", "commit_messages", "tool_invocations"]
}
```
Fiddler
Centor Models
(previously known as Trust Models) are batteries-included and run evaluation in-environment with no external API calls and no per-evaluation cost, eliminating the AI Trust Tax. At production scale, enterprises can incur approximately $260K annually at 500K traces per day when using external evaluation. These figures are directional estimates that vary by model, deployment size, and traffic volume.
Every agent session is fully traceable, every policy enforcement action is logged, and an AI registry provides enterprise-wide visibility across all live, testing, and retired agents. Comprehensive
agent evaluation
ensures that governance controls are performing as intended.
What to Watch For:
A common misconfiguration we see in production is teams deploying AI Guardrails on user inputs but skipping guardrails on agent-generated outputs. For coding agents, this is especially dangerous. The agent's outputs (generated code, tool invocations, deployment commands) are where credential exposure and unauthorized actions occur. Always deploy post-execution guardrails on agent outputs, not just pre-LLM guardrails on inputs.
A Governance Checklist Before You Expand Coding Agent Autonomy
Before expanding coding agent autonomy, we recommend completing each of the following steps.
Inventory all active coding agents and permission scopes.
Identify every agent operating in your environment, including informal deployments by individual engineers. Document which repositories, tools, and services each agent can access.
Assign non-human identities with scoped, rotatable credentials.
Treat each coding agent as a distinct identity in your IAM system. Issue credentials that are scoped to the minimum required permissions and rotate them on a defined schedule.
Define enforceable policies for tool invocations.
Create explicit allowlists for the tools each agent can invoke. A code generation agent should not have permission to trigger production deployments.
Instrument with standardized telemetry.
Capture span-level traces for every agent session. Ensure telemetry covers tool calls, LLM interactions, and sub-agent delegations across the full agentic hierarchy.
Deploy pre-LLM guardrails on ingested context.
Intercept and inspect all context the agent consumes before it reaches the model. Block prompt injection attempts embedded in code comments, documentation, or issue descriptions.
Deploy post-execution guardrails to redact credentials and PII.
Inspect all agent-generated outputs. Redact secrets, connection strings, API keys, and personally identifiable information before code is committed or deployed. Review
guardrail metrics
to ensure redaction coverage.
Establish continuous monitoring with behavioral anomaly alerts.
Set baselines for normal agent behavior. Alert on deviations such as unexpected tool invocations, unusual token consumption, or access to resources outside the agent's defined scope.
Maintain auditable traces for every agent session.
Ensure that every decision the agent makes is reconstructable. Compliance and incident response teams need to trace from an observed outcome back through the full decision chain.
Governance Architectures Must Scale With Agent Autonomy
The introduction of autonomous coding agents into enterprise development workflows is not a temporary experiment. It is a structural shift in how software is built. The organizations that treat this shift as a governance challenge, not merely a security problem, will be positioned to expand agent autonomy safely across hundreds of agents and thousands of daily sessions.
Governance architectures must grow with agent capabilities. As coding agents gain the ability to coordinate across repositories, manage infrastructure, and make architectural decisions, the policies, telemetry, and controls governing their behavior must expand in parallel. The enterprises that invest in this foundation now will pull ahead with every new agent capability they adopt. Those that defer governance accumulate risk with every release.
To see how Fiddler governs coding agents from credential detection to full session auditability,
explore the Control Plane for AI Agents
.
References
[1] OWASP Foundation, "OWASP Top 10 for LLM Applications," 2024. [Online]. Available: https://owasp.org/www-project-top-10-for-large-language-model-applications/
[2] GitGuardian, "The State of Secrets Sprawl 2024," GitGuardian, 2024. [Online]. Available: https://www.gitguardian.com/state-of-secrets-sprawl-report-2024
[3] S. Willison, "Prompt Injection Attacks Against GPT-3," simonwillison.net, 2022. [Online]. Available: https://simonwillison.net/2022/Sep/12/prompt-injection/
[4] National Institute of Standards and Technology, "AI Risk Management Framework (AI RMF 1.0)," NIST, 2023. [Online]. Available: https://www.nist.gov/artificial-intelligence/executive-order-safe-secure-and-trustworthy-artificial-intelligence
[5] OWASP Foundation, "OWASP Top 10 for Agentic Applications," 2026. [Online]. Available: https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/
[6] Maloyan, N. and Namiot, D., "Prompt Injection Attacks on Agentic Coding Assistants: A Systematic Analysis of Vulnerabilities in Skills, Tools, and Protocol Ecosystems," arXiv:2601.17548, 2026. [Online]. Available: https://arxiv.org/html/2601.17548v1
Frequently Asked Questions
What are the biggest artificial intelligence security issues with coding agents?
The primary risks are credential and secret exposure in generated code, prompt injection through poisoned code context, unauthorized tool invocations, unauditable decision chains, and shadow agent proliferation across development teams.
How should enterprises treat AI coding agents from a security perspective?
Enterprises should treat coding agents as non-human identities with scoped credentials, explicit tool permissions, and full session-level auditability. This aligns agent management with existing IAM and governance frameworks.
What is the difference between AI security and AI governance?
AI security focuses on protecting AI systems from threats such as prompt injection, data exfiltration, and unauthorized access. AI governance is the broader framework that includes security alongside policy enforcement, behavioral monitoring, audit trails, and organizational accountability for AI system outcomes.
Subscribe to our Newsletter
Monthly curated AI content, Fiddler updates, and more.
Experience the Enterprise AI Control Plane
Request demo
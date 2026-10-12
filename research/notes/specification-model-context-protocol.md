---
title: Specification - Model Context Protocol
id: specification-model-context-protocol
tags:
- ai-software-factory-architecture-58e4cc
- mcp-security
- ground-truth
created: '2026-10-12T08:36:25.762646Z'
updated: '2026-10-12T08:38:51.637793Z'
source: https://modelcontextprotocol.io/specification/2025-06-18
source_domain: modelcontextprotocol.io
fetched_at: '2026-10-12T08:36:25.761675Z'
fetch_provider: builtin
status: draft
type: note
tier: unknown
content_type: unknown
deprecated: false
summary: 'Official Model Context Protocol (MCP) base specification (2025-06-18 version),
  the authoritative short-form protocol document defining MCP as a JSON-RPC 2.0 based
  standard connecting LLM ''hosts'', ''clients'', and ''servers'' for sharing context
  (Resources), workflows (Prompts), and executable capabilities (Tools), plus client-offered
  features (Sampling, Roots, Elicitation). Directly states the protocol''s security
  and trust foundation, load-bearing for the context-isolation/tool-security pillar:
  tools ''represent arbitrary code execution and must be treated with appropriate
  caution''; tool-behavior descriptions/annotations must be considered untrusted unless
  sourced from a trusted server; hosts must obtain explicit user consent before invoking
  any tool, exposing user data to servers, or allowing LLM sampling requests; and
  the protocol intentionally limits server visibility into prompts during sampling.
  Notes explicitly that MCP itself cannot enforce these principles at the protocol
  level — security depends entirely on implementors building consent/authorization
  flows, which is why the companion Security Best Practices document exists.'
---

*Suggested by [[mastering-claude-agent-sdk-best-practices-for-developing-ai-agents-2025]] — primary MCP protocol specification (2025-06-18) referenced for context isolation and tool security*

Specification - Model Context Protocol
Documentation Index
Fetch the complete documentation index at:
/llms.txt
Use this file to discover all available pages before exploring further.
Skip to main content
Model Context Protocol
(MCP) is an open protocol that
enables seamless integration between LLM applications and external data sources and
tools. Whether you’re building an AI-powered IDE, enhancing a chat interface, or creating
custom AI workflows, MCP provides a standardized way to connect LLMs with the context
they need.
This specification defines the authoritative protocol requirements, based on the
TypeScript schema in
schema.ts
.
For implementation guides and examples, visit
modelcontextprotocol.io
.
The key words “MUST”, “MUST NOT”, “REQUIRED”, “SHALL”, “SHALL NOT”, “SHOULD”, “SHOULD
NOT”, “RECOMMENDED”, “NOT RECOMMENDED”, “MAY”, and “OPTIONAL” in this document are to be
interpreted as described in
BCP 14
[
RFC2119
]
[
RFC8174
] when, and only when, they
appear in all capitals, as shown here.
​
Overview
MCP provides a standardized way for applications to:
Share contextual information with language models
Expose tools and capabilities to AI systems
Build composable integrations and workflows
The protocol uses
JSON-RPC
2.0 messages to establish
communication between:
Hosts
: LLM applications that initiate connections
Clients
: Connectors within the host application
Servers
: Services that provide context and capabilities
MCP takes some inspiration from the
Language Server Protocol
, which
standardizes how to add support for programming languages across a whole ecosystem of
development tools. In a similar way, MCP standardizes how to integrate additional context
and tools into the ecosystem of AI applications.
​
Key Details
​
Base Protocol
JSON-RPC
message format
Stateful connections
Server and client capability negotiation
​
Features
Servers offer any of the following features to clients:
Resources
: Context and data, for the user or the AI model to use
Prompts
: Templated messages and workflows for users
Tools
: Functions for the AI model to execute
Clients may offer the following features to servers:
Sampling
: Server-initiated agentic behaviors and recursive LLM interactions
Roots
: Server-initiated inquiries into uri or filesystem boundaries to operate in
Elicitation
: Server-initiated requests for additional information from users
​
Additional Utilities
Configuration
Progress tracking
Cancellation
Error reporting
Logging
​
Security and Trust & Safety
The Model Context Protocol enables powerful capabilities through arbitrary data access
and code execution paths. With this power comes important security and trust
considerations that all implementors must carefully address.
​
Key Principles
User Consent and Control
Users must explicitly consent to and understand all data access and operations
Users must retain control over what data is shared and what actions are taken
Implementors should provide clear UIs for reviewing and authorizing activities
Data Privacy
Hosts must obtain explicit user consent before exposing user data to servers
Hosts must not transmit resource data elsewhere without user consent
User data should be protected with appropriate access controls
Tool Safety
Tools represent arbitrary code execution and must be treated with appropriate
caution.
In particular, descriptions of tool behavior such as annotations should be
considered untrusted, unless obtained from a trusted server.
Hosts must obtain explicit user consent before invoking any tool
Users should understand what each tool does before authorizing its use
LLM Sampling Controls
Users must explicitly approve any LLM sampling requests
Users should control:
Whether sampling occurs at all
The actual prompt that will be sent
What results the server can see
The protocol intentionally limits server visibility into prompts
​
Implementation Guidelines
While MCP itself cannot enforce these security principles at the protocol level,
implementors
SHOULD
:
Build robust consent and authorization flows into their applications
Provide clear documentation of security implications
Implement appropriate access controls and data protections
Follow security best practices in their integrations
Consider privacy implications in their feature designs
​
Learn More
Explore the detailed specification for each protocol component:
Architecture
Base Protocol
Server Features
Client Features
Contributing
Was this page helpful?
Yes
No
Assistant
Responses are generated using AI and may contain mistakes.
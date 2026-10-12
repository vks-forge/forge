---
title: 'MCP Servers: The New Security Nightmare | Equixly'
id: mcp-servers-the-new-security-nightmare-equixly
tags:
- ai-software-factory-architecture-58e4cc
- blast-radius
- adversarial-review
- security-sweep
created: '2026-10-12T08:39:34.249884Z'
updated: '2026-10-12T08:40:05.833562Z'
source: https://equixly.com/blog/2025/03/29/mcp-server-new-security-nightmare/
source_domain: equixly.com
fetched_at: '2026-10-12T08:39:34.248857Z'
fetch_provider: builtin
status: draft
type: note
tier: unknown
content_type: unknown
deprecated: false
summary: 'Equixly (AI security vendor, founded by Alessio Dalla Piazza) March 29,
  2025 primary research blog -- confirmed source of the 43%/30% MCP vulnerability
  statistics Wiz''s orchestration guide cited. Equixly''s security assessment of popular
  MCP server implementations over roughly one month found: 43% contained command injection
  vulnerabilities, 22% allowed path traversal/arbitrary file read outside intended
  directories, 30% permitted unrestricted SSRF-style URL fetching, and 5% had other
  miscellaneous security issues. On vendor responsiveness to disclosure: only 30%
  acknowledged and released fixes, 45% claimed the risks were ''theoretical'' or ''acceptable,''
  and 25% did not respond at all. Documents root causes as protocol-level design flaws,
  not just implementation bugs: MCP mandates session identifiers directly in URLs
  (GET /messages/?sessionId=UUID), exposing them in logs and enabling session hijacking;
  the spec provides minimal authentication guidance leading to inconsistent/weak implementations;
  and it lacks required message-signing or integrity-verification mechanisms, allowing
  tampering. Flags that MCP servers can be invoked by any caller, not only LLMs --
  so the attacker has none of the ''plan/act'' transparency an LLM caller would show,
  expanding the practical attack surface beyond what most implementers have secured.
  Directly substantiates the whitepaper''s ''blast radius'' pillar: concrete, reproducible
  command-injection exploitation pattern demonstrated against a real popular MCP server
  implementation.'
---

*Suggested by [[what-is-ai-agent-orchestration-guide-to-multi-agent-systems-wiz]] — candidate primary source for the 43% command-injection / 30% unrestricted-URL-fetch MCP server vulnerability stats cited by Wiz*

MCP Servers: The New Security Nightmare | Equixly
Blog
AI Security
MCP Servers: The New Security Nightmare
Table of contents
The Model Context Protocol Architecture
Security Research Findings
The Universal Attack Surface
Common Vulnerability Pattern: Command Injection
Practical Exploitation Example
Missing Secure by Design: Protocol Fundamentals
Another Abstraction Layer ?
Conclusion
We spent the past weeks deep diving into some R&D, and I’m genuinely surprised at how we’re still seeing Remote Code Execution (RCE) vulnerabilities—particularly from command injection—emerge in 2025. It feels like we’re facing a regression in security, with these fundamental vulnerabilities resurfacing in modern technologies.
What’s even more concerning is that these vulnerabilities aren’t limited to legacy systems anymore; they’re showing up in the most up-to-date implementations.
New technologies and frameworks are ironically providing attack surfaces that allow developers to have RCE in their implementation.
The Model Context Protocol Architecture
The Model Context Protocol (MCP) has emerged as a standardized approach for connecting Large Language Models (LLMs) to external data sources and tools. Positioned as the “USB-C for AI applications”, MCP establishes a client-server architecture that enables AI models to interact with diverse data sources and tools through a unified interface.
Technical Architecture Overview
MCP implements a multi-layered architecture consisting of:
MCP Hosts
: Applications like Claude Desktop, IDEs, or specialized AI tools that require external data access.
MCP Clients
: Protocol implementations that establish and maintain connections with MCP servers.
MCP Servers
: Backend services that implement the MCP specification and expose data sources or tools to clients.
Data Sources
: Local files, databases, APIs, or other resources that MCP servers can access.
The protocol follows RESTful design principles with WebSocket support for real-time communications, using HTTP/HTTPS for transport, JSON for serialization, and
no authentication by default
.
Security Research Findings
At Equixly, we’ve conducted security assessments of some of the most popular MCP server implementations over the past month. Our findings reveal a troubling security landscape:
Vulnerability Distribution
Our analysis revealed:
Command Injection Vulnerabilities
: 43% of tested implementations contained command injection flaws
Path Traversal/Arbitrary File Read
: 22% allowed accessing files outside intended directories
SSRF Vulnerabilities
: 30% permitted unrestricted URL fetching
Other Security Issues
: 5% had miscellaneous security concerns
Vendor Response
Most concerning is the response from development teams when notified:
30% acknowledged and released fixes
45% claimed the security risks were “theoretical” or “acceptable” - aka if you give a monkey a gun, it’s not the monkey’s fault
25% did not respond to our security disclosures
The Universal Attack Surface
An important aspect often overlooked: MCP servers can be called by anyone, not just LLMs. While LLMs typically show what they’re going to do with “plan” and “act” phases, a malicious attacker has no such transparency. This creates an expanded attack surface that many developers haven’t properly secured.
We’re not alone in these findings. Other security researchers like
@junr0n
have independently discovered similar vulnerabilities across the MCP ecosystem.
Common Vulnerability Pattern: Command Injection
Let’s examine a common pattern discovered in our research. Consider this actual implementation code from a popular MCP server:
This code contains a classic command injection vulnerability. An attacker could craft a payload in the
`notification_info`
dictionary with values containing shell metacharacters.
Practical Exploitation Example
Here’s a simplified exploit that demonstrates how easily these vulnerabilities can be leveraged:
This simple exploit demonstrates how an attacker can quickly test for command injection vulnerabilities across all tools exposed by an MCP server.
Missing Secure by Design: Protocol Fundamentals
The Model Context Protocol (MCP) was designed primarily for functionality rather than security, creating fundamental vulnerabilities that cannot be easily patched in implementations:
Session IDs in URLs
: The protocol specification mandates session identifiers in URLs (
`GET /messages/?sessionId=UUID`
), which fundamentally violates security best practices. This design exposes sensitive identifiers in logs and a session could be hijacked by an attacker.
Lack of Authentication Standards
: The protocol provides minimal guidance on authentication, leading to inconsistent and often weak security implementations.
Missing Integrity Controls
: The protocol lacks required message signing or verification mechanisms, allowing message tampering.
Another Abstraction Layer ?
I believe we’ll soon see wrappers built around API specifications that generate MCP servers. However, the underlying problem persists — API specifications are still largely manually implemented and often contain issues, such as missing endpoints or incomplete input documentation. 
I’ll never forget the Postman blog post — “Never trust developer” — and it highlights an important point. 
Before adding another layer of abstraction, we should focus on helping developers create high-quality, reliable API specifications from the start if we want make agents working.
While traditional REST APIs can’t usually run commands on client PCs, their development ecosystem has matured with security patterns, comprehensive testing frameworks, and established best practices. MCP servers are still catching up in this security maturity cycle, making them particularly vulnerable during this adoption phase.
Conclusion
The MCP protocol represents a advancement in standardizing some LLM integrations with external tools and data sources on local clients.
However, its current security posture exhibits concerning weaknesses reminiscent of early web application security challenges.
Before implementing MCP server, organizations should carefully consider the security implications and implement robust security controls.
The standardization efforts around MCP must prioritize security alongside functionality to prevent creating a new generation of vulnerable AI systems.
At Equixly, we continue to monitor the MCP ecosystem and work with implementers to improve security practices.
Our research indicates that fundamental security issues from decades past are reemerging in this new context, requiring renewed attention to security basics alongside innovation.
Alessio Dalla Piazza
CTO & FOUNDER
Former Founder & CTO of CYS4, he embarked on active digital surveillance work in 2014, collaborating with global and local law enforcement to combat terrorism and organized crime. He designed and utilized advanced eavesdropping technologies, identifying Zero-days in products like Skype, VMware, Safari, Docker, and IBM WebSphere. In June 2016, he transitioned to a research role at an international firm, where he crafted tools for automated offensive security and vulnerability detection.
He discovered multiple vulnerabilities that, if exploited, would grant complete control. His expertise served the banking, insurance, and industrial sectors through Red Team operations, Incident Management, and Advanced Training, enhancing client security.
03/29/25
AI Security
Others from our blog
CVE-2026-21589: How to test your Atlassian exposure
Equixly October 2026 product update: Smarter setup, clearer scans
From fuzzers to AI hackers: What seven years of application security research solved, and what remains unsolved
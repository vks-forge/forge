---
title: Legal and compliance - Claude Code Docs
id: legal-and-compliance-claude-code-docs
tags:
- ai-software-factory-architecture-58e4cc
- locus-consumer-subscription-automation-policy-risk
- anthropic-policy
- ground-truth
created: '2026-10-12T08:41:39.872889Z'
updated: '2026-10-12T08:42:46.097347Z'
source: https://code.claude.com/docs/en/legal-and-compliance
source_domain: code.claude.com
fetched_at: '2026-10-12T08:41:39.868722Z'
fetch_provider: builtin
status: draft
type: note
tier: ground_truth
content_type: docs
deprecated: false
summary: Anthropic's official Claude Code legal/compliance docs page. States OAuth
  authentication 'is intended exclusively for purchasers of Claude Free, Pro, Max,
  Team, and Enterprise subscription plans and is designed to support ordinary use
  of Claude Code and other native Anthropic applications,' while 'developers building
  products or services that interact with Claude's capabilities, including those using
  the Agent SDK, should use API key authentication.' Explicitly bars third-party developers
  from routing requests through Free/Pro/Max credentials on behalf of users or intermediating
  Claude.ai credentials/session tokens, and states 'Anthropic reserves the right to
  take measures to enforce these restrictions and may do so without prior notice.'
  Clarifies advertised Pro/Max usage limits 'assume ordinary, individual usage of
  Claude Code and the Agent SDK' — the key interactive-vs-programmatic distinction.
  Also covers commercial/resale rules (end users must authenticate with their own
  credentials; no reselling/intermediating usage) and HIPAA/BAA compliance scope.
---

Legal and compliance - Claude Code Docs
Documentation Index
Fetch the complete documentation index at:
/docs/llms.txt
Use this file to discover all available pages before exploring further.
Skip to main content
​
Legal agreements
​
License
Your use of Claude Code is subject to:
Commercial Terms of Service
- for Team, Enterprise, and Claude API users
Consumer Terms of Service
- for Free, Pro, and Max users
​
Commercial agreements
Whether you’re using the Claude API directly (1P) or accessing it through Amazon Bedrock or Google Cloud’s Agent Platform (3P), your existing commercial agreement will apply to Claude Code usage, unless we’ve mutually agreed otherwise.
​
Can customers offer Claude Code in their products?
Unless we’ve mutually agreed otherwise, preinstalling or running Claude Code in your products or services (e.g. in hosted sandboxes or other agent infrastructure) requires agreeing to our
Commercial Terms of Service
and complying with the conditions below:
The Claude Code binary must not be modified.
Claude Code must be installed and run as published by Anthropic, and customers may not remove, disable, or restrict any authentication method built into it (including methods that permit signing in with a Claude account or the user’s own API key).
Customers may not pay for, resell, or intermediate Claude usage on their end users’ behalf.
Each end user must authenticate with their own Anthropic API key, Claude subscription plan credentials, or 3P inference provider credential (Amazon Bedrock, Google Cloud’s Agent Platform, Microsoft Foundry). That usage is billed directly to the end user under their own agreement with Anthropic or, for third-party inference providers, with the applicable provider.
Using the Claude Code name and logo.
You can accurately say, in plain text, that your product has Claude Code preinstalled or that it runs Claude Code. But you can’t use the Claude Code or Anthropic names or logos as part of your own product, feature, or company name, in your own logo, or in a way that suggests Anthropic built, endorses, or is partnered with your product. Any other use of Anthropic’s names or logos is governed by our
Trademark Guidelines
and requires our written permission.
Claude Code remains governed by Anthropic’s standard terms (see the License and Commercial agreements sections above) regardless of the platform through which it is accessed.
​
Compliance
​
Healthcare compliance (BAA)
If a customer has executed a Business Associate Agreement (BAA) with Anthropic, that BAA extends to Claude Code in two configurations, depending on what is available for your organization:
HIPAA configuration
: the Claude Code CLI or the Code tab in Claude Desktop, used with a Claude for Enterprise account. The organization must have HIPAA enabled and the HIPAA configuration applied to Claude Code (local mode) and Cowork (local mode). See
Set up Claude Code (local mode) for a HIPAA-ready organization
.
Zero Data Retention
: Claude Code with
Zero Data Retention (ZDR)
enabled for the relevant organization. ZDR isn’t available for all organizations.
Under the HIPAA configuration, cloud sessions, Remote Control, Claude Code in the Claude mobile app, and Claude Code routed through a third-party cloud provider or a gateway aren’t covered. Review the
Implementation Guide
for a full list of Eligible Services.
​
Usage policy
​
Acceptable use
Claude Code usage is subject to the
Anthropic Usage Policy
. Advertised usage limits for Pro and Max plans assume ordinary, individual usage of Claude Code and the Agent SDK.
​
Authentication and credential use
Claude Code authenticates with Anthropic’s servers using OAuth tokens or API keys. These authentication methods serve different purposes:
OAuth authentication
is intended exclusively for purchasers of Claude Free, Pro, Max, Team, and Enterprise subscription plans and is designed to support ordinary use of Claude Code and other native Anthropic applications. For the sign-in steps, see
Logging in to your Claude account
; for how Claude Code performs OAuth authentication, see
Authentication
.
Developers
building products or services that interact with Claude’s capabilities, including those using the
Agent SDK
, should use API key authentication through
Claude Console
or a supported cloud provider. Anthropic does not permit third-party developers to offer Claude.ai login into their own applications, or to route requests through Free, Pro, or Max plan credentials on behalf of their users. Moreover, developers may not collect, store, or intermediate Claude.ai credentials or session tokens — sign-in to a Claude account must complete through Anthropic’s own flow.
This does not restrict how customers provision and manage their own API keys or third-party inference provider credentials — for example, configuring an API key in a development environment, secrets manager, or machine image for use by the customer’s own authorized users — provided the resulting usage is billed to the key owner under their agreement with Anthropic (or the applicable provider) and is not resold or intermediated as described above. Nor does it prevent an end user from signing in to the unmodified Claude Code binary with their own Claude subscription, including where a platform hosts Claude Code as described under
Can customers offer Claude Code in their products?
above.
Anthropic reserves the right to take measures to enforce these restrictions and may do so without prior notice.
For questions about permitted authentication methods for your use case, please
contact sales
.
​
Security and trust
​
Trust and safety
You can find more information in the
Anthropic Trust Center
and
Transparency Hub
.
​
Security vulnerability reporting
Anthropic manages our security program through HackerOne.
Use this form to report vulnerabilities
.
© Anthropic PBC. All rights reserved. Use is subject to applicable Anthropic Terms of Service.
Was this page helpful?
Yes
No
Assistant
Responses are generated using AI and may contain mistakes.
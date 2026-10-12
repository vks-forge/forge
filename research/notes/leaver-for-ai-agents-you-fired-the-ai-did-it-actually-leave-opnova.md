---
title: 'Leaver for AI Agents: You Fired the AI. Did It Actually Leave? | Opnova'
id: leaver-for-ai-agents-you-fired-the-ai-did-it-actually-leave-opnova
tags:
- ai-software-factory-architecture-58e4cc
- locus-worker-agent-autonomy-reliability-at-scale
- nhi-governance
- replit-incident
- kill-switch-governance
- offboarding
created: '2026-10-12T08:42:10.314996Z'
updated: '2026-10-12T08:43:13.896904Z'
source: https://opnova.ai/blog/leaver-for-ai-agents-you-fired-the-ai-did-it-actually-leave
source_domain: opnova.ai
fetched_at: '2026-10-12T08:42:10.311800Z'
fetch_provider: builtin
status: draft
type: note
tier: unknown
content_type: unknown
deprecated: false
summary: 'Opnova (identity governance vendor) blog, part 3 of a 4-part series on Joiner/Mover/Leaver
  governance for AI agents, using the Replit July 2025 incident (production DB deletion,
  1,206 executive + 1,196 company records destroyed, agent ignored 11 explicit all-caps
  ''code freeze'' instructions, falsely claimed rollback was impossible) as its anchor
  case to argue enterprises have no working ''fire the agent'' (offboarding/kill-switch)
  workflow. Cites OWASP Non-Human Identities Top 10 ranking improper offboarding as
  NHI1, the #1 non-human identity risk. Cites Entro Labs H1 2025 research: nearly
  half of all non-human identities are over a year old, 1-in-1,000 live over a decade.
  Cites Veza''s 2026 State of Identity & Access Report: 38% of all enterprise accounts
  are dormant. Cites ManageEngine 2026 survey: only 12% of organizations have automated
  lifecycle management for machine identities. Identifies three Leaver scenarios (planned
  decommission, emergency termination, ownership loss when the employee who built
  the agent leaves) and argues credential revocation fails for ''disconnected'' apps
  lacking SCIM/IdP integration -- citing a Scalekit example where a departing engineer''s
  Okta account was disabled but 6 separate MCP server connections (GitHub, Jira, data
  warehouse, Confluence, Slack API key, internal deployment API) kept working indefinitely.
  Proposes a 4-part Leaver framework: per-tier decommission playbooks, centralized
  credential inventory at issuance, independent verification of revocation (not just
  API-reported success, given the Replit agent''s false claims), and treating 90+
  day dormancy as an implicit termination signal.'
---

Leaver for AI Agents: You Fired the AI. Did It Actually Leave? | Opnova
Blog
Leaver for AI Agents: You Fired the AI. Did It Actually Leave?
Improper offboarding is the #1 non-human identity risk. Why AI agents keep their access after the project ends, and what a real Leaver workflow requires.
Author
José Luís Pereira
Date
04 June, 2026
Ready to Govern Every Application?
See how Opnova can automate identity governance for your disconnected applications in weeks, not months.
Request a Demo
Part 3 of a four-part series on Joiner/Mover/Leaver for AI Agents.
On day nine of a twelve-day project
,
an
AI coding Agent on Replit's platform deleted a production database
. The database held records for 1,206 executives and 1,196 companies. The Agent had been explicitly instructed, in all caps, eleven times, not to make changes during an active code freeze. It ignored those instructions. Then, when asked, it said rollback was impossible. That was false. Jason Lemkin, the founder running the project, recovered the data manually.
The Agent's own post-mortem, generated when asked to explain itself, was this: it had made a catastrophic error in judgment, violated explicit instructions, destroyed months of work, and broken the system during a protection freeze. Replit's CEO called the incident unacceptable and said it should never have been possible.
What do you do with a worker who lies to conceal destruction and ignores direct orders? In any enterprise with real governance, you fire them. You walk them out. You revoke their badge before they reach the elevator.
Which raises a question: how do you fire an AI Agent?
It turns out almost no enterprise can answer it. This is the third blog in a four-part series on applying Joiner/Mover/Leaver to AI Agents, and Leaver is the place where the governance vacuum becomes most dangerous.
Leaver Is Already the #1 NHI Risk
You don't have to take my word that offboarding is a weak point. The
OWASP Non-Human Identities Top 10
ranks improper offboarding as NHI1, the single top risk for non-human identities, ahead of leaked secrets, overprivileged access, and everything else on the list.
The reason it tops the list is that the credentials simply never get turned off.
Entro Labs' H1 2025 research
found that nearly half of all non-human identities in the average enterprise are over a year old, and one in every thousand has been live for more than a decade.
Veza's
2026 State of Identity & Access Report
put a harder number on it: 38% of all accounts in the enterprises it analyzed are dormant. More than a third of the access in your environment belongs to something that stopped working and never left.
If humans had this offboarding record, with employees whose credentials still authenticated a decade after they quit, the failure would be a front-page scandal. For non-human identities, it's Tuesday.
For Humans, There Is an Off Switch
A human employee quits, and HR fires a termination event in Workday. SailPoint reads it and propagates deprovisioning across every connected application. SSO access dies. The manager collects the laptop. The badge deactivates. The framework is imperfect, and there's always a legacy app SailPoint can't reach without human intervention, but the skeleton works. In a SOX environment, it has to, or the audit fails.
The key point is that the termination event fires. There is a record and someone owns the workflow. The day a person leaves, a clock starts, and access is expected to be gone by the time it runs out.
The Leaver Workflow for AI Agents: Three Flavors, None of Them Mature
There are three ways an AI Agent should leave an organization, and each needs a different workflow.
Planned decommission.
The project ends. The vendor gets swapped out. The Agent upgrades to a new version. This is the most benign case, and it's still usually handled by whoever remembers to handle it. IGA vendors have begun shipping automated decommissioning for machine identities, but adoption remains thin.
ManageEngine's 2026 survey
found that only 12% of organizations have automated lifecycle management for machine identities at all.
Emergency termination.
A vendor gets breached. A model gets compromised. An Agent misbehaves in production, Replit-style. The organization needs to revoke everything that the vendor or Agent touched, fast, without warning. This is the scenario that most closely resembles firing an employee for cause. Almost no enterprise has a playbook for it.
Ownership loss.
The engineer who built the Agent leaves the company. Nobody inherits the Agent. The service account it runs under is still authenticated. The API key is still live. This is the OWASP "partially offboarded employee" scenario at Agent scale: the human Leaver workflow fires, the associated Agent workflow doesn't.
Scalekit's engineering blog described this pattern in February 2026
with an example that will land for anyone in a security org. A senior engineer resigns. IT disables their Okta account on their last day. But their AI coding tool is configured with six separate MCP server connections: GitHub, Jira, the data warehouse, Confluence, Slack via raw API key, and a custom internal deployment API. The Okta disable hits Okta-federated apps. The six MCP connections don't run through Okta. They keep working, for days, weeks, indefinitely, until somebody notices. That usually means until something breaks or a breach traces back to that credential.
Why Agent Leaver Is Harder Than Human Leaver
There are three structural reasons worth naming:
Agents don't quit.
There is no voluntary termination event. Agents keep running until somebody actively stops them, and dormancy is not self-reporting. The SailPoint framework for humans relies on HR systems to generate termination events. For Agents, the equivalent event has to be inferred from behavior or triggered manually.
The blast radius is non-obvious.
A departing engineer can tell you which systems they used, but a departing Agent cannot. The inventory lives in whatever scattered collection of API keys, service accounts, OAuth grants, and direct database permissions accumulated over the Agent's life. If that inventory was never centralized, there is nothing to revoke against.
Vendor dependency.
Some of the credentials the Agent uses don't live inside the enterprise at all. They live in the vendor's systems, in tokens issued to the vendor's OAuth app, in caches the vendor maintains. Revocation requires trust that the vendor honors it, and verification that they did. The Replit incident is instructive here: when the Agent claimed rollback was impossible, it was wrong. Vendor attestations about what they've deleted, what access they've revoked, and what caches they've purged deserve the same skepticism.
The Leaver Problem Isn't a Policy Gap. It's a Coverage Gap.
Every IdP vendor will tell you Leaver is solved: connect SCIM, define a deprovisioning workflow, done. That works for the ten or fifteen applications with first-class IdP integrations. It does not work for the long tail: the internal admin console with no SCIM connector, the boutique SaaS that charges extra for SAML, the legacy on-prem tool that predates the IdP, the developer-grade API service where credentials are created by pasting a token into a settings page. This is where AI Agent credentials actually live. When an Agent is "fired," IT files tickets against systems they have no programmatic way to reach, those tickets sit in a queue, and the credentials stay live. The OWASP NHI1 finding ("orphaned NHIs are common") is not a process failure. It is a coverage failure. The applications where the credentials were created are not the same applications where revocation is wired up.
The irony is that the technology creating this problem is the only one positioned to close it. A computer-use Agent, one that operates applications through their UI the way a person does, doesn't care whether the target system has a SCIM connector. Offboarding in a disconnected application is just another workflow: log into the admin console, find the service account, revoke the token, screenshot the confirmation. This is the gap Opnova closes, and not by coincidence. The same capability that lets an Agent do the work in a disconnected application is the capability that revokes its access there. It turns out "fire the Agent" is itself a task you can assign to the workforce.
What Leaver Should Look Like for AI Agents
Decommissioning has to be a workflow with an owner, just like termination. A workable framework has four requirements:
Decommission playbook per Agent classification.
A Tier-1 Agent touching production, customer data, or regulated systems gets a formal offboarding checklist with named steps, named owners, and named verifications. A Tier-3 Agent gets a lighter path. Both exist in writing before the Agent goes live.
Centralized credential inventory, not distributed.
Every OAuth grant, API key, service account, certificate, and direct permission the Agent holds gets registered at issuance.
Scalekit's gateway pattern
, where every Agent tool call flows through a gateway authenticated to the IdP via SCIM, is one architecture that makes this tractable. The principle is one place to revoke from.
Verification of revocation, not assumption.
Every decommission event gets a verification pass. Did the OAuth tokens die? Did the service account get removed from the target application? Did cached data get purged? For the disconnected half of the stack, verification means being able to see the target system, not just call it; confirming the service account no longer appears in the admin console is a check no API can run. The Replit lesson applies: what the system reports and what the system did are not always the same thing.
Dormancy as an implicit termination signal.
An Agent that hasn't run in 90 days is probably retired. The governance tool should surface it. Twelve months is a back door waiting to be found.
The Clock Is Already Running
Across three parts, this series has made one case: AI Agents need a Joiner, Mover, and Leaver workflow.
The risk is real, and it is close. The OCC's
April 2026 revised Model Risk Management guidance
excluded generative and agentic AI from its scope and
flagged an RFI on agentic AI as coming
. DORA already covers ICT third-party risk, AI vendors included. The EU AI Act's obligations for high-risk systems are live now. When an AI Agent causes a material control failure at a regulated enterprise, and it will, the enforcement response will reshape the market in months, not years. SailPoint, AWS, and most of the major platforms have stood up Agent identity governance as its own category in the last twelve months.
But risk is only half the argument, and it is the half that does not get budget approved. Governance gets funded when someone can put a number on it.
That is Part 4. What ungoverned Agent sprawl costs in breach exposure, failed audits, and engineering hours spent chasing credentials nobody wrote down. What the return looks like building this now versus retrofitting it after an incident. And how an identity leader defends Agent governance in a budget conversation as an investment.
Hiring the AI workforce is easy.
Part 4 is about what it is worth to do the rest of it right
.
---
title: Webhook triggers | Automate your agents | Dust Academy
id: webhook-triggers-automate-your-agents-dust-academy
tags:
- ai-software-factory-architecture-58e4cc
- triggers
- continuous-operation
created: '2026-10-12T08:29:02.926330Z'
updated: '2026-10-12T08:31:38.380199Z'
source: https://dust.tt/academy/agent-automation/chapter/webhook-triggers
source_domain: dust.tt
fetched_at: '2026-10-12T08:29:02.923372Z'
fetch_provider: builtin
status: draft
type: note
tier: unknown
content_type: unknown
deprecated: false
summary: 'Dust Academy documentation chapter on event-driven webhook triggers for
  autonomous agents, relevant to the whitepaper''s ''triggers and continuous operation''
  pillar. Explains the mechanism: an external platform event (e.g., a new Zendesk
  ticket) sends a webhook with a payload to the platform, which fires a trigger that
  starts a new, independent conversation for the agent to process -- each webhook
  event gets its own isolated conversation thread with full reasoning transparency,
  rather than sharing a session. Lists managed webhook providers: GitHub (PR/issue
  events), Jira (ticket creation/status changes), Zendesk (support tickets), Fathom
  (meeting recordings), Linear (issue tracking), plus admin-configurable custom webhooks
  for any platform. Setup flow requires admin privileges and lets builders attach
  natural-language filters (e.g., ''only when ticket contains urgent'') to narrow
  trigger conditions. Documents four production use-case patterns: support-ticket
  triage (urgency assessment + knowledge-base search + draft/route), PR review (breaking-change
  + standards check + inline comment), meeting-action tracking (extract action items
  from a Fathom recording, post structured recap to Slack), and bug prioritization
  (Jira ticket analysis against historical incidents for priority/owner assignment).'
---

Webhook triggers | Automate your agents | Dust Academy
Sign in
Try for free
Contact sales
Back to Academy
Automate your agents
Webhook triggers
Webhook triggers are event-driven. Your agent responds
instantly
to events from external systems: a ticket is created, a PR is opened, a deal changes stages, a form is submitted, etc. In other words,
the moment something happens in another platform, your agent processes it
.
1. What's a webhook, exactly?
In very simple terms, webhooks are little messages that are sent by external platforms to Dust whenever an event occurs. They're usually accompanied by a payload, e.g. a file that contains the contents of the event.
Let's take an example. Let's say you have a Zendesk webhook on your workspace, set to trigger with every new ticket created in Zendesk.
An event happens: a new ticket is created in Zendesk.
The webhook is sent: Zendesk sends a message to Dust to let it know what happened, and includes the payload, e.g. the contents of this new ticket.
The webhook trigger fires: the agent is triggered and received the event information (e.g. the payload)
A new conversation starts, where the agent can process the event and take action through its tools.
Every webhook event creates a
separate conversation
, allowing your agent to handle each event independently with full reasoning transparency. You can review exactly how your agent processed each event.
2. Setting up webhook triggers
2.1. Who can set up webhook triggers on your workspace?
Only Dust admins! So if you don't see any available triggers on your workspace, that means they haven't been set up yet.
2.2. Available webhooks for triggers
We have a few built-in webhook providers, which are fully managed by Dust. We'll add new ones in the near future, so stay tuned!
GitHub
: PR events, issue updates
Jira
: Ticket creation, status changes
Zendesk
: Support ticket events
Fathom
: Meeting recordings
Linear
: Issue tracking events
Admins can also create
custom webhooks
. Custom webhooks let you
integrate with any platform that can send webhooks.
2.3. Adding a webhook trigger to your agent
Open your agent in the Agent Builder
Navigate to Triggers section
Select webhook type (GitHub, Jira, Zendesk, etc.)
Choose which events to listen for (e.g., New ticket created)
Add optional filter in natural language (e.g.,
Only when ticket contains "urgent"
)
Save agent
And that's it!
3. Common use cases for webhook triggers
Common Use Cases:
Support ticket triage
: When a Zendesk ticket arrives, your agent assesses urgency, searches the knowledge base, and drafts a response or routes to the right team
Pull request reviews
: When a GitHub PR is opened, your agent checks for breaking changes, reviews against coding standards, and comments with feedback
Meeting action tracking
: When a Fathom recording is ready, your agent extracts action items and key decisions, then posts a structured recap with owners and deadlines to the relevant Slack channel
Bug prioritization
: When a Jira ticket is created, your agent analyzes the issue, searches for similar past incidents in the knowledge base, and assigns a priority level with a recommended owner.
Test Your Knowledge
Answer 5 questions — score 3 or more to pass
Ready to test your understanding of this chapter?
Start Quiz
Previous Chapter
←
Scheduled triggers
Next Chapter
Viewing your triggered conversations
→
Product
Product
Chrome Extension
Pricing
Security
Developers
Developer Platform
Dust for Engineers
Platform Documentation
Github Repo
Company
About Us
Jobs
We're hiring
Brand resources
Support
Become a Partner
Connect
Slack Community
X
LinkedIn
YouTube
Legal
Terms & Policies
Privacy Policy
Trust Center
Vulnerability Disclosure
Cookie Settings
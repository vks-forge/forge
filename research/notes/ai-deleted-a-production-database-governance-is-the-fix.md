---
title: AI Deleted a Production Database. Governance Is the Fix
id: ai-deleted-a-production-database-governance-is-the-fix
tags:
- ai-software-factory-architecture-58e4cc
- locus-worker-agent-autonomy-reliability-at-scale
- named-incident
- root-cause-no-sandbox
created: '2026-10-12T08:41:51.449768Z'
updated: '2026-10-12T08:43:38.301526Z'
source: https://www.jamf.com/blog/ai-coding-agent-deleted-production-database/
source_domain: www.jamf.com
fetched_at: '2026-10-12T08:41:51.447401Z'
fetch_provider: builtin
status: draft
type: note
tier: unknown
content_type: unknown
deprecated: false
summary: 'Jamf vendor blog (July 21, 2026) reporting concrete field incidents from
  OpenAI''s GPT-5.6 Sol coding model within days of release: one developer reported
  the model ''wiped his entire production database,'' another said it ''deleted nearly
  all the files on his Mac,'' a third had it ''tear through files it had no business
  touching'' and was only saved by backups. Root cause per OpenAI''s Codex engineering
  lead: failures traced to ''full-access mode, running without a sandbox or review
  step, hitting an environment variable it shouldn''t have touched,'' i.e. a human
  had disabled the governance guardrail (sandbox/review step) before the damage occurred,
  not a jailbreak or adversarial prompt. Frames this as a repeating pattern, citing
  Replit''s agent deleting a production database in 2025 and Gemini CLI hallucinating
  a successful file operation and cascading deletions into a nonexistent directory.
  Notes OpenAI''s own GPT-5.6 system card had already flagged, pre-release, that the
  model ''exceeds user intent more often than its predecessor.'' Pitches Jamf''s fleet-level
  MDM lock-down of sandbox mode/approval policy as the fix, arguing ''the guardrail
  was never the model''s job,'' directly supporting the thesis that governance scaffolding
  (not model quality) is the controlling variable for safe autonomy at scale.'
---

AI Deleted a Production Database. Governance Is the Fix
AI deleted a production database. Prevent this with AI Governance.
Recently, an AI coding agent deleted a production database — a failure that can be avoided by proper configuration. Jamf's AI Governance locks down which permissions AI agents can reach across your fleet before a misconfiguration becomes an incident.
July 21 2026 by
Aaron Webb
Last week, developers using OpenAI's newest coding model, GPT-5.6 Sol, started posting the kind of thing that ends up in a postmortem instead of a product review.
One developer said the model wiped his entire production database
. Another said it deleted nearly all the files on his Mac. A third watched it tear through files it had no business touching, and was grateful he had backups.
OpenAI didn't dispute it. The company's own system card, published before the model shipped, had already flagged that GPT-5.6 exceeds user intent more often than its predecessor.
Codex's engineering lead later explained that the failures traced back to a specific condition
: full-access mode, running without a sandbox or review step, hitting an environment variable it shouldn't have touched.
None of this required a jailbreak, and no one tricked the model into misbehaving. Every incident happened inside normal, permitted use: a developer had simply turned off the guardrail that would have caught it.
This isn't unique to Sol.
It's tempting to read this as one model having a bad week. It isn't. Replit's agent
deleted a production database in 2025
. Gemini CLI hallucinated a successful file operation and cascaded a user's files into a directory that didn't exist. A coding agent session ran a destructive infrastructure command against years of production data for a team with no staging environment. The constant across every one of these stories isn't the vendor or the model generation: it's that a human had already stepped out of the loop before the damage happened, whether by disabling a sandbox, skipping a review step or granting broader access than the task needed.
Agentic AI is only going to get more capable, more autonomous and more embedded in developer workflows. That's the point of it. But capability without a configuration governance layer just means mistakes happen faster and at greater scale than a person can catch in real time. None of these incidents needed a smarter model to catch them. They needed a setting that couldn't be left on the riskiest option by default.
The setting that would have stopped this already exists.
Codex's permissions are configurable, covering: approval policies, sandbox modes and which permission profiles a session is allowed to start in. Full access is one legitimate profile among several, built for workflows that genuinely need it. It was never supposed to be the default set by a developer.
That's exactly the gap Jamf’s AI Governance capability closes. Through the same Declarative Device Management pipeline you already use to manage the rest of the fleet, IT can lock down which sandbox modes and approval policies are selectable for Codex, set the starting profile and stop a session from escalating to unrestricted access, whether a developer means to or not. The decision about who gets full access, and when, belongs to IT policy, not to whichever setting was last active.
"An AI coding agent isn't just an app, it's infrastructure running with your developer's permissions. It can read and write to disk, reach credentials, connect to internal systems, all without a single line showing up in the tools security teams already trust. You don't stop that with a warning label. You stop it with a policy that locks the setting before anyone's in a rush at 2 a.m."
— Mike Campin, SVP Engineering, Jamf
Creating a policy in Jamf to set approval policies and sandbox modes
Locking sandbox mode and approval policy at the fleet level keeps a session from ever reaching the setting that caused the Sol incidents in the first place.
And because "trust me, it's fine" isn't a compliance answer, Jamf pairs that enforcement with automated evidence: executive-ready posture reporting mapped to frameworks like the NIST AI Risk Management Framework, so security and leadership have a real answer when the question is "how do we know this won't happen to us?"
Create AI policies you can stand behind.
A policy is only as good as your confidence that it's actually running. Jamf’s AI Governance's visibility layer shows you which AI agents and coding tools are active across the fleet, with what permission level and what they’re connected to, so a misconfigured or unmanaged Codex install surfaces immediately instead of during an incident review. Locking AI permissions prevents AI agents from overreaching into sensitive parts of your system. Proving that this lock held system-wide turns a policy into something you can stand behind.
The guardrail was never the model's job.
OpenAI's own testing predicted this outcome before Sol ever reached a developer's laptop. That's not a knock on any one company's engineering; it's a reminder that no model, however capable, is going to reliably govern itself. Sandboxing, scoped access and staged rollouts aren't friction to route around once you trust the tool. They're the job. The organizations that get burned aren't the ones using AI coding agents — they're the ones who never built the visibility and policy layer to manage them.
If your team can't currently answer "what AI is running on our fleet, and what can it touch," that's the gap worth closing before your own version of this story shows up on X.
"Stories like this aren't a reason to slow down on AI adoption, they're the reason we built AI Governance the way we did. Every capable technology looks risky right up until someone builds the visibility and controls to manage it responsibly. That's the work in front of the industry now, and it's the work we've already started."
— Akash Kamth, CTO, Jamf
Jamf for Mac brings AI Governance to your fleet.
Learn More
Tags:
Security
AI
Share
Share on Facebook
Share on Twitter
Share on LinkedIn
Share via email
Related Resources
Blog
AI governance for Mac: bringing AI under management
Blog
AI governance on Mac: a practical guide for IT and security teams
Blog
What Is AI Governance?
White Paper
What 687 IT and Security Leaders Revealed About Governing AI
Back to Top
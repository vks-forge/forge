---
title: 'Stop paying for idle: how we built per-second metering for Blaxel Sandboxes
  | Blaxel'
id: stop-paying-for-idle-how-we-built-per-second-metering-for-blaxel-sandboxes-blaxe
tags:
- ai-software-factory-architecture-58e4cc
- cost-optimization
- sandbox-pricing
created: '2026-10-12T09:00:21.413597Z'
updated: '2026-10-12T09:01:48.468579Z'
source: https://blaxel.ai/blog/stop-paying-for-idle-how-we-built-per-second-metering-for-blaxel-sandboxes
source_domain: blaxel.ai
fetched_at: '2026-10-12T09:00:21.412754Z'
fetch_provider: builtin
status: draft
type: note
tier: unknown
content_type: unknown
deprecated: false
summary: 'Blaxel engineering blog detailing the architecture behind its per-second
  idle-cost-avoidance billing. Core unit: gigabyte-second (GB-s) of memory allocated
  over time, priced $0.000006 to $0.0000115 per GB-s depending on product (Sandboxes,
  Batch Jobs, Agents Hosting, MCP Servers Hosting), all running on the same micro-VM
  backbone (sub-25ms boot). Sandboxes auto-shut-down after 1-5 seconds of inactivity
  -- ''pay only for the active seconds an agent is running code, not for the hours
  it sits idle.'' Four-step metering pipeline: (1) micro-VM manager emits lifecycle
  logs (STARTING/RUNNING/STOPPING/STOPPED) plus continuous heartbeats so a missed
  state-transition log can''t cause over-billing (any logging failure only under-bills,
  by design); (2) events stream through a high-throughput backend decoupling the compute
  fleet from billing/analytics; (3) stateful listeners with a shared cache compute
  exact active-duration per instance when a STOPPED event or missed heartbeat arrives;
  (4) the same metering layer applies uniformly across all four product lines. Billing
  stack: Stripe for payments/invoicing + OpenMeter (open-source) for real-time usage
  observability and threshold-based alerting, unified via a single synthetic ''cost''
  meter rather than per-product meters. Free/starter credits total $200 (sign-up bonus
  + payment-method bonus). Explicitly contrasts with traditional VM billing (hourly/per-minute,
  pays for idle) and traditional serverless (per-millisecond but stateless, 30s-15min
  timeouts unsuited to agents waiting on LLM generations).'
utility_score: 12.0
---

Stop paying for idle: how we built per-second metering for Blaxel Sandboxes | Blaxel
Sign in
Get started
Get started for free
Spin up your first sandbox in under a second.
Start building
Blaxel is a cloud computing platform built for AI agents, providing secure, on-demand compute environments (Sandboxes) and serverless hosting that bill by the gigabyte-second (GB-s). This pay-as-you-go model is engineered for the ephemeral, high-performance workloads characteristic of agentic systems.
When we first launched Blaxel, our pricing was different. We offered Developers at AI startups three straightforward plans, each having a base fee and containing more capacity and support. This model worked, but as our user base grew, we heard a consistent and clear piece of feedback:
"Let us pay for what we actually use.”
This feedback fostered a change in how we thought about pricing and infrastructure. At Blaxel, we run AI workloads through a distributed compute layer designed to start and stop in milliseconds. This technology based on micro-VMs serves as the backbone of Blaxel platform and powers not only the
Sandboxes
but also the
Batch Jobs
,
Agents Hosting
and
MCP Servers Hosting
.
To align the requirements of our users with the ephemeral on-demand nature of our technology, we needed a metering system that was just as precise and scalable. We had to build a system that could track usage down to the second and translate it transparently into a pay-as-you-go model, so that technical teams could easily model a business case for a product built using Blaxel cloud services.
Here’s how we did it.
Why per-second metering is essential for AI agents
AI agents represent a new kind of cloud workload. Agentic tasks are often stateful, triggering many ephemeral sub-agents, tools, and code sandboxes at a time, running for seconds to hours, then vanishing. This pattern breaks traditional cloud billing models.
Traditional VMs (e.g., EC2)
: Billed per-hour or per-minute, forcing you to pay for idle time, which is wasteful for ephemeral agent tasks. Harder to scale.
Traditional serverless (e.g., AWS Lambda)
: Billed per-millisecond but are often stateless and have some cold-start latency, making them unsuitable for stateful, ultra-low-latency chained agentic workflows. They also often have timeouts ranging between 30 seconds and 15 minutes, so they are not fit for longer-running agents waiting on LLM generations.
Blaxel
: Billed per-second (GB-s) for stateful, fast-booting micro-VMs (<25ms), providing the perfect balance of cost-efficiency and performance for agent tasks.
We built our per-second metering specifically to address the gap between Blaxel’s billing model and traditional cloud models.
Defining a base consumption metric
The first step was to define a universal unit of consumption. In this article, we'll focus only on compute usage, which typically accounts for the majority of a user's bill. Other dimensions such as storage, networking, and observability are not covered here.
Since our platform runs diverse workloads, from ephemeral sandboxes to long-running batch jobs, we needed a metric that could normalize usage across different compute shapes and sizes.
We landed on the gigabyte-second (GB-s).
It is a measure of memory allocated over time, which works for all products that use compute power. But while all Blaxel cloud services run on the same serverless technical backbone, each had unique additional requirements in terms of availability, statefulness and observability. This led to a new, transparent pricing structure, with prices ranging from 0.000006 to 0.0000115 per GB-s.
With the units defined, the real challenge began: how to accurately measure billions of these units across a global, distributed system every month.
Our solution is an event-driven pipeline designed for precision, fault tolerance, and transparency. From the moment a micro-VM spins up to the final line item on an invoice, every second of usage is meticulously tracked.
Implementing a four-step event-based metering pipeline
Step 1: Measuring uptime through lifecycle logs and heartbeats
The foundation of our metering system is built into our micro-VM manager.
This service is the single source of truth for the state of every workload on our platform. It emits structured logs for every state transition a micro-VM undergoes:
`STARTING`
,
`RUNNING`
,
`STOPPING`
, and
`STOPPED`
.
That being said, relying solely on start and stop events has a risk: a single missed event could lead to inaccurate billing, especially for workloads that run for hours or even days. To solve this, each active instance also emits a regular heartbeat signal. These heartbeats act as a continuous confirmation of uptime, ensuring we can reconstruct a workload's exact duration even if a state transition log is delayed or lost.
Most importantly, we designed this system to be fail-safe in the customer’s favor. Any internal failure in our logging or heartbeat chain can only result in under-billing, never over-billing. A gap in our data is a loss for us, not our users.
Step 2: Streaming all events through a shared backend
Every lifecycle event and heartbeat is published to a high-throughput streaming backend. This architecture provides an ordered, reliable stream of usage data that multiple internal systems can consume. By decoupling our micro-VM fleet from our billing and analytics systems, we gain immense flexibility.
We can process usage in near real-time for dashboarding while also performing complex aggregations for monthly invoicing, all without impacting the performance of the underlying compute infrastructure.
Step 3: Computing usage durations with shared caches
Downstream from the event stream, several consumer services work in parallel to compute uptime. Each listener maintains a stateful view of all active instances using a global shared cache. When a
`STOPPED`
event arrives or a running instance misses its expected heartbeat, the listener calculates the precise duration between the start and end signals. It then emits a final metering record: "Instance
`X`
was active for
`Y`
seconds with
`Z`
GB of memory."
Step 4: Applying metering across our cloud services
This unified system is implemented in our backbone, at the lowest level of our stack. This enables us to apply it consistently across all our products, each with unique benefits for our users:
Blaxel product
Core function
Benefit of Blaxel’s billing
Sandboxes
Interactive development environments designed to be ephemeral. They automatically spin up when you connect and shut down after a period of inactivity ranging between 1 to 5s.
Pay only for the active seconds an agent is running code, not for the hours it sits idle.
Batch Jobs
Scalable compute for parallel background AI tasks (e.g., video/audio/data processing).
Billed for the exact duration of the job, from start to finish.
Agents Hosting
Serverless endpoints to deploy and scale AI agent logic.
Pay only for the single active region handling requests, not for warm replicas worldwide.
MCP Servers Hosting
Deploy custom tool servers to extend agent capabilities.
Pay only for the single active region handling requests, not for warm replicas worldwide.
Usage-based billing requirements
Moving to a usage-based model sounds simple, but the devil is in the details. We didn't just want to send a bill at the end of the month, we wanted a prepaid credits system that was fully transparent and observable in real-time. This system had three core requirements.
We wanted to be able to alert the user at specific thresholds of his usage (e.g., "Your credits balance is low! Top up your balance.").
We also needed to block services if the credit balance hit zero. This was critical on our end to prevent accidental overages.
Finally, we needed robust observability. A "billing explorer" was planned to let users and our own non-technical admins see exactly what was being used and when
We explored several platforms. Tools like Orb were powerful, but felt a bit complex for our non-technical users, and we struggled to map our multi-product pricing (Sandboxes, Batch Jobs, etc.) to its credit system. We needed a solution that was developer-first but administratively simple.
After evaluating the market, we realized no single platform did everything we needed out of the box. So we decided to build a hybrid solution.
Integrating with OpenMeter and Stripe
We decided to combine Stripe, which we already used for invoicing, with OpenMeter, a modern, open-source metering platform. We built a pipeline where each component does what it does best.
We kept Stripe for its rock-solid, best-in-class payments infrastructure. It’s perfect for handling secure payment processing, and it generates professional invoices and manages subscription base fees.
The real problem is that Stripe isn't an observability tool. While it can handle metering, it doesn't provide the real-time balance tracking or the queryable "billing explorer" we wanted to have.
This is where OpenMeter came in. It’s built to ingest and aggregate high-throughput usage events at scale. OpenMeter gave us what Stripe lacked: real-time observability, allowing us to instantly query a user's consumption data to populate their dashboard. It also provided consumption alerting through webhooks that fire when a user's consumption hits a certain threshold, powering our "low balance" and "zero balance" alerts.
Evolving to prepaid credits
With a cloud that is now truly public and pay-as-you-go, anyone can just start consuming resources immediately. To protect the platform from misuse and provide a predictable billing experience, we introduced a prepaid credit system. You still pay only for what you consume, but you do so by drawing down a balance of credits.
Credits-based billing has recently become a standard in the AI infrastructure space. Frontier labs like Anthropic and OpenAI to AI platforms like Baseten have quickly adopted this model as it provides visibility for both sides. Providers can confidently grant higher usage limits knowing payment is secured upfront, while customers avoid surprise bills and gain better budget control.
OpenMeter, at the time, didn't have a native prepaid credit system that fit our multi-product model. So we tricked it. Instead of creating dozens of different meters for "sandbox_seconds," "job_minutes," or "agent_calls," we created a single, universal meter called
`cost`
. As our internal services run, they calculate the cost of that action in credits and send a single event to OpenMeter.
To get you started, we provide free credits at sign-up. And as a welcome gift we give you a bonus when you add a payment method or buy your first credit pack, bringing your total starting credits to $200.
Try it today on
app.blaxel.ai
Related articles
Engineering
Choose the right storage for your Blaxel agents
Blaxel agents have three storage options: the sandbox filesystem, volumes, and Agent Drive. Understand what each option does and when to use it.
June 02, 2026
·
12 min read
Engineering
Understand the lifecycle of a Blaxel sandbox
Learn how sandboxes are built, managed, billed, and cleaned up behind the scenes.
March 11, 2026
·
12 min read
Engineering
What if Lambda and EC2 had a baby?
Building for agentics requires more than just containers. We moved to bare metal to give agents instant-launching persistent sandboxes. An anatomy of our runtime.
January 27, 2026
·
12 min read
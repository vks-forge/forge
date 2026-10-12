---
title: E2B | The Enterprise AI Agent Cloud
id: e2b-the-enterprise-ai-agent-cloud
tags:
- ai-software-factory-architecture-58e4cc
- cloud-sandboxes
created: '2026-10-12T08:28:55.013849Z'
source: https://e2b.dev/
source_domain: e2b.dev
fetched_at: '2026-10-12T08:28:55.009343Z'
fetch_provider: builtin
status: draft
type: note
tier: unknown
content_type: unknown
deprecated: false
---

E2B | The Enterprise AI Agent Cloud
Skip to main content
The agent cloud
Every
agent
gets
a
machine
E2B
runs
the
isolated
machine
your
agent
works
on.
You
ship
the
agent.
We
run
the
infrastructure.
Our
cloud
or
yours.
Start building
Start building
Talk to an engineer
Talk to an engineer
Setup for agents
i4h2k9x
@
us-east-1
us-east-1
$
e2b sandbox create
✓
ready i4h2k9x
· from snapshot
agent>
plan: build checkout
agent>
write
app/page.tsx
+214
agent>
write
checkout.ts
+86
agent>
bun test
✓
14 passed
— 2.1s
agent>
bun run build
✓
build ok
— 1.9s
agent>
deploy
i4h2k9x.e2b.app
i4h2k9x.e2b.app
Checkout
$48
$32
$48
Total
$128
pay now
i4h2k9x.e2b.app
Checkout
$48
$32
$48
Total
$128
pay now
b7f2q
running · 4m
test · checkout flow
x3n8d
running · 42m
418
96
1.2
502
88
377
104
0.9
91
reconcile · q3.xlsx
k9m1p
running · 8m
def
migrate
(db):
rows = db.
scan
(
"billing"
)
for
r
in
rows:
r.normalize()
✓ 8 412 rows migrated
refactor · billing
t2w6r
boot
provisioning…
e5v0j
done · 1h04m
draft · contract
q8c4y
running · 3h
backtest · momentum
z1h7s
boot
provisioning…
—
queued
awaiting task
your vpc · us-east-1
private subnet · 10.0.2.0/24
ingress · 443
gate · mTLS
✕
egress blocked
sealed · microVM
firecracker · vsock · no shared kernel
+12%
+8
+4
0
JAN
MAR
MAY
JUL
SEP
+12.4%
S&P
backtest · results
SHARPE
1.84
MAX DD
−4.2%
WIN RATE
61.3%
TRADES
1 204
PNL
+12.4%
result · verified
booted from snapshot
uptime
04:37:12
Coding
Coding
Background
Background
Enterprise
Enterprise
Financial
Financial
100K+ teams on E2B · 94 of the Fortune 100 signed up · top AI labs & the fastest AI startups run here
Where E2B fits
Your
agent
is
the
product.
E2B
is
where
it
runs.
You
bring
the
model,
prompts,
and
agent
logic.
E2B
runs
the
machine
underneath.
Coding,
computer
use,
background
jobs,
RL
rollouts:
one
API,
an
isolated
microVM
per
session,
in
our
cloud
or
your
AWS,
GCP,
or
Azure
account.
E2B Cloud
Your cloud
Lifecycle
Network
Storage
Observability
MODEL CALLS
·
OUT
MCP TOOLS
·
OUT
YOUR DATA
·
IN
SECRETS
·
IN
Your agents
Any agent, any harness.
OpenAI Agents SDK
·
Claude Code
·
Codex
·
your own harness
Any agent
coding
·
data
·
computer use
·
evals
·
RL
E2B · the boundary
A full machine per agent session.
a microVM per session
·
Apache-2.0 runtime
·
SOC 2 Type II
The sandbox
boots from a snapshot
·
shell
·
filesystem
·
browser
·
network
Lifecycle
sandbox.pause()
Network
sandbox.getHost(port)
Storage
sandbox.files.write()
Observability
sandbox.getMetrics()
Through the boundary
Any model, any tool, your data, your keys.
the sandbox reaches out under your egress policy, never around it
Model calls
Anthropic
·
OpenAI
·
open weights
MCP tools
200+ servers, called from inside the sandbox
Your data
buckets
·
repos
·
internal APIs
Secrets
env vars scoped per sandbox
The cloud beneath
Our cloud, or inside yours.
same SDK, same API, wherever it runs
E2B Cloud
US
·
EU
·
APAC
Your cloud
AWS
·
GCP
·
Azure
Use cases
Build
and
train
any
agent.
Agents
that
act,
use
tools,
and
write
and
run
code
in
optimized
environments
Turn prompts into running apps
A prompt spins up coding sub-agents, builds the app, then serves it live from E2B.
Case study
→
Agents that work while the laptop is closed
One sandbox keeps using browser, CLI, and storage, scaling compute on its own.
Analysis your compliance team can approve
Ingest many sources, run the analysis, return a full report.
Every customer isolated, in your own cloud
Each customer's agent runs in its own microVM, inside your AWS, GCP, or Azure account via BYOC.
See E2B for enterprise
→
Sensitive data in, report out. Nothing leaves.
Genomes, compounds, and clinical data flow into secure compute; a report comes out.
Agents that use apps like a person
A full desktop with screen, mouse, and keyboard. The agent drives desktop apps, streamed live.
Case study
→
desktop.screenshot()
desktop.left_click(436, 124)
desktop.write("Q3 report")
desktop.press("enter")
XFCE · 1024×768
Turn prompts into running apps
A prompt spins up coding sub-agents, builds the app, then serves it live from E2B.
Case study
→
Agents that work while the laptop is closed
One sandbox keeps using browser, CLI, and storage, scaling compute on its own.
Analysis your compliance team can approve
Ingest many sources, run the analysis, return a full report.
Every customer isolated, in your own cloud
Each customer's agent runs in its own microVM, inside your AWS, GCP, or Azure account via BYOC.
See E2B for enterprise
→
Sensitive data in, report out. Nothing leaves.
Genomes, compounds, and clinical data flow into secure compute; a report comes out.
Agents that use apps like a person
A full desktop with screen, mouse, and keyboard. The agent drives desktop apps, streamed live.
Case study
→
desktop.screenshot()
desktop.left_click(436, 124)
desktop.write("Q3 report")
desktop.press("enter")
XFCE · 1024×768
Turn prompts into running apps
A prompt spins up coding sub-agents, builds the app, then serves it live from E2B.
Case study
→
Agents that work while the laptop is closed
One sandbox keeps using browser, CLI, and storage, scaling compute on its own.
Analysis your compliance team can approve
Ingest many sources, run the analysis, return a full report.
Every customer isolated, in your own cloud
Each customer's agent runs in its own microVM, inside your AWS, GCP, or Azure account via BYOC.
See E2B for enterprise
→
Sensitive data in, report out. Nothing leaves.
Genomes, compounds, and clinical data flow into secure compute; a report comes out.
Agents that use apps like a person
A full desktop with screen, mouse, and keyboard. The agent drives desktop apps, streamed live.
Case study
→
desktop.screenshot()
desktop.left_click(436, 124)
desktop.write("Q3 report")
desktop.press("enter")
XFCE · 1024×768
Reinforcement learning
Thousands of machines spin up, grade, and clear, fast.
&
Labs under NDA
Case study
→
MODEL
World model agentic simulations
Run game sims to generate synthetic training data.
Labs under NDA
Agent Evaluations
Outputs graded in parallel, then scored.
Agent benchmarks
Same prompt for every agent, in the same machine, graded side by side.
Reinforcement learning
Thousands of machines spin up, grade, and clear, fast.
&
Labs under NDA
Case study
→
MODEL
World model agentic simulations
Run game sims to generate synthetic training data.
Labs under NDA
Agent Evaluations
Outputs graded in parallel, then scored.
Agent benchmarks
Same prompt for every agent, in the same machine, graded side by side.
Reinforcement learning
Thousands of machines spin up, grade, and clear, fast.
&
Labs under NDA
Case study
→
MODEL
World model agentic simulations
Run game sims to generate synthetic training data.
Labs under NDA
Agent Evaluations
Outputs graded in parallel, then scored.
Agent benchmarks
Same prompt for every agent, in the same machine, graded side by side.
The machine
Everything
your
agent
needs
One
isolated
microVM
per
session,
with
an
API
around
it.
Run
code,
control
the
network,
keep
files,
hold
secrets,
watch
it,
pause
or
fork
it.
PTY · /home/user
python train.py --steps 200
Execution
Commands, code, a PTY, a full desktop.
Learn more
→
:3000
https://3000-{sandbox_id}.e2b.app
:8080
https://8080-{sandbox_id}.e2b.app
EGRESS
allow
api.openai.com
deny
0.0.0.0/0
Network
Ingress and egress, under your policy.
Learn more
→
/home/user
app/
data/
sales.csv
report.pdf
written · 2s ago
plot.png
mnt/buckets/
s3://acme-data
Storage
A filesystem that persists, plus your buckets.
Learn more
→
cpu 71%
00:00
00:30
01:00
Observability
Metrics, logs, and signed webhooks.
Learn more
→
SANDBOX
POST /v1/charges
Authorization: $STRIPE_KEY
EGRESS PROXY
POST /v1/charges
Authorization:
sk_live_••••••••
VALUE NEVER ENTERS THE SANDBOX
Secrets vault
Keys your agent can use but never read.
Learn more
→
RUN
PAUSE
UNBILLED
RESUME
SNAPSHOT
FORK
Lifecycle
Pause, resume, snapshot, fork.
Learn more
→
Sandbox
A full Linux microVM per agent session. Every capability above is this one machine.
npm
e2b
PyPI
e2b
Code Interpreter
The sandbox plus runCode(): execute Python or JavaScript, get charts, tables, and images back.
npm
@e2b/code-interpreter
PyPI
e2b-code-interpreter
Desktop · Use Computer
The sandbox plus a screen: mouse, keyboard, and a live stream for computer-use agents.
Agent
npm
@e2b/desktop
PyPI
e2b-desktop
Deployment
Our
cloud
or
yours.
Same
API.
One
standard.
Sandboxes
run
where
your
data
is
allowed
to
live.
Same
SDK,
CLI,
and
API
everywhere.
Moving
is
a
config
change.
E2B Cloud
Available
Available
Managed by E2B. Nothing to host.
–
Billed by the second, free tier to start
–
US, EU, and APAC regions
–
SOC 2 Type II, HIPAA
Your application
Your customers
E2B Cloud
Your cloud
One node
SDK
Control plane
Sandboxes
Lifecycle + metrics
E2B Cloud
Control plane + Sandboxes
You connect via the SDK. Nothing to host.
Your account. E2B operates it.
–
AWS, GCP, or Azure
–
Sandboxes and data stay in your VPC
–
Your IAM, KMS, and audit logs
The whole platform inside your boundary.
–
Control plane in your account
–
For air-gapped and sovereign networks
–
Design partners welcome
The whole E2B stack on one node.
–
Ship it inside your product or a customer tenancy
–
Docker Compose, Terraform on AWS or GCP, or Kubernetes
–
Open source, Apache-2.0
BYOC
Available
Available
Private cloud
In development
In development
E2B Embed
Available
Available
The runtime is Apache-2.0. Run the full stack on one node with E2B Embed, on your infrastructure or your customer's.
See E2B for enterprise
See E2B for enterprise
Your application
Your customers
E2B Cloud
Your cloud
One node
SDK
Control plane
Sandboxes
Lifecycle + metrics
E2B Cloud
Control plane + Sandboxes
You connect via the SDK. Nothing to host.
Security
Full
isolation.
Container
speed.
Every sandbox runs on E2B's proprietary MicroVM runtime, built on Firecracker with dedicated kernels and a custom memory and snapshot layer. It safely runs untrusted agentic workloads across tens of thousands of parallel sessions.
Battle-tested across 1B+ sandboxes, MicroVMs come standard. E2B is SOC 2 Type II and HIPAA compliant.
Visit the trust center
Visit the trust center
VMs are slow to start. Ours boot from a snapshot, so every session gets its own kernel at container speed.
Agents in production run here.
Agents in production run here.
Agents in production run here.
Agents in production run here.
Agents in production run here.
Agents in production run here.
Agents in production run here.
Agents in production run here.
Agents in production run here.
Agents in production run here.
Agents in production run here.
Agents in production run here.
► E2B by the numbers
94
Of the Fortune 100 signed up
100K+
Teams on E2B
1B+
Sandboxes started
10M+
Monthly SDK downloads
Customers
In
their
words
“
E2B allows us to scale-out training runs by launching hundreds of sandboxes in our experiments, which was essential in Open R1.
”
—
Lewis Tunstall
,
Research Engineer
Read the case study
Read the case study
“
Manus doesn't just run some pieces of code. It uses 27 different tools, and it needs E2B to have a full virtual computer to work as a real human.
”
—
Tao Zhang
,
Co-founder
Read the case study
Read the case study
“
E2B gives us a fast, secure way to run AI-generated code at scale, so we can ship workflow automation our enterprise customers trust.
”
—
Rahul Behal
,
Co-founder
Read the case study
Read the case study
“
We had implemented E2B in a week, needing just a single engineer working on that in spare cycles. Building this in-house would take us a few weeks and require multiple people.
”
—
Luiz Scheidegger
,
Head of Engineering
Read the case study
Read the case study
Works with
any agent stack.
Start with a ready-to-run template, or bring the SDKs and frameworks you already use. E2B provides the isolated machine underneath.
Pre-built templates
Amp
Claude Code
Codex
Cursor Agents
Hermes Agent
Droid
Devin
OpenCode
OpenCode
Try live
Pi
Prime Agent
Grok Build
OpenClaw
Computer Use
K3s
Code Interpreter
Kernel Browser
Muse Code
Terminal-Bench
Devin Outposts
docs.e2b.dev
Create your own
SDKs and frameworks
CrewAI
Agno
Mastra
Claude Managed Agents SDK
OpenAI Agents SDK
Google ADK
LangChain Deep Agents + Open SWE
Crabbox
Vercel AI SDK + Eve
Flue
CrewAI
Agno
Mastra
Claude Managed Agents SDK
OpenAI Agents SDK
Google ADK
LangChain Deep Agents + Open SWE
Crabbox
Vercel AI SDK + Eve
Flue
CrewAI
Agno
Mastra
Claude Managed Agents SDK
OpenAI Agents SDK
Google ADK
LangChain Deep Agents + Open SWE
Crabbox
Vercel AI SDK + Eve
Flue
open source
Open
at
the
core
The
runtime
your
agents
run
on
is
Apache-2.0:
readable,
self-hostable,
and
the
base
of
some
of
the
most-used
projects
in
the
OSS
agent
ecosystem.
The
only
open-source
hosted
microVM
sandbox
platform.
Explore our open source
Explore our open source
Star on GitHub
GitHub
14.3K
GitHub stars
Star on GitHub
GitHub
14.3K
GitHub stars
e2b-dev/E2B
14.3K
★
e2b-dev/fragments
6.4K
★
e2b-dev/code-interpreter
2.4K
★
e2b-dev/desktop
1.5K
★
e2b-dev/runtime
1.7K
★
e2b-dev/surf
873
★
e2b-dev/E2B
14.3K
★
e2b-dev/fragments
6.4K
★
e2b-dev/code-interpreter
2.4K
★
e2b-dev/desktop
1.5K
★
e2b-dev/runtime
1.7K
★
e2b-dev/surf
873
★
The E2B stack on GitHub, Apache-2.0
[
Pricing
]
Free
to
start.
Billed
by
the
second.
Hobby
Free
/$100 of usage in credits
+ Usage Costs
See our cost calculator
$100 one-time usage credit
Sessions up to 1 hour
20 concurrent sandboxes
Default sandbox CPU and RAM
Start for free
Start for free
(✓) No credit card required
Pro
$150
/month
+ Usage Costs
See our cost calculator
Everything in Hobby, usage billed by the second
Sessions up to 24 hours
100 concurrent sandboxes, expandable to 1,100
Custom sandbox CPU and RAM
Choose Pro
Choose Pro
(S) Billed through Stripe
Enterprise
Custom
+ Usage Costs
See our cost calculator
Committed usage, custom billing
Multi-day and persistent sessions
Tens of thousands of concurrent sandboxes
Custom sizes, plus BYOC deployment
Talk to an engineer
Talk to an engineer
($) Custom deployment and billing
Explore pricing
Explore pricing
1B+
sandboxes started
Give
every
agent
a
machine
Start Building
Start Building
Talk to an engineer
Talk to an engineer
pip install e2b
//
npm i e2b
·
free tier
---
title: 'Automated Penetration Testing: Full Autonomy Fell to 9%'
id: automated-penetration-testing-full-autonomy-fell-to-9
tags:
- ai-software-factory-architecture-58e4cc
- security-sweep
- adversarial-review
- evals
created: '2026-10-12T08:28:39.239209Z'
updated: '2026-10-12T08:30:40.748895Z'
source: https://simbian.ai/blog/automated-penetration-testing-2026
source_domain: simbian.ai
fetched_at: '2026-10-12T08:28:39.237404Z'
fetch_provider: builtin
status: draft
type: note
tier: unknown
content_type: unknown
deprecated: false
summary: 'Simbian.ai analysis (Sept 2026) of automated penetration testing maturity,
  directly relevant to the whitepaper''s ''automated 90-min cyber-security sweep''
  pillar. Cobalt''s AI and Pentesting Pulse Report 2026 (455 security leaders surveyed,
  published June 2026) found full reliance on AI automation fell from 29% to 9% year-over-year,
  with 47% moving to a hybrid model; 78% of teams reported false negatives from automated
  tools. CREST''s separate research found only 9% use autonomous agent-based testing
  vs 47% for reporting and 44% for vulnerability scanning/enumeration. Documents the
  OWASP Autonomous Penetration Testing Standard (APTS): 8 governance domains (scope
  enforcement, safety controls, human oversight, graduated autonomy levels, auditability,
  manipulation resistance, supply-chain trust, reporting) across 3 cumulative conformance
  tiers totaling 173 requirements. No major compliance framework (PCI DSS 11.4, DORA
  Article 27, NCSC CHECK) accepts a fully automated AI pentest as the whole test;
  SOC 2 is the structural exception since CC4.1 only requires ''credible, reproducible
  evidence'' with a named human sign-off. Notes XBOW''s AI agent topped HackerOne''s
  US leaderboard in June 2025, but human staff reviewed submissions before posting
  per HackerOne policy -- a hybrid result reported as fully autonomous. Lists autonomous
  pentest tool categories: exposure-validation platforms (Pentera, Picus, Cymulate,
  CyCognito), autonomous pentest agents (Horizon3.ai NodeZero, XBOW, Terra Security),
  runtime/IAST tools (Contrast Security), and free/OSS tools (OWASP Nettacker, Metasploit,
  Nuclei, MITRE Caldera). Proposes a 10-clause procurement checklist (autonomy tier
  per environment, defined triggers, proof-in-finding, named human signer, false-positive
  ceiling, multi-role testing, coverage assertion, seeded-finding acceptance test,
  pre-execution review gates, evidence handling).'
---

Automated Penetration Testing: Full Autonomy Fell to 9%
/
Book a Demo
Self-Improving Defense
Solutions
Products
Company
Resources
Book a Demo
Loading...
Automated Penetration Testing Works. Full Autonomy Doesn't.
Varun Kondagadapa
September 21, 2026
4 min read
Penetration Testing
Penetration Testing
On this page
Automated penetration testing uses software agents to find and exploit vulnerabilities continuously rather than once a year. It works in part: agents handle reconnaissance, OWASP baseline coverage, exploit chaining, and retesting unsupervised, though they can't judge business logic, authorization chains, or what they missed. Cobalt's 2026 Pulse Report found full reliance on AI automation fell from 29% to 9% in a year, with 47% now preferring a hybrid. The ceiling is accountability.
In November 2024, a pentester-turned-CEO wrote on r/cybersecurity that there's no such thing as useful automated penetration testing, and that ninety-nine times out of a hundred the phrase means a Nessus scan. Two years on, those objections are testable. Half of them held.
The half that held has nothing to do with what the machines can do.
What is automated penetration testing in 2026?
Automated penetration testing is software that executes an attack. Cataloguing the conditions that permit one is what a scanner does. A scanner reports a missing patch. An automated penetration test chains that patch into a session, pivots, and reaches the data — which is why the 2024 complaint about scanners-in-costume landed as hard as it did.
The category has also been renamed above the heads of the people using it. Gartner files this work under
adversarial exposure validation
, which it defines as technologies that deliver consistent, continuous, and automated evidence of the feasibility of an attack. Vendor summaries of its March 2025 Market Guide describe the category as consolidating breach and attack simulation with automated penetration testing, and Gartner refreshed the guide in March 2026. If you're writing a requirement or searching an analyst portal, your vendor's word and your analyst's word have come apart.
Gartner published something more useful to a practitioner in the same window. A March 2026 note titled
The Future of Pen Testing Is Continuous Offensive Security Testing
describes a trigger-driven model that "activates validation when material risk changes, not when the calendar dictates." Your application has shipped dozens of times since the last engagement. The engagement comes back in March, and everything between those two dates is untested by anybody.
Continuous penetration testing vs automated penetration testing
These two phrases get used interchangeably and they make different claims. Automated penetration testing describes
how
the test runs, with software executing the attack. Continuous penetration testing describes
when
it runs, on a trigger or a rolling cadence. A tool can be automated and still annual. A programme can be continuous and still largely manual, which is what most PTaaS retainers actually are. Gartner's 2026 framing collapses the distinction toward the second: what matters is whether validation fires when material risk changes. If you're comparing products on that axis specifically, we've scored ten
continuous penetration testing vendors
against six pillars.
Can penetration testing be automated?
Penetration testing can be partly automated. Agents now run reconnaissance, OWASP baseline coverage, exploit chaining, and retesting unsupervised for hours, though they still can't judge business logic, authorization chains, or what they failed to find. That gap is why 47% of teams in Cobalt's 2026 research prefer a hybrid model over full automation.
The answer has moved since 2024, when the practitioner consensus held that the phrase described a vulnerability scan with a dashboard. The same forums now carry specific concessions from the same kind of people.
One tester with sixteen years in the field described building an agent and running a full-scope engagement with almost no hands on it, report included. Another, working at an AI pentest vendor and arguing on a thread hostile to his own employer, put it more carefully: with a skilled tester driving Burp and ZAP, AI is approaching parity, and the real selling point is scale. A third described the shift that paid off as moving AI from summarizing an alert to proving the finding, with a clean negative control and independent replays before any human looks at it.
Set those against what the same people still refuse, and the boundary sits in a consistent place. Breadth, endurance across many steps, and chaining source-code knowledge into runtime exploits have all crossed over. Judgment hasn't.
Take the example the industry keeps citing without its caveat. When XBOW's agent reached the top of HackerOne's US leaderboard in June 2025, it was the first time an autonomous system had outranked every human on that board. The detail that gets dropped is that human staff reviewed the submissions before they went in, to comply with HackerOne's policy on AI tooling. The headline result was already a hybrid, and nobody reported it that way.
Automated vs manual penetration testing: which do you need?
Most organizations in 2026 need both automated and manual penetration testing, because each buys something the other can't. Cobalt's research found 47% now prefer exactly that hybrid, against 9% relying entirely on automation.
Automated
Manual
Breadth
Whole estate, every release
Scoped to the engagement
Cadence
On a trigger, continuously
Once or twice a year
Business logic
Weak — no model of what the app is for
The reason you hire people
Auditor signature
Not accepted alone in any major regime
Accepted
Marginal cost per run
Near zero
A new engagement
Which automated pentesting objections still hold?
Three of six practitioner objections to automated penetration testing still hold in 2026, and none of the three is a capability problem, which is why two more years of model progress won't move them. The 2024 thread is a useful control group because it's dated and specific. Nobody in it is disinterested either, since pentesters arguing that pentesting can't be automated have their own stake in the answer.
The 2024 objection
Verdict in 2026
"It's merely vulnerability scanning and high-noise, low-signal automated stuff"
Overturned under human review.
An agent topped HackerOne's US leaderboard in June 2025, with its vendor's staff checking submissions first. Still fair for much of the market, where the product is an OWASP baseline behind a chat interface
"It doesn't have the ability to create an exploit or find paths that aren't pre scripted"
Overturned.
Practitioners this year describe agents running for hours across many steps and chaining source-code findings into runtime attack paths
"Scanners can't test horizontal or vertical privilege escalation, because they don't understand context"
Partly holds.
Single-user tools stay structurally blind to authorization flaws. Multi-role parallel testing addresses the mechanism, and most products still run as one user
"I want it to run against production? No way"
Holds, and hardened.
Testers reported agents issuing DROP TABLE commands this year, and one described a vendor running unsolicited automated tests against a client
"Compliance companies offer free pentests that deliver zero value, and it dilutes the word"
Holds.
No major framework accepts a fully automated test as the whole test, which keeps the dilution risk where it was
"A computer can never be held accountable"
Holds, and hardened into regulation.
DORA now requires testers carrying professional indemnity insurance against negligence
Why did automated pentesting reliance fall to 9%?
Reliance on fully automated penetration testing fell to 9% because verification cost more than the automation saved. Cobalt's
AI and Pentesting Pulse Report 2026
, published in June and surveying 455 security leaders and practitioners, found the share of organizations relying entirely on AI automation dropped from 29% year over year, while
47% moved to a hybrid model
.
Read the pair together and the movement looks like scoping. Teams kept the tooling and narrowed where it runs alone.
Cobalt sells human-led pentesting, which matters here, because it isn't a disinterested source for a number that makes full automation look unready. The figure records what people say they prefer, which is a weaker instrument than watching what they do. It's also the only public measurement at this scale.
A second organization measured the adjacent thing.
CREST's research into AI in penetration testing
found that
only 9% report using autonomous, agent-based testing
, against 47% using AI for reporting and 44% for vulnerability scanning and enumeration. That's a level with no prior year behind it, so it can't corroborate a fall, and CREST accredits human testers and now sells an AI accreditation of its own. Treat it as a snapshot of where agents run today.
Cobalt's Pulse research also found
78% of security teams have experienced false negatives from automated penetration testing tools
. Hold that one loosely in a specific way: a survey can only count the misses somebody eventually caught, so the real rate sits somewhere above it and nobody knows where. An agent widens that uncertainty, because you weren't watching it work. A clean report from an unsupervised tool tells you about the report.
The real cost of automated pentesting: verification
Volume became the complaint. In 2024 the charge was that these tools found nothing worth reading; by 2026 they find far too much, and every claim lands on your desk for adjudication.
One practitioner did the arithmetic this year. A vendor's new tool produced 2,600 vulnerabilities to remediate in ninety days, they cleared more than 2,000, and 1,100 fresh ones landed on the list. Another, responding to a thread on whether pentesting was dying, said he now spends more time filtering false positives than he ever did. The phrase that settled into the vocabulary is unkind and accurate. They call it AI slop, full of hallucinated critical findings.
Two thousand cleared and eleven hundred fresh ones is a queue, and queue depth never appears on a pricing page.
Here's where the economics get uncomfortable. Automation is sold as the removal of human hours. When each run adds hours of triage downstream, those hours were transferred to a team that never agreed to take them.
Does automated penetration testing satisfy auditors?
No major compliance framework accepts a fully automated penetration test as the whole test today, with SOC 2 the one structural exception. The statement on record comes from a firm that is simultaneously a QSA, a 3PAO, and a SOC 2 auditor. Writing in August 2026, Josh Tomkiel, Managing Director on Schellman's Penetration Testing Team,
put it without hedging
: "No major compliance framework currently accepts a fully automated AI pen test at the time of this writing." He continues: "Not FedRAMP, PCI DSS, or any of the other standards our clients are regularly assessed against."
The structural reasons are worth knowing, because a better model dissolves none of them.
PCI DSS 11.4:
requires the test be performed by a qualified internal resource or qualified external third party, with organizational independence of the tester. The standard says nothing at all about AI, which means there's also no carve-out.
DORA Article 27:
governs threat-led penetration testing, and requires testers to be certified by a Member State accreditation body
or
to adhere to formal codes of conduct, and to carry professional indemnity insurance against misconduct and negligence. Insurance and a code of conduct attach to a person or a firm. An agent can't hold either.
NCSC CHECK:
gated on individually credentialed, security-cleared humans. A tool can't hold the credential.
SOC 2:
the one structural exception. The Trust Services Criteria don't require penetration testing as a named control; it appears as one example of a separate evaluation under CC4.1. The criteria ask for credible, reproducible evidence of control effectiveness, which an agent can produce, provided a named human signs it.
The one body that has moved didn't move the way vendor copy suggests. CREST opened an accreditation route in July 2026 covering AI-enabled penetration testing, and named its first cohort of ten firms in September. CREST's stated aim for the annex is that AI enhances professional judgment while maintaining the quality, integrity, and trust expected of accredited services. Accredited firms read that as a hard line. Packetlabs, one of the first cohort, states that in its practice AI may accelerate research, summarize information, or assist documentation, and never independently determines findings.
So the accreditation covers how a firm governs its use of AI. The agent itself remains outside it, and every regime above still resolves to a named human.
What is OWASP APTS for autonomous pentesting?
OWASP's Autonomous Penetration Testing Standard
defines the governance requirements an autonomous pentesting system must meet to operate safely, transparently, and within defined boundaries. It's the most concrete artifact published in this category in 2026, and almost nobody has written about it. It complements the existing testing standards by addressing what's new to this category: scope enforcement, safe autonomy, manipulation resistance, and accountability.
What are the eight OWASP APTS governance domains?
APTS defines eight governance domains, with conformance in three cumulative tiers totaling 173 requirements:
Scope Enforcement:
what the agent may touch
Safety Controls and Impact Management:
what it may break
Human Oversight and Intervention:
where a person must approve
Graduated Autonomy Levels:
assisted through fully autonomous
Auditability and Reproducibility:
whether a finding can be replayed
Manipulation Resistance:
whether the target can steer the agent
Third-Party and Supply Chain Trust:
what the platform inherits
Reporting:
what the output must carry
The load-bearing idea sits in the fourth domain. Autonomy is graduated — call it the autonomy ladder — and the obligations tighten as the human recedes. That reframes the 2024 argument entirely. Whether a machine can run a penetration test turns out to be the easy question. Which decisions it gets to make alone, and what has to be true first, is the one your procurement process can actually answer. Start by writing the tier you accept in production next to the tier you accept in staging, and notice how far apart you put them.
Which automated penetration testing tools lead in 2026?
Automated penetration testing tools in 2026 fall into three groups, and the group a product belongs to tells you which rung of the autonomy ladder it sits on.
Exposure validation platforms
run known techniques continuously against your estate and report which controls stopped them:
Pentera:
network and credential validation across on-prem and cloud
Picus Security:
control validation with remediation signatures
Cymulate:
breach and attack simulation with exposure scoring
CyCognito:
external attack surface discovery and testing
Autonomous pentest agents
reason toward an exploit path instead of replaying a content library:
Horizon3.ai NodeZero:
internal and external network compromise, with detection validation
XBOW:
web application exploitation; topped HackerOne's US leaderboard in June 2025
Terra Security:
agentic web application testing
Runtime and application testing
instruments the application from inside:
Contrast Security:
IAST-based continuous verification during execution
On the free end,
OWASP Nettacker
handles reconnaissance and modular scanning,
Metasploit
and
Nuclei
cover exploitation and templated checks, and
MITRE Caldera
does adversary emulation. All of them automate execution, and none automates judgment or accountability, which is the distinction this piece has been drawing and the reason no framework accepts their output as the test.
Several of these now market themselves under Gartner's adversarial exposure validation label, which is why the category names blur. Our own
AI Pentest Agent
sits on the agent rung, and the bias that creates is declared below, before the requirement list is put to us.
What should a penetration testing requirement include?
A penetration testing requirement should name an autonomy tier per environment, define what triggers a run, and specify the proof, signature, and kill switch each finding must carry. Ten clauses follow, drawn from the autonomy ladder above. They're vendor-neutral, and you should score everyone on them.
1. Declare the autonomy tier per environment:
name the OWASP APTS level you accept in production and the level you accept in staging. They shouldn't be the same number.
2. Define the trigger:
"continuous" means nothing without a list. Specify what fires a run — a deploy to an external-facing service, a new public hostname, a change to authentication code, an infrastructure-as-code diff touching a security group.
3. Require proof inside the finding:
deterministic reproduction steps and the reasoning trail that produced them, in the finding itself, not an appendix.
4. Name the human:
every conclusion carries an accountable signature, and every edit to a finding creates an attributed version with the reason recorded.
5. Cap the triage burden:
set a false-positive ceiling and measure the vendor on findings resolved, not findings produced.
6. Require multi-role authenticated testing:
at minimum two privilege levels tested in parallel with cross-checks, because a single-user tool can't see the authorization flaws that matter most.
7. Demand a coverage assertion:
the vendor states, in writing, what share of your attack-surface inventory the run actually reached.
8. Run a seeded-finding acceptance test:
plant known vulnerabilities in a staging copy and measure what the agent missed. This is the only practical answer to the false-negative problem, and it's the clause most vendors will resist.
9. Require pre-execution review of destructive actions:
every irreversible step gets a human gate, behind a kill switch you can reach from your own console.
10. Pin down evidence handling:
where exploit artifacts and any sampled data live, for how long, and who can read them.
Clauses 5, 7, and 8 separate a serious vendor from a demo. They're also the three the category currently does worst on.
How Simbian answers these automated pentesting clauses
We build one of these, so score us on the list too. Simbian's AI Pentest Agent ships a Thought Trace and deterministic reproduction steps with every finding, which answers clause 3. Findings arrive agent-authored at version one, and every human edit creates an attributed version whose stated reason feeds the next retest, covering clause 4. Safe mode puts a judge layer in front of the attacker that reviews each candidate action for exfiltration and disruption risk, with kill switches behind it, for clause 9. Multi-role parallel testing covers clause 6. On the auditor question, our continuous pentest service with LRQA pairs the agent with CREST-certified specialists who sign off the findings, which is the shape auditors accept today.
On clauses 5, 7, and 8 we're where everyone else is. Make us show you seeded-finding results before you believe the paragraph above.
What actually changed in automated penetration testing
The 2024 skeptics read the tools of 2024 correctly and the trajectory badly. Today's vendors have the capability argument right and say very little about the queue. You live in the gap between those two.
So write the autonomy level into the requirement — which decisions the agent makes without you, what proof it returns, who signs. Your auditor is already having that conversation with you; the only question is whether your vendor has had it yet.
If you're drafting that document now, the AI Pentest Buyer's Scorecard in the sidebar sets out the dimensions to score against. Or
book a demo
and put clause 8 to us directly.
Frequently asked questions
Q: Can penetration testing be automated?
Partly. Agents handle reconnaissance, OWASP baseline coverage, and retesting well, and they'll run for hours across many steps without supervision. Business logic defeats them, authorization chains defeat them, and none of them can tell you what it failed to find. The practical 2026 model pairs agent breadth with human judgment, which is where both CREST and Cobalt's research point.
Q: What is the difference between automated penetration testing and vulnerability scanning?
A scanner reports conditions that might permit an attack. An automated penetration test executes the attack and proves the path is reachable. The 2024 criticism of the category was that most products marketed as the second were doing the first, which was largely fair at the time.
Q: Will an automated penetration test satisfy PCI DSS or SOC 2?
Not PCI DSS on its own, because requirement 11.4 binds the test to a qualified, organizationally independent tester. SOC 2 is the realistic exception, since the Trust Services Criteria treat penetration testing as one example of a separate evaluation under CC4.1 and ask for reproducible evidence with a named human accountable.
Q: What is agentic pentesting?
Agentic pentesting describes systems where an agent plans its own next action from what it observes, with no predefined script behind it. What matters operationally is the autonomy level, meaning how much the system may do before a human approves it, which is what OWASP's Autonomous Penetration Testing Standard sets out to govern.
Q: What are the best free and open-source automated penetration testing tools?
OWASP Nettacker, Metasploit, Nuclei, and MITRE Caldera cover reconnaissance, exploitation, templated scanning, and adversary emulation at no license cost. They automate execution, and they don't automate judgment or accountability. No major compliance framework accepts their output as the test, and each still needs a named human to validate and sign the findings.
Q: Can an LLM run a penetration test on its own?
Not end to end. LLM penetration testing in practice means an agent loop: a model planning actions, calling tools, reading results. A model answering from its weights is something else. That loop now handles reconnaissance, OWASP baseline coverage, and exploit chaining across many steps. Judging business impact stays out of reach, as does knowing what it failed to find, which is why OWASP APTS governs autonomy by tier and says nothing about model capability.
Q: Will AI replace penetration testers?
No, though it changes what they spend time on. Reconnaissance, baseline coverage, and retesting move to the agent. Validating findings, chaining low-severity issues, judging business impact, and signing the report stay with the human, and every accreditation regime in force assumes that split.
Related Resources
AI Pentest Buyer's Scorecard
Whitepaper
AI Pentest Agent Solution Brief
Solution Brief
Share this article
Continue Reading
Penetration Testing
Will AI Replace Penetration Testers? Finding Isn't the Job
Will AI replace penetration testers? An AI agent beat 9 of 10 pros in a Stanford, CMU and Gray Swan AI study. What it still cannot do, and why it matters.
David Greene
August 24, 2026
Penetration Testing
Agentic AI Penetration Testing: 6 Best Practices
Agentic AI penetration testing delivers real benefits, but only with the right practices. Six that separate a genuine pentest from a glorified scanner.
David Greene
July 18, 2026
Penetration Testing
Adversarial Exposure Validation (AEV): A CISO's Guide
Adversarial Exposure Validation (AEV) proves which exposures are actually exploitable, defeating prevention and detection. A CISO's guide to AEV and CTEM.
Shivang Kalsi
July 29, 2026
From the Learning Center
AI penetration testing, explained
→
How AI pentest agents find, prove, and verify fixes for vulnerabilities — and how they compare to manual pentest.
Browse all Learning Center topics →
Sign up for Simbian's
Newsletter
By submitting this form, you agree to our
Privacy Policy
.
Ask AI about Simbian
---
title: The code review bug hunt is dead. Here's what developers get wrong. - The New
  Stack
id: the-code-review-bug-hunt-is-dead-heres-what-developers-get-wrong-the-new-stack
tags:
- ai-software-factory-architecture-58e4cc
- code-review
- adversarial-review
created: '2026-10-12T08:28:30.190582Z'
updated: '2026-10-12T08:31:34.769323Z'
source: https://thenewstack.io/code-review-catches-maintainability-bugs/
source_domain: thenewstack.io
fetched_at: '2026-10-12T08:28:30.185332Z'
fetch_provider: builtin
status: draft
type: note
tier: unknown
content_type: unknown
deprecated: false
summary: 'The New Stack article (Adrian Bridgwater, Jul 6 2026) arguing code review''s
  actual value is maintainability/architecture review, not bug-finding -- directly
  relevant to the pillar on adversarial model review and code quality gates in an
  agentic software factory. Named practitioners: Mark Dominus (senior software engineer)
  argues via a Mastodon post that ''anyone who depends on code review to find bugs
  is living in a fool''s paradise'' because finding bugs by examining a changeset
  is ''not in general possible'' and ''requires a certain amount of luck''; the real
  purpose is to flag code that will be hard to maintain. He proposes a concrete review
  protocol: reviewers get a fixed time box (''look at this for two hours, write a
  note about anything you don''t understand, and if you don''t get all the way through,
  make a note about where you stopped'') -- if the reviewer can''t finish in the time
  box, that itself signals the change set is too large/complex and should be split,
  giving even inexperienced reviewers a well-defined deliverable. Mikhail Golikov
  (QA engineer, open-source Python testing maintainer) calls review-as-bug-filter
  ''theatre'': ''A human skimming a diff cannot see a race condition or a discount
  that goes negative under load... Review is for code you will hate maintaining later;
  tests are for code that is broken now.'' Judah Taub (managing partner, Hetz Ventures)
  frames the AI-era trajectory: as agentic coding tools proliferate, human review
  shifts from line-level code inspection toward reviewing AI reviews of code, and
  ultimately toward validating architecture, intent, and business logic rather than
  code itself -- ''Code review catches style, architecture, readability and maintainability.
  Tests catch bugs. Production catches everything else.'' Directly informs the factory''s
  blast-radius/review-gate design: automated correctness verification (tests, static
  analysis) should precede any pull request reaching a human or AI reviewer, with
  review reserved for maintainability and architectural-intent validation.'
---

The code review bug hunt is dead. Here's what developers get wrong. - The New Stack
TNS
OK
SUBSCRIBE
Join our community of software engineering leaders and aspirational developers. Always 
								stay in-the-know by getting the most important news and exclusive content delivered 
								fresh to your inbox to learn more about at-scale software development.
EMAIL ADDRESS
REQUIRED
SUBSCRIBE
RESUBSCRIPTION REQUIRED
It seems that you've previously unsubscribed from our newsletter
										in the past. Click the button below to open the re-subscribe form 
										in a new tab. When you're done, simply close that tab and continue 
										with this form to complete your subscription.
RE-SUBSCRIBE
The New Stack does not sell your information or share it with 
									unaffiliated third parties. By continuing, you agree to our
Terms of Use
and
Privacy Policy
.
Welcome and thank you for joining The New Stack community!
Please answer a few simple questions to help us deliver the news and resources you are interested in.
FIRST NAME
REQUIRED
LAST NAME
REQUIRED
COMPANY NAME
REQUIRED
COUNTRY
REQUIRED
Select ...
United States
Canada
India
United Kingdom
Germany
France
---
Afghanistan
Albania
Algeria
American Samoa
Andorra
Angola
Anguilla
Antarctica
Antigua and Barbuda
Argentina
Armenia
Aruba
Asia/Pacific Region
Australia
Austria
Azerbaijan
Bahamas
Bahrain
Bangladesh
Barbados
Belarus
Belgium
Belize
Benin
Bermuda
Bhutan
Bolivia
Bonaire, Sint Eustatius and Saba
Bosnia and Herzegovina
Botswana
Bouvet Island
Brazil
British Indian Ocean Territory
Brunei Darussalam
Bulgaria
Burkina Faso
Burundi
Cambodia
Cameroon
Canada
Cape Verde
Cayman Islands
Central African Republic
Chad
Chile
China
Christmas Island
Cocos (Keeling) Islands
Colombia
Comoros
Congo
Congo, The Democratic Republic of the
Cook Islands
Costa Rica
Croatia
Cuba
Curaçao
Cyprus
Czech Republic
Côte d'Ivoire
Denmark
Djibouti
Dominica
Dominican Republic
Ecuador
Egypt
El Salvador
Equatorial Guinea
Eritrea
Estonia
Ethiopia
Falkland Islands (Malvinas)
Faroe Islands
Fiji
Finland
France
French Guiana
French Polynesia
French Southern Territories
Gabon
Gambia
Georgia
Germany
Ghana
Gibraltar
Greece
Greenland
Grenada
Guadeloupe
Guam
Guatemala
Guernsey
Guinea
Guinea-Bissau
Guyana
Haiti
Heard Island and Mcdonald Islands
Holy See (Vatican City State)
Honduras
Hong Kong
Hungary
Iceland
India
Indonesia
Iran, Islamic Republic Of
Iraq
Ireland
Isle of Man
Israel
Italy
Jamaica
Japan
Jersey
Jordan
Kazakhstan
Kenya
Kiribati
Korea, Republic of
Kuwait
Kyrgyzstan
Laos
Latvia
Lebanon
Lesotho
Liberia
Libyan Arab Jamahiriya
Liechtenstein
Lithuania
Luxembourg
Macao
Madagascar
Malawi
Malaysia
Maldives
Mali
Malta
Marshall Islands
Martinique
Mauritania
Mauritius
Mayotte
Mexico
Micronesia, Federated States of
Moldova, Republic of
Monaco
Mongolia
Montenegro
Montserrat
Morocco
Mozambique
Myanmar
Namibia
Nauru
Nepal
Netherlands
Netherlands Antilles
New Caledonia
New Zealand
Nicaragua
Niger
Nigeria
Niue
Norfolk Island
North Korea
North Macedonia
Northern Mariana Islands
Norway
Oman
Pakistan
Palau
Palestinian Territory, Occupied
Panama
Papua New Guinea
Paraguay
Peru
Philippines
Pitcairn Islands
Poland
Portugal
Puerto Rico
Qatar
Reunion
Romania
Russian Federation
Rwanda
Saint Barthélemy
Saint Helena
Saint Kitts and Nevis
Saint Lucia
Saint Martin
Saint Martin
Saint Pierre and Miquelon
Saint Vincent and the Grenadines
Samoa
San Marino
Sao Tome and Principe
Saudi Arabia
Senegal
Serbia
Serbia and Montenegro
Seychelles
Sierra Leone
Singapore
Sint Maarten
Slovakia
Slovenia
Solomon Islands
Somalia
South Africa
South Georgia and the South Sandwich Islands
South Sudan
Spain
Sri Lanka
Sudan
Suriname
Svalbard and Jan Mayen
Swaziland
Sweden
Switzerland
Syrian Arab Republic
Taiwan
Tajikistan
Tanzania, United Republic of
Thailand
Timor-Leste
Togo
Tokelau
Tonga
Trinidad and Tobago
Tunisia
Turkey
Turkmenistan
Turks and Caicos Islands
Tuvalu
Uganda
Ukraine
United Arab Emirates
United Kingdom
United States
United States Minor Outlying Islands
Uruguay
Uzbekistan
Vanuatu
Venezuela
Vietnam
Virgin Islands, British
Virgin Islands, U.S.
Wallis and Futuna
Western Sahara
Yemen
Zambia
Zimbabwe
Åland Islands
ZIPCODE
REQUIRED
Great to meet you!
Tell us a bit about your job so we can cover the topics you find most relevant.
What is your job level?
REQUIRED
Select ...
C-Level
VP/Director
Manager/Supervisor
Mid Level or Senior Non-Managerial Staff
Entry Level/Junior Staff
Freelancer/Contractor
Student/Intern
Other ...
Which of these most closely describes your job role?
REQUIRED
Select ...
Developer/Software Engineer
SysAdmin/Operations/SRE
Architect
Security Professional
DevOps Engineer/Team
Community Manager/Developer Advocate
IT management, including CIO/CISO/CTO
Business Development/Marketing/Sales
Enthusiast/Hobbyist
Other ...
How many employees are in the organization you work with?
REQUIRED
Select ...
Self-employed
2-10
11-50
51-250
251-1,000
1,001-10,000
> 10,000
I am not working
What option best describes the type of organization you work for?
REQUIRED
Select ...
“End user” organization that primarily uses IT products and services to support their business deliverables
Hardware / software vendor or supplier
Cloud service provider or managed service provider
System integrator or IT consulting firm
Other ...
Which of the following best describes your organization's primary industry?
REQUIRED
Select ...
Advertising/Marketing
Aerospace/Aviation
Agriculture
Automotive
Biotech/Pharmaceutical
Business Services (accounting, consulting, etc.)
Computers/Information Technology
Construction
Education
Facilities/Service Industry
Finance/Financial Services (banking, insurance, etc.)
Government
Healthcare
Human Resources
Legal
Life sciences (biotech, pharmaceuticals, etc.)
Manufacturing
Media
Non-profit
Real Estate
Retail/Consumer Goods
Telecommunications
Transportation/Logistics
Travel/Hospitality/Entertainment
Utility/Energy
Other ...
LINKEDIN PROFILE URL
Welcome!
We’re so glad you’re here. You can expect all the best TNS content to arrive 
									Monday through Friday to keep you on top of the news and at the top of your game.
What’s next?
Check your inbox for a confirmation email where you can adjust your preferences 
									and even join additional groups.
Follow TNS on your favorite social media networks.
Become a
TNS follower on LinkedIn
.
Check out
the latest featured and trending stories
while you wait for your 
									first TNS newsletter.
PREV
1
of
2
NEXT
VOXPOP
As a JavaScript developer, what non-React tools do you use most often?
✓
Angular
0%
✓
Astro
0%
✓
Svelte
0%
✓
Vue.js
0%
✓
Other
0%
✓
I only use React
0%
✓
I don't use JavaScript
0%
Thanks for your opinion! Subscribe below to get the final results, published 
			exclusively in our TNS Update newsletter:
SUBMIT
NEW! Try Stackie AI
ARCHITECTURE
Cloud Native Ecosystem
Containers
Databases
Edge Computing
Infrastructure as Code
Linux
Microservices
Open Source
Networking
Storage
ENGINEERING
AI
AI Engineering
API Management
Backend development
Data
Frontend Development
Large Language Models
Security
Software Development
WebAssembly
OPERATIONS
AI Operations
CI/CD
Cloud Services
DevOps
Kubernetes
Observability
Operations
Platform Engineering
PROGRAMMING
C++
Developer tools
Go
Java
JavaScript
Programming Languages
Python
Rust
TypeScript
CHANNELS
Podcasts
Ebooks
Events
Webinars
Newsletter
TNS RSS Feeds
THE NEW STACK
About / Contact
Sponsors
Advertise With Us
Contributions
PODCASTS
EBOOKS
EVENTS
WEBINARS
NEWSLETTER
CONTRIBUTE
ARCHITECTURE
ENGINEERING
OPERATIONS
PROGRAMMING
Cloud Native Ecosystem
Containers
Databases
Edge Computing
Infrastructure as Code
Linux
Microservices
Open Source
Networking
Storage
What Kubernetes’ "monolith" lesson means for AI agent harnesses
Oct 2nd 2026 12:31pm, by
Bill Doerrfeld
OpenTelemetry and Prometheus are getting along. What’s still missing?
Sep 25th 2026 12:56pm, by
Bill Doerrfeld
Kubernetes v1.37 brings 67 enhancements. Which matter for operators?
Sep 11th 2026 1:40pm, by
Bill Doerrfeld
Greptile, Cursor, and Devin agree that agents should run their code. What they run it against matters.
Jun 27th 2026 11:00am, by
Arjun Iyer
Agentic development hinges on verification. For cloud-native software, that is a runtime problem.
Jun 11th 2026 10:00am, by
Arjun Iyer
K3s vs. K8s: When lightweight Kubernetes distros win (and when they don't)
Oct 2nd 2026 9:00am, by
Peter Smails
How buildpacks help enterprises finally operate container security controls at scale
Sep 18th 2026 10:00am, by
Catherine Edelveis
Your container runs. Everything around it shouldn't be your problem.
Aug 29th 2026 11:00am, by
Satej Sawant
Your container images are unsigned. In the AI era, that's a ticking time bomb.
Aug 14th 2026 10:00am, by
Uma Sridharan
Pulling multi-gigabyte container images in seconds on Amazon EKS
Aug 10th 2026 12:00pm, by
Sri Saran Balaji Vellore Rajakumar and Neelendra Bhandari
You can outgrow vanilla Postgres without abandoning Postgres
Oct 8th 2026 12:23pm, by
Kimberly Fessel
Redis by proxy: Percona targets the last major hurdle to Valkey adoption
Oct 8th 2026 2:54am, by
Paul Sawers
Use Graph RAG when relationships are part of the evidence
Oct 1st 2026 9:30am, by
Jeremy Daly
Your AI agent aced the demo. Your data may still derail it.
Sep 30th 2026 11:00am, by
Kimberly Fessel
Think you need a better reranker? Check your retrieval first.
Sep 28th 2026 1:01pm, by
Kimberly Fessel
Your phone's vector index might be bigger than the AI model running it
Oct 6th 2026 2:53pm, by
Amanda Caswell
K3s vs. K8s: When lightweight Kubernetes distros win (and when they don't)
Oct 2nd 2026 9:00am, by
Peter Smails
SpaceX designed an orbital Vera Rubin. Radiation comes next.
Aug 31st 2026 2:55pm, by
Steven J. Vaughan-Nichols
Kubernetes at the edge has hit a wall. Fleet management is the way through.
Aug 20th 2026 9:00am, by
Arvind Bhoj and Aarthi Mahesh
Agentic AI has a latency problem that more compute won't solve
Aug 18th 2026 12:58pm, by
Jon Alexander
The API tax: Why AI agents stall without infrastructure context
Oct 8th 2026 9:30am, by
Oleg Danilyuk
Shai-Hulud: Whoever controls your package registry controls your pipeline
Aug 31st 2026 12:00pm, by
Zeen Rachidi
DNS is infrastructure. It’s time to manage it that way.
Jul 30th 2026 11:00am, by
Venus Kohli
Why Terraform is green when your cloud is broken
Apr 28th 2026 9:00am, by
Joe Karlsson
The one Slack message that proved our elite engineering team was flying blind
Apr 26th 2026 11:00am, by
Joe Karlsson
OpenAI's ChatGPT/Codex desktop app is now on Linux
Aug 11th 2026 1:53pm, by
Frederic Lardinois
Linux creator Linus Torvalds tells AI haters to walk away from Linux, or go fork it
Jul 16th 2026 11:15am, by
Adrian Bridgwater
Why Linux creator Linus Torvalds gets angry hearing "99% of code is AI"
May 29th 2026 10:34am, by
B. Cameron Gain
Sparky Linux 9 brings a rolling release to Debian
Mar 30th 2026 8:00am, by
Jack Wallen
Edera spent years calling KVM less secure. Here's why it changed its mind.
Mar 25th 2026 2:22pm, by
Steven J. Vaughan-Nichols
Building scalable, agent-friendly APIs for AI applications
Oct 8th 2026 7:00am, by
Nacho Martínez
Your merge gate was a compromise. Coding agents are making it a liability.
Jul 11th 2026 1:00pm, by
Arjun Iyer
Tetrate launches open source marketplace to simplify Envoy adoption
Mar 11th 2026 10:52am, by
Adrian Bridgwater
OpenTelemetry roadmap: Sampling rates and collector improvements ahead
Feb 24th 2026 11:00am, by
B. Cameron Gain
Merging To Test Is Killing Your Microservices Velocity
Dec 16th 2025 7:00am, by
Arjun Iyer
“Don’t use ‘open weight’ and ‘open source’ interchangeably”: Percona CEO on why AI terminology matters
Oct 9th 2026 2:43am, by
Paul Sawers
Redis by proxy: Percona targets the last major hurdle to Valkey adoption
Oct 8th 2026 2:54am, by
Paul Sawers
OpenSSH 10.6 deliberately breaks two features in the name of security
Oct 7th 2026 5:27pm, by
Amanda Caswell
What's up, Docsy? Google’s docs project joins the Linux Foundation as AI agents become readers
Oct 7th 2026 7:02am, by
Paul Sawers
The CNCF is graduating projects faster than ever. AI agents are helping with the due diligence.
Oct 6th 2026 4:02pm, by
Alex Wilhelm
Why your KubeVirt VMs can’t move between clusters — and how EVPN fixes it
Aug 8th 2026 10:00am, by
Miguel Duarte Barroso
DNS is infrastructure. It’s time to manage it that way.
Jul 30th 2026 11:00am, by
Venus Kohli
From intent to enforcement: Lessons from operating Kubernetes controllers at scale
Jul 17th 2026 8:00am, by
Sri Saran Balaji Vellore Rajakumar and Jayanth Varavani
What happens when your VPN meets 200 AI agents
Jul 14th 2026 2:53pm, by
Alex Wilhelm
Cloudflare wants to build the economic layer of the AI web
Jul 1st 2026 4:10pm, by
Amanda Caswell
AI data lakes are driving new storage demands
Oct 8th 2026 10:00am, by
Mrinal Kochar
Kubernetes 1.36 restores a lost guarantee for database backups
Sep 15th 2026 9:00am, by
Shubham Pampattiwar
When AI agent traces become application data
Aug 26th 2026 9:00am, by
Manveer Chawla
Why Postgres wants NVMe on the hot path, and S3 everywhere else
Apr 17th 2026 9:00am, by
Alasdair Brown
Scaling Btrfs to petabytes in production: a 74% cost reduction story
Mar 18th 2026 5:00am, by
Motiejus Jakštys
AI
AI Engineering
API Management
Backend development
Data
Frontend Development
Large Language Models
Security
Software Development
WebAssembly
“Don’t use ‘open weight’ and ‘open source’ interchangeably”: Percona CEO on why AI terminology matters
Oct 9th 2026 2:43am, by
Paul Sawers
Claude can now build your dashboards
Oct 8th 2026 3:00pm, by
Frederic Lardinois
AI data lakes are driving new storage demands
Oct 8th 2026 10:00am, by
Mrinal Kochar
Redis by proxy: Percona targets the last major hurdle to Valkey adoption
Oct 8th 2026 2:54am, by
Paul Sawers
Anthropic launches Haiku 5.5 at a much lower price
Oct 7th 2026 2:00pm, by
Frederic Lardinois
You can outgrow vanilla Postgres without abandoning Postgres
Oct 8th 2026 12:23pm, by
Kimberly Fessel
Most AI incident tools still leave a key decision to humans
Oct 8th 2026 12:20pm, by
Charles Humble
Claude Sonnet 5.5 vs. Opus 5.5: 42% cheaper and perfect on every run
Oct 8th 2026 8:00am, by
Jessica Wachtel
Decision models are suddenly everywhere. OpenAI’s is now public.
Oct 7th 2026 5:11pm, by
Meredith Shubel
Your phone's vector index might be bigger than the AI model running it
Oct 6th 2026 2:53pm, by
Amanda Caswell
Building scalable, agent-friendly APIs for AI applications
Oct 8th 2026 7:00am, by
Nacho Martínez
AI agents speed up development — data access slows them down
Oct 1st 2026 7:00am, by
Doug Sillars
MCP gets AI agents into your APIs. It doesn't decide what they should see.
Sep 29th 2026 9:06am, by
Matt DeBergalis
Anthropic bought Stainless and shuttered its SDK generator. Cloudflare open-sourced Forge instead.
Sep 28th 2026 9:39am, by
Paul Sawers
Amazon blocked Meta's Muse. Then Shopify wired it into every store.
Sep 23rd 2026 12:39pm, by
Janakiram MSV
You can outgrow vanilla Postgres without abandoning Postgres
Oct 8th 2026 12:23pm, by
Kimberly Fessel
Personalization is a ranking problem — architecture makes it work
Jul 23rd 2026 12:00pm, by
Jenny Morris
Can prompt caching tame RAG costs without sacrificing accuracy?
Jul 23rd 2026 9:00am, by
Emmanuel Akita
How async processing hides latency and improves responsiveness
Jul 12th 2026 1:00pm, by
Pekka Enberg
Why PHP performance keeps getting bumped from the roadmap
May 6th 2026 10:00am, by
Matthew Weier O’Phinney
Claude can now build your dashboards
Oct 8th 2026 3:00pm, by
Frederic Lardinois
You can outgrow vanilla Postgres without abandoning Postgres
Oct 8th 2026 12:23pm, by
Kimberly Fessel
OpenSearch veterans launch Infino. Here's why it matters for agent builders.
Oct 7th 2026 10:25am, by
Adrian Bridgwater
SAP acquires TechWolf to feed more context into its HR agents
Oct 6th 2026 12:52pm, by
Frederic Lardinois
"There is just not a room for error": SAP is putting its AI agents in the back office
Oct 6th 2026 12:38pm, by
Frederic Lardinois
Runway wants to generate software as you use it. Solaris is its first step.
Sep 1st 2026 3:44pm, by
Meredith Shubel
Astro's GitHub issue backlog is heading to zero for the first time in 5 years. Now Cloudflare is open-sourcing the tool that did it.
Aug 4th 2026 9:00am, by
Paul Sawers
Your social login buttons run on third-party cookies. FedCM doesn't.
Jul 2nd 2026 10:00am, by
Jeff Hickman
Anthropic overhauled Claude Design to fix the handoff. A designer and an engineer disagree on whether it worked.
Jun 19th 2026 9:35am, by
Meredith Shubel
Google wants to make the web agent-ready
May 19th 2026 1:45pm, by
Frederic Lardinois
“Don’t use ‘open weight’ and ‘open source’ interchangeably”: Percona CEO on why AI terminology matters
Oct 9th 2026 2:43am, by
Paul Sawers
Claude Sonnet 5.5 vs. Opus 5.5: 42% cheaper and perfect on every run
Oct 8th 2026 8:00am, by
Jessica Wachtel
OpenAI’s former safety lead says it’s shipping "new capability and risk every Tuesday"
Oct 7th 2026 2:18pm, by
Amanda Caswell
GPT-6.1 Sol vs. GPT-6 Astra: Same accuracy at 18% of the cost
Oct 7th 2026 10:17am, by
Jessica Wachtel
OpenAI brings text watermarking to its API -- and unlike Anthropic, it's off by default
Oct 5th 2026 3:29pm, by
Paul Sawers
GitHub Copilot is going local — but Microsoft won't say what gets sent to the cloud
Oct 8th 2026 1:49pm, by
Amanda Caswell
The audit log says my name: what an agent inherits when you hand it your credentials
Oct 8th 2026 11:00am, by
Naseeb Ahmed Mian
AI changed how you respond to incidents. Your tabletops haven't caught up.
Oct 8th 2026 9:00am, by
Andy Gombar
OpenSSH 10.6 deliberately breaks two features in the name of security
Oct 7th 2026 5:27pm, by
Amanda Caswell
Claude’s cyber safeguards are getting more flexible -- but not for everyone.
Oct 7th 2026 5:25pm, by
Meredith Shubel
Bit Cloud’s next chapter starts after the AI builds your app
Oct 1st 2026 1:00pm, by
Nick Lucchesi
Kill the code review theater, keep the review
Sep 30th 2026 10:00am, by
Ankit Jain
CRA readiness starts in the codebase
Sep 30th 2026 9:00am, by
Ekaterina Okuneva
Avoiding vendor lock-in through an open-source approach: a developer’s perspective
Sep 26th 2026 11:00am, by
Andreas Prins
Code review is burning out your best engineers
Sep 18th 2026 8:00am, by
Ankit Jain
Edge-forward: Akamai eyes sweet spot between centralized & decentralized AI inference
Apr 1st 2026 7:00am, by
Adrian Bridgwater
WebAssembly is now outperforming containers at the edge
Mar 29th 2026 9:00am, by
B. Cameron Gain
WebAssembly could solve AI agents' most dangerous security gap
Mar 24th 2026 9:01am, by
B. Cameron Gain
How WebAssembly plugins simplify Kubernetes extensibility
Mar 3rd 2026 2:00pm, by
B. Cameron Gain
WebAssembly is everywhere. Here's how it works
Feb 25th 2026 11:00am, by
Jessica Wachtel
AI Operations
CI/CD
Cloud Services
DevOps
Kubernetes
Observability
Operations
Platform Engineering
Most AI incident tools still leave a key decision to humans
Oct 8th 2026 12:20pm, by
Charles Humble
The API tax: Why AI agents stall without infrastructure context
Oct 8th 2026 9:30am, by
Oleg Danilyuk
AI changed how you respond to incidents. Your tabletops haven't caught up.
Oct 8th 2026 9:00am, by
Andy Gombar
Kubernetes won the orchestration wars. Its teams are still fighting.
Oct 7th 2026 3:57pm, by
Alex Wilhelm
How much control should AI get? Inside the SOC autonomy question
Oct 6th 2026 1:38pm, by
Carly Page
Agents have made CI the bottleneck. Faster pipelines are the wrong fix.
Oct 4th 2026 11:00am, by
Arjun Iyer
CloudBees just committed to an AI-first pivot. Here's why it matters for enterprise DevOps teams
Sep 30th 2026 2:08pm, by
Chris J. Preimesberger
“Dormant deployments were quietly consuming storage”: Why Vercel tightened its free-tier rules
Sep 19th 2026 9:00am, by
Meredith Shubel
Stop AI code sprawl before it destroys your software design
Sep 10th 2026 8:30am, by
Emmanuel Akita
AI broke code review. Two experts disagree on what replaces it.
Sep 8th 2026 11:35am, by
TNS Staff
How to reassign resource ownership before someone's last day
Sep 29th 2026 10:00am, by
Zeen Rachidi
The cloud reduced operational complexity. But many teams need someone to own it completely.
Sep 22nd 2026 10:00am, by
Sabari Sawant and Janakiram MSV
AWS open-sources an AI agent it says is 45% cheaper than Claude Code and Codex
Sep 21st 2026 2:30pm, by
Paul Sawers
“Dormant deployments were quietly consuming storage”: Why Vercel tightened its free-tier rules
Sep 19th 2026 9:00am, by
Meredith Shubel
The critical vulnerability was a test database. That's the whole triage problem.
Sep 17th 2026 12:56pm, by
Megan Carnegie
Harness bought Augment’s coding agents. The best feature hasn’t shipped yet.
Oct 8th 2026 5:38pm, by
Amanda Caswell
Most AI incident tools still leave a key decision to humans
Oct 8th 2026 12:20pm, by
Charles Humble
AI changed how you respond to incidents. Your tabletops haven't caught up.
Oct 8th 2026 9:00am, by
Andy Gombar
OpenSSH 10.6 deliberately breaks two features in the name of security
Oct 7th 2026 5:27pm, by
Amanda Caswell
Kubernetes won the orchestration wars. Its teams are still fighting.
Oct 7th 2026 3:57pm, by
Alex Wilhelm
Kubernetes won the orchestration wars. Its teams are still fighting.
Oct 7th 2026 3:57pm, by
Alex Wilhelm
The CNCF is graduating projects faster than ever. AI agents are helping with the due diligence.
Oct 6th 2026 4:02pm, by
Alex Wilhelm
What Kubernetes’ "monolith" lesson means for AI agent harnesses
Oct 2nd 2026 12:31pm, by
Bill Doerrfeld
K3s vs. K8s: When lightweight Kubernetes distros win (and when they don't)
Oct 2nd 2026 9:00am, by
Peter Smails
A live Kubernetes cluster can still have an ownership gap
Oct 1st 2026 11:30am, by
Chris J. Preimesberger
Most AI incident tools still leave a key decision to humans
Oct 8th 2026 12:20pm, by
Charles Humble
Dynatrace wants its AI agents to fix problems instead of adding alerts
Oct 5th 2026 3:06pm, by
Matthew Burns
XCOR launches to trace outages in minutes. It still pages engineers.
Oct 5th 2026 11:04am, by
Adrian Bridgwater
"No human wants to look at billions of traces": Dynatrace bought Arize because agents need a new kind of observability
Oct 1st 2026 4:05pm, by
Paul Sawers
Performance engineering from kernel analysis to AI: Adrian Cockcroft’s take
Sep 27th 2026 11:00am, by
Tim Koopmans and Cynthia Dunlop
Redis by proxy: Percona targets the last major hurdle to Valkey adoption
Oct 8th 2026 2:54am, by
Paul Sawers
A live Kubernetes cluster can still have an ownership gap
Oct 1st 2026 11:30am, by
Chris J. Preimesberger
The cloud reduced operational complexity. But many teams need someone to own it completely.
Sep 22nd 2026 10:00am, by
Sabari Sawant and Janakiram MSV
How to find failures without drowning in tracing data
Sep 3rd 2026 4:17pm, by
Alex Wilhelm
GitHub now sees 2.9 billion commits a month -- and it can't keep up
Aug 20th 2026 5:37pm, by
Frederic Lardinois
Your AI agent just provisioned a resource. Who owns it?
Oct 8th 2026 12:00pm, by
Zeen Rachidi
A live Kubernetes cluster can still have an ownership gap
Oct 1st 2026 11:30am, by
Chris J. Preimesberger
How to reassign resource ownership before someone's last day
Sep 29th 2026 10:00am, by
Zeen Rachidi
The rise of agentic AI on Kubernetes: unleashing the new infrastructure layer
Sep 27th 2026 10:00am, by
Rhys Oxenham
Avoiding vendor lock-in through an open-source approach: a developer’s perspective
Sep 26th 2026 11:00am, by
Andreas Prins
C++
Developer tools
Go
Java
JavaScript
Programming Languages
Python
Rust
TypeScript
Open source USearch library jumpstarts ScyllaDB vector search
Feb 5th 2026 12:00pm, by
Jelani Harper
AWS WAF vs. Google Cloud Armor: A Multicloud Security Showdown
Nov 25th 2025 10:00am, by
Advait Patel
Goodbye Dashboards: Agents Deliver Answers, Not Just Reports
Nov 23rd 2025 9:00am, by
Ketan Karkhanis
Rust vs. C++: a Modern Take on Performance and Safety
Oct 22nd 2025 2:00pm, by
Zziwa Raymond Ian
Building a Real-Time System Monitor in Rust Terminal
Oct 15th 2025 7:05am, by
Tinega Onchari
Harness bought Augment’s coding agents. The best feature hasn’t shipped yet.
Oct 8th 2026 5:38pm, by
Amanda Caswell
GitHub Copilot is going local — but Microsoft won't say what gets sent to the cloud
Oct 8th 2026 1:49pm, by
Amanda Caswell
OpenSearch veterans launch Infino. Here's why it matters for agent builders.
Oct 7th 2026 10:25am, by
Adrian Bridgwater
What's up, Docsy? Google’s docs project joins the Linux Foundation as AI agents become readers
Oct 7th 2026 7:02am, by
Paul Sawers
Copilot tops GitHub's own AI code review benchmark. An independent one tells a different story.
Oct 6th 2026 2:06pm, by
Paul Sawers
Code that passes every test can still break the next AI agent that touches it
Aug 12th 2026 1:00pm, by
Amanda Caswell
Microsoft joins Google in backing Go for AI agents — OpenAI and Anthropic lag
Jul 11th 2026 10:00am, by
Paul Sawers
Go Experts: 'I Don't Want to Maintain AI-Generated Code'
Sep 28th 2025 6:00am, by
David Cassel
How To Run Kubernetes Commands in Go: Steps and Best Practices
Jun 27th 2025 8:00am, by
Sunny Yadav
Prepare Your Mac for Go Development
Apr 12th 2025 7:00am, by
Damon M. Garn
How a forgotten node can put Oracle Java back in production
Sep 24th 2026 1:50pm, by
Adrian Bridgwater
Azul wants to find your unpatched JVMs before AI does
Jun 24th 2026 4:53pm, by
Darryl K. Taft
Chainguard targets Java's unpatched vulnerability backlog with drop-in remediated libraries
Jun 24th 2026 4:48pm, by
Darryl K. Taft
Transform your AI coding agent into a deterministic Java Spring expert
Jun 11th 2026 9:00am, by
Raquel Pau
Spring is 23 years old. AI just made it a security emergency.
Jun 9th 2026 2:48pm, by
Darryl K. Taft
Cloudflare aqui-hires VoidZero: Did a piece of the open web just stabilize, or become more brittle?
Jun 5th 2026 3:01pm, by
Adrian Bridgwater
"Real maturity problems": Not every developer is thrilled with Bun after Anthropic acquisition
May 5th 2026 1:03pm, by
Adrian Bridgwater
TypeScript 6.0 RC arrives as a bridge to a faster future
Mar 14th 2026 9:00am, by
Darryl K. Taft
WebAssembly is everywhere. Here's how it works
Feb 25th 2026 11:00am, by
Jessica Wachtel
Wasm vs. JavaScript: Who wins at a million rows?
Feb 22nd 2026 6:00am, by
Jessica Wachtel
GitHub and Anthropic used their own agents for major Rust rewrites -- but with very different playbooks
Sep 17th 2026 2:06pm, by
Paul Sawers
JetBrains kills Kotlin Notebook months after Microsoft's Polyglot exit. But Jupyter is doing just fine.
Jun 29th 2026 1:59pm, by
Paul Sawers
Trust in Rust: Foundation debuts official training to tackle steep learning curve
Jun 25th 2026 12:30pm, by
Darryl K. Taft
Who will maintain the web when PHP's veterans retire?
Apr 16th 2026 2:53pm, by
Darryl K. Taft
Will AI force code to evolve or make it extinct?
Mar 22nd 2026 6:00am, by
David Cassel
Stop AI code sprawl before it destroys your software design
Sep 10th 2026 8:30am, by
Emmanuel Akita
Why basic RAG fails at multi-hop reasoning (and how GraphRAG fixes it)
Aug 27th 2026 10:00am, by
Emmanuel Akita
Nvidia's NOOA makes an agent one Python class
Aug 4th 2026 10:02am, by
Meredith Shubel
Spark 4.2 has a feature that could retire your vector database
Jul 19th 2026 12:00pm, by
Amanda Caswell
JetBrains kills Kotlin Notebook months after Microsoft's Polyglot exit. But Jupyter is doing just fine.
Jun 29th 2026 1:59pm, by
Paul Sawers
GitHub and Anthropic used their own agents for major Rust rewrites -- but with very different playbooks
Sep 17th 2026 2:06pm, by
Paul Sawers
How AWS Lambda logs every flow across thousands of microVMs per host with eBPF and Rust
Sep 11th 2026 8:00am, by
Prashant Kumar Singh, Kshitij Gupta and Shivendra Srivastava
AI-generated Rust compiles perfectly. That's the scary part.
Aug 19th 2026 3:30pm, by
Amanda Caswell
Grok 4.5 vs. Claude Opus 4.8: Costs and what works, not the spec sheet
Jul 20th 2026 9:38am, by
Jessica Wachtel
Trust in Rust: Foundation debuts official training to tackle steep learning curve
Jun 25th 2026 12:30pm, by
Darryl K. Taft
From clobbered drafts to real-time sync
Apr 14th 2026 10:00am, by
David Moore
TypeScript 6.0 RC arrives as a bridge to a faster future
Mar 14th 2026 9:00am, by
Darryl K. Taft
Mastra empowers web devs to build AI agents in TypeScript
Jan 28th 2026 11:00am, by
Loraine Lawson
Inferno Vet Creates Frontend Framework Built With AI in Mind
Dec 10th 2025 11:00am, by
Loraine Lawson
JavaScript Utility Library Lodash Changing Governance Model
Nov 1st 2025 7:00am, by
Loraine Lawson
2026-07-06 08:00:00
The code review bug hunt is dead. Here's what developers get wrong.
Software Development
/
Software Testing
/
Tech Culture
The code review bug hunt is dead. Here’s what developers get wrong.
Engineers and experts say code review rarely catches bugs — its real job is flagging code that's painful to maintain later.
Jul 6th, 2026 8:00am by
Adrian Bridgwater
Ghariza Mahavira
The software code review process is a systematic, peer-driven quality assurance procedure that scrutinizes code when a developer submits a pull or merge request.
Although poor code review procedures are bemoaned for their inevitable delays and the potential for people to create bottlenecks over inconsequential niggles, good code review catches bugs early, fosters mentoring relationships, and is seen as a democratic way of sharing responsibility.
That’s all there is to it, except that it’s not.
Senior software engineer
Mark Dominus
tells
The New Stack
that although many companies do obviously perform code reviews, they don’t “articulate what the result of the review is supposed to be”, and that’s a problem.
“Say you’re a junior engineer, and you’re told for the first time to do a code review. What’s your deliverable? In many places I’ve worked, the deliverable has been left unspecified,” Dominus says.
In a
Mastodon post
on this subject, Dominus wrote that “anyone who depends on code review to find bugs is living in a fool’s paradise”, primarily because it is “not in general possible” to find bugs by examining code. He underlined his comment, saying that the “primary purpose of code review” is to find code that will be hard to maintain in the future.
A sure path to code review bad results
He suggests that in scenarios where a software engineer is expected to take a leisurely walking tour through the
change set
and call out things they don’t like, that leads to bad results, i.e., it encourages people to try and enforce their own preferences about how things should be done, and arguments generally ensue.
“Finding bugs, just from examining a change set, is extremely difficult and requires a certain amount of luck.” – Mark Dominus.
“Sometimes the boss gives the junior engineer a little more to go on, such as: ‘see if you can find any bugs,’ and this puts the junior in an unpleasant position,” clarifies Dominus. “Maybe they do find a bug, great! But what if they don’t?
Finding bugs
, just from examining a change set, is extremely difficult and requires a certain amount of luck.”
He suggests a different approach in which software team project leaders drive the code review process by saying: “Look at this for two hours, write a note about anything you don’t understand, and if you don’t get all the way through, make a note about where you stopped.”
A route to delivering real software engineering value
“Now, if the reviewer doesn’t have time to look at everything, you have learned something valuable: the changes are too big or complex to be understood in two hours. Perhaps the change set should be broken into two or more smaller submissions that should be reviewed separately. No matter how junior, inexperienced, or hungover the reviewer is, they can deliver what was asked, and what they deliver will have real engineering value,” explains Dominus.
That real engineering value is a positive negative in this case. The team has now identified code that another team member can’t understand, or that the change set is too unwieldy for the current code review process… or both.
Code review is theatre, playing soon, near you
Agreeing broadly with these sentiments,
Mikhail Golikov
, a QA engineer at a high-load e-commerce platform company, tells
The New Stack
that “code review is theatre” if a team is leaning on it to catch bugs.
“When a team treats review as its bug filter, it ships with a warm feeling and no evidence, then finds out in production,” – Mikhail Golikov.
“A human
skimming a diff
cannot see a race condition or a discount that goes negative under load. Review is for code you will hate maintaining later; tests are for code that is broken now,” Golikov underlines. “A reviewer reads a clean diff, sees sensible names and tidy functions, and clicks approve. None of that tells you a key part of the app malfunctions and delivers a broken service to the user.”
Golikov, who is also
a maintainer of open-source Python
testing tools, explains that the kind of bugs that cause these errors don’t live in the code developers can read. Instead, they live in the states the code gets into at runtime.
Don’t ship with a warm feeling and no evidence
“When a team treats review as its bug filter, it ships with a warm feeling and no evidence, then finds out in production,” Golikov confirms. “Review is for the question ‘will I hate maintaining this in six months’ and ‘does it actually work’ when a test is run against real inputs, not for a human skimming a pull request at 5 pm.”
There’s little argument among developers and vendors alike that code review processes need to change, especially in the era of AI with the increasing presence of agentic coding tools.
Judah Taub
, managing partner at
Hetz Ventures
, agrees with the narrative here and tells
The New Stack
that for years, engineering teams have treated code review as the last line of defense against bugs, but that was never really their strength.
“The role of the engineer continues to move further away from the actual code and toward validating architecture, intent and business logic. In the future, even that may be automated,” Judah Taub.
“Code review catches style, architecture, readability and maintainability,” Taub says. “Tests catch bugs. Production catches everything else. The best engineering organizations don’t rely on another developer spotting a subtle edge case buried in hundreds of lines of code – they build systems that automatically verify correctness long before a pull request reaches another human. Code review is to ensure the next engineer can work on the code seamlessly.”
The future for code review
As
AI-generated code
now enters the fray, Taub thinks the inevitable new equilibrium will be one in which humans review less code directly and increasingly review AI reviews of code instead.
“The role of the engineer continues to move further away from the actual code and toward validating architecture, intent, and business logic. In the future, even that may be automated,” he predicts.
We can surely extract key trends here and say that software engineering teams certainly need to get out of the nineties, if that’s where they currently reside.
The combined revolutions of cloud-native, platform engineering, and vibe coding onward to agentic coding (you can add in big data, DevOps, and the standardization towards enterprise open source if you wish) have changed the way software developers work, so there should arguably be a commensurate change in the way they review what just happened.
TRENDING STORIES
Group
Created with Sketch.
Adrian Bridgwater is a technology journalist with three decades of press experience. He has an extensive background in communications, starting in print media, newspapers and also television. Primarily working as an analysis writer dedicated to a software application development ‘beat’,...
Read more from Adrian Bridgwater
SHARE THIS STORY
TRENDING STORIES
SHARE THIS STORY
TRENDING STORIES
TNS DAILY NEWSLETTER
Receive a free roundup of the most recent TNS articles in your inbox each day.
SUBSCRIBE
The New Stack does not sell your information or share it with 
		unaffiliated third parties. By continuing, you agree to our
Terms of Use
and
Privacy Policy
.
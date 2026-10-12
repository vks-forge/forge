---
title: OWASP Non-Human Identities Top 10 | OWASP Foundation
id: owasp-non-human-identities-top-10-owasp-foundation
tags:
- ai-software-factory-architecture-58e4cc
- locus-worker-agent-autonomy-reliability-at-scale
- owasp-nhi
- offboarding
- primary-source
created: '2026-10-12T08:45:43.127421Z'
updated: '2026-10-12T08:46:19.666241Z'
source: https://owasp.org/projects/non-human-identities-top-10
source_domain: owasp.org
fetched_at: '2026-10-12T08:45:43.125263Z'
fetch_provider: builtin
status: draft
type: note
tier: unknown
content_type: unknown
deprecated: false
summary: 'OWASP Non-Human Identities (NHI) Top 10 (2025) project page, the primary
  normative source ranking NHI1:2025 ''Improper Offboarding'' as the #1 risk for non-human
  identities (service accounts, API keys, agent credentials): ''inadequate deactivation
  or removal of non-human identities... when they are no longer needed. Unmonitored
  and deprecated services may remain vulnerable, and their associated NHIs can be
  exploited by attackers to gain unauthorized access to sensitive systems and data.''
  NHI2:2025 is Secret Leakage (hardcoded/plaintext/chat-shared API keys, tokens, encryption
  keys, certificates). This directly substantiates the governance claim that offboarding/kill-switch
  mechanisms for AI agent credentials are an industry-recognized top risk, not a hypothetical
  concern, ahead of leaked secrets and overprivileged access.'
---

*Suggested by [[leaver-for-ai-agents-you-fired-the-ai-did-it-actually-leave-opnova]] — primary source for OWASP NHI1 improper offboarding ranking cited by Opnova blog*

OWASP Non-Human Identities Top 10 | OWASP Foundation
OWASP Non-Human Identities Top 10
OWASP Non-Human Identities Top 10 - An OWASP incubator project
View on GitHub
Documentation
About
OWASP Non-Human Identities Top 10
What is Non-Human Identities top 10?
The Non-human identity (NHI) top 10 is a comprehensive list of the most pressing security risks and vulnerabilities that non-human identities present to organizations.

Production software environments are composed of a large number of applications which need to be identified, resulting in “non-human identities” or NHI. Application identities are often associated with secrets, which are used as credentials similarly to the way humans authenticate into computer systems. Application secrets may be used to authenticate into other applications within the trust domain. They may also be used to authenticate into 3rd party SaaS applications.

While long-term application secrets behave similarly to human passwords, short term secrets may be generated on the fly by the run-time environment, based on application attestation, where the environment identifies the application and provisions it with credentials.

This project is aimed at helping security professionals thoroughly understand their non-human identity attack surface, so they can better protect and manage it. The project spans across thoroughly explaining the risks and their potential exploits, as well as providing actionable prevention practices and incident response playbooks.
NHI Top 10 - 2025 -  A sneak peek
The OWASP NHI Top 10 2025 is out! Below, you can see a sneak peek into the top risks.

This comprehensive list highlights the most critical challenges in integrating Non-Human Identities (NHIs) into the development lifecycle, ranked based on exploitability, prevalence, detectability, and impact.

You can find the home page for the 2025 version here
•
OWASP Non-Human Identities Top 10 for 2025
NHI1:2025 - Improper Offboarding
Improper offboarding refers to the inadequate deactivation or removal of non-human identities (NHIs) such as service accounts and access keys when they are no longer needed. Unmonitored and deprecated services may remain vulnerable, and their associated NHIs can be exploited by attackers to gain unauthorized access to sensitive systems and data.
•
Read More
NHI2:2025 - Secret Leakage
Secret Leakage refers to the leakage of sensitive NHIs such as API keys, tokens, encryption keys, and certificates to unsanctioned data stores throughout the software development lifecycle When secrets are leaked —for instance, hard-coded into source code, stored in plain text configuration files, or sent over public chat applications —they become susceptible to exposure.
•
Read More
NHI3:2025 - Vulnerable Third-Party NHI
Third-party non-human identities (NHIs) are extensively integrated into the development workflow, both through the use of integrated development environments (IDEs) and their extensions and also through the use of 3rd party SaaS. If a third-party extension is compromised—whether through a security vulnerability or a malicious update—it can be exploited to steal these credentials or misuse the granted permissions.
•
Read More
NHI4:2025 - Insecure Authentication
Developers frequently integrate internal and external (third-party) services into their applications. These services require access to resources within these systems, necessitating authentication credentials. However, some authentication methods are deprecated, vulnerable to known attacks, or considered weak due to outdated security practices. Utilizing insecure or obsolete authentication mechanisms can expose organizations to significant risks.
•
Read More
NHI5:2025 - Overprivileged NHI
During application development and maintenance, developers or administrators may assign NHIs with significantly more privileges than required for their function. When an over-privileged NHI is compromised — whether through vulnerabilities in the application, malware, or other security breaches — attackers can exploit the excessive permissions.
•
Read More
NHI6:2025 - Insecure Cloud Deployment Configurations
Continuous Integration and Continuous Deployment (CI/CD) applications enable developers to automate the process of building, testing, and deploying code to production environments. These integrations often require authentication with cloud services, typically achieved using static credentials or OpenID Connect (OIDC). Static credentials can be inadvertently exposed through code repositories, logs, or configuration files. If compromised, these credentials can provide attackers with persistent and potentially privileged access to production environments. While OIDC offers a more secure alternative, if the identity tokens are not properly validated or there are no strict conditions on token claims unauthorized users might exploit these weaknesses to gain access.
•
Read More
NHI7:2025 - Long-Lived Secrets
Long-lived Secrets refers to the use of sensitive NHIs such as API keys, tokens, encryption keys, and certificates with expiration dates that are too far in the future or that don’t expire at all. If a breached secret is long-lived, it provides attackers with access to sensitive services without any time constraints.
•
Read More
NHI8:2025 - Environment Isolation
Environment isolation is a fundamental security practice in cloud application deployment, where separate environments are used for development, testing, staging, and production. NHIs are often utilized during the deployment process and throughout an application’s lifecycle. However, reusing the same NHIs across multiple environments—especially between testing and production—can introduce significant security vulnerabilities.
•
Read More
NHI9:2025 - NHI Reuse
Reusing the same NHI across different applications, services, or components — even if they are deployed together — introduces significant security risks. If an NHI is compromised in one area, an attacker can exploit it to gain unauthorized access to other parts of the system that use the same credentials.
•
Read More
NHI10:2025 - Human Use of NHI
During application development and maintenance, developers or administrators may misuse NHIs for manual tasks that should be performed using individual human identities with appropriate privileges. This practice introduces significant security risks such as elevated privileges for NHIs, lack of auditing and accountability due to indistinguishable activity between humans and automation.
•
Read More
Project Resources
Documentation
GitHub
Email Group
Slack
Project Leaders
Tal Skverer
Astrix Security
Email
LinkedIn
Roni Lichtman
Torch Security
Email
LinkedIn
Major Contributors
Recognizing key contributors who have made significant impact on this project.
Or Cohen
Email
LinkedIn
Idan Basre
Email
LinkedIn
Amir Benvenisti
Email
LinkedIn
Dor Dali
Cyolo
Email
LinkedIn
Jack Schofield
Snyk
Email
LinkedIn
Bar Kaduri
Orca Security
LinkedIn
Tomer Yahalom
Astrix Security
LinkedIn
Danielle Guetta
Astrix Security
LinkedIn
Yonatan Yosef
Orca Security
LinkedIn
Adam Ochayon
Oasis Security
LinkedIn
Yaron Sheffer
Intuit
LinkedIn
Ben Kim
Cremit
LinkedIn
Project Information
💡
Incubator Project
Classification
🏷️
Other
Language
HTML
Contributors
26
GitHub Stars
56
Downloads
0
Corporate Supporters
Become a Corporate Supporter
Meet our Corporate Supporters
Supporter Job Postings
OWASP is a nonprofit foundation improving software security through open-source projects, global communities, and education. All resources are free and open to everyone.
Quick Links
Awards
Chapters
Community
Contact
Corporate Supporters
Events
News
OWASP Community
Projects
Security
Staff
OWASP Merch
Legal & Governance
About OWASP
Board
Board EU
Finance (all documents)
Finance & Governance
Policies
Impact Report 2025
Strategic Plan 2026
Socials
Bluesky
GitHub
LinkedIn
Mastodon
Slack
X
YouTube
Make a Donation
Join Now
Join Slack
OWASP, the OWASP logo, and Global AppSec are registered trademarks and AppSec Days, AppSec California, AppSec Cali, SnowFROC, OWASP Boston Application Security Conference, and LASCON are trademarks of the OWASP Foundation, Inc.
© 2026, OWASP Foundation Inc. All rights reserved.
---
title: Airline ordered to compensate a B.C. man because its chatbot provided inaccurate
  information - Dentons Data
id: airline-ordered-to-compensate-a-bc-man-because-its-chatbot-provided-inaccurate-i
tags:
- ai-software-factory-architecture-58e4cc
- legal-precedent
- agent-incidents
- air-canada
created: '2026-10-12T08:36:37.033327Z'
updated: '2026-10-12T08:38:57.362602Z'
source: https://www.dentonsdata.com/airline-ordered-to-compensate-a-b-c-man-because-its-chatbot-provided-inaccurate-information/
source_domain: www.dentonsdata.com
fetched_at: '2026-10-12T08:36:37.030781Z'
fetch_provider: builtin
status: draft
type: note
tier: unknown
content_type: unknown
deprecated: false
summary: 'Dentons (law firm) legal-analysis blog post on Moffatt v. Air Canada, 2024
  BCCRT 149, the British Columbia Civil Resolution Tribunal decision frequently cited
  across the AI-agent literature as the canonical ''chatbot liability'' precedent
  — fetched as a substitute primary-adjacent source after the original McCarthy Tétrault
  analysis (mccarthy.ca) was rate-limited (HTTP 429). Gives case specifics beyond
  the secondary citations elsewhere in this research batch: the customer, Mr. Moffatt,
  was quoted a bereavement-fare refund policy by Air Canada''s website chatbot that
  directly contradicted the airline''s actual written policy (the chatbot said a reduced
  fare could be claimed retroactively within 90 days via refund application; the real
  policy barred retroactive claims). Air Canada''s own representative admitted in
  writing that the chatbot gave ''misleading words.'' Tribunal member Christopher
  C. Rivers rejected Air Canada''s argument that the chatbot was a ''separate legal
  entity'' responsible for its own statements, holding (Para. 27) that ''it is still
  just a part of Air Canada''s website... it makes no difference whether the information
  comes from a static page or a chatbot,'' and separately rejected Air Canada''s argument
  that a link to the correct policy elsewhere on the chatbot''s page absolved it,
  holding there was no reason a customer should know one part of a company''s website
  is accurate and another isn''t (Para. 28). The Tribunal awarded Mr. Moffatt CAD
  50.88 in damages for negligent misrepresentation (the fare difference), plus 6.14
  pre-judgment interest and 25 in tribunal fees — small dollar amounts that make the
  case notable for its liability principle rather than its damages. The firm''s practical
  takeaway for enterprises: a chatbot''s misrepresentation cannot be cured merely
  by linking to the correct policy elsewhere, and organizations using third-party
  chatbot providers should contractually clarify liability allocation for chatbot
  content, training, and responses.'
---

*Suggested by [[the-ai-agent-engineers-guide-60-patterns-for-building-autonomous-systems-full-bo]] — alternate primary-adjacent legal analysis of Moffatt v. Air Canada after mccarthy.ca rate-limited*

Airline ordered to compensate a B.C. man because its chatbot provided inaccurate information - Dentons Data
Skip to content
In the British Columbia Civil Resolution Tribunal’s decision
Moffatt v. Air Canada
,
2024 BCCRT 149
, tribunal member Christopher C. Rivers (“
Member
”)  found in favour of a man who relied on fare information provided by an airline’s chatbot when he was booking a flight to attend his grandmother’s funeral.
The Member found that the airline owed a duty of care to chatbot users, and “did not take reasonable care to ensure its chatbot was accurate” and that these inaccuracies amounted to negligent misrepresentation.
Mr. Moffat was awarded $650.88 in damages for negligent misrepresentation, essentially the difference between the lower bereavement fare price and the price he had actually paid.
Background
Mr. Moffat was booking a flight to Toronto subsequent to the death of his grandmother, and had asked the chatbot about the airline’s bereavement rates – reduced fares available to a person who needs to travel due to the death of an immediate family member.
Mr. Moffat claimed that chatbot told him these fares could be claimed retroactively by completing a refund application within 90 days of the date the ticket was issued. Mr Moffat submitted a screenshot of his conversation with the chatbot as evidence supporting this claim, which said, in part, as follows:
Air Canada offers reduced
bereavement fares
if you need to travel because of an imminent death or a death in your immediate family.
…
If you need to travel immediately or have already travelled and would like to submit your ticket for a reduced bereavement rate, kindly do so within 90 days of the date your ticket was issued by completing our Ticket Refund Application form. (emphasis in original)
He submitted his request within a week of his travel, supported by a copy of his grandmother’s death certificate as required. The airline denied his request, saying that such requests could not be submitted retroactively. Mr. Moffatt’s attempts to receive a partial refund continued for another two-and-a-half months.
In February 2023, Mr. Moffatt emailed the airline and included the screenshot from the chatbot that set out the 90-day window to request a reduced rate and confirmed he had filled out the refund form and provided a death certificate.
An airline representative responded and admitted the chatbot had provided “misleading words.” The representative pointed out the chatbot’s link to the bereavement travel webpage containing the airline’s full policy stating that bereavement fares could not be claimed retroactively, and said Air Canada had noted the issue so it could update the chatbot.
However, Mr. Moffatt was still unable to get a partial refund, prompting him to file the claim with the tribunal.
Analysis
The airline argued that it could not be held liable for information provided by the chatbot, an argument emphatically rejected by the Member:
In effect, Air Canada suggests the chatbot is a separate legal entity that is responsible for its own actions. This is a remarkable submission. While a chatbot has an interactive component, it is still just a part of Air Canada’s website. It should be obvious to Air Canada that it is responsible for all the information on its website. It makes no difference whether the information comes from a static page or a chatbot
Para. 27
The airline also argued that the chatbot’s response had included a link to a section of its website that outlined the company’s policy, which said refund requests after travel had occurred were not permitted. This, claimed the airline, was the controlling information.
The Member rejected this argument as well, saying:
While Air Canada argues Mr. Moffatt could find the correct information on another part of its website, it does not explain why the webpage titled “Bereavement travel” was inherently more trustworthy than its chatbot. It also does not explain why customers should have to double-check information found in one part of its website on another part of its website.
Para. 28
The Member accepted Mr. Moffat’s claim that he had relied upon the chatbot to provide accurate information, and found this to be reasonable in the circumstances. The Member noted that “[t]here is no reason why Mr. Moffatt should know that one section of Air Canada’s webpage is accurate, and another is not.”
The compensation the tribunal awarded was the equivalent of the difference between what Moffatt paid for his flight and a discounted bereavement fare.
Mr. Moffat was awarded $650.88 in damages for negligent misrepresentation. In addition, the airline was ordered to pay $36.14 in pre-judgment interest and $125 in Tribunal fees.
Takeaways
It is clear from this decision that organizations will be held responsible for the representations made by their chatbots. Organizations should check that they have processes in place to verify (and update) the information being provided by chatbots, and ensure that such information aligns with various policies and positions. It will not be sufficient to rehabilitate a chatbot’s misrepresentation/inaccurate summary by merely by providing a link to the actual policy or document.
When chatbots are provided by third parties, both the organization and the chatbot provider should ensure contractual terms appropriately set out which party is responsible (and liable) for the chatbot’s content, training, and responses.
Share on Facebook
Share on Twitter
Share via email
Share on LinkedIn
Subscribe and stay updated
Receive our latest blog posts by email.
Stay in Touch
Artificial Intelligence
,
Chatbot
About Kirsten Thompson
Kirsten Thompson is a partner and the national lead of Dentons’ Privacy and Cybersecurity group. She has both an advisory and advocacy practice, and provides privacy, data security and data management advice to clients in a wide variety of industries.
All posts
Full bio
RELATED POSTS
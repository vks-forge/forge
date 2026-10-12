---
title: Understanding the New Codex Limit System After the April 9 Update - Codex CLI
  - OpenAI Developer Community
id: understanding-the-new-codex-limit-system-after-the-april-9-update-codex-cli-open
tags:
- ai-software-factory-architecture-58e4cc
- subscription-automation-enforcement
- codex-policy
created: '2026-10-12T09:01:36.807521Z'
updated: '2026-10-12T09:06:01.668107Z'
source: https://community.openai.com/t/understanding-the-new-codex-limit-system-after-the-april-9-update/1378768
source_domain: community.openai.com
fetched_at: '2026-10-12T09:01:36.806547Z'
fetch_provider: builtin
status: draft
type: note
tier: unknown
content_type: unknown
deprecated: false
summary: 'OpenAI Developer Community forum thread (community.openai.com, around April-May
  2026) on backlash to Codex''s new rate-limit system after an April 9, 2026 update.
  Unlike Anthropic''s harder enforcement (account bans, client-spoofing detection),
  OpenAI''s primary lever against heavy agentic/subscription usage documented here
  is throttling via tightened five-hour rate windows rather than outright suspension:
  multiple users report productivity drops of roughly 90% and 5-hour waits between
  small tasks, several explicitly stating they cancelled their ChatGPT/Codex subscriptions
  over it rather than being banned. One user frames Pro 5x as effectively a different
  tier rather than ''just another subscription tier'' given the usage-cost multiplier.
  No instances of individual-subscriber account suspension for automation volume appear
  in this thread -- the enforcement mechanism discussed is rate-limiting/quota exhaustion,
  not ban/suspension, a relevant contrast with Anthropic''s client-binding and account-suspension
  approach documented elsewhere in this batch.'
---

Understanding the New Codex Limit System After the April 9 Update - Codex CLI - OpenAI Developer Community
Understanding the New Codex Limit System After the April 9 Update
Codex
Codex CLI
codex
,
rate-limit
Mat_Tr
April 10, 2026,  5:48pm
1
After about a week of testing, I think I finally understand how the new Codex limit system works in practice.
I’m writing this post because many people are still trying to interpret the new system using the old mental model. They see that a single request consumed a surprisingly large percentage of the 5-hour limit and immediately assume something is broken.
But in practice, the new system makes much more sense if you stop thinking in terms of
message count
and start thinking in terms of
reasoning time
.
That is the key idea.
The core principle
Under the new system, the most useful practical way to understand Codex usage is this:
the longer the agent spends reasoning, the more of your 5-hour limit it consumes.
So the real question is no longer:
“How many messages do I get?”
The real question is:
“How many minutes of reasoning are included in my plan, and how much does each minute cost as a percentage of the 5-hour limit?”
Once you start looking at it that way, the behavior becomes much easier to understand.
1. A practical formula
A simple way to estimate usage is:
Cost of a request = reasoning time × percentage cost per minute
This is not an official formula, but from a practical user perspective it is the most useful way to estimate real-world Codex usage.
2. Plus plan on GPT-5.4
Based on testing, the Plus plan on the latest GPT-5.4 model appears to provide roughly:
about 40 minutes of reasoning per 5-hour limit window
That means, approximately:
40 minutes = 100%
20 minutes = 50%
1 minute = 2.5%
So on
Plus + GPT-5.4
, a good working estimate is:
1 minute of reasoning costs about 2.5% of the 5-hour limit.
3. Plus plan on GPT-5.3
In practice, GPT-5.3 appears to be more efficient than GPT-5.4.
Based on testing, a reasonable estimate is:
about 60 minutes of reasoning per 5-hour limit window
That gives us:
60 minutes = 100%
30 minutes = 50%
1 minute = about 1.66%
So on
Plus + GPT-5.3
, a practical estimate is:
1 minute of reasoning costs about 1.66% of the 5-hour limit.
This is why model choice matters so much. Even if the task feels similar, the effective drain rate can differ noticeably depending on which model you use.
4. Business plan
Now to the part that caused the most confusion.
After revisiting my earlier calculations, I think I now understand much better what went wrong in how many of us initially interpreted the Business plan.
The main issue is this: OpenAI appears to have described the difference between Business and Plus in a way that sounded much softer than the real user experience.
Many users understood the claimed
“around 60% difference”
to mean something like this:
Business should drain the limit about 60% faster than Plus.
That is the interpretation most people would naturally make, because users do not think in terms of abstract allowance math. They think in terms of what they actually feel during work:
how fast the percentage disappears.
But based on testing, that does not seem to be what OpenAI meant.
What they most likely meant was something different:
Business includes less total reasoning allowance than Plus.
That is a very different kind of statement.
To explain it simply, imagine Plus gives you
100 units
of total allowance. If Business gives
60% less
, that does
not
mean the limit drains 60% faster. It means Business gives you only
40 units instead of 100
.
So the claim is about the
size of the total budget
, not the
speed at which that budget burns
.
And that distinction matters a lot.
Because once the total budget becomes much smaller, the exact same task starts consuming a much larger percentage of that budget. That is why users may hear “60% less” and expect a moderate downgrade, while in practice the plan feels dramatically worse.
Now here is the practical version using my current estimates.
If Plus gives about:
40 minutes of GPT-5.4 reasoning per 5-hour window
and Business gives only about:
12.5 minutes
then the problem becomes much easier to see.
This means Business is not just “a little smaller.” It means the total available reasoning time is far smaller.
Put differently:
Plus gives about
40 minutes
Business gives about
12.5 minutes
so Business gives only a small fraction of the working time that Plus gives
In other words, OpenAI’s framing appears to have been about the
remaining total allowance
, while users were thinking about
how fast the limit disappears during real work
.
Those are not the same thing.
And the gap becomes even more obvious when you look at the practical drain rate.
On Plus + GPT-5.4:
1 minute ≈ 2.5%
On Business + GPT-5.4:
1 minute ≈ 8%
So in real use, Business does not just feel “around 60% worse.”
It feels dramatically more restrictive, because the limit drains:
8 / 2.5 = 3.2× faster
That means the real-world drain is about:
220% faster per minute than Plus
And that is the part many users were never clearly told.
There is also another important point here.
The issue is not only that the difference appears to have been described using a softer metric. The issue is that even within that softer framing, the real reduction now looks worse than “around 60%.”
If my current estimates are correct, then going from
40 minutes
on Plus to
12.5 minutes
on Business means the actual drop is closer to:
about 68.75% less included reasoning time than Plus
So even the softer framing may have understated the real reduction.
That is why so many Business users felt that something was broken.
It may not have been a bug at all. It may simply have been a much more severe regression in practical usability than the wording suggested.
This also helps explain why Business users kept reporting that the plan had become nearly unusable, while those complaints were easy to dismiss if someone only looked at the softer allowance framing instead of the real per-minute drain.
So if my current estimates are correct, then on
Business + GPT-5.4
the practical model is:
12.5 minutes = 100%
1 minute = about 8%
That means:
2 minutes = about 16%
4 minutes = about 32%
And once you look at it this way, the reports from Business users suddenly stop looking irrational.
They start looking completely predictable.
That is also why I think OpenAI needs to answer this more directly.
If the difference between Business and Plus was communicated in terms of included allowance, why was it not made equally clear that, in real usage, this would translate into a dramatically faster per-minute drain?
Because from a mathematical point of view, that framing may be defensible.
But from a user point of view, it was not transparent enough — and it made the regression feel far less serious on paper than it turned out to be in practice.
5. Business plan on GPT-5.3
If you switch to GPT-5.3, which appears to be more efficient, then Business gives roughly:
about 18.75 minutes of reasoning per 5-hour limit window
That means:
18.75 minutes = 100%
1 minute = about 5.33%
So on
Business + GPT-5.3
, a rough practical estimate is:
1 minute of reasoning costs about 5.33% of the 5-hour limit.
This also explains why the same task can feel noticeably cheaper on GPT-5.3 than on GPT-5.4, even on the same Business plan.
For example, a 4-minute run would roughly cost:
4 × 5.33% = about 21.3%
That is still expensive, but clearly better than GPT-5.4 on Business.
6. Important clarification: reasoning level itself is not the direct price driver
This part is very important because it is easy to misunderstand.
The reasoning level itself — low, medium, high, or very high — does
not directly
change the price of a run.
A 4-minute run costs roughly the same percentage whether the reasoning level was low or very high.
What actually changes is that higher reasoning levels often cause the model to think for longer.
So the issue is not:
“high reasoning is priced higher.”
The issue is:
higher reasoning usually leads to longer reasoning time, and longer reasoning time costs more.
That distinction matters a lot.
Many users understandably come away with the impression that higher reasoning is more expensive, when in practice the real cost increase usually comes from the extra time spent reasoning.
7. How to use this model in practice
This is the most useful takeaway from all of this.
If you want to manage your limits more intelligently, stop thinking in terms of message count and start thinking in terms of
included reasoning minutes
.
That gives you a much clearer planning model.
For example:
if you need the strongest model, use
GPT-5.4
, but expect it to burn through limits faster;
if you want more total working time,
GPT-5.3
is more economical;
if a task is likely to take several minutes of agent reasoning, you can estimate the cost before running it;
if you are on
Business
, you should expect the limit to disappear much faster than on
Plus
.
Once you think in minutes instead of messages, the new system becomes much more predictable.
8. Why users were confused
I do not think users were wrong for assuming something was broken.
The real issue is that the new system was not transparent enough, so people had no clear mental model for interpreting the new behavior.
Now we do.
The most practical way to understand the current system is:
your real cost is tied to reasoning time;
each model has a different effective cost per minute;
Business includes much less than Plus;
and once you understand the approximate percentage-per-minute rate, the system becomes far more predictable.
9. Where Pro 5X fits into this
There is also an important clarification to make about the new
Pro 5X
plan, because it helps explain the current Codex limit system even more clearly.
What matters here is not just that Pro 5X is a paid upgrade. What matters is that, in practice, it gives a much larger amount of available reasoning time relative to Plus — and under the current promotion, that increase becomes large enough that limits can almost disappear from normal workflows.
Using Plus as the baseline:
on GPT-5.4, a 5-hour limit window appears to include roughly
40 minutes of reasoning time
.
That means:
20 minutes = about 50% of the limit
40 minutes = about 100% of the limit
Now, the new
Pro 5X
subscription costs
$100
and is designed around a
5× Codex allowance relative to Plus
. But under the temporary promotion running until
May 31, 2026
, it effectively provides
10× the Plus allowance instead of 5×
.
So in practical GPT-5.4 terms, that means:
Plus ≈ 40 minutes of reasoning per 5-hour window
Pro 5X during the promotion ≈ 400 minutes of reasoning per 5-hour window
That is roughly:
6.7 hours of reasoning time inside a single 5-hour limit window
From a practical point of view, that is enormous.
For many real work scenarios, this can already be treated as effectively removing the limit problem altogether — especially for users working in
Fast
mode.
This is also why Pro 5X is such an interesting option: compared to the older and more expensive
Pro 20× for $200
, the new
$100 Pro 5X
plan may actually feel more efficient or more attractive in practice, because under the current promotion it behaves like a
10× plan
, while costing much less.
In other words, for
$100
, users can temporarily get a level of Codex access that is large enough to stop thinking about limits in everyday work and simply use the system at full speed.
That is why Pro 5X should not be viewed as just “another subscription tier.”
Under the current promo, it is much closer to:
a practical way to get rid of limit anxiety and work at maximum pace without constantly watching your percentage.
So if Plus is the baseline for understanding reasoning cost, and Business is the plan where the drain feels noticeably aggressive, then
Pro 5X — especially during the 10× promotion — is the tier where limits begin to feel almost irrelevant for serious daily use.
10. Final conclusion
So the practical conclusion is simple:
Plus
gives a useful baseline for estimating reasoning cost in terms of time;
Business
provides a much smaller allowance, which is why the drain feels aggressive;
Pro
provides such a large allowance relative to Plus that, for many users, it may feel close to unrestricted.
If your goal is simply to understand the formula, then think in
reasoning minutes
.
If your goal is to stop constantly worrying about limits, then
Pro
appears to be the most comfortable option.
That is the whole point of this post.
Important note
Everything above is based on
practical testing and approximation
, not on official OpenAI documentation. The numbers should be treated as a
working user model
, not as exact published plan specifications.
But as a practical framework for understanding how the system behaves after the April 9 change, this model seems to explain user reports surprisingly well.
windysoliloquy
April 10, 2026,  6:40pm
2
Hi Mat,
I just stopped by to give you a super helpful tip so people treat you with the respect you deserve.
Many of us here have been reading Ai posts for years, it seems like they want us to use the ‘hide details’ button for long AI-generated posts.  Sometimes the button is hidden, so I made this little dropdown for you so you can find it easily.
I hope it helps your journey here on the community forums!
CLICK ME
Sometimes, depending on your browser resolution, the place where the tidy little box tool is found is hidden by an  > sign on the right side of your post/reply window.
image
821×161 11.5 KB
See how my next image has a ‘button’ or a ‘plus sign’ now?
When you click the button, it opens up all the cool discourse features.
image
441×327 12 KB
Hide details is the one that you want to use when you post AI-created materials.
People here on the forum tend to respond and treat you nicer if you don’t present walls of Ai spam as your presentation, and if you have to… because maybe you’re like me and have a hard time translating your thoughts into text, you post it in the hide details.
The part that is highlighted in this image is what you replace with a title.
The part that isn’t highlighted is where you replace the words with super-long text.
image
755×134 4.72 KB
Mat_Tr
April 11, 2026,  9:23am
3
I’ve updated
section 4
of the post.
The new version explains much more clearly what I believe was the key OpenAI framing trick behind the Business-plan change.
The problem is not just that Business got dramatically worse in practice. The bigger problem is that this regression appears to have been described in a much softer way than users actually experience it.
Instead of making it obvious that Business now burns through limits dramatically faster, the difference seems to have been framed in terms of a softer reduction in “included allowance,” which makes the change sound far less severe on paper than it feels in real use.
That is why so many Business users thought this had to be a bug.
But at this point, I no longer think it is a bug.
I think this is the answer to all the complaints from Business subscribers: this appears to be the new intended policy for Business accounts specifically.
In other words, the Business plan was not “broken” by accident — it appears to have been fundamentally downgraded, and the wording around it was simply soft enough that many users did not immediately realize the full scale of that regression.
That is exactly why I rewrote section 4: to make that point much clearer.
shasixz
April 14, 2026,  4:33am
4
A single basic prompt recently cost me about
22 credits
, which works out to roughly
$0.88
. That is an astonishing amount for a small task, and it is the clearest possible example of why the current Codex usage model feels deeply disproportionate.
I want to express this as clearly and fairly as possible: the current Codex usage and credit drain feels economically unreasonable and, in practical terms, unsustainable for normal development work.
This is no longer just a minor inconvenience or a matter of “using it more carefully.” What is deeply frustrating is the gap between the actual size of the work being done and the amount of quota or credits being consumed. Small, routine prompts can burn through usage at a rate that feels completely disconnected from what a reasonable user would expect.
The real problem is not only the cost itself. It is the unpredictability. I cannot reliably estimate whether a simple prompt will cost almost nothing or drain a meaningful portion of my available usage. That makes the tool very difficult to trust in real working conditions.
When a developer starts a session and sees a 5-hour allowance collapse in minutes, or watches a very small local task consume nearly a dollar, it stops feeling like a productivity tool and starts feeling economically unworkable. That is where the frustration comes from.
I am not asking for unlimited free usage. I am asking for something much more basic: transparency, proportionality, and a system that feels economically reasonable for ordinary use.
Right now, the experience feels far too aggressive. If this behavior is expected, then it deserves a much clearer explanation. If it is not expected, then it needs urgent review, because in its current form it is seriously undermining trust and making sustained use of Codex difficult to justify.
We are being very pleasant here, but my real feelings are nothing short of despicable.
red990
April 17, 2026,  3:47am
5
Thank you for posting this.
There’s something I don’t understand
your data shows that business gets less Codex quota, but the limits page shows taht both Plus and Business have identical Local Messages usage limits.
Bager
April 19, 2026,  4:35pm
6
This update completely ruined Codex for me.
I canceled my subscription because the new limit system is not a minor inconvenience — it actively destroys development flow. Compared to the previous system, my productivity dropped by around 90%. A coding tool that burns through usage this fast and interrupts normal iterative work is simply not usable.
The old system was far from perfect, but it was at least workable. This new one is a massive downgrade. It punishes real usage, slows down serious development, and makes the product feel unreliable.
At this point, Copilot is clearly more efficient for my workflow. If people still want to use GPT-5.4 productively, I would honestly recommend using it through Copilot instead. Right now, Codex is no longer worth paying for.
This update did not improve the experience. It made me quit.
BaseN
April 19, 2026,  5:54pm
7
This is also completely unusable for me. I am cancelling subscriptions as well. Waiting 5 hours every 3-4 small but complex due to the nature of my work, tasks, is completely unmanageable. And I’m certainly not going to support this by throwing more than 5x the cost at it to achieve the previously working workflow (which was tight to begin with).
windysoliloquy
April 20, 2026, 12:13am
8
Yeah, if you did all your complex stuff in chatgpt then gave structured prompts written by chatgpt, instead of spending all your tokens on reasoning in codex rather than just coding…
I feel like you’d be a lot happier…
This practice has been mentioned many times.
windysoliloquy
April 20, 2026,  2:10am
10
Being honest and speaking clearly isn’t trolling.
Welcome to the developer’s community, this is for adults who communicate effectively.
Bager
April 20, 2026,  7:20am
11
So your defense of Codex is basically: do the important thinking somewhere else, then come back and use Codex only for the cheap part.
That does not refute my criticism. It reinforces it.
If a coding product becomes “good” only after users learn how to route around its limits with another product, then the product experience is obviously broken. Real development is not neatly split into “thinking over here” and “coding over there.” It is iterative by nature. A limit model that punishes that is the issue.
windysoliloquy
April 20, 2026, 12:33pm
12
You should have already been doing this to get the most out of the promo plan, too - imho
The coding project becomes good when you stop being vague.
I showed you how you can learn to do that.
At your own pace.
The major thing I see most people missing, is that there are millions of people accessing the same computer infrastructure.
It’s not fair that we haplessly use it even when it’s at a reduced price.
It feels personal to you when you use it, but all 3 million of us are accessing that device at the same times, throughout the day.
That’s why the reasoning within codex cost so much more than the reasoning withing ChatGPT.
Use the cheaper reasoning that is built to withstand much higher usage and try to understand that it’s not best for the coding model to be muddled with that…  Is the best I can try to explain my postion…
That I’m not defending.
It defends itself.
Have a good day!  ^.^
fborgosano
April 20, 2026,  1:02pm
13
Congrats to OpenAI, with this rate limits, Codex made a giant step towards Gemini’s level of uselesness. Until few weeks ago I never thought it could have ever happened
Really, this way is impossible to work, it’s frustrating, I’ll have to reconsider my subscription because at this point, using Deepseek v3.2 reasoner with Opencode in wsl looks like a really interesting alternative.
fborgosano
April 20, 2026,  1:07pm
14
Please OpenAI, let your subscribers know before the next renewal if you’re considering to restore the previous rate limit or if this is gonna be the new “normality”.
windysoliloquy
April 20, 2026,  1:20pm
15
It was a known promo duration.  Everyone knew when the free time was going to be over.
The majority of your token costs are spent in codex ‘thinking’ or ‘reasoning’.
Reasoning is still the same price it’s always been with the regular ChatGPT.
Do your reasoning and planning in ChatGPT, and have it give you the prompts to make what you want to happen in Codex after your extensive exploration or short descriptions of what you need to happen in code.
They didn’t pull the rug out from anyone, it’s been known from day one of the prompt when the rates would expire at the end of the promotional period.
fborgosano
April 20, 2026,  2:01pm
16
I saw that it was kinda promo but I didn’t expect I’d have been castrated this way at the end of it. I thought that I was driving a Lambo and at the end of the promo I’d have had something like a BMW M3, not a goddamn supercharged Fiat Panda.
The way you suggest to operate it’s too slow and cumbersome. I use reasoning (medium for the most of the time) because Codex in the local machine has direct access to the apps files, can read them and find fixes and solutions. ChatGPT can read them from the GitHub repo but it struggles with the big files and furthermore, I should do a commit and push at every single edit to make ChatGPT analyze the apps files. I created GitGPT (a private custom GPT) that makes it slightly better but still uncomfortable.
The other option is to every time upload the modified file(s) to ChatGPT (right click, Reveal in File explorer, drag and drop into ChatGPT, write the prompt, wait for the reasoning, copy the answer, paste into Codex.. hundreds times a day… with ChatGPT chats that get slower and slower when they get too long, so you have to start another one). This is crazy, it’s just a huge loss of time and energies.
So is this not gonna change?
If so, my subscription lasts until May 10th, if I know by now, I have time to organize the transition.
I’m sad to do it but the same amount I spend on ChatGPT at this point is much more worth in Deepseek.
Maybe I’ll wait until about May 8th to see if the huge amount of complaints they got about this rate limits system will make them make some significant step back on it and so a significant step towards their customers, otherwise I’ll cancel my subscription. Thanks anyway for your answer.
windysoliloquy
April 20, 2026,  2:07pm
17
Yeah, I get that you’re upset.
I won’t stop you from vulgar complaints if that’s what you want to post, but you have options"
Learn to use the space surgically like many have.
Pay for the actual cost of computing for using a cutting-edge frontier model coding AI.
Continue to leave vulgarity-laden complaints on the dev forum
It’s my understanding that only two of those options will help you reach the goal you’re wanting to achieve.
fborgosano
April 20, 2026,  2:08pm
18
Sorry, where have I been vulgar?
windysoliloquy
April 20, 2026,  2:12pm
19
Well, you started with the GD, and you’re not liking my attempt at pointing you to how to use this app more surgically, so I was positioning myself for a quick exit if it expanded into more explicates.
fborgosano
April 20, 2026,  2:24pm
20
I’m not sure if I’m talking to a human ora a bot… However, if for GD you mean “goddamn”, I didn’t know it was vulgar. I don’t know if it’s a coincidence but my ChatGPT account is not working anymore… my gpts and the chronology disappeared
windysoliloquy
April 20, 2026,  2:26pm
21
So the core concept of your message has been addressed.
You’ve been advised on what you can do to make the codex usage last longer.
Have a good day.
next page →
Related topics
Topic
Replies
Views
Activity
Codex limits spark frustration among subscribers
Codex
rate-limit
225
14843
September 10, 2026
Pro plan: hit 5-hour limit twice (in 2h and 1.5h) and nearly exhausted weekly cap in 1 day after today’s update
Codex CLI
codex-cloud
71
11166
November 14, 2025
Confused about Codex limit usage after GPT-5.6 release (Plus plan)
Codex
7
5035
August 18, 2026
$200 Pro exhausted in 2 days — these limits are unviable for higher tiers
Codex
bug
35
4944
August 21, 2026
ChatGPT Plus and Usage Limits
ChatGPT
gpt-4
137
511086
August 2, 2025
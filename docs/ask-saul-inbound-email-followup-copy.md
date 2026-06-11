# Ask Saul inbound provider-phone-agent email follow-up

Purpose: convert high-intent inbound callers after Saul captures them in GHL. Copy must feel like the product itself: fast, contextual, human, and useful.

Sender target:

- From name: Saul from AskSaul.ai
- From email: saul3000bot@gmail.com
- Reply expectation: invite a simple text to the SendBlue number, plus normal email replies.
- SendBlue number: (720) 292-7554

## Trigger logic

Use this only for Ask Saul provider phone agent leads.

Recommended include conditions:

- GHL location: AskSaul.ai
- source equals `Saul provider phone agent`
- tag includes `ask-saul`
- tag includes `phone-agent-prospect`
- lead is interested, warm, hot, or requested follow-up
- email exists

Recommended suppressions:

- DND or unsubscribed
- tag `unqualified`
- tag `opted-out`
- tag `wrong-number`
- no email

## Email 1A: inbound lead captured, not yet confirmed booked

Subject options:

- Good talking with Saul
- Saul passed this over
- Quick follow-up from AskSaul.ai

Body:

```text
Hey {{contact.first_name}},

Thanks for taking a minute with Saul. I wanted to send this while the conversation is fresh, because the exact situation you described for {{contact.company_name | default: "your business"}} is what AskSaul.ai is built around.

What Saul captured:
- Business: {{contact.company_name}}
- Service type: {{custom.Business Type / Service}}
- Market: {{custom.Service Area / City}}
- Current call handling: {{custom.Current Call Handling}}
- Pain point: {{custom.Phone Agent Pain Point}}
- Fit summary: {{custom.Ask Saul Qualification Summary}}

The goal is not to bolt on a generic bot. The goal is to build a phone agent that understands your business, answers consistently, captures the details that matter, and gets the right next step to the right person before the lead goes cold.

If texting is easier, text us at (720) 292-7554. A quick text like "call me" or "send details" is enough and we will help from there.

If Saul already grabbed a preferred callback window from you, you are good. Gregory will have the context before he reaches out.

Always here to help,
Saul
AskSaul.ai
```

Notes:

- This deliberately does not say "book a call" because Saul may have already collected a callback window or booked a follow-up.
- It makes the system itself impressive by showing that context was captured and preserved.

## Email 1B: follow-up booked or callback window captured

Subject options:

- You are set, Gregory has the context from Saul
- Gregory has your Saul context
- Your AskSaul.ai follow-up is set

Body:

```text
Hey {{contact.first_name}},

You are set. Saul passed the context over to Gregory and your follow-up is scheduled for {{appointment.start_time | default: "the time window you shared"}}.

What Gregory will already have in front of him:
- Business: {{contact.company_name}}
- Service type: {{custom.Business Type / Service}}
- Market: {{custom.Service Area / City}}
- Current call handling: {{custom.Current Call Handling}}
- Pain point: {{custom.Phone Agent Pain Point}}
- Open question: {{custom.Outstanding Questions}}

That is the bigger idea behind AskSaul.ai: the agent should not just answer the phone. It should capture intent, qualify the moment, preserve context, and make the next human handoff feel seamless.

If anything changes before the call, text us at (720) 292-7554. A quick text is fine. We are always here to help.

Talk soon,
Saul
AskSaul.ai
```

## Email 2: no response after first email, no confirmed appointment

Delay: 4 to 6 business hours or next morning if the call came in late.

Subject options:

- Want me to have Gregory text you?
- Should we send the setup notes here?
- Quick question on your phone calls

Body:

```text
Hey {{contact.first_name}},

Quick follow-up from Saul.

The reason I am reaching back out is that phone-agent fit is usually clearest right after a real call. If your business is missing calls, sending people to voicemail, juggling after-hours requests, or manually repeating the same qualification questions, this is exactly where AskSaul.ai can help.

No pressure to schedule anything formal. If you want a quick answer, text us at (720) 292-7554 with one line about what you want the agent to handle.

Examples:
- after-hours calls
- quote requests
- scheduling
- emergency calls
- missed lead follow-up
- GHL or CRM handoff

We can point you in the right direction from there.

Saul
AskSaul.ai
```

## Email 3: trust and proof-of-process follow-up

Delay: 1 to 2 days if no reply and no appointment.

Subject options:

- What Saul would handle first
- Where a phone agent usually pays for itself
- A practical way to start

Body:

```text
Hey {{contact.first_name}},

One practical way to think about AskSaul.ai is this:

You do not need an agent to do everything on day one. You need it to handle the calls where speed, consistency, and clean follow-up matter most.

For most service businesses, that usually means:
- answering when the owner or front desk cannot
- collecting the job type, location, urgency, and contact details
- routing hot leads quickly
- logging the conversation so nobody starts from zero
- handing off to GHL, text, email, or a real person with context

That is the workflow Gregory can map with you. If you want the fastest path, text (720) 292-7554 and say what you want Saul to handle first.

Always here to help,
Saul
AskSaul.ai
```

## Internal alert copy

```text
Hot Ask Saul inbound lead captured.

Name: {{contact.name}}
Business: {{contact.company_name}}
Phone: {{contact.phone}}
Email: {{contact.email}}
Interest: {{custom.Ask Saul Interest Level}}
Source: Saul provider phone agent
Current call handling: {{custom.Current Call Handling}}
Pain/task: {{custom.Phone Agent Pain Point}}
Preferred callback: {{custom.Preferred Callback Window}}
GHL contact: {{contact.url}}

Recommended action: review context, then call or text while intent is fresh.
```

## Helpful additions

1. Add a clear tag after first email sends, such as `ask-saul-email-1-sent`, to prevent duplicate first touches.
2. Add a tag when a callback is booked, such as `appointment-booked`, and make all non-booked nurture branches exclude it.
3. Make Saul collect one clean business pain point on every interested call. That pain point is the strongest personalization field in the email.
4. Add reply monitoring. A reply should create a Gregory task and move the opportunity to Replied or Hot Lead.
5. Keep SMS optional unless consent is clear. Email can mention the SendBlue number and invite the lead to text us.

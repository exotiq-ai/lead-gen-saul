# Ask Saul GHL Text-to-Booking Flow

This is the production flow for moving a local service provider from cold text reply to a booked Gregory intro call in the Ask Saul GHL location.

**Current transport rule:** Sendblue is the SMS/iMessage rail. GHL is the CRM mirror and booking/follow-up system only. Do not publish or rely on a GHL workflow that sends SMS unless Gregory explicitly decides to abandon Sendblue/iMessage for this campaign.

## Location and calendar

- GHL location: `RxCVQeGoQ3RTJbbLG5gY`
- Calendar group: `Service Provider Leads`
- Calendar: `Gregory - Ask Saul Phone Agent Intro`
- Duration: 15 minutes
- Time zone: America/Denver
- Booking link: `https://api.leadconnectorhq.com/widget/bookings/bookwithusdigitalmarketing-3d837e4b-c899-44ff-b612-275f498c2128`

## Contact fields

The setup script creates/keeps these contact fields:

- Ask Saul Interest Level
- Business Type / Service
- Service Area / City
- Current Call Handling
- Phone Agent Pain Point
- Desired Agent Tasks
- Preferred Callback Window
- Saul Demo Offered
- Saul Demo Called
- Callback Booking Source
- Gregory Follow-Up Consent
- Ask Saul Qualification Summary

Existing local-services fields also remain in use:

- Local Services Vertical
- Lead Project
- Demo Phone Agent Number
- Pay Per Close Terms
- AI Phone Agent Offer
- Sendblue Eligibility
- Last Sendblue Status
- A2P/TCPA Notes

## Pipeline mapping

The current API token can read GHL pipelines but cannot create a new pipeline. Until a higher-scope token is added, map stages into the existing `Marketing Pipeline`:

- New Prospect -> New Lead
- Confirmed Active -> New Lead with tag `confirmed-active`
- Interested -> Hot Lead
- Text Qualifying -> Hot Lead with tag `text-qualifying`
- Appointment Offered -> Hot Lead with tag `appointment-offered`
- Appointment Booked -> New Booking
- No Show -> keep New Booking with tag `no-show`
- Won -> Sale
- Not Fit -> tag `not-fit`
- Opted Out -> tag `opted-out`, stop all workflows

If a token with opportunities write scope is added later, create a dedicated `Ask Saul Phone Agent Pipeline` with these stages:

1. New Prospect
2. Confirmed Active
3. Interested
4. Text Qualifying
5. Appointment Offered
6. Appointment Booked
7. No Show
8. Won
9. Not Fit
10. Opted Out

## Workflow: customer reply to booked appointment

Prefer implementing this sequence in the Saul dashboard/Sendblue webhook handlers. If mirrored into GHL, actions should update fields/tags/notes and create tasks; SMS sends should stay in Sendblue.

Build/publish this workflow in the Ask Saul GHL UI. The API currently reports workflows as readable but does not expose safe workflow creation/editing with the current token.

### Trigger

- Customer replied
- Contact has tag or field indicating Ask Saul/local-services lead:
  - `ask-saul`, `local-services`, `phone-agent-prospect`, or `Lead Project = ask_saul_phone_agents`
- Exclude if:
  - DND/opt-out is true
  - `Outreach Hold Reason` is populated
  - `Lead Project = safetostay_ai`

### Interested keyword branch

Treat these as interested:

- yes
- yeah
- sure
- interested
- tell me more
- how does it work
- call me
- send info
- what is the cost
- can it work with GHL
- do you integrate with GHL

Actions:

1. Set `Ask Saul Interest Level = warm`.
2. Add tag `interested`.
3. Move/update opportunity to `Hot Lead` or `Interested` equivalent.
4. Send qualification question 1.

### Copy sequence

#### First-touch sent by outreach system

```text
Hey, quick question — are you still taking {{custom_values.service_type}} jobs in {{contact.city}}?

Gregory
```

#### If they say yes / ask why

```text
Awesome. I set up 24/7 phone agents for local {{custom_values.service_type}} companies so missed calls still turn into leads.

Free setup, no contract, and you only pay $50 if you close a job from one of those calls.

Want to hear how it works?
```

Set:

- `Confirmed Active = yes` via tag `confirmed-active`
- `Pay Per Close Terms = Free setup, no contract, $50 only if job closes from one of those calls`

#### If they are interested

```text
Great. Two easy options.

I can ask a couple quick questions here and set up a callback, or you can call Saul directly and hear the agent live: (970) 401-7285.

He’ll ask about your business and get a time window over to Gregory.
```

Set:

- `Saul Demo Offered = yes_text`
- `Demo Phone Agent Number = (970) 401-7285`

#### Text qualification question 1

```text
Perfect. What kind of calls would you want the agent to handle — new leads, after-hours, quotes, scheduling, emergencies, or something else?
```

Save reply to:

- `Desired Agent Tasks`
- `Phone Agent Pain Point`, if a pain is obvious

#### Text qualification question 2

```text
Got it. How are calls handled right now — owner cell, front desk, voicemail, GHL, or something else?
```

Save reply to:

- `Current Call Handling`

#### Booking offer

```text
That’s exactly the kind of use case Gregory can set up around.

Grab a 15-minute phone slot here and he’ll call you with the context already in front of him:
https://api.leadconnectorhq.com/widget/bookings/bookwithusdigitalmarketing-3d837e4b-c899-44ff-b612-275f498c2128
```

Set:

- `Callback Booking Source = text_calendar_link`
- tag `appointment-offered`
- opportunity stage `Appointment Offered` mapping

#### If they prefer not to use the link

```text
No problem. What’s a good window for Gregory to call you and walk through the setup?
```

Save reply to:

- `Preferred Callback Window`
- `Callback Booking Source = text_manual_window`
- tag `needs-manual-scheduling`

Then send:

```text
Perfect, I’ll get that over to him. He’ll have the context before he calls.
```

### Appointment booked trigger

Trigger:

- Appointment created on calendar `Gregory - Ask Saul Phone Agent Intro`

Actions:

1. Move opportunity to `New Booking` / `Appointment Booked`.
2. Add tag `appointment-booked`.
3. Set `Callback Booking Source = ghl_calendar` if blank.
4. Add internal note:

```text
Ask Saul intro booked.
Business/service: {{contact.custom_fields.business_type__service}}
Service area: {{contact.custom_fields.service_area__city}}
Current call handling: {{contact.custom_fields.current_call_handling}}
Pain/task request: {{contact.custom_fields.desired_agent_tasks}}
Preferred window/context: {{contact.custom_fields.preferred_callback_window}}
Saul demo offered/called: {{contact.custom_fields.saul_demo_offered}} / {{contact.custom_fields.saul_demo_called}}
```

5. Notify Gregory.
6. Send confirmation SMS:

```text
You’re booked. Gregory will call you at that time and already have the phone-agent context.

If you want to hear Saul before then, call (970) 401-7285.
```

### No-book follow-up

Wait 1 day after `appointment-offered` if no appointment exists, then send:

```text
Just making sure this didn’t get buried — want me to have Gregory call tomorrow instead?
```

If yes, collect preferred window and tag `needs-manual-scheduling`.

### Opt-out handling

If reply includes stop/unsubscribe/remove/wrong number:

1. Set DND where possible.
2. Add tag `opted-out` or `wrong-number`.
3. Stop this workflow.
4. Do not continue qualification or booking texts.

## QA checklist

1. Custom fields exist in Ask Saul location.
2. Booking page opens and shows `Gregory - Ask Saul Phone Agent Intro`.
3. Page shows 15-minute slots in America/Denver.
4. First interested reply moves/marks the contact as interested.
5. Two qualification replies are saved into fields.
6. Booking link is sent.
7. Appointment-booked trigger moves the opportunity and notifies Gregory.
8. Opt-out reply stops the workflow.

## Setup script

Run:

```bash
python3 scripts/ghl_setup_ask_saul_booking.py
```

Dry run:

```bash
python3 scripts/ghl_setup_ask_saul_booking.py --dry-run
```

The script writes backups/logs under `/Users/gbot/.hermes/work/hermes-review/`.

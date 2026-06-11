import type { Env, FollowupInput, LeadCaptureInput } from './types.ts';
import { syncLeadToGhl, addFollowupNote, bookGregoryAppointment, ensureOpportunity } from './ghl.ts';
import { logAppointment, logFollowup, logLeadActivity, upsertLead, type LeadRecordResult, type SupabaseCfg } from './supabase.ts';
import { notifyGregory, notifyLeadCaptured, notifyDemoCompleted } from './notify.ts';
import { sendAppointmentConfirmation } from './sendblue.ts';
import { sendInboundLeadEmailFollowup } from './emailFollowup.ts';
import { type CallMode, type CallState, type DemoFacts, demoOpeningLine, debriefOpeningLine, readCallState, writeCallState } from './modes.ts';

export interface ToolSchemaDef {
  name: string;
  description: string;
  input_schema: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
}

export interface ToolExecutionResult {
  content: string;
  state?: CallState;
}

const qualifySchema: ToolSchemaDef = {
  name: 'qualify_and_log_lead',
  description: 'Qualify and log the service-provider lead after collecting phone plus name or business. Use for every legitimate business caller.',
  input_schema: {
    type: 'object',
    properties: leadProperties(),
    required: ['caller_phone', 'interested'],
  },
};

const bookFollowupSchema: ToolSchemaDef = {
  name: 'book_gregory_followup',
  description: 'Log a Gregory follow-up request after the caller gives consent and a preferred time window. Use for interested, warm, hot, or custom-solution callers.',
  input_schema: {
    type: 'object',
    properties: {
      ...leadProperties(),
      consent_confirmed: { type: 'boolean', description: 'True only if caller verbally agreed to a follow-up.' },
      preferred_time_window: { type: 'string', description: 'Caller preferred callback window, e.g. tomorrow afternoon.' },
      requested_start_time_iso: { type: 'string', description: 'If the caller asks for a specific bookable time, provide the exact ISO-8601 start time with timezone offset. Only use Monday-Friday 9am-3pm America/Denver. Example: 2026-06-09T14:00:00-06:00.' },
      outstanding_questions: { type: 'string' },
      custom_solution_needs: { type: 'string' },
    },
    required: ['caller_phone', 'interested', 'consent_confirmed', 'preferred_time_window'],
  },
};

const capabilitySchema: ToolSchemaDef = {
  name: 'answer_capability_question',
  description: 'Return grounded capability guidance for common questions about phone agents. Use when caller asks what Saul can do, integrations, setup, or pricing boundaries.',
  input_schema: {
    type: 'object',
    properties: {
      topic: { type: 'string', description: 'The capability topic or caller question.' },
    },
    required: ['topic'],
  },
};

const startDemoSchema: ToolSchemaDef = {
  name: 'start_demo_roleplay',
  description: 'Switch the call into live demo mode: you become the phone agent for the caller\'s own business while they play a customer. Call ONLY after the caller has explicitly confirmed they are ready for the demo. Pass everything learned in discovery so the demo is grounded in their business.',
  input_schema: {
    type: 'object',
    properties: {
      ...leadProperties(),
      services: { type: 'string', description: 'Services the business offers, e.g. AC repair, garage door installs.' },
      customer_scenario: { type: 'string', description: 'One-line customer scenario aimed at their stated pain point, e.g. homeowner calling at 9pm with a dead furnace.' },
    },
    required: ['business_type'],
  },
};

const endDemoSchema: ToolSchemaDef = {
  name: 'end_demo_roleplay',
  description: 'End the live demo role-play and switch back to Saul to debrief and close. Call after the scene wraps naturally, or immediately if the caller breaks character, asks to stop, or the scene derails.',
  input_schema: {
    type: 'object',
    properties: {
      demo_outcome: { type: 'string', enum: ['completed', 'caller_exited', 'derailed'], description: 'How the demo ended.' },
    },
    required: ['demo_outcome'],
  },
};

export const toolSchemas: ToolSchemaDef[] = [qualifySchema, bookFollowupSchema, capabilitySchema, startDemoSchema, endDemoSchema];

const MODE_TOOLS: Record<CallMode, ToolSchemaDef[]> = {
  discovery: [qualifySchema, bookFollowupSchema, capabilitySchema, startDemoSchema],
  demo: [endDemoSchema],
  debrief: [qualifySchema, bookFollowupSchema, capabilitySchema],
};

export function toolsForMode(mode: CallMode): ToolSchemaDef[] {
  return MODE_TOOLS[mode];
}

export function isDryRun(env: Env): boolean {
  return env.SAUL_DRY_RUN === 'true';
}

export async function executeTool(name: string, input: Record<string, unknown>, env: Env, opts: { callId?: string } = {}): Promise<ToolExecutionResult> {
  const tenantId = env.DEFAULT_TENANT_ID ?? '22222222-2222-2222-2222-222222222222';
  const supabase: SupabaseCfg = {
    url: env.SUPABASE_URL,
    serviceKey: env.SUPABASE_SERVICE_ROLE_KEY,
    tenantId,
    sourceTag: env.SAUL_SOURCE_TAG,
  };
  const ghl = {
    apiKey: env.GHL_LOCAL_SERVICES_API_KEY,
    locationId: env.GHL_LOCAL_SERVICES_LOCATION_ID,
    version: env.GHL_API_VERSION,
    calendarId: env.GHL_ASK_SAUL_CALENDAR_ID,
    pipelineId: env.GHL_ASK_SAUL_PIPELINE_ID,
    hotLeadStageId: env.GHL_ASK_SAUL_HOT_LEAD_STAGE_ID,
    bookedStageId: env.GHL_ASK_SAUL_BOOKED_STAGE_ID,
  };
  const dryRun = isDryRun(env);

  switch (name) {
    case 'qualify_and_log_lead': {
      const lead = coerceLead(input);
      const db = await safeUpsertLead(lead, supabase, env);
      if (!db.ok) return { content: `I could not save the lead cleanly: ${db.error}. Keep talking and repeat the details back before ending.` };
      let ghlSuffix = '';
      if (!dryRun) {
        const ghlResult = await syncLeadToGhl(lead, ghl);
        if (ghlResult.ok && ghlResult.contactId) {
          await ensureOpportunity(lead, ghlResult.contactId, ghl, 'hot_lead');
          await sendInboundLeadEmailFollowup({ input: lead, contactId: ghlResult.contactId, cfg: ghl, env, reason: 'lead_logged', existingTags: ghlResult.tags });
        }
        if (db.id) await notifyLeadCaptured(lead, db.id, env);
        ghlSuffix = ghlResult.ok ? '' : ` GHL sync needs review: ${ghlResult.error}.`;
      }
      return { content: `Lead logged. Qualification score is ${lead.interest_level ?? (lead.interested ? 'warm' : 'cold')}. Keep the caller engaged and ask about a Gregory follow-up if they are interested.${ghlSuffix}` };
    }
    case 'book_gregory_followup': {
      const followup = coerceFollowup(input);
      const db = await safeUpsertLead(followup, supabase, env);
      if (!db.ok || !db.id) return { content: `I could not save the lead cleanly: ${db.error}. Ask for the best phone and preferred window again.` };
      if (dryRun) {
        return { content: `Dry run: follow-up request recorded for ${followup.preferred_time_window}. Tell the caller the preferred window is saved for Gregory; do not claim a confirmed appointment.` };
      }
      const follow = await logFollowup(followup, db.id, supabase);
      if (!follow.ok) return { content: `I could not book the follow-up request: ${follow.error}. Ask for verbal consent and preferred window.` };
      const ghlLead = await syncLeadToGhl(followup, ghl);
      const appointment = await bookGregoryAppointment(followup, ghlLead.contactId, ghl);
      await ensureOpportunity(followup, ghlLead.contactId, ghl, appointment.ok && appointment.startTime ? 'booked' : 'hot_lead');
      await addFollowupNote(followup, ghlLead.contactId, ghl, appointment);
      await sendInboundLeadEmailFollowup({ input: followup, contactId: ghlLead.contactId, cfg: ghl, env, appointment, reason: 'followup_booked', existingTags: ghlLead.tags });
      if (appointment.ok && !appointment.skipped && appointment.appointmentId) {
        await logAppointment(followup, db.id, appointment, supabase);
        await sendAppointmentConfirmation(followup, appointment.confirmationText, env);
      }
      await notifyGregory(followup, db.id, env);
      if (appointment.ok && appointment.startTime) {
        return { content: `GHL appointment booked for Gregory at ${appointment.startTime}. Tell the caller they are booked, Gregory will call them at that time, and they should receive the calendar confirmation if their email is on file.` };
      }
      const bookingIssue = appointment.ok ? 'calendar booking was skipped because GHL is not fully configured' : appointment.error;
      return { content: `Follow-up request logged for Gregory, but the calendar appointment was not created: ${bookingIssue}. Tell the caller Gregory has the context and the preferred window is saved; do not claim a confirmed appointment.` };
    }
    case 'answer_capability_question':
      return { content: capabilityAnswer(String(input.topic ?? '')) };
    case 'start_demo_roleplay': {
      const facts = coerceDemoFacts(input);
      // Peak-engagement insurance: log the lead BEFORE the demo so a mid-demo
      // hangup still leaves a qualified lead in the pipeline.
      if (str(input.caller_phone)) {
        const lead = coerceLead({ ...input, interested: true });
        if (!lead.interest_level || lead.interest_level === 'cold' || lead.interest_level === 'curious') {
          lead.interest_level = 'warm';
        }
        const db = await safeUpsertLead(lead, supabase, env);
        if (db.ok && db.id) {
          facts.lead_id = db.id;
          if (!dryRun) {
            const ghlResult = await syncLeadToGhl(lead, ghl);
            if (ghlResult.ok && ghlResult.contactId) await ensureOpportunity(lead, ghlResult.contactId, ghl, 'hot_lead');
          }
          await logLeadActivity(db.id, 'demo_started', 'phone', { customer_scenario: facts.customer_scenario, business_type: facts.business_type }, supabase);
        }
      }
      const state: CallState = { mode: 'demo', facts };
      await writeCallState(env, opts.callId, state);
      return {
        content: `Demo mode is live. You are now the phone agent for ${facts.business_name ?? 'their business'}. Your entire next reply must be exactly this line and nothing else: "${demoOpeningLine(facts)}"`,
        state,
      };
    }
    case 'end_demo_roleplay': {
      const outcome = str(input.demo_outcome) ?? 'completed';
      const prior = await readCallState(env, opts.callId);
      const facts = prior?.facts;
      const state: CallState = { mode: 'debrief', facts };
      await writeCallState(env, opts.callId, state);
      if (facts?.lead_id) {
        await logLeadActivity(facts.lead_id, 'demo_completed', 'phone', { outcome }, supabase);
      }
      if (outcome === 'completed' && !dryRun) await notifyDemoCompleted(facts, env);
      return {
        content: `The demo is over and you are Saul again. Your entire next reply must be exactly this line and nothing else: "${debriefOpeningLine()}" After they answer, run the debrief and close.`,
        state,
      };
    }
    default:
      return { content: `Unknown tool: ${name}` };
  }
}

async function safeUpsertLead(lead: LeadCaptureInput, supabase: SupabaseCfg, env: Env): Promise<LeadRecordResult> {
  if (isDryRun(env) && (!supabase.url || !supabase.serviceKey)) {
    return { ok: true, id: 'dry-run-lead', created: true };
  }
  return upsertLead(lead, supabase);
}

function leadProperties(): Record<string, unknown> {
  return {
    caller_name: { type: 'string' },
    caller_first_name: { type: 'string' },
    caller_last_name: { type: 'string' },
    caller_phone: { type: 'string', description: 'Digits only or E.164.' },
    caller_email: { type: 'string' },
    business_name: { type: 'string' },
    business_type: { type: 'string', description: 'HVAC, junk removal, garage doors, medspa, etc.' },
    city_state: { type: 'string' },
    current_call_handling: { type: 'string' },
    pain_points: { type: 'string' },
    interested: { type: 'boolean' },
    interest_level: { type: 'string', enum: ['cold', 'curious', 'warm', 'hot'] },
    fit_summary: { type: 'string' },
    notes: { type: 'string', description: 'Desired agent tasks and concise call summary.' },
  };
}

function coerceLead(input: Record<string, unknown>): LeadCaptureInput {
  return {
    caller_name: str(input.caller_name),
    caller_first_name: str(input.caller_first_name),
    caller_last_name: str(input.caller_last_name),
    caller_phone: str(input.caller_phone) ?? '',
    caller_email: str(input.caller_email),
    business_name: str(input.business_name),
    business_type: str(input.business_type),
    city_state: str(input.city_state),
    current_call_handling: str(input.current_call_handling),
    pain_points: str(input.pain_points),
    interested: Boolean(input.interested),
    interest_level: asInterest(input.interest_level),
    fit_summary: str(input.fit_summary),
    notes: str(input.notes),
  };
}

function coerceFollowup(input: Record<string, unknown>): FollowupInput {
  return {
    ...coerceLead(input),
    consent_confirmed: Boolean(input.consent_confirmed),
    preferred_time_window: str(input.preferred_time_window) ?? 'next available',
    requested_start_time_iso: str(input.requested_start_time_iso),
    outstanding_questions: str(input.outstanding_questions),
    custom_solution_needs: str(input.custom_solution_needs),
  };
}

function coerceDemoFacts(input: Record<string, unknown>): DemoFacts {
  return {
    business_name: str(input.business_name),
    business_type: str(input.business_type),
    city_state: str(input.city_state),
    services: str(input.services),
    pain_points: str(input.pain_points),
    customer_scenario: str(input.customer_scenario),
    caller_first_name: str(input.caller_first_name) ?? splitFirst(str(input.caller_name)),
  };
}

function splitFirst(full?: string): string | undefined {
  return full?.split(/\s+/).filter(Boolean)[0];
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asInterest(value: unknown): LeadCaptureInput['interest_level'] {
  return value === 'cold' || value === 'curious' || value === 'warm' || value === 'hot' ? value : undefined;
}

function capabilityAnswer(topic: string): string {
  const lower = topic.toLowerCase();
  if (lower.includes('price') || lower.includes('cost')) {
    return 'Do not quote exact pricing. Say pricing depends on call volume, complexity, integrations, and setup needs, and Gregory can walk through the right structure.';
  }
  if (lower.includes('ghl') || lower.includes('crm') || lower.includes('integration')) {
    return 'Saul can be set up to log leads and route follow-up into a CRM such as GHL when the account and fields are configured. For custom integration details, book Gregory.';
  }
  if (lower.includes('calendar') || lower.includes('booking')) {
    return 'The agent can collect preferred windows and booking details. Live calendar confirmation depends on the business setup, so Gregory should review exact booking requirements.';
  }
  if (lower.includes('install') || lower.includes('setup')) {
    return 'Setup usually means mapping services, FAQs, hours, service area, intake questions, routing rules, and CRM follow-up. Gregory can scope the exact install.';
  }
  return 'Keep it concrete: twenty-four-seven answering, lead qualification, caller details, FAQs, routing, CRM logging, and follow-up requests. For anything custom, book Gregory.';
}

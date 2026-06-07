import type { Env, FollowupInput, LeadCaptureInput } from './types.ts';
import { syncLeadToGhl, addFollowupNote } from './ghl.ts';
import { logFollowup, upsertLead } from './supabase.ts';
import { notifyGregory } from './notify.ts';

export const toolSchemas = [
  {
    name: 'qualify_and_log_lead',
    description: 'Qualify and log the service-provider lead after collecting phone plus name or business. Use for every legitimate business caller.',
    input_schema: {
      type: 'object',
      properties: leadProperties(),
      required: ['caller_phone', 'interested'],
    },
  },
  {
    name: 'book_gregory_followup',
    description: 'Log a Gregory follow-up request after the caller gives consent and a preferred time window. Use for interested, warm, hot, or custom-solution callers.',
    input_schema: {
      type: 'object',
      properties: {
        ...leadProperties(),
        consent_confirmed: { type: 'boolean', description: 'True only if caller verbally agreed to a follow-up.' },
        preferred_time_window: { type: 'string', description: 'Caller preferred callback window, e.g. tomorrow afternoon.' },
        outstanding_questions: { type: 'string' },
        custom_solution_needs: { type: 'string' },
      },
      required: ['caller_phone', 'interested', 'consent_confirmed', 'preferred_time_window'],
    },
  },
  {
    name: 'answer_capability_question',
    description: 'Return grounded capability guidance for common questions about phone agents. Use when caller asks what Saul can do, integrations, setup, or pricing boundaries.',
    input_schema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'The capability topic or caller question.' },
      },
      required: ['topic'],
    },
  },
] as const;

export async function executeTool(name: string, input: Record<string, unknown>, env: Env): Promise<string> {
  const tenantId = env.DEFAULT_TENANT_ID ?? '22222222-2222-2222-2222-222222222222';
  const supabase = { url: env.SUPABASE_URL, serviceKey: env.SUPABASE_SERVICE_ROLE_KEY, tenantId };
  const ghl = {
    apiKey: env.GHL_LOCAL_SERVICES_API_KEY,
    locationId: env.GHL_LOCAL_SERVICES_LOCATION_ID,
    version: env.GHL_API_VERSION,
  };

  switch (name) {
    case 'qualify_and_log_lead': {
      const lead = coerceLead(input);
      const db = await upsertLead(lead, supabase);
      if (!db.ok) return `I could not save the lead cleanly: ${db.error}. Keep talking and repeat the details back before ending.`;
      const ghlResult = await syncLeadToGhl(lead, ghl);
      const suffix = ghlResult.ok ? '' : ` GHL sync needs review: ${ghlResult.error}.`;
      return `Lead logged. Qualification score is ${lead.interest_level ?? (lead.interested ? 'warm' : 'cold')}. Keep the caller engaged and ask about a Gregory follow-up if they are interested.${suffix}`;
    }
    case 'book_gregory_followup': {
      const followup = coerceFollowup(input);
      const db = await upsertLead(followup, supabase);
      if (!db.ok || !db.id) return `I could not save the lead cleanly: ${db.error}. Ask for the best phone and preferred window again.`;
      const follow = await logFollowup(followup, db.id, supabase);
      if (!follow.ok) return `I could not book the follow-up request: ${follow.error}. Ask for verbal consent and preferred window.`;
      const ghlLead = await syncLeadToGhl(followup, ghl);
      await addFollowupNote(followup, ghlLead.contactId, ghl);
      await notifyGregory(followup, db.id, env);
      return `Follow-up request logged for Gregory. Tell the caller Gregory has the context, their preferred window is saved, and he will follow up to discuss questions and custom setup.`;
    }
    case 'answer_capability_question':
      return capabilityAnswer(String(input.topic ?? ''));
    default:
      return `Unknown tool: ${name}`;
  }
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
    outstanding_questions: str(input.outstanding_questions),
    custom_solution_needs: str(input.custom_solution_needs),
  };
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

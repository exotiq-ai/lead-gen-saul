import type { FollowupInput, LeadCaptureInput } from './types.ts';
import type { AppointmentResult } from './ghl.ts';

export interface SupabaseCfg {
  url: string;
  serviceKey: string;
  tenantId: string;
}

export interface LeadRecordResult {
  ok: boolean;
  id?: string;
  error?: string;
  created?: boolean;
  status?: string;
}

export function normalizePhone(raw: string): string {
  if (!raw) return raw;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (raw.startsWith('+') && digits.length >= 10) return `+${digits}`;
  return raw.trim();
}

export function splitName(input?: LeadCaptureInput): { first?: string; last?: string } {
  const first = clean(input?.caller_first_name);
  const last = clean(input?.caller_last_name);
  if (first || last) return { first, last };
  const full = clean(input?.caller_name);
  if (!full) return {};
  const parts = full.split(/\s+/).filter(Boolean);
  return { first: parts[0], last: parts.length > 1 ? parts.slice(1).join(' ') : undefined };
}

export function buildLeadRow(input: LeadCaptureInput, cfg: SupabaseCfg) {
  const { first, last } = splitName(input);
  const status = input.interested ? (input.interest_level === 'hot' ? 'qualified' : 'engaged') : 'new';
  return {
    tenant_id: cfg.tenantId,
    first_name: first,
    last_name: last,
    email: clean(input.caller_email),
    phone: normalizePhone(input.caller_phone),
    company_name: clean(input.business_name) ?? fallbackCompany(first),
    company_industry: clean(input.business_type),
    company_location: clean(input.city_state),
    source: 'saul_phone_agent_inbound',
    source_detail: 'provider_phone_agent',
    status,
    assigned_to: input.interested ? 'gregory' : null,
    score: leadScore(input),
    score_breakdown: {
      persona: 'service_provider_phone_agent_prospect',
      interested: input.interested,
      interest_level: input.interest_level ?? (input.interested ? 'warm' : 'cold'),
      current_call_handling: clean(input.current_call_handling),
      pain_points: clean(input.pain_points),
      fit_summary: clean(input.fit_summary),
      desired_agent_tasks: clean(input.notes),
      qualification_source: 'saul_voice_call',
    },
    last_activity_at: new Date().toISOString(),
  };
}

export async function upsertLead(input: LeadCaptureInput, cfg: SupabaseCfg): Promise<LeadRecordResult> {
  if (!cfg.url || !cfg.serviceKey) return { ok: false, error: 'Supabase not configured' };
  const phone = normalizePhone(input.caller_phone);
  const existing = await findLeadByPhone(phone, cfg);
  if (!existing.ok) return existing;
  const row = buildLeadRow({ ...input, caller_phone: phone }, cfg);
  if (existing.id) {
    const currentRank = statusRank(existing.status);
    const nextRank = statusRank(row.status);
    const safeRow = nextRank < currentRank ? { ...row, status: existing.status } : row;
    const resp = await supabaseFetch(cfg, `/rest/v1/leads?id=eq.${encodeURIComponent(existing.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(safeRow),
    });
    if (!resp.ok) return { ok: false, error: `${resp.status}: ${(await resp.text()).slice(0, 200)}` };
    await logActivity(existing.id, 'voice_lead_qualified', input.interested ? 'phone' : 'phone', row.score_breakdown, cfg);
    return { ok: true, id: existing.id, created: false };
  }
  const resp = await supabaseFetch(cfg, '/rest/v1/leads', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(row),
  });
  if (!resp.ok) return { ok: false, error: `${resp.status}: ${(await resp.text()).slice(0, 200)}` };
  const rows = (await resp.json()) as Array<{ id: string }>;
  const id = rows[0]?.id;
  if (id) await logActivity(id, 'voice_lead_qualified', 'phone', row.score_breakdown, cfg);
  return { ok: true, id, created: true };
}

export async function logFollowup(input: FollowupInput, leadId: string, cfg: SupabaseCfg): Promise<LeadRecordResult> {
  if (!input.consent_confirmed) return { ok: false, id: leadId, error: 'Verbal consent required before logging a callback request.' };
  const metadata = {
    preferred_time_window: input.preferred_time_window,
    outstanding_questions: clean(input.outstanding_questions),
    custom_solution_needs: clean(input.custom_solution_needs),
    consent_confirmed: true,
    booked_by: 'saul_provider_phone_agent',
  };
  await logActivity(leadId, 'gregory_followup_requested', 'phone', metadata, cfg);
  const resp = await supabaseFetch(cfg, `/rest/v1/leads?id=eq.${encodeURIComponent(leadId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'qualified', assigned_to: 'gregory', last_activity_at: new Date().toISOString() }),
  });
  if (!resp.ok) return { ok: false, id: leadId, error: `${resp.status}: ${(await resp.text()).slice(0, 200)}` };
  return { ok: true, id: leadId };
}

export async function logAppointment(input: FollowupInput, leadId: string, appointment: AppointmentResult, cfg: SupabaseCfg): Promise<void> {
  await logActivity(leadId, 'gregory_appointment_booked', 'phone', {
    booked_by: 'saul_provider_phone_agent',
    appointment_id: appointment.appointmentId,
    start_time: appointment.startTime,
    end_time: appointment.endTime,
    source: appointment.source,
    preferred_time_window: input.preferred_time_window,
    requested_start_time_iso: input.requested_start_time_iso,
  }, cfg);
  await supabaseFetch(cfg, `/rest/v1/leads?id=eq.${encodeURIComponent(leadId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'qualified', assigned_to: 'gregory', last_activity_at: new Date().toISOString() }),
  });
}

export async function logCallSession(row: Record<string, unknown>, cfg: SupabaseCfg): Promise<void> {
  if (!cfg.url || !cfg.serviceKey) return;
  try {
    await supabaseFetch(cfg, '/rest/v1/agent_runs', {
      method: 'POST',
      body: JSON.stringify({
        tenant_id: cfg.tenantId,
        agent_type: 'saul_provider_phone_agent_call',
        status: 'completed',
        input_data: row,
        output_data: {},
        completed_at: new Date().toISOString(),
      }),
    });
  } catch { /* never break call on logging */ }
}

async function findLeadByPhone(phone: string, cfg: SupabaseCfg): Promise<LeadRecordResult> {
  const resp = await supabaseFetch(cfg, `/rest/v1/leads?select=id,status&tenant_id=eq.${encodeURIComponent(cfg.tenantId)}&phone=eq.${encodeURIComponent(phone)}&limit=1`);
  if (!resp.ok) return { ok: false, error: `${resp.status}: ${(await resp.text()).slice(0, 200)}` };
  const rows = (await resp.json()) as Array<{ id: string; status?: string }>;
  return { ok: true, id: rows[0]?.id, status: rows[0]?.status };
}

async function logActivity(leadId: string, activityType: string, channel: string, metadata: Record<string, unknown>, cfg: SupabaseCfg): Promise<void> {
  await supabaseFetch(cfg, '/rest/v1/lead_activities', {
    method: 'POST',
    body: JSON.stringify({ tenant_id: cfg.tenantId, lead_id: leadId, activity_type: activityType, channel, metadata }),
  });
}

function statusRank(status?: string): number {
  return { new: 1, engaged: 2, qualified: 3, converted: 4 }[status ?? ''] ?? 0;
}

async function supabaseFetch(cfg: SupabaseCfg, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${cfg.url}${path}`, {
    ...init,
    headers: {
      apikey: cfg.serviceKey,
      Authorization: `Bearer ${cfg.serviceKey}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

function clean(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function fallbackCompany(first?: string): string {
  return first ? `${first} phone-agent prospect` : 'Phone-agent prospect';
}

function leadScore(input: LeadCaptureInput): number {
  const level = input.interest_level ?? (input.interested ? 'warm' : 'cold');
  const base = { cold: 25, curious: 45, warm: 70, hot: 90 }[level];
  const pain = input.pain_points || input.current_call_handling ? 10 : 0;
  const email = input.caller_email ? 5 : 0;
  return Math.min(100, base + pain + email);
}

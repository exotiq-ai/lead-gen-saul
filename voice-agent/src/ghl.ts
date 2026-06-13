import type { FollowupInput, LeadCaptureInput } from './types.ts';
import { normalizePhone, splitName } from './leadUtils.ts';
import {
  ASK_SAUL_CALENDAR_ID,
  appointmentDescription,
  buildAppointmentTitle,
  formatConfirmationText,
  selectGregorySlot,
} from './scheduling.ts';

export interface GhlCfg {
  apiKey?: string;
  locationId?: string;
  version?: string;
  calendarId?: string;
  pipelineId?: string;
  hotLeadStageId?: string;
  bookedStageId?: string;
}

export interface GhlResult {
  ok: boolean;
  contactId?: string;
  error?: string;
  skipped?: boolean;
  tags?: string[];
}

export interface AppointmentResult extends GhlResult {
  appointmentId?: string;
  startTime?: string;
  endTime?: string;
  confirmationText?: string;
  source?: 'requested_exact_slot' | 'next_available_slot';
}

export async function syncLeadToGhl(input: LeadCaptureInput, cfg: GhlCfg): Promise<GhlResult> {
  if (!cfg.apiKey || !cfg.locationId) return { ok: true, skipped: true };
  const { first, last } = splitName(input);
  const body = {
    locationId: cfg.locationId,
    firstName: first ?? input.business_name ?? 'Phone Agent',
    lastName: last ?? 'Prospect',
    name: input.caller_name,
    email: input.caller_email,
    phone: normalizePhone(input.caller_phone),
    companyName: input.business_name,
    source: 'Saul provider phone agent',
    tags: ['ask-saul', 'phone-agent-prospect', input.interested ? 'interested' : 'unqualified'].filter(Boolean),
  };
  try {
    const resp = await fetch('https://services.leadconnectorhq.com/contacts/upsert', {
      method: 'POST',
      headers: headers(cfg),
      body: JSON.stringify(body),
    });
    const text = await resp.text();
    if (!resp.ok) return { ok: false, error: `${resp.status}: ${text.slice(0, 300)}` };
    const json = JSON.parse(text || '{}') as { contact?: { id?: string; tags?: unknown }; id?: string; tags?: unknown };
    const tags = normalizeTags(json.contact?.tags ?? json.tags);
    return { ok: true, contactId: json.contact?.id ?? json.id, tags };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function addContactNote(body: string, contactId: string | undefined, cfg: GhlCfg): Promise<GhlResult> {
  if (!cfg.apiKey || !cfg.locationId || !contactId) return { ok: true, skipped: true };
  try {
    const resp = await fetch(`https://services.leadconnectorhq.com/contacts/${encodeURIComponent(contactId)}/notes`, {
      method: 'POST',
      headers: headers(cfg),
      body: JSON.stringify({ body }),
    });
    if (!resp.ok) return { ok: false, error: `${resp.status}: ${(await resp.text()).slice(0, 300)}` };
    return { ok: true, contactId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function getContactNotes(contactId: string | undefined, cfg: GhlCfg): Promise<Array<{ body?: string; bodyText?: string; dateAdded?: string }>> {
  if (!cfg.apiKey || !cfg.locationId || !contactId) return [];
  try {
    const resp = await fetch(`https://services.leadconnectorhq.com/contacts/${encodeURIComponent(contactId)}/notes`, {
      method: 'GET',
      headers: headers(cfg),
    });
    if (!resp.ok) return [];
    const data = await resp.json().catch(() => ({})) as { notes?: Array<{ body?: string; bodyText?: string; dateAdded?: string }> };
    return Array.isArray(data.notes) ? data.notes : [];
  } catch {
    return [];
  }
}

export async function addFollowupNote(input: FollowupInput, contactId: string | undefined, cfg: GhlCfg, appointment?: AppointmentResult): Promise<GhlResult> {
  const body = [
    appointment?.ok ? 'Saul phone-agent call booked for Gregory.' : 'Saul phone-agent follow-up requested for Gregory.',
    appointment?.startTime ? `Booked appointment: ${appointment.startTime}` : `Preferred window: ${input.preferred_time_window}`,
    input.outstanding_questions ? `Questions: ${input.outstanding_questions}` : null,
    input.custom_solution_needs ? `Custom needs: ${input.custom_solution_needs}` : null,
    input.pain_points ? `Pain: ${input.pain_points}` : null,
  ].filter(Boolean).join('\n');
  return addContactNote(body, contactId, cfg);
}

export async function addContactTags(contactId: string | undefined, tags: string[], cfg: GhlCfg): Promise<GhlResult> {
  const cleanTags = [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
  if (!cfg.apiKey || !cfg.locationId || !contactId || !cleanTags.length) return { ok: true, skipped: true, contactId };
  try {
    const resp = await fetch(`https://services.leadconnectorhq.com/contacts/${encodeURIComponent(contactId)}/tags`, {
      method: 'POST',
      headers: headers(cfg),
      body: JSON.stringify({ tags: cleanTags }),
    });
    if (!resp.ok) return { ok: false, contactId, error: `${resp.status}: ${(await resp.text()).slice(0, 300)}` };
    return { ok: true, contactId };
  } catch (err) {
    return { ok: false, contactId, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function sendGhlEmailMessage(input: {
  cfg: GhlCfg;
  contactId: string;
  subject: string;
  html: string;
  text: string;
  fromEmail: string;
  fromName: string;
  toEmail: string;
}): Promise<{ ok: true; messageId?: string } | { ok: false; error: string; status?: number }> {
  const payload: Record<string, unknown> = {
    type: 'Email',
    contactId: input.contactId,
    subject: input.subject,
    html: input.html,
    message: input.text,
    emailFrom: input.fromEmail,
    emailTo: input.toEmail,
    fromEmail: input.fromEmail,
    fromName: input.fromName,
  };
  try {
    const resp = await fetch('https://services.leadconnectorhq.com/conversations/messages', {
      method: 'POST',
      headers: headers(input.cfg),
      body: JSON.stringify(payload),
    });
    const text = await resp.text();
    const data = safeJson(text);
    if (!resp.ok) {
      const message = typeof data?.message === 'string' ? data.message : text.slice(0, 300);
      return { ok: false, error: `${resp.status}: ${message}`, status: resp.status };
    }
    const messageId =
      asString(data?.messageId) ||
      asString(data?.id) ||
      asString((data?.message as Record<string, unknown> | undefined)?.id);
    return { ok: true, messageId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function ensureOpportunity(input: LeadCaptureInput | FollowupInput, contactId: string | undefined, cfg: GhlCfg, stage: 'hot_lead' | 'booked'): Promise<GhlResult & { opportunityId?: string }> {
  const pipelineId = cfg.pipelineId;
  const pipelineStageId = stage === 'booked' ? cfg.bookedStageId : cfg.hotLeadStageId;
  if (!cfg.apiKey || !cfg.locationId || !contactId || !pipelineId || !pipelineStageId) return { ok: true, skipped: true, contactId };

  const existing = await fetch(`https://services.leadconnectorhq.com/opportunities/search?location_id=${encodeURIComponent(cfg.locationId)}&contact_id=${encodeURIComponent(contactId)}`, {
    method: 'GET',
    headers: headers(cfg),
  });
  if (existing.ok) {
    const found = await existing.json().catch(() => ({})) as { opportunities?: Array<{ id?: string }> };
    const firstId = found.opportunities?.[0]?.id;
    if (firstId) return { ok: true, contactId, opportunityId: firstId, skipped: true };
  }

  const name = `${input.business_name || input.caller_name || 'Ask Saul lead'} - provider phone agent`;
  const resp = await fetch('https://services.leadconnectorhq.com/opportunities/', {
    method: 'POST',
    headers: headers(cfg),
    body: JSON.stringify({
      locationId: cfg.locationId,
      pipelineId,
      pipelineStageId,
      name,
      status: 'open',
      contactId,
      monetaryValue: 0,
      source: 'Saul provider phone agent',
    }),
  });
  const text = await resp.text();
  if (!resp.ok) return { ok: false, contactId, error: `${resp.status}: ${text.slice(0, 300)}` };
  const data = safeJson(text);
  return { ok: true, contactId, opportunityId: asString((data?.opportunity as Record<string, unknown> | undefined)?.id) || asString(data?.id) };
}

export async function bookGregoryAppointment(input: FollowupInput, contactId: string | undefined, cfg: GhlCfg): Promise<AppointmentResult> {
  if (!cfg.apiKey || !cfg.locationId || !contactId) return { ok: true, skipped: true, contactId };
  const calendarId = cfg.calendarId || ASK_SAUL_CALENDAR_ID;
  const existing = await findExistingAppointment(contactId, calendarId, cfg);
  if (existing) {
    return { ok: true, skipped: true, contactId, appointmentId: existing.id, startTime: existing.startTime, endTime: existing.endTime, source: 'next_available_slot', confirmationText: existing.startTime ? formatConfirmationText(existing.startTime) : undefined };
  }
  const selected = await selectGregorySlot({
    preference: {
      preferredWindow: input.preferred_time_window,
      requestedStartIso: input.requested_start_time_iso,
    },
    fetchFreeSlots: async (startMs, endMs) => fetchFreeSlots(calendarId, cfg, startMs, endMs),
  });
  if (!selected.ok) return { ok: false, contactId, error: selected.error };

  const payload: Record<string, unknown> = {
    calendarId,
    locationId: cfg.locationId,
    contactId,
    startTime: selected.startTime,
    endTime: selected.endTime,
    title: buildAppointmentTitle(input),
    appointmentStatus: 'confirmed',
    address: `Gregory will call ${normalizePhone(input.caller_phone)}`,
    notes: appointmentDescription(input),
    toNotify: true,
    ignoreFreeSlotValidation: false,
  };

  try {
    const resp = await fetch('https://services.leadconnectorhq.com/calendars/events/appointments', {
      method: 'POST',
      headers: headers(cfg),
      body: JSON.stringify(payload),
    });
    const text = await resp.text();
    if (!resp.ok) return { ok: false, contactId, error: `${resp.status}: ${text.slice(0, 500)}` };
    const json = JSON.parse(text || '{}') as { appointment?: { id?: string }; id?: string; event?: { id?: string } };
    return {
      ok: true,
      contactId,
      appointmentId: json.appointment?.id ?? json.event?.id ?? json.id,
      startTime: selected.startTime,
      endTime: selected.endTime,
      source: selected.source,
      confirmationText: formatConfirmationText(selected.startTime),
    };
  } catch (err) {
    return { ok: false, contactId, error: err instanceof Error ? err.message : String(err) };
  }
}

async function findExistingAppointment(contactId: string, calendarId: string, cfg: GhlCfg): Promise<{ id?: string; startTime?: string; endTime?: string } | null> {
  try {
    const resp = await fetch(`https://services.leadconnectorhq.com/contacts/${encodeURIComponent(contactId)}/appointments`, {
      method: 'GET',
      headers: headers(cfg),
    });
    if (!resp.ok) return null;
    const data = await resp.json().catch(() => ({})) as { events?: Array<{ id?: string; calendarId?: string; deleted?: boolean; startTime?: string; endTime?: string }> };
    const existing = data.events?.find((event) => event.calendarId === calendarId && event.deleted !== true);
    return existing ? { id: existing.id, startTime: existing.startTime, endTime: existing.endTime } : null;
  } catch {
    return null;
  }
}

async function fetchFreeSlots(calendarId: string, cfg: GhlCfg, startMs: number, endMs: number): Promise<string[]> {
  const qs = new URLSearchParams({ startDate: String(startMs), endDate: String(endMs) });
  const resp = await fetch(`https://services.leadconnectorhq.com/calendars/${encodeURIComponent(calendarId)}/free-slots?${qs}`, {
    method: 'GET',
    headers: headers(cfg),
  });
  if (!resp.ok) throw new Error(`free slots read failed ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const data = await resp.json() as Record<string, { slots?: string[] }>;
  return Object.values(data).flatMap((day) => Array.isArray(day.slots) ? day.slots : []);
}

function headers(cfg: GhlCfg): HeadersInit {
  return {
    Authorization: `Bearer ${cfg.apiKey}`,
    Version: cfg.version ?? '2021-07-28',
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

function safeJson(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text || '{}') as Record<string, unknown>;
  } catch {
    return null;
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function normalizeTags(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === 'string') : [];
}

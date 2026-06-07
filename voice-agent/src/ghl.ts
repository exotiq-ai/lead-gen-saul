import type { FollowupInput, LeadCaptureInput } from './types.ts';
import { normalizePhone, splitName } from './supabase.ts';

export interface GhlCfg {
  apiKey?: string;
  locationId?: string;
  version?: string;
}

export interface GhlResult {
  ok: boolean;
  contactId?: string;
  error?: string;
  skipped?: boolean;
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
    const json = JSON.parse(text || '{}') as { contact?: { id?: string }; id?: string };
    return { ok: true, contactId: json.contact?.id ?? json.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function addFollowupNote(input: FollowupInput, contactId: string | undefined, cfg: GhlCfg): Promise<GhlResult> {
  if (!cfg.apiKey || !cfg.locationId || !contactId) return { ok: true, skipped: true };
  const body = [
    'Saul phone-agent follow-up requested for Gregory.',
    `Preferred window: ${input.preferred_time_window}`,
    input.outstanding_questions ? `Questions: ${input.outstanding_questions}` : null,
    input.custom_solution_needs ? `Custom needs: ${input.custom_solution_needs}` : null,
    input.pain_points ? `Pain: ${input.pain_points}` : null,
  ].filter(Boolean).join('\n');
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

function headers(cfg: GhlCfg): HeadersInit {
  return {
    Authorization: `Bearer ${cfg.apiKey}`,
    Version: cfg.version ?? '2021-07-28',
    'Content-Type': 'application/json',
  };
}

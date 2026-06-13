import { DEMO_ENTRY_SENTINEL, DEMO_EXIT_SENTINEL } from './modes.ts';
import { addContactNote, syncLeadToGhl } from './ghl.ts';
import { normalizePhone } from './leadUtils.ts';
import type { Env } from './types.ts';

const TRANSCRIPT_CAP = 12000;
const NOTE_CAP = 3000;
const SIGNATURE_TOLERANCE_SECONDS = 1800;

interface PostCallTurn {
  role?: string;
  message?: string | null;
}

interface PostCallPayload {
  type?: string;
  data?: {
    conversation_id?: string;
    transcript?: PostCallTurn[];
    metadata?: {
      call_duration_secs?: number;
      phone_call?: { external_number?: string };
    };
  };
}

export async function handlePostCall(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  // Fail closed: without a configured secret, anonymous POSTs could write
  // attacker-controlled transcripts onto real leads and GHL contacts.
  if (!env.ELEVENLABS_POST_CALL_SECRET) return new Response('Webhook secret not configured', { status: 503 });
  const raw = await req.text();
  const ok = await verifyElevenLabsSignature(raw, req.headers.get('elevenlabs-signature'), env.ELEVENLABS_POST_CALL_SECRET);
  if (!ok) return new Response('Unauthorized', { status: 401 });
  let payload: PostCallPayload;
  try { payload = JSON.parse(raw) as PostCallPayload; } catch { return new Response('Bad JSON', { status: 400 }); }
  ctx.waitUntil(processPostCall(payload, env));
  return Response.json({ ok: true });
}

export function funnelFromTranscript(turns: PostCallTurn[]): { demo_offered: boolean; demo_started: boolean; demo_completed: boolean } {
  const agentText = turns
    .filter((t) => t.role === 'agent' || t.role === 'assistant')
    .map((t) => (t.message ?? '').toLowerCase())
    .join('\n');
  return {
    demo_offered: /hear how that would sound/.test(agentText) || agentText.includes(DEMO_ENTRY_SENTINEL),
    demo_started: agentText.includes(DEMO_ENTRY_SENTINEL),
    demo_completed: agentText.includes(DEMO_EXIT_SENTINEL),
  };
}

async function processPostCall(payload: PostCallPayload, env: Env): Promise<void> {
  const data = payload.data;
  const turns = Array.isArray(data?.transcript) ? data.transcript : [];
  if (!turns.length) return;
  const funnel = funnelFromTranscript(turns);
  const transcript = turns
    .map((t) => `${t.role === 'agent' || t.role === 'assistant' ? 'Agent' : 'Caller'}: ${(t.message ?? '').trim()}`)
    .filter((line) => !line.endsWith(': '))
    .join('\n')
    .slice(0, TRANSCRIPT_CAP);
  const callerPhone = data?.metadata?.phone_call?.external_number;
  const durationSecs = data?.metadata?.call_duration_secs;

  if (!callerPhone || !env.GHL_LOCAL_SERVICES_API_KEY || !env.GHL_LOCAL_SERVICES_LOCATION_ID) return;

  const ghl = {
    apiKey: env.GHL_LOCAL_SERVICES_API_KEY,
    locationId: env.GHL_LOCAL_SERVICES_LOCATION_ID,
    version: env.GHL_API_VERSION,
  };
  const lead = await syncLeadToGhl({
    caller_phone: normalizePhone(callerPhone),
    interested: true,
    interest_level: funnel.demo_completed ? 'hot' : 'warm',
    notes: `Post-call transcript received from ElevenLabs conversation ${data?.conversation_id ?? 'unknown'}.`,
  }, ghl);
  if (!lead.ok || !lead.contactId) return;

  // Gregory walks into the follow-up call with the transcript in GHL.
  const noteHeader = [
    'Saul call transcript',
    durationSecs ? `Duration: ${Math.round(durationSecs)}s` : null,
    `Demo: offered=${funnel.demo_offered} started=${funnel.demo_started} completed=${funnel.demo_completed}`,
    data?.conversation_id ? `ElevenLabs: ${data.conversation_id}` : null,
  ].filter(Boolean).join(' | ');
  await addContactNote(`${noteHeader}\n\n${transcript.slice(0, NOTE_CAP)}`, lead.contactId, ghl);
}

export async function verifyElevenLabsSignature(rawBody: string, header: string | null, secret: string): Promise<boolean> {
  if (!header) return false;
  const parts = new Map(header.split(',').map((p) => {
    const idx = p.indexOf('=');
    return [p.slice(0, idx).trim(), p.slice(idx + 1).trim()] as [string, string];
  }));
  const t = parts.get('t');
  const v0 = parts.get('v0');
  if (!t || !v0) return false;
  const age = Math.abs(Date.now() / 1000 - Number(t));
  if (!Number.isFinite(age) || age > SIGNATURE_TOLERANCE_SECONDS) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${rawBody}`));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return constantTimeEqual(hex, v0.replace(/^sha256=/, ''));
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

import type Anthropic from '@anthropic-ai/sdk';
import type { Env } from './types.ts';

export type CallMode = 'discovery' | 'demo' | 'debrief';

export interface DemoFacts {
  business_name?: string;
  business_type?: string;
  city_state?: string;
  services?: string;
  pain_points?: string;
  customer_scenario?: string;
  caller_first_name?: string;
  lead_id?: string;
}

export interface CallState {
  mode: CallMode;
  facts?: DemoFacts;
}

// These sentinel phrases are scripted VERBATIM into the prompts at the two mode
// transitions and nowhere else. Because ElevenLabs replays the full transcript on
// every turn, scanning assistant messages for them recovers the call mode with no
// stored state — the stateless fallback when KV is absent or the call id is unstable.
export const DEMO_ENTRY_SENTINEL = 'new hat on';
export const DEMO_EXIT_SENTINEL = 'hat back on';

const KV_TTL_SECONDS = 3600;

export function demoOpeningLine(facts?: DemoFacts): string {
  const business = facts?.business_name?.trim() || 'your business';
  return `Alright — new hat on. Thanks for calling ${business}, how can I help you today?`;
}

export function debriefOpeningLine(): string {
  return 'Okay — Sawl hat back on. That was your agent answering. What stood out to you?';
}

export function scanTranscriptForMode(messages: Anthropic.MessageParam[]): CallState {
  let entryIdx = -1;
  let exitIdx = -1;
  let entryText = '';
  messages.forEach((m, i) => {
    if (m.role !== 'assistant') return;
    const text = typeof m.content === 'string' ? m.content : '';
    const lower = text.toLowerCase();
    if (lower.includes(DEMO_ENTRY_SENTINEL)) {
      entryIdx = i;
      entryText = text;
    }
    if (lower.includes(DEMO_EXIT_SENTINEL)) exitIdx = i;
  });
  if (exitIdx >= 0 && exitIdx >= entryIdx) return { mode: 'debrief' };
  if (entryIdx >= 0) {
    const match = entryText.match(/thanks for calling (.+?)[,.!?]/i);
    const business = match?.[1]?.trim();
    return { mode: 'demo', facts: business ? { business_name: business } : undefined };
  }
  return { mode: 'discovery' };
}

export async function readCallState(env: Env, callId?: string): Promise<CallState | null> {
  if (!env.SAUL_CALL_STATE || !callId) return null;
  try {
    const raw = await env.SAUL_CALL_STATE.get(kvKey(callId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CallState;
    if (parsed && (parsed.mode === 'discovery' || parsed.mode === 'demo' || parsed.mode === 'debrief')) {
      return parsed;
    }
  } catch {
    /* fail open to transcript scan */
  }
  return null;
}

export async function writeCallState(env: Env, callId: string | undefined, state: CallState): Promise<void> {
  if (!env.SAUL_CALL_STATE || !callId) return;
  try {
    await env.SAUL_CALL_STATE.put(kvKey(callId), JSON.stringify(state), { expirationTtl: KV_TTL_SECONDS });
  } catch {
    /* transcript scan still recovers the mode next turn */
  }
}

export async function resolveCallState(env: Env, callId: string | undefined, messages: Anthropic.MessageParam[]): Promise<CallState> {
  return (await readCallState(env, callId)) ?? scanTranscriptForMode(messages);
}

function kvKey(callId: string): string {
  return `call:${callId}`;
}

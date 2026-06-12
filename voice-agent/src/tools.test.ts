import test from 'node:test';
import assert from 'node:assert/strict';

import { executeTool, toolsForMode } from './tools.ts';
import { isAllowedGregorySlot } from './scheduling.ts';
import type { Env } from './types.ts';

function fakeKv(store: Map<string, string>): KVNamespace {
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => { store.set(key, value); },
  } as unknown as KVNamespace;
}

function dryEnv(store: Map<string, string>): Env {
  return {
    ANTHROPIC_API_KEY: 'test',
    SUPABASE_URL: '',
    SUPABASE_SERVICE_ROLE_KEY: '',
    SAUL_DRY_RUN: 'true',
    SAUL_CALL_STATE: fakeKv(store),
  } as unknown as Env;
}

test('tool gating: demo mode exposes only the exit tool', () => {
  assert.deepEqual(toolsForMode('demo').map((t) => t.name), ['end_demo_roleplay']);
  assert.deepEqual(
    toolsForMode('discovery').map((t) => t.name).sort(),
    ['answer_capability_question', 'book_gregory_followup', 'qualify_and_log_lead', 'start_demo_roleplay'],
  );
  assert.deepEqual(
    toolsForMode('debrief').map((t) => t.name).sort(),
    ['answer_capability_question', 'book_gregory_followup', 'qualify_and_log_lead'],
  );
});

test('start_demo_roleplay returns the verbatim opening line and demo state', async () => {
  const store = new Map<string, string>();
  const result = await executeTool('start_demo_roleplay', {
    business_name: 'Mile High HVAC',
    business_type: 'HVAC',
    city_state: 'Denver, CO',
    pain_points: 'missed after-hours calls',
    customer_scenario: 'homeowner calling at 9pm with a dead furnace',
    caller_name: 'Mike Rivera',
  }, dryEnv(store), { callId: 'call-1' });
  assert.equal(result.state?.mode, 'demo');
  assert.equal(result.state?.facts?.business_name, 'Mile High HVAC');
  assert.equal(result.state?.facts?.caller_first_name, 'Mike');
  assert.match(result.content, /"Alright — new hat on\. Thanks for calling Mile High HVAC, how can I help you today\?"/);
  assert.match(store.get('call:call-1') ?? '', /"mode":"demo"/);
});

test('start_demo_roleplay works without a phone number (facts only, no lead write)', async () => {
  const store = new Map<string, string>();
  const result = await executeTool('start_demo_roleplay', { business_type: 'garage doors' }, dryEnv(store), { callId: 'call-2' });
  assert.equal(result.state?.mode, 'demo');
  assert.equal(result.state?.facts?.lead_id, undefined);
  assert.match(result.content, /new hat on/);
});

test('end_demo_roleplay flips to debrief, preserves facts, returns the verbatim line', async () => {
  const store = new Map<string, string>([
    ['call:call-1', JSON.stringify({ mode: 'demo', facts: { business_name: 'Mile High HVAC', lead_id: undefined } })],
  ]);
  const result = await executeTool('end_demo_roleplay', { demo_outcome: 'completed' }, dryEnv(store), { callId: 'call-1' });
  assert.equal(result.state?.mode, 'debrief');
  assert.equal(result.state?.facts?.business_name, 'Mile High HVAC');
  assert.match(result.content, /"Okay — Sawl hat back on\. That was your agent answering\. What stood out to you\?"/);
  assert.match(store.get('call:call-1') ?? '', /"mode":"debrief"/);
});

test('end_demo_roleplay without any KV binding falls back to the loop state for facts', async () => {
  const env = {
    ANTHROPIC_API_KEY: 'test',
    SUPABASE_URL: '',
    SUPABASE_SERVICE_ROLE_KEY: '',
    SAUL_DRY_RUN: 'true',
  } as unknown as Env;
  const result = await executeTool('end_demo_roleplay', { demo_outcome: 'completed' }, env, {
    callId: 'call-9',
    state: { mode: 'demo', facts: { business_name: 'Mile High HVAC', caller_first_name: 'Mike' } },
  });
  assert.equal(result.state?.mode, 'debrief');
  assert.equal(result.state?.facts?.business_name, 'Mile High HVAC');
  assert.equal(result.state?.facts?.caller_first_name, 'Mike');
});

test('dry run with no Supabase configured still logs the lead successfully', async () => {
  const result = await executeTool('qualify_and_log_lead', {
    caller_phone: '5551234567',
    caller_name: 'Mike Rivera',
    business_name: 'Mile High HVAC',
    interested: true,
    interest_level: 'warm',
  }, dryEnv(new Map()), {});
  assert.match(result.content, /Lead logged\. Qualification score is warm\./);
});

test('dry run book_gregory_followup never claims a confirmed appointment', async () => {
  const result = await executeTool('book_gregory_followup', {
    caller_phone: '5551234567',
    interested: true,
    consent_confirmed: true,
    preferred_time_window: 'tomorrow afternoon',
  }, dryEnv(new Map()), {});
  assert.match(result.content, /do not claim a confirmed appointment/);
});

function liveGhlEnv(): Env {
  return {
    ANTHROPIC_API_KEY: 'test',
    SUPABASE_URL: '',
    SUPABASE_SERVICE_ROLE_KEY: '',
    GHL_LOCAL_SERVICES_API_KEY: 'ghl-test',
    GHL_LOCAL_SERVICES_LOCATION_ID: 'RxCVQeGoQ3RTJbbLG5gY',
    GHL_API_VERSION: '2021-07-28',
    GHL_ASK_SAUL_CALENDAR_ID: 'tbvii3aqFCtT85hdV0Gu',
    GHL_ASK_SAUL_PIPELINE_ID: 'QnDY45LoOWXl3VIuBa1w',
    GHL_ASK_SAUL_HOT_LEAD_STAGE_ID: '66bf5184-206f-4bfd-9944-e3d0cb0fffe4',
    GHL_ASK_SAUL_BOOKED_STAGE_ID: 'aba37542-28d5-4f56-9fe4-d4849c61bb11',
  } as unknown as Env;
}

function nextAllowedSlot(): string {
  for (let i = 1; i < 30; i++) {
    const candidate = new Date(Date.now() + i * 24 * 60 * 60 * 1000);
    candidate.setUTCHours(16, 0, 0, 0); // 10am MT during daylight time, still within booking hours otherwise.
    const iso = candidate.toISOString();
    if (isAllowedGregorySlot(iso)) return iso;
  }
  throw new Error('No allowed slot found');
}

test('live qualify_and_log_lead uses GHL even when Supabase is unavailable', async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('/contacts/upsert')) return Response.json({ contact: { id: 'ghl-contact-1', tags: [] } });
    if (url.includes('/opportunities/search')) return Response.json({ opportunities: [] });
    if (url.includes('/opportunities/')) return Response.json({ opportunity: { id: 'opp-1' } });
    return Response.json({ ok: true });
  }) as typeof fetch;
  try {
    const result = await executeTool('qualify_and_log_lead', {
      caller_phone: '5551234567',
      caller_name: 'Mike Rivera',
      business_name: 'Mile High HVAC',
      interested: true,
      interest_level: 'warm',
    }, liveGhlEnv(), {});

    assert.match(result.content, /Lead logged\. Qualification score is warm\./);
    assert.ok(calls.some((url) => url.includes('/contacts/upsert')));
    assert.ok(calls.some((url) => url.includes('/opportunities/')));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('live book_gregory_followup books in GHL even when Supabase is unavailable', async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  const slot = nextAllowedSlot();
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('/contacts/upsert')) return Response.json({ contact: { id: 'ghl-contact-1', tags: [] } });
    if (url.includes('/contacts/ghl-contact-1/appointments')) return Response.json({ events: [] });
    if (url.includes('/calendars/') && url.includes('/free-slots')) return Response.json({ day: { slots: [slot] } });
    if (url.includes('/calendars/events/appointments')) return Response.json({ appointment: { id: 'appt-1' } });
    if (url.includes('/opportunities/search')) return Response.json({ opportunities: [] });
    if (url.includes('/opportunities/')) return Response.json({ opportunity: { id: 'opp-1' } });
    if (url.includes('/contacts/ghl-contact-1/notes')) return Response.json({ note: { id: 'note-1' } });
    return Response.json({ ok: true });
  }) as typeof fetch;
  try {
    const result = await executeTool('book_gregory_followup', {
      caller_phone: '5551234567',
      caller_name: 'Mike Rivera',
      business_name: 'Mile High HVAC',
      interested: true,
      consent_confirmed: true,
      preferred_time_window: 'next available',
    }, liveGhlEnv(), {});

    assert.match(result.content, /GHL appointment booked for Gregory/);
    assert.ok(calls.some((url) => url.includes('/contacts/upsert')));
    assert.ok(calls.some((url) => url.includes('/calendars/events/appointments')));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

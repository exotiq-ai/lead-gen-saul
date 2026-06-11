import test from 'node:test';
import assert from 'node:assert/strict';
import type Anthropic from '@anthropic-ai/sdk';

import { demoOpeningLine, debriefOpeningLine, readCallState, resolveCallState, scanTranscriptForMode, writeCallState, type CallState } from './modes.ts';
import type { Env } from './types.ts';

function fakeKv(store: Map<string, string>): KVNamespace {
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => { store.set(key, value); },
  } as unknown as KVNamespace;
}

function msg(role: 'user' | 'assistant', content: string): Anthropic.MessageParam {
  return { role, content };
}

test('fresh transcript resolves to discovery (fail-open default)', () => {
  const state = scanTranscriptForMode([
    msg('assistant', 'Thanks for calling, this is Sawl with Gregory\'s phone-agent team. Who am I speaking with?'),
    msg('user', 'Hey, this is Mike from Mile High HVAC.'),
  ]);
  assert.equal(state.mode, 'discovery');
});

test('demo entry sentinel flips the scan to demo and recovers the business name', () => {
  const state = scanTranscriptForMode([
    msg('assistant', 'Want to hear how that would sound for your business?'),
    msg('user', 'Sure, I am ready.'),
    msg('assistant', 'Alright — new hat on. Thanks for calling Mile High HVAC, how can I help you today?'),
    msg('user', 'Yeah my AC died this morning.'),
  ]);
  assert.equal(state.mode, 'demo');
  assert.equal(state.facts?.business_name, 'Mile High HVAC');
});

test('exit sentinel after entry resolves to debrief', () => {
  const state = scanTranscriptForMode([
    msg('assistant', 'Alright — new hat on. Thanks for calling Mile High HVAC, how can I help you today?'),
    msg('user', 'My AC died.'),
    msg('assistant', 'Okay — Sawl hat back on. That was your agent answering. What stood out to you?'),
    msg('user', 'That was wild.'),
  ]);
  assert.equal(state.mode, 'debrief');
});

test('sentinels in USER speech never flip the mode', () => {
  const state = scanTranscriptForMode([
    msg('assistant', 'What kind of business do you run?'),
    msg('user', 'Someone told me you do a new hat on thing, and a hat back on thing?'),
  ]);
  assert.equal(state.mode, 'discovery');
});

test('opening lines carry their sentinels', () => {
  assert.match(demoOpeningLine({ business_name: 'Mile High HVAC' }).toLowerCase(), /new hat on/);
  assert.match(demoOpeningLine().toLowerCase(), /your business/);
  assert.match(debriefOpeningLine().toLowerCase(), /hat back on/);
});

test('KV state wins over transcript scan; absent KV fails open to scan', async () => {
  const store = new Map<string, string>();
  const env = { SAUL_CALL_STATE: fakeKv(store) } as unknown as Env;
  const demoState: CallState = { mode: 'demo', facts: { business_name: 'Mile High HVAC', business_type: 'HVAC', lead_id: 'lead-1' } };
  await writeCallState(env, 'call-1', demoState);
  assert.deepEqual(await readCallState(env, 'call-1'), demoState);

  const resolved = await resolveCallState(env, 'call-1', []);
  assert.equal(resolved.mode, 'demo');
  assert.equal(resolved.facts?.lead_id, 'lead-1');

  const noKvEnv = {} as unknown as Env;
  const fallback = await resolveCallState(noKvEnv, 'call-1', [
    msg('assistant', 'Alright — new hat on. Thanks for calling Mile High HVAC, how can I help?'),
  ]);
  assert.equal(fallback.mode, 'demo');
});

test('corrupt KV content fails open to the transcript scan', async () => {
  const store = new Map<string, string>([['call:call-1', '{not json']]);
  const env = { SAUL_CALL_STATE: fakeKv(store) } as unknown as Env;
  const resolved = await resolveCallState(env, 'call-1', []);
  assert.equal(resolved.mode, 'discovery');
});

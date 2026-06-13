import test from 'node:test';
import assert from 'node:assert/strict';
import type Anthropic from '@anthropic-ai/sdk';

import { runAgentLoop, type TurnRunner } from './agentLoop.ts';
import type { ClaudeTurnInput } from './claude.ts';
import type { Env } from './types.ts';

function fakeKv(store: Map<string, string>): KVNamespace {
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => { store.set(key, value); },
  } as unknown as KVNamespace;
}

function dryEnv(store?: Map<string, string>): Env {
  return {
    ANTHROPIC_API_KEY: 'test',
    SAUL_DRY_RUN: 'true',
    ...(store ? { SAUL_CALL_STATE: fakeKv(store) } : {}),
  } as unknown as Env;
}

function textMessage(text: string): Anthropic.Message {
  return { content: [{ type: 'text', text }] } as unknown as Anthropic.Message;
}

function toolMessage(text: string, name: string, input: Record<string, unknown>): Anthropic.Message {
  return {
    content: [
      { type: 'text', text },
      { type: 'tool_use', id: `tu_${name}`, name, input },
    ],
  } as unknown as Anthropic.Message;
}

function scriptedRunner(script: Anthropic.Message[], calls: ClaudeTurnInput[]): TurnRunner {
  return async (input) => {
    calls.push(input);
    const next = script.shift();
    if (!next) throw new Error('turn runner script exhausted');
    if (input.onText) {
      const text = (next.content as Array<{ type: string; text?: string }>)
        .filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
      if (text) input.onText(text);
    }
    return next;
  };
}

test('plain discovery turn returns spoken text and discovery state', async () => {
  const calls: ClaudeTurnInput[] = [];
  const result = await runAgentLoop({
    env: dryEnv(),
    state: { mode: 'discovery' },
    messages: [{ role: 'user', content: 'hi' }],
    maxTokens: 320,
    model: 'test-model',
    turnRunner: scriptedRunner([textMessage('Who am I speaking with?')], calls),
  });
  assert.equal(result.text, 'Who am I speaking with?');
  assert.equal(result.state.mode, 'discovery');
  assert.ok(calls[0].tools.some((t) => t.name === 'start_demo_roleplay'));
  assert.ok(calls[0].systemPrompt.includes('LIVE DEMO BRIDGE'));
});

test('start_demo_roleplay switches prompt and tools mid-loop and joins spoken text', async () => {
  const store = new Map<string, string>();
  const calls: ClaudeTurnInput[] = [];
  const result = await runAgentLoop({
    env: dryEnv(store),
    state: { mode: 'discovery' },
    messages: [{ role: 'user', content: 'Ready when you are.' }],
    maxTokens: 320,
    model: 'test-model',
    callId: 'call-1',
    turnRunner: scriptedRunner([
      toolMessage('Perfect, one second.', 'start_demo_roleplay', { business_name: 'Mile High HVAC', business_type: 'HVAC', pain_points: 'missed after-hours calls' }),
      textMessage('Alright — new hat on. Thanks for calling Mile High HVAC, how can I help you today?'),
    ], calls),
  });
  assert.equal(result.state.mode, 'demo');
  assert.match(result.text, /Perfect, one second\. Alright — new hat on\./);
  // Second turn must run with the DEMO hat: gated tools + demo persona prompt.
  assert.deepEqual(calls[1].tools.map((t) => t.name), ['end_demo_roleplay']);
  assert.ok(calls[1].systemPrompt.includes('Mile High HVAC'));
  assert.ok(calls[1].systemPrompt.includes('LIVE DEMO'));
  assert.ok(!calls[1].systemPrompt.includes('qualify_and_log_lead'));
  // Mode state persisted to KV for the next request.
  assert.match(store.get('call:call-1') ?? '', /"mode":"demo"/);
});

test('end_demo_roleplay switches back to debrief with facts preserved', async () => {
  const store = new Map<string, string>([
    ['call:call-1', JSON.stringify({ mode: 'demo', facts: { business_name: 'Mile High HVAC', caller_first_name: 'Mike' } })],
  ]);
  const calls: ClaudeTurnInput[] = [];
  const result = await runAgentLoop({
    env: dryEnv(store),
    state: { mode: 'demo', facts: { business_name: 'Mile High HVAC' } },
    messages: [{ role: 'user', content: 'please wrap the scene now' }],
    maxTokens: 320,
    model: 'test-model',
    callId: 'call-1',
    turnRunner: scriptedRunner([
      toolMessage('', 'end_demo_roleplay', { demo_outcome: 'caller_exited' }),
      textMessage('Okay — Sawl hat back on. That was your agent answering. What stood out to you?'),
    ], calls),
  });
  assert.equal(result.state.mode, 'debrief');
  assert.match(result.text, /hat back on/);
  assert.deepEqual(calls[1].tools.map((t) => t.name).sort(), ['answer_capability_question', 'book_gregory_followup', 'qualify_and_log_lead']);
  assert.ok(calls[1].systemPrompt.includes('DEBRIEF'));
  assert.match(store.get('call:call-1') ?? '', /"mode":"debrief"/);
  assert.match(store.get('call:call-1') ?? '', /Mike/);
});

test('end_demo without KV still preserves facts via the loop state', async () => {
  const calls: ClaudeTurnInput[] = [];
  const env = dryEnv(); // no SAUL_CALL_STATE binding at all
  const result = await runAgentLoop({
    env,
    state: { mode: 'discovery' },
    messages: [{ role: 'user', content: 'Ready when you are.' }],
    maxTokens: 320,
    model: 'test-model',
    callId: 'call-1',
    turnRunner: scriptedRunner([
      toolMessage('One sec.', 'start_demo_roleplay', { business_name: 'Mile High HVAC', business_type: 'HVAC' }),
      toolMessage('Alright — new hat on. Thanks for calling Mile High HVAC, how can I help you today?', 'end_demo_roleplay', { demo_outcome: 'caller_exited' }),
      textMessage('Okay — Sawl hat back on. That was your agent answering. What stood out to you?'),
    ], calls),
  });
  assert.equal(result.state.mode, 'debrief');
  assert.equal(result.state.facts?.business_name, 'Mile High HVAC');
  // Debrief prompt still grounded in the business despite no KV.
  assert.ok(calls[2].systemPrompt.includes('Mile High HVAC'));
});

test('discovery demo-ready confirmation deterministically starts demo before role-play can bleed', async () => {
  const executed: string[] = [];
  const result = await runAgentLoop({
    env: dryEnv(),
    state: { mode: 'discovery' },
    messages: [
      { role: 'user', content: 'I own Mile High HVAC here in Denver and miss after-hours calls.' },
      { role: 'assistant', content: 'Great. Put yourself in the shoes of one of your customers calling in. Just say something like my furnace died. Ready?' },
      { role: 'user', content: 'My furnace died and it is freezing. Can someone come out?' },
    ],
    maxTokens: 320,
    model: 'test-model',
    turnRunner: async () => { throw new Error('model should not be called for deterministic demo start'); },
    toolExecutor: async (name, input) => {
      executed.push(`${name}:${input.business_name}:${input.business_type}`);
      return { content: 'ok', state: { mode: 'demo', facts: { business_name: input.business_name as string, business_type: input.business_type as string } } };
    },
  });
  assert.deepEqual(executed, ['start_demo_roleplay:Mile High HVAC:HVAC']);
  assert.equal(result.state.mode, 'demo');
  assert.equal(result.text, 'Alright — new hat on. Thanks for calling Mile High HVAC, how can I help you today?');
});

test('demo mode deterministically exits when the caller breaks character', async () => {
  const executed: string[] = [];
  const result = await runAgentLoop({
    env: dryEnv(),
    state: { mode: 'demo', facts: { business_name: "Sam's Driveway Pros" } },
    messages: [{ role: 'user', content: 'Wait, is this the AI talking right now?' }],
    maxTokens: 320,
    model: 'test-model',
    turnRunner: async () => { throw new Error('model should not be called for deterministic demo exits'); },
    toolExecutor: async (name, input, _env, opts) => {
      executed.push(`${name}:${input.demo_outcome}`);
      return { content: 'ok', state: { mode: 'debrief', facts: opts.state?.facts } };
    },
  });
  assert.deepEqual(executed, ['end_demo_roleplay:caller_exited']);
  assert.equal(result.state.mode, 'debrief');
  assert.equal(result.state.facts?.business_name, "Sam's Driveway Pros");
  assert.equal(result.text, 'Okay — Sawl hat back on. That was your agent answering. What stood out to you?');
});

test('demo mode deterministically exits when the caller starts debriefing the experience', async () => {
  const executed: string[] = [];
  const result = await runAgentLoop({
    env: dryEnv(),
    state: { mode: 'demo', facts: { business_name: 'ABC Roofing Solutions' } },
    messages: [{ role: 'user', content: 'The conversation was good, and you captured my problem. You set an appointment and were very responsive.' }],
    maxTokens: 320,
    model: 'test-model',
    turnRunner: async () => { throw new Error('model should not be called for deterministic demo exits'); },
    toolExecutor: async (name, input, _env, opts) => {
      executed.push(`${name}:${input.demo_outcome}`);
      return { content: 'ok', state: { mode: 'debrief', facts: opts.state?.facts } };
    },
  });
  assert.deepEqual(executed, ['end_demo_roleplay:caller_exited']);
  assert.equal(result.state.mode, 'debrief');
  assert.equal(result.text, 'Okay — Sawl hat back on. That was your agent answering. What stood out to you?');
});

test('a hallucinated out-of-mode tool never executes (defense in depth)', async () => {
  const executed: string[] = [];
  const calls: ClaudeTurnInput[] = [];
  const result = await runAgentLoop({
    env: dryEnv(),
    state: { mode: 'demo', facts: { business_name: 'Mile High HVAC' } },
    messages: [{ role: 'user', content: 'book me for real please' }],
    maxTokens: 320,
    model: 'test-model',
    turnRunner: scriptedRunner([
      toolMessage('', 'book_gregory_followup', { caller_phone: '5551234567', interested: true, consent_confirmed: true, preferred_time_window: 'tomorrow' }),
      textMessage('You are all set — someone will confirm shortly.'),
    ], calls),
    toolExecutor: async (name) => {
      executed.push(name);
      return { content: 'should never run' };
    },
  });
  assert.deepEqual(executed, []);
  assert.equal(result.state.mode, 'demo');
  assert.equal(result.text, 'You are all set — someone will confirm shortly.');
});

test('streaming deltas across turns arrive separated', async () => {
  const deltas: string[] = [];
  await runAgentLoop({
    env: dryEnv(new Map()),
    state: { mode: 'discovery' },
    messages: [{ role: 'user', content: 'ready' }],
    maxTokens: 320,
    model: 'test-model',
    callId: 'call-1',
    onText: (d) => deltas.push(d),
    turnRunner: scriptedRunner([
      toolMessage('One sec.', 'start_demo_roleplay', { business_type: 'HVAC' }),
      textMessage('Alright — new hat on. Thanks for calling your business, how can I help you today?'),
    ], []),
  });
  const joined = deltas.join('');
  assert.match(joined, /One sec\. Alright — new hat on\./);
});

test('loop exhaustion appends the safe wrap-up after any streamed filler', async () => {
  const script: Anthropic.Message[] = Array.from({ length: 6 }, (_, i) =>
    toolMessage(i === 0 ? 'Got it, one second.' : '', 'answer_capability_question', { topic: 'pricing' }));
  const deltas: string[] = [];
  const result = await runAgentLoop({
    env: dryEnv(),
    state: { mode: 'discovery' },
    messages: [{ role: 'user', content: 'hi' }],
    maxTokens: 320,
    model: 'test-model',
    onText: (d) => deltas.push(d),
    turnRunner: scriptedRunner(script, []),
  });
  // The caller never ends on a dangling filler — streamed or not.
  assert.match(result.text, /Got it, one second\. I want to make sure this is handled cleanly\./);
  assert.match(deltas.join(''), /Got it, one second\. I want to make sure this is handled cleanly\./);
});

test('debrief close deterministically books before model can claim saved without tools', async () => {
  const executed: Array<{ name: string; input: Record<string, unknown> }> = [];
  const store = new Map<string, string>();
  const result = await runAgentLoop({
    env: dryEnv(store),
    state: { mode: 'debrief', facts: { business_name: 'Denver Green', business_type: 'dispensary' } },
    messages: [
      { role: 'user', content: 'Yeah, call me at 970-343-9634.' },
      { role: 'assistant', content: 'Great, and what time between 9 and 3 Mountain works best for you?' },
      { role: 'user', content: 'Whenever.' },
    ],
    maxTokens: 320,
    model: 'test-model',
    callId: 'call-save-1',
    turnRunner: async () => { throw new Error('model should not be called before deterministic save'); },
    toolExecutor: async (name, input) => {
      executed.push({ name, input });
      return { content: 'GHL appointment booked for Gregory at 2026-06-16T09:00:00-06:00.' };
    },
  });

  assert.equal(executed.length, 1);
  assert.equal(executed[0].name, 'book_gregory_followup');
  assert.match(String(executed[0].input.caller_phone), /^\+1\d{10}$/);
  assert.equal(executed[0].input.business_type, 'dispensary');
  assert.equal(executed[0].input.preferred_time_window, 'next available');
  assert.equal(result.state.followupLogged, true);
  assert.match(store.get('call:call-save-1') ?? '', /"followupLogged":true/);
  assert.match(result.text, /saved for Gregory/);
  assert.match(result.text, /look forward to working together/);
});

test('claimed booked response is repaired by running the follow-up tool', async () => {
  const executed: string[] = [];
  const result = await runAgentLoop({
    env: dryEnv(),
    state: { mode: 'discovery', facts: { business_name: 'Denver Green', business_type: 'dispensary' } },
    messages: [
      { role: 'user', content: 'Yeah, call me at 970-343-9634.' },
      { role: 'assistant', content: 'Great, and what time between 9 and 3 Mountain works best for you?' },
      { role: 'user', content: 'Whenever.' },
    ],
    maxTokens: 320,
    model: 'test-model',
    turnRunner: scriptedRunner([textMessage('You are all set, Gregory will call you Tuesday.')], []),
    toolExecutor: async (name) => {
      executed.push(name);
      return { content: 'Follow-up request logged for Gregory, but the calendar appointment was not created: dry run.' };
    },
  });

  assert.deepEqual(executed, ['book_gregory_followup']);
  assert.equal(result.text, 'Perfect, you are saved for Gregory. He has your details and preferred callback window. Thanks for calling AskSaul.ai, and we look forward to working together.');
});

test('post-close saved question gets reassurance instead of repeating the hard goodbye', async () => {
  const result = await runAgentLoop({
    env: dryEnv(),
    state: { mode: 'debrief', followupLogged: true, leadLogged: true, facts: { business_name: 'Homie Clinics' } },
    messages: [{ role: 'user', content: 'Are you sure you saved it?' }],
    maxTokens: 320,
    model: 'test-model',
    turnRunner: async () => { throw new Error('model should not be called after close'); },
  });
  assert.match(result.text, /Yes/);
  assert.match(result.text, /saved for Gregory/);
  assert.doesNotMatch(result.text, /Thanks again, goodbye/);
});

test('post-close abruptness concern gets a warm recovery', async () => {
  const result = await runAgentLoop({
    env: dryEnv(),
    state: { mode: 'debrief', followupLogged: true, leadLogged: true },
    messages: [{ role: 'user', content: 'Why are you ending so abruptly?' }],
    maxTokens: 320,
    model: 'test-model',
    turnRunner: async () => { throw new Error('model should not be called after close'); },
  });
  assert.match(result.text, /Fair point/i);
  assert.match(result.text, /anything else/i);
});

test('post-close goodbye gets one warm final signoff', async () => {
  const result = await runAgentLoop({
    env: dryEnv(),
    state: { mode: 'debrief', followupLogged: true, leadLogged: true },
    messages: [{ role: 'user', content: 'Okay goodbye. Hang up.' }],
    maxTokens: 320,
    model: 'test-model',
    turnRunner: async () => { throw new Error('model should not be called after close'); },
  });
  assert.match(result.text, /on behalf of the team at AskSaul\.ai/i);
  assert.match(result.text, /look forward to working together/i);
});

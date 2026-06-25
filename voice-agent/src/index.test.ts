import test from 'node:test';
import assert from 'node:assert/strict';

import worker from './index.ts';
import { isAllowedGregorySlot, selectGregorySlot, formatConfirmationText } from './scheduling.ts';

function ctx(): ExecutionContext {
  return { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
}

test('root POST is routed through authenticated Custom LLM handler', async () => {
  const res = await worker.fetch(
    new Request('https://example.com/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }] }),
    }),
    { ELEVENLABS_SHARED_SECRET: 'expected' } as any,
    ctx(),
  );

  assert.equal(res.status, 401);
  assert.equal(await res.text(), 'Unauthorized');
});

test('root GET still returns service metadata', async () => {
  const res = await worker.fetch(new Request('https://example.com/'), {} as any, ctx());
  assert.equal(res.status, 200);
  const body = await res.json() as { service: string; endpoints: string[] };
  assert.equal(body.service, 'saul-provider-phone-agent');
  assert.ok(body.endpoints.includes('/chat/completions'));
});


test('Gregory booking slots are constrained to Monday-Friday 9am-3pm MT', () => {
  assert.equal(isAllowedGregorySlot('2026-06-09T09:00:00-06:00'), true);
  assert.equal(isAllowedGregorySlot('2026-06-09T14:45:00-06:00'), true);
  assert.equal(isAllowedGregorySlot('2026-06-09T15:00:00-06:00'), false);
  assert.equal(isAllowedGregorySlot('2026-06-09T08:45:00-06:00'), false);
  assert.equal(isAllowedGregorySlot('2026-06-13T10:00:00-06:00'), false);
});

test('selectGregorySlot prefers exact requested allowed slot and filters GHL free slots', async () => {
  const selected = await selectGregorySlot({
    now: new Date('2026-06-08T12:00:00-06:00'),
    preference: { requestedStartIso: '2026-06-09T14:00:00-06:00', preferredWindow: 'tomorrow afternoon' },
    fetchFreeSlots: async () => [
      '2026-06-09T08:00:00-06:00',
      '2026-06-09T14:00:00-06:00',
      '2026-06-09T15:00:00-06:00',
    ],
  });
  assert.equal(selected.ok, true);
  if (selected.ok) {
    assert.equal(selected.startTime, '2026-06-09T14:00:00-06:00');
    assert.equal(selected.source, 'requested_exact_slot');
  }
});

test('confirmation text uses Mountain time wording', () => {
  const text = formatConfirmationText('2026-06-09T14:00:00-06:00');
  assert.match(text, /Gregory/);
  assert.match(text, /Mountain|MDT|MST/);
});

test('system prompt prevents demo roleplay from collecting real customer PII', async () => {
  const { buildSystemPrompt } = await import('./prompts.ts');
  const prompt = buildSystemPrompt('Saul');

  assert.match(prompt, /Demo mode must not collect, confirm, save, or book real role-play customer PII/i);
  assert.match(prompt, /this is where I would take your customer's full details/i);
  assert.match(prompt, /log them directly into your CRM/i);
});

test('system prompt contains demo exit, booking, filler, and final-close guardrails', async () => {
  const { buildSystemPrompt } = await import('./prompts.ts');
  const prompt = buildSystemPrompt('Saul');

  assert.match(prompt, /stepping out of demo mode/i);
  assert.match(prompt, /one filler/i);
  assert.match(prompt, /Only say "booked"/i);
  assert.match(prompt, /one short goodbye/i);
});

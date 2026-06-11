import test from 'node:test';
import assert from 'node:assert/strict';

import worker from './index.ts';
import { isAllowedGregorySlot, selectGregorySlot, formatConfirmationText } from './scheduling.ts';
import { funnelFromTranscript, verifyElevenLabsSignature } from './postCall.ts';

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


test('post-call webhook rejects unsigned requests when a secret is configured', async () => {
  const res = await worker.fetch(
    new Request('https://example.com/webhooks/elevenlabs-post-call', {
      method: 'POST',
      body: JSON.stringify({ type: 'post_call_transcription', data: { transcript: [] } }),
    }),
    { ELEVENLABS_POST_CALL_SECRET: 'secret' } as any,
    ctx(),
  );
  assert.equal(res.status, 401);
});

test('post-call webhook accepts requests when no secret is configured', async () => {
  const res = await worker.fetch(
    new Request('https://example.com/webhooks/elevenlabs-post-call', {
      method: 'POST',
      body: JSON.stringify({ type: 'post_call_transcription', data: { conversation_id: 'c1', transcript: [{ role: 'agent', message: 'hi' }] } }),
    }),
    { SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '' } as any,
    ctx(),
  );
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
});

test('post-call signature verification round-trips and rejects tampering', async () => {
  const secret = 'whsec_test';
  const body = JSON.stringify({ hello: 'world' });
  const t = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${body}`));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
  assert.equal(await verifyElevenLabsSignature(body, `t=${t},v0=${hex}`, secret), true);
  assert.equal(await verifyElevenLabsSignature(body + 'x', `t=${t},v0=${hex}`, secret), false);
  assert.equal(await verifyElevenLabsSignature(body, `t=${t - 99999},v0=${hex}`, secret), false);
  assert.equal(await verifyElevenLabsSignature(body, null, secret), false);
});

test('funnel flags are recovered from the post-call transcript sentinels', () => {
  const funnel = funnelFromTranscript([
    { role: 'agent', message: 'Want to hear how that would sound for your business?' },
    { role: 'user', message: 'Sure.' },
    { role: 'agent', message: 'Alright — new hat on. Thanks for calling Mile High HVAC, how can I help you today?' },
    { role: 'user', message: 'My AC died.' },
    { role: 'agent', message: 'Okay — Sawl hat back on. That was your agent answering. What stood out to you?' },
  ]);
  assert.deepEqual(funnel, { demo_offered: true, demo_started: true, demo_completed: true });

  const noDemo = funnelFromTranscript([
    { role: 'agent', message: 'Thanks for calling, who am I speaking with?' },
    { role: 'user', message: 'Mike.' },
  ]);
  assert.deepEqual(noDemo, { demo_offered: false, demo_started: false, demo_completed: false });
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

import test from 'node:test';
import assert from 'node:assert/strict';

import { sendInboundLeadEmailFollowup } from './emailFollowup.ts';
import type { Env } from './types.ts';

test('email follow-up skips when GHL notes already show a sent inbound email', async () => {
  const calls: Array<{ url: string; method: string }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ url, method });
    if (url.endsWith('/contacts/contact_1/notes') && method === 'GET') {
      return new Response(JSON.stringify({
        notes: [{ body: 'Ask Saul inbound email follow-up sent.\nReason: lead_logged' }],
      }), { status: 200 });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  }) as typeof fetch;

  try {
    const result = await sendInboundLeadEmailFollowup({
      input: {
        caller_email: 'sam@example.com',
        caller_phone: '+13335659454',
        caller_name: 'Sam Sandifer',
        business_name: 'Mechanic AI Software',
        interested: true,
      },
      contactId: 'contact_1',
      cfg: { apiKey: 'pit-test', locationId: 'loc-test', version: '2021-07-28' },
      env: {} as Env,
      reason: 'lead_logged',
      existingTags: [],
    });
    assert.equal(result.skipped, true);
    assert.match(result.skippedReason ?? '', /already sent/i);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'GET');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

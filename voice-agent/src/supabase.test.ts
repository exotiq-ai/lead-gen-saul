import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLeadRow, normalizePhone, splitName } from './supabase.ts';

test('normalizes US phones', () => {
  assert.equal(normalizePhone('(303) 555-1212'), '+13035551212');
  assert.equal(normalizePhone('13035551212'), '+13035551212');
});

test('splits names and builds a qualified lead row for Ask Saul tenant', () => {
  const cfg = { url: 'https://example.supabase.co', serviceKey: 'secret', tenantId: '22222222-2222-2222-2222-222222222222' };
  const input = {
    caller_name: 'Maria Lopez',
    caller_phone: '3035551212',
    business_name: 'Lopez Garage Doors',
    business_type: 'garage doors',
    city_state: 'Denver, CO',
    current_call_handling: 'Owner cell after hours',
    pain_points: 'Missed calls',
    interested: true,
    interest_level: 'hot' as const,
    notes: 'Needs FAQ answering and GHL logging',
  };
  assert.deepEqual(splitName(input), { first: 'Maria', last: 'Lopez' });
  const row = buildLeadRow(input, cfg);
  assert.equal(row.tenant_id, cfg.tenantId);
  assert.equal(row.first_name, 'Maria');
  assert.equal(row.last_name, 'Lopez');
  assert.equal(row.phone, '+13035551212');
  assert.equal(row.status, 'qualified');
  assert.equal(row.assigned_to, 'gregory');
  assert.equal(row.source, 'saul_phone_agent_inbound');
  assert.equal(row.score, 100);
  assert.equal(row.score_breakdown.persona, 'service_provider_phone_agent_prospect');
});

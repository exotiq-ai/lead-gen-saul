import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSystemPrompt } from './prompts.ts';

test('provider phone agent prompt anchors goals and booking flow', () => {
  const prompt = buildSystemPrompt('Saul');
  assert.match(prompt, /This is Sawl, an AI agent built by the team at AskSaul\.ai/i);
  assert.match(prompt, /stop revenue from leaking/i);
  assert.match(prompt, /service providers and business owners/);
  assert.match(prompt, /qualify whether they are interested/i);
  assert.match(prompt, /book a follow-up request with Gregory/i);
  assert.match(prompt, /Always ask and use the caller's name/i);
  assert.match(prompt, /Never promise exact pricing, ballpark ranges/);
  assert.match(prompt, /do not quote a range/);
  assert.match(prompt, /qualify_and_log_lead, book_gregory_followup/);
  assert.match(prompt, /Sawl/);
});

test('discovery prompt carries the demo bridge with consent and rescue scripts', () => {
  const prompt = buildSystemPrompt('Saul', { mode: 'discovery' });
  assert.match(prompt, /LIVE DEMO BRIDGE/);
  assert.match(prompt, /start_demo_roleplay/);
  // The offer question is scripted verbatim so the post-call funnel flag
  // (demo_offered, scanned as "hear how that would sound") stays reliable.
  assert.match(prompt, /"Want to hear how that would sound for your business\?"/);
  assert.match(prompt, /Put yourself in the shoes of one of your customers/);
  assert.match(prompt, /Do NOT call start_demo_roleplay in that same response/);
  assert.match(prompt, /If they decline the demo, do not push/);
  assert.match(prompt, /EXACTLY the opening line the tool result gives you/);
});

test('demo prompt is the other hat: in character, gated, illustrative only', () => {
  const prompt = buildSystemPrompt('Saul', {
    mode: 'demo',
    facts: { business_name: 'Mile High HVAC', business_type: 'HVAC', city_state: 'Denver, CO', pain_points: 'missed after-hours calls' },
  });
  assert.match(prompt, /phone agent for Mile High HVAC/);
  assert.match(prompt, /Denver, CO/);
  assert.match(prompt, /missed after-hours calls/);
  assert.match(prompt, /three to five exchanges/);
  assert.match(prompt, /quote no real prices/);
  assert.match(prompt, /do not collect real customer names, phone numbers, emails, addresses, or appointment details/i);
  assert.match(prompt, /Here's where I would take your customer's information/i);
  assert.doesNotMatch(prompt, /get the caller's name/i);
  assert.doesNotMatch(prompt, /what's the best number/i);
  assert.match(prompt, /After your wrap line, you MUST call end_demo_roleplay/);
  assert.match(prompt, /Do not answer the caller's out-of-character question/);
  // The demo hat never sees the sales persona or the real tools.
  assert.ok(!prompt.includes('qualify_and_log_lead'));
  assert.ok(!prompt.includes('book_gregory_followup'));
  assert.ok(!prompt.includes('LIVE DEMO BRIDGE'));
});

test('demo prompt tolerates missing facts', () => {
  const prompt = buildSystemPrompt('Saul', { mode: 'demo' });
  assert.match(prompt, /the caller's business/);
});

test('debrief prompt closes once per technique and books Gregory', () => {
  const prompt = buildSystemPrompt('Saul', {
    mode: 'debrief',
    facts: { business_name: 'Mile High HVAC', caller_first_name: 'Mike' },
  });
  assert.match(prompt, /Is there any reason an agent like this wouldn't work for your business\?/);
  assert.match(prompt, /exactly once/);
  assert.match(prompt, /your agent", never "our product/);
  assert.match(prompt, /completed a live demo/);
  assert.match(prompt, /FOLLOW-UP BOOKING/);
  assert.match(prompt, /Mike/);
  assert.ok(!prompt.includes('start_demo_roleplay'));
});

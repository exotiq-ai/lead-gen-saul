import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSystemPrompt } from './prompts.ts';

test('provider phone agent prompt anchors goals and booking flow', () => {
  const prompt = buildSystemPrompt('Saul');
  assert.match(prompt, /service providers and business owners/);
  assert.match(prompt, /qualify whether they are interested/i);
  assert.match(prompt, /book a follow-up request with Gregory/i);
  assert.match(prompt, /Always ask and use the caller's name/i);
  assert.match(prompt, /qualify_and_log_lead, book_gregory_followup/);
  assert.match(prompt, /Sawl/);
});

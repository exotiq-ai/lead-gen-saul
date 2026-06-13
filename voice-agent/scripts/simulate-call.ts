/**
 * LLM caller simulator for the Saul demo-mode worker.
 *
 * Drives a full simulated phone call against the worker handler in-process:
 * a persona LLM plays the service-provider caller, the worker plays Saul.
 * All side effects run in dry-run mode (no GHL/SMS/Telegram writes),
 * so the only network calls are to the Anthropic API.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... npm run simulate                  # all scenarios
 *   ANTHROPIC_API_KEY=sk-... npm run simulate clean-funnel     # one scenario
 *
 * Transcripts are written to test/simulated-calls/<scenario>.md for review.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';

import worker from '../src/index.ts';
import { scanTranscriptForMode } from '../src/modes.ts';
import type { Env, OAIMessage } from '../src/types.ts';

const MAX_CALLER_TURNS = 18;
const PERSONA_MODEL = process.env.SIM_PERSONA_MODEL ?? 'claude-haiku-4-5';
const SAUL_MODEL = process.env.SIM_SAUL_MODEL ?? 'claude-sonnet-4-6';
const FIRST_MESSAGE = "Thanks for calling, this is Sawl with Gregory's phone-agent team. Who am I speaking with?";

interface Scenario {
  name: string;
  persona: string;
}

const SCENARIOS: Scenario[] = [
  {
    name: 'clean-funnel',
    persona: `You are Mike Rivera, owner of Mile High HVAC in Denver, Colorado.
You miss after-hours calls constantly and it costs you jobs. You are friendly and curious about AI phone agents.
When offered a live demo, accept enthusiastically and play along as a customer with a dead furnace at 9pm. During the role-play, do not ask about price or cost; focus on urgency, address, contact details, and whether help is available.
After the demo, you are impressed. Share your number 720-555-0142 and email mike@milehighhvac.com when asked.
Agree to a follow-up call with Gregory tomorrow morning. Once Saul says the preferred window is saved or you are all set, say thanks and hang up.`,
  },
  {
    name: 'demo-refusal',
    persona: `You are Dana, skeptical owner of a garage door company in Phoenix.
You answer questions briefly and guardedly. When offered a live demo, decline it — say you just want pricing.
Push on price twice. If the agent handles it well, reluctantly give your number 602-555-0177 but stay noncommittal about a follow-up.`,
  },
  {
    name: 'mid-demo-derail',
    persona: `You are Sam, owner of a driveway paving business in Austin.
You called Ask Saul because your paving business misses too many lead calls while crews are on job sites; do not ask for an actual driveway repair during discovery.
When offered a live demo, accept clearly and start playing one of your customers asking about a cracked driveway. During the in-character demo, ask only for availability and quote scheduling, not price or cost.
After two exchanges in the demo, break character abruptly: ask "wait, is this the AI talking right now?" and stop playing along.
See how the agent recovers. If it recovers gracefully, answer one more qualifying question, then say you have to run.`,
  },
];

async function simulate(scenario: Scenario): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is required to run the simulator.');
  const personaClient = new Anthropic({ apiKey });
  const kv = new Map<string, string>();
  const pending: Promise<unknown>[] = [];
  const env = {
    ANTHROPIC_API_KEY: apiKey,
    PRIMARY_MODEL: SAUL_MODEL,
    SAUL_DRY_RUN: 'true',
    SAUL_SOURCE_TAG: 'saul_phone_agent_simulator',
    SAUL_CALL_STATE: {
      get: async (key: string) => kv.get(key) ?? null,
      put: async (key: string, value: string) => { kv.set(key, value); },
    } as unknown as KVNamespace,
  } as unknown as Env;
  const ctx = {
    waitUntil: (p: Promise<unknown>) => { pending.push(p.catch(() => undefined)); },
    passThroughOnException: () => {},
  } as unknown as ExecutionContext;

  const callId = `sim-${scenario.name}-${Date.now()}`;
  const history: OAIMessage[] = [{ role: 'assistant', content: FIRST_MESSAGE }];
  const lines: string[] = [
    `# Simulated call: ${scenario.name}`,
    '',
    `- Saul model: ${SAUL_MODEL}`,
    `- Persona model: ${PERSONA_MODEL}`,
    `- Date: ${new Date().toISOString()}`,
    '',
    `**[discovery] Saul:** ${FIRST_MESSAGE}`,
  ];
  console.log(`\n=== ${scenario.name} ===`);
  console.log(`[discovery] Saul: ${FIRST_MESSAGE}`);

  for (let turn = 0; turn < MAX_CALLER_TURNS; turn++) {
    const personaResp = await personaClient.messages.create({
      model: PERSONA_MODEL,
      max_tokens: 120,
      system: `${scenario.persona}
You are on a phone call. Reply with ONLY your next spoken line as the caller, under thirty words, no quotes, no stage directions. If you are done with the call, reply with exactly HANGUP.`,
      messages: history.map((m) => ({
        role: m.role === 'assistant' ? ('user' as const) : ('assistant' as const),
        content: typeof m.content === 'string' ? m.content : '',
      })),
    });
    const callerLine = personaResp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text).join('').trim();
    if (!callerLine || callerLine.toUpperCase().includes('HANGUP')) {
      lines.push('', '**Caller hung up.**');
      console.log('Caller hung up.');
      break;
    }
    history.push({ role: 'user', content: callerLine });
    lines.push(`**Caller:** ${callerLine}`);
    console.log(`Caller: ${callerLine}`);

    const res = await worker.fetch(
      new Request('https://sim.local/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-call-id': callId },
        body: JSON.stringify({ messages: history, max_tokens: 320 }),
      }),
      env,
      ctx,
    );
    if (res.status !== 200) throw new Error(`worker returned ${res.status}: ${await res.text()}`);
    const data = await res.json() as { choices: Array<{ message: { content: string } }> };
    const saulLine = data.choices[0]?.message?.content ?? '';
    history.push({ role: 'assistant', content: saulLine });
    const mode = scanTranscriptForMode(
      history.filter((m) => typeof m.content === 'string')
        .map((m) => ({ role: m.role === 'assistant' ? 'assistant' as const : 'user' as const, content: m.content as string })),
    ).mode;
    lines.push(`**[${mode}] Saul:** ${saulLine}`);
    console.log(`[${mode}] Saul: ${saulLine}`);
  }

  await Promise.all(pending);
  lines.push('', `## Final KV state`, '```json', JSON.stringify(Object.fromEntries(kv), null, 2), '```', '');
  return lines.join('\n');
}

async function main(): Promise<void> {
  const filter = process.argv[2];
  const scenarios = filter ? SCENARIOS.filter((s) => s.name === filter) : SCENARIOS;
  if (!scenarios.length) {
    console.error(`Unknown scenario "${filter}". Available: ${SCENARIOS.map((s) => s.name).join(', ')}`);
    process.exit(1);
  }
  const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'simulated-calls');
  mkdirSync(outDir, { recursive: true });
  for (const scenario of scenarios) {
    const transcript = await simulate(scenario);
    const outPath = join(outDir, `${scenario.name}.md`);
    writeFileSync(outPath, transcript);
    console.log(`\nTranscript written to ${outPath}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

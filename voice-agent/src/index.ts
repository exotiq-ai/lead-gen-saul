import Anthropic from '@anthropic-ai/sdk';
import { runClaudeTurn, textFromMessage, toolUsesFromMessage } from './claude.ts';
import { buildSystemPrompt } from './prompts.ts';
import { executeTool } from './tools.ts';
import { logCallSession } from './supabase.ts';
import type { Env, OAIChatRequest, OAIMessage } from './types.ts';

const MAX_TOOL_TURNS = 6;

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/health') return Response.json({ ok: true, service: 'saul-provider-phone-agent' });
    if (url.pathname === '/' && req.method === 'GET') {
      return Response.json({ service: 'saul-provider-phone-agent', endpoints: ['/chat/completions', '/health'] });
    }
    if (url.pathname.endsWith('/chat/completions') && req.method === 'POST') return handleChat(req, env, ctx);
    return new Response('Not found', { status: 404 });
  },
};

async function handleChat(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (env.ELEVENLABS_SHARED_SECRET) {
    const expected = `Bearer ${env.ELEVENLABS_SHARED_SECRET}`;
    if ((req.headers.get('authorization') ?? '') !== expected) return new Response('Unauthorized', { status: 401 });
  }
  let body: OAIChatRequest;
  try { body = (await req.json()) as OAIChatRequest; } catch { return new Response('Bad JSON', { status: 400 }); }
  const messages = toAnthropicMessages(body.messages ?? []);
  if (!messages.length) return Response.json({ error: { message: 'No user messages in request.' } }, { status: 400 });

  const callId = resolveString(req.headers.get('x-call-id'))
    ?? resolveString(body.dynamic_variables?.call_id)
    ?? resolveString(body.metadata?.call_id)
    ?? crypto.randomUUID();
  const systemPrompt = buildSystemPrompt('Saul');
  const model = env.PRIMARY_MODEL ?? 'claude-3-5-haiku-20241022';
  let finalText: string;
  try {
    finalText = await runAgentLoop({ env, systemPrompt, messages, maxTokens: body.max_tokens ?? 320, model });
  } catch (err) {
    console.error('agentLoopError', err instanceof Error ? err.message : String(err));
    finalText = 'Sorry, I hit a snag on my side. I can still take your name and number so Gregory can follow up.';
  }
  ctx.waitUntil(logCallSession({ call_id: callId, last_user_text: lastUserText(messages) }, {
    url: env.SUPABASE_URL,
    serviceKey: env.SUPABASE_SERVICE_ROLE_KEY,
    tenantId: env.DEFAULT_TENANT_ID ?? '22222222-2222-2222-2222-222222222222',
  }));
  return body.stream === true ? streamingResponse(finalText, model) : jsonResponse(finalText, model);
}

async function runAgentLoop(args: { env: Env; systemPrompt: string; messages: Anthropic.MessageParam[]; maxTokens: number; model: string }): Promise<string> {
  let messages = [...args.messages];
  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    const resp = await runClaudeTurn({ apiKey: args.env.ANTHROPIC_API_KEY, model: args.model, systemPrompt: args.systemPrompt, messages, maxTokens: args.maxTokens });
    const toolUses = toolUsesFromMessage(resp);
    if (!toolUses.length) return textFromMessage(resp) || 'One moment.';
    messages = [
      ...messages,
      { role: 'assistant', content: resp.content },
      {
        role: 'user',
        content: await Promise.all(toolUses.map(async (tu) => ({
          type: 'tool_result' as const,
          tool_use_id: tu.id,
          content: await executeTool(tu.name, tu.input as Record<string, unknown>, args.env),
        }))),
      },
    ];
  }
  return 'I want to make sure this is handled cleanly. Let me get Gregory your details for follow-up.';
}

function toAnthropicMessages(messages: OAIMessage[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (const m of messages) {
    if (m.role === 'system' || m.role === 'tool') continue;
    const text = extractText(m.content);
    if (!text.trim()) continue;
    out.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: stripRouteBlock(text) });
  }
  return out;
}

function extractText(content: OAIMessage['content']): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  return content.map((p) => p.text ?? '').join('\n');
}

function stripRouteBlock(text: string): string {
  return text.replace(/^ROUTE\b.*$/gim, '').trim() || text;
}

function lastUserText(messages: Anthropic.MessageParam[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role !== 'user') continue;
    const c = messages[i].content;
    return typeof c === 'string' ? c : JSON.stringify(c).slice(0, 500);
  }
  return undefined;
}

function resolveString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function jsonResponse(text: string, model: string): Response {
  return Response.json({
    id: `chatcmpl_${crypto.randomUUID()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  });
}

function streamingResponse(text: string, model: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ id: `chatcmpl_${crypto.randomUUID()}`, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model, choices: [{ index: 0, delta: { role: 'assistant', content: text }, finish_reason: null }] })}\n\n`));
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' } });
}

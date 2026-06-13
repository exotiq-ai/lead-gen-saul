import Anthropic from '@anthropic-ai/sdk';
import { runAgentLoop } from './agentLoop.ts';
import { resolveCallState } from './modes.ts';
import { handlePostCall } from './postCall.ts';
import type { Env, OAIChatRequest, OAIMessage } from './types.ts';

const SNAG_FALLBACK = 'Sorry, I hit a snag on my side. I can still take your name and number so Gregory can follow up.';

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/health') return Response.json({ ok: true, service: 'saul-provider-phone-agent' });
    if (url.pathname === '/' && req.method === 'GET') {
      return Response.json({ service: 'saul-provider-phone-agent', endpoints: ['/chat/completions', '/webhooks/elevenlabs-post-call', '/health'] });
    }
    if (url.pathname === '/webhooks/elevenlabs-post-call' && req.method === 'POST') return handlePostCall(req, env, ctx);
    // ElevenLabs Custom LLM readback currently stores the Worker origin as the URL.
    // Accept authenticated root POSTs as a compatibility shim while keeping
    // /chat/completions as the canonical endpoint.
    if ((url.pathname === '/' || url.pathname.endsWith('/chat/completions')) && req.method === 'POST') return handleChat(req, env, ctx);
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

  const callId = resolveCallId(req, body) ?? crypto.randomUUID();
  const state = await resolveCallState(env, callId, messages);
  const model = env.PRIMARY_MODEL ?? 'claude-sonnet-4-6';
  const maxTokens = body.max_tokens ?? 320;

  const logSession = (_mode: string) => undefined;

  if (body.stream === true) {
    return streamingAgentResponse({ env, state, messages, maxTokens, model, callId, callerPhone: resolveCallerPhone(body) }, logSession);
  }

  try {
    const result = await runAgentLoop({ env, state, messages, maxTokens, model, callId, callerPhone: resolveCallerPhone(body) });
    logSession(result.state.mode);
    return jsonResponse(result.text, model);
  } catch (err) {
    console.error('agentLoopError', err instanceof Error ? err.message : String(err));
    logSession(state.mode);
    return jsonResponse(SNAG_FALLBACK, model);
  }
}

function streamingAgentResponse(
  args: { env: Env; state: Parameters<typeof runAgentLoop>[0]['state']; messages: Anthropic.MessageParam[]; maxTokens: number; model: string; callId: string; callerPhone?: string },
  logSession: (mode: string) => void,
): Response {
  const encoder = new TextEncoder();
  const id = `chatcmpl_${crypto.randomUUID()}`;
  const created = Math.floor(Date.now() / 1000);
  const stream = new ReadableStream({
    async start(controller) {
      const send = (delta: Record<string, unknown>, finish: string | null = null) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          id, object: 'chat.completion.chunk', created, model: args.model,
          choices: [{ index: 0, delta, finish_reason: finish }],
        })}\n\n`));
      };
      try {
        send({ role: 'assistant' });
        let emitted = false;
        const result = await runAgentLoop({
          ...args,
          onText: (delta) => { emitted = true; send({ content: delta }); },
        });
        if (!emitted && result.text) send({ content: result.text });
        logSession(result.state.mode);
      } catch (err) {
        console.error('agentLoopError', err instanceof Error ? err.message : String(err));
        logSession(args.state.mode);
        // The consumer may already be gone; never let the fallback write
        // double-fault and swallow the session log above.
        try { send({ content: SNAG_FALLBACK }); } catch { /* consumer gone */ }
      }
      try {
        send({}, 'stop');
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch { /* consumer gone mid-stream */ }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' } });
}

// ElevenLabs sends a stable conversation id inside elevenlabs_extra_body when
// "Custom LLM extra body" is enabled on the agent; older shapes and the
// simulator use headers/metadata. Stable ids make KV the primary mode store.
export function resolveCallId(req: Request, body: OAIChatRequest): string | undefined {
  const extra = (body as { elevenlabs_extra_body?: Record<string, unknown> }).elevenlabs_extra_body;
  return resolveString(req.headers.get('x-call-id'))
    ?? resolveString(extra?.conversation_id)
    ?? resolveString(extra?.call_id)
    ?? resolveString(body.extra_body?.conversation_id)
    ?? resolveString(body.extra_body?.call_id)
    ?? resolveString(body.dynamic_variables?.call_id)
    ?? resolveString(body.dynamic_variables?.conversation_id)
    ?? resolveString(body.dynamic_variables?.system__conversation_id)
    ?? resolveString(body.metadata?.call_id)
    ?? resolveString(body.metadata?.conversation_id);
}

export function resolveCallerPhone(body: OAIChatRequest): string | undefined {
  const extra = (body as { elevenlabs_extra_body?: Record<string, unknown> }).elevenlabs_extra_body;
  return resolveString(extra?.caller_id)
    ?? resolveString(extra?.system__caller_id)
    ?? resolveString(body.dynamic_variables?.caller_id)
    ?? resolveString(body.dynamic_variables?.system__caller_id)
    ?? resolveString(body.metadata?.caller_id);
}

export function toAnthropicMessages(messages: OAIMessage[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (const m of messages) {
    if (m.role === 'system' || m.role === 'tool') continue;
    const text = extractText(m.content);
    if (!text.trim()) continue;
    out.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: stripRouteBlock(text) });
  }
  // Sonnet 4.6 rejects requests whose final message is an assistant turn
  // (prefill removal). ElevenLabs can resend a transcript ending mid-agent-turn
  // after an interruption; drop the trailing assistant text so the model
  // regenerates instead of the whole call hitting the snag fallback.
  while (out.length && out[out.length - 1].role === 'assistant') out.pop();
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

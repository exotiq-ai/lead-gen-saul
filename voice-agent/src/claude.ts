import Anthropic from '@anthropic-ai/sdk';
import type { ToolSchemaDef } from './tools.ts';

export interface ClaudeTurnInput {
  apiKey: string;
  model: string;
  systemPrompt: string;
  messages: Anthropic.MessageParam[];
  tools: ToolSchemaDef[];
  maxTokens?: number;
  /** When provided, text deltas stream here as they arrive (true token streaming). */
  onText?: (delta: string) => void;
}

export async function runClaudeTurn(input: ClaudeTurnInput): Promise<Anthropic.Message> {
  const client = new Anthropic({ apiKey: input.apiKey });
  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model: input.model,
    max_tokens: input.maxTokens ?? 320,
    system: [{ type: 'text', text: input.systemPrompt, cache_control: { type: 'ephemeral' } }],
    tools: input.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema as Anthropic.Tool.InputSchema,
    })),
    messages: input.messages,
    stop_sequences: ['<end_turn>'],
  };
  if (!input.onText) return await client.messages.create(params);
  const stream = client.messages.stream(params);
  stream.on('text', (delta) => input.onText?.(delta));
  return await stream.finalMessage();
}

export function textFromMessage(msg: Anthropic.Message): string {
  return msg.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('').trim();
}

export function toolUsesFromMessage(msg: Anthropic.Message): Anthropic.ToolUseBlock[] {
  return msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
}

export { Anthropic };

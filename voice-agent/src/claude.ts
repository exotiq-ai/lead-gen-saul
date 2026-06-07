import Anthropic from '@anthropic-ai/sdk';
import { toolSchemas } from './tools.ts';

export async function runClaudeTurn(input: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  messages: Anthropic.MessageParam[];
  maxTokens?: number;
}): Promise<Anthropic.Message> {
  const client = new Anthropic({ apiKey: input.apiKey });
  return await client.messages.create({
    model: input.model,
    max_tokens: input.maxTokens ?? 320,
    system: [{ type: 'text', text: input.systemPrompt, cache_control: { type: 'ephemeral' } }],
    tools: toolSchemas.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema as Anthropic.Tool.InputSchema,
    })),
    messages: input.messages,
    stop_sequences: ['<end_turn>'],
  });
}

export function textFromMessage(msg: Anthropic.Message): string {
  return msg.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('').trim();
}

export function toolUsesFromMessage(msg: Anthropic.Message): Anthropic.ToolUseBlock[] {
  return msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
}

export { Anthropic };

import Anthropic from '@anthropic-ai/sdk'
import type { RawQueryResult } from '@/lib/types'

const MODEL = 'claude-sonnet-4-5-20250929'

export async function queryClaude(
  promptText: string,
  promptId: string
): Promise<RawQueryResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const start = Date.now()

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: 'You are a helpful assistant. Answer questions directly and factually.',
    messages: [
      { role: 'user', content: promptText },
    ],
  })

  const latency_ms = Date.now() - start

  const content = message.content
    .filter((block) => block.type === 'text')
    .map((block) => (block as Anthropic.TextBlock).text)
    .join('\n')

  if (!content) {
    throw new Error(`Claude returned no content for prompt ${promptId}`)
  }

  return {
    platform: 'claude',
    prompt_id: promptId,
    raw_response: content,
    model_used: message.model ?? MODEL,
    tokens_used: (message.usage?.input_tokens ?? 0) + (message.usage?.output_tokens ?? 0),
    latency_ms,
  }
}

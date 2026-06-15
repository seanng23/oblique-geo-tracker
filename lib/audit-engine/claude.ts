import Anthropic from '@anthropic-ai/sdk'
import type { RawQueryResult } from '@/lib/types'

const MODEL = 'claude-sonnet-4-5-20250929'

// Web-grounded query: Claude answers using its native web_search server tool,
// so we measure live AI-search visibility (what Claude actually retrieves and
// cites today), not training-data recall.
export async function queryClaude(
  promptText: string,
  promptId: string
): Promise<RawQueryResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const start = Date.now()

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: 'You are a helpful assistant. Answer the question directly and factually. If the question names a country or city, answer for that location.',
    messages: [{ role: 'user', content: promptText }],
    tools: [
      {
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 3,
      } as any,
    ],
  })

  const latency_ms = Date.now() - start

  const textBlocks = message.content.filter((b: any) => b.type === 'text') as any[]
  const content = textBlocks.map((b) => b.text).join('\n')

  if (!content) {
    throw new Error(`Claude returned no content for prompt ${promptId}`)
  }

  // Real retrieval citations attached to the answer text
  const citations = new Set<string>()
  for (const block of textBlocks) {
    for (const c of block.citations ?? []) {
      if (c?.url) citations.add(c.url)
    }
  }
  // Also collect URLs from search result blocks (pages Claude looked at)
  for (const block of message.content as any[]) {
    if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
      for (const r of block.content) {
        if (r?.url) citations.add(r.url)
      }
    }
  }

  return {
    platform: 'claude',
    prompt_id: promptId,
    raw_response: content,
    model_used: message.model ?? MODEL,
    tokens_used: (message.usage?.input_tokens ?? 0) + (message.usage?.output_tokens ?? 0),
    latency_ms,
    citations: Array.from(citations),
  }
}

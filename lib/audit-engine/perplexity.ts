import type { RawQueryResult } from '@/lib/types'

// Perplexity uses an OpenAI-compatible chat API
const PERPLEXITY_BASE_URL = 'https://api.perplexity.ai'
const MODEL = 'llama-3.1-sonar-large-128k-online'

export async function queryPerplexity(
  promptText: string,
  promptId: string
): Promise<RawQueryResult> {
  const start = Date.now()

  const response = await fetch(`${PERPLEXITY_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant. Answer questions directly and factually.',
        },
        { role: 'user', content: promptText },
      ],
      temperature: 0.3,
      max_tokens: 1024,
      // Perplexity's online model can search the web — this is intentional,
      // as we want to measure real-world AI search visibility, not cached knowledge.
      search_recency_filter: 'month',
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Perplexity API error ${response.status}: ${body}`)
  }

  const latency_ms = Date.now() - start
  const data = await response.json()

  const content = data.choices?.[0]?.message?.content
  if (!content) {
    throw new Error(`Perplexity returned no content for prompt ${promptId}`)
  }

  return {
    platform: 'claude',
    prompt_id: promptId,
    raw_response: content,
    model_used: data.model ?? MODEL,
    tokens_used: data.usage?.total_tokens ?? 0,
    latency_ms,
  }
}

import OpenAI from 'openai'
import type { RawQueryResult } from '@/lib/types'

const MODEL = 'gpt-4o'

// Web-grounded query: ChatGPT answers via the Responses API with the
// web_search tool enabled — measuring live AI-search visibility (what
// ChatGPT retrieves and cites), not training-data recall.
export async function queryChatGPT(
  promptText: string,
  promptId: string
): Promise<RawQueryResult> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const start = Date.now()

  const response: any = await (openai as any).responses.create({
    model: MODEL,
    tools: [{ type: 'web_search' }],
    instructions:
      'You are a helpful assistant. Answer the question directly and factually. If the question names a country or city, answer for that location.',
    input: promptText,
  })

  const latency_ms = Date.now() - start

  // output_text is the SDK convenience aggregation of all text output
  const content: string =
    response.output_text ??
    (response.output ?? [])
      .filter((item: any) => item.type === 'message')
      .flatMap((item: any) => item.content ?? [])
      .filter((c: any) => c.type === 'output_text')
      .map((c: any) => c.text)
      .join('\n')

  if (!content) {
    throw new Error(`ChatGPT returned no content for prompt ${promptId}`)
  }

  // url_citation annotations are the pages ChatGPT actually cited
  const citations = new Set<string>()
  for (const item of response.output ?? []) {
    if (item.type !== 'message') continue
    for (const c of item.content ?? []) {
      for (const a of c.annotations ?? []) {
        if (a?.type === 'url_citation' && a.url) citations.add(a.url)
      }
    }
  }

  return {
    platform: 'chatgpt',
    prompt_id: promptId,
    raw_response: content,
    model_used: response.model ?? MODEL,
    tokens_used:
      (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0),
    latency_ms,
    citations: Array.from(citations),
  }
}

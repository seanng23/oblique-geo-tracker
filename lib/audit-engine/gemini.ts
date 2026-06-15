import type { RawQueryResult } from '@/lib/types'

const MODEL = 'gemini-2.5-flash'

// Web-grounded query: Gemini answers with Google Search grounding enabled,
// measuring live AI-search visibility (what Gemini retrieves and cites),
// not training-data recall. Uses the REST API directly because the legacy
// @google/generative-ai SDK does not expose the google_search tool.
export async function queryGemini(
  promptText: string,
  promptId: string
): Promise<RawQueryResult> {
  const start = Date.now()

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: 'You are a helpful assistant. Answer the question directly and factually. If the question names a country or city, answer for that location.',
            },
          ],
        },
        contents: [{ role: 'user', parts: [{ text: promptText }] }],
        tools: [{ google_search: {} }],
        generationConfig: {
          temperature: 0.3,
          // 2.5-flash spends part of this budget on internal "thinking";
          // keep it generous so a usable answer still comes back.
          maxOutputTokens: 2048,
        },
      }),
    }
  )

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Gemini API error ${res.status}: ${body.slice(0, 200)}`)
  }

  const latency_ms = Date.now() - start
  const data: any = await res.json()
  const candidate = data.candidates?.[0]

  const text = (candidate?.content?.parts ?? [])
    .map((p: any) => p.text ?? '')
    .join('')
    .trim()

  if (!text) {
    throw new Error(`Gemini returned no content for prompt ${promptId}`)
  }

  // groundingChunks are the web pages Gemini actually retrieved and cited
  const citations = new Set<string>()
  for (const chunk of candidate?.groundingMetadata?.groundingChunks ?? []) {
    if (chunk?.web?.uri) citations.add(chunk.web.uri)
  }

  const usage = data.usageMetadata
  const tokens = (usage?.promptTokenCount ?? 0) + (usage?.candidatesTokenCount ?? 0)

  return {
    platform: 'gemini',
    prompt_id: promptId,
    raw_response: text,
    model_used: MODEL,
    tokens_used: tokens,
    latency_ms,
    citations: Array.from(citations),
  }
}

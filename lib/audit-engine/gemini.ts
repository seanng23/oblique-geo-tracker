import { GoogleGenerativeAI } from '@google/generative-ai'
import type { RawQueryResult } from '@/lib/types'

const MODEL = 'gemini-2.5-flash'

const SYSTEM_INSTRUCTION = `You are a helpful assistant. Answer the user's question directly and accurately.
Provide a factual, balanced response based on your knowledge.`

export async function queryGemini(
  promptText: string,
  promptId: string
): Promise<RawQueryResult> {
  const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  const model = genai.getGenerativeModel({
    model: MODEL,
    systemInstruction: SYSTEM_INSTRUCTION,
    generationConfig: {
      temperature: 0.3,
      // 2.5-flash spends some of this budget on internal "thinking"; keep it
      // generous so a usable answer still comes back.
      maxOutputTokens: 2048,
    },
  })

  const start = Date.now()
  const result = await model.generateContent(promptText)
  const latency_ms = Date.now() - start

  const text = result.response.text()
  if (!text) {
    throw new Error(`Gemini returned no content for prompt ${promptId}`)
  }

  const usageMeta = result.response.usageMetadata
  const tokens = (usageMeta?.promptTokenCount ?? 0) + (usageMeta?.candidatesTokenCount ?? 0)

  return {
    platform: 'gemini',
    prompt_id: promptId,
    raw_response: text,
    model_used: MODEL,
    tokens_used: tokens,
    latency_ms,
  }
}

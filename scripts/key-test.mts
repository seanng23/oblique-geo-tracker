import fs from 'fs'
for (const line of fs.readFileSync('.env.local','utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].trim()
}
const { queryChatGPT } = await import('../lib/audit-engine/openai')
const { queryGemini } = await import('../lib/audit-engine/gemini')
try {
  const r = await queryChatGPT('What are popular halal vitamin brands in Malaysia? Answer briefly.', 'test')
  console.log('ChatGPT ✓ grounded —', r.raw_response.slice(0, 80).replace(/\n/g,' '), '| citations:', (r.citations ?? []).length)
} catch (e: any) { console.log('ChatGPT ✗', String(e.message).slice(0, 120)) }
try {
  const r = await queryGemini('What are popular halal vitamin brands in Malaysia? Answer briefly.', 'test')
  console.log('Gemini ✓ grounded —', r.raw_response.slice(0, 80).replace(/\n/g,' '), '| citations:', (r.citations ?? []).length)
} catch (e: any) { console.log('Gemini ✗', String(e.message).slice(0, 120)) }

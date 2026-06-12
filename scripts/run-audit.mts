import fs from 'fs'
import { createClient } from '@supabase/supabase-js'
for (const line of fs.readFileSync('.env.local','utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].trim()
}
const { queryChatGPT } = await import('../lib/audit-engine/openai')
const { queryGemini } = await import('../lib/audit-engine/gemini')
const { queryClaude } = await import('../lib/audit-engine/claude')
const { judgeResponse } = await import('../lib/audit-engine/judge')
const { parseBrandMention, parseCompetitorMentions, extractCitationDomains, isClientDomainCited, detectPotentialHallucinations } = await import('../lib/audit-engine/parser')
const { calculateScores } = await import('../lib/audit-engine/scorer')

const RUNNERS: Record<string, any> = { chatgpt: queryChatGPT, gemini: queryGemini, claude: queryClaude }
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function withRetry(fn: () => Promise<any>, attempts = 3) {
  let lastErr
  for (let i = 0; i < attempts; i++) {
    try { return await fn() } catch (err: any) {
      lastErr = err
      const msg = String(err?.message ?? err)
      // OpenAI "exceeded your current quota" is a billing 429 — never resets in-run, don't wait on it
      if (msg.includes('exceeded your current quota')) throw err
      if (i < attempts - 1) {
        const isRate = msg.includes('429') || msg.toLowerCase().includes('rate limit')
        await sleep(isRate ? 30000 * (i + 1) : 4000 * (i + 1))
      }
    }
  }
  throw lastErr
}

const { data: client } = await db.from('clients').select('*').eq('name', 'Herbs of Gold').single()
const { data: prompts } = await db.from('prompts').select('*').eq('client_id', client.id).eq('is_active', true).order('sort_order')
const { data: competitors } = await db.from('competitors').select('*').eq('client_id', client.id)

// Remove earlier partial/ungrounded audits so the dashboard's "latest" is the complete grounded run
const { data: oldAudits } = await db.from('audits').select('id').eq('client_id', client.id)
const oldIds = (oldAudits ?? []).map((a: any) => a.id)
if (oldIds.length) {
  await db.from('audit_results').delete().in('audit_id', oldIds)
  await db.from('visibility_scores').delete().in('audit_id', oldIds)
  await db.from('audits').delete().in('id', oldIds)
  console.log(`Cleared ${oldIds.length} earlier audit(s).`)
}

const platforms = ['chatgpt', 'gemini', 'claude']
const { data: audit } = await db.from('audits').insert({
  client_id: client.id, trigger_type: 'manual', status: 'running',
  prompts_total: (prompts?.length ?? 0) * platforms.length, prompts_completed: 0,
}).select().single()
console.log('Grounded audit', audit.id)

const allResults: any[] = []
let completed = 0
for (const prompt of prompts ?? []) {
  for (const platform of platforms) {
    let raw
    try {
      raw = await withRetry(() => RUNNERS[platform](prompt.text, prompt.id))
    } catch (e: any) {
      console.log(`  ✗ ${platform} — ${String(e.message).slice(0, 60)}`)
      completed++; continue
    }
    let verdict
    try {
      verdict = await withRetry(() => judgeResponse(raw.raw_response, prompt.text, client.name, client.brand_aliases, competitors ?? []), 2)
    } catch {
      const p = parseBrandMention(raw.raw_response, client.name, client.brand_aliases)
      verdict = { ...p, competitor_data: parseCompetitorMentions(raw.raw_response, competitors ?? []) }
    }
    const citation_urls = extractCitationDomains(raw.raw_response + '\n' + (raw.citations ?? []).join('\n'))
    const is_source_cited = isClientDomainCited(citation_urls, client.website)
    const hallucination_flags = detectPotentialHallucinations(raw.raw_response, client.name, client.brand_aliases, platform as any, prompt.text)
    const { data: inserted } = await db.from('audit_results').insert({
      audit_id: audit.id, prompt_id: prompt.id, platform, raw_response: raw.raw_response,
      brand_mentioned: verdict.mentioned, brand_rank: verdict.rank, mention_status: verdict.mention_status,
      competitor_data: verdict.competitor_data, sentiment: verdict.sentiment,
      citation_urls, is_source_cited, hallucination_flags,
      model_used: raw.model_used, tokens_used: raw.tokens_used, latency_ms: raw.latency_ms,
    }).select().single()
    if (inserted) allResults.push(inserted)
    completed++
    console.log(`  ✓ ${platform} / "${prompt.text.slice(0,38)}…" — ${verdict.mentioned ? verdict.mention_status + (verdict.rank ? ' #'+verdict.rank : '') : 'absent'} · cited=${is_source_cited}`)
    await db.from('audits').update({ prompts_completed: completed }).eq('id', audit.id)
    await sleep(platform === 'claude' ? 8000 : 2500)
  }
}
const scores = calculateScores(audit.id, client.id, allResults)
if (scores.length) await db.from('visibility_scores').insert(scores)
await db.from('audits').update({ status: 'complete', completed_at: new Date().toISOString() }).eq('id', audit.id)
console.log('\n=== GROUNDED VISIBILITY SCORES ===')
for (const s of scores) console.log(`  ${s.platform.padEnd(10)} ${s.score.toFixed(1)}% (${s.mentions_count}/${s.total_prompts}) ranked=${s.ranked_count} outranked=${s.outranked_count} SIR=${s.sir_score ?? '—'} NSS=${s.nss ?? '—'}`)

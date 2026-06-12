import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { chromium } from 'playwright'

for (const line of fs.readFileSync('.env.local','utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].trim()
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const { data: client } = await db.from('clients').select('*').eq('name', 'Herbs of Gold').single()
const { data: audit } = await db.from('audits').select('*').eq('client_id', client.id).eq('status','complete').order('started_at',{ascending:false}).limit(1).single()
const { data: scores } = await db.from('visibility_scores').select('*').eq('audit_id', audit.id)
const { data: results } = await db.from('audit_results').select('*, prompts(text, category)').eq('audit_id', audit.id)

const overall = scores!.find((s:any)=>s.platform==='overall')
const byPlat = (p:string)=>scores!.find((s:any)=>s.platform===p)
const mentioned = results!.filter((r:any)=>r.brand_mentioned).map((r:any)=>r.prompts?.text).filter(Boolean)
const missed = [...new Set(results!.filter((r:any)=>!r.brand_mentioned).map((r:any)=>r.prompts?.text).filter(Boolean))]

// Narrative — written by Claude (production uses GPT-4o; OpenAI key currently unbilled)
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const msg = await anthropic.messages.create({
  model: 'claude-sonnet-4-5-20250929', max_tokens: 1200, temperature: 0.5,
  system: `You are a senior GEO strategist at Oblique, a boutique SEO/GEO agency in Malaysia. Write a professional monthly AI visibility report summary for a client. Be specific, data-driven, actionable. Confident, strategic, clear. 4-6 paragraphs. No filler. Only reference the numbers provided. Be transparent that scores are approximate.`,
  messages: [{ role: 'user', content: `Write the monthly GEO report summary for ${client.name} (${client.website}), industry: ${client.industry}.
Method: web-grounded queries (each AI answers using its own live web search) across Gemini and Claude. ChatGPT pending account quota.
Overall visibility: ${overall.score.toFixed(1)}% (${overall.mentions_count}/${overall.total_prompts} prompt-runs)
Gemini: ${byPlat('gemini')?.score.toFixed(1)}% · Claude: ${byPlat('claude')?.score.toFixed(1)}%
Ranked (top-3): ${overall.ranked_count} · Outranked: ${overall.outranked_count} · Absent: ${overall.absent_count}
SIR (own domain cited as source): ${overall.sir_score}% — herbsofgold.com.my was never cited; AIs cite listicles and competitor sites instead.
Net sentiment when mentioned: +${overall.nss}
Prompts where brand appeared: ${mentioned.join(' | ')}
Prompts where absent: ${missed.join(' | ')}
Recommend 3 concrete GEO actions for next month.` }],
})
const ai_summary = (msg.content[0] as any).text

const { data: report } = await db.from('reports').insert({
  client_id: client.id, audit_id: audit.id,
  report_month: new Date().toISOString().slice(0,8)+'01',
  ai_summary, status: 'ready',
}).select().single()
console.log('Report row:', report.id)

// --- HTML identical to lib/pdf/generate.ts buildReportHTML ---
const reportDate = new Date(report.report_month).toLocaleString('en-MY',{month:'long',year:'numeric'})
const platforms = scores!.filter((s:any)=>s.platform!=='overall')
const platformRows = platforms.map((s:any)=>`
    <tr>
      <td>${s.platform.charAt(0).toUpperCase()+s.platform.slice(1)}</td>
      <td><strong>${s.score.toFixed(1)}%</strong></td>
      <td>${s.mentions_count} / ${s.total_prompts}</td>
      <td>${s.avg_rank ? `#${Number(s.avg_rank).toFixed(1)}` : '—'}</td>
    </tr>`).join('')
const summaryHtml = (ai_summary ?? '').split('\n\n').filter(Boolean).map((p:string)=>`<p>${p}</p>`).join('')
const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #fff; color: #1a1a1a; }
  .header { background: #1a1a1a; color: #fff; padding: 48px 64px; }
  .header h1 { font-size: 28px; font-weight: 700; margin-top: 8px; }
  .header p { color: #888; font-size: 13px; margin-top: 4px; }
  .body { padding: 48px 64px; }
  .score-hero { background: #f9f9f9; border-radius: 12px; padding: 32px; text-align: center; margin-bottom: 32px; }
  .score-hero .pct { font-size: 72px; font-weight: 800; color: #1a1a1a; line-height: 1; }
  .score-hero .label { font-size: 13px; color: #888; margin-top: 8px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 32px; }
  th { text-align: left; font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: .05em; border-bottom: 2px solid #f1f1f1; padding: 8px 12px; }
  td { padding: 10px 12px; border-bottom: 1px solid #f5f5f5; font-size: 14px; }
  h2 { font-size: 18px; font-weight: 600; margin-bottom: 16px; }
  p { font-size: 14px; color: #444; line-height: 1.8; margin-bottom: 12px; }
  .disclaimer { font-size: 11px; color: #aaa; border-top: 1px solid #f1f1f1; padding-top: 24px; margin-top: 24px; line-height: 1.6; }
  .agency { font-size: 11px; color: #888; margin-top: 4px; }
</style></head><body>
<div class="header">
  <p style="font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#666">Oblique GEO Tracker</p>
  <h1>${client.name}</h1>
  <p>AI Visibility Report — ${reportDate}</p>
</div>
<div class="body">
  <div class="score-hero">
    <div class="pct">${overall.score.toFixed(1)}%</div>
    <div class="label">Overall AI Visibility Score &mdash; ${overall.mentions_count} of ${overall.total_prompts} tracked prompts</div>
  </div>
  <table>
    <tr><th>Platform</th><th>Visibility Score</th><th>Prompts Matched</th><th>Avg Rank</th></tr>
    ${platformRows}
  </table>
  <h2>Strategic Summary</h2>
  ${summaryHtml}
  <p class="disclaimer">Visibility scores reflect the percentage of tracked prompts in which ${client.name}'s brand appeared in responses from ChatGPT, Google Gemini, and Claude. Scores are approximate indicators derived from live API calls — AI models are non-deterministic and results may vary between runs. No data in this report is fabricated or estimated.</p>
  <p class="agency">Prepared by Oblique · oblique.agency</p>
</div></body></html>`

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.setContent(html, { waitUntil: 'networkidle' })
const fullHeight = await page.evaluate(() => document.body.scrollHeight)
const out = path.join(process.cwd(), 'Herbs-of-Gold-AI-Visibility-Report.pdf')
await page.pdf({ path: out, width: '381mm', height: `${(fullHeight*0.2646).toFixed(1)}mm`, printBackground: true, margin: {top:'0',bottom:'0',left:'0',right:'0'} })
await browser.close()
console.log('PDF:', out)

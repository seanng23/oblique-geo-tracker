import fs from 'fs'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
for (const line of fs.readFileSync('.env.local','utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].trim()
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const { data: report } = await db.from('reports').select('*, clients(*)').eq('id','e06bba40-014c-4212-9314-fe1ee56c52d2').single()
const client = report.clients
const { data: scores } = await db.from('visibility_scores').select('*').eq('audit_id', report.audit_id)
const overall = scores!.find((s:any)=>s.platform==='overall')
const platforms = scores!.filter((s:any)=>s.platform!=='overall')
const reportDate = new Date(report.report_month).toLocaleString('en-MY',{month:'long',year:'numeric'})
const platformRows = platforms.map((s:any)=>`<tr><td>${s.platform.charAt(0).toUpperCase()+s.platform.slice(1)}</td><td><strong>${Number(s.score).toFixed(1)}%</strong></td><td>${s.mentions_count} / ${s.total_prompts}</td><td>${s.avg_rank ? '#'+Number(s.avg_rank).toFixed(1) : '—'}</td></tr>`).join('')
const summaryHtml = (report.ai_summary ?? '').split('\n\n').filter(Boolean).map((p:string)=>`<p>${p}</p>`).join('')
const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
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
<div class="header"><p style="font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#666">Oblique GEO Tracker</p><h1>${client.name}</h1><p>AI Visibility Report — ${reportDate}</p></div>
<div class="body">
<div class="score-hero"><div class="pct">${Number(overall.score).toFixed(1)}%</div><div class="label">Overall AI Visibility Score &mdash; ${overall.mentions_count} of ${overall.total_prompts} tracked prompts</div></div>
<table><tr><th>Platform</th><th>Visibility Score</th><th>Prompts Matched</th><th>Avg Rank</th></tr>${platformRows}</table>
<h2>Strategic Summary</h2>${summaryHtml}
<p class="disclaimer">Visibility scores reflect the percentage of tracked prompts in which ${client.name}'s brand appeared in responses from ChatGPT, Google Gemini, and Claude. Scores are approximate indicators derived from live API calls — AI models are non-deterministic and results may vary between runs. No data in this report is fabricated or estimated.</p>
<p class="agency">Prepared by Oblique · oblique.agency</p>
</div></body></html>`
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.setContent(html, { waitUntil: 'networkidle' })
await page.screenshot({ path: 'report-preview.png', fullPage: true })
await browser.close()
console.log('shot saved')

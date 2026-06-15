import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
for (const line of fs.readFileSync('.env.local','utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].trim()
}
const { buildNarrative, buildReportHTML } = await import('../lib/reports/builder')
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const { data: client } = await db.from('clients').select('*').eq('name', 'Herbs of Gold').single()
const { data: audit } = await db.from('audits').select('*').eq('client_id', client.id).eq('status','complete').order('started_at',{ascending:false}).limit(1).single()
const { data: scores } = await db.from('visibility_scores').select('*').eq('audit_id', audit.id)
const { data: results } = await db.from('audit_results').select('*, prompts(text)').eq('audit_id', audit.id)

const domainFreq: Record<string, number> = {}
for (const r of results!) for (const d of (r.citation_urls ?? [])) domainFreq[d] = (domainFreq[d] ?? 0) + 1
const citedDomains = Object.entries(domainFreq).sort((a,b)=>b[1]-a[1]).map(([d])=>d)
const reportMonthLabel = new Date().toLocaleString('en-MY', { month: 'long', year: 'numeric' })

console.log('Writing narrative…')
const ai_summary = await buildNarrative({
  clientName: client.name, website: client.website, industry: client.industry,
  reportMonthLabel,
  scores: scores as any,
  mentionedPrompts: results!.filter((r:any)=>r.brand_mentioned).map((r:any)=>r.prompts?.text).filter(Boolean),
  missedPrompts: results!.filter((r:any)=>!r.brand_mentioned).map((r:any)=>r.prompts?.text).filter(Boolean),
  citedDomains,
})

// Replace prior reports for this client so the app lists exactly this one
const { data: olds } = await db.from('reports').select('id').eq('client_id', client.id)
for (const o of olds ?? []) await db.from('reports').delete().eq('id', o.id)
const { data: report } = await db.from('reports').insert({
  client_id: client.id, audit_id: audit.id,
  report_month: new Date().toISOString().slice(0,8)+'01',
  ai_summary, status: 'ready',
}).select().single()
console.log('Report ready:', report.id)

const html = buildReportHTML({
  clientName: client.name, website: client.website, reportMonthLabel,
  aiSummary: ai_summary, scores: scores as any,
})
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.setContent(html, { waitUntil: 'networkidle' })
const fullHeight = await page.evaluate(() => document.body.scrollHeight)
await page.pdf({ path: 'Herbs-of-Gold-AI-Visibility-Report.pdf', width: '381mm', height: `${(fullHeight*0.2646).toFixed(1)}mm`, printBackground: true, margin: {top:'0',bottom:'0',left:'0',right:'0'} })
await page.screenshot({ path: 'report-preview.png', fullPage: true })
await browser.close()
console.log('PDF + preview saved')

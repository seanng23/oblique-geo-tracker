import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { buildNarrative } from '@/lib/reports/builder'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { audit_id } = await request.json()
  if (!audit_id) return NextResponse.json({ error: 'audit_id is required' }, { status: 400 })

  const db = createServiceClient()

  const { data: audit } = await db
    .from('audits')
    .select('*, clients(*)')
    .eq('id', audit_id)
    .eq('status', 'complete')
    .single()

  if (!audit) return NextResponse.json({ error: 'Completed audit not found' }, { status: 404 })
  const client = audit.clients as any

  const { data: scores } = await db.from('visibility_scores').select('*').eq('audit_id', audit_id)
  const { data: results } = await db
    .from('audit_results')
    .select('*, prompts(text, category)')
    .eq('audit_id', audit_id)

  const reportMonth = new Date()
  reportMonth.setDate(1)

  const { data: report } = await db
    .from('reports')
    .insert({
      client_id: client.id,
      audit_id,
      report_month: reportMonth.toISOString().split('T')[0],
      status: 'generating',
    })
    .select()
    .single()

  if (!report) return NextResponse.json({ error: 'Failed to create report record' }, { status: 500 })

  // Narrative generation runs after the response returns; the UI polls the
  // report row until status flips to ready.
  generateAsync(report.id, client, scores ?? [], results ?? [], db).catch(console.error)

  return NextResponse.json({ report_id: report.id, status: 'generating' }, { status: 202 })
}

async function generateAsync(reportId: string, client: any, scores: any[], results: any[], db: any) {
  try {
    const mentionedPrompts = results.filter((r) => r.brand_mentioned).map((r) => r.prompts?.text).filter(Boolean)
    const missedPrompts = results.filter((r) => !r.brand_mentioned).map((r) => r.prompts?.text).filter(Boolean)

    const domainFreq: Record<string, number> = {}
    for (const r of results) for (const d of r.citation_urls ?? []) domainFreq[d] = (domainFreq[d] ?? 0) + 1
    const citedDomains = Object.entries(domainFreq).sort((a, b) => b[1] - a[1]).map(([d]) => d)

    const reportMonthLabel = new Date().toLocaleString('en-MY', { month: 'long', year: 'numeric' })

    const ai_summary = await buildNarrative({
      clientName: client.name,
      website: client.website,
      industry: client.industry,
      reportMonthLabel,
      scores,
      mentionedPrompts,
      missedPrompts,
      citedDomains,
    })

    await db.from('reports').update({ ai_summary, status: 'ready' }).eq('id', reportId)
  } catch (err) {
    console.error(`[report:${reportId}] Failed:`, err)
    await db.from('reports').update({ status: 'failed' }).eq('id', reportId)
  }
}

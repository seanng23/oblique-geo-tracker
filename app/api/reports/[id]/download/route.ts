import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { buildReportHTML } from '@/lib/reports/builder'

// GET /api/reports/[id]/download — branded report document.
// Opens in a new tab and triggers the print dialog so staff can save it as
// a PDF (no headless browser available on serverless for direct PDF output).
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const db = createServiceClient()
  const { data: report } = await db
    .from('reports')
    .select('*, clients(*)')
    .eq('id', id)
    .single()

  if (!report || report.status === 'generating' || !report.ai_summary) {
    return NextResponse.json({ error: 'Report not ready' }, { status: 404 })
  }

  const { data: scores } = await db
    .from('visibility_scores')
    .select('*')
    .eq('audit_id', report.audit_id)

  const client = report.clients as any
  const html = buildReportHTML({
    clientName: client.name,
    website: client.website,
    reportMonthLabel: new Date(report.report_month).toLocaleString('en-MY', { month: 'long', year: 'numeric' }),
    aiSummary: report.ai_summary,
    scores: scores ?? [],
  })

  // Auto-open the print dialog; "Save as PDF" produces the deliverable.
  const withPrint = html.replace(
    '</body>',
    `<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),400))</script></body>`
  )

  return new NextResponse(withPrint, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

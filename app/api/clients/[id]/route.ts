import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { replaceCompetitors, replacePrompts, type ClientPayload } from '@/lib/clients'

// PATCH /api/clients/[id] — update client config + competitors + prompts
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = (await request.json()) as ClientPayload

  if (!body.name?.trim() || !body.website?.trim()) {
    return NextResponse.json({ error: 'Name and website are required' }, { status: 400 })
  }

  const db = createServiceClient()

  const { error: updateErr } = await db
    .from('clients')
    .update({
      name: body.name.trim(),
      website: body.website.trim(),
      industry: body.industry?.trim() || null,
      contact_name: body.contact_name?.trim() || null,
      contact_email: body.contact_email?.trim() || null,
      brand_aliases: body.brand_aliases ?? [],
      target_keywords: body.target_keywords ?? [],
      monthly_report_enabled: body.monthly_report_enabled ?? true,
      report_day: body.report_day ?? 1,
      report_recipient_emails: body.report_recipient_emails ?? [],
      is_active: body.is_active ?? true,
    })
    .eq('id', id)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  await replaceCompetitors(db, id, body.competitors ?? [])

  // Prompts are referenced by audit_results (no cascade), so we soft-replace:
  // deactivate the current active set, then insert the submitted set fresh.
  await db.from('prompts').update({ is_active: false }).eq('client_id', id).eq('is_active', true)
  await replacePrompts(db, id, body.prompts ?? [])

  return NextResponse.json({ id }, { status: 200 })
}

// DELETE /api/clients/[id] — permanently delete a client and all its data.
// Removes dependent rows in FK-safe order (reports + audit data have no/partial cascade).
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const db = createServiceClient()

  // Collect this client's audit ids so we can clear audit_results (whose prompt_id
  // FK has no cascade rule and would otherwise block prompt deletion).
  const { data: audits } = await db.from('audits').select('id').eq('client_id', id)
  const auditIds = (audits ?? []).map((a: { id: string }) => a.id)

  await db.from('reports').delete().eq('client_id', id)
  if (auditIds.length > 0) {
    await db.from('audit_results').delete().in('audit_id', auditIds)
  }
  await db.from('visibility_scores').delete().eq('client_id', id)
  await db.from('audits').delete().eq('client_id', id)
  await db.from('prompts').delete().eq('client_id', id)
  await db.from('competitors').delete().eq('client_id', id)

  const { error } = await db.from('clients').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ id }, { status: 200 })
}

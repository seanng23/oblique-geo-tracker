import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: audit } = await supabase
    .from('audits')
    .select('id, status, prompts_total, prompts_completed, error_message, completed_at')
    .eq('id', id)
    .single()

  if (!audit) return NextResponse.json({ error: 'Audit not found' }, { status: 404 })

  const progress =
    audit.prompts_total > 0
      ? Math.round((audit.prompts_completed / audit.prompts_total) * 100)
      : 0

  return NextResponse.json({ ...audit, progress })
}

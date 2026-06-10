import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/notifications — recent audit activity across all clients,
// used by the notification bell. Real data from the audits table.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data } = await supabase
    .from('audits')
    .select('id, status, started_at, completed_at, client_id, clients(name)')
    .order('started_at', { ascending: false })
    .limit(15)

  const items = (data ?? []).map((a: any) => ({
    id: a.id,
    status: a.status as 'pending' | 'running' | 'complete' | 'failed',
    started_at: a.started_at,
    completed_at: a.completed_at,
    client_id: a.client_id,
    client_name: a.clients?.name ?? 'Unknown client',
  }))

  return NextResponse.json({ items })
}

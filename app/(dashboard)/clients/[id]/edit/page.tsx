import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import ClientForm, { type ClientFormInitial } from '@/app/components/ClientForm'
import type { Client, Competitor, Prompt } from '@/lib/types'
import TopNav from '@/app/components/TopNav'

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: client } = await supabase.from('clients').select('*').eq('id', id).single()
  if (!client) notFound()

  const { data: competitors } = await supabase
    .from('competitors')
    .select('*')
    .eq('client_id', id)
    .order('name')

  const { data: prompts } = await supabase
    .from('prompts')
    .select('*')
    .eq('client_id', id)
    .eq('is_active', true)
    .order('sort_order')

  const c = client as Client

  const initial: ClientFormInitial = {
    name: c.name,
    website: c.website,
    industry: c.industry ?? '',
    contact_name: c.contact_name ?? '',
    contact_email: c.contact_email ?? '',
    brand_aliases: c.brand_aliases ?? [],
    target_keywords: c.target_keywords ?? [],
    monthly_report_enabled: c.monthly_report_enabled,
    report_day: c.report_day,
    report_recipient_emails: c.report_recipient_emails ?? [],
    is_active: c.is_active,
    competitors: (competitors as Competitor[] | null ?? []).map((comp) => ({
      name: comp.name,
      website: comp.website,
      brand_aliases: comp.brand_aliases ?? [],
    })),
    prompts: (prompts as Prompt[] | null ?? []).map((p) => ({
      text: p.text,
      category: p.category,
      platforms: p.platforms,
    })),
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <TopNav
        back={`/clients/${id}`}
        crumbs={[{ label: 'Dashboard', href: '/' }, { label: c.name, href: `/clients/${id}` }, { label: 'Edit' }]}
      />

      <div className="main" style={{ maxWidth: 720, padding: '36px 28px' }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Edit {c.name}</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            Update brand details, competitors, and tracked prompts.
          </div>
        </div>
        <ClientForm mode="edit" clientId={id} initial={initial} />
      </div>
    </div>
  )
}

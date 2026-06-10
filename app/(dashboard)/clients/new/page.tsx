import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ClientForm from '@/app/components/ClientForm'
import TopNav from '@/app/components/TopNav'

export default async function NewClientPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <TopNav back="/" crumbs={[{ label: 'Dashboard', href: '/' }, { label: 'Add client' }]} />

      <div className="main" style={{ maxWidth: 720, padding: '36px 28px' }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Add a client</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            Set up the brand, competitors, and the prompts to track across ChatGPT, Gemini, and Claude.
          </div>
        </div>
        <ClientForm mode="create" />
      </div>
    </div>
  )
}

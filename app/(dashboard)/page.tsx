import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Client, Platform, VisibilityScore } from '@/lib/types'
import RunAuditButton from '@/app/components/RunAuditButton'
import BillingAlert from '@/app/components/BillingAlert'
import TopNav from '@/app/components/TopNav'

function scoreColor(score: number) {
  return score >= 70 ? 'var(--success)' : score >= 40 ? 'var(--warning)' : 'var(--danger)'
}
function scorePillClass(score: number) {
  return score >= 70 ? 'p-green' : score >= 40 ? 'p-amber' : 'p-red'
}

function ScorePill({ score }: { score: number | null }) {
  if (score === null) return <span style={{ color: 'var(--faint)', fontSize: 13 }}>—</span>
  return (
    <span className={`pill ${scorePillClass(score)}`}>{score.toFixed(0)}%</span>
  )
}

function PlatformBar({ label, score }: { label: string; score: number | null }) {
  const pct = score ?? 0
  return (
    <div className="mpb">
      <span className="mpb-lbl">{label}</span>
      <div className="bt" style={{ flex: 1 }}>
        <div className="bf" style={{ width: `${pct}%`, background: scoreColor(pct) }} />
      </div>
      <span className="mpb-pct">{score !== null ? `${score.toFixed(0)}%` : '—'}</span>
    </div>
  )
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: clients } = await supabase
    .from('clients')
    .select('*')
    .eq('is_active', true)
    .order('name', { ascending: true })

  const clientIds = (clients ?? []).map((c: Client) => c.id)

  const scoresByClient: Record<string, VisibilityScore[]> = {}
  const latestAuditByClient: Record<string, any> = {}

  if (clientIds.length > 0) {
    const { data: audits } = await supabase
      .from('audits')
      .select('id, client_id, started_at, status')
      .in('client_id', clientIds)
      .eq('status', 'complete')
      .order('started_at', { ascending: false })

    for (const audit of audits ?? []) {
      if (!latestAuditByClient[audit.client_id]) latestAuditByClient[audit.client_id] = audit
    }

    const latestAuditIds = Object.values(latestAuditByClient).map((a: any) => a.id)
    if (latestAuditIds.length > 0) {
      const { data: scores } = await supabase
        .from('visibility_scores')
        .select('*')
        .in('audit_id', latestAuditIds)
      for (const score of scores ?? []) {
        if (!scoresByClient[score.client_id]) scoresByClient[score.client_id] = []
        scoresByClient[score.client_id].push(score as VisibilityScore)
      }
    }
  }

  const now = new Date()
  const overallScores = Object.values(scoresByClient).flat().filter((s) => s.platform === 'overall')
  const avgVisibility = overallScores.length
    ? `${(overallScores.reduce((s, v) => s + v.score, 0) / overallScores.length).toFixed(1)}%`
    : '—'
  const auditsThisMonth = Object.values(latestAuditByClient).filter((a: any) => {
    const d = new Date(a.started_at)
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).length

  const stats = [
    { label: 'Active clients', value: clients?.length ?? 0, sub: 'tracked brands' },
    { label: 'Avg visibility score', value: avgVisibility, sub: 'across all platforms' },
    { label: 'Audits this month', value: auditsThisMonth, sub: `across ${clients?.length ?? 0} clients` },
  ]

  // A platform absent from EVERY recent audit's scores (despite completed audits)
  // is a systemic key/billing failure, not per-client config.
  const allScores = Object.values(scoresByClient).flat()
  const hasCompletedAudit = Object.keys(latestAuditByClient).length > 0
  const missingPlatforms: Platform[] = hasCompletedAudit
    ? (['chatgpt', 'gemini', 'claude'] as Platform[]).filter((p) => !allScores.some((s) => s.platform === p))
    : []

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <TopNav
        crumbs={[{ label: 'Dashboard' }]}
        actions={
          <>
            <span style={{ fontSize: 11, color: 'var(--faint)' }}>
              {now.toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
            <Link href="/clients/new" className="btn btn-dark">+ Add client</Link>
          </>
        }
      />

      <div className="main">
        <BillingAlert missing={missingPlatforms} scope="all clients" />

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 28 }}>
          {stats.map((stat) => (
            <div key={stat.label} className="card cp">
              <div style={{ fontSize: 10.5, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>
                {stat.label}
              </div>
              <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-.03em' }}>{stat.value}</div>
              <div style={{ fontSize: 11, color: 'var(--faint)', marginTop: 3 }}>{stat.sub}</div>
            </div>
          ))}
        </div>

        {/* Client table */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Clients</span>
            <span style={{ fontSize: 11, color: 'var(--faint)' }}>{clients?.length ?? 0} active</span>
          </div>

          {!clients?.length ? (
            <div style={{ padding: '64px 0', textAlign: 'center' }}>
              <p style={{ fontSize: 13, color: 'var(--muted)' }}>No clients yet.</p>
              <Link href="/clients/new" style={{ fontSize: 13, marginTop: 6, display: 'inline-block' }}>
                Add your first client
              </Link>
            </div>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Industry</th>
                  <th>Overall</th>
                  <th style={{ minWidth: 210 }}>Platform breakdown</th>
                  <th>Last audit</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(clients as Client[]).map((client) => {
                  const scores = scoresByClient[client.id] ?? []
                  const overall = scores.find((s) => s.platform === 'overall')
                  const chatgpt = scores.find((s) => s.platform === 'chatgpt')
                  const gemini = scores.find((s) => s.platform === 'gemini')
                  const claude = scores.find((s) => s.platform === 'claude')
                  const latestAudit = latestAuditByClient[client.id]

                  return (
                    <tr key={client.id}>
                      <td>
                        <Link href={`/clients/${client.id}`} style={{ display: 'block', textDecoration: 'none' }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{client.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--faint)', marginTop: 2 }}>{client.website}</div>
                        </Link>
                      </td>
                      <td>
                        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{client.industry ?? '—'}</span>
                      </td>
                      <td><ScorePill score={overall?.score ?? null} /></td>
                      <td style={{ minWidth: 210 }}>
                        <PlatformBar label="ChatGPT" score={chatgpt?.score ?? null} />
                        <PlatformBar label="Gemini" score={gemini?.score ?? null} />
                        <PlatformBar label="Claude" score={claude?.score ?? null} />
                      </td>
                      <td style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                        {latestAudit
                          ? new Date(latestAudit.started_at).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })
                          : <span style={{ color: 'var(--faint)' }}>Never</span>}
                      </td>
                      <td>
                        <span className="ra" style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end', opacity: 0, transition: 'opacity 120ms ease' }}>
                          <Link href={`/clients/${client.id}`} className="btn btn-ghost">View</Link>
                          <RunAuditButton clientId={client.id} variant="blue" />
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <p style={{ fontSize: 11, color: 'var(--faint)', marginTop: 16, maxWidth: 600, lineHeight: 1.7 }}>
          Scores = % of tracked prompts where the brand appeared in a live API response from ChatGPT, Gemini, and Claude.
          Approximate — AI is non-deterministic and results vary between runs. No data is fabricated.
        </p>
      </div>
    </div>
  )
}

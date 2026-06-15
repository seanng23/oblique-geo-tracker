import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import type { Audit, AuditResult, Client, Competitor, Platform, Prompt, VisibilityScore } from '@/lib/types'
import RunAuditButton from '@/app/components/RunAuditButton'
import DeleteClientButton from '@/app/components/DeleteClientButton'
import BillingAlert from '@/app/components/BillingAlert'
import TopNav from '@/app/components/TopNav'
import ReportsCard from '@/app/components/ReportsCard'

function scoreColor(score: number) {
  return score >= 70 ? 'var(--success)' : score >= 40 ? 'var(--warning)' : 'var(--danger)'
}

function ScoreCard({
  platform, score, mentions, total, avgRank, delta, lowSample,
}: {
  platform: string; score: number; mentions: number; total: number; avgRank: number | null; delta: number | null; lowSample?: boolean
}) {
  // Grey out the score when the sample is too small to trust (e.g. a platform
  // that mostly rate-limited) so a 1/1 "100%" doesn't read as a real result.
  const c = lowSample ? 'var(--faint)' : scoreColor(score)
  const deltaPill = delta == null ? null : delta >= 0 ? 'p-green' : 'p-red'
  return (
    <div className="card cp">
      <div className="sc-head">
        <span className="sc-plat">{platform}</span>
        {lowSample ? (
          <span className="pill p-amber" title="Too few successful API calls to be reliable — likely rate-limited. Re-run the audit.">Low sample</span>
        ) : delta != null && (
          <span className={`pill ${deltaPill}`}>{delta > 0 ? '+' : ''}{delta.toFixed(0)}%</span>
        )}
      </div>
      <div className="sc-num">
        <span className="sc-big" style={{ color: c }}>{score.toFixed(0)}</span>
        <span className="sc-pct" style={{ color: c }}>%</span>
      </div>
      <div className="bt" style={{ marginBottom: 10 }}>
        <div className="bf" style={{ width: `${score}%`, background: c }} />
      </div>
      <div className="sc-meta">{mentions} / {total} prompts matched</div>
      {lowSample
        ? <div className="sc-meta" style={{ color: 'var(--warning)' }}>Only {total} call{total === 1 ? '' : 's'} succeeded — re-run for a reliable score</div>
        : avgRank != null && <div className="sc-meta">Avg position: #{avgRank.toFixed(1)}</div>}
    </div>
  )
}

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: client } = await supabase.from('clients').select('*').eq('id', id).single()
  if (!client) notFound()
  const c = client as Client

  const { data: prompts } = await supabase
    .from('prompts').select('*').eq('client_id', c.id).eq('is_active', true).order('sort_order')
  const { data: competitors } = await supabase
    .from('competitors').select('*').eq('client_id', c.id)
  const { data: audits } = await supabase
    .from('audits').select('*').eq('client_id', c.id).order('started_at', { ascending: false }).limit(6)
  const { data: reports } = await supabase
    .from('reports').select('id, report_month, status, generated_at').eq('client_id', c.id).order('generated_at', { ascending: false }).limit(12)

  const latestAudit = (audits as Audit[] | null)?.[0]
  const previousAudit = (audits as Audit[] | null)?.[1]

  let latestScores: VisibilityScore[] = []
  let previousScores: VisibilityScore[] = []
  let latestResults: AuditResult[] = []

  if (latestAudit) {
    const { data: scores } = await supabase.from('visibility_scores').select('*').eq('audit_id', latestAudit.id)
    latestScores = (scores as VisibilityScore[]) ?? []
    const { data: results } = await supabase.from('audit_results').select('*').eq('audit_id', latestAudit.id).order('created_at')
    latestResults = (results as AuditResult[]) ?? []
  }
  if (previousAudit) {
    const { data: scores } = await supabase.from('visibility_scores').select('*').eq('audit_id', previousAudit.id)
    previousScores = (scores as VisibilityScore[]) ?? []
  }

  const getScore = (s: VisibilityScore[], p: string) => s.find((x) => x.platform === p)
  const promptMap = Object.fromEntries((prompts ?? []).map((p: Prompt) => [p.id, p]))
  const mentioned = latestResults.filter((r) => r.brand_mentioned)
  const missed = latestResults.filter((r) => !r.brand_mentioned)

  const competitorFreq: Record<string, number> = {}
  for (const r of latestResults) {
    for (const [name, rank] of Object.entries(r.competitor_data ?? {})) {
      if (rank !== null) competitorFreq[name] = (competitorFreq[name] ?? 0) + 1
    }
  }

  const platformLabels: Record<string, string> = {
    overall: 'All platforms', chatgpt: 'ChatGPT', gemini: 'Gemini', claude: 'Claude',
  }

  // Platforms the prompts target but which produced no rows in the latest audit
  // (errored out — usually a key/billing/quota problem).
  const expectedPlatforms = new Set<Platform>()
  for (const p of (prompts ?? []) as Prompt[]) for (const pl of p.platforms) expectedPlatforms.add(pl)
  const presentPlatforms = new Set(latestResults.map((r) => r.platform))
  const missingPlatforms: Platform[] = latestAudit && latestAudit.status === 'complete'
    ? [...expectedPlatforms].filter((p) => !presentPlatforms.has(p))
    : []

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <TopNav
        back="/"
        crumbs={[{ label: 'Dashboard', href: '/' }, { label: c.name }]}
        actions={
          <>
            <Link href={`/clients/${c.id}/edit`} className="btn btn-ghost">Edit client</Link>
            <DeleteClientButton clientId={c.id} clientName={c.name} />
            <RunAuditButton clientId={c.id} variant="solid" />
          </>
        }
      />

      <div className="main">
        {/* Client header */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{c.name}</div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            <a href={c.website} target="_blank" rel="noopener noreferrer">{c.website}</a>
            {c.industry && <><span style={{ color: 'var(--border-strong)', margin: '0 6px' }}>·</span>{c.industry}</>}
            {c.brand_aliases?.length > 0 && (
              <><span style={{ color: 'var(--border-strong)', margin: '0 6px' }}>·</span>Aliases: {c.brand_aliases.join(', ')}</>
            )}
          </div>
          {latestAudit && (
            <div style={{ fontSize: 11, color: 'var(--faint)', marginTop: 6 }}>
              Last audit: {new Date(latestAudit.started_at).toLocaleString('en-MY', {
                day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
              })}
            </div>
          )}
        </div>

        <BillingAlert missing={missingPlatforms} scope="this audit" />

        {/* Score cards */}
        {latestScores.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 24 }}>
            {(['overall', 'chatgpt', 'gemini', 'claude'] as const).map((platform) => {
              const cur = getScore(latestScores, platform)
              const prev = getScore(previousScores, platform)
              if (!cur) return null
              // Low sample = a platform that ran far fewer prompts than the
              // busiest one (e.g. rate-limited), so its % isn't trustworthy.
              const maxPlatformTotal = Math.max(
                ...latestScores.filter((s) => s.platform !== 'overall').map((s) => s.total_prompts),
                1
              )
              const lowSample = platform !== 'overall' && cur.total_prompts < Math.max(3, maxPlatformTotal * 0.5)
              return (
                <ScoreCard
                  key={platform}
                  platform={platformLabels[platform]}
                  score={cur.score}
                  mentions={cur.mentions_count}
                  total={cur.total_prompts}
                  avgRank={cur.avg_rank}
                  delta={prev ? cur.score - prev.score : null}
                  lowSample={lowSample}
                />
              )
            })}
          </div>
        ) : (
          <div className="card cp" style={{ textAlign: 'center', padding: 40, marginBottom: 24 }}>
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>No audit data yet.</p>
            <p style={{ fontSize: 11.5, color: 'var(--faint)', marginTop: 4 }}>Run an audit to see visibility scores.</p>
          </div>
        )}

        {/* Prompt results + sidebar */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 290px', gap: 16 }}>
          {/* Prompt results */}
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Prompt results</span>
              <div style={{ display: 'flex', gap: 10, fontSize: 11.5 }}>
                <span style={{ color: 'var(--success)', fontWeight: 500 }}>✓ {mentioned.length} found</span>
                <span style={{ color: 'var(--danger)' }}>✗ {missed.length} missing</span>
              </div>
            </div>
            {latestResults.length === 0 ? (
              <div style={{ padding: '40px 0', textAlign: 'center', fontSize: 13, color: 'var(--faint)' }}>No results yet</div>
            ) : (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Prompt</th><th>Platform</th><th>Status</th><th>Sentiment</th><th>Latency</th>
                  </tr>
                </thead>
                <tbody>
                  {latestResults.map((r) => {
                    const p = promptMap[r.prompt_id]
                    return (
                      <tr key={r.id}>
                        <td>
                          <div style={{ fontSize: 12.5, maxWidth: 240, lineHeight: 1.4 }}>{p?.text ?? '—'}</div>
                          {p?.category && (
                            <span className="pill p-grey" style={{ fontSize: 9.5, marginTop: 4 }}>{p.category}</span>
                          )}
                        </td>
                        <td style={{ fontSize: 11.5, color: 'var(--muted)', textTransform: 'capitalize' }}>{r.platform}</td>
                        <td>
                          <span className={`pill ${r.brand_mentioned ? (r.mention_status === 'outranked' ? 'p-weak' : 'p-green') : 'p-grey'}`}>
                            {r.brand_mentioned ? `✓ Rank #${r.brand_rank ?? '?'}` : '✗ Not found'}
                          </span>
                        </td>
                        <td>
                          {r.sentiment && (
                            <span style={{ fontSize: 12, color: r.sentiment === 'positive' ? 'var(--success)' : r.sentiment === 'negative' ? 'var(--danger)' : 'var(--muted)' }}>
                              {r.sentiment}
                            </span>
                          )}
                        </td>
                        <td style={{ fontSize: 11, color: 'var(--faint)' }}>{r.latency_ms ? `${r.latency_ms}ms` : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Sidebar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Competitors */}
            <div className="card cp">
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Competitor appearances</div>
              {Object.keys(competitorFreq).length === 0 ? (
                <p style={{ fontSize: 11.5, color: 'var(--faint)' }}>No competitor data</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {(competitors as Competitor[])?.map((comp) => {
                    const count = competitorFreq[comp.name] ?? 0
                    const pct = latestResults.length > 0 ? (count / latestResults.length) * 100 : 0
                    return (
                      <div key={comp.id}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{comp.name}</span>
                          <span style={{ fontSize: 11.5, color: 'var(--faint)' }}>{pct.toFixed(0)}%</span>
                        </div>
                        <div className="bt"><div className="bf" style={{ width: `${pct}%`, background: 'var(--info)' }} /></div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Audit history */}
            <div className="card cp">
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Audit history</div>
              {!audits?.length ? (
                <p style={{ fontSize: 11.5, color: 'var(--faint)' }}>No audits yet</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(audits as Audit[]).map((audit) => {
                    const cls = audit.status === 'complete' ? 'p-green' : audit.status === 'failed' ? 'p-red' : audit.status === 'running' ? 'p-blue' : 'p-grey'
                    return (
                      <div key={audit.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11.5 }}>
                        <span style={{ color: 'var(--muted)' }}>
                          {new Date(audit.started_at).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })}
                        </span>
                        <span className={`pill ${cls}`} style={{ textTransform: 'capitalize' }}>{audit.status}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Tracked prompts */}
            <div className="card cp">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Tracked prompts</span>
                <span style={{ fontSize: 11, color: 'var(--faint)' }}>{prompts?.length ?? 0}</span>
              </div>
              {!prompts?.length ? (
                <p style={{ fontSize: 11.5, color: 'var(--faint)' }}>No prompts configured</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(prompts as Prompt[]).slice(0, 6).map((p) => (
                    <p key={p.id} style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {p.text}
                    </p>
                  ))}
                  {(prompts?.length ?? 0) > 6 && (
                    <p style={{ fontSize: 11.5, color: 'var(--faint)' }}>+{(prompts?.length ?? 0) - 6} more</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Reports */}
        <div style={{ marginTop: 16 }}>
          <ReportsCard
            reports={(reports as any[]) ?? []}
            latestCompleteAuditId={
              ((audits as Audit[] | null) ?? []).find((a) => a.status === 'complete')?.id ?? null
            }
          />
        </div>
      </div>
    </div>
  )
}

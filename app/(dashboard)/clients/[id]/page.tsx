import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import type { Audit, AuditResult, Client, Competitor, Prompt, VisibilityScore } from '@/lib/types'

// ─── Sub-components ───────────────────────────────────────

function ScoreCard({
  platform,
  score,
  mentions,
  total,
  avgRank,
  prevScore,
}: {
  platform: string
  score: number
  mentions: number
  total: number
  avgRank: number | null
  prevScore?: number
}) {
  const delta = prevScore != null ? score - prevScore : null
  const colour = score >= 70 ? '#059669' : score >= 40 ? '#d97706' : '#dc2626'
  const bg = score >= 70 ? '#f0fdf4' : score >= 40 ? '#fffbeb' : '#fef2f2'

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wider capitalize">{platform}</p>
        {delta != null && (
          <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${delta >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
            {delta > 0 ? '+' : ''}{delta.toFixed(0)}%
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-1 mb-3">
        <span className="text-3xl font-bold" style={{ color: colour }}>
          {score.toFixed(1)}
        </span>
        <span className="text-base font-semibold" style={{ color: colour }}>%</span>
      </div>
      <div className="w-full rounded-full h-1.5 mb-3" style={{ background: '#f1f5f9' }}>
        <div className="h-1.5 rounded-full" style={{ width: `${score}%`, background: colour }} />
      </div>
      <p className="text-xs text-gray-400">{mentions}/{total} prompts matched</p>
      {avgRank != null && (
        <p className="text-xs text-gray-400 mt-0.5">Avg position: #{avgRank.toFixed(1)}</p>
      )}
    </div>
  )
}

function PromptResultRow({ result, prompt }: { result: AuditResult; prompt: Prompt | undefined }) {
  const statusColour = result.brand_mentioned
    ? 'text-emerald-600 bg-emerald-50'
    : 'text-gray-400 bg-gray-100'

  return (
    <tr className="border-b border-gray-50 hover:bg-gray-50/50">
      <td className="px-5 py-3 text-sm text-gray-700 max-w-xs">
        <p className="truncate">{prompt?.text ?? '—'}</p>
        {prompt?.category && (
          <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full capitalize">
            {prompt.category}
          </span>
        )}
      </td>
      <td className="px-5 py-3 text-xs capitalize text-gray-500">{result.platform}</td>
      <td className="px-5 py-3">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusColour}`}>
          {result.brand_mentioned ? `✓ Rank #${result.brand_rank ?? '?'}` : '✗ Not found'}
        </span>
      </td>
      <td className="px-5 py-3">
        {result.sentiment && (
          <span className={`text-xs capitalize ${
            result.sentiment === 'positive' ? 'text-emerald-600' :
            result.sentiment === 'negative' ? 'text-red-500' : 'text-gray-400'
          }`}>
            {result.sentiment}
          </span>
        )}
      </td>
      <td className="px-5 py-3 text-xs text-gray-400">{result.latency_ms ? `${result.latency_ms}ms` : '—'}</td>
    </tr>
  )
}

// ─── Page ─────────────────────────────────────────────────

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Load client
  const { data: client } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .single()

  if (!client) notFound()

  // Load prompts
  const { data: prompts } = await supabase
    .from('prompts')
    .select('*')
    .eq('client_id', client.id)
    .eq('is_active', true)
    .order('sort_order')

  // Load competitors
  const { data: competitors } = await supabase
    .from('competitors')
    .select('*')
    .eq('client_id', client.id)

  // Load last 6 audits
  const { data: audits } = await supabase
    .from('audits')
    .select('*')
    .eq('client_id', client.id)
    .order('started_at', { ascending: false })
    .limit(6)

  const latestAudit = (audits as Audit[] | null)?.[0]
  const previousAudit = (audits as Audit[] | null)?.[1]

  // Load scores for latest + previous audit
  let latestScores: VisibilityScore[] = []
  let previousScores: VisibilityScore[] = []
  let latestResults: AuditResult[] = []

  if (latestAudit) {
    const { data: scores } = await supabase
      .from('visibility_scores')
      .select('*')
      .eq('audit_id', latestAudit.id)

    latestScores = (scores as VisibilityScore[]) ?? []

    const { data: results } = await supabase
      .from('audit_results')
      .select('*')
      .eq('audit_id', latestAudit.id)
      .order('created_at')

    latestResults = (results as AuditResult[]) ?? []
  }

  if (previousAudit) {
    const { data: scores } = await supabase
      .from('visibility_scores')
      .select('*')
      .eq('audit_id', previousAudit.id)

    previousScores = (scores as VisibilityScore[]) ?? []
  }

  const getScore = (scores: VisibilityScore[], platform: string) =>
    scores.find((s) => s.platform === platform)

  const promptMap = Object.fromEntries((prompts ?? []).map((p: Prompt) => [p.id, p]))

  const mentionedResults = latestResults.filter((r) => r.brand_mentioned)
  const missedResults = latestResults.filter((r) => !r.brand_mentioned)

  // Competitor frequency from latest results
  const competitorFreq: Record<string, number> = {}
  for (const r of latestResults) {
    for (const [name, rank] of Object.entries(r.competitor_data ?? {})) {
      if (rank !== null) {
        competitorFreq[name] = (competitorFreq[name] ?? 0) + 1
      }
    }
  }

  return (
    <div className="min-h-screen bg-[#fafafa]">
      {/* Top nav */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <Link href="/" className="text-gray-400 hover:text-gray-700 transition-colors">Dashboard</Link>
            <span className="text-gray-200">/</span>
            <span className="text-gray-900 font-medium">{(client as Client).name}</span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/clients/${client.id}/edit`}
              className="text-xs text-gray-500 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
            >
              Edit client
            </Link>
            <RunAuditButton clientId={client.id} />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* Client header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{(client as Client).name}</h1>
          <p className="text-sm text-gray-500 mt-1">
            <a href={(client as Client).website} target="_blank" rel="noopener noreferrer" className="hover:underline">
              {(client as Client).website}
            </a>
            {(client as Client).industry && <span className="ml-2 text-gray-300">·</span>}
            {(client as Client).industry && <span className="ml-2">{(client as Client).industry}</span>}
          </p>
          {latestAudit && (
            <p className="text-xs text-gray-400 mt-1">
              Last audit: {new Date(latestAudit.started_at).toLocaleString('en-MY', {
                day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
              })}
            </p>
          )}
        </div>

        {/* Score cards */}
        {latestScores.length > 0 ? (
          <div className="grid grid-cols-4 gap-4">
            {(['overall', 'chatgpt', 'gemini', 'claude'] as const).map((platform) => {
              const current = getScore(latestScores, platform)
              const prev = getScore(previousScores, platform)
              if (!current) return null
              return (
                <ScoreCard
                  key={platform}
                  platform={platform === 'overall' ? 'All platforms' : platform}
                  score={current.score}
                  mentions={current.mentions_count}
                  total={current.total_prompts}
                  avgRank={current.avg_rank}
                  prevScore={prev?.score}
                />
              )
            })}
          </div>
        ) : (
          <div className="bg-white border border-gray-100 rounded-xl p-8 text-center">
            <p className="text-sm text-gray-400">No audit data yet.</p>
            <p className="text-xs text-gray-300 mt-1">Run an audit to see visibility scores.</p>
          </div>
        )}

        {/* Two-column: Prompt results + Competitors */}
        <div className="grid grid-cols-3 gap-6">
          {/* Prompt results table — 2/3 width */}
          <div className="col-span-2 bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-800">Prompt results</h2>
              <div className="flex items-center gap-3 text-xs text-gray-400">
                <span className="text-emerald-600 font-medium">{mentionedResults.length} found</span>
                <span className="text-red-400">{missedResults.length} missing</span>
              </div>
            </div>
            {latestResults.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-400">No results yet</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-50">
                      {['Prompt', 'Platform', 'Status', 'Sentiment', 'Latency'].map((h) => (
                        <th key={h} className="px-5 py-2.5 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {latestResults.map((result) => (
                      <PromptResultRow
                        key={result.id}
                        result={result}
                        prompt={promptMap[result.prompt_id]}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Sidebar — 1/3 width */}
          <div className="space-y-4">
            {/* Competitor frequency */}
            <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">Competitor appearances</h3>
              {Object.keys(competitorFreq).length === 0 ? (
                <p className="text-xs text-gray-400">No competitor data</p>
              ) : (
                <div className="space-y-3">
                  {(competitors as Competitor[])?.map((comp) => {
                    const count = competitorFreq[comp.name] ?? 0
                    const pct = latestResults.length > 0
                      ? (count / latestResults.length) * 100
                      : 0
                    return (
                      <div key={comp.id}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-700">{comp.name}</span>
                          <span className="text-xs text-gray-500">{pct.toFixed(0)}%</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5">
                          <div
                            className="h-1.5 bg-blue-400 rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Audit history */}
            <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">Audit history</h3>
              {!audits?.length ? (
                <p className="text-xs text-gray-400">No audits yet</p>
              ) : (
                <div className="space-y-2">
                  {(audits as Audit[]).map((audit) => (
                    <div key={audit.id} className="flex items-center justify-between text-xs">
                      <span className="text-gray-600">
                        {new Date(audit.started_at).toLocaleDateString('en-MY', {
                          day: 'numeric', month: 'short',
                        })}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded-full capitalize font-medium ${
                        audit.status === 'complete' ? 'bg-emerald-50 text-emerald-600' :
                        audit.status === 'failed' ? 'bg-red-50 text-red-500' :
                        audit.status === 'running' ? 'bg-blue-50 text-blue-600' :
                        'bg-gray-100 text-gray-400'
                      }`}>
                        {audit.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Prompts summary */}
            <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-800">Tracked prompts</h3>
                <span className="text-xs text-gray-400">{prompts?.length ?? 0}</span>
              </div>
              {!prompts?.length ? (
                <p className="text-xs text-gray-400">No prompts configured</p>
              ) : (
                <div className="space-y-2">
                  {(prompts as Prompt[]).slice(0, 6).map((prompt) => (
                    <p key={prompt.id} className="text-xs text-gray-600 leading-relaxed truncate">
                      {prompt.text}
                    </p>
                  ))}
                  {(prompts?.length ?? 0) > 6 && (
                    <p className="text-xs text-gray-400">+{(prompts?.length ?? 0) - 6} more</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

function RunAuditButton({ clientId }: { clientId: string }) {
  return (
    <button
      className="text-xs font-medium bg-black text-white px-3 py-1.5 rounded-lg hover:bg-gray-800 transition-colors"
    >
      Run audit
    </button>
  )
}

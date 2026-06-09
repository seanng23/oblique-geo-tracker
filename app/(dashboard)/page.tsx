import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Client, VisibilityScore } from '@/lib/types'

function ScorePill({ score, delta }: { score: number | null; delta?: number | null }) {
  if (score === null) return <span className="text-gray-300 text-sm">—</span>

  const colour =
    score >= 70 ? 'text-emerald-600 bg-emerald-50' :
    score >= 40 ? 'text-amber-600 bg-amber-50' :
                  'text-red-600 bg-red-50'

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${colour}`}>
      {score.toFixed(0)}%
      {delta != null && (
        <span className={`text-[10px] ${delta >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>
          {delta > 0 ? '+' : ''}{delta.toFixed(0)}
        </span>
      )}
    </span>
  )
}

function PlatformBar({ label, score }: { label: string; score: number | null }) {
  const pct = score ?? 0
  const colour = pct >= 70 ? 'bg-emerald-400' : pct >= 40 ? 'bg-amber-400' : 'bg-red-400'
  return (
    <div className="flex items-center gap-2 text-xs text-gray-500">
      <span className="w-20 truncate">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
        <div className={`h-full ${colour} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right text-gray-700 font-medium">
        {score !== null ? `${score.toFixed(0)}%` : '—'}
      </span>
    </div>
  )
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Load all active clients
  const { data: clients } = await supabase
    .from('clients')
    .select('*')
    .eq('is_active', true)
    .order('name', { ascending: true })

  // Load latest audit + scores per client
  const clientIds = (clients ?? []).map((c: Client) => c.id)

  let scoresByClient: Record<string, VisibilityScore[]> = {}
  let latestAuditByClient: Record<string, any> = {}

  if (clientIds.length > 0) {
    // Latest completed audit per client
    const { data: audits } = await supabase
      .from('audits')
      .select('id, client_id, started_at, status')
      .in('client_id', clientIds)
      .eq('status', 'complete')
      .order('started_at', { ascending: false })

    // Index latest audit per client
    for (const audit of audits ?? []) {
      if (!latestAuditByClient[audit.client_id]) {
        latestAuditByClient[audit.client_id] = audit
      }
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

  return (
    <div className="min-h-screen bg-[#fafafa]">
      {/* Top nav */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 bg-black rounded-sm" />
            <span className="font-semibold text-[14px] tracking-tight text-gray-900">Oblique GEO</span>
            <span className="text-gray-300 text-sm">/</span>
            <span className="text-sm text-gray-500">Dashboard</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-gray-400">
              {now.toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
            <Link
              href="/clients/new"
              className="inline-flex items-center gap-1.5 bg-black text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-gray-800 transition-colors"
            >
              <span>+</span> Add client
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Stats row */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Active clients', value: clients?.length ?? 0 },
            {
              label: 'Avg visibility score',
              value: (() => {
                const overallScores = Object.values(scoresByClient)
                  .flatMap((s) => s)
                  .filter((s) => s.platform === 'overall')
                if (!overallScores.length) return '—'
                const avg = overallScores.reduce((s, v) => s + v.score, 0) / overallScores.length
                return `${avg.toFixed(1)}%`
              })(),
            },
            {
              label: 'Audits this month',
              value: (() => {
                const count = Object.values(latestAuditByClient).filter((a: any) => {
                  const d = new Date(a.started_at)
                  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
                }).length
                return count
              })(),
            },
            { label: 'Reports sent', value: '—' },
          ].map((stat) => (
            <div key={stat.label} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
              <p className="text-xs text-gray-400 mb-1">{stat.label}</p>
              <p className="text-2xl font-semibold text-gray-900">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Client table */}
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-800">Clients</h2>
            <span className="text-xs text-gray-400">{clients?.length ?? 0} active</span>
          </div>

          {!clients?.length ? (
            <div className="py-16 text-center">
              <p className="text-sm text-gray-400">No clients yet.</p>
              <Link href="/clients/new" className="text-sm text-blue-600 hover:underline mt-1 inline-block">
                Add your first client
              </Link>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-50">
                  {['Client', 'Industry', 'Overall', 'ChatGPT / Gemini / Perplexity', 'Last audit', 'Actions'].map((h) => (
                    <th
                      key={h}
                      className="px-6 py-3 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  ))}
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
                    <tr
                      key={client.id}
                      className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors group"
                    >
                      {/* Client name */}
                      <td className="px-6 py-4">
                        <Link href={`/clients/${client.id}`} className="block">
                          <p className="text-sm font-medium text-gray-900 group-hover:text-black">
                            {client.name}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">{client.website}</p>
                        </Link>
                      </td>

                      {/* Industry */}
                      <td className="px-6 py-4">
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                          {client.industry ?? '—'}
                        </span>
                      </td>

                      {/* Overall score */}
                      <td className="px-6 py-4">
                        <ScorePill score={overall?.score ?? null} />
                      </td>

                      {/* Platform breakdown */}
                      <td className="px-6 py-4 min-w-[220px]">
                        <div className="space-y-1.5">
                          <PlatformBar label="ChatGPT" score={chatgpt?.score ?? null} />
                          <PlatformBar label="Gemini" score={gemini?.score ?? null} />
                          <PlatformBar label="Claude" score={claude?.score ?? null} />
                        </div>
                      </td>

                      {/* Last audit */}
                      <td className="px-6 py-4 text-xs text-gray-500">
                        {latestAudit
                          ? new Date(latestAudit.started_at).toLocaleDateString('en-MY', {
                              day: 'numeric', month: 'short', year: 'numeric',
                            })
                          : <span className="text-gray-300">Never</span>
                        }
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Link
                            href={`/clients/${client.id}`}
                            className="text-xs text-gray-600 hover:text-black px-2 py-1 rounded hover:bg-gray-100 transition-colors"
                          >
                            View
                          </Link>
                          <RunAuditButton clientId={client.id} />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Accuracy disclaimer */}
        <p className="text-xs text-gray-400 mt-6 leading-relaxed max-w-2xl">
          Visibility scores reflect the percentage of tracked prompts in which your client's brand appeared in live API responses from ChatGPT, Gemini, and Perplexity. Scores are approximate — AI responses are non-deterministic and may vary between runs. No data is fabricated.
        </p>
      </main>
    </div>
  )
}

// Thin client component for the audit button (needs interactivity)
function RunAuditButton({ clientId }: { clientId: string }) {
  return (
    <form action={`/api/audit/run`} method="POST">
      <input type="hidden" name="client_id" value={clientId} />
      <button
        type="submit"
        className="text-xs font-medium text-blue-600 hover:text-blue-700 px-2 py-1 rounded hover:bg-blue-50 transition-colors"
      >
        Run audit
      </button>
    </form>
  )
}

'use client'

import { useState } from 'react'
import type { Platform, Sentiment, MentionStatus } from '@/lib/types'

export interface PromptRow {
  id: string
  promptText: string
  category: string | null
  platform: Platform
  brand_mentioned: boolean
  brand_rank: number | null
  mention_status: MentionStatus
  sentiment: Sentiment | null
  latency_ms: number | null
}

// Default grouping order requested for review: Gemini, then Claude, then ChatGPT.
const PLATFORM_ORDER: Platform[] = ['gemini', 'claude', 'chatgpt']
const PLATFORM_LABEL: Record<Platform, string> = { gemini: 'Gemini', claude: 'Claude', chatgpt: 'ChatGPT' }

export default function PromptResultsTable({ rows, auditDate }: { rows: PromptRow[]; auditDate: string | null }) {
  const [filter, setFilter] = useState<'all' | Platform>('all')

  const visible = (filter === 'all' ? rows : rows.filter((r) => r.platform === filter))
    .slice()
    .sort((a, b) => {
      const pa = PLATFORM_ORDER.indexOf(a.platform)
      const pb = PLATFORM_ORDER.indexOf(b.platform)
      if (pa !== pb) return pa - pb
      // Keep mentioned rows above misses within a platform group
      if (a.brand_mentioned !== b.brand_mentioned) return a.brand_mentioned ? -1 : 1
      return 0
    })

  const found = visible.filter((r) => r.brand_mentioned).length
  const missing = visible.length - found

  const chips: ('all' | Platform)[] = ['all', 'gemini', 'claude', 'chatgpt']

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Prompt results</span>
          <div style={{ display: 'flex', gap: 10, fontSize: 11.5 }}>
            <span style={{ color: 'var(--success)', fontWeight: 500 }}>✓ {found} found</span>
            <span style={{ color: 'var(--danger)' }}>✗ {missing} missing</span>
          </div>
        </div>
        {/* Platform filter / grouping */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'var(--surface-2)', borderRadius: 8, padding: 3, width: 'fit-content' }}>
          {chips.map((ch) => {
            const on = filter === ch
            return (
              <button
                key={ch}
                onClick={() => setFilter(ch)}
                style={{
                  padding: '4px 11px', borderRadius: 6, fontSize: 11.5, fontWeight: 500, border: 'none', cursor: 'pointer',
                  fontFamily: 'var(--font)',
                  color: on ? 'var(--ink)' : 'var(--faint)',
                  background: on ? 'var(--bg)' : 'transparent',
                  boxShadow: on ? 'var(--shadow-sm)' : 'none',
                }}
              >
                {ch === 'all' ? 'All platforms' : PLATFORM_LABEL[ch]}
              </button>
            )
          })}
        </div>
      </div>

      {visible.length === 0 ? (
        <div style={{ padding: '40px 0', textAlign: 'center', fontSize: 13, color: 'var(--faint)' }}>No results for this platform</div>
      ) : (
        <table className="tbl">
          <thead>
            <tr><th>Prompt</th><th>Platform</th><th>Status</th><th>Sentiment</th><th>Latency</th></tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.id}>
                <td>
                  <div style={{ fontSize: 12.5, maxWidth: 240, lineHeight: 1.4 }}>{r.promptText}</div>
                  {r.category && <span className="pill p-grey" style={{ fontSize: 9.5, marginTop: 4 }}>{r.category}</span>}
                </td>
                <td style={{ fontSize: 11.5, color: 'var(--muted)' }}>{PLATFORM_LABEL[r.platform]}</td>
                <td>
                  <span className={`pill ${r.brand_mentioned ? (r.mention_status === 'outranked' ? 'p-weak' : 'p-green') : 'p-grey'}`}>
                    {r.brand_mentioned
                      ? (r.brand_rank != null ? `✓ Rank #${r.brand_rank}` : '✓ Mentioned')
                      : '✗ Not found'}
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
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

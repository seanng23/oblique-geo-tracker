import type { HallucinationFlag } from '@/lib/types'
import type { Suggestion } from '@/lib/insights'

const PRIORITY: Record<Suggestion['priority'], { pill: string; label: string }> = {
  high: { pill: 'p-red', label: 'High' },
  medium: { pill: 'p-amber', label: 'Medium' },
  low: { pill: 'p-grey', label: 'Low' },
}

const PLATFORM_LABEL: Record<string, string> = { chatgpt: 'ChatGPT', gemini: 'Gemini', claude: 'Claude' }

/**
 * Internal-only panel: GEO suggestions + hallucination risk. Marked clearly so
 * staff don't paste it into client decks — none of this appears in the report.
 */
export default function InternalInsights({
  suggestions,
  flags,
}: {
  suggestions: Suggestion[]
  flags: HallucinationFlag[]
}) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>Internal insights</span>
        <span className="pill" style={{ background: 'var(--ink)', color: 'var(--bg)', fontSize: 10 }}>Internal only — not in client report</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Suggestions */}
        <div className="card cp">
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>GEO suggestions</div>
          <div style={{ fontSize: 11, color: 'var(--faint)', marginBottom: 14 }}>Recommended actions derived from this audit</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {suggestions.map((s, i) => (
              <div key={i} style={{ borderBottom: i < suggestions.length - 1 ? '1px solid var(--border)' : 'none', paddingBottom: i < suggestions.length - 1 ? 12 : 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span className={`pill ${PRIORITY[s.priority].pill}`} style={{ fontSize: 9.5 }}>{PRIORITY[s.priority].label}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>{s.title}</span>
                </div>
                <p style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.6 }}>{s.detail}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Hallucination risk */}
        <div className="card cp">
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>Hallucination risk</div>
          <div style={{ fontSize: 11, color: 'var(--faint)', marginBottom: 14 }}>
            AI claims about the brand that may be inaccurate — verify before acting
          </div>
          {flags.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
              <span style={{ color: 'var(--success)', fontSize: 13 }}>✓</span>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>No suspicious claims detected in this audit.</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {flags.map((f, i) => {
                const alert = f.severity === 'alert'
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, borderBottom: i < flags.length - 1 ? '1px solid var(--border)' : 'none', paddingBottom: i < flags.length - 1 ? 10 : 0 }}>
                    <span
                      style={{
                        width: 20, height: 20, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11,
                        background: alert ? 'var(--danger-bg)' : 'var(--warning-bg)',
                        color: alert ? 'var(--danger)' : 'var(--warning)',
                      }}
                    >
                      {alert ? '!' : '?'}
                    </span>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 11.5, color: 'var(--ink)', lineHeight: 1.55 }}>&ldquo;{f.claim}&rdquo;</p>
                      <p style={{ fontSize: 10.5, color: 'var(--faint)', marginTop: 3 }}>
                        {PLATFORM_LABEL[f.platform] ?? f.platform} · {f.severity === 'alert' ? 'Likely inaccurate' : 'Unverified'}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

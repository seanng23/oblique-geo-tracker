interface Pt {
  label: string
  overall: number | null
  chatgpt: number | null
  gemini: number | null
  claude: number | null
}

const SERIES = [
  { key: 'overall', label: 'Overall', color: 'var(--ink)' },
  { key: 'chatgpt', label: 'ChatGPT', color: 'var(--success)' },
  { key: 'gemini', label: 'Gemini', color: 'var(--info)' },
  { key: 'claude', label: 'Claude', color: 'var(--purple)' },
] as const

/**
 * Visibility-over-time chart, drawn from the real stored audit snapshots.
 * Each audit with scores is one point on the x-axis. Sparse until several
 * audits accumulate — with a single audit it shows dots + a hint.
 */
export default function TrendChart({ points }: { points: Pt[] }) {
  const W = 720, H = 188, padL = 34, padR = 14, padT = 14, padB = 28
  const n = points.length
  const innerW = W - padL - padR
  const x = (i: number) => (n <= 1 ? padL + innerW / 2 : padL + (i * innerW) / (n - 1))
  const y = (v: number) => padT + (1 - v / 100) * (H - padT - padB)

  const gridY = [0, 25, 50, 75, 100]

  return (
    <div className="card cp" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Visibility trend</div>
          <div style={{ fontSize: 11, color: 'var(--faint)', marginTop: 2 }}>
            AI visibility score over time — one point per audit
          </div>
        </div>
        <div className="trend-legend">
          {SERIES.map((s) => (
            <span key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--muted)' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 188, overflow: 'visible' }}>
        {gridY.map((g) => (
          <g key={g}>
            <line x1={padL} y1={y(g)} x2={W - padR} y2={y(g)} stroke="var(--border)" strokeWidth="1" />
            <text x={padL - 6} y={y(g) + 3} textAnchor="end" fontSize="9" fill="var(--faint)">{g}%</text>
          </g>
        ))}

        {points.map((p, i) => (
          <text key={i} x={x(i)} y={H - 10} textAnchor="middle" fontSize="9" fill="var(--faint)">{p.label}</text>
        ))}

        {SERIES.map((s) => {
          const pts = points
            .map((p, i) => ({ i, v: p[s.key] as number | null }))
            .filter((d) => d.v !== null) as { i: number; v: number }[]
          if (pts.length === 0) return null
          const poly = pts.map((d) => `${x(d.i)},${y(d.v)}`).join(' ')
          return (
            <g key={s.key}>
              {pts.length > 1 && (
                <polyline points={poly} fill="none" stroke={s.color} strokeWidth={s.key === 'overall' ? 2.5 : 2} strokeLinejoin="round" strokeLinecap="round" />
              )}
              {pts.map((d) => (
                <circle key={d.i} cx={x(d.i)} cy={y(d.v)} r={s.key === 'overall' ? 3.5 : 3} fill={s.color} />
              ))}
            </g>
          )
        })}
      </svg>

      {n <= 1 && (
        <div style={{ fontSize: 11, color: 'var(--faint)', marginTop: 6, textAlign: 'center' }}>
          Run more audits to build the trend line — each audit adds a point.
        </div>
      )}
    </div>
  )
}

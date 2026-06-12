'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface ReportRow {
  id: string
  report_month: string
  status: 'generating' | 'ready' | 'sent' | 'failed'
  generated_at: string
}

const STATUS_PILL: Record<ReportRow['status'], string> = {
  ready: 'p-green',
  sent: 'p-green',
  generating: 'p-blue',
  failed: 'p-red',
}

export default function ReportsCard({
  reports,
  latestCompleteAuditId,
}: {
  reports: ReportRow[]
  latestCompleteAuditId: string | null
}) {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'generating' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(null)

  async function generate() {
    if (!latestCompleteAuditId) return
    setState('generating')
    setMessage(null)
    try {
      const res = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audit_id: latestCompleteAuditId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setState('error')
        setMessage(data.error ?? 'Failed to generate report')
        return
      }
      // Narrative takes ~20-40s; refresh the page periodically until ready
      const poll = setInterval(() => router.refresh(), 6000)
      setTimeout(() => { clearInterval(poll); setState('idle'); router.refresh() }, 60000)
    } catch {
      setState('error')
      setMessage('Network error')
    }
  }

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Reports</span>
          <span style={{ fontSize: 11, color: 'var(--faint)', marginLeft: 8 }}>Generated from the latest audit · download as PDF</span>
        </div>
        <button
          className="btn btn-dark"
          onClick={generate}
          disabled={state === 'generating' || !latestCompleteAuditId}
          title={latestCompleteAuditId ? '' : 'Run a completed audit first'}
        >
          {state === 'generating' ? 'Generating…' : 'Generate report'}
        </button>
      </div>

      {message && (
        <div style={{ padding: '10px 20px', fontSize: 12, color: 'var(--danger)' }}>{message}</div>
      )}

      <div style={{ padding: '4px 20px 8px' }}>
        {reports.length === 0 ? (
          <div style={{ padding: '24px 0', textAlign: 'center' }}>
            <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>No reports yet.</p>
            <p style={{ fontSize: 11, color: 'var(--faint)', marginTop: 3 }}>
              {latestCompleteAuditId ? 'Generate one from the latest audit.' : 'Run an audit first, then generate a report.'}
            </p>
          </div>
        ) : (
          reports.map((r) => (
            <div key={r.id} className="report-row">
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: r.status === 'failed' ? 'var(--faint)' : 'var(--ink)' }}>
                  {new Date(r.report_month).toLocaleString('en-MY', { month: 'long', year: 'numeric' })} Report
                </div>
                <div style={{ fontSize: 11, color: 'var(--faint)', marginTop: 2 }}>
                  Generated {new Date(r.generated_at).toLocaleString('en-MY', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className={`pill ${STATUS_PILL[r.status]}`} style={{ textTransform: 'capitalize' }}>{r.status}</span>
                {(r.status === 'ready' || r.status === 'sent') ? (
                  <a
                    className="btn btn-ghost"
                    href={`/api/reports/${r.id}/download`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    ⬇ Download PDF
                  </a>
                ) : (
                  <button className="btn btn-ghost" disabled style={{ opacity: 0.4 }}>⬇ Download PDF</button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

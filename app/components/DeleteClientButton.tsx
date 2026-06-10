'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function DeleteClientButton({ clientId, clientName }: { clientId: string; clientName: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirmDelete() {
    setDeleting(true)
    setError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Failed to delete')
        setDeleting(false)
        return
      }
      router.push('/')
      router.refresh()
    } catch {
      setError('Network error')
      setDeleting(false)
    }
  }

  return (
    <>
      <button className="btn btn-ghost" style={{ color: 'var(--danger)', borderColor: 'var(--danger-border)' }} onClick={() => setOpen(true)}>
        Delete
      </button>

      {open && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'oklch(0 0 0 / .40)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)' }}
          onClick={() => !deleting && setOpen(false)}
        >
          <div
            className="card"
            style={{ width: '100%', maxWidth: 420, boxShadow: 'var(--shadow-lg)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-.01em' }}>Delete project</h3>
            </div>
            <div style={{ padding: 22 }}>
              <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
                Permanently delete <strong style={{ color: 'var(--ink)' }}>{clientName}</strong> and all of its prompts,
                competitors, audits, and reports? This cannot be undone.
              </p>
              {error && (
                <p style={{ fontSize: 12, color: 'var(--danger)', marginTop: 10 }}>{error}</p>
              )}
            </div>
            <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setOpen(false)} disabled={deleting}>Cancel</button>
              <button
                className="btn"
                style={{ background: 'var(--danger)', color: '#fff' }}
                onClick={confirmDelete}
                disabled={deleting}
              >
                {deleting ? 'Deleting…' : 'Delete project'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

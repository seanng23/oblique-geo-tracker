'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Item {
  id: string
  status: 'pending' | 'running' | 'complete' | 'failed'
  started_at: string
  completed_at: string | null
  client_id: string
  client_name: string
}

const SEEN_KEY = 'oblique_notif_seen'

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return new Date(iso).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })
}

const META: Record<Item['status'], { icon: string; color: string; label: string }> = {
  complete: { icon: '✓', color: 'var(--success)', label: 'Audit complete' },
  failed: { icon: '✗', color: 'var(--danger)', label: 'Audit failed' },
  running: { icon: '●', color: 'var(--info)', label: 'Audit running' },
  pending: { icon: '○', color: 'var(--faint)', label: 'Audit queued' },
}

export default function NotificationBell() {
  const router = useRouter()
  const [items, setItems] = useState<Item[]>([])
  const [open, setOpen] = useState(false)
  const [seenAt, setSeenAt] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  async function load() {
    try {
      const res = await fetch('/api/notifications')
      if (!res.ok) return
      const data = await res.json()
      setItems(data.items ?? [])
    } catch { /* ignore */ }
  }

  useEffect(() => {
    setSeenAt(Number(localStorage.getItem(SEEN_KEY) ?? 0))
    load()
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  // Unread = finished audits (complete/failed) newer than the last time the user opened the bell.
  const unread = items.filter(
    (i) => (i.status === 'complete' || i.status === 'failed') && new Date(i.completed_at ?? i.started_at).getTime() > seenAt
  ).length

  function toggle() {
    const next = !open
    setOpen(next)
    if (next) {
      const now = Date.now()
      localStorage.setItem(SEEN_KEY, String(now))
      setSeenAt(now)
    }
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="bell-btn" onClick={toggle} aria-label="Notifications">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && <span className="bell-dot" />}
      </button>

      {open && (
        <div
          className="card"
          style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', width: 320, zIndex: 500, boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}
        >
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Notifications</span>
            <span style={{ fontSize: 11, color: 'var(--faint)' }}>Recent audit activity</span>
          </div>
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {items.length === 0 ? (
              <div style={{ padding: '28px 16px', textAlign: 'center', fontSize: 12.5, color: 'var(--faint)' }}>
                No activity yet. Run an audit to get started.
              </div>
            ) : (
              items.map((i) => {
                const m = META[i.status]
                return (
                  <button
                    key={i.id}
                    onClick={() => { setOpen(false); router.push(`/clients/${i.client_id}`) }}
                    style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 16px', borderBottom: '1px solid var(--border)', background: 'transparent', border: 'none', borderLeft: 'none', borderRight: 'none', cursor: 'pointer', fontFamily: 'var(--font)' }}
                  >
                    <span style={{ color: m.color, fontSize: 13, lineHeight: 1.4, width: 14, flexShrink: 0 }}>{m.icon}</span>
                    <span style={{ flex: 1 }}>
                      <span style={{ display: 'block', fontSize: 12.5, color: 'var(--ink)', fontWeight: 500 }}>
                        {m.label} — {i.client_name}
                      </span>
                      <span style={{ display: 'block', fontSize: 11, color: 'var(--faint)', marginTop: 1 }}>
                        {timeAgo(i.completed_at ?? i.started_at)}
                      </span>
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

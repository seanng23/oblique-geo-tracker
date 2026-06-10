'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import ObliqueLogo from '@/app/components/ObliqueLogo'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/')
      router.refresh()
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--surface)',
      }}
    >
      <div style={{ width: '100%', maxWidth: 380, padding: '40px 20px' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9, marginBottom: 18 }}>
            <ObliqueLogo size={24} />
            <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-.01em', color: 'var(--ink)' }}>
              Oblique GEO
            </span>
          </div>
          <div style={{ fontSize: 19, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-.02em' }}>
            Staff sign in
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 5 }}>Internal access only</div>
        </div>

        <form onSubmit={handleLogin} className="card cp" style={{ boxShadow: 'var(--shadow)' }}>
          {error && (
            <div
              style={{
                background: 'var(--danger-bg)',
                border: '1px solid var(--danger-border)',
                color: 'var(--danger)',
                fontSize: 12.5,
                padding: '10px 12px',
                borderRadius: 'var(--r)',
                marginBottom: 16,
              }}
            >
              {error}
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              className="form-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@oblique.com.my"
            />
          </div>
          <div className="form-group" style={{ marginBottom: 22 }}>
            <label className="form-label">Password</label>
            <input
              className="form-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="btn btn-dark"
            style={{ width: '100%', justifyContent: 'center', padding: 11, fontSize: 13 }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--faint)', marginTop: 14 }}>
          Access restricted to Oblique staff.
        </div>
      </div>
    </div>
  )
}

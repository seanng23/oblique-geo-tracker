import type { Platform } from '@/lib/types'

const LABELS: Record<Platform, string> = { chatgpt: 'ChatGPT', gemini: 'Gemini', claude: 'Claude' }
const BILLING_LINKS: Record<Platform, string> = {
  chatgpt: 'https://platform.openai.com/settings/organization/billing/overview',
  gemini: 'https://aistudio.google.com/app/apikey',
  claude: 'https://console.anthropic.com/settings/billing',
}

/**
 * Renders a warning when one or more platforms returned no data in the latest
 * audit(s). A platform with a valid key but no quota/billing errors out and
 * produces zero result rows, so "missing entirely" is a reliable signal that
 * its API key needs attention (usually billing).
 */
export default function BillingAlert({ missing, scope }: { missing: Platform[]; scope: 'all clients' | 'this audit' }) {
  if (!missing.length) return null

  const names = missing.map((p) => LABELS[p])
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  const verb = missing.length === 1 ? 'returned' : 'returned'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '12px 16px',
        background: 'var(--warning-bg)',
        border: '1px solid var(--warning-border)',
        borderRadius: 'var(--r-md)',
        marginBottom: 20,
      }}
    >
      <span style={{ fontSize: 14, lineHeight: 1.2, marginTop: 1 }}>⚠️</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--warning)' }}>
          {list} {verb} no data in {scope === 'all clients' ? 'recent audits' : 'this audit'}.
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--warning)', opacity: 0.85, marginTop: 2, lineHeight: 1.6 }}>
          The API key is reaching its limit — usually a billing or quota issue. Review billing:{' '}
          {missing.map((p, i) => (
            <span key={p}>
              <a href={BILLING_LINKS[p]} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--warning)', textDecoration: 'underline', fontWeight: 600 }}>
                {LABELS[p]}
              </a>
              {i < missing.length - 1 ? ', ' : ''}
            </span>
          ))}
          . Once resolved, run the audit again.
        </div>
      </div>
    </div>
  )
}

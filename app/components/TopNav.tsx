import Link from 'next/link'
import NotificationBell from './NotificationBell'
import ObliqueLogo from './ObliqueLogo'

interface Crumb {
  label: string
  href?: string
}

/**
 * Shared top navigation: back button, Oblique logo + brand, breadcrumb trail,
 * page-specific actions, and the notification bell. Used on every page so
 * navigation is identical everywhere.
 */
export default function TopNav({
  crumbs,
  back,
  actions,
}: {
  crumbs: Crumb[]
  back?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="topnav">
      <div className="nav-left">
        {back && (
          <Link href={back} className="nav-back" aria-label="Back" title="Back">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
            </svg>
          </Link>
        )}
        <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <ObliqueLogo size={22} />
          <span className="nav-brand">Oblique GEO</span>
        </Link>
        {crumbs.map((c, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span className="nav-sep">/</span>
            {c.href ? (
              <Link href={c.href} className="nav-dim">{c.label}</Link>
            ) : (
              <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{c.label}</span>
            )}
          </span>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {actions}
        <NotificationBell />
      </div>
    </div>
  )
}

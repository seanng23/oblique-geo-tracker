import { NextRequest, NextResponse } from 'next/server'
import { runPublicAudit } from '@/lib/audit-engine/public-audit'
import { createServiceClient } from '@/lib/supabase/server'

// Each site can run one public audit per this many days (cost control).
const PER_SITE_COOLDOWN_DAYS = 30

// Normalise a website to its root domain so re-runs of the same site are caught
// regardless of protocol/www/path (https://www.petico.my/shop -> petico.my).
function normalizeDomain(website: string): string {
  return website
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split('/')[0]
    .split('?')[0]
    .trim()
    .toLowerCase()
}

// This endpoint runs live AI queries, so it needs the Node runtime and the full
// serverless time budget. (Hobby caps at 60s; the public audit uses a small
// parallel prompt set to stay inside it.)
export const runtime = 'nodejs'
export const maxDuration = 60

// Origins allowed to call this public endpoint (the AI Visibility Checker).
const ALLOWED_ORIGINS = [
  'https://ai-visibility-checker.oblique.com.my',
  'https://ai-visibility-checker-mu.vercel.app',
]

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && (ALLOWED_ORIGINS.includes(origin) || origin.endsWith('.vercel.app'))
    ? origin
    : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  }
}

// Lightweight in-memory rate limit (per IP). Note: serverless instances are
// ephemeral, so this is a soft guard, not bulletproof — for hard limits, move to
// Upstash/Redis. The email gate on the form is the primary friction.
const HITS = new Map<string, number[]>()
const WINDOW_MS = 60 * 60 * 1000 // 1 hour
const MAX_PER_WINDOW = 5

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const recent = (HITS.get(ip) ?? []).filter((t) => now - t < WINDOW_MS)
  if (recent.length >= MAX_PER_WINDOW) return true
  recent.push(now)
  HITS.set(ip, recent)
  return false
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request.headers.get('origin')) })
}

export async function POST(request: NextRequest) {
  const headers = corsHeaders(request.headers.get('origin'))
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'

  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: 'Too many audits from this connection. Please try again later.' },
      { status: 429, headers }
    )
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400, headers })
  }

  const brand = String(body.brand ?? '').trim()
  const website = String(body.website ?? '').trim()
  if (!brand || !website) {
    return NextResponse.json({ error: 'Brand and website are required.' }, { status: 400, headers })
  }

  const domain = normalizeDomain(website)
  const email = String(body.email ?? '').trim() || null
  const db = createServiceClient()

  // Per-site cooldown: one audit per domain per 30 days. Checked BEFORE running so
  // a repeat request costs nothing (no AI calls fired).
  try {
    const since = new Date(Date.now() - PER_SITE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString()
    const { data: recent } = await db
      .from('public_audit_log')
      .select('created_at')
      .eq('domain', domain)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (recent?.created_at) {
      const next = new Date(new Date(recent.created_at).getTime() + PER_SITE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000)
      const nextStr = next.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
      return NextResponse.json(
        { error: `${domain} was already audited recently. Each site can be checked once a month — you can run it again from ${nextStr}.`, code: 'rate_limited_site' },
        { status: 429, headers }
      )
    }
  } catch (e) {
    // If the cooldown check fails (e.g. table missing), log and continue rather than
    // blocking the audit — the per-IP limit still applies.
    console.error('[public-audit] cooldown check failed:', e instanceof Error ? e.message : e)
  }

  try {
    const result = await runPublicAudit({
      brand,
      website,
      industry: String(body.industry ?? '').trim(),
      competitors: Array.isArray(body.competitors) ? body.competitors.map(String).slice(0, 3) : [],
      keywords: Array.isArray(body.keywords) ? body.keywords.map(String).slice(0, 5) : [],
    })

    // Record the successful audit so the same site is on cooldown for 30 days.
    // Awaited so the row is durably written before the function freezes.
    try {
      await db.from('public_audit_log').insert({ domain, email, ip, brand })
    } catch (e) {
      console.error('[public-audit] log insert failed:', e instanceof Error ? e.message : e)
    }

    return NextResponse.json({ ok: true, result }, { status: 200, headers })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Audit failed'
    console.error('[public-audit] error:', message)
    return NextResponse.json({ error: 'The audit could not complete. Please try again.' }, { status: 500, headers })
  }
}

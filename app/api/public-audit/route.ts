import { NextRequest, NextResponse } from 'next/server'
import { runPublicAudit } from '@/lib/audit-engine/public-audit'

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

  try {
    const result = await runPublicAudit({
      brand,
      website,
      industry: String(body.industry ?? '').trim(),
      competitors: Array.isArray(body.competitors) ? body.competitors.map(String).slice(0, 3) : [],
      keywords: Array.isArray(body.keywords) ? body.keywords.map(String).slice(0, 5) : [],
    })
    return NextResponse.json({ ok: true, result }, { status: 200, headers })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Audit failed'
    console.error('[public-audit] error:', message)
    return NextResponse.json({ error: 'The audit could not complete. Please try again.' }, { status: 500, headers })
  }
}

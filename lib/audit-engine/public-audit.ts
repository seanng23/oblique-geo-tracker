/**
 * Public audit — the lightweight, synchronous audit that powers the public
 * AI Visibility Checker (ai-visibility-checker.oblique.com.my).
 *
 * Unlike the internal runAudit() (which is Supabase-coupled, async, and runs a
 * full prompt set with pacing delays), this runs a SMALL prompt set across the
 * three engines IN PARALLEL and returns real metrics synchronously, so the
 * public tool can show live results inside the serverless time budget.
 *
 * Every number here comes from a live API response parsed by the same parser
 * the internal engine uses. Nothing is fabricated.
 */

import { queryChatGPT } from './openai'
import { queryGemini } from './gemini'
import { queryClaude } from './claude'
import { parseBrandMention, parseCompetitorMentions, extractCitationDomains, isClientDomainCited } from './parser'
import type { Platform, Sentiment } from '@/lib/types'

const PLATFORMS: { key: Platform; label: string; run: (t: string, id: string) => Promise<{ raw_response: string; citations?: string[] }> }[] = [
  { key: 'chatgpt', label: 'ChatGPT', run: queryChatGPT },
  { key: 'gemini', label: 'Google Gemini', run: queryGemini },
  { key: 'claude', label: 'Claude', run: queryClaude },
]

export interface PublicAuditInput {
  brand: string
  website: string
  industry: string
  competitors: string[]
  keywords: string[]
}

export interface PublicAuditResult {
  brand: string
  website: string
  industry: string
  location: string | null
  promptsTested: number
  platforms: Array<{ key: Platform; label: string; mentions: number; total: number; visibilityPct: number }>
  overallVisibilityPct: number
  competitors: Array<{ name: string; mentions: number; total: number; visibilityPct: number }>
  topCompetitor: { name: string; visibilityPct: number } | null
  domainCited: boolean
  sentiment: Sentiment
  prompts: string[]
  errors: string[]
}

/** Infer a market qualifier from the website TLD so prompts read like a local buyer. */
function inferLocation(website: string): string | null {
  const host = website.replace(/^https?:\/\/(www\.)?/i, '').toLowerCase()
  if (host.endsWith('.my') || host.includes('.com.my')) return 'Malaysia'
  if (host.endsWith('.sg') || host.includes('.com.sg')) return 'Singapore'
  if (host.endsWith('.id') || host.includes('.co.id')) return 'Indonesia'
  if (host.endsWith('.th') || host.includes('.co.th')) return 'Thailand'
  if (host.endsWith('.ph')) return 'the Philippines'
  return null
}

/** Build a small set of buyer-intent prompts from the form inputs. */
function buildPrompts(input: PublicAuditInput, location: string | null): string[] {
  const where = location ? ` in ${location}` : ''
  const industry = input.industry.replace(/\s*\(other\)$/i, '').trim() || 'this category'
  const kw = input.keywords.filter(Boolean)

  const prompts = [
    `What are the best ${industry} brands${where}?`,
    `Can you recommend a trusted ${industry} company${where}?`,
  ]
  if (kw[0]) prompts.push(`Who are the top providers of ${kw[0]}${where}?`)
  if (kw[1]) prompts.push(`I'm looking for ${kw[1]}${where}. What are my best options?`)
  prompts.push(`Which ${industry} companies${where} would you suggest for someone buying for the first time?`)

  // Cap at 5 to stay inside the serverless time + cost budget.
  return prompts.slice(0, 5)
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)) }

// Retry transient failures (503 overloaded / 429 rate limit). Kept short so the
// whole parallel batch still finishes inside the serverless budget. Without this,
// a provider's temporary 503 silently shrinks its denominator and skews the score.
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (i < attempts - 1) {
        const msg = err instanceof Error ? err.message : String(err)
        const transient = /\b(429|503|500|502|504|overload|rate limit|unavailable|high demand)\b/i.test(msg)
        if (!transient) break
        await sleep(2000 * (i + 1))
      }
    }
  }
  throw lastErr
}

// Whole-word, case-insensitive match (so "Getha" doesn't match inside "together").
function matchesWord(text: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?<![\\w])${escaped}(?![\\w])`, 'i').test(text)
}

function dedupeNames(names: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const n of names) {
    const key = n.toLowerCase().trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(n.trim())
  }
  return out
}

const GENERIC_TERMS = new Set([
  'the', 'best', 'top', 'your', 'our', 'a', 'an', 'for', 'in', 'of', 'and', 'or', 'to', 'with', 'on',
  'brands', 'companies', 'company', 'brand', 'options', 'option', 'services', 'service', 'products',
  'product', 'here', 'these', 'those', 'consider', 'choose', 'look', 'popular', 'leading', 'trusted',
  'recommended', 'first', 'time', 'overview', 'summary', 'note', 'tip', 'tips', 'key', 'factors',
  'malaysia', 'singapore', 'indonesia', 'thailand', 'philippines', 'asia', 'reputation', 'quality',
  'price', 'pricing', 'value', 'customer', 'support', 'example', 'examples', 'others', 'more', 'overall',
])

// Heuristic competitor discovery: pull brand-like names from the list items AI
// produced. Approximate (no NER), so we filter generic terms, require a name to
// appear in multiple responses, and cap the count. Names AI volunteered repeatedly
// across answers are almost always real category players competing for the visibility.
function discoverCompetitors(texts: string[], ownBrand: string, exclude: string[]): string[] {
  const excludeLc = new Set([ownBrand, ...exclude].map((s) => s.toLowerCase().trim()))
  const tally = new Map<string, { name: string; count: number }>()

  for (const text of texts) {
    const found = new Set<string>()
    const re = /(?:^|\n)\s*(?:\d+[.)]|[-•*])\s*\*{0,2}([A-Z][A-Za-z0-9&'’.\- ]{1,40})/g
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      const name = m[1].split(/[-–—:(,.]/)[0].replace(/\*+/g, '').replace(/['’]s$/i, '').trim()
      const words = name.split(/\s+/).filter(Boolean)
      if (words.length === 0 || words.length > 4) continue
      const lc = name.toLowerCase()
      if (lc.length < 2 || excludeLc.has(lc)) continue
      // Must contain at least one capitalised, non-generic token to look like a brand.
      const sig = words.filter((w) => /^[A-Z]/.test(w) && !GENERIC_TERMS.has(w.toLowerCase()))
      if (sig.length === 0) continue
      found.add(name)
    }
    for (const n of found) {
      const k = n.toLowerCase()
      tally.set(k, { name: n, count: (tally.get(k)?.count ?? 0) + 1 })
    }
  }

  const totalTexts = texts.length || 1
  const minCount = Math.max(2, Math.ceil(totalTexts * 0.2))
  return [...tally.values()]
    .filter((v) => v.count >= minCount)
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
    .map((v) => v.name)
}

export async function runPublicAudit(input: PublicAuditInput): Promise<PublicAuditResult> {
  const location = inferLocation(input.website)
  const prompts = buildPrompts(input, location)
  const competitors = input.competitors.filter(Boolean).map((name) => ({ name, brand_aliases: [] as string[] }))
  const errors: string[] = []

  // Run every (prompt × platform) call in parallel. Each settles independently so
  // one failure (rate limit, timeout) shrinks that platform's denominator rather
  // than aborting the whole audit.
  type Unit = { platform: Platform; label: string; promptIdx: number }
  const units: Unit[] = []
  for (const p of PLATFORMS) for (let i = 0; i < prompts.length; i++) units.push({ platform: p.key, label: p.label, promptIdx: i })

  const settled = await Promise.allSettled(
    units.map(async (u) => {
      const provider = PLATFORMS.find((p) => p.key === u.platform)!
      const res = await withRetry(() => provider.run(prompts[u.promptIdx], `pub-${u.platform}-${u.promptIdx}`))
      const text = res.raw_response
      const brand = parseBrandMention(text, input.brand, [])
      const comp = parseCompetitorMentions(text, competitors)
      const domains = extractCitationDomains(text + '\n' + (res.citations ?? []).join('\n'))
      return {
        platform: u.platform,
        text,
        mentioned: brand.mentioned,
        sentiment: brand.sentiment,
        competitorMentions: comp,
        domainCited: isClientDomainCited(domains, input.website),
      }
    })
  )

  // Aggregate per-platform brand visibility.
  const platforms = PLATFORMS.map((p) => {
    const rows = settled
      .map((s, idx) => ({ s, u: units[idx] }))
      .filter(({ u }) => u.platform === p.key)
    const completed = rows.filter(({ s }) => s.status === 'fulfilled')
    const mentions = completed.filter(({ s }) => (s as PromiseFulfilledResult<any>).value.mentioned).length
    const total = completed.length
    rows.filter(({ s }) => s.status === 'rejected').forEach(({ s }) =>
      errors.push(`${p.label}: ${(s as PromiseRejectedResult).reason?.message ?? 'query failed'}`)
    )
    return { key: p.key, label: p.label, mentions, total, visibilityPct: total ? Math.round((mentions / total) * 100) : 0 }
  })

  const totalUnits = platforms.reduce((s, p) => s + p.total, 0)
  const totalMentions = platforms.reduce((s, p) => s + p.mentions, 0)
  const overallVisibilityPct = totalUnits ? Math.round((totalMentions / totalUnits) * 100) : 0

  // Competitor visibility across all completed runs. We combine the user's named
  // competitors with brands AI *itself* surfaced in the answers (auto-discovery) —
  // those are the names winning the visibility the brand isn't.
  const fulfilled = settled.filter((s) => s.status === 'fulfilled') as PromiseFulfilledResult<any>[]
  const fulfilledTexts = fulfilled.map((s) => s.value.text as string)
  const providedNames = competitors.map((c) => c.name)
  const discovered = discoverCompetitors(fulfilledTexts, input.brand, providedNames)
  const candidateNames = dedupeNames([...providedNames, ...discovered]).slice(0, 6)

  const total = fulfilledTexts.length
  const competitorStats = candidateNames.map((name) => {
    const mentions = fulfilledTexts.filter((t) => matchesWord(t, name)).length
    return { name, mentions, total, visibilityPct: total ? Math.round((mentions / total) * 100) : 0 }
  }).sort((a, b) => b.visibilityPct - a.visibilityPct)

  const topCompetitor = competitorStats.length ? competitorStats[0] : null

  // Domain citation: cited on at least one run.
  const domainCited = fulfilled.some((s) => s.value.domainCited)

  // Aggregate sentiment across runs where the brand was mentioned.
  const sentiments = fulfilled.map((s) => s.value.sentiment).filter(Boolean) as Sentiment[]
  const pos = sentiments.filter((x) => x === 'positive').length
  const neg = sentiments.filter((x) => x === 'negative').length
  const sentiment: Sentiment = pos > neg ? 'positive' : neg > pos ? 'negative' : 'neutral'

  return {
    brand: input.brand,
    website: input.website,
    industry: input.industry,
    location,
    promptsTested: prompts.length,
    platforms,
    overallVisibilityPct,
    competitors: competitorStats,
    topCompetitor: topCompetitor ? { name: topCompetitor.name, visibilityPct: topCompetitor.visibilityPct } : null,
    domainCited,
    sentiment,
    prompts,
    errors,
  }
}

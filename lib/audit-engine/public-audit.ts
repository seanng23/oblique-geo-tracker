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
  if (kw[1]) prompts.push(`I'm looking for ${kw[1]}${where} — what are my best options?`)
  prompts.push(`Which ${industry} companies${where} would you suggest for someone buying for the first time?`)

  // Cap at 5 to stay inside the serverless time + cost budget.
  return prompts.slice(0, 5)
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
      const res = await provider.run(prompts[u.promptIdx], `pub-${u.platform}-${u.promptIdx}`)
      const text = res.raw_response
      const brand = parseBrandMention(text, input.brand, [])
      const comp = parseCompetitorMentions(text, competitors)
      const domains = extractCitationDomains(text + '\n' + (res.citations ?? []).join('\n'))
      return {
        platform: u.platform,
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

  // Competitor visibility across all completed runs.
  const fulfilled = settled.filter((s) => s.status === 'fulfilled') as PromiseFulfilledResult<any>[]
  const competitorStats = competitors.map((c) => {
    const total = fulfilled.length
    const mentions = fulfilled.filter((s) => s.value.competitorMentions[c.name] !== null).length
    return { name: c.name, mentions, total, visibilityPct: total ? Math.round((mentions / total) * 100) : 0 }
  })
  const topCompetitor = competitorStats.length
    ? competitorStats.reduce((a, b) => (b.visibilityPct > a.visibilityPct ? b : a))
    : null

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

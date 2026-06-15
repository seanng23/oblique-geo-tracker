import type { AuditResult, VisibilityScore, Prompt, Platform, HallucinationFlag } from '@/lib/types'

export interface Suggestion {
  priority: 'high' | 'medium' | 'low'
  title: string
  detail: string
}

/**
 * Derives internal GEO suggestions from an audit's real data. Deterministic
 * (no AI call) so it renders instantly. Internal-only — never goes in the
 * client-facing report.
 */
export function buildSuggestions(opts: {
  results: AuditResult[]
  promptMap: Record<string, Prompt>
  scores: VisibilityScore[]
  competitorFreq: Record<string, number>
  missingPlatforms: Platform[]
  clientName: string
}): Suggestion[] {
  const { results, promptMap, scores, competitorFreq, missingPlatforms, clientName } = opts
  const out: Suggestion[] = []
  const overall = scores.find((s) => s.platform === 'overall')

  // Mention rate per prompt category
  const byCat: Record<string, { total: number; present: number }> = {}
  for (const r of results) {
    const cat = promptMap[r.prompt_id]?.category ?? 'uncategorised'
    byCat[cat] ??= { total: 0, present: 0 }
    byCat[cat].total++
    if (r.brand_mentioned) byCat[cat].present++
  }

  const weakCats = Object.entries(byCat)
    .filter(([cat, s]) => cat !== 'brand' && s.total >= 2 && s.present / s.total < 0.34)
    .map(([cat]) => cat)

  if (weakCats.length) {
    out.push({
      priority: 'high',
      title: `Absent on ${weakCats.join(', ')} queries`,
      detail: `${clientName} rarely appears when users search the category rather than the brand. Publish category- and problem-led content (landing pages, FAQs, comparison guides) targeting these prompt types so the AIs have a reason to surface the brand.`,
    })
  }

  if (overall && (overall.sir_score ?? 0) < 10) {
    out.push({
      priority: 'high',
      title: `Own domain rarely cited as a source (SIR ${overall.sir_score ?? 0}%)`,
      detail: `The AIs mention ${clientName} but cite listicles and competitor sites, not the client's own domain. Build authoritative, citable content and earn backlinks from health publishers so the site becomes the source the AIs quote.`,
    })
  }

  const topComp = Object.entries(competitorFreq).sort((a, b) => b[1] - a[1])[0]
  if (topComp && topComp[1] >= 2) {
    out.push({
      priority: 'medium',
      title: `${topComp[0]} dominates shared queries`,
      detail: `${topComp[0]} appears in ${topComp[1]} audited answers — often where ${clientName} is absent or ranked lower. Create a head-to-head comparison page and target the specific prompts where ${topComp[0]} wins.`,
    })
  }

  const brandCat = byCat['brand']
  if (brandCat && brandCat.present / brandCat.total >= 0.6 && weakCats.length) {
    out.push({
      priority: 'medium',
      title: 'Strong on brand recall, weak on discovery',
      detail: `When asked about ${clientName} directly the AIs respond well, but the brand isn't entering consideration in unbranded category searches. Shift content investment toward top-of-funnel category and problem queries.`,
    })
  }

  if (missingPlatforms.length) {
    out.push({
      priority: 'low',
      title: `No data from ${missingPlatforms.join(', ')} this audit`,
      detail: `These platforms returned nothing (likely billing/quota or rate limits). Resolve and re-run for a complete picture before reporting to the client.`,
    })
  }

  if (!out.length) {
    out.push({
      priority: 'low',
      title: 'No critical gaps flagged',
      detail: 'Visibility looks healthy across the audited prompts. Keep auditing monthly to catch drift.',
    })
  }
  return out
}

export function collectHallucinationFlags(results: AuditResult[]): HallucinationFlag[] {
  return results.flatMap((r) => r.hallucination_flags ?? []).slice(0, 12)
}

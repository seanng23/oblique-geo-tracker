import Anthropic from '@anthropic-ai/sdk'

// Claude writes the report narrative. (Previously GPT-4o; Claude produces
// equally strong strategy copy and keeps reports working on one vendor.)
const NARRATIVE_MODEL = 'claude-sonnet-4-5-20250929'

interface ScoreRow {
  platform: string
  score: number
  mentions_count: number
  total_prompts: number
  ranked_count: number
  outranked_count: number
  absent_count: number
  avg_rank: number | null
  sir_score: number | null
  nss: number | null
}

export async function buildNarrative(opts: {
  clientName: string
  website: string
  industry: string | null
  reportMonthLabel: string
  scores: ScoreRow[]
  mentionedPrompts: string[]
  missedPrompts: string[]
  citedDomains: string[]
}): Promise<string> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const overall = opts.scores.find((s) => s.platform === 'overall')
  const plat = (p: string) => opts.scores.find((s) => s.platform === p)

  const msg = await anthropic.messages.create({
    model: NARRATIVE_MODEL,
    max_tokens: 1200,
    temperature: 0.5,
    system: `You are a senior GEO (Generative Engine Optimisation) strategist at Oblique, a boutique SEO/GEO agency in Malaysia. Write the strategic summary for a client's monthly AI visibility report.
Rules: 4-6 paragraphs of plain prose, then a final section titled exactly "Priority actions" with a numbered list of 3 actions.
Use ONLY the numbers provided. The report period is ${opts.reportMonthLabel} — never mention any other month or year.
No markdown headings or bold markers. No filler phrases. Be transparent that scores are approximate.`,
    messages: [
      {
        role: 'user',
        content: `Client: ${opts.clientName} (${opts.website}) — ${opts.industry ?? 'industry n/a'}
Report period: ${opts.reportMonthLabel}
Method: web-grounded queries — each AI platform (ChatGPT, Gemini, Claude) answers using its own live web search; we record whether the brand appears, its position, sentiment, and whether the client's own domain is cited as a source (SIR).

Overall visibility: ${overall?.score.toFixed(1)}% (${overall?.mentions_count}/${overall?.total_prompts} prompt-runs)
ChatGPT: ${plat('chatgpt') ? plat('chatgpt')!.score.toFixed(1) + '%' : 'no data this period'}
Gemini: ${plat('gemini') ? plat('gemini')!.score.toFixed(1) + '%' : 'no data this period'}
Claude: ${plat('claude') ? plat('claude')!.score.toFixed(1) + '%' : 'no data this period'}
Ranked top-3: ${overall?.ranked_count} · Outranked: ${overall?.outranked_count} · Absent: ${overall?.absent_count}
SIR (own domain cited as a source): ${overall?.sir_score ?? 0}%
Net sentiment when mentioned: ${overall?.nss ?? 'n/a'}

Prompts where the brand appeared: ${opts.mentionedPrompts.join(' | ') || '(none)'}
Prompts where the brand was absent: ${[...new Set(opts.missedPrompts)].join(' | ') || '(none)'}
Domains the AIs cited most: ${opts.citedDomains.slice(0, 8).join(', ') || '(none)'}`,
      },
    ],
  })

  return msg.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('')
    .trim()
}

// Minimal markdown-to-HTML so stray **bold**, headings, and numbered lists
// from the model render properly instead of leaking asterisks into the PDF.
function mdToHtml(text: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>')
  const blocks = text.split(/\n\s*\n/).filter(Boolean)
  return blocks
    .map((block) => {
      const lines = block.trim().split('\n')
      if (lines.every((l) => /^\s*(\d+[.)]|[-•])\s+/.test(l))) {
        const ordered = /^\s*\d/.test(lines[0])
        const items = lines.map((l) => `<li>${inline(l.replace(/^\s*(\d+[.)]|[-•])\s+/, ''))}</li>`).join('')
        return ordered ? `<ol>${items}</ol>` : `<ul>${items}</ul>`
      }
      const h = block.match(/^#{1,3}\s+(.*)/)
      if (h) return `<h3>${inline(h[1])}</h3>`
      if (/^[A-Za-z ]{3,40}:?$/.test(block.trim()) && block.trim().length < 40 && !block.includes('.')) {
        return `<h3>${inline(block.trim().replace(/:$/, ''))}</h3>`
      }
      return `<p>${inline(block)}</p>`
    })
    .join('\n')
}

const CRIMSON = '#CE2438'

export function buildReportHTML(opts: {
  clientName: string
  website: string
  reportMonthLabel: string
  aiSummary: string
  scores: ScoreRow[]
}): string {
  const overall = opts.scores.find((s) => s.platform === 'overall')
  const platforms = opts.scores.filter((s) => s.platform !== 'overall')
  const label: Record<string, string> = { chatgpt: 'ChatGPT', gemini: 'Gemini', claude: 'Claude' }

  const platformRows = platforms
    .map(
      (s) => `<tr>
      <td>${label[s.platform] ?? s.platform}</td>
      <td><strong>${Number(s.score).toFixed(1)}%</strong></td>
      <td>${s.mentions_count} / ${s.total_prompts}</td>
      <td>${s.ranked_count}</td>
      <td>${s.sir_score != null ? Number(s.sir_score).toFixed(1) + '%' : '—'}</td>
    </tr>`
    )
    .join('')

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${opts.clientName} — AI Visibility Report</title><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #fff; color: #191112; }
  .header { background: #191112; color: #fff; padding: 44px 64px; border-bottom: 4px solid ${CRIMSON}; }
  .kicker { font-size: 11px; text-transform: uppercase; letter-spacing: .1em; color: ${CRIMSON}; font-weight: 700; }
  .header h1 { font-size: 28px; font-weight: 700; margin-top: 10px; }
  .header .sub { color: #9a8f90; font-size: 13px; margin-top: 5px; }
  .body { padding: 44px 64px; }
  .score-hero { background: #faf6f6; border: 1px solid #f0e6e7; border-radius: 12px; padding: 30px; text-align: center; margin-bottom: 30px; }
  .score-hero .pct { font-size: 68px; font-weight: 800; color: ${CRIMSON}; line-height: 1; letter-spacing: -.03em; }
  .score-hero .label { font-size: 13px; color: #8a7d7e; margin-top: 8px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
  th { text-align: left; font-size: 10.5px; color: #8a7d7e; text-transform: uppercase; letter-spacing: .05em; border-bottom: 2px solid #f0e6e7; padding: 8px 12px; }
  td { padding: 10px 12px; border-bottom: 1px solid #f5eeee; font-size: 14px; }
  h2 { font-size: 17px; font-weight: 700; margin-bottom: 14px; letter-spacing: -.01em; }
  h3 { font-size: 14px; font-weight: 700; margin: 18px 0 8px; color: ${CRIMSON}; }
  p { font-size: 13.5px; color: #43383a; line-height: 1.8; margin-bottom: 12px; }
  ol, ul { margin: 0 0 12px 20px; }
  li { font-size: 13.5px; color: #43383a; line-height: 1.8; margin-bottom: 6px; }
  .disclaimer { font-size: 10.5px; color: #ab9fa0; border-top: 1px solid #f0e6e7; padding-top: 20px; margin-top: 26px; line-height: 1.6; }
  .agency { font-size: 11px; color: #8a7d7e; margin-top: 4px; font-weight: 600; }
  @media print { .header { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
<div class="header">
  <p class="kicker">Oblique GEO Tracker</p>
  <h1>${opts.clientName}</h1>
  <p class="sub">AI Visibility Report — ${opts.reportMonthLabel} · ${opts.website}</p>
</div>
<div class="body">
  <div class="score-hero">
    <div class="pct">${overall ? Number(overall.score).toFixed(1) : '—'}%</div>
    <div class="label">Overall AI Visibility Score — ${overall?.mentions_count ?? 0} of ${overall?.total_prompts ?? 0} tracked prompt runs</div>
  </div>
  <table>
    <tr><th>Platform</th><th>Visibility</th><th>Prompts matched</th><th>Ranked top-3</th><th>SIR</th></tr>
    ${platformRows}
  </table>
  <h2>Strategic Summary</h2>
  ${mdToHtml(opts.aiSummary)}
  <p class="disclaimer">Visibility scores reflect the percentage of tracked prompts in which ${opts.clientName}'s brand appeared in web-grounded responses from ChatGPT, Google Gemini, and Claude. SIR (Summarization Inclusion Rate) measures how often the client's own domain was cited as a source. Scores are approximate indicators derived from live API calls — AI models are non-deterministic and results may vary between runs. No data in this report is fabricated or estimated.</p>
  <p class="agency">Prepared by Oblique · oblique.agency</p>
</div>
</body></html>`
}
